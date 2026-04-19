const express = require('express');
const path = require('path');
const webpush = require('web-push');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// ─── GOOGLE SHEETS CONFIG ─────────────────────────────────────────────────────
// Spreadsheet: Sample Data Power Bi Flower
const SHEET_ID = '1abLRrgklWeV3wx-KEmA0u4SgCH5ebw3s';
const GID = {
  fo:       '398660926',   // HOTEL DAILY PERFORMANCE
  fnb:      '663170393',   // DAILY F&B REVENUES
  cashflow: '697395742',   // CASH FLOW
  finance:  '261763722',   // SHPENZIME DITORE
  spa:      '1116616961',  // DAILY SPA REVENUES
  boards:   '1734518042',  // DAILY BOARDS — pax per paketë (BB, AI, HB, etj)
};

// ─── EXACT COLUMN MAPS (from screenshots) ────────────────────────────────────
//
// FO (gid=398660926):
//   A[0]=Date("Monday, January 01, 2024")  B[1]=Company  C[2]=Occupancy%
//   D[3]=Nights Occupied  E[4]=Nights Available(110)  F[5]=Revenue("8,765€")
//
// F&B (gid=663170393):
//   A[0]=Date  B[1]=Flower Restaurant  C[2]=Pool Bar  D[3]=Brutal Garden
//   E[4]=Pool Bar Garden  F[5]=Beach Bar  G[6]=House Use  H[7]=Total
//
// SPA (gid=1116616961):
//   A[0]=Date  B[1]=REVENUES  C[2]=TOTAL SERVICES
//
// CASH FLOW (gid=697395742):  date format: "4/20/2026" (M/D/YYYY)
//   A[0]=Date
//   HYRJE (IN):
//   B[1]=Non Cash Lek  C[2]=Non Cash Bank Euro  D[3]=Reception Cash Euro
//   E[4]=HIDDEN  F[5]=Reception Cash Lek  G[6]=Allotments Euro  H[7]=Itaka
//   I[8]=F&B Lek  J[9]=MICE Euro  K[10]=MICE Lek
//   DALJE (OUT):
//   L[11]=Paga  M[12]=Taksa dhe Utilitete  N[13]=Kredi Euro  O[14]=Kredi Lek
//   P[15]=House Use  Q[16]=Furnitore Cash  R[17]=Furnitore BAnke
//   S[18]=Investime Euro  T[19]=Investime Lek
//
// FINANCE/SHPENZIME (gid=261763722):
//   A[0]=Date  B[1]=Shpenzime Hoteli  C[2]=All Inclusive F&B
//   D[3]=Flower Restorant  E[4]=Pool Bar  F[5]=Brutal  G[6]=Pool Bar Garden
//   H[7]=Beach Bar  I[8]=Te tjera  J[9]=TOTAL

// ─── CSV FETCH & PARSE ────────────────────────────────────────────────────────
async function fetchCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet ${gid} fetch failed: ${res.status}`);
  return await res.text();
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { cols.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
      else { cur += c; }
    }
    cols.push(cur.trim().replace(/^"|"$/g, ''));
    return cols;
  });
}

// Strip currency symbols, spaces, commas → number
function n(s) {
  if (s === null || s === undefined || s === '') return 0;
  const cleaned = String(s).replace(/[^0-9.\-]/g, '');
  const v = parseFloat(cleaned);
  return isNaN(v) ? 0 : v;
}

// ─── DATE NORMALIZATION ───────────────────────────────────────────────────────
const MONTHS = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12
};

function normDate(s) {
  if (!s) return null;
  s = String(s).trim();

  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // M/D/YYYY or MM/DD/YYYY (Cash Flow sheet uses this)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  // "Monday, January 01, 2024" or "Wednesday, April 01, 2026"
  // Strip day-of-week
  const stripped = s.replace(/^[A-Za-z]+,\s*/, '');
  // Match "Month DD, YYYY"
  const mdY = stripped.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdY) {
    const [, monthName, day, year] = mdY;
    const month = MONTHS[monthName.toLowerCase()];
    if (month) return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  return null;
}

// ─── INDEX BY DATE ────────────────────────────────────────────────────────────
function indexByDate(rows, headerRows = 1) {
  const map = {};
  for (let i = headerRows; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    const d = normDate(row[0]);
    if (d) map[d] = row;
  }
  return map;
}

// ─── SHEET PARSERS (positional — exact column indices) ────────────────────────

function parseFO(rows, date) {
  // Header row 0, data from row 1
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    rooms_occupied: n(r[3]),          // D: Nights Occupied
    rooms_flower:   0,                 // not in sheet (no Flower/Garden split)
    rooms_garden:   0,
    revenue_eur:    n(r[5]),           // F: Revenue (e.g. "8,765€" → 8765)
    occupancy_pct:  n(r[2]),           // C: Occupancy % (e.g. "93%" → 93)
    nights_available: n(r[4]),         // E: Nights Available (110)
    overbooking:    0,
    ooo:            0,
  };
}

function parseFNB(rows, date) {
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    flower:      n(r[1]),  // B: Flower Restaurant
    pool_bar:    n(r[2]),  // C: Pool Bar
    brutal:      n(r[3]),  // D: Brutal Garden
    pool_garden: n(r[4]),  // E: Pool Bar Garden
    beach_bar:   n(r[5]),  // F: Beach Bar
    house_use:   n(r[6]),  // G: House Use (can be negative)
    total:       n(r[7]),  // H: Total
    // PAX — not in this sheet; would need a separate sheet GID
    pax_ai: 0, pax_bb: 0, pax_hb: 0, pax_romantic: 0,
    breakfast_flower: 0, breakfast_garden: 0,
    pax_lunch: 0, pax_snack: 0, pax_dinner: 0,
  };
}

function parseSPA(rows, date) {
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    revenues:       n(r[1]),  // B: REVENUES
    total_services: n(r[2]),  // C: TOTAL SERVICES
  };
}

function parseCashFlow(rows, date) {
  // Date format in this sheet: M/D/YYYY (e.g. 4/20/2026)
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};

  return {
    arketimet: {
      non_cash_lek:        n(r[1]),   // B: Hyrje Non Cash Lek
      non_cash_euro:       n(r[2]),   // C: Hyrje Non Cash Bank Euro
      reception_cash_euro: n(r[3]),   // D: Hyrje Reception Cash Euro
      // r[4] = hidden column E — skip
      reception_cash_lek:  n(r[5]),   // F: Hyrje Reception Cash Lek
      allotment:           n(r[6]),   // G: Hyrje Allotments Euro
      itaka:               n(r[7]),   // H: Hyrje Itaka
      fnb_cash_lek:        n(r[8]),   // I: Hyrje F&B Lek
      mice_euro:           n(r[9]),   // J: Hyrje MICE Euro
      mice_lek:            n(r[10]),  // K: Hyrje MICE Lek
    },
    pagesat: {
      paga:              n(r[11]),  // L: Dalje Paga
      taxes:             n(r[12]),  // M: Dalje Taksa dhe Utilitete
      loan_euro:         n(r[13]),  // N: Dalje Kredi Euro
      loan_lek:          n(r[14]),  // O: Dalje Kredi Lek
      house_use:         n(r[15]),  // P: Dalje House Use
      furnitore_cash:    n(r[16]),  // Q: Dalje Furnitore Cash
      furnitore_bank:    n(r[17]),  // R: Dalje Furnitore BAnke
      investime_euro:    n(r[18]),  // S: Dalje Investime Euro
      investime_lek:     n(r[19]),  // T: Dalje Investime Lek
    }
  };
}

function parseFinance(rows, date) {
  // Shpenzime Ditore — expenses by department
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};

  return {
    hoteli:       n(r[1]),  // B: Shpenzime Hoteli
    ai_fnb:       n(r[2]),  // C: All Inclusive F&B
    flower:       n(r[3]),  // D: Flower Restorant
    pool_bar:     n(r[4]),  // E: Pool Bar
    brutal:       n(r[5]),  // F: Brutal
    pool_garden:  n(r[6]),  // G: Pool Bar Garden
    beach_bar:    n(r[7]),  // H: Beach Bar
    tjera:        n(r[8]),  // I: Te tjera
    total:        n(r[9]),  // J: TOTAL
  };
}

function parseBoards(rows, date) {
  // Daily Boards — A=Date, B=BB PAX, C=HB PAX, D=AI PAX, E=ROMANTIC PAX
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    pax_bb: n(r[1]), pax_hb: n(r[2]),
    pax_ai: n(r[3]), pax_romantic: n(r[4]),
    total_pax: n(r[1])+n(r[2])+n(r[3])+n(r[4]),
  };
}

// ─── CACHE ───────────────────────────────────────────────────────────────────
let cache = { fo:null, fnb:null, cashflow:null, finance:null, spa:null, boards:null };
let lastFetch = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function refreshCache() {
  console.log('[FLOW] Refreshing Google Sheets...');
  try {
    const [foText, fnbText, cfText, finText, spaText, boardsText] = await Promise.all([
      fetchCSV(GID.fo), fetchCSV(GID.fnb), fetchCSV(GID.cashflow),
      fetchCSV(GID.finance), fetchCSV(GID.spa), fetchCSV(GID.boards)
    ]);
    cache.fo       = parseCSV(foText);
    cache.fnb      = parseCSV(fnbText);
    cache.cashflow = parseCSV(cfText);
    cache.finance  = parseCSV(finText);
    cache.spa      = parseCSV(spaText);
    cache.boards   = parseCSV(boardsText);
    lastFetch = Date.now();
    console.log(`[FLOW] OK — FO:${cache.fo.length} F&B:${cache.fnb.length} CF:${cache.cashflow.length} Fin:${cache.finance.length} SPA:${cache.spa.length} Boards:${cache.boards.length} rows`);
  } catch(e) {
    console.error('[FLOW] Refresh error:', e.message);
  }
}

async function ensureCache() {
  if (!lastFetch || Date.now() - lastFetch > CACHE_TTL) await refreshCache();
}

// ─── API ──────────────────────────────────────────────────────────────────────
app.get('/api/overview', async (req, res) => {
  try {
    await ensureCache();
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const [y, m, d] = date.split('-');
    const prevDate = `${parseInt(y)-1}-${m}-${d}`;

    const data = {
      date,
      fo:       parseFO(cache.fo, date),
      fnb:      parseFNB(cache.fnb, date),
      spa:      parseSPA(cache.spa, date),
      cashflow: parseCashFlow(cache.cashflow, date),
      finance:  parseFinance(cache.finance, date),
      boards:   parseBoards(cache.boards, date),
      fo_yoy:   parseFO(cache.fo, prevDate),
      fnb_yoy:  parseFNB(cache.fnb, prevDate),
      spa_yoy:  parseSPA(cache.spa, prevDate),
      boards_yoy: parseBoards(cache.boards, prevDate),
    };

    res.json(data);
  } catch(e) {
    console.error('[FLOW] API error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Force refresh
app.post('/api/refresh', async (req, res) => {
  await refreshCache();
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Debug — show dates and first data row per sheet
app.get('/api/debug', async (req, res) => {
  await ensureCache();
  const info = {};
  for (const [name, rows] of Object.entries(cache)) {
    if (!rows) { info[name] = 'null'; continue; }
    const idx = indexByDate(rows, 1);
    const dates = Object.keys(idx).sort();
    info[name] = {
      totalRows: rows.length,
      header: (rows[0]||[]),
      firstDate: dates[0],
      lastDate: dates[dates.length-1],
      sampleRow: rows[1] || [],
      datesCount: dates.length,
    };
  }
  res.json(info);
});

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────
let vapidKeys = null;
let subscribers = [];

try {
  vapidKeys = webpush.generateVAPIDKeys();
  webpush.setVapidDetails('mailto:flow@flowerhotels.com', vapidKeys.publicKey, vapidKeys.privateKey);
  console.log('[FLOW] Push notifications ready');
} catch(e) {
  console.warn('[FLOW] web-push unavailable:', e.message);
}

app.get('/api/push/key', (req, res) => {
  res.json({ publicKey: vapidKeys ? vapidKeys.publicKey : '' });
});

app.post('/api/push/subscribe', (req, res) => {
  const { subscription, user } = req.body;
  if (!subscription) return res.status(400).json({ error: 'No subscription' });
  subscribers = subscribers.filter(s => s.user !== user);
  subscribers.push({ subscription, user });
  console.log(`[FLOW] ${user} subscribed. Total: ${subscribers.length}`);
  res.json({ ok: true });
});

app.post('/api/push/notify', async (req, res) => {
  if (!vapidKeys) return res.json({ ok: false, reason: 'no vapid' });
  const { dept, date } = req.body;
  const payload = JSON.stringify({
    title: 'FLOW — Flower Hotels',
    body: `${dept} dorëzoi raportin · ${date || new Date().toLocaleDateString('sq-AL')}`,
    icon: '/icon-192.png', url: '/'
  });
  let sent = 0;
  for (const sub of subscribers.filter(s => s.user === 'MANAGER')) {
    try { await webpush.sendNotification(sub.subscription, payload); sent++; }
    catch(e) { console.error('[FLOW] Push error:', e.message); }
  }
  res.json({ ok: true, sent });
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[FLOW] Server on port ${PORT}`);
  refreshCache();
  setInterval(refreshCache, CACHE_TTL);
});
