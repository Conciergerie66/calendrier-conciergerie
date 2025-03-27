import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './Calendar.css';

const Calendar = () => {
  const [reservations, setReservations] = useState([]);
  const [grouped, setGrouped] = useState({});

  useEffect(() => {
    axios.get('http://localhost:3001/reservations')
      .then(res => {
        setReservations(res.data);
      });
  }, []);

  useEffect(() => {
    const groups = {};
    reservations.forEach(resa => {
      if (!groups[resa.logementKey]) {
        groups[resa.logementKey] = {
          name: resa.name,
          reservations: []
        };
      }
      groups[resa.logementKey].reservations.push(resa);
    });
    setGrouped(groups);
  }, [reservations]);

  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  return (
    <div className="calendar">
      <table>
        <thead>
          <tr>
            <th>Logement</th>
            {days.map(date => (
              <th key={date}>{new Date(date).getDate()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([key, data]) => (
            <tr key={key}>
              <td>{data.name}</td>
              {days.map(date => {
                const reservation = data.reservations.find(resa =>
                  new Date(date) >= new Date(resa.start) &&
                  new Date(date) < new Date(resa.end)
                );
                if (reservation) {
                  const color = reservation.source === 'airbnb' ? 'red' : 'blue';
                  return <td key={date} className={`cell ${color}`}></td>;
                } else {
                  return <td key={date}></td>;
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Calendar;
