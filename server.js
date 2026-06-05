const express = require('express');
const path = require('path');
const webpush = require('web-push');
const { sendDailyReport, buildEmailHTML } = require('./emailService');
// Load .env if present (local dev — production uses platform env vars)
try { require('dotenv').config(); } catch(_) {}

const app = express();
app.use(express.json({limit:'50mb'}));
app.use(express.urlencoded({limit:'50mb', extended:true}));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
 res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
 res.setHeader('Pragma', 'no-cache');
 res.setHeader('Expires', '0');
 res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
 res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
 res.setHeader('Pragma', 'no-cache');
 res.setHeader('Expires', '0');
 res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.static(__dirname));

// ─── GOOGLE SHEETS CONFIG ─────────────────────────────────────────────────────
const SHEET_ID = '1abLRrgklWeV3wx-KEmA0u4SgCH5ebw3s';
const GID = {
 fo: '398660926',
 fnb: '663170393',
 cashflow: '697395742',
 finance: '261763722',
 channels: '954992085',
};

const SHEET_ID2 = '1YpNAPiNQiKLHNtLq_ymqpCFqV5ewqiKTX7uywN66_vA';
const GID2 = {
 boards: '0',
 spa: '2041684400',
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
 rooms_occupied: n(r[3]),
 rooms_flower: 0,
 rooms_garden: 0,
 revenue_eur: n(r[5]),
 occupancy_pct: n(r[2]),
 nights_available: n(r[4]),
 overbooking: 0,
 ooo: 0,
 };
}

function parseFNB(rows, date) {
 const idx = indexByDate(rows, 1);
 const r = idx[date];
 if (!r) return {};
 return {
 flower: n(r[1]),
 pool_bar: n(r[2]),
 brutal: n(r[3]),
 pool_garden: n(r[4]),
 beach_bar: n(r[5]),
 house_use: n(r[6]),
 total: n(r[7]),
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
 revenues: n(r[1]),
 total_services: n(r[2]),
 };
}

function parseCashFlow(rows, date) {
 const idx = indexByDate(rows, 1);
 const r = idx[date];
 if (!r) return {};
 return {
 arketimet: {
 non_cash_lek: n(r[1]),
 non_cash_euro: n(r[2]),
 reception_cash_euro: n(r[3]),
 reception_cash_lek: n(r[5]),
 allotment: n(r[6]),
 itaka: n(r[7]),
 fnb_cash_lek: n(r[8]),
 mice_euro: n(r[9]),
 mice_lek: n(r[10]),
 },
 pagesat: {
 paga: n(r[11]),
 taxes: n(r[12]),
 loan_euro: n(r[13]),
 loan_lek: n(r[14]),
 house_use: n(r[15]),
 furnitore_cash: n(r[16]),
 furnitore_bank_lek: n(r[17]),
 furnitore_bank_euro: n(r[18]),
 investime_banke_euro: n(r[19]),
 investime_banke_lek: n(r[20]),
 investime_cash: n(r[21]),
 }
 };
}

function parseFinance(rows, date) {
 const idx = indexByDate(rows, 1);
 const r = idx[date];
 if (!r) return {};
 return {
 beach_bar: n(r[1]),
 flower: n(r[2]),
 pool_bar: n(r[3]),
 brutal: n(r[4]),
 pool_garden: n(r[5]),
 bufe: n(r[6]),
 overheads_fnb: n(r[7]),
 mag_qendrore: n(r[8]),
 operacionale: n(r[9]),
 spa: n(r[10]),
 mirembajtje: n(r[11]),
 marketing: n(r[12]),
 familja: n(r[13]),
 hoteli: n(r[14]),
 mag_garden: n(r[15]),
 paga_util: n(r[16]),
 total: n(r[17]),
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

// ─── GVIZ CSV FETCH (by sheet name — for monthly summary sheets) ──────────────
async function fetchGvizCSV(sheetName, sheetId) {
 const sid = sheetId || SHEET_ID;
 const url = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
 const res = await fetch(url);
 if (!res.ok) throw new Error(`gviz ${sheetName} failed: ${res.status}`);
 return await res.text();
}

// ─── MONTHLY SHEET PARSERS (index by "Mon-YY" key e.g. "Jan-26") ─────────────
function indexByMonth(rows, headerRows = 1) {
 const map = {};
 for (let i = headerRows; i < rows.length; i++) {
 const r = rows[i];
 if (!r[0] || !r[0].trim()) continue;
 map[r[0].trim()] = r;
 }
 return map;
}

// Executive Summary sheet — all values already in EUR (€ prefix)
// Cols: MONTH|RN AVAIL|RN SOLD|OCC|ADR|REVPAR|TREVPAR|DOF|ALOS|ROOMS REV|F&B REV|OTHER REV|
// OP.REVENUES|ROOMS EXP|F&B EXP|OTHER EXP|DEPT EXP|UNDIST EXP|TOTAL EXP|
// CPOR|GOP|EBITDA|NOP|LABOR COST|FTEs|AVG LABOR|AVG CHK FLOWER|AVG CHK BRUTAL|HOUSE USE
function parseExecSummary(rows) {
 const idx = indexByMonth(rows, 1);
 const CUR = { jan:'Jan-26', feb:'Feb-26', mar:'Mar-26', apr:'Apr-26' };
 const PREV = { jan:'Jan-25', feb:'Feb-25', mar:'Mar-25', apr:'Apr-25' };
 const result = {};
 for (const key of Object.keys(CUR)) {
 const r = idx[CUR[key]];
 const ry = idx[PREV[key]];
 const parse = (row) => row ? {
 rnAvail: n(row[1]),
 rn: n(row[2]),
 occ: parseFloat(String(row[3]||'0').replace('%','').trim()) || 0,
 adr: n(row[4]),
 revpar: n(row[5]),
 roomsRev: n(row[9]), // ROOMS REV column
 fnbRev: n(row[10]), // F&B REV column
 otherRev: n(row[11]), // OTHER REV column (Spa + misc)
 rev: n(row[12]),
 exp: n(row[18]),
 prf: n(row[22]),
 laborCost: n(row[23]),
 ftes: n(row[24]),
 houseUse: n(row[28]),
 } : null;
 result[key] = parse(r);
 result[key+'_ly'] = parse(ry);
 }
 return result;
}

// P&L sheet — budget figures only (values in ALL ÷100 = EUR)
// Cols: Date | Company | Revenue | BudgetRev | Expenses | BudgetExp | Profit | ProfitBudget
function parsePLBudget(rows) {
 const idx = indexByMonth(rows, 1);
 const months = { jan:'Jan-26', feb:'Feb-26', mar:'Mar-26', apr:'Apr-26' };
 const result = {};
 for (const [key, label] of Object.entries(months)) {
 const r = idx[label];
 if (!r) { result[key] = null; continue; }
 result[key] = {
 budRev: Math.round(n(r[3]) / 100),
 budExp: Math.round(n(r[5]) / 100),
 budPrf: Math.round(n(r[7]) / 100),
 };
 }
 return result;
}

// MARKETING COST sheet — values already in EUR
// Cols: Month|MetaAds|GoogleAds|Content|AdvCo|Events|Email|Guestflip|Cloudbeds|ZohoCRM|OtherSubs|MediaAds|GiftVoucher|HouseUse|MktCost|Revenue|%MktCost
function parseMkt(rows) {
 const idx = indexByMonth(rows, 1);
 const months = { jan:'Jan-26', feb:'Feb-26', mar:'Mar-26', apr:'Apr-26' };
 const result = {};
 for (const [key, label] of Object.entries(months)) {
 const r = idx[label];
 if (!r) { result[key] = null; continue; }
 const mktTotal = n(r[14]);
 const mktHU = n(r[13]);
 const mktSpend = Math.round((mktTotal - mktHU) * 100) / 100; // cash-only, excl HU
 const mktRev = n(r[15]);
 const mktPct = parseFloat(String(r[16] || '0').replace('%','').trim()) || 0;
 const cashPct = mktRev > 0 ? Math.round(mktSpend / mktRev * 10000) / 100 : 0;
 const roi = mktSpend > 0 ? Math.round(mktRev / mktSpend * 10) / 10 : 0;
 result[key] = {
 metaAds: Math.round(n(r[1])),
 mktTotal: Math.round(mktTotal), // incl. House Use
 mktHU: Math.round(mktHU),
 mktSpend: Math.round(mktSpend), // cash-only (excl. HU) — used in expense total
 mktRev: Math.round(mktRev),
 mktPct: Math.round(mktPct * 100) / 100,
 mktCashPct: cashPct,
 mktRoi: roi,
 };
 }
 return result;
}

// CHANNEL PERFORMANCE sheet — cols: MONTH | CHANNEL | REVENUE | ...
// Groups all channels into dashboard categories, aggregates per month
function parseChannelPerf(rows) {
 const MAP = {
 'DIRECT': 'Direct',
 'MICE': 'MICE/Groups',
 'BOOKING': 'Booking.com',
 'EXPEDIA': 'Expedia',
 'HOTELBEDS': 'Hotelbeds',
 'WEBBEDS': 'Webbeds',
 'WEBSITE': 'Website',
 'OTS': 'OTS',
 'TRIP.COM': 'OTS', // group with OTS
 'W2M': 'Other',
 'KOLENIA': 'Other',
 'APOLLO': 'Other',
 'HOTELPLAN': 'Other',
 'OLIMPIK': 'Other',
 'DERTOUR': 'Other',
 'TUI DESTIMO': 'Other',
 'SCHAUINSLAND':'Other',
 'ITAKA': 'Other',
 'DEBITOR': 'Other',
 };
 const months    = { jan:'Jan-26', feb:'Feb-26', mar:'Mar-26', apr:'Apr-26' };
 const monthsLY  = { jan:'Jan-25', feb:'Feb-25', mar:'Mar-25', apr:'Apr-25' };
 const result = {};

 // Helper: aggregate one label from rows
 function aggMonth(label) {
 const totals = {};
 for (let i = 1; i < rows.length; i++) {
 const row = rows[i];
 if (!row[0]) continue;
 const rowMonth = row[0].trim().replace(/\s+/, '-');
 if (rowMonth !== label) continue;
 const channel = (row[1] || '').trim().toUpperCase();
 const rawRev = (row[2] || '').trim();
 if (!rawRev || rawRev === '') continue;
 const rev = n(rawRev);
 if (rev === 0) continue;
 const group = MAP[channel] || 'Other';
 totals[group] = (totals[group] || 0) + rev;
 }
 if (totals['Other'] !== undefined && totals['Other'] <= 0) delete totals['Other'];
 return Object.entries(totals)
 .filter(([, v]) => v > 0)
 .map(([l, v]) => ({ l, v: Math.round(v) }))
 .sort((a, b) => b.v - a.v);
 }

 for (const [key] of Object.entries(months)) {
 const ay = aggMonth(months[key]);
 const ly = aggMonth(monthsLY[key]);
 // Return object with ay/ly arrays; ay array is also top-level for backward compat
 result[key] = ay.length > 0 ? ay : null;
 result[key+'_ly'] = ly.length > 0 ? ly : null;
 }

 // YTD 'all' — sum monthly arrays for both AY and LY
 const ytdAY = {}, ytdLY = {};
 for (const key of Object.keys(months)) {
 if (result[key]) result[key].forEach(x => { ytdAY[x.l] = (ytdAY[x.l]||0) + x.v; });
 if (result[key+'_ly']) result[key+'_ly'].forEach(x => { ytdLY[x.l] = (ytdLY[x.l]||0) + x.v; });
 }
 result.all    = Object.entries(ytdAY).filter(([,v])=>v>0).map(([l,v])=>({l,v})).sort((a,b)=>b.v-a.v);
 result.all_ly = Object.entries(ytdLY).filter(([,v])=>v>0).map(([l,v])=>({l,v})).sort((a,b)=>b.v-a.v);

 return result;
}

// Cash flow aggregation by month (from Daily Cash Flow sheet)
// Returns both Cash-In (arketimet) and Cash-Out (pagesat) totals in EUR
function calcCFMonth(cfRows, year, month) {
 const pad = String(month).padStart(2,'0');
 const daysInMonth = new Date(year, month, 0).getDate();
 const from = `${year}-${pad}-01`;
 const to = `${year}-${pad}-${String(daysInMonth).padStart(2,'0')}`;
 const cf = aggregateRange(parseCashFlow, cfRows, from, to);
 if (!cf || !cf.arketimet) return null;

 // ── Cash In (Hyrje) ────────────────────────────────────────────────────────
 const a = cf.arketimet;
 const LEK_EUR = 95; // exchange rate: 1 EUR = 95 LEK
 const lekALL = (a.non_cash_lek||0) + (a.reception_cash_lek||0) + (a.fnb_cash_lek||0) + (a.mice_lek||0);
 const eurEUR = (a.non_cash_euro||0) + (a.reception_cash_euro||0) + (a.allotment||0) + (a.itaka||0) + (a.mice_euro||0);
 const lekEUR = lekALL / LEK_EUR;
 const totalIn = lekEUR + eurEUR;
 if (totalIn === 0) return null;

 // ── Cash Out (Dalje) — from pagesat, all values converted to EUR ───────────
 const p = cf.pagesat || {};
 // LEK amounts → EUR (÷95); EUR amounts → used as-is
 const outGroups = {
 'Wages': Math.round((p.paga||0) / LEK_EUR),
 'Taxes': Math.round((p.taxes||0) / LEK_EUR),
 'Loan': Math.round((p.loan_lek||0)/LEK_EUR + (p.loan_euro||0)),
 'House Use': Math.round((p.house_use||0) / LEK_EUR),
 'Suppliers': Math.round((p.furnitore_cash||0)/LEK_EUR + (p.furnitore_bank_lek||0)/LEK_EUR + (p.furnitore_bank_euro||0)),
 'Investments': Math.round((p.investime_banke_lek||0)/LEK_EUR + (p.investime_cash||0)/LEK_EUR + (p.investime_banke_euro||0)),
 };
 const cfDaljeItems = Object.entries(outGroups)
 .filter(([, v]) => v > 0)
 .map(([l, v]) => ({ l, v }))
 .sort((a, b) => b.v - a.v);
 const cfDalje26 = cfDaljeItems.reduce((s, x) => s + x.v, 0);

 return {
 cfHyrjeALL_eur: Math.round(lekEUR),
 cfHyrjeEUR_eur: Math.round(eurEUR),
 cfHyrje26: Math.round(totalIn),
 cfLekPct: Math.round(lekEUR / totalIn * 100),
 cfDalje26: cfDalje26 > 0 ? cfDalje26 : null,
 cfDaljeItems: cfDaljeItems.length > 0 ? cfDaljeItems : null,
 };
}

// ─── CACHE ────────────────────────────────────────────────────────────────────
let cache = { fo:null, fnb:null, cashflow:null, finance:null, spa:null, boards:null, exec:null, pl:null, mkt:null, channels:null, revenues:null, expenses:null, srcmarkets:null, boardmix:null };
let lastFetch = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function refreshCache() {
 console.log('[FLOW] Refreshing Google Sheets...');
 try {
 const [foText, fnbText, cfText, finText, spaText, boardsText, execText, plText, mktText, chText, revText, expText, srcText, boardText] = await Promise.all([
 fetchCSV(GID.fo),
 fetchCSV(GID.fnb),
 fetchCSV(GID.cashflow),
 fetchCSV(GID.finance),
 fetchCSV(GID2.spa, SHEET_ID2),
 fetchCSV(GID2.boards, SHEET_ID2),
 fetchGvizCSV('Executive Summary'), // primary: rev, exp, occ KPIs, LY rows
 fetchGvizCSV('P&L'), // budget figures only (ALL÷100=EUR)
 fetchGvizCSV('MARKETING COST'),
 fetchCSV(GID.channels), // Channel Performance — per-channel revenue by month
 fetchGvizCSV('Revenues'), // Revenues by department in LEK (AY + LY)
 fetchGvizCSV('Expenses'), // Expenses by category in LEK (AY + LY)
 fetchGvizCSV('Source Markets').catch(()=>null), // Country breakdown EUR per month (AY+LY)
 fetchGvizCSV('Board').catch(()=>null),           // Board type revenue EUR per month (AY+LY)
 ]);
 cache.fo = parseCSV(foText);
 cache.fnb = parseCSV(fnbText);
 cache.cashflow = parseCSV(cfText);
 cache.finance = parseCSV(finText);
 cache.spa = parseCSV(spaText);
 cache.boards = parseCSV(boardsText);
 cache.exec = parseCSV(execText);
 cache.pl = parseCSV(plText);
 cache.mkt = parseCSV(mktText);
 cache.channels = parseCSV(chText);
 cache.revenues = parseCSV(revText);
 cache.expenses = parseCSV(expText);
 cache.srcmarkets = srcText ? parseCSV(srcText) : [];
 cache.boardmix   = boardText ? parseCSV(boardText) : [];
 lastFetch = Date.now();
 console.log(`[FLOW] OK — FO:${cache.fo.length} CF:${cache.cashflow.length} Exec:${cache.exec.length} Mkt:${cache.mkt.length} Ch:${cache.channels.length} Rev:${cache.revenues.length} Exp:${cache.expenses.length} Src:${cache.srcmarkets.length} Board:${cache.boardmix.length} rows`);
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
 const toDate = req.query.to || req.query.date || today;
 const [fy] = fromDate.split('-');
 const [ty] = toDate.split('-');
 const fromPrev = `${parseInt(fy)-1}${fromDate.slice(4)}`;
 const toPrev = `${parseInt(ty)-1}${toDate.slice(4)}`;
 const isSingle = fromDate === toDate;
 const get = (fn, rows, f, t) => isSingle ? fn(rows, f) : aggregateRange(fn, rows, f, t);
 const data = {
 from: fromDate, to: toDate,
 fo: get(parseFO, cache.fo, fromDate, toDate),
 fnb: get(parseFNB, cache.fnb, fromDate, toDate),
 spa: get(parseSPA, cache.spa, fromDate, toDate),
 cashflow: get(parseCashFlow, cache.cashflow, fromDate, toDate),
 finance: get(parseFinance, cache.finance, fromDate, toDate),
 boards: get(parseBoards, cache.boards, fromDate, toDate),
 fo_yoy: get(parseFO, cache.fo, fromPrev, toPrev),
 fnb_yoy: get(parseFNB, cache.fnb, fromPrev, toPrev),
 spa_yoy: get(parseSPA, cache.spa, fromPrev, toPrev),
 boards_yoy: get(parseBoards, cache.boards, fromPrev, toPrev),
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

app.get('/api/debug-exp-cats', async (req, res) => {
 await ensureCache();
 const rows = cache.expenses || [];
 const cats = new Set();
 for (let i = 1; i < rows.length; i++) cats.add((rows[i][1]||'').trim());
 res.json({ categories: [...cats], totalRows: rows.length });
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

// ─── EXPENSES SHEET PARSER ───────────────────────────────────────────────────
// Parses "Expenses" sheet: MONTH (Mon-YY) | Categories | MONTHLY EXPENSES | YTD ...
// Returns { 'Jan-26': { 'Wages & Salaries': 9815034, ... }, 'Jan-25': {...}, ... }
function parseExpensesByMonth(rows) {
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const key  = (r[0]||'').trim();
    // Strip emoji / non-ASCII symbols from category names (e.g. "Entertainment ❗" → "Entertainment")
    const cat  = (r[1]||'').trim().replace(/[^ -À-ÿ]/g, '').trim();
    const val  = parseFloat((r[2]||'').toString().replace(/[^0-9.\-]/g,'')) || 0;
    if (!key || !cat) continue;
    if (!map[key]) map[key] = {};
    map[key][cat] = (map[key][cat] || 0) + val;
  }
  return map;
}

// Expense category definitions — sheet name → display label + colour
const EXP_CATS = [
  { sheet:'Wages & Salaries',      l:'Wages & Salaries',     c:'#e05252' },
  { sheet:'F&B Cost of Sale',      l:'F&B Cost of Sale',     c:'#e8a23a' },
  { sheet:'Utilities and Taxes',   l:'Utilities & Taxes',    c:'#3b82f6' },
  { sheet:'Loan',                  l:'Loan Repayments',      c:'#8b5cf6' },
  { sheet:'Hotel & Spa',           l:'Hotel & Spa Ops',      c:'#14b8a6' },
  { sheet:'Marketing',             l:'Marketing (incl.HU)',  c:'#c9a84c' },
  { sheet:'Overheads F&B',         l:'Overheads F&B',        c:'#06b6d4' },
  { sheet:'Entertainment',         l:'Entertainment',        c:'#f97316' },
  { sheet:'Repairs & Maintenance', l:'Repairs & Maint.',     c:'#4caf7d' },
  { sheet:'Insurance',             l:'Insurance',            c:'#6b7fa3' },
];

// ─── REVENUES SHEET PARSER ───────────────────────────────────────────────────
// Parses the "Revenues" sheet: Date (Mon-YY) | Department | Monthly Revenue | YTD ...
// Returns { 'Jan-26': { 'Hotel Accommodations': 9300000, ... }, 'Jan-25': {...}, ... }
function parseRevenuesByMonth(rows) {
  const map = {};
  const MONTH_MAP = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const key = (r[0]||'').trim();   // e.g. 'Jan-26'
    const dept = (r[1]||'').trim();  // e.g. 'Hotel Accommodations'
    const monthly = parseFloat((r[2]||'').toString().replace(/[^0-9.\-]/g,'')) || 0;
    if (!key || !dept) continue;
    if (!map[key]) map[key] = {};
    map[key][dept] = (map[key][dept] || 0) + monthly;
  }
  return map;
}

// ─── WIDE-FORMAT SHEET PARSERS ────────────────────────────────────────────────
// Source Markets sheet: MONTH | AL | XK | IT | ... (country codes as headers)
const SRC_COUNTRY = { AL:'Albania',XK:'Kosovo',IT:'Italy',DE:'Germany',FR:'France',GB:'UK',SE:'Sweden',BE:'Belgium',CH:'Switzerland',NL:'Netherlands',ES:'Spain',US:'USA',CZ:'Czech Rep.',PL:'Poland',HU:'Hungary',AT:'Austria',DK:'Denmark',OTHER:'Other' };
function parseSrcMarketsWide(rows) {
  const map = {};
  if (!rows || rows.length < 2) return map;
  const headers = (rows[0] || []).map(h => String(h||'').trim());
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const key = String(r[0]||'').trim();  // e.g. 'Jan-26'
    if (!key) continue;
    map[key] = {};
    for (let c = 1; c < headers.length; c++) {
      const code = headers[c];
      if (!code || code === 'TOTAL') continue;
      const name = SRC_COUNTRY[code] || code;
      const val = parseFloat(String(r[c]||'').replace(/[^0-9.\-]/g,'')) || 0;
      if (val > 0) map[key][name] = (map[key][name] || 0) + val;
    }
  }
  return map;
}

// Board sheet: MONTH | BB | HB | FB | ROMANTIC | ALL INCLUSIVE | Revenue
const BOARD_LABELS = { BB:'BB Package', HB:'HB Package', FB:'Full Board', ROMANTIC:'Romantic', 'ALL INCLUSIVE':'All Inclusive' };
function parseBoardWide(rows) {
  const map = {};
  if (!rows || rows.length < 2) return map;
  const headers = (rows[0] || []).map(h => String(h||'').trim());
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const key = String(r[0]||'').trim();
    if (!key) continue;
    map[key] = {};
    for (let c = 1; c < headers.length; c++) {
      const code = headers[c];
      if (!code || code === 'Revenue') continue;
      const name = BOARD_LABELS[code] || code;
      const val = parseFloat(String(r[c]||'').replace(/[^0-9.\-]/g,'')) || 0;
      if (val > 0) map[key][name] = (map[key][name] || 0) + val;
    }
  }
  return map;
}

const SRC_COLORS  = ['#c9a84c','#14b8a6','#3b82f6','#8b5cf6','#e8a23a','#f97316','#06b6d4','#ef4444','#10b981','#f472b6'];
const BOARD_COLORS = ['#c9a84c','#14b8a6','#8b5cf6','#ef4444'];

// Build sorted [{l,v,lv,c}] array from a category map for AY+LY month keys
function catArrayForKey(catMap, ayKey, lyKey, colorArr) {
  const ay = catMap[ayKey] || {};
  const ly = catMap[lyKey] || {};
  const allKeys = Array.from(new Set([...Object.keys(ay), ...Object.keys(ly)]));
  if (allKeys.length === 0) return null;
  const arr = allKeys.map((k, i) => ({
    l: k,
    v:  Math.round(ay[k] || 0),
    lv: Math.round(ly[k] || 0),
    c:  (colorArr || SRC_COLORS)[i % (colorArr||SRC_COLORS).length],
  })).filter(x => x.v > 0 || x.lv > 0).sort((a, b) => b.v - a.v);
  return arr.length > 0 ? arr : null;
}

// Aggregate per-category {l,v,lv,c} arrays across multiple months
function aggCatArrays(arrays) {
  const map = {};
  for (const arr of arrays) {
    if (!arr) continue;
    for (const x of arr) {
      if (!map[x.l]) map[x.l] = { l:x.l, v:0, lv:0, c:x.c };
      map[x.l].v  += x.v;
      map[x.l].lv += x.lv;
    }
  }
  const arr = Object.values(map).filter(x => x.v > 0 || x.lv > 0).sort((a,b)=>b.v-a.v);
  return arr.length > 0 ? arr : null;
}

// Get per-outlet LEK values from Revenues sheet for a given month key (e.g. 'Jan-26')
// Returns object with 8 outlet labels matching dashboard display
function revOutletsForKey(revMap, ayKey, lyKey) {
  const ay = revMap[ayKey] || {};
  const ly = revMap[lyKey] || {};
  const get = (obj, ...names) => names.reduce((a, n) => a + (obj[n] || 0), 0);
  // Department name aliases from the sheet
  const hotel_ay = get(ay, 'Hotel Accommodations');
  const hotel_ly = get(ly, 'Hotel Accommodations');
  const rest_ay  = get(ay, 'Flower Restaurant');
  const rest_ly  = get(ly, 'Flower Restaurant');
  const pool_ay  = get(ay, 'Pool Bar');
  const pool_ly  = get(ly, 'Pool Bar');
  const beach_ay = get(ay, 'Beach Bar');
  const beach_ly = get(ly, 'Beach Bar');
  const brutal_ay= get(ay, 'Garden Brutal');
  const brutal_ly= get(ly, 'Garden Brutal');
  const poolg_ay = get(ay, 'Pool Bar GArden', 'Pool Bar Garden');
  const poolg_ly = get(ly, 'Pool Bar GArden', 'Pool Bar Garden');
  const spaf_ay  = get(ay, 'Flower Spa Center');
  const spaf_ly  = get(ly, 'Flower Spa Center');
  const spag_ay  = get(ay, 'Garden Spa Center');
  const spag_ly  = get(ly, 'Garden Spa Center');
  const huse_ay  = get(ay, 'House Use');
  const huse_ly  = get(ly, 'House Use');
  const hasData  = (hotel_ay + rest_ay + pool_ay + brutal_ay + spaf_ay + spag_ay) > 0 ||
                   (hotel_ly + rest_ly + pool_ly + brutal_ly + spaf_ly + spag_ly) > 0;
  if (!hasData) return null;
  return [
    { l:'Hotel Revenue',    v: Math.round(hotel_ay), lv: Math.round(hotel_ly), c:'#14b8a6' },
    { l:'Flower Restaurant',v: Math.round(rest_ay),  lv: Math.round(rest_ly),  c:'#e8a23a' },
    { l:'Pool Bar',         v: Math.round(pool_ay),  lv: Math.round(pool_ly),  c:'#3b82f6' },
    { l:'Beach Bar',        v: Math.round(beach_ay), lv: Math.round(beach_ly), c:'#f59e0b' },
    { l:'Brutal Garden',    v: Math.round(brutal_ay),lv: Math.round(brutal_ly),c:'#ef4444' },
    { l:'Pool Bar Garden',  v: Math.round(poolg_ay), lv: Math.round(poolg_ly), c:'#8b5cf6' },
    { l:'Spa Flower',       v: Math.round(spaf_ay),  lv: Math.round(spaf_ly),  c:'#10b981' },
    { l:'Garden Spa',       v: Math.round(spag_ay),  lv: Math.round(spag_ly),  c:'#f472b6' },
    { l:'House Use',        v: Math.round(huse_ay),  lv: Math.round(huse_ly),  c:'#6b7fa3' },
  ];
}

// ─── FNB MONTHLY AGGREGATOR (for admin panel outlet breakdown) ───────────────
function fnbMonthSum(fnbRows, year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const end   = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  return aggregateRange(parseFNB, fnbRows, start, end);
}

// ─── ADMIN PANEL API ─────────────────────────────────────────────────────────
app.get('/api/admin', async (req, res) => {
 try {
 await ensureCache();
 // Executive Summary: all EUR, has 2026 + 2025 (LY) rows for rev/exp/occ/rn/adr
 const es = parseExecSummary(cache.exec || []);
 // P&L: budget figures only (ALL÷100=EUR)
 const bud = parsePLBudget(cache.pl || []);
 // Marketing cost sheet
 const mkt = parseMkt(cache.mkt || []);
 // Channel Performance: exact revenue per channel per month
 const ch = parseChannelPerf(cache.channels || []);

 const MONTH_NUMS = { jan:1, feb:2, mar:3, apr:4 };
 const MONTH_KEYS_AY = { jan:'Jan-26', feb:'Feb-26', mar:'Mar-26', apr:'Apr-26' };
 const MONTH_KEYS_LY = { jan:'Jan-25', feb:'Feb-25', mar:'Mar-25', apr:'Apr-25' };
 const result = {};

 // Parse Revenues sheet once
 const revMap = parseRevenuesByMonth(cache.revenues || []);
 // Parse Expenses sheet once
 const expMap = parseExpensesByMonth(cache.expenses || []);
 // Parse Source Markets and Board Mix sheets (wide format: MONTH | CountryCode | ...)
 const srcMap   = parseSrcMarketsWide(cache.srcmarkets || []);
 const boardMap = parseBoardWide(cache.boardmix   || []);

 for (const [key, m] of Object.entries(MONTH_NUMS)) {
 const e = es[key] || {};
 const ely = es[key+'_ly'] || {};
 const b = bud[key] || {};
 const k = mkt[key] || {};
 const cf = calcCFMonth(cache.cashflow || [], 2026, m) || {};
 // Expense categories from Expenses sheet (LEK)
 const expAY = expMap[MONTH_KEYS_AY[key]] || {};
 const expLY = expMap[MONTH_KEYS_LY[key]] || {};
 const expCatsLive = EXP_CATS.map(cat => ({
   l: cat.l,
   v: Math.round(expAY[cat.sheet] || 0),
   lv: Math.round(expLY[cat.sheet] || 0),
   c: cat.c,
 })).filter(cat => cat.v > 0 || cat.lv > 0);

 result[key] = {
 // Revenue & P&L — from Executive Summary (EUR)
 rev: e.rev != null ? e.rev : null,
 exp: e.exp != null ? e.exp : null,
 prf: e.prf != null ? e.prf : null,
 // Budget — from P&L sheet (ALL÷100=EUR)
 budRev: b.budRev || null,
 budExp: b.budExp || null,
 budPrf: b.budPrf || null,
 // Last Year — from Executive Summary 2025 rows
 lyRev: ely.rev != null ? ely.rev : null,
 lyExp: ely.exp != null ? ely.exp : null,
 lyPrf: ely.prf != null ? ely.prf : null,
 // Occupancy KPIs — from Executive Summary 2026
 rn: e.rn || null,
 rnAvail: e.rnAvail || null,
 occ: e.occ || null,
 adr: e.adr || null,
 revpar: e.revpar || null,
 // LY Occupancy — from Executive Summary 2025
 lyRn: ely.rn || null,
 lyOcc: ely.occ || null,
 lyAdr: ely.adr || null,
 // Labor / EBITDA extras
 laborCost: e.laborCost || null,
 lyLaborCost: ely.laborCost || null,
 ftes: e.ftes || null,
 houseUse: e.houseUse || null,
 // Marketing
 metaAds: k.metaAds || null,
 mktTotal: k.mktTotal || null,
 mktHU: k.mktHU || null,
 mktSpend: k.mktSpend || null,
 mktRev: k.mktRev || null,
 mktPct: k.mktPct || null,
 mktCashPct: k.mktCashPct || null,
 mktRoi: k.mktRoi || null,
 // Revenue by outlet — ALL VALUES IN LEK, sourced from Revenues sheet
 revOutlets: revOutletsForKey(revMap, MONTH_KEYS_AY[key], MONTH_KEYS_LY[key]),
 // Keep revCats for backward compat (channel/source charts still use lyRev)
 revCats: (e.roomsRev != null) ? [
 { l:'Rooms', v: Math.round(e.roomsRev || 0), lv: Math.round(ely.roomsRev || 0), c:'#14b8a6' },
 { l:'F&B', v: Math.round(e.fnbRev || 0), lv: Math.round(ely.fnbRev || 0), c:'#e8a23a' },
 { l:'Other', v: Math.round(e.otherRev || 0), lv: Math.round(ely.otherRev || 0), c:'#8b5cf6' },
 ] : null,
 // Expense categories — native LEK from Expenses sheet (with lv for LY)
 expCats: expCatsLive.length > 0 ? expCatsLive : null,
 // Channel mix — exact from Channel Performance sheet (AY + LY)
 chData: ch[key] || null,
 chDataLY: ch[key+'_ly'] || null,
 // Source Markets — country breakdown (EUR, AY + LY)
 srcData:   catArrayForKey(srcMap,   MONTH_KEYS_AY[key], MONTH_KEYS_LY[key], SRC_COLORS),
 // Board Mix — board type revenue (EUR, AY + LY)
 boardData: catArrayForKey(boardMap, MONTH_KEYS_AY[key], MONTH_KEYS_LY[key], BOARD_COLORS),
 // Cash Flow — ALL from Daily Cash Flow sheet only
 cfHyrje26: cf.cfHyrje26 || null,
 cfDalje26: cf.cfDalje26 || null,
 cfDaljeItems: cf.cfDaljeItems || null,
 cfHyrjeALL_eur: cf.cfHyrjeALL_eur || null,
 cfHyrjeEUR_eur: cf.cfHyrjeEUR_eur || null,
 cfLekPct: cf.cfLekPct || null,
 };
 }

 // YTD aggregates
 const keys = ['jan','feb','mar','apr'];
 const sum = (f) => keys.reduce((a,k) => a + (result[k][f] || 0), 0);
 const avg = (f) => {
 const v = keys.filter(k=>result[k][f]!=null).map(k=>result[k][f]);
 return v.length ? Math.round(v.reduce((a,x)=>a+x,0)/v.length*100)/100 : null;
 };
 const allCfALL = keys.reduce((a,k)=>(result[k].cfHyrjeALL_eur||0)+a,0);
 const allCfEUR = keys.reduce((a,k)=>(result[k].cfHyrjeEUR_eur||0)+a,0);

 result.all = {
 rev: sum('rev'), budRev: sum('budRev'),
 exp: sum('exp'), budExp: sum('budExp'),
 prf: sum('prf'), budPrf: sum('budPrf'),
 lyRev: sum('lyRev'), lyExp: sum('lyExp'), lyPrf: sum('lyPrf'),
 rn: sum('rn'), rnAvail: sum('rnAvail'),
 occ: avg('occ'), adr: avg('adr'),
 lyOcc: avg('lyOcc'), lyAdr: avg('lyAdr'), lyRn: sum('lyRn'),
 laborCost: sum('laborCost'), lyLaborCost: sum('lyLaborCost'),
 metaAds: sum('metaAds'), mktTotal: sum('mktTotal'),
 mktHU: sum('mktHU'), mktSpend: sum('mktSpend'),
 mktRev: sum('mktRev'), mktPct: avg('mktPct'),
 mktCashPct: avg('mktCashPct'), mktRoi: avg('mktRoi'),
 // Revenue by outlet — YTD sum across months (9 outlets incl. Beach Bar & House Use)
 revOutlets: (() => {
   const outlets = ['Hotel Revenue','Flower Restaurant','Pool Bar','Beach Bar','Brutal Garden','Pool Bar Garden','Spa Flower','Garden Spa','House Use'];
   const any = keys.some(k => result[k].revOutlets != null);
   if (!any) return null;
   return outlets.map(l => {
     const v  = keys.reduce((a,k)=>{ const ro=result[k].revOutlets; const item=ro&&ro.find(x=>x.l===l); return a+(item?item.v:0); }, 0);
     const lv = keys.reduce((a,k)=>{ const ro=result[k].revOutlets; const item=ro&&ro.find(x=>x.l===l); return a+(item?item.lv:0); }, 0);
     const firstKey = keys.find(k=>result[k].revOutlets);
     const c  = firstKey ? ((result[firstKey].revOutlets||[]).find(x=>x.l===l)||{}).c || '#a8bcda' : '#a8bcda';
     return { l, v, lv, c };
   });
 })(),
 // Expense categories YTD — sum per category across months
 expCats: (() => {
   const any = keys.some(k => result[k].expCats != null);
   if (!any) return null;
   return EXP_CATS.map(cat => {
     const v  = keys.reduce((a,k)=>{ const ec=result[k].expCats; const item=ec&&ec.find(x=>x.l===cat.l); return a+(item?item.v:0); }, 0);
     const lv = keys.reduce((a,k)=>{ const ec=result[k].expCats; const item=ec&&ec.find(x=>x.l===cat.l); return a+(item?item.lv:0); }, 0);
     return { l:cat.l, v, lv, c:cat.c };
   }).filter(x => x.v > 0 || x.lv > 0);
 })(),
 // Revenue by dept — kept for backward compat
 revCats: (() => {
 const depts = ['Rooms','F&B','Other'];
 const colors = { 'Rooms':'#14b8a6', 'F&B':'#e8a23a', 'Other':'#8b5cf6' };
 const any = keys.some(k => result[k].revCats != null);
 if (!any) return null;
 return depts.map(dept => {
 const v = keys.reduce((a,k)=>{ const rc=result[k].revCats; const item=rc&&rc.find(x=>x.l===dept); return a+(item?item.v:0); }, 0);
 const lv = keys.reduce((a,k)=>{ const rc=result[k].revCats; const item=rc&&rc.find(x=>x.l===dept); return a+(item?item.lv:0); }, 0);
 return { l:dept, v, lv, c: colors[dept] };
 });
 })(),
 chData: ch.all || null,
 chDataLY: ch.all_ly || null,
 // Source Markets YTD — aggregate per-month data
 srcData:   aggCatArrays(keys.map(k => result[k].srcData)),
 // Board Mix YTD — aggregate per-month data
 boardData: aggCatArrays(keys.map(k => result[k].boardData)),
 cfHyrje26: sum('cfHyrje26'),
 cfDalje26: sum('cfDalje26'),
 cfDaljeItems: (() => {
 const map = {};
 for (const k of keys) {
 const items = result[k].cfDaljeItems;
 if (!items) continue;
 for (const { l, v } of items) map[l] = (map[l]||0) + v;
 }
 const arr = Object.entries(map).filter(([,v])=>v>0).map(([l,v])=>({l,v})).sort((a,b)=>b.v-a.v);
 return arr.length > 0 ? arr : null;
 })(),
 cfHyrjeALL_eur: allCfALL > 0 ? allCfALL : null,
 cfHyrjeEUR_eur: allCfEUR > 0 ? allCfEUR : null,
 cfLekPct: (allCfALL+allCfEUR) > 0 ? Math.round(allCfALL/(allCfALL+allCfEUR)*100) : null,
 };

 result._ts = new Date().toISOString();
 res.json(result);
 } catch(e) {
 console.error('[FLOW] /api/admin error:', e.message);
 res.status(500).json({ error: e.message });
 }
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
// HMS state persistence
const fs_hms = require('fs');
const HMS_FILE = require('fs').existsSync('/data') ? '/data/hms_state.json' : require('path').join(__dirname, 'hms_state.json');
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
const fs_sales = require('fs');
const path_sales = require('path');
const SALES_FILE = path_sales.join(__dirname, 'sales_state.json');
const PREV_FILE = path_sales.join(__dirname, 'sales_prev.json');

let salesState = null;
let prevSales = { tR: null, tN: null, filename: null, ts: null };

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

// ─── MONTHLY MANAGEMENT REPORT ────────────────────────────────────────────────
app.post('/api/send-monthly-report', async function(req, res) {
 const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'Rep26';
 if ((req.body && req.body.token) !== ADMIN_TOKEN) {
 return res.status(403).json({ error: 'Nuk keni leje.' });
 }

 const { periodLabel, kpis, channels, insights: rawInsights } = req.body || {};
 if (!periodLabel || !kpis) return res.status(400).json({ error: 'Të dhëna mungojnë.' });
 // Normalise insights — accept both old array [{type,title,para}] and new {pozitive,problematika,sugjerime,planifikim}
 let insights;
 if (Array.isArray(rawInsights)) {
   const m = { pozitive:'', problematika:'', sugjerime:'', planifikim:'' };
   (rawInsights || []).forEach(box => {
     const txt = (box.para || '').replace(/^[•\-\s]*/gm,'').trim();
     if(box.type==='good')   m.pozitive     += (m.pozitive?'  ':'')+txt;
     else if(box.type==='danger') m.problematika += (m.problematika?'  ':'')+txt;
     else if(box.type==='warn')   m.sugjerime    += (m.sugjerime?'  ':'')+txt;
     else if(box.type==='info')   m.planifikim   += (m.planifikim?'  ':'')+txt;
   });
   insights = m;
 } else {
   insights = rawInsights || {};
 }

 try {
 // ── Helpers ────────────────────────────────────────────────────────────────
 const fE  = (v) => v != null ? '&euro;' + Math.abs(Math.round(v)).toLocaleString('de-DE') : '&mdash;';
 const fK  = (v) => { if(v==null) return '&mdash;'; const a=Math.abs(Math.round(v/1000)); return (v<0?'-':'')+'&euro;'+a+'k'; };
 const fP  = (v) => v != null ? v.toFixed(1) + '%' : '&mdash;';
 const fN  = (v) => v != null ? Math.round(v).toLocaleString('de-DE') : '&mdash;';
 const arrowTxt = (a, b) => { if(a==null||b==null||b===0) return ''; const d=((a-b)/Math.abs(b)*100).toFixed(1); return (a>=b?'&#9650;':'&#9660;')+' '+Math.abs(d)+'%'; };
 const arrowCol = (a,b,inv) => { if(a==null||b==null) return '#7a94b0'; const good=inv?(a<=b):(a>=b); return good?'#4caf7d':'#e05252'; };
 const diffStr = (a,b,inv) => { if(a==null||b==null) return ''; const d=a-b; const good=inv?(d<=0):(d>=0); const col=good?'#4caf7d':'#e05252'; const sign=d>=0?'+':''; return '<font color="'+col+'"><b>'+sign+fK(d)+'</b></font>'; };
 // Table-based progress bar (works in all email clients)
 const pBar = (pct, col) => {
   const w = Math.min(100, Math.max(2, Math.round(pct)));
   const r = 100 - w;
   return '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>'
     +'<td width="'+w+'%" bgcolor="'+col+'" style="height:5px;font-size:0;line-height:0;">&nbsp;</td>'
     +(r>0?'<td width="'+r+'%" bgcolor="#0d2040" style="height:5px;font-size:0;line-height:0;">&nbsp;</td>':'')
     +'</tr></table>';
 };

 // ── Channel top 5 ──────────────────────────────────────────────────────────
 const chTotal = channels ? channels.reduce((s,x)=>s+x.v,0) : 0;
 const chTop = (channels||[]).slice().sort((a,b)=>b.v-a.v).slice(0,5);
 const chColors = ['#c9a84c','#4caf7d','#3b82f6','#e8a23a','#8b5cf6'];

 // (insight section configs now defined inline before html template)

 const nowStr = new Date().toLocaleString('sq-AL',{timeZone:'Europe/Tirane',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
 const dateShort = new Date().toLocaleDateString('sq-AL',{timeZone:'Europe/Tirane',day:'2-digit',month:'long',year:'numeric'});

 // Pre-compute values
 const revPct = kpis.budRev ? kpis.rev/kpis.budRev*100 : null;
 const expPct = kpis.budExp ? kpis.exp/kpis.budExp*100 : null;
 const prfOk  = (kpis.prf||0) >= 0;

 // ── Insight sections config ──────────────────────────────────────────────────
 const insSections = [
   { key:'pozitive',    label:'Cfare shkoi mire',           c:'#4caf7d', bg:'#0d1c10', bd:'#0f3c1a' },
   { key:'problematika',label:'Ku u vune re problematika',  c:'#e05252', bg:'#1c0d0d', bd:'#4a1010' },
   { key:'sugjerime',  label:'Sugjerime per permiresim',    c:'#e8a23a', bg:'#1c1408', bd:'#4a3408' },
   { key:'planifikim', label:'Masa & Planifikim',           c:'#5b9bd5', bg:'#0d1424', bd:'#0f2a50' },
 ];
 const insData = insights || {};

 // ── EMAIL HTML — single-column outer card, nested tables for multi-col sections
 const html = `<!DOCTYPE html>
<html lang="sq" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Raport Mujor &middot; ${periodLabel}</title>
</head>
<body style="margin:0;padding:0;background-color:#05111f;" bgcolor="#05111f">

<!-- OUTER WRAPPER -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#05111f">
<tr><td align="center" style="padding:24px 10px 32px;">

<!-- CARD 600px — strictly single column -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;">

<!--== GOLD TOP BAR ==-->
<tr><td bgcolor="#c9a84c" height="4" style="font-size:0;line-height:0;">&nbsp;</td></tr>

<!--== HEADER ==-->
<tr><td bgcolor="#071629" style="padding:28px 28px 22px;border-left:2px solid #1a3a5c;border-right:2px solid #1a3a5c;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td style="vertical-align:top;" width="60%">
      <p style="margin:0 0 8px 0;font-size:9px;font-weight:bold;color:#c9a84c;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">FLOWER HOTELS &amp; RESORTS &nbsp;&#183;&nbsp; GOLEM, SHQIPERI</p>
      <p style="margin:0 0 6px 0;font-size:26px;font-weight:bold;color:#ffffff;line-height:1.1;font-family:Arial,sans-serif;">Raport Mujor</p>
      <p style="margin:0 0 5px 0;font-size:24px;font-weight:bold;color:#c9a84c;line-height:1;font-family:Arial,sans-serif;">${periodLabel}</p>
      <p style="margin:0;font-size:10px;color:#4a6888;font-family:Arial,sans-serif;">${dateShort} &nbsp;&#183;&nbsp; Konfidencial</p>
    </td>
    <td style="vertical-align:top;text-align:right;" width="40%">
      <table border="0" cellpadding="0" cellspacing="0" align="right">
      <tr><td bgcolor="#0c1e38" style="padding:14px 18px;text-align:center;border:1px solid #2a5070;">
        <p style="margin:0 0 3px 0;font-size:8px;font-weight:bold;color:#c9a84c;letter-spacing:2.5px;font-family:Arial,sans-serif;text-transform:uppercase;">FITIMI NETO &middot; NOP</p>
        <p style="margin:0 0 3px 0;font-size:26px;font-weight:bold;line-height:1;font-family:Arial,sans-serif;${prfOk?'color:#4caf7d;':'color:#e05252;'}">${fK(kpis.prf)}</p>
        <p style="margin:0;font-size:9px;color:#4a6888;font-family:Arial,sans-serif;">Buxheti ${fK(kpis.budPrf)}</p>
      </td></tr>
      </table>
    </td>
  </tr>
  </table>
</td></tr>

<!--== GOLD STRIPE ==-->
<tr><td bgcolor="#c9a84c" height="2" style="font-size:0;line-height:0;">&nbsp;</td></tr>

<!--== 3 HERO KPIs (nested inner table) ==-->
<tr><td bgcolor="#071629" style="padding:0;border-left:2px solid #1a3a5c;border-right:2px solid #1a3a5c;border-bottom:1px solid #0d2040;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td bgcolor="#071629" width="33%" style="padding:18px 12px 18px 20px;vertical-align:top;border-right:1px solid #0d2040;">
      <p style="margin:0 0 4px 0;font-size:8px;font-weight:bold;color:#4a6888;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">TE ARDHURAT</p>
      <p style="margin:0 0 3px 0;font-size:24px;font-weight:bold;color:#4caf7d;line-height:1;font-family:Arial,sans-serif;">${fK(kpis.rev)}</p>
      <p style="margin:0 0 3px 0;font-size:10px;color:#4a6888;font-family:Arial,sans-serif;">Buxheti ${fK(kpis.budRev)}</p>
      ${revPct!=null?pBar(revPct,'#4caf7d'):''}
      <p style="margin:3px 0 0;font-size:10px;font-family:Arial,sans-serif;">${diffStr(kpis.rev,kpis.budRev,false)} vs buxh. &nbsp;<font color="${arrowCol(kpis.rev,kpis.lyRev,false)}">${arrowTxt(kpis.rev,kpis.lyRev)} VK</font></p>
    </td>
    <td bgcolor="#060f1c" width="33%" style="padding:18px 12px;vertical-align:top;border-right:1px solid #0d2040;">
      <p style="margin:0 0 4px 0;font-size:8px;font-weight:bold;color:#4a6888;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">SHPENZIMET</p>
      <p style="margin:0 0 3px 0;font-size:24px;font-weight:bold;color:#e05252;line-height:1;font-family:Arial,sans-serif;">${fK(kpis.exp)}</p>
      <p style="margin:0 0 3px 0;font-size:10px;color:#4a6888;font-family:Arial,sans-serif;">Buxheti ${fK(kpis.budExp)}</p>
      ${expPct!=null?pBar(Math.min(expPct,120),'#e05252'):''}
      <p style="margin:3px 0 0;font-size:10px;font-family:Arial,sans-serif;">${diffStr(kpis.exp,kpis.budExp,true)} vs buxh. &nbsp;<font color="${arrowCol(kpis.exp,kpis.lyExp,true)}">${arrowTxt(kpis.exp,kpis.lyExp)} VK</font></p>
    </td>
    <td bgcolor="#071629" width="34%" style="padding:18px 20px 18px 12px;vertical-align:top;">
      <p style="margin:0 0 4px 0;font-size:8px;font-weight:bold;color:#4a6888;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">OKUPANCA</p>
      <p style="margin:0 0 3px 0;font-size:24px;font-weight:bold;color:#c9a84c;line-height:1;font-family:Arial,sans-serif;">${fP(kpis.occ)}</p>
      <p style="margin:0 0 3px 0;font-size:10px;color:#4a6888;font-family:Arial,sans-serif;">VK ${fP(kpis.lyOcc)}</p>
      ${kpis.occ!=null?pBar(kpis.occ,'#c9a84c'):''}
      <p style="margin:3px 0 0;font-size:10px;font-family:Arial,sans-serif;"><font color="${arrowCol(kpis.occ,kpis.lyOcc,false)}">${arrowTxt(kpis.occ,kpis.lyOcc)} VK</font> &nbsp;<font color="#4a6888;">&#183; ${fN(kpis.rn)} nete</font></p>
    </td>
  </tr>
  </table>
</td></tr>

<!--== 3 SECONDARY KPIs (nested inner table) ==-->
<tr><td bgcolor="#050d1a" style="padding:0;border-left:2px solid #1a3a5c;border-right:2px solid #1a3a5c;border-bottom:1px solid #0d2040;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td bgcolor="#050d1a" width="33%" style="padding:12px 12px 12px 20px;vertical-align:top;border-right:1px solid #0d2040;">
      <p style="margin:0 0 2px 0;font-size:8px;font-weight:bold;color:#4a6888;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">ADR</p>
      <p style="margin:0 0 2px 0;font-size:18px;font-weight:bold;color:#c9a84c;font-family:Arial,sans-serif;">${fE(kpis.adr)}</p>
      <p style="margin:0;font-size:9px;font-family:Arial,sans-serif;"><font color="${arrowCol(kpis.adr,kpis.lyAdr,false)}">${arrowTxt(kpis.adr,kpis.lyAdr)}</font> <font color="#4a6888;">VK ${fE(kpis.lyAdr)}</font></p>
    </td>
    <td bgcolor="#040c18" width="33%" style="padding:12px;vertical-align:top;border-right:1px solid #0d2040;">
      <p style="margin:0 0 2px 0;font-size:8px;font-weight:bold;color:#4a6888;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">NETE TE SHITURA</p>
      <p style="margin:0 0 2px 0;font-size:18px;font-weight:bold;color:#3b82f6;font-family:Arial,sans-serif;">${fN(kpis.rn)}</p>
      <p style="margin:0;font-size:9px;font-family:Arial,sans-serif;"><font color="${arrowCol(kpis.rn,kpis.lyRn,false)}">${arrowTxt(kpis.rn,kpis.lyRn)}</font> <font color="#4a6888;">VK ${fN(kpis.lyRn)}</font></p>
    </td>
    <td bgcolor="#050d1a" width="34%" style="padding:12px 20px 12px 12px;vertical-align:top;">
      <p style="margin:0 0 2px 0;font-size:8px;font-weight:bold;color:#4a6888;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">REVPAR</p>
      <p style="margin:0 0 2px 0;font-size:18px;font-weight:bold;color:#8b5cf6;font-family:Arial,sans-serif;">${fE(kpis.revpar)}</p>
      <p style="margin:0;font-size:9px;color:#4a6888;font-family:Arial,sans-serif;">ADR ${fE(kpis.adr)} &middot; Occ ${fP(kpis.occ)}</p>
    </td>
  </tr>
  </table>
</td></tr>

<!--== CASH FLOW (nested inner table) ==-->
<tr><td bgcolor="#040a17" style="padding:0;border-left:2px solid #1a3a5c;border-right:2px solid #1a3a5c;border-bottom:1px solid #0d2040;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td bgcolor="#040a17" colspan="2" style="padding:14px 20px 6px;">
      <p style="margin:0;font-size:8px;font-weight:bold;color:#c9a84c;letter-spacing:2.5px;font-family:Arial,sans-serif;text-transform:uppercase;">CASH FLOW (Muaji)</p>
    </td>
  </tr>
  <tr>
    <td bgcolor="#071629" width="50%" style="padding:10px 12px 12px 20px;vertical-align:top;border-right:1px solid #0d2040;">
      <p style="margin:0 0 2px 0;font-size:8px;font-weight:bold;color:#4a6888;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">CASH IN</p>
      <p style="margin:0 0 2px 0;font-size:20px;font-weight:bold;color:#4caf7d;font-family:Arial,sans-serif;">${kpis.cfHyrje26!=null?fK(kpis.cfHyrje26):'&mdash;'}</p>
      <p style="margin:0;font-size:9px;color:#4a6888;font-family:Arial,sans-serif;">EUR ${kpis.cfHyrjeEUR_eur!=null?fE(kpis.cfHyrjeEUR_eur):'&mdash;'}</p>
    </td>
    <td bgcolor="#060f1c" width="50%" style="padding:10px 20px 12px 12px;vertical-align:top;">
      <p style="margin:0 0 2px 0;font-size:8px;font-weight:bold;color:#4a6888;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">CASH OUT</p>
      <p style="margin:0 0 2px 0;font-size:20px;font-weight:bold;color:#e05252;font-family:Arial,sans-serif;">${kpis.cfDalje26!=null?fK(kpis.cfDalje26):'&mdash;'}</p>
      <p style="margin:0;font-size:9px;color:#4a6888;font-family:Arial,sans-serif;">${kpis.cfDalje26!=null&&kpis.cfHyrje26!=null?'Net: '+fK(kpis.cfHyrje26-kpis.cfDalje26):'Te dhena ne pritje'}</p>
    </td>
  </tr>
  </table>
</td></tr>

<!--== GOLD DIVIDER ==-->
<tr><td bgcolor="#c9a84c" height="3" style="font-size:0;line-height:0;">&nbsp;</td></tr>

<!--== CHANNEL MIX ==-->
<tr><td bgcolor="#071629" style="padding:22px 26px;border-left:2px solid #1a3a5c;border-right:2px solid #1a3a5c;">
  <p style="margin:0 0 14px 0;font-size:9px;font-weight:bold;color:#c9a84c;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">MIXI I KANALEVE &mdash; TE ARDHURA DHOMASH</p>
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
  <tr>
    <td width="38%" style="padding:0 0 8px;border-bottom:1px solid #102030;"><p style="margin:0;font-size:8px;font-weight:bold;color:#2a4860;letter-spacing:1.5px;font-family:Arial,sans-serif;text-transform:uppercase;">KANALI</p></td>
    <td width="26%" style="padding:0 0 8px;border-bottom:1px solid #102030;text-align:right;"><p style="margin:0;font-size:8px;font-weight:bold;color:#2a4860;letter-spacing:1.5px;font-family:Arial,sans-serif;text-transform:uppercase;">TE ARDHURA</p></td>
    <td width="36%" style="padding:0 0 8px 14px;border-bottom:1px solid #102030;"><p style="margin:0;font-size:8px;font-weight:bold;color:#2a4860;letter-spacing:1.5px;font-family:Arial,sans-serif;text-transform:uppercase;">PJESA</p></td>
  </tr>
  ${chTop.map((x,i)=>{
    const pct = chTotal>0 ? (x.v/chTotal*100) : 0;
    const col = chColors[i]||'#6b8aab';
    const barW = Math.max(2,Math.round(pct));
    const barR = 100 - barW;
    return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #0a1c2e;"><font color="#c8d4e8" style="font-size:11px;font-weight:bold;font-family:Arial,sans-serif;">&#9646; ${x.l}</font></td>
    <td style="padding:8px 0;border-bottom:1px solid #0a1c2e;text-align:right;"><font color="#ffffff" style="font-size:11px;font-weight:bold;font-family:Arial,sans-serif;">${fE(x.v)}</font></td>
    <td style="padding:8px 0 8px 14px;border-bottom:1px solid #0a1c2e;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td width="72%" style="vertical-align:middle;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td bgcolor="${col}" width="${barW}%" height="5" style="font-size:0;line-height:0;">&nbsp;</td>
            ${barR>0?'<td bgcolor="#0d2040" width="'+barR+'%" height="5" style="font-size:0;line-height:0;">&nbsp;</td>':''}
          </tr></table>
        </td>
        <td width="28%" style="padding-left:6px;white-space:nowrap;vertical-align:middle;"><font color="${col}" style="font-size:11px;font-weight:bold;font-family:Arial,sans-serif;">${pct.toFixed(1)}%</font></td>
      </tr></table>
    </td>
    </tr>`;
  }).join('')}
  ${chTotal>0?`<tr><td colspan="3" style="padding:10px 0 0;"><font color="#4a6888" style="font-size:10px;font-family:Arial,sans-serif;">Total: </font><font color="#c9a84c" style="font-size:12px;font-weight:bold;font-family:Arial,sans-serif;">${fE(chTotal)}</font></td></tr>`:''}
  </table>
</td></tr>

<!--== NAVY DIVIDER ==-->
<tr><td bgcolor="#1a3a5c" height="1" style="font-size:0;line-height:0;">&nbsp;</td></tr>

<!--== KONKLUZIONE MENAXHERIALE — 4 paragraphs ==-->
<tr><td bgcolor="#060f1c" style="padding:22px 26px;border-left:2px solid #1a3a5c;border-right:2px solid #1a3a5c;">
  <p style="margin:0 0 16px 0;font-size:9px;font-weight:bold;color:#c9a84c;letter-spacing:3px;font-family:Arial,sans-serif;text-transform:uppercase;">KONKLUZIONE MENAXHERIALE &mdash; ${periodLabel}</p>
  ${insSections.map(s=>{
    const text = insData[s.key] || '';
    if(!text) return '';
    return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:12px;">
    <tr>
      <td bgcolor="${s.bg}" style="border:1px solid ${s.bd};padding:0;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td bgcolor="${s.c}" width="4" style="font-size:0;line-height:0;">&nbsp;</td>
          <td style="padding:13px 15px;">
            <p style="margin:0 0 8px 0;font-size:8px;font-weight:bold;color:${s.c};letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">${s.label}</p>
            <p style="margin:0;font-size:12px;color:#9ab8d0;line-height:1.7;font-family:Arial,sans-serif;">${text}</p>
          </td>
        </tr>
        </table>
      </td>
    </tr>
    </table>`;
  }).join('')}
</td></tr>

<!--== GOLD BOTTOM BAR ==-->
<tr><td bgcolor="#c9a84c" height="4" style="font-size:0;line-height:0;">&nbsp;</td></tr>

<!--== FOOTER ==-->
<tr><td bgcolor="#040a14" style="padding:14px 0;text-align:center;">
  <p style="margin:0 0 4px 0;font-size:10px;font-weight:bold;color:#c9a84c;letter-spacing:2px;font-family:Arial,sans-serif;text-transform:uppercase;">FLOWER HOTELS &amp; RESORTS &nbsp;&#183;&nbsp; FLOW Dashboard</p>
  <p style="margin:0;font-size:9px;color:#2a4460;font-family:Arial,sans-serif;">Gjeneruar automatikisht &nbsp;&#183;&nbsp; ${nowStr} &nbsp;&#183;&nbsp; Konfidencial</p>
</td></tr>

</table><!-- /CARD -->
</td></tr>
</table><!-- /OUTER -->
</body></html>`;

 const nodemailer = require('nodemailer');
 const transporter = nodemailer.createTransport({
 service: 'gmail',
 auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
 });

 const defaultTo = 'redathana@gmail.com, ernestcaci@gmail.com, Financa@hotel-flower.com, info@hotel-flower.com, pandiolakerthi@gmail.com, rinacaci@gmail.com';
 const toField = req.body.testTo ? req.body.testTo : defaultTo;
 await transporter.sendMail({
 from: `"Flower Hotels — FLOW" <${process.env.EMAIL_USER}>`,
 to: toField,
 subject: `${req.body.testTo ? '[TEST] ' : ''}FLOWER HOTELS — Raport Mujor Managerial · ${periodLabel} · ${new Date().toLocaleDateString('sq-AL',{day:'2-digit',month:'long',year:'numeric'})}`,
 html
 });

 console.log('[FLOW] Monthly report sent:', periodLabel);
 res.json({ ok: true, message: 'Raporti Mujor u dërgua.' });

 } catch(e) {
 console.error('[FLOW] Monthly report error:', e.message);
 res.status(500).json({ error: e.message });
 }
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
 const fo = parseFO(cache.fo, date);
 const fnb = parseFNB(cache.fnb, date);
 const spa = parseSPA(cache.spa, date);
 const cf = parseCashFlow(cache.cashflow, date);
 const fin = parseFinance(cache.finance, date);
 const boards = parseBoards(cache.boards, date);
 const prevDate = (parseInt(date.slice(0,4))-1) + date.slice(4);
 const fo_yoy = parseFO(cache.fo, prevDate);
 const fnb_yoy = parseFNB(cache.fnb, prevDate);
 const spa_yoy = parseSPA(cache.spa, prevDate);
 const prevDayObj = new Date(date + 'T00:00:00');
 prevDayObj.setDate(prevDayObj.getDate() - 1);
 const prevDayStr = prevDayObj.toISOString().slice(0,10);
 const fo_prev = parseFO(cache.fo, prevDayStr);
 const fnb_prev = parseFNB(cache.fnb, prevDayStr);
 const EH = 100, EC = 95, TR = 110;
 const hotelLek = (fo.revenue_eur || 0) * EH;
 const flowerRestLek = fnb.flower || 0;
 const brutalLek = fnb.brutal || 0;
 const poolBarLek = fnb.pool_bar || 0;
 const poolGardenLek = fnb.pool_garden || 0;
 const beachBarLek = fnb.beach_bar || 0;
 const houseUseLek = fnb.house_use || 0;
 const spaLek = spa.revenues || 0;
 const totalRevLek = hotelLek + flowerRestLek + brutalLek + poolBarLek + poolGardenLek + beachBarLek + houseUseLek + spaLek;
 const lyHotelLek = (fo_yoy.revenue_eur || 0) * EH;
 const lyFlowerLek = fnb_yoy.flower || 0;
 const lyBrutalLek = fnb_yoy.brutal || 0;
 const lyPoolBarLek = fnb_yoy.pool_bar || 0;
 const lyPoolGardenLek = fnb_yoy.pool_garden || 0;
 const lyBeachBarLek = fnb_yoy.beach_bar || 0;
 const lyHouseUseLek = fnb_yoy.house_use || 0;
 const lySpaLek = spa_yoy.revenues || 0;
 const lyTotalRevLek = lyHotelLek + lyFlowerLek + lyBrutalLek + lyPoolBarLek + lyPoolGardenLek + lyBeachBarLek + lyHouseUseLek + lySpaLek;
 const prevDayRevLek = ((fo_prev.revenue_eur||0)*EH) + (fnb_prev.flower||0) + (fnb_prev.brutal||0) + (fnb_prev.pool_bar||0) + (fnb_prev.pool_garden||0) + (fnb_prev.beach_bar||0) + (fnb_prev.house_use||0);
 const startOfMonth = date.slice(0,8) + '01';
 const fo_mtd  = aggregateRange(parseFO,      cache.fo,      startOfMonth, date);
 const fnb_mtd = aggregateRange(parseFNB,     cache.fnb,     startOfMonth, date);
 const spa_mtd = aggregateRange(parseSPA,     cache.spa,     startOfMonth, date);
 const fin_mtd = aggregateRange(parseFinance, cache.finance, startOfMonth, date);
 const mtdHotelLek      = (fo_mtd.revenue_eur||0) * EH;
 const mtdFlowerLek     = fnb_mtd.flower      || 0;
 const mtdBrutalLek     = fnb_mtd.brutal      || 0;
 const mtdPoolBarLek    = fnb_mtd.pool_bar    || 0;
 const mtdPoolGardenLek = fnb_mtd.pool_garden || 0;
 const mtdBeachBarLek   = fnb_mtd.beach_bar   || 0;
 const mtdHouseUseLek   = fnb_mtd.house_use   || 0;
 const mtdSpaLek        = spa_mtd.revenues    || 0;
 const mtdTotalRevLek   = mtdHotelLek + mtdFlowerLek + mtdBrutalLek + mtdPoolBarLek + mtdPoolGardenLek + mtdBeachBarLek + mtdHouseUseLek + mtdSpaLek;
 const ark = cf.arketimet || {};
 const pag = cf.pagesat || {};
 function nv(v){ return Number(v)||0; }
 const cfInLek = nv(ark.non_cash_lek) + nv(ark.reception_cash_lek) + nv(ark.fnb_cash_lek) + nv(ark.mice_lek)
 + (nv(ark.non_cash_euro) + nv(ark.reception_cash_euro) + nv(ark.allotment) + nv(ark.itaka) + nv(ark.mice_euro)) * EC;
 const cfOutLek = nv(pag.paga) + nv(pag.taxes) + nv(pag.loan_lek) + nv(pag.house_use) + nv(pag.furnitore_cash)
 + nv(pag.furnitore_bank_lek) + nv(pag.investime_banke_lek) + nv(pag.investime_cash)
 + (nv(pag.loan_euro) + nv(pag.furnitore_bank_euro) + nv(pag.investime_banke_euro)) * EC;
 const cfNetLek = cfInLek - cfOutLek;
 const occ = fo.occupancy_pct || 0;
 const lyOcc = fo_yoy.occupancy_pct || 0;
 const rooms = fo.rooms_occupied || 0;
 const adr = rooms > 0 ? Math.round(hotelLek / rooms) : 0;
 const revpar = Math.round(hotelLek / TR);
 const lyAdr = (fo_yoy.rooms_occupied||0) > 0 ? Math.round(lyHotelLek / (fo_yoy.rooms_occupied||1)) : 0;
 const lyRevpar = Math.round(lyHotelLek / TR);
 const expItems = [
 { name:'Beach Bar',                  lek: nv(fin.beach_bar),    mtdLek: nv(fin_mtd.beach_bar) },
 { name:'Flower Restorant',           lek: nv(fin.flower),       mtdLek: nv(fin_mtd.flower) },
 { name:'Pool Bar',                   lek: nv(fin.pool_bar),     mtdLek: nv(fin_mtd.pool_bar) },
 { name:'Brutal',                     lek: nv(fin.brutal),       mtdLek: nv(fin_mtd.brutal) },
 { name:'Pool Bar Garden',            lek: nv(fin.pool_garden),  mtdLek: nv(fin_mtd.pool_garden) },
 { name:'Bufe',                       lek: nv(fin.bufe),         mtdLek: nv(fin_mtd.bufe) },
 { name:'Overheads F&B',              lek: nv(fin.overheads_fnb),mtdLek: nv(fin_mtd.overheads_fnb) },
 { name:'Magazina Qendrore',          lek: nv(fin.mag_qendrore), mtdLek: nv(fin_mtd.mag_qendrore) },
 { name:'Operacionale Mikse',         lek: nv(fin.operacionale), mtdLek: nv(fin_mtd.operacionale) },
 { name:'SPA',                        lek: nv(fin.spa),          mtdLek: nv(fin_mtd.spa) },
 { name:'Mirëmbajtje & Riparime',     lek: nv(fin.mirembajtje),  mtdLek: nv(fin_mtd.mirembajtje) },
 { name:'Marketing',                  lek: nv(fin.marketing),    mtdLek: nv(fin_mtd.marketing) },
 { name:'Familja',                    lek: nv(fin.familja),      mtdLek: nv(fin_mtd.familja) },
 { name:'Shpenzime Hoteli',           lek: nv(fin.hoteli),       mtdLek: nv(fin_mtd.hoteli) },
 { name:'Magazina GARDEN (Invest.)',  lek: nv(fin.mag_garden),   mtdLek: nv(fin_mtd.mag_garden) },
 { name:'Paga & Utilitete',           lek: nv(fin.paga_util),    mtdLek: nv(fin_mtd.paga_util) },
 ].filter(function(i){ return i.lek !== 0 || i.mtdLek !== 0; });
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
 const mOcc = avail > 0 ? (m.nights / avail * 100).toFixed(1) : 0;
 const mAdr = m.nights > 0 ? (m.rev / m.nights).toFixed(0) : 0;
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
 mtdTotalRevenueLek: mtdTotalRevLek,
 occupancyPct: occ, roomsOccupied: rooms, totalRooms: TR,
 prevDayRevenueLek: prevDayRevLek,
 departments: [
 { name:'Hotel (€×100)',  revenueLek: hotelLek,      lyLek: lyHotelLek,      mtdLek: mtdHotelLek },
 { name:'Brutal Garden',  revenueLek: brutalLek,     lyLek: lyBrutalLek,     mtdLek: mtdBrutalLek },
 { name:'Flower Rest.',   revenueLek: flowerRestLek, lyLek: lyFlowerLek,     mtdLek: mtdFlowerLek },
 { name:'Beach Bar',      revenueLek: beachBarLek,   lyLek: lyBeachBarLek,   mtdLek: mtdBeachBarLek },
 { name:'Pool Bar',       revenueLek: poolBarLek,    lyLek: lyPoolBarLek,    mtdLek: mtdPoolBarLek },
 { name:'Pool Bar Garden',revenueLek: poolGardenLek, lyLek: lyPoolGardenLek, mtdLek: mtdPoolGardenLek },
 { name:'House Use',      revenueLek: houseUseLek,   lyLek: lyHouseUseLek,   mtdLek: mtdHouseUseLek },
 { name:'SPA',            revenueLek: spaLek,        lyLek: lySpaLek,        mtdLek: mtdSpaLek },
 ],
 fo: { adr, revpar, occ },
 cashFlow: {
 totalInLek: cfInLek, totalOutLek: cfOutLek, netLek: cfNetLek,
 inItems: [
 { label:'Non Cash Lek', lek: nv(ark.non_cash_lek) },
 { label:'Non Cash Bank Euro×'+EC, lek: Math.round(nv(ark.non_cash_euro)*EC) },
 { label:'Reception Cash Euro×'+EC, lek: Math.round(nv(ark.reception_cash_euro)*EC) },
 { label:'Reception Cash Lek', lek: nv(ark.reception_cash_lek) },
 { label:'Allotments Euro×'+EC, lek: Math.round(nv(ark.allotment)*EC) },
 { label:'Itaka', lek: nv(ark.itaka) },
 { label:'F&B Cash Lek', lek: nv(ark.fnb_cash_lek) },
 { label:'MICE Euro×'+EC, lek: Math.round(nv(ark.mice_euro)*EC) },
 { label:'MICE Lek', lek: nv(ark.mice_lek) },
 ].filter(function(i){ return i.lek!==0; }),
 outItems: [
 { label:'Paga', lek: nv(pag.paga) },
 { label:'Taksa & Utilitete', lek: nv(pag.taxes) },
 { label:'Kredi Euro×'+EC, lek: Math.round(nv(pag.loan_euro)*EC) },
 { label:'Kredi Lek', lek: nv(pag.loan_lek) },
 { label:'House Use', lek: nv(pag.house_use) },
 { label:'Furnitore Cash', lek: nv(pag.furnitore_cash) },
 { label:'Furnitore Bankë Lek', lek: nv(pag.furnitore_bank_lek) },
 { label:'Furnitore Bankë Euro×'+EC, lek: Math.round(nv(pag.furnitore_bank_euro)*EC) },
 { label:'Investime Bankë Euro×'+EC, lek: Math.round(nv(pag.investime_banke_euro)*EC) },
 { label:'Investime Bankë Lek', lek: nv(pag.investime_banke_lek) },
 { label:'Investime Cash', lek: nv(pag.investime_cash) },
 ].filter(function(i){ return i.lek!==0; }),
 },
 expenses: { totalLek: expTotal, items: expItems },
 salesReport: salesSection,
 };
 const prevData = {
 totalRevenueLek: lyTotalRevLek, occupancyPct: lyOcc,
 fo: { adr: lyAdr, revpar: lyRevpar, occ: lyOcc, roomsOccupied: fo_yoy.rooms_occupied||0 },
 };
 if (req.body && req.body.preview) {
 const html = buildEmailHTML(date, data, prevData);
 res.setHeader('Content-Type', 'text/html; charset=utf-8');
 return res.send(html);
 }
 const testTo = req.body && req.body.testTo;
 await sendDailyReport(date, data, prevData, testTo);
 res.json({ success: true, message: 'Raporti u dërgua me sukses për datën ' + date + (testTo ? ' → ' + testTo + ' (TEST)' : ' → redathana@gmail.com, ernestcaci@gmail.com') });
 } catch(err) {
 console.error('[EMAIL] Error:', err.message);
 res.status(500).json({ error: 'Emaili nuk u dërgua: ' + err.message });
 }
});

// ─── HMS CLOSE DAY ───────────────────────────────────────────────────────────
app.post('/api/hms/close-day', async (req, res) => {
 try {
 const now = new Date();
 const days = ['E Diel','E Hënë','E Martë','E Mërkurë','E Enjte','E Premte','E Shtunë'];
 const mons = ['Janar','Shkurt','Mars','Prill','Maj','Qershor','Korrik','Gusht','Shtator','Tetor','Nëntor','Dhjetor'];
 const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${mons[now.getMonth()]} ${now.getFullYear()}`;
 const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');

 // ── Inventory ─────────────────────────────────────────────────────────────
 const FLOWER = [
 {fl:'Kati 1', rooms:['101','102','103','104','105','106','107','108','109','110','111','112','113','114','115','116','117','118','119','120','121','122','123','124']},
 {fl:'Kati 2', rooms:['201','202','203','204','205','206','207','208','209','210','211','212','213','214','215','216','217','218','219','220','221','222','223','224']},
 {fl:'Kati 3', rooms:['301','302','303','304','305','306','307','308','309','310','311','312','313','314','315','316','317','318','319','320','321','322','323','324']},
 {fl:'Kati 4', rooms:['401','402','403','404','405','406','407','408','409','410','411','412','413','414','415','416','417','418','419','420','421','422','423','424']},
 {fl:'Kati 5', rooms:['501','502','503','504','505','506','507','508','509','510','511','512','513','514','515','516','517','518','519','520','521','522','523','524']},
 {fl:'Vilat', rooms:['VILA 1','VILA 2']}
 ];
 const GARDEN = [
 {fl:'Kati 1', rooms:['G101','G102','G103','G104','G105','G106','G107','G108','G109','G110','G111','G112','G114','G115']},
 {fl:'Kati 2', rooms:['G201','G202','G203','G204','G205','G206','G207','G208','G209','G210','G211','G212','G214','G215']},
 {fl:'Kati 3', rooms:['G301','G302','G303','G304','G305','G306','G307','G308','G309','G310','G311','G312','G314','G315']}
 ];

 // ── Stats ─────────────────────────────────────────────────────────────────
 function buildStats(floors) {
 let pas=0, pis=0, oot=0;
 floors.forEach(f => f.rooms.forEach(r => {
 const bld = floors === FLOWER ? 'flower' : 'garden';
 const room = hmsRooms[`${bld}-${r}`];
 const s = room ? room.clean : 'piseet';
 if(s==='paster') pas++; else if(s==='oot') oot++; else pis++;
 }));
 return { pas, pis, oot, tot: pas+pis+oot };
 }

 const sf = buildStats(FLOWER);
 const sg = buildStats(GARDEN);
 const tot = { pas: sf.pas+sg.pas, pis: sf.pis+sg.pis, oot: sf.oot+sg.oot, total: sf.tot+sg.tot };

 // ── HTML per floor ────────────────────────────────────────────────────────
 function floorHTML(floors, bldKey) {
 return floors.map(f => {
 const pills = f.rooms.map(r => {
 const room = hmsRooms[`${bldKey}-${r}`];
 const s = room ? room.clean : 'piseet';
 const bg = s==='paster'?'#22c55e': s==='oot'?'#9ca3af':'#ef4444';
 return `<span style="display:inline-block;background:${bg};color:#fff;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:600;margin:2px;">${r}</span>`;
 }).join('');
 return `<div style="margin-bottom:8px;">
 <div style="font-size:9px;font-weight:600;color:#aaa;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">${f.fl}</div>
 <div>${pills}</div>
 </div>`;
 }).join('');
 }

 // ── Email HTML ────────────────────────────────────────────────────────────
 const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f1eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;padding:16px;">
<div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e4da;">

 <div style="background:#252318;padding:18px 24px;display:flex;align-items:center;gap:14px;">
 <div style="background:#c9a84c;color:#1a1400;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:6px 14px;border-radius:4px;">FLOWER</div>
 <div>
 <div style="font-size:15px;font-weight:500;color:#f0ead0;">Flower Hotels &amp; Resorts</div>
 <div style="font-size:10px;color:#9a9070;margin-top:2px;">Raport Final i Pastrimit — Mbyllja e Ditës</div>
 </div>
 </div>

 <div style="padding:11px 24px;background:#faf9f5;border-bottom:1px solid #f0efe8;display:flex;justify-content:space-between;align-items:center;">
 <div>
 <div style="font-size:13px;font-weight:500;color:#1a1a1a;">${dateStr}</div>
 <div style="font-size:10px;color:#888;margin-top:1px;">Dërguar: ${timeStr} · Mbyllja e ditës nga stafi i pastrimit</div>
 </div>
 <div style="background:#252318;color:#c9a84c;font-size:10px;padding:3px 14px;border-radius:4px;font-weight:500;letter-spacing:.5px;">${tot.total} DHOMA TOTALE</div>
 </div>

 <div style="display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #f0efe8;">
 <div style="padding:12px 8px;text-align:center;border-right:1px solid #f0efe8;">
 <div style="font-size:22px;font-weight:500;color:#1a1a1a;">${tot.total}</div>
 <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Total</div>
 </div>
 <div style="padding:12px 8px;text-align:center;border-right:1px solid #f0efe8;">
 <div style="font-size:22px;font-weight:500;color:#22c55e;">${tot.pas}</div>
 <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">E Pastër</div>
 </div>
 <div style="padding:12px 8px;text-align:center;border-right:1px solid #f0efe8;">
 <div style="font-size:22px;font-weight:500;color:#ef4444;">${tot.pis}</div>
 <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">E Pisët</div>
 </div>
 <div style="padding:12px 8px;text-align:center;">
 <div style="font-size:22px;font-weight:500;color:#9ca3af;">${tot.oot}</div>
 <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-top:2px;">Out of Order</div>
 </div>
 </div>

 <div style="padding:10px 24px 4px;border-bottom:1px solid #f0efe8;display:flex;align-items:center;gap:8px;">
 <div style="width:8px;height:8px;border-radius:50%;background:#ef4444;flex-shrink:0;"></div>
 <div style="font-size:10px;font-weight:500;color:#1a1a1a;text-transform:uppercase;letter-spacing:.7px;flex:1;">Flower Hotel</div>
 <div style="font-size:10px;padding:2px 10px;border-radius:20px;background:#fef2f2;color:#991b1b;font-weight:500;">${sf.tot} dhoma · ${sf.pas} pastër · ${sf.pis} pisët${sf.oot?' · '+sf.oot+' OOT':''}</div>
 </div>
 <div style="padding:8px 24px 12px;">${floorHTML(FLOWER,'flower')}</div>

 <div style="height:1px;background:#f0efe8;"></div>

 <div style="padding:10px 24px 4px;display:flex;align-items:center;gap:8px;">
 <div style="width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0;"></div>
 <div style="font-size:10px;font-weight:500;color:#1a1a1a;text-transform:uppercase;letter-spacing:.7px;flex:1;">Garden Hotel</div>
 <div style="font-size:10px;padding:2px 10px;border-radius:20px;background:#f0fdf4;color:#166534;font-weight:500;">${sg.tot} dhoma · ${sg.pas} pastër · ${sg.pis} pisët${sg.oot?' · '+sg.oot+' OOT':''}</div>
 </div>
 <div style="padding:8px 24px 12px;">${floorHTML(GARDEN,'garden')}</div>

 <div style="padding:8px 24px 10px;display:flex;gap:14px;align-items:center;border-top:1px solid #f0efe8;flex-wrap:wrap;">
 <span style="font-size:10px;color:#888;">Legjenda:</span>
 <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#555;"><span style="width:9px;height:9px;border-radius:2px;background:#22c55e;display:inline-block;"></span> E Pastër</span>
 <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#555;"><span style="width:9px;height:9px;border-radius:2px;background:#ef4444;display:inline-block;"></span> E Pisët</span>
 <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#555;"><span style="width:9px;height:9px;border-radius:2px;background:#9ca3af;display:inline-block;"></span> Out of Order</span>
 </div>

 <div style="padding:12px 24px;background:#faf9f5;border-top:1px solid #f0efe8;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
 <div style="font-size:10px;color:#aaa;">Gjeneruar automatikisht nga FLOW Dashboard</div>
 <div style="font-size:10px;color:#c9a84c;font-weight:500;">FLOWER HOTELS &amp; RESORTS · Golem, Shqipëri</div>
 </div>

</div>
</div>
</body></html>`;

 // ── Dërgo email ───────────────────────────────────────────────────────────
 const nodemailer = require('nodemailer');
 const transporter = nodemailer.createTransport({
 service: 'gmail',
 auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
 });

 await transporter.sendMail({
 from: `"Flower Hotels — Pastrimi" <${process.env.EMAIL_USER}>`,
 to: 'receptionflower@gmail.com, reception@hotel-flower.com, dervishi.erinda1@gmail.com',
 subject: `FLOWER HOTELS — Raport Pastrimi Final · ${dateStr} · ora ${timeStr}`,
 html
 });

 console.log('[HMS] Close-day email dërguar:', timeStr);
 res.json({ ok: true, message: 'Raporti u dërgua me sukses.' });

 } catch(e) {
 console.error('[HMS] Close-day error:', e.message);
 res.status(500).json({ error: e.message });
 }
});
// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
 console.log(`[FLOW] Server on port ${PORT}`);
 refreshCache();
 setInterval(refreshCache, CACHE_TTL);
});
