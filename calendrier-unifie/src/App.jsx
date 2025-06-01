import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import './App.css'; // Assurez-vous que ce fichier CSS est celui que votre frontend utilise réellement

// Définition des émojis pour chaque société de nettoyage.
// Les clés ici doivent correspondre au premier mot en minuscules des noms de société
// que votre backend envoie dans le champ 'assignedCleaner' des tâches de ménage.
const CLEANING_COMPANY_EMOJIS = {
  "portos": "🐟",
  "proconcept": "🥊",
  "cleansud": "☀️",
  "naira": "💇"
  // Exemple: si votre backend envoie "Société Alpha", la clé ici serait "société"
};

// Fonctions utilitaires pures (stables, ne changent pas entre les rendus)
// Elles opèrent sur les données reçues du backend.
const isFakeBlockPure = (r) => {
  if (!r || !r.start || !r.end) return false;
  // Le backend envoie les événements iCal (y compris les blocages) avec type: 'booking'
  // et le 'summary' de l'iCal dans le champ 'guest'.
  if (r.type !== 'booking') return false;
  const duration = new Date(r.end) - new Date(r.start);
  const guestSummary = r.guest ? r.guest.toLowerCase().trim() : '';
  return duration < 1000 * 60 * 60 * 20 && (!guestSummary || ['not available', 'non disponible'].includes(guestSummary));
};

const isManuallyBlockedPure = (reservation) => {
  if (reservation.type !== 'booking') return false;
  // Le backend met le 'summary' de l'iCal dans reservation.guest
  return reservation.source === 'airbnb' && reservation.guest?.toLowerCase().includes('not available') && !reservation.description;
};

const App = () => {
  const [allCalendarEvents, setAllCalendarEvents] = useState([]); // Contient TOUTES les données: réservations + ménages directement du backend
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);

  const API_URL = process.env.VITE_API_URL || "https://calendrier-conciergerie.onrender.com";

  useEffect(() => {
    axios.get(`${API_URL}/reservations`)
      .then(res => {
        setAllCalendarEvents(res.data); // Les données du backend contiennent déjà tout
        setError(null);
      })
      .catch(err => {
        console.error("Erreur lors de la récupération des réservations:", err);
        setError("Impossible de charger les données des réservations. Veuillez réessayer plus tard.");
        setAllCalendarEvents([]);
      });
  }, [API_URL]);

  const logements = useMemo(() => {
    const uniqueLogementsMap = new Map();
    allCalendarEvents.forEach(item => {
      if (item.logementKey && !uniqueLogementsMap.has(item.logementKey)) {
        // Le champ 'name' fourni par le backend est le nom du calendrier/logement personnalisé
        uniqueLogementsMap.set(item.logementKey, { 
            logementKey: item.logementKey, 
            name: item.name || `Logement ${item.logementKey}` // item.name vient du backend
        });
      }
    });
    const uniqueList = Array.from(uniqueLogementsMap.values());
    uniqueList.sort((a, b) => a.name.localeCompare(b.name));
    return uniqueList;
  }, [allCalendarEvents]);

  const days = useMemo(() => {
    const dayArray = [];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + offset);
    for (let i = 0; i < 30; i++) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);
      dayArray.push({
        full: date.toLocaleDateString('fr-CA'),
        short: date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
        isSunday: date.getDay() === 0,
        dateObject: date
      });
    }
    return dayArray;
  }, [offset]);

  const getReservationDetailsForCell = useCallback((logementKey, targetDateObj) => {
    const activeReservation = allCalendarEvents.find(r =>
      r?.logementKey === logementKey &&
      r?.start && r?.end &&
      r.type === 'booking' && // Filtrer par type 'booking' (défini par backend)
      !isFakeBlockPure(r) &&
      !isManuallyBlockedPure(r) &&
      targetDateObj >= new Date(new Date(r.start).setHours(0,0,0,0)) &&
      targetDateObj <= new Date(new Date(r.end).setHours(23,59,59,999))
    );

    if (activeReservation) {
      const startDate = new Date(new Date(activeReservation.start).setHours(0,0,0,0));
      const endDate = new Date(new Date(activeReservation.end).setHours(0,0,0,0));
      const isEntryDay = targetDateObj.getTime() === startDate.getTime();
      const isExitDay = targetDateObj.getTime() === endDate.getTime();
      // 'guest' pour les réservations de type 'booking' contient le nom du client (ev.summary du backend)
      return { ...activeReservation, isEntryDay, isExitDay, guestName: activeReservation.guest || '' };
    }
    return null;
  }, [allCalendarEvents]);
  
  const getBlockingReservationForCell = useCallback((logementKey, targetDateObj) => {
    return allCalendarEvents.find(r =>
      r?.logementKey === logementKey &&
      r?.start && r?.end &&
      r.type === 'booking' && // Les blocages sont aussi de type 'booking' mais identifiés par leur contenu
      targetDateObj >= new Date(new Date(r.start).setHours(0,0,0,0)) &&
      targetDateObj <= new Date(new Date(r.end).setHours(23,59,59,999)) &&
      (isManuallyBlockedPure(r) || isFakeBlockPure(r))
    );
  }, [allCalendarEvents]);

  const getCleaningInfoForCell = useCallback((logementKey, targetDateObj) => {
    const task = allCalendarEvents.find(r =>
      r?.logementKey === logementKey &&
      r.type === 'cleaning' && // Filtrer par type 'cleaning' (défini par backend)
      r?.start &&
      new Date(new Date(r.start).setHours(0,0,0,0)).getTime() === targetDateObj.getTime()
    );

    if (!task) return null;
    
    // Pour les tâches de type 'cleaning', le backend met le nom du prestataire dans 'assignedCleaner'
    const companyNameFromBackend = task.assignedCleaner; // VIENT DU BACKEND
    const companyKey = companyNameFromBackend?.toLowerCase().trim().split(' ')[0];
    
    return {
        emoji: CLEANING_COMPANY_EMOJIS[companyKey] || "🧼", // Émoji par défaut
        companyName: companyNameFromBackend 
    };
  }, [allCalendarEvents]);


  if (error) {
    return <div className="error-message">{error}</div>;
  }
  if (logements.length === 0 && allCalendarEvents.length > 0) {
      return <div className="loading-message">Traitement des données du calendrier...</div>
  }
  // Condition de chargement initial avant que les données ne soient récupérées
  if (allCalendarEvents.length === 0 && !error) {
    return <div className="loading-message">Chargement du calendrier...</div>;
  }


  return (
    <div className="calendar-container">
      <div className="calendar-navigation">
        <button onClick={() => setOffset(offset - 30)}>← Mois précédent</button>
        <span className="calendar-title">Calendrier des réservations</span>
        <button onClick={() => setOffset(offset + 30)}>Mois suivant →</button>
      </div>

      <div className="calendar-scroll-container">
        {/* ... (rendu des entêtes de jours et dates, inchangé) ... */}
        <div className="header-row">
          <div className="header-cell logement-title-header"></div>
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
              {day.full.slice(5)}
            </div>
          ))}
        </div>

        {logements.map(logement => (
          <div className="row" key={logement.logementKey}>
            <div className="cell logement-name">{logement.name}</div>
            {days.map(day => {
              const targetDateObject = day.dateObject;
              let cellText = null;
              let titleParts = [];
              const classList = ['cell'];
              if (day.isSunday) classList.push('sunday');

              const blockingReservation = getBlockingReservationForCell(logement.logementKey, targetDateObject);
              const activeReservationDetails = !blockingReservation ? getReservationDetailsForCell(logement.logementKey, targetDateObject) : null;
              
              if (blockingReservation) {
                if (isManuallyBlockedPure(blockingReservation)) {
                  classList.push('blocked-manual');
                  titleParts.push(blockingReservation.guest || "Bloqué manuellement");
                } else if (isFakeBlockPure(blockingReservation)) {
                  classList.push('blocked-fake');
                  titleParts.push(blockingReservation.guest || "Blocage système");
                }
              } else if (activeReservationDetails) {
                cellText = activeReservationDetails.guestName && activeReservationDetails.guestName.trim() !== '' && !activeReservationDetails.guestName.toLowerCase().includes('not available')
                           ? activeReservationDetails.guestName 
                           : 'Réservé';
                if (activeReservationDetails.guestName && activeReservationDetails.guestName.trim() !== '') {
                    titleParts.push(`Client: ${activeReservationDetails.guestName}`);
                } else {
                    titleParts.push("Réservé");
                }
                
                classList.push(activeReservationDetails.source); 

                if (activeReservationDetails.isEntryDay && activeReservationDetails.isExitDay) {
                  classList.push('cell-entry-exit');
                  titleParts.push("Arrivée & Départ");
                } else if (activeReservationDetails.isEntryDay) {
                  classList.push('cell-entry');
                  titleParts.push("Arrivée");
                } else if (activeReservationDetails.isExitDay) {
                  classList.push('cell-exit');
                  titleParts.push("Départ");
                }
              }

              const cleaningInfo = getCleaningInfoForCell(logement.logementKey, targetDateObject);
              if (cleaningInfo) {
                classList.push('has-cleaning');
                titleParts.push(`Ménage: ${cleaningInfo.emoji} (${cleaningInfo.companyName || 'N/A'})`);
              }

              return (
                <div
                  className={classList.join(' ')}
                  key={`${logement.logementKey}-${day.full}`}
                  title={titleParts.join(' | ') || undefined}
                >
                  <span className="cell-text">{cellText}</span>
                  {cleaningInfo && <span className="cleaning-badge">{cleaningInfo.emoji}</span>}
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