'use strict';

// ================================================================
// emailIngest.js — KontrolloPrenotimet automatic email processor
// Flower Hotels & Resorts · FLOW Dashboard
//
// Every night at 21:22 Trinosoft (info@triniscloud.com) emails
// "KontrolloPrenotimet - YYYY-MM-DD" to flowreport26@gmail.com with
// an .xlsx of all in-house reservations for that hotel day.
//
// This module:
//   1. Polls the flowreport26 inbox over IMAP (same EMAIL_USER /
//      EMAIL_PASS app password already used for SMTP sending).
//   2. Finds unprocessed KontrolloPrenotimet emails.
//   3. Parses the xlsx attachment and computes the day's numbers
//      with the OWNER-CONFIRMED rules (see RULES below).
//   4. Pushes {date, nightsOccupied, nightsAvailable, revenue} to the
//      Apps Script "hotel_performance" endpoint(s) that feed the
//      HOTEL DAILY PERFORMANCE sheet (the FO source of the dashboard
//      and the daily FLOW report email).
//   5. Saves a full breakdown snapshot to kontrollo_state.json
//      (exposed at GET /api/kontrollo/state).
//   6. Labels the email "processed-report" in Gmail, like the rest
//      of the FLOW pipeline.
//
// RULES (confirmed by Mireda on 2026-08-01, extended 2026-08-04):
//   • Rooms starting with "SR"  = Flower Residence SARANDA → excluded.
//   • Rooms starting with "RB" (a.k.a. "BR") = a separate off-site
//     residence, NOT Flower Hotel → excluded (added 2026-08-04 after
//     6 "RB" rooms were wrongly counted for 2026-08-03, pushing
//     occupancy to 165/160 = 103%).
//   • Room type "Z VILA" (VILA 1, VILA 2, 313 — owner villas) → excluded.
//   • Name/source exclusions — SAME list as the "Prenotimet ne recepsion"
//     sales report (dashboard: "Pa Caci/Jasht Pune/Bllok/SAISTOURS"):
//     olti caci, ahmet caci, ernest caci, jashte pune, jasht pune, bllok,
//     saistours — matched as WHOLE WORDS (so guest surnames like "Blloku"
//     are NOT excluded), case-insensitive, repeated spaces collapsed,
//     checked against Klienti, BurimiInfo and Kompania.
//   • ITAKA tour-operator rooms stay at price 0 (settled end of season)
//     but DO count as occupied rooms.
//   • A reservation counts for the report date D when
//     DataFillimit <= D < DataMbarimit.
//   • Revenue = sum of Cmimi (EUR, per-night price) of counted rooms.
// ================================================================

const fs = require('fs');
const path = require('path');

// Heavy deps are loaded lazily inside functions so that a missing
// node module can never crash the whole dashboard on boot.
function lazy(name) { try { return require(name); } catch (e) { return null; } }

// ─── CONFIG ──────────────────────────────────────────────────────
const IMAP_HOST = process.env.IMAP_HOST || 'imap.gmail.com';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993', 10);
const IMAP_USER = process.env.EMAIL_USER; // flowreport26@gmail.com
const IMAP_PASS = process.env.EMAIL_PASS; // Gmail app password (works for IMAP + SMTP)

const FROM_ADDR   = (process.env.KONTROLLO_FROM || 'info@triniscloud.com').toLowerCase();
const SUBJECT_RX  = /KontrolloPrenotimet\s*[-–]\s*(\d{4}-\d{2}-\d{2})/i;
const LABEL       = process.env.KONTROLLO_LABEL || 'processed-report';
const LOOKBACK_DAYS = parseInt(process.env.KONTROLLO_LOOKBACK_DAYS || '7', 10);
const CHECK_MIN   = parseInt(process.env.KONTROLLO_CHECK_MINUTES || '15', 10);
const ROOMS_AVAIL = parseInt(process.env.KONTROLLO_ROOMS_AVAILABLE || '160', 10);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'Rep26';

// Comma-separated Apps Script /exec URLs that accept
// {action:'hotel_performance', date, nightsOccupied, nightsAvailable, revenue}
// (FLOWREPORT → Sample Data Power Bi Flower.xlsx, FLOW REPORT → Flower Hotel - Live Data)
const PUSH_URLS = (process.env.KONTROLLO_PUSH_URLS || '')
  .split(',').map(function (s) { return s.trim(); }).filter(Boolean);

const STATE_FILE = fs.existsSync('/data')
  ? '/data/kontrollo_state.json'
  : path.join(__dirname, 'kontrollo_state.json');

// ─── STATE ───────────────────────────────────────────────────────
let state = { days: {}, lastCheck: null, lastError: null };
try {
  if (fs.existsSync(STATE_FILE)) {
    state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    console.log('[KONTROLLO] State loaded,', Object.keys(state.days || {}).length, 'day(s)');
  }
} catch (e) { console.warn('[KONTROLLO] State load error:', e.message); }

function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8'); }
  catch (e) { console.warn('[KONTROLLO] State save error:', e.message); }
}

// ─── XLSX PARSING (pure — unit-testable) ─────────────────────────
function excelDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') { // Excel serial
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d) ? null : d;
}

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
       + '-' + String(d.getDate()).padStart(2, '0');
}

// Name/source exclusions — identical list + matching to the dashboard's
// "Prenotimet ne recepsion" sales parser (index.html isExcl/EXCL_NAMES).
const EXCL_NAMES = ['olti caci', 'ahmet caci', 'ernest caci',
  'jashte pune', 'jasht pune', 'bllok', 'saistours'];

function isExcl() {
  const fields = Array.prototype.slice.call(arguments).map(function (v) {
    return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
  });
  return EXCL_NAMES.some(function (x) {
    const re = new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    return fields.some(function (f) { return re.test(f); });
  });
}

/**
 * Parse a KontrolloPrenotimet workbook buffer and compute the
 * aggregates for `reportDate` (YYYY-MM-DD) using the confirmed rules.
 */
function parseWorkbook(buffer, reportDate) {
  const XLSX = lazy('xlsx');
  if (!XLSX) throw new Error('xlsx module missing');

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames.indexOf('Report') >= 0 ? 'Report' : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
  if (!rows.length) throw new Error('Empty sheet ' + sheetName);

  const night = new Date(reportDate + 'T00:00:00');
  const res = {
    date: reportDate,
    totalRecords: rows.length,
    roomsOccupied: 0,
    revenueEur: 0,
    excluded: { saranda: 0, sarandaRevenueEur: 0, rb: 0, rbRevenueEur: 0, vila: 0, named: 0, namedRevenueEur: 0 },
    itakaRooms: 0,
    flower: { rooms: 0, revenueEur: 0 },
    garden: { rooms: 0, revenueEur: 0 },
    byPlan: {},
    byChannel: {},
  };

  rows.forEach(function (r) {
    const ci = excelDate(r.DataFillimit);
    const co = excelDate(r.DataMbarimit);
    if (!ci || !co) return;
    // active on the night of the report date
    if (!(ymd(ci) <= reportDate && reportDate < ymd(co))) return;

    const room  = String(r.NrDhomes || '').trim();
    const rtype = String(r.LLojiDhomes || '').trim().toUpperCase();
    const price = Number(r.Cmimi) || 0;

    // RULE: Saranda rooms (SR …) are a different property — excluded.
    // Anchor on the prefix only (no \b) so "SR3" / "SR 3" both match.
    if (/^SR/i.test(room)) { res.excluded.saranda++; res.excluded.sarandaRevenueEur += price; return; }
    // RULE: RB / BR rooms are a separate off-site residence — excluded.
    if (/^(?:RB|BR)/i.test(room)) { res.excluded.rb++; res.excluded.rbRevenueEur += price; return; }
    // RULE: owner villas (Z VILA → VILA 1, VILA 2, 313) — excluded.
    if (rtype === 'Z VILA') { res.excluded.vila++; return; }
    // RULE: same name/source exclusions as "Prenotimet ne recepsion"
    // (Pa Caci / Jasht Pune / Bllok / SAISTOURS).
    if (isExcl(r.Klienti, r.BurimiInfo, r.Kompania)) {
      res.excluded.named++; res.excluded.namedRevenueEur += price; return;
    }

    res.roomsOccupied++;
    res.revenueEur += price;

    const plan = String(r.Kompania || 'Pa plan').trim() || 'Pa plan';
    if (!res.byPlan[plan]) res.byPlan[plan] = { rooms: 0, revenueEur: 0 };
    res.byPlan[plan].rooms++; res.byPlan[plan].revenueEur += price;
    if (/^ITAKA/i.test(plan)) res.itakaRooms++; // stays at 0 € — settled end of season

    const src = String(r.BurimiInfo || 'N/A').trim() || 'N/A';
    if (!res.byChannel[src]) res.byChannel[src] = { rooms: 0, revenueEur: 0 };
    res.byChannel[src].rooms++; res.byChannel[src].revenueEur += price;

    if (/^G/i.test(room)) { res.garden.rooms++; res.garden.revenueEur += price; }
    else { res.flower.rooms++; res.flower.revenueEur += price; }
  });

  res.revenueEur = Math.round(res.revenueEur * 100) / 100;
  res.adrEur = res.roomsOccupied ? Math.round(res.revenueEur / res.roomsOccupied * 100) / 100 : 0;
  return res;
}

// ─── PUSH TO SHEETS (Apps Script hotel_performance) ──────────────
async function pushToSheets(agg) {
  const results = [];
  for (const url of PUSH_URLS) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hotel_performance',
          date: agg.date,
          nightsOccupied: agg.roomsOccupied,
          nightsAvailable: ROOMS_AVAIL,
          revenue: agg.revenueEur,
        }),
      });
      const txt = await resp.text();
      results.push({ url: url.slice(0, 60) + '…', status: resp.status, body: txt.slice(0, 120) });
      console.log('[KONTROLLO] Pushed', agg.date, '→', resp.status);
    } catch (e) {
      results.push({ url: url.slice(0, 60) + '…', error: e.message });
      console.warn('[KONTROLLO] Push failed:', e.message);
    }
  }
  return results;
}

// ─── IMAP CHECK ──────────────────────────────────────────────────
let checking = false;

async function checkInbox() {
  if (checking) return { skipped: 'already running' };
  checking = true;
  try {
    const { ImapFlow } = lazy('imapflow') || {};
    const mailparser = lazy('mailparser');
    if (!ImapFlow || !mailparser) throw new Error('imapflow/mailparser modules missing — run npm install');
    if (!IMAP_USER || !IMAP_PASS) throw new Error('EMAIL_USER / EMAIL_PASS env vars not set');

    const client = new ImapFlow({
      host: IMAP_HOST, port: IMAP_PORT, secure: true,
      auth: { user: IMAP_USER, pass: IMAP_PASS },
      logger: false,
    });
    await client.connect();
    const processedNow = [];
    try {
      // make sure the label mailbox exists (Gmail label == mailbox)
      try { await client.mailboxCreate(LABEL); } catch (_) { /* exists */ }

      const lock = await client.getMailboxLock('INBOX');
      try {
        const since = new Date(Date.now() - LOOKBACK_DAYS * 86400 * 1000);
        const uids = await client.search({ from: FROM_ADDR, since: since }, { uid: true });

        for (const uid of uids || []) {
          // envelope first — cheap; skip anything already in state
          const msg = await client.fetchOne(uid, { envelope: true }, { uid: true });
          const subject = (msg && msg.envelope && msg.envelope.subject) || '';
          const m = subject.match(SUBJECT_RX);
          if (!m) continue;
          const reportDate = m[1];
          if (state.days[reportDate] && state.days[reportDate].ok) continue; // already done

          // download full source and parse
          const dl = await client.download(uid, undefined, { uid: true });
          const parsed = await mailparser.simpleParser(dl.content);
          const att = (parsed.attachments || []).find(function (a) {
            return /\.xlsx?$/i.test(a.filename || '');
          });
          if (!att) { console.warn('[KONTROLLO]', reportDate, 'email has no xlsx attachment'); continue; }

          const agg = parseWorkbook(att.content, reportDate);
          agg.sourceFile = att.filename;
          agg.messageDate = parsed.date || null;
          agg.processedAt = new Date().toISOString();
          agg.push = await pushToSheets(agg);
          agg.ok = true;

          state.days[reportDate] = agg;
          saveState();
          processedNow.push(reportDate);

          // label as processed (copy to label mailbox = add Gmail label)
          try { await client.messageCopy(String(uid), LABEL, { uid: true }); }
          catch (e) { console.warn('[KONTROLLO] Label failed:', e.message); }

          console.log('[KONTROLLO] Processed', reportDate, '·', agg.roomsOccupied, 'rooms · €' + agg.revenueEur);
        }
      } finally { lock.release(); }
    } finally { await client.logout().catch(function () {}); }

    state.lastCheck = new Date().toISOString();
    state.lastError = null;
    saveState();
    return { ok: true, processed: processedNow };
  } catch (e) {
    state.lastCheck = new Date().toISOString();
    state.lastError = e.message;
    saveState();
    console.warn('[KONTROLLO] Check error:', e.message);
    return { ok: false, error: e.message };
  } finally { checking = false; }
}

// ─── EXPRESS WIRING ──────────────────────────────────────────────
function init(app) {
  // current state / last processed days
  app.get('/api/kontrollo/state', function (req, res) {
    const days = Object.keys(state.days).sort().slice(-14).reduce(function (o, k) {
      o[k] = state.days[k]; return o;
    }, {});
    res.json({ ok: true, lastCheck: state.lastCheck, lastError: state.lastError, days: days });
  });

  // aggregated breakdowns for a date range — feeds the Front Office tables
  // "Rezervimet sipas Planit (Kompania)" and "sipas Burimit të Rezervimit"
  app.get('/api/kontrollo/range', function (req, res) {
    const from = req.query.from;
    const to = req.query.to || from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) {
      return res.status(400).json({ ok: false, error: 'from=YYYY-MM-DD required' });
    }
    const out = { ok: true, from: from, to: to, daysCovered: [],
      roomsOccupied: 0, revenueEur: 0, byPlan: {}, byChannel: {} };
    Object.keys(state.days).sort().forEach(function (d) {
      if (d < from || d > to) return;
      const a = state.days[d];
      if (!a || !a.ok) return;
      out.daysCovered.push(d);
      out.roomsOccupied += a.roomsOccupied || 0;
      out.revenueEur += a.revenueEur || 0;
      ['byPlan', 'byChannel'].forEach(function (k) {
        Object.keys(a[k] || {}).forEach(function (name) {
          if (!out[k][name]) out[k][name] = { rooms: 0, revenueEur: 0 };
          out[k][name].rooms += a[k][name].rooms || 0;
          out[k][name].revenueEur += a[k][name].revenueEur || 0;
        });
      });
    });
    out.revenueEur = Math.round(out.revenueEur * 100) / 100;
    Object.keys(out.byPlan).forEach(function (k) { out.byPlan[k].revenueEur = Math.round(out.byPlan[k].revenueEur * 100) / 100; });
    Object.keys(out.byChannel).forEach(function (k) { out.byChannel[k].revenueEur = Math.round(out.byChannel[k].revenueEur * 100) / 100; });
    res.json(out);
  });

  // manual trigger (admin) — body: {token, date?} · date forces reprocess
  app.post('/api/kontrollo/check', async function (req, res) {
    const token = req.body && req.body.token;
    if (token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Nuk keni leje.' });
    if (req.body && req.body.date && state.days[req.body.date]) delete state.days[req.body.date];
    const out = await checkInbox();
    res.json(out);
  });

  // poll loop — first check 45s after boot, then every CHECK_MIN minutes
  setTimeout(function () { checkInbox(); }, 45 * 1000);
  setInterval(function () { checkInbox(); }, CHECK_MIN * 60 * 1000);
  console.log('[KONTROLLO] Auto-ingest active · every ' + CHECK_MIN + ' min · from ' + FROM_ADDR
    + ' · push targets: ' + PUSH_URLS.length);
}

module.exports = { init, parseWorkbook, checkInbox };
