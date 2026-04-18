const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Serve from public/ if exists, otherwise from root (where files are uploaded)
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
  return {};
}
function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); return true; } catch(e) { return false; }
}

let DB = loadData();

app.post('/api/report', (req, res) => {
  const { dept, date, ...fields } = req.body;
  if (!dept || !date) return res.status(400).json({ error: 'dept dhe date janë të detyrueshme' });
  if (!DB[date]) DB[date] = {};
  DB[date][dept] = { dept, date, ...fields, saved_at: new Date().toISOString() };
  res.json({ success: saveData(DB) });
});

app.get('/api/reports', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date e nevojshme' });
  res.json(DB[date] || {});
});

app.get('/api/reports/range', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from dhe to' });
  const result = {};
  const cur = new Date(from); const end = new Date(to);
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    result[d] = DB[d] || {};
    cur.setDate(cur.getDate() + 1);
  }
  res.json(result);
});

app.get('/api/ping', (req, res) => res.json({ status: 'ok', records: Object.keys(DB).length }));

app.get('*', (req, res) => {
  const p = path.join(publicDir, 'index.html');
  if (fs.existsSync(p)) res.sendFile(p);
  else res.status(404).send('index.html not found');
});

app.listen(PORT, () => console.log(`FLOW — Flower Dashboard running on port ${PORT}`));
