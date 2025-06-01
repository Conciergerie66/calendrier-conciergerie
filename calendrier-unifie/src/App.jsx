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
  // Exemple: si votre backend envoie "Société Alpha Nettoyage", la clé ici serait "société"
};

// Fonctions utilitaires pures pour identifier les types de réservations/blocages
const isFakeBlockPure = (r) => {
  if (!r || !r.start || !r.end || r.type !== 'booking') return false;
  const duration = new Date(r.end) - new Date(r.start);
  const guestSummary = r.guest ? r.guest.toLowerCase().trim() : '';
  return duration < 1000 * 60 * 60 * 20 && (!guestSummary || ['not available', 'non disponible'].includes(guestSummary));
};

const isManuallyBlockedPure = (reservation) => {
  if (reservation.type !== 'booking') return false;
  return reservation.source === 'airbnb' && reservation.guest?.toLowerCase().includes('not available') && !reservation.description;
};

const App = () => {
  const [allCalendarEvents, setAllCalendarEvents] = useState([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);

  const API_URL = process.env.VITE_API_URL || "https://calendrier-conciergerie.onrender.com";

  useEffect(() => {
    axios.get(`${API_URL}/reservations`)
      .then(res => {
        // console.log("Données brutes reçues du backend:", JSON.stringify(res.data, null, 2)); // Décommentez pour déboguer les données reçues
        setAllCalendarEvents(res.data); // Le backend envoie déjà tout (résas + ménages)
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
        uniqueLogementsMap.set(item.logementKey, { 
            logementKey: item.logementKey, 
            name: item.name || `Logement ${item.logementKey}` // item.name est fourni par le backend
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
      r.type === 'booking' && // On cherche une réservation client
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
      return { ...activeReservation, isEntryDay, isExitDay, guestName: activeReservation.guest || '' };
    }
    return null;
  }, [allCalendarEvents]);
  
  const getBlockingReservationForCell = useCallback((logementKey, targetDateObj) => {
    return allCalendarEvents.find(r =>
      r?.logementKey === logementKey &&
      r?.start && r?.end &&
      r.type === 'booking' && // Les blocages sont des événements de type 'booking' avec un contenu spécifique
      targetDateObj >= new Date(new Date(r.start).setHours(0,0,0,0)) &&
      targetDateObj <= new Date(new Date(r.end).setHours(23,59,59,999)) &&
      (isManuallyBlockedPure(r) || isFakeBlockPure(r))
    );
  }, [allCalendarEvents]);

  const getCleaningInfoForCell = useCallback((logementKey, targetDateObj) => {
    const task = allCalendarEvents.find(r =>
      r?.logementKey === logementKey &&
      r.type === 'cleaning' && // On cherche une tâche de ménage
      r?.start &&
      new Date(new Date(r.start).setHours(0,0,0,0)).getTime() === targetDateObj.getTime()
    );

    if (!task) return null;
    
    const companyNameFromBackend = task.assignedCleaner; // Champ fourni par le backend
    const companyKey = companyNameFromBackend?.toLowerCase().trim().split(' ')[0];
    
    return {
        emoji: CLEANING_COMPANY_EMOJIS[companyKey] || "🧼",
        companyName: companyNameFromBackend 
    };
  }, [allCalendarEvents]);

  if (error) {
    return <div className="error-message">{error}</div>;
  }
  if (logements.length === 0 && allCalendarEvents.length > 0 && !error) { // Ajout de !error ici
      return <div className="loading-message">Traitement des données du calendrier...</div>
  }
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
                if (activeReservationDetails.guestName && activeReservationDetails.guestName.trim() !== '' && !activeReservationDetails.guestName.toLowerCase().includes('not available')) {
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