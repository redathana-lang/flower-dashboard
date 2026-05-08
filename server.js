const express = require('express');
const path = require('path');
const webpush = require('web-push');
const { sendDailyReport } = require('./emailService');

const app = express();
app.use(express.json({limit:'50mb'}));
app.use(express.urlencoded({limit:'50mb', extended:true}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// ─── GOOGLE SHEETS CONFIG ─────────────────────────────────────────────────────
const SHEET_ID = '1abLRrgklWeV3wx-KEmA0u4SgCH5ebw3s';
const GID = {
  fo:       '398660926',
  fnb:      '663170393',
  cashflow: '697395742',
  finance:  '261763722',
};

const SHEET_ID2 = '1YpNAPiNQiKLHNtLq_ymqpCFqV5ewqiKTX7uywN66_vA';
const GID2 = {
  boards: '0',
  spa:    '2041684400',
};

// ─── CSV FETCH & PARSE ────────────────────────────────────────────────────────
async function fetchCSV(gid, sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId||SHEET_ID}/export?format=csv&gid=${gid}`;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  const stripped = s.replace(/^[A-Za-z]+,\s*/, '');
  const mdY = stripped.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdY) {
    const [, monthName, day, year] = mdY;
    const month = MONTHS[monthName.toLowerCase()];
    if (month) return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return null;
}

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

// ─── SHEET PARSERS ────────────────────────────────────────────────────────────
function parseFO(rows, date) {
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    rooms_occupied:   n(r[3]),
    rooms_flower:     0,
    rooms_garden:     0,
    revenue_eur:      n(r[5]),
    occupancy_pct:    n(r[2]),
    nights_available: n(r[4]),
    overbooking:      0,
    ooo:              0,
  };
}

function parseFNB(rows, date) {
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    flower:      n(r[1]),
    pool_bar:    n(r[2]),
    brutal:      n(r[3]),
    pool_garden: n(r[4]),
    beach_bar:   n(r[5]),
    house_use:   n(r[6]),
    total:       n(r[7]),
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
    revenues:       n(r[1]),
    total_services: n(r[2]),
  };
}

function parseCashFlow(rows, date) {
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    arketimet: {
      non_cash_lek:        n(r[1]),
      non_cash_euro:       n(r[2]),
      reception_cash_euro: n(r[3]),
      reception_cash_lek:  n(r[5]),
      allotment:           n(r[6]),
      itaka:               n(r[7]),
      fnb_cash_lek:        n(r[8]),
      mice_euro:           n(r[9]),
      mice_lek:            n(r[10]),
    },
    pagesat: {
      paga:                 n(r[11]),
      taxes:                n(r[12]),
      loan_euro:            n(r[13]),
      loan_lek:             n(r[14]),
      house_use:            n(r[15]),
      furnitore_cash:       n(r[16]),
      furnitore_bank_lek:   n(r[17]),
      furnitore_bank_euro:  n(r[18]),
      investime_banke_euro: n(r[19]),
      investime_banke_lek:  n(r[20]),
      investime_cash:       n(r[21]),
    }
  };
}

function parseFinance(rows, date) {
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    beach_bar:     n(r[1]),
    flower:        n(r[2]),
    pool_bar:      n(r[3]),
    brutal:        n(r[4]),
    pool_garden:   n(r[5]),
    overheads_fnb: n(r[6]),
    mag_qendrore:  n(r[7]),
    operacionale:  n(r[8]),
    spa:           n(r[9]),
    mirembajtje:   n(r[10]),
    marketing:     n(r[11]),
    familja:       n(r[12]),
    hoteli:        n(r[13]),
    mag_garden:    n(r[14]),
    paga_util:     n(r[15]),
    total:         n(r[16]),
  };
}

function parseBoards(rows, date) {
  const idx = indexByDate(rows, 1);
  const r = idx[date];
  if (!r) return {};
  return {
    pax_bb: n(r[1]), pax_hb: n(r[2]),
    pax_ai: n(r[3]), pax_romantic: n(r[4]),
    total_pax: n(r[1])+n(r[2])+n(r[3])+n(r[4]),
  };
}

// ─── CACHE ────────────────────────────────────────────────────────────────────
let cache = { fo:null, fnb:null, cashflow:null, finance:null, spa:null, boards:null };
let lastFetch = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function refreshCache() {
  console.log('[FLOW] Refreshing Google Sheets...');
  try {
    const [foText, fnbText, cfText, finText, spaText, boardsText] = await Promise.all([
      fetchCSV(GID.fo),
      fetchCSV(GID.fnb),
      fetchCSV(GID.cashflow),
      fetchCSV(GID.finance),
      fetchCSV(GID2.spa,    SHEET_ID2),
      fetchCSV(GID2.boards, SHEET_ID2),
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

// ─── RANGE AGGREGATION ────────────────────────────────────────────────────────
function sumDeep(a, b) {
  if (!b) return a;
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number') r[k] = (r[k] || 0) + v;
    else if (v && typeof v === 'object') r[k] = sumDeep(r[k] || {}, v);
  }
  return r;
}

function aggregateRange(parseFn, rows, fromDate, toDate) {
  let result = {}, cur = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    result = sumDeep(result, parseFn(rows, d));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ─── API ──────────────────────────────────────────────────────────────────────
app.get('/api/overview', async (req, res) => {
  try {
    await ensureCache();
    const today = new Date().toISOString().split('T')[0];
    const fromDate = req.query.from || req.query.date || today;
    const toDate   = req.query.to   || req.query.date || today;
    const [fy] = fromDate.split('-');
    const [ty] = toDate.split('-');
    const fromPrev = `${parseInt(fy)-1}${fromDate.slice(4)}`;
    const toPrev   = `${parseInt(ty)-1}${toDate.slice(4)}`;
    const isSingle = fromDate === toDate;
    const get = (fn, rows, f, t) => isSingle ? fn(rows, f) : aggregateRange(fn, rows, f, t);
    const data = {
      from: fromDate, to: toDate,
      fo:       get(parseFO,       cache.fo,       fromDate, toDate),
      fnb:      get(parseFNB,      cache.fnb,      fromDate, toDate),
      spa:      get(parseSPA,      cache.spa,      fromDate, toDate),
      cashflow: get(parseCashFlow, cache.cashflow, fromDate, toDate),
      finance:  get(parseFinance,  cache.finance,  fromDate, toDate),
      boards:   get(parseBoards,   cache.boards,   fromDate, toDate),
      fo_yoy:   get(parseFO,       cache.fo,       fromPrev, toPrev),
      fnb_yoy:  get(parseFNB,      cache.fnb,      fromPrev, toPrev),
      spa_yoy:  get(parseSPA,      cache.spa,      fromPrev, toPrev),
      boards_yoy: get(parseBoards, cache.boards,   fromPrev, toPrev),
    };
    res.json(data);
  } catch(e) {
    console.error('[FLOW] API error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/refresh', async (req, res) => {
  await refreshCache();
  res.json({ ok: true, ts: new Date().toISOString() });
});

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

// ─── HMS HOUSEKEEPING STATE ───────────────────────────────────────────────────
// Disku i përhershëm Render → /data (nuk fshihet as me redeploy as me restart)
const fs_hms  = require('fs');
const HMS_FILE = '/data/hms_state.json';
let hmsRooms = {}, hmsLastSaved = null;

(function(){
  try {
    if (fs_hms.existsSync(HMS_FILE)) {
      const d = JSON.parse(fs_hms.readFileSync(HMS_FILE, 'utf8'));
      hmsRooms = d.rooms || {}; hmsLastSaved = d.ts || null;
      console.log('[HMS] Ngarkuar nga /data:', Object.keys(hmsRooms).length, 'dhoma');
    } else {
      console.log('[HMS] /data/hms_state.json nuk ekziston — duke filluar bosh');
    }
  } catch(e) { console.warn('[HMS] Load error:', e.message); }
})();

function saveHMS() {
  try {
    fs_hms.writeFileSync(HMS_FILE, JSON.stringify({ rooms: hmsRooms, ts: hmsLastSaved }), 'utf8');
  } catch(e) { console.warn('[HMS] Save error:', e.message); }
}

app.get('/api/hms/state', (req, res) => res.json({ ok: true, data: hmsRooms, ts: hmsLastSaved }));

app.post('/api/hms/state', (req, res) => {
  try {
    hmsRooms = req.body.state || req.body;
    hmsLastSaved = new Date().toISOString();
    saveHMS();
    res.json({ ok: true });
  } catch(e) { res.status(400).json({ error: e.message }); }
});

app.get('/hk', (req, res) => res.sendFile(require('path').join(__dirname, 'hk.html')));

// ─── GOOGLE SHEETS PROXY ──────────────────────────────────────────────────────
const https_mod = require('https');
const SALES_SHEET_ID = '1g5EelHzeScWpdLJJLpKOtRRMfnZCEdfC';
const SALES_GID = '1091890353';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbya90QFNbKoHiem6w07zZASh4TtTDkBgfALxdxojCmWHT6hRl5O9c2vqggxiC7F64CaOQ/exec';
const APPS_SCRIPT_TOKEN = 'FlowerHotels2026';

function fetchUrl(url, redirectCount, resolve, reject) {
  if(redirectCount > 10) return reject(new Error('Too many redirects'));
  const opts = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GoogleBot/2.1)',
      'Cache-Control': 'no-cache, no-store',
      'Pragma': 'no-cache',
      'Accept': 'text/csv,text/plain,*/*',
    }
  };
  const lib = url.startsWith('https') ? https_mod : require('http');
  lib.get(url, opts, function(res) {
    if([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
      const loc = res.headers.location;
      const abs = loc.startsWith('http') ? loc : 'https://docs.google.com' + loc;
      return fetchUrl(abs, redirectCount+1, resolve, reject);
    }
    if(res.statusCode !== 200) {
      let body=''; res.on('data',function(c){body+=c;}); res.on('end',function(){ reject(new Error('HTTP '+res.statusCode+' body:'+body.substring(0,200))); });
      return;
    }
    let data = '';
    res.setEncoding('utf8');
    res.on('data', function(c){ data += c; });
    res.on('end', function(){ resolve(data); });
    res.on('error', reject);
  }).on('error', reject);
}

app.get('/api/sheets-csv', function(req, res) {
  const url = 'https://docs.google.com/spreadsheets/d/' + SALES_SHEET_ID + '/export?format=csv&gid=' + SALES_GID + '&t=' + Date.now();
  new Promise(function(resolve, reject){ fetchUrl(url, 0, resolve, reject); })
    .then(function(csv){
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('X-Fetched-At', new Date().toISOString());
      console.log('[SHEETS] Fetched fresh CSV at', new Date().toISOString(), 'rows:', csv.split('\n').length);
      res.send(csv);
    })
    .catch(function(e){ res.status(500).json({error: e.message}); });
});

app.get('/api/sheets-debug', function(req, res) {
  const url = APPS_SCRIPT_URL + '?token=' + APPS_SCRIPT_TOKEN + '&t=' + Date.now();
  new Promise(function(resolve, reject){ fetchUrl(url, 0, resolve, reject); })
    .then(function(csv){
      var lines = csv.split('\n').slice(0,6);
      res.json({ raw_first_lines: lines, total_chars: csv.length, starts_with: csv.substring(0,100) });
    })
    .catch(function(e){ res.status(500).json({error: e.message}); });
});

// ─── SALES STATE PERSISTENCE ──────────────────────────────────────────────────
const fs_sales  = require('fs');
const path_sales = require('path');
const SALES_FILE = path_sales.join(__dirname, 'sales_state.json');
const PREV_FILE  = path_sales.join(__dirname, 'sales_prev.json');

let salesState = null;
let prevSales  = { tR: null, tN: null, filename: null, ts: null };

(function loadSales(){
  try {
    if(fs_sales.existsSync(SALES_FILE)){
      const parsed = JSON.parse(fs_sales.readFileSync(SALES_FILE,'utf8'));
      if(parsed && parsed.agg){ salesState = parsed; console.log('[SALES] Loaded from disk, ts:', salesState.ts); }
    }
  } catch(e){ console.warn('[SALES] Load error:', e.message); }
})();

(function loadPrevSales(){
  try {
    if(fs_sales.existsSync(PREV_FILE)){
      const parsed = JSON.parse(fs_sales.readFileSync(PREV_FILE,'utf8'));
      if(parsed && parsed.tR != null){ prevSales = parsed; console.log('[SALES] Loaded prev snapshot, tR:', prevSales.tR); }
    }
  } catch(e){ console.warn('[SALES] Prev load error:', e.message); }
})();

function saveSales(){
  try { fs_sales.writeFileSync(SALES_FILE, JSON.stringify(salesState), 'utf8'); }
  catch(e){ console.warn('[SALES] Save error:', e.message); }
}
function savePrevSales(){
  try { fs_sales.writeFileSync(PREV_FILE, JSON.stringify(prevSales), 'utf8'); }
  catch(e){ console.warn('[SALES] Prev save error:', e.message); }
}

app.get('/api/sales-state', function(req, res){
  res.setHeader('Cache-Control','no-store');
  if(salesState && salesState.agg) res.json({ok:true, data:salesState});
  else res.json({ok:false, data:null});
});

app.post('/api/sales-state', function(req, res){
  try {
    if(salesState && salesState.agg){
      prevSales = { tR: salesState.agg.tR||0, tN: salesState.agg.tN||0, filename: salesState.filename||null, ts: salesState.ts||null };
      savePrevSales();
      console.log('[SALES] Prev snapshot saved, tR:', prevSales.tR);
    }
    salesState = req.body;
    if(!salesState.ts) salesState.ts = new Date().toISOString();
    saveSales();
    console.log('[SALES] New upload saved, tR:', salesState.agg && salesState.agg.tR, 'file:', salesState.filename);
    res.json({ok:true});
  } catch(e){ res.status(400).json({error:e.message}); }
});

app.get('/api/sales-clear', function(req, res){
  salesState = null;
  try { if(fs_sales.existsSync(SALES_FILE)) fs_sales.unlinkSync(SALES_FILE); } catch(e){}
  res.json({ok:true, message:'Sales cache cleared'});
});

// ─── EMAIL REPORT ─────────────────────────────────────────────────────────────
app.post('/api/send-report', async function(req, res) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'Rep26';
  const token = req.body && req.body.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Nuk keni leje. Vetëm ADMIN mund të dërgojë raportin.' });
  }
  const date = (req.body && req.body.date) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Formati i datës duhet të jetë YYYY-MM-DD.' });
  }
  try {
    await ensureCache();
    const fo     = parseFO(cache.fo, date);
    const fnb    = parseFNB(cache.fnb, date);
    const spa    = parseSPA(cache.spa, date);
    const cf     = parseCashFlow(cache.cashflow, date);
    const fin    = parseFinance(cache.finance, date);
    const boards = parseBoards(cache.boards, date);
    const prevDate = (parseInt(date.slice(0,4))-1) + date.slice(4);
    const fo_yoy  = parseFO(cache.fo, prevDate);
    const fnb_yoy = parseFNB(cache.fnb, prevDate);
    const spa_yoy = parseSPA(cache.spa, prevDate);
    const prevDayObj = new Date(date + 'T00:00:00');
    prevDayObj.setDate(prevDayObj.getDate() - 1);
    const prevDayStr = prevDayObj.toISOString().slice(0,10);
    const fo_prev  = parseFO(cache.fo, prevDayStr);
    const fnb_prev = parseFNB(cache.fnb, prevDayStr);
    const EH = 100, EC = 95, TR = 110;
    const hotelLek      = (fo.revenue_eur  || 0) * EH;
    const flowerRestLek = fnb.flower      || 0;
    const brutalLek     = fnb.brutal      || 0;
    const poolBarLek    = fnb.pool_bar    || 0;
    const poolGardenLek = fnb.pool_garden || 0;
    const beachBarLek   = fnb.beach_bar   || 0;
    const houseUseLek   = fnb.house_use   || 0;
    const spaLek        = spa.revenues    || 0;
    const totalRevLek   = hotelLek + flowerRestLek + brutalLek + poolBarLek + poolGardenLek + beachBarLek + houseUseLek + spaLek;
    const lyHotelLek      = (fo_yoy.revenue_eur  || 0) * EH;
    const lyFlowerLek     = fnb_yoy.flower      || 0;
    const lyBrutalLek     = fnb_yoy.brutal      || 0;
    const lyPoolBarLek    = fnb_yoy.pool_bar    || 0;
    const lyPoolGardenLek = fnb_yoy.pool_garden || 0;
    const lyBeachBarLek   = fnb_yoy.beach_bar   || 0;
    const lyHouseUseLek   = fnb_yoy.house_use   || 0;
    const lySpaLek        = spa_yoy.revenues    || 0;
    const lyTotalRevLek   = lyHotelLek + lyFlowerLek + lyBrutalLek + lyPoolBarLek + lyPoolGardenLek + lyBeachBarLek + lyHouseUseLek + lySpaLek;
    const prevDayRevLek   = ((fo_prev.revenue_eur||0)*EH) + (fnb_prev.flower||0) + (fnb_prev.brutal||0) + (fnb_prev.pool_bar||0) + (fnb_prev.pool_garden||0) + (fnb_prev.beach_bar||0) + (fnb_prev.house_use||0);
    const ark = cf.arketimet || {};
    const pag = cf.pagesat   || {};
    function nv(v){ return Number(v)||0; }
    const cfInLek  = nv(ark.non_cash_lek) + nv(ark.reception_cash_lek) + nv(ark.fnb_cash_lek) + nv(ark.mice_lek)
                   + (nv(ark.non_cash_euro) + nv(ark.reception_cash_euro) + nv(ark.allotment) + nv(ark.itaka) + nv(ark.mice_euro)) * EC;
    const cfOutLek = nv(pag.paga) + nv(pag.taxes) + nv(pag.loan_lek) + nv(pag.house_use) + nv(pag.furnitore_cash)
                   + nv(pag.furnitore_bank_lek) + nv(pag.investime_banke_lek) + nv(pag.investime_cash)
                   + (nv(pag.loan_euro) + nv(pag.furnitore_bank_euro) + nv(pag.investime_banke_euro)) * EC;
    const cfNetLek = cfInLek - cfOutLek;
    const occ    = fo.occupancy_pct || 0;
    const lyOcc  = fo_yoy.occupancy_pct || 0;
    const rooms  = fo.rooms_occupied || 0;
    const adr    = rooms > 0 ? Math.round(hotelLek / rooms) : 0;
    const revpar = Math.round(hotelLek / TR);
    const lyAdr    = (fo_yoy.rooms_occupied||0) > 0 ? Math.round(lyHotelLek / (fo_yoy.rooms_occupied||1)) : 0;
    const lyRevpar = Math.round(lyHotelLek / TR);
    const expItems = [
      { name:'Beach Bar',                 lek: nv(fin.beach_bar)     },
      { name:'Flower Restorant',          lek: nv(fin.flower)        },
      { name:'Pool Bar',                  lek: nv(fin.pool_bar)      },
      { name:'Brutal',                    lek: nv(fin.brutal)        },
      { name:'Pool Bar Garden',           lek: nv(fin.pool_garden)   },
      { name:'Overheads F&B',             lek: nv(fin.overheads_fnb) },
      { name:'Magazina Qendrore',         lek: nv(fin.mag_qendrore)  },
      { name:'Operacionale Mikse',        lek: nv(fin.operacionale)  },
      { name:'SPA',                       lek: nv(fin.spa)           },
      { name:'Mirëmbajtje & Riparime',    lek: nv(fin.mirembajtje)   },
      { name:'Marketing',                 lek: nv(fin.marketing)     },
      { name:'Familja',                   lek: nv(fin.familja)       },
      { name:'Shpenzime Hoteli',          lek: nv(fin.hoteli)        },
      { name:'Magazina GARDEN (Invest.)', lek: nv(fin.mag_garden)    },
      { name:'Paga & Utilitete',          lek: nv(fin.paga_util)     },
    ].filter(function(i){ return i.lek !== 0; });
    const expTotal = nv(fin.total) || expItems.reduce(function(s,i){ return s+i.lek; }, 0);
    var salesSection = null;
    try {
      if (salesState && salesState.agg) {
        const agg = salesState.agg;
        const SEASON_MONTHS = ['04','05','06','07','08','09','10'];
        const seasonEntries = Object.entries(agg.mo || {})
          .filter(function(e){ return SEASON_MONTHS.includes(String(e[1].mo).padStart(2,'0')); })
          .sort(function(a,b){ return a[0].localeCompare(b[0]); });
        const MAL = {1:'Janar',2:'Shkurt',3:'Mars',4:'Prill',5:'Maj',6:'Qershor',7:'Korrik',8:'Gusht',9:'Shtator',10:'Tetor',11:'Nëntor',12:'Dhjetor'};
        function daysInMonth(yr,mo){ return new Date(yr,mo,0).getDate(); }
        const monthRows = seasonEntries.map(function(e){
          const m = e[1];
          const avail = daysInMonth(m.yr, m.mo) * TR;
          const mOcc  = avail > 0 ? (m.nights / avail * 100).toFixed(1) : 0;
          const mAdr  = m.nights > 0 ? (m.rev / m.nights).toFixed(0) : 0;
          const topSrc = Object.entries(m.src || {}).sort(function(a,b){ return b[1].rev - a[1].rev; })[0];
          return { label:(MAL[m.mo]||e[0])+' '+m.yr, res:m.res||0, nights:m.nights||0, rev:m.rev||0, adr:mAdr, occ:mOcc, flowerRev:m.fR||0, gardenRev:m.gR||0, topSrc:topSrc?topSrc[0]:'—' };
        });
        const top3channels = Object.entries(agg.src || {})
          .sort(function(a,b){ return b[1].rev - a[1].rev; }).slice(0,3)
          .map(function(e,i){
            const maxRev = Object.values(agg.src).sort(function(a,b){return b.rev-a.rev;})[0].rev;
            return { rank:i+1, name:e[0], rev:e[1].rev, nights:e[1].nights||0, barPct:Math.round(e[1].rev/Math.max(maxRev,1)*100) };
          });
        salesSection = {
          totalNights:agg.tN||0, totalRev:agg.tR||0, totalRes:agg.tRes||0,
          flowerNights:agg.fN||0, flowerRev:agg.fR||0, gardenNights:agg.gN||0, gardenRev:agg.gR||0,
          monthRows, top3channels,
          seasonLabel:'Prill – Tetor '+new Date(date+'T00:00:00').getFullYear(),
          uploadTs:salesState.ts||new Date().toISOString(),
          prevTotalRev:prevSales.tR!=null?prevSales.tR:null,
          prevTotalNights:prevSales.tN!=null?prevSales.tN:null,
          prevFilename:prevSales.filename||null,
        };
      }
    } catch(salesErr) { console.warn('[EMAIL] Sales data unavailable:', salesErr.message); }
    const data = {
      totalRevenueLek: totalRevLek, totalRevenueEur: Math.round(totalRevLek/EH),
      occupancyPct: occ, roomsOccupied: rooms, totalRooms: TR,
      prevDayRevenueLek: prevDayRevLek,
      departments: [
        { name:'Hotel (€×100)',   revenueLek: hotelLek,      lyLek: lyHotelLek      },
        { name:'Brutal Garden',   revenueLek: brutalLek,     lyLek: lyBrutalLek     },
        { name:'Flower Rest.',    revenueLek: flowerRestLek, lyLek: lyFlowerLek     },
        { name:'Beach Bar',       revenueLek: beachBarLek,   lyLek: lyBeachBarLek   },
        { name:'Pool Bar',        revenueLek: poolBarLek,    lyLek: lyPoolBarLek    },
        { name:'Pool Bar Garden', revenueLek: poolGardenLek, lyLek: lyPoolGardenLek },
        { name:'House Use',       revenueLek: houseUseLek,   lyLek: lyHouseUseLek   },
        { name:'SPA',             revenueLek: spaLek,        lyLek: lySpaLek        },
      ],
      fo: { adr, revpar, occ },
      cashFlow: {
        totalInLek: cfInLek, totalOutLek: cfOutLek, netLek: cfNetLek,
        inItems: [
          { label:'Non Cash Lek',            lek: nv(ark.non_cash_lek) },
          { label:'Non Cash Bank Euro×'+EC,  lek: Math.round(nv(ark.non_cash_euro)*EC) },
          { label:'Reception Cash Euro×'+EC, lek: Math.round(nv(ark.reception_cash_euro)*EC) },
          { label:'Reception Cash Lek',      lek: nv(ark.reception_cash_lek) },
          { label:'Allotments Euro×'+EC,     lek: Math.round(nv(ark.allotment)*EC) },
          { label:'Itaka',                   lek: nv(ark.itaka) },
          { label:'F&B Cash Lek',            lek: nv(ark.fnb_cash_lek) },
          { label:'MICE Euro×'+EC,           lek: Math.round(nv(ark.mice_euro)*EC) },
          { label:'MICE Lek',                lek: nv(ark.mice_lek) },
        ].filter(function(i){ return i.lek!==0; }),
        outItems: [
          { label:'Paga',                      lek: nv(pag.paga) },
          { label:'Taksa & Utilitete',         lek: nv(pag.taxes) },
          { label:'Kredi Euro×'+EC,            lek: Math.round(nv(pag.loan_euro)*EC) },
          { label:'Kredi Lek',                 lek: nv(pag.loan_lek) },
          { label:'House Use',                 lek: nv(pag.house_use) },
          { label:'Furnitore Cash',            lek: nv(pag.furnitore_cash) },
          { label:'Furnitore Bankë Lek',       lek: nv(pag.furnitore_bank_lek) },
          { label:'Furnitore Bankë Euro×'+EC,  lek: Math.round(nv(pag.furnitore_bank_euro)*EC) },
          { label:'Investime Bankë Euro×'+EC,  lek: Math.round(nv(pag.investime_banke_euro)*EC) },
          { label:'Investime Bankë Lek',       lek: nv(pag.investime_banke_lek) },
          { label:'Investime Cash',            lek: nv(pag.investime_cash) },
        ].filter(function(i){ return i.lek!==0; }),
      },
      expenses: { totalLek: expTotal, items: expItems },
      salesReport: salesSection,
    };
    const prevData = {
      totalRevenueLek: lyTotalRevLek, occupancyPct: lyOcc,
      fo: { adr: lyAdr, revpar: lyRevpar, occ: lyOcc, roomsOccupied: fo_yoy.rooms_occupied||0 },
    };
    await sendDailyReport(date, data, prevData);
    res.json({ success: true, message: 'Raporti u dërgua me sukses për datën ' + date + ' → redathana@gmail.com, ernestcaci@gmail.com' });
  } catch(err) {
    console.error('[EMAIL] Error:', err.message);
    res.status(500).json({ error: 'Emaili nuk u dërgua: ' + err.message });
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[FLOW] Server on port ${PORT}`);
  refreshCache();
  setInterval(refreshCache, CACHE_TTL);
});
