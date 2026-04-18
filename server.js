const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Serve static files from public/ or root
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

/* ── DATA STORE ── */
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) { console.error('Load error:', e.message); }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('Save error:', e.message);
    return false;
  }
}

let DB = loadData();

/* ── API: Save report ── */
app.post('/api/report', (req, res) => {
  const { dept, date, ...fields } = req.body;
  if (!dept || !date) return res.status(400).json({ error: 'dept dhe date janë të detyrueshme' });
  if (!DB[date]) DB[date] = {};
  DB[date][dept] = { dept, date, ...fields, saved_at: new Date().toISOString() };
  const ok = saveData(DB);
  res.json({ success: ok, key: `${date}:${dept}` });
});

/* ── API: Get one date ── */
app.get('/api/reports', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date e nevojshme' });
  res.json(DB[date] || {});
});

/* ── API: Get date range ── */
app.get('/api/reports/range', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from dhe to të nevojshme' });
  const result = {};
  const cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    result[d] = DB[d] || {};
    cur.setDate(cur.getDate() + 1);
  }
  res.json(result);
});

/* ── API: Health check ── */
app.get('/api/ping', (req, res) => res.json({ status: 'ok', records: Object.keys(DB).length }));

/* ── Serve frontend for all routes ── */
app.get('*', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found. Kontrolloni strukturën e GitHub repo.');
  }
});

app.listen(PORT, () => console.log(`Flower Dashboard running on port ${PORT}`));
