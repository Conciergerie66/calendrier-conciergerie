import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

const App = () => {
  const [reservations, setReservations] = useState([]);
  const [logements, setLogements] = useState([]);
  const [offset, setOffset] = useState(0);

  const API_URL = process.env.VITE_API_URL || "https://calendrier-conciergerie.onrender.com";

  useEffect(() => {
    axios.get(`${API_URL}/reservations`)
      .then(res => {
        setReservations(res.data);

        const unique = [];
        const map = new Map();
        res.data.forEach(item => {
          const cleanName = item.name.replace(/\s+/g, ' ').trim();
          if (!map.has(item.logementKey)) {
            map.set(item.logementKey, cleanName);
            unique.push({ logementKey: item.logementKey, name: cleanName });
          }
        });
        setLogements(unique);
      });
  }, []);

  const getNext30Days = () => {
    const days = [];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + offset);
    for (let i = 0; i < 30; i++) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);
      days.push({
        full: date.toLocaleDateString('fr-CA'),
        short: date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
        isSunday: date.getDay() === 0
      });
    }
    return days;
  };

  const days = getNext30Days();

  const isReserved = (logementKey, date, source) => {
    return reservations.some(r =>
      r.logementKey === logementKey &&
      r.source === source &&
      r.start && r.end &&
      new Date(r.start).toDateString() !== new Date(r.end).toDateString() &&
      new Date(date) >= new Date(r.start) &&
      new Date(date) <= new Date(r.end)
    );
  };
  

  const isEntry = (logementKey, date, source) => {
    return reservations.some(r =>
      r.logementKey === logementKey &&
      r.source === source &&
      r.start && r.end &&
      new Date(r.start).toDateString() !== new Date(r.end).toDateString() &&
      new Date(date).toDateString() === new Date(r.start).toDateString()
    );
  };

  const isExit = (logementKey, date, source) => {
    return reservations.some(r =>
      r.logementKey === logementKey &&
      r.source === source &&
      r.start && r.end &&
      new Date(r.start).toDateString() !== new Date(r.end).toDateString() &&
      new Date(date).toDateString() === new Date(r.end).toDateString() &&
      new Date(date) >= new Date(r.start) &&
      new Date(date) <= new Date(r.end)
    );
  };

  return (
    <div className="calendar">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <button onClick={() => setOffset(offset - 30)}>← Mois précédent</button>
        <span><strong>Calendrier des réservations</strong></span>
        <button onClick={() => setOffset(offset + 30)}>→ Mois suivant</button>
      </div>

      {/* Ligne des jours (lun, mar, …) */}
      <div className="header-row">
        <div className="header-cell logement-title"></div>
        {days.map((day, i) => (
          <div key={i} className={`header-cell ${day.isSunday ? 'sunday' : ''}`}>
            {day.short}
          </div>
        ))}
      </div>

      {/* Ligne des dates (04-01, 04-02, …) */}
      <div className="header-row">
        <div className="header-cell logement-title">Logement</div>
        {days.map((day, i) => (
          <div key={i} className={`header-cell ${day.isSunday ? 'sunday' : ''}`}>
            {day.full.slice(5)}
          </div>
        ))}
      </div>

      {logements.map((logement, i) => (
        <div className="row" key={i}>
          <div className="cell logement-name">{logement.name}</div>
          {days.map((day, j) => {
            const isAirbnb = isReserved(logement.logementKey, day.full, 'airbnb');
            const isBooking = isReserved(logement.logementKey, day.full, 'booking');

            const classNames = [
              'cell',
              isAirbnb ? 'airbnb' : '',
              isBooking ? 'booking' : '',
              isEntry(logement.logementKey, day.full, 'airbnb') ? 'entry-airbnb' : '',
              isExit(logement.logementKey, day.full, 'airbnb') ? 'exit-airbnb' : '',
              isEntry(logement.logementKey, day.full, 'booking') ? 'entry-booking' : '',
              isExit(logement.logementKey, day.full, 'booking') ? 'exit-booking' : '',
              day.isSunday ? 'sunday' : ''
            ].join(' ');

            const tooltip = isEntry(logement.logementKey, day.full, 'airbnb')
              ? 'Airbnb'
              : isEntry(logement.logementKey, day.full, 'booking')
              ? 'Réservé'
              : '';

            return (
              <div className={classNames} key={j} title={tooltip}></div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default App;
