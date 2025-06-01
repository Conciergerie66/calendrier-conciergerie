import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import './App.css'; // Assurez-vous que ce fichier CSS est celui que votre frontend utilise réellement

const CLEANING_COMPANY_EMOJIS = {
  "portos": "🐟",
  "proconcept": "🥊",
  "cleansud": "☀️",
  "naira": "💇"
};

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
        console.log("Données brutes reçues du backend:", JSON.stringify(res.data, null, 2)); // ESSENTIEL POUR LE DÉBOGAGE
        setAllCalendarEvents(res.data);
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
            name: item.name || `Logement ${item.logementKey}`
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
      r.type === 'booking' &&
      !isFakeBlockPure(r) &&
      !isManuallyBlockedPure(r) && // On ne veut pas qu'un blocage manuel Airbnb soit traité ici s'il doit être rouge
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
      r.type === 'booking' && 
      targetDateObj >= new Date(new Date(r.start).setHours(0,0,0,0)) &&
      targetDateObj <= new Date(new Date(r.end).setHours(23,59,59,999)) &&
      (isManuallyBlockedPure(r) || isFakeBlockPure(r))
    );
  }, [allCalendarEvents]);

  const getCleaningInfoForCell = useCallback((logementKey, targetDateObj) => {
    const task = allCalendarEvents.find(r =>
      r?.logementKey === logementKey &&
      r.type === 'cleaning' &&
      r?.start &&
      new Date(new Date(r.start).setHours(0,0,0,0)).getTime() === targetDateObj.getTime()
    );

    if (!task) return null;
    
    const companyNameFromBackend = task.assignedCleaner;
    const companyKey = companyNameFromBackend?.toLowerCase().trim().split(' ')[0];
    
    return {
        emoji: CLEANING_COMPANY_EMOJIS[companyKey] || "🧼",
        companyName: companyNameFromBackend 
    };
  }, [allCalendarEvents]);

  if (error) {
    return <div className="error-message">{error}</div>;
  }
  if (logements.length === 0 && allCalendarEvents.length > 0 && !error) {
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
        {/* Entêtes */}
        <div className="header-row">
          <div className="header-cell logement-title-header"></div>
          {days.map(day => ( <div key={day.full} className={`header-cell ${day.isSunday ? 'sunday' : ''}`}>{day.short}</div> ))}
        </div>
        <div className="header-row">
          <div className="header-cell logement-title-header">Logement</div>
          {days.map(day => ( <div key={`${day.full}-date`} className={`header-cell ${day.isSunday ? 'sunday' : ''}`}>{day.full.slice(5)}</div> ))}
        </div>

        {/* Lignes de logements */}
        {logements.map(logement => (
          <div className="row" key={logement.logementKey}>
            <div className="cell logement-name">{logement.name}</div>
            {days.map(day => {
              const targetDateObject = day.dateObject;
              let cellText = null;
              let titleParts = [];
              const classList = ['cell'];
              if (day.isSunday) classList.push('sunday');

              let entryArrow = null;
              let exitArrow = null;

              const blockingReservation = getBlockingReservationForCell(logement.logementKey, targetDateObject);
              // On ne prend une activeReservationDetails que si ce n'est PAS un blocage manuel Airbnb qui doit être rouge
              const potentialActiveReservation = !blockingReservation ? getReservationDetailsForCell(logement.logementKey, targetDateObject) : null;
              let activeReservationDetails = potentialActiveReservation;


              if (blockingReservation) {
                // Spécifiquement pour "Airbnb (Not available)" à afficher en rouge
                if (isManuallyBlockedPure(blockingReservation) && blockingReservation.source === 'airbnb') {
                  classList.push('airbnb'); // Style rouge Airbnb
                  cellText = blockingReservation.guest || "Airbnb Non Disponible";
                  titleParts.push(cellText);
                  activeReservationDetails = null; // S'assurer qu'on ne le traite pas comme une résa active en plus
                } else if (isManuallyBlockedPure(blockingReservation)) {
                  classList.push('blocked-manual');
                  titleParts.push(blockingReservation.guest || "Bloqué manuellement");
                  cellText = blockingReservation.guest; // Afficher le texte du blocage
                } else if (isFakeBlockPure(blockingReservation)) {
                  classList.push('blocked-fake');
                  titleParts.push(blockingReservation.guest || "Blocage système");
                  cellText = blockingReservation.guest; // Afficher le texte du blocage
                }
              }
              
              if (activeReservationDetails) { // Si ce n'est pas un blocage traité au-dessus
                cellText = activeReservationDetails.guestName && activeReservationDetails.guestName.trim() !== '' && !activeReservationDetails.guestName.toLowerCase().includes('not available')
                           ? activeReservationDetails.guestName 
                           : 'Réservé';
                if (activeReservationDetails.guestName && activeReservationDetails.guestName.trim() !== '' && !activeReservationDetails.guestName.toLowerCase().includes('not available')) {
                    titleParts.push(`Client: ${activeReservationDetails.guestName}`);
                } else {
                    titleParts.push("Réservé");
                }
                
                classList.push(activeReservationDetails.source); 

                if (activeReservationDetails.isEntryDay) {
                  entryArrow = <span className="entry-arrow">&rarr;</span>; // Flèche vers la droite pour l'arrivée
                  titleParts.push("Arrivée");
                }
                if (activeReservationDetails.isExitDay) { // Peut être le même jour que l'arrivée
                  exitArrow = <span className="exit-arrow">&larr;</span>; // Flèche vers la gauche pour le départ
                  titleParts.push("Départ");
                }
              }

              const cleaningInfo = getCleaningInfoForCell(logement.logementKey, targetDateObject);
              // Afficher le ménage sur le jour de départ (qui est le jour 'start' de la tâche de ménage)
              // S'il y a une réservation qui se termine ce jour-là, ou si c'est un jour de ménage seul.
              if (cleaningInfo && (activeReservationDetails?.isExitDay || !activeReservationDetails && !blockingReservation) ) {
                classList.push('has-cleaning');
                titleParts.push(`Ménage: ${cleaningInfo.emoji} (${cleaningInfo.companyName || 'N/A'})`);
              }

              return (
                <div
                  className={classList.join(' ')}
                  key={`${logement.logementKey}-${day.full}`}
                  title={titleParts.join(' | ') || undefined}
                >
                  {entryArrow && !exitArrow && <span className="cell-icon-left">{entryArrow}</span>}
                  <span className="cell-text">{cellText}</span>
                  {exitArrow && <span className="cell-icon-right">{exitArrow}</span>}
                  {/* Afficher le badge de ménage si cleaningInfo et pas de texte principal (ou à côté) */}
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