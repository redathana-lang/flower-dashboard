const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
// POST /api/report
// Body: { dept, date, ...fields }
app.post('/api/report', (req, res) => {
  const { dept, date, ...fields } = req.body;
  if (!dept || !date) return res.status(400).json({ error: 'dept dhe date janë të detyrueshme' });

  if (!DB[date]) DB[date] = {};
  DB[date][dept] = { dept, date, ...fields, saved_at: new Date().toISOString() };

  const ok = saveData(DB);
  res.json({ success: ok, key: `${date}:${dept}` });
});

/* ── API: Get one date ── */
// GET /api/reports?date=2026-04-17
app.get('/api/reports', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date e nevojshme' });
  res.json(DB[date] || {});
});

/* ── API: Get date range ── */
// GET /api/reports/range?from=2026-04-01&to=2026-04-17
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

/* ── Serve frontend ── */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Flower Dashboard running on port ${PORT}`));
