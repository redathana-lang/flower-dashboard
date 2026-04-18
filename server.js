const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

/* ── VAPID KEYS ── */
const VAPID_PUBLIC  = 'BBhLXpHFoobumd5D0D2a-AsZVS30YoZggjPe2X65-_yVYTVGYWEQCbTT53iuag99iJCgqkCGhTW3EjLl5XISaas';
const VAPID_PRIVATE = 'nPnaCTyXqTiLxkiIELJKCte8B2KyNUI7uQAZeQ9uZkg';

webpush.setVapidDetails(
  'mailto:info@hotel-flower.com',
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

/* ── DATA ── */
function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
  return {};
}
function saveData(d) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); return true; } catch(e) { return false; }
}
function loadSubs() {
  try { if (fs.existsSync(SUBS_FILE)) return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); } catch(e) {}
  return [];
}
function saveSubs(s) {
  try { fs.writeFileSync(SUBS_FILE, JSON.stringify(s, null, 2)); } catch(e) {}
}

let DB = loadData();

const DEPT_LABELS = {
  frontoffice: '🗝️ Front Office',
  spa:         '💆 SPA',
  fnb:         '🍽️ F&B',
  allinclusive:'⭐ All Inclusive / HK',
  finance:     '💰 Cash Flow',
  financefnb:  '🧾 Finance'
};

/* ── API ── */
app.get('/api/vapid-public-key', (req, res) => res.json({ publicKey: VAPID_PUBLIC }));

app.post('/api/subscribe', (req, res) => {
  const { subscription, userId } = req.body;
  if (!subscription) return res.status(400).json({ error: 'No subscription' });
  let subs = loadSubs().filter(s => s.userId !== userId);
  subs.push({ subscription, userId, createdAt: new Date().toISOString() });
  saveSubs(subs);
  console.log(`✓ Subscribed: ${userId}`);
  res.json({ success: true });
});

app.post('/api/unsubscribe', (req, res) => {
  const { userId } = req.body;
  saveSubs(loadSubs().filter(s => s.userId !== userId));
  res.json({ success: true });
});

app.post('/api/report', (req, res) => {
  const { dept, date, submittedBy, ...fields } = req.body;
  if (!dept || !date) return res.status(400).json({ error: 'dept dhe date janë të detyrueshme' });
  if (!DB[date]) DB[date] = {};
  DB[date][dept] = { dept, date, ...fields, submittedBy, saved_at: new Date().toISOString() };
  const ok = saveData(DB);

  // Send push only to MANAGER
  const managerSubs = loadSubs().filter(s => s.userId === 'MANAGER');
  if (managerSubs.length > 0) {
    const payload = JSON.stringify({
      title: 'FLOW — Flower Hotels',
      body: `${DEPT_LABELS[dept] || dept} ka dorëzuar raportin · ${date}`,
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      data: { dept, date, url: '/' }
    });

    managerSubs.forEach(({ subscription, userId }) => {
      webpush.sendNotification(subscription, payload)
        .then(r => console.log(`✓ Push sent to ${userId}: ${r.statusCode}`))
        .catch(err => {
          console.error(`✗ Push error for ${userId}:`, err.statusCode, err.message);
          if (err.statusCode === 410 || err.statusCode === 404) {
            saveSubs(loadSubs().filter(s => s.userId !== userId));
          }
        });
    });
  }

  res.json({ success: ok });
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

app.listen(PORT, () => console.log(`FLOW running on port ${PORT}`));
