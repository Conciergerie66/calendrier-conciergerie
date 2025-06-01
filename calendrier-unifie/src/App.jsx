import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import './App.css';

// Importez votre fichier de mapping JSON des logements aux sociétés de nettoyage
import cleaningCompanyMapping from './logement-noms.json';

// Définition des émojis pour chaque société de nettoyage
// Les clés ici doivent correspondre au premier mot en minuscules des noms de société dans votre JSON
const CLEANING_COMPANY_EMOJIS = {
  "portos": "🐟",
  "proconcept": "🥊",
  "cleansud": "☀️",
  "naira": "💇"
  // Ajoutez d'autres sociétés et leurs émojis ici si nécessaire
};

// Fonctions utilitaires pures (stables, ne changent pas entre les rendus)
const isFakeBlockPure = (r) => {
  if (!r || !r.start || !r.end) return false;
  const duration = new Date(r.end) - new Date(r.start);
  const guest = r.guest ? r.guest.toLowerCase().trim() : '';
  return duration < 1000 * 60 * 60 * 20 && (!guest || ['not available', 'non disponible'].includes(guest));
};

const isManuallyBlockedPure = (reservation) => {
  return reservation?.source === 'airbnb' && reservation?.summary?.toLowerCase().includes('not available') && !reservation?.description;
};


const App = () => {
  const [rawReservations, setRawReservations] = useState([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);

  const API_URL = process.env.VITE_API_URL || "https://calendrier-conciergerie.onrender.com";

  useEffect(() => {
    axios.get(`${API_URL}/reservations`)
      .then(res => {
        setRawReservations(res.data);
        setError(null);
      })
      .catch(err => {
        console.error("Erreur lors de la récupération des réservations:", err);
        setError("Impossible de charger les données des réservations. Veuillez réessayer plus tard.");
        setRawReservations([]);
      });
  }, [API_URL]); // API_URL est une dépendance si elle peut changer

  const allCalendarEvents = useMemo(() => {
    const generatedCleaningTasks = [];
    if (!rawReservations || rawReservations.length === 0 || Object.keys(cleaningCompanyMapping).length === 0) {
      return rawReservations || [];
    }

    rawReservations.forEach(res => {
      if ((res.source === 'airbnb' || res.source === 'booking') &&
          !isFakeBlockPure(res) &&
          !isManuallyBlockedPure(res)) {
            
        const departureDateStr = res.end;
        const logementKey = res.logementKey;
        const companyName = cleaningCompanyMapping[logementKey];

        if (departureDateStr && logementKey && companyName) {
          // Assurer que departureDateStr est bien une date valide pour la création de l'objet Date
          const departureDate = new Date(departureDateStr);
          if (!isNaN(departureDate.getTime())) { // Vérifie si la date est valide
            generatedCleaningTasks.push({
              logementKey: logementKey,
              start: departureDate.toISOString(), // Stocker en ISO string pour consistance
              end: departureDate.toISOString(),
              source: 'cleaning',
              guest: companyName, // Nom de la société pour l'emoji et le tooltip
              summary: `Ménage par ${companyName}`,
              id: `cleaning-${logementKey}-${departureDate.toISOString().split('T')[0]}` // ID unique
            });
          }
        }
      }
    });
    return [...rawReservations, ...generatedCleaningTasks];
  }, [rawReservations]);


  const logements = useMemo(() => {
    const uniqueLogementsMap = new Map();
    allCalendarEvents.forEach(item => {
      if (item.logementKey && !uniqueLogementsMap.has(item.logementKey)) {
        const originalReservation = rawReservations.find(r => r.logementKey === item.logementKey && r.name && r.source !== 'cleaning');
        const nameFromReservation = originalReservation?.name?.replace(/\s+/g, ' ').trim();
        const nameFromItem = item.name?.replace(/\s+/g, ' ').trim();
        
        let displayName = nameFromReservation || nameFromItem || `Logement ${item.logementKey}`;
        // Éviter que le nom du logement soit le nom d'une société de ménage si c'est la seule info
        if (Object.values(CLEANING_COMPANY_EMOJIS).includes(displayName) || 
            Object.keys(CLEANING_COMPANY_EMOJIS).map(k => k.toLowerCase()).includes(displayName.toLowerCase())) {
             displayName = `Logement ${item.logementKey}`;
        }
        if (nameFromReservation) displayName = nameFromReservation;


        uniqueLogementsMap.set(item.logementKey, { logementKey: item.logementKey, name: displayName });
      }
    });
    const uniqueList = Array.from(uniqueLogementsMap.values());
    uniqueList.sort((a, b) => a.name.localeCompare(b.name));
    return uniqueList;
  }, [allCalendarEvents, rawReservations]);


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
        isSunday: date.getDay() === 0,
        dateObject: date // Garder l'objet Date pour comparaisons faciles
      });
    }
    return dayArray;
  }, [offset]);

  const getReservationDetailsForCell = useCallback((logementKey, targetDateObj) => {
    const activeReservation = allCalendarEvents.find(r =>
      r?.logementKey === logementKey &&
      r?.start && r?.end &&
      (r.source === 'airbnb' || r.source === 'booking') &&
      !isFakeBlockPure(r) &&
      !isManuallyBlockedPure(r) &&
      targetDateObj >= new Date(new Date(r.start).setHours(0,0,0,0)) &&
      targetDateObj <= new Date(new Date(r.end).setHours(23,59,59,999)) // Fin de journée incluse
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
      targetDateObj >= new Date(new Date(r.start).setHours(0,0,0,0)) &&
      targetDateObj <= new Date(new Date(r.end).setHours(23,59,59,999)) &&
      (isManuallyBlockedPure(r) || isFakeBlockPure(r))
    );
  }, [allCalendarEvents]);

  const getCleaningInfoForCell = useCallback((logementKey, targetDateObj) => {
    const task = allCalendarEvents.find(r =>
      r?.logementKey === logementKey &&
      r?.source === 'cleaning' &&
      r?.start &&
      new Date(new Date(r.start).setHours(0,0,0,0)).getTime() === targetDateObj.getTime()
    );

    if (!task) return null;
    
    // task.guest est le nom de la société (ex: "Cleansud" depuis le JSON)
    const companyKey = task.guest?.toLowerCase().trim().split(' ')[0];
    return {
        emoji: CLEANING_COMPANY_EMOJIS[companyKey] || "🧼",
        companyName: task.guest 
    };
  }, [allCalendarEvents]);


  if (error) {
    return <div className="error-message">{error}</div>;
  }
  if (logements.length === 0 && rawReservations.length > 0) {
      return <div className="loading-message">Traitement des données du calendrier...</div>
  }
  if (logements.length === 0 && rawReservations.length === 0 && !error) {
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
          <div className="header-cell logement-title-header"></div> {/* Alignement */}
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
              {day.full.slice(5)} {/* MM-DD */}
            </div>
          ))}
        </div>

        {logements.map(logement => (
          <div className="row" key={logement.logementKey}>
            <div className="cell logement-name">{logement.name}</div>
            {days.map(day => {
              const targetDateObject = day.dateObject; // Utiliser l'objet Date stocké
              let cellText = null;
              let titleParts = [];
              const classList = ['cell'];
              if (day.isSunday) classList.push('sunday');

              const blockingReservation = getBlockingReservationForCell(logement.logementKey, targetDateObject);
              const activeReservationDetails = !blockingReservation ? getReservationDetailsForCell(logement.logementKey, targetDateObject) : null;
              
              if (blockingReservation) {
                if (isManuallyBlockedPure(blockingReservation)) {
                  classList.push('blocked-manual');
                  titleParts.push("Bloqué manuellement");
                } else if (isFakeBlockPure(blockingReservation)) {
                  classList.push('blocked-fake');
                  titleParts.push("Blocage système");
                }
              } else if (activeReservationDetails) {
                cellText = activeReservationDetails.guestName && activeReservationDetails.guestName.trim() !== '' ? activeReservationDetails.guestName : 'Réservé';
                if (activeReservationDetails.guestName && activeReservationDetails.guestName.trim() !== '') {
                    titleParts.push(`Client: ${activeReservationDetails.guestName}`);
                } else {
                    titleParts.push("Réservé");
                }
                
                classList.push(activeReservationDetails.source); // 'airbnb' ou 'booking'

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
                titleParts.push(`Ménage: ${cleaningInfo.emoji} (${cleaningInfo.companyName})`);
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