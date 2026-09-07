'use strict';

// ================================================================
// reviewsIngest.js — GuestFlip monthly guest-satisfaction report
// Flower Hotels & Resorts · FLOW Dashboard
//
// On the 1st of each month GuestFlip (noreply@guestflip.io) emails
// "Monthly Report for Flower Hotel Resort (01 Aug 2026 to 31 Aug 2026)"
// to mireda.thana@hotel-flower.com with an .xlsx attached
// (sheets "Overview" + "Sentiment Analysis"). A Zoho filter forwards
// that one email to flowreport26@gmail.com.
//
// This module:
//   1. Polls the flowreport26 inbox over IMAP (same EMAIL_USER/PASS as
//      emailIngest.js) for those emails (any sender — it arrives forwarded).
//   2. Parses the workbook into one JSON record per month.
//   3. Stores all months in /data/guest_reviews.json
//      (GET /api/reviews/state) for the "Mysafirët" tab.
//   4. Also accepts a manual upload of the same xlsx (admin):
//      POST /api/reviews/upload {token, filename, b64}.
//   5. Labels the email "processed-report" like the rest of the pipeline
//      and sends a heartbeat for the Reputation Agent.
// ================================================================

const fs = require('fs');
const path = require('path');
let beat = function () {};
try { beat = require('./heartbeat').beat; } catch (_) {}

function lazy(name) { try { return require(name); } catch (e) { return null; } }

const IMAP_HOST = process.env.IMAP_HOST || 'imap.gmail.com';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993', 10);
const IMAP_USER = process.env.EMAIL_USER;
const IMAP_PASS = process.env.EMAIL_PASS;
const LABEL = process.env.KONTROLLO_LABEL || 'processed-report';
const LABEL2 = process.env.REVIEWS_LABEL || 'processed-guestflip'; // own label so the monthly reports are easy to find in Gmail
const LOOKBACK_DAYS = parseInt(process.env.REVIEWS_LOOKBACK_DAYS || '400', 10);
const CHECK_MIN = parseInt(process.env.REVIEWS_CHECK_MINUTES || '60', 10);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'Rep26';
const SUBJECT_RX = /Monthly Report for Flower Hotel Resort\s*\((\d{2} \w{3} \d{4}) to (\d{2} \w{3} \d{4})\)/i;

const STATE_FILE = fs.existsSync('/data')
  ? '/data/guest_reviews.json'
  : path.join(__dirname, 'guest_reviews.json');
// the original workbook is kept too, so the admin panel's existing
// "Reputacioni Online" section can render it with its own parser
const FILE_DIR = fs.existsSync('/data') ? '/data/guestflip' : path.join(__dirname, 'guestflip');

let state = { months: {}, lastCheck: null, lastError: null };
try {
  if (fs.existsSync(STATE_FILE)) {
    state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    console.log('[REVIEWS] State loaded,', Object.keys(state.months || {}).length, 'month(s)');
  }
} catch (e) { console.warn('[REVIEWS] State load error:', e.message); }
function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8'); }
  catch (e) { console.warn('[REVIEWS] State save error:', e.message); }
}

// ─── PARSING (pure — works on 2-D cell grids) ────────────────────
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function num(v) {
  if (v == null || v === '' || v === '-' || v === '∅') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace('%', '').replace(',', '.').trim();
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return String(v).indexOf('%') >= 0 ? n / 100 : n;
}
function str(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
// "01 August, 2026 - 31 August, 2026" → {from:'2026-08-01', to:'2026-08-31'}
function parsePeriod(text) {
  const m = String(text || '').match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
  if (!m) return null;
  const f = function (d, mo, y) { const mm = MONTHS[mo.toLowerCase()]; return mm ? y + '-' + String(mm).padStart(2, '0') + '-' + String(d).padStart(2, '0') : null; };
  return { from: f(m[1], m[2], m[3]), to: f(m[4], m[5], m[6]) };
}
function findRow(grid, label, col) {
  col = col == null ? 1 : col;
  for (let i = 0; i < grid.length; i++) if (str(grid[i][col]).toLowerCase() === label.toLowerCase()) return i;
  return -1;
}
function rowsUntilBlank(grid, start) {
  const out = [];
  for (let i = start; i < grid.length; i++) {
    const r = grid[i] || [];
    if (r.every(function (v) { return v == null || v === ''; })) { if (out.length) break; else continue; }
    out.push(r);
  }
  return out;
}

/** overview + sentiment grids (arrays of arrays, as XLSX header:1) → month record */
function parseGrids(ov, sa) {
  const rec = { period: null, compare: null, generated: null, overall: {}, sources: [], categories: [], starsByWeek: [], starsBySource: [], countries: [], sentiment: {}, sentimentSources: [], sentimentCategories: [], topics: [] };
  // header lines
  for (let i = 0; i < 6; i++) {
    const t = str(ov[i] && ov[i][2]);
    if (/compare with/i.test(t)) rec.compare = parsePeriod(t);
    else if (!rec.period && parsePeriod(t)) rec.period = parsePeriod(t);
    const g = str(ov[i] && ov[i][19]); if (g && !rec.generated) rec.generated = g;
  }
  // overall
  let i = findRow(ov, 'Overall'); if (i >= 0) {
    const r = rowsUntilBlank(ov, i + 1)[0] || [];
    rec.overall = { reviews: num(r[2]), reviewsPrev: num(r[3]), rating: num(r[4]), ratingPrev: num(r[5]), responseRate: num(r[6]), responseRatePrev: num(r[7]), positive: num(r[8]), negative: num(r[9]) };
  }
  // per source
  i = findRow(ov, 'Per Source'); if (i >= 0) rowsUntilBlank(ov, i + 1).forEach(function (r) {
    if (!str(r[2])) return;
    // HolidayCheck-style rows have gaps: rating in col 5, positive in col 9
    rec.sources.push({ source: str(r[2]), reviews: num(r[3]), reviewsPrev: num(r[4]), rating: num(r[5]), ratingPrev: num(r[6]),
      responseRate: num(r[7]), responseRatePrev: r[8] != null && num(r[8]) <= 1 && r[7] != null ? num(r[8]) : null,
      positive: num(r[9]), negative: num(r[10]), scale: /booking/i.test(str(r[2])) ? 10 : /holiday/i.test(str(r[2])) ? 6 : 5 });
  });
  // rating categories (vs competition)
  i = findRow(ov, 'Rating Categories'); if (i >= 0) rowsUntilBlank(ov, i + 1).forEach(function (r) {
    if (!str(r[2])) return;
    rec.categories.push({ category: str(r[2]), rating: num(r[4]), competition: num(r[5]), difference: num(r[6]),
      competitor: str(r[9]) || null, gri: num(r[10]), cqi: num(r[11]) });
  });
  // stars by week
  i = findRow(ov, 'Star Ratings by Period'); if (i >= 0) rowsUntilBlank(ov, i + 1).forEach(function (r) {
    const p = str(r[2]); if (!p || /^total/i.test(p)) return;
    rec.starsByWeek.push({ period: p, s1: num(r[3]) || 0, s2: num(r[4]) || 0, s3: num(r[5]) || 0, s4: num(r[6]) || 0, s5: num(r[7]) || 0, total: num(r[8]) || 0 });
  });
  i = findRow(ov, 'Star Ratings by Source'); if (i >= 0) rowsUntilBlank(ov, i + 1).forEach(function (r) {
    const p = str(r[2]); if (!p || /^total/i.test(p)) return;
    rec.starsBySource.push({ source: p, s1: num(r[3]) || 0, s2: num(r[4]) || 0, s3: num(r[5]) || 0, s4: num(r[6]) || 0, s5: num(r[7]) || 0, total: num(r[8]) || 0 });
  });
  i = findRow(ov, 'Country Breakdown'); if (i >= 0) rowsUntilBlank(ov, i + 1).forEach(function (r) {
    const c = str(r[2]); if (!c) return;
    rec.countries.push({ country: c, reviews: num(r[14]) || 0, reviewsPrev: num(r[15]) || 0, rating: num(r[16]), ratingPrev: num(r[17]) });
  });
  // sentiment
  i = findRow(sa, 'Overview'); if (i >= 0) {
    const r = rowsUntilBlank(sa, i + 1)[0] || [];
    rec.sentiment = { score: num(r[2]), mentions: num(r[4]), positive: num(r[6]), negative: num(r[8]) };
  }
  i = findRow(sa, 'Sources'); if (i >= 0) rowsUntilBlank(sa, i + 1).forEach(function (r) {
    if (!str(r[2])) return;
    rec.sentimentSources.push({ source: str(r[2]), mentions: num(r[5]) || 0, positive: num(r[6]) || 0, negative: num(r[7]) || 0, share: num(r[8]), rating: num(r[9]) });
  });
  i = findRow(sa, 'Sentiment Categories'); if (i >= 0) rowsUntilBlank(sa, i + 1).forEach(function (r) {
    if (!str(r[2])) return;
    rec.sentimentCategories.push({ category: str(r[2]), mentions: num(r[4]) || 0, mentionsPrev: num(r[5]) || 0, positive: num(r[6]) || 0, positivePrev: num(r[8]) || 0, negative: num(r[9]) || 0, negativePrev: num(r[11]) || 0 });
  });
  i = findRow(sa, 'Trends'); if (i >= 0) rowsUntilBlank(sa, i + 1).forEach(function (r) {
    if (!str(r[2])) return;
    rec.topics.push({ topic: str(r[2]), mentions: num(r[4]) || 0, mentionsPrev: num(r[5]) || 0, positive: num(r[6]) || 0, positivePrev: num(r[8]) || 0, negative: num(r[9]) || 0, negativePrev: num(r[11]) || 0 });
  });
  if (!rec.period) throw new Error('Period not found in Overview sheet');
  rec.month = rec.period.from.slice(0, 7);
  return rec;
}

function parseWorkbook(buffer) {
  const XLSX = lazy('xlsx');
  if (!XLSX) throw new Error('xlsx module missing');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const get = function (name) {
    const n = wb.SheetNames.find(function (s) { return s.toLowerCase().indexOf(name) >= 0; }) || wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null, raw: true });
  };
  return parseGrids(get('overview'), get('sentiment'));
}

function store(rec, meta) {
  if (meta.buffer) {
    try { fs.mkdirSync(FILE_DIR, { recursive: true }); fs.writeFileSync(path.join(FILE_DIR, rec.month + '.xlsx'), meta.buffer); }
    catch (e) { console.warn('[REVIEWS] could not keep workbook:', e.message); }
  }
  rec.sourceFile = meta.filename || null;
  rec.processedAt = new Date().toISOString();
  rec.via = meta.via || 'email';
  state.months[rec.month] = rec;
  saveState();
  beat('reputation-agent', 'GuestFlip → FLOW Dashboard', 'monthly report ' + rec.month + ' (' + rec.via + ')', { minGapMs: 0 });
}

// ─── IMAP CHECK ──────────────────────────────────────────────────
let checking = false;
async function checkInbox() {
  if (checking) return { skipped: 'already running' };
  checking = true;
  try {
    const { ImapFlow } = lazy('imapflow') || {};
    const mailparser = lazy('mailparser');
    if (!ImapFlow || !mailparser) throw new Error('imapflow/mailparser modules missing');
    if (!IMAP_USER || !IMAP_PASS) throw new Error('EMAIL_USER / EMAIL_PASS env vars not set');
    const client = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: IMAP_USER, pass: IMAP_PASS }, logger: false });
    await client.connect();
    const done = [];
    try {
      try { await client.mailboxCreate(LABEL); } catch (_) {}
      try { await client.mailboxCreate(LABEL2); } catch (_) {}
      const lock = await client.getMailboxLock('INBOX');
      try {
        const since = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000);
        const uids = await client.search({ subject: 'Monthly Report for Flower Hotel Resort', since: since }, { uid: true });
        for (const uid of uids || []) {
          const msg = await client.fetchOne(uid, { envelope: true }, { uid: true });
          const subject = (msg && msg.envelope && msg.envelope.subject) || '';
          if (!SUBJECT_RX.test(subject)) continue;
          const dl = await client.download(uid, undefined, { uid: true });
          const parsed = await mailparser.simpleParser(dl.content);
          const att = (parsed.attachments || []).find(function (a) { return /\.xlsx?$/i.test(a.filename || ''); });
          if (!att) { console.warn('[REVIEWS] no xlsx in', subject); continue; }
          let rec;
          try { rec = parseWorkbook(att.content); } catch (e) { console.warn('[REVIEWS] parse failed:', e.message); continue; }
          if (state.months[rec.month] && state.months[rec.month].ok) continue;
          rec.ok = true;
          store(rec, { filename: att.filename, via: 'email', buffer: att.content });
          done.push(rec.month);
          try { await client.messageCopy(String(uid), LABEL, { uid: true }); } catch (e) {}
          try { await client.messageCopy(String(uid), LABEL2, { uid: true }); } catch (e) {}
          console.log('[REVIEWS] Processed', rec.month, '·', rec.overall.reviews, 'reviews ·', rec.overall.rating);
        }
      } finally { lock.release(); }
    } finally { await client.logout().catch(function () {}); }
    state.lastCheck = new Date().toISOString(); state.lastError = null; saveState();
    return { ok: true, processed: done };
  } catch (e) {
    state.lastCheck = new Date().toISOString(); state.lastError = e.message; saveState();
    console.warn('[REVIEWS] Check error:', e.message);
    return { ok: false, error: e.message };
  } finally { checking = false; }
}

// ─── EXPRESS ─────────────────────────────────────────────────────
function summary(rec) {
  return { month: rec.month, period: rec.period, reviews: rec.overall.reviews, rating: rec.overall.rating, responseRate: rec.overall.responseRate,
    positive: rec.overall.positive, negative: rec.overall.negative, sentiment: rec.sentiment && rec.sentiment.score, processedAt: rec.processedAt, via: rec.via };
}
function init(app) {
  app.get('/api/reviews/state', function (req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const months = Object.keys(state.months).sort();
    const latest = months.length ? state.months[months[months.length - 1]] : null;
    const want = req.query.month && state.months[req.query.month] ? state.months[req.query.month] : latest;
    res.json({ ok: true, lastCheck: state.lastCheck, lastError: state.lastError, months: months.map(function (m) { return summary(state.months[m]); }), latest: want });
  });
  // the stored workbook for a month (YYYY-MM) — used by the admin panel
  app.get('/api/reviews/file/:month', function (req, res) {
    const m = String(req.params.month || '');
    if (!/^\d{4}-\d{2}$/.test(m)) return res.status(400).json({ error: 'month=YYYY-MM' });
    const f = path.join(FILE_DIR, m + '.xlsx');
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'Nuk ka raport për ' + m });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(f).pipe(res);
  });
  app.post('/api/reviews/upload', function (req, res) {
    try {
      const b = req.body || {};
      if (b.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Nuk keni leje.' });
      if (!b.b64) return res.status(400).json({ error: 'Skedar bosh.' });
      const buf = Buffer.from(String(b.b64).replace(/^data:[^,]*,/, ''), 'base64');
      const rec = parseWorkbook(buf);
      rec.ok = true;
      store(rec, { filename: b.filename || 'upload.xlsx', via: 'upload', buffer: buf });
      res.json({ ok: true, month: rec.month, summary: summary(rec) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/reviews/check', async function (req, res) {
    if (!req.body || req.body.token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Nuk keni leje.' });
    if (req.body.month && state.months[req.body.month]) delete state.months[req.body.month];
    res.json(await checkInbox());
  });
  setTimeout(function () { checkInbox(); }, 90 * 1000);
  setInterval(function () { checkInbox(); }, CHECK_MIN * 60 * 1000);
  console.log('[REVIEWS] GuestFlip ingest active · every ' + CHECK_MIN + ' min');
}

module.exports = { init, parseGrids, parseWorkbook, checkInbox };
