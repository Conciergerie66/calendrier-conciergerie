const express = require('express');
const ical = require('node-ical');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

let reservations = [];

const nomsPath = path.join(__dirname, 'logement-noms.json');
let nomsPerso = {};

if (fs.existsSync(nomsPath)) {
  nomsPerso = JSON.parse(fs.readFileSync(nomsPath, 'utf-8'));
}

let sources = [
  ...Array.from({ length: 30 }, (_, i) => {
    const index = i + 1;
    return [
      {
        logementKey: `logement-${index}`,
        source: 'airbnb',
        url: process.env[`AIRBNB_LOGEMENT_${index}`]
      },
      process.env[`BOOKING_LOGEMENT_${index}`]
        ? {
            logementKey: `logement-${index}`,
            source: 'booking',
            url: process.env[`BOOKING_LOGEMENT_${index}`]
          }
        : null
    ].filter(Boolean);
  }).flat()
];

const extractIdFromUrl = (url) => {
  const match = url.match(/ical\/([^/]+)\.ics/);
  return match ? match[1] : null;
};

const fetchReservations = async () => {
  const results = [];

  for (let source of sources) {
    try {
      const data = await ical.async.fromURL(source.url);

      const calendarId = extractIdFromUrl(source.url);
      const calendarName =
        nomsPerso[source.logementKey] ||
        (calendarId
          ? `Logement ${source.source.toUpperCase()} - ${calendarId}`
          : `Logement ${source.source.toUpperCase()}`);

      for (let k in data) {
        const ev = data[k];
        if (ev.type === 'VEVENT') {
          results.push({
            logementKey: source.logementKey,
            name: calendarName,
            source: source.source,
            start: ev.start,
            end: ev.end,
            guest: ev.summary || ''
          });
        }
      }

      console.log(`📌 ${calendarName} chargé`);
    } catch (err) {
      console.error(`❌ Erreur iCal pour ${source.url}:`, err.message);
    }
  }

  reservations = results;
  console.log(`✅ Réservations mises à jour à ${new Date().toISOString()}`);
};

// 🆕 API pour ajouter dynamiquement une source Airbnb (par défaut)
app.post('/ajouter-source', (req, res) => {
  const { url, logementKey = `logement-${sources.length + 1}` } = req.body;

  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'URL invalide' });
  }

  sources.push({
    logementKey,
    source: 'airbnb',
    url
  });

  fetchReservations();
  console.log(`➕ Lien iCal ajouté pour ${logementKey}`);
  res.json({ success: true });
});

// Endpoints existants
app.get('/reservations', (req, res) => {
  res.json(reservations);
});

app.post('/logements', (req, res) => {
  const { logementKey, newName } = req.body;
  if (!logementKey || !newName) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  nomsPerso[logementKey] = newName;
  fs.writeFileSync(nomsPath, JSON.stringify(nomsPerso, null, 2));
  console.log(`✅ Nom mis à jour : ${logementKey} ➜ ${newName}`);

  fetchReservations();
  res.json({ success: true });
});

fetchReservations();
setInterval(fetchReservations, 1000 * 60 * 60);

app.listen(PORT, () => {
  console.log(`🚀 Backend en ligne sur http://localhost:${PORT}`);
});
