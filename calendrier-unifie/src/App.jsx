import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import './App.css'; // Assurez-vous que le nom correspond à votre fichier CSS

const App = () => {
  const [reservations, setReservations] = useState([]);
  const [rawLogements, setRawLogements] = useState([]); // Pour la dérivation des logements uniques
  const [offset, setOffset] = useState(0); // Décalage en jours pour la navigation
  const [error, setError] = useState(null);

  const API_URL = process.env.VITE_API_URL || "https://calendrier-conciergerie.onrender.com";

  useEffect(() => {
    axios.get(`${API_URL}/reservations`)
      .then(res => {
        setReservations(res.data);
        // Extraire les informations de base des logements pour la liste unique
        const logementInfo = res.data.map(item => ({
          logementKey: item.logementKey,
          name: item.name // Nom associé à la réservation, peut varier
        }));
        setRawLogements(logementInfo);
        setError(null); // Réinitialiser l'erreur en cas de succès
      })
      .catch(err => {
        console.error("Erreur lors de la récupération des réservations:", err);
        setError("Impossible de charger les données des réservations. Veuillez réessayer plus tard.");
        setReservations([]);
        setRawLogements([]);
      });
  }, []); // Dépendance vide pour ne charger qu'une fois

  const logements = useMemo(() => {
    const unique = [];
    const map = new Map();
    // Utiliser les réservations pour obtenir les clés et les noms initiaux
    // Puisque le nom peut être différent par réservation, on prend le premier rencontré ou un nom fixe si nécessaire
    reservations.forEach(item => {
      if (item.logementKey && !map.has(item.logementKey)) {
        // Tenter de trouver un nom de logement plus "stable" si possible ou prendre celui de la première résa
        const cleanName = item.name?.replace(/\s+/g, ' ').trim() || `Logement ${item.logementKey}`;
        map.set(item.logementKey, cleanName);
        unique.push({ logementKey: item.logementKey, name: cleanName });
      }
    });
    // S'assurer que tous les logements mentionnés dans rawLogements sont là, au cas où certains n'ont pas de résa
    rawLogements.forEach(item => {
       if (item.logementKey && !map.has(item.logementKey)) {
         const cleanName = item.name?.replace(/\s+/g, ' ').trim() || `Logement ${item.logementKey}`;
         map.set(item.logementKey, cleanName);
         unique.push({ logementKey: item.logementKey, name: cleanName });
       }
    });
    unique.sort((a, b) => a.name.localeCompare(b.name));
    return unique;
  }, [reservations, rawLogements]);

  const days = useMemo(() => {
    const dayArray = [];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + offset);
    for (let i = 0; i < 30; i++) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);
      dayArray.push({
        full: date.toLocaleDateString('fr-CA'), // YYYY-MM-DD
        short: date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
        isSunday: date.getDay() === 0
      });
    }
    return dayArray;
  }, [offset]);

  // Fonctions utilitaires pour déterminer l'état d'une réservation
  const isFakeBlock = (r) => {
    if (!r || !r.start || !r.end) return false;
    const duration = new Date(r.end) - new Date(r.start);
    const guest = r.guest ? r.guest.toLowerCase().trim() : '';
    return duration < 1000 * 60 * 60 * 20 && (!guest || ['not available', 'non disponible'].includes(guest));
  };

  const isManuallyBlocked = (reservation) => {
    return reservation?.source === 'airbnb' && reservation?.summary?.toLowerCase().includes('not available') && !reservation?.description;
  };

  const getReservationDetailsForCell = (logementKey, dateString) => {
    const targetDate = new Date(dateString);
    // Chercher la réservation active (non-blocage) la plus pertinente
    const activeReservations = reservations.filter(r =>
      r?.logementKey === logementKey &&
      r?.start && r?.end &&
      !isFakeBlock(r) &&
      !isManuallyBlocked(r) &&
      targetDate >= new Date(new Date(r.start).setHours(0,0,0,0)) && // Comparer les dates sans l'heure
      targetDate <= new Date(new Date(r.end).setHours(23,59,59,999)) // Comparer les dates sans l'heure
    );

    if (activeReservations.length > 0) {
      // S'il y a plusieurs réservations actives (ex: checkout et checkin le même jour pour sources diff),
      // on pourrait avoir une logique plus complexe. Pour l'instant, prenons la première.
      const r = activeReservations[0];
      const startDate = new Date(new Date(r.start).setHours(0,0,0,0));
      const endDate = new Date(new Date(r.end).setHours(0,0,0,0));

      const isEntryDay = targetDate.getTime() === startDate.getTime();
      const isExitDay = targetDate.getTime() === endDate.getTime();
      return { ...r, isEntryDay, isExitDay, guest: r.guest || '' };
    }
    return null;
  };
  
  const getBlockingReservationForCell = (logementKey, dateString) => {
    const targetDate = new Date(dateString);
    return reservations.find(r =>
      r?.logementKey === logementKey &&
      r?.start && r?.end &&
      targetDate >= new Date(new Date(r.start).setHours(0,0,0,0)) &&
      targetDate <= new Date(new Date(r.end).setHours(23,59,59,999)) &&
      (isManuallyBlocked(r) || isFakeBlock(r))
    );
  };


  const getCleaningBadge = (logementKey, dateString) => {
    const targetDate = new Date(dateString);
    const task = reservations.find(r =>
      r?.logementKey === logementKey &&
      r?.source === 'cleaning' &&
      r?.start &&
      new Date(new Date(r.start).setHours(0,0,0,0)).getTime() === targetDate.getTime()
    );
    if (!task) return null;

    const badges = {
      "cleansud": "☀️",
      "portos": "🐟",
      "naira": "💇",
      "proconcept": "🥊",
      // Ajoutez d'autres sociétés et leurs émojis ici
    };
    const key = task.guest?.toLowerCase().trim().split(' ')[0]; // prendre le premier mot pour plus de flexibilité
    return badges[key] || "🧼"; // Émoji par défaut
  };


  if (error) {
    return <div style={{ color: 'red', padding: '20px', textAlign: 'center' }}>{error}</div>;
  }

  return (
    <div className="calendar-container"> {/* Changé pour un meilleur nom de classe container */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '0 10px' }}>
        <button onClick={() => setOffset(offset - 30)}>← Mois précédent</button>
        <span style={{ fontSize: '1.2em', fontWeight: 'bold' }}>Calendrier des réservations</span>
        <button onClick={() => setOffset(offset + 30)}>Mois suivant →</button>
      </div>

      <div className="calendar-scroll-container"> {/* Pour le défilement horizontal */}
        <div className="header-row">
          <div className="header-cell logement-title-header"></div> {/* Cellule vide pour alignement */}
          {days.map(day => (
            <div key={day.full} className={`header-cell ${day.isSunday ? 'sunday' : ''}`}>
              {day.short}
            </div>
          ))}
        </div>

        <div className="header-row">
          <div className="header-cell logement-title-header">Logement</div>
          {days.map(day => (
            <div key={`${day.full}-date`} className={`header-cell ${day.isSunday ? 'sunday' : ''}`}>
              {day.full.slice(5)} {/* Affiche MM-DD */}
            </div>
          ))}
        </div>

        {logements.map(logement => (
          <div className="row" key={logement.logementKey}>
            <div className="cell logement-name">{logement.name}</div>
            {days.map(day => {
              const anneeMoisJour = day.full;
              let cellText = null;
              let titleParts = [];
              const classList = ['cell'];
              if (day.isSunday) classList.push('sunday');

              const blockingReservation = getBlockingReservationForCell(logement.logementKey, anneeMoisJour);
              const activeReservation = !blockingReservation ? getReservationDetailsForCell(logement.logementKey, anneeMoisJour) : null;
              
              if (blockingReservation) {
                if (isManuallyBlocked(blockingReservation)) {
                  classList.push('blocked-manual');
                  titleParts.push("Bloqué manuellement");
                } else if (isFakeBlock(blockingReservation)) {
                  classList.push('blocked-fake');
                  titleParts.push("Blocage système (court)");
                }
              } else if (activeReservation) {
                cellText = activeReservation.guest || 'Réservé';
                titleParts.push(`Client: ${cellText}`);
                classList.push(activeReservation.source); // 'airbnb' ou 'booking'

                if (activeReservation.isEntryDay && activeReservation.isExitDay) {
                  classList.push(`entry-exit-${activeReservation.source}`);
                  titleParts.push("Entrée & Sortie");
                } else if (activeReservation.isEntryDay) {
                  classList.push(`entry-${activeReservation.source}`);
                  titleParts.push("Entrée");
                } else if (activeReservation.isExitDay) {
                  classList.push(`exit-${activeReservation.source}`);
                  titleParts.push("Sortie");
                }
                titleParts.push(`Source: ${activeReservation.source}`);
              }

              const cleaningEmoji = getCleaningBadge(logement.logementKey, anneeMoisJour);
              if (cleaningEmoji) {
                titleParts.push(`Ménage: ${cleaningEmoji}`);
              }

              return (
                <div
                  className={classList.join(' ')}
                  key={`${logement.logementKey}-${anneeMoisJour}`}
                  title={titleParts.join(' | ') || undefined}
                >
                  <span className="cell-text">{cellText}</span>
                  {cleaningEmoji && <span className="cleaning-badge">{cleaningEmoji}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;