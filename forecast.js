'use strict';

// ================================================================
// forecast.js — Agjenti i Parashikimit (Forecast Agent)
// Flower Hotels & Resorts · FLOW Dashboard
//
// Why this file exists: the weekly commercial brief used to call an
// /api/forecast endpoint that was never implemented, and the cloud
// agents that write the brief cannot reach this server at all. So the
// forecast is computed here, from data the server already keeps, and
// published as forecast.json to Google Drive — where every agent can
// read it with no network access to Render.
//
// Input: the Trinosoft "Prenotimet në recepsion" export archived by
// POST /api/sales-raw (SpreadsheetML XML, the whole reservation list
// with the booking creation date in column AF). Everything below —
// on the books, pick-up, pace, segments, scenarios — is derived from
// that one file, so the forecast can never drift from the dashboard.
//
// Model (documented in the output as `method`):
//   1. OTB          — nights/revenue already on the books per month,
//                     stay nights split across the months consumed.
//   2. Pick-up      — nights booked in the last 7/14/28 days for each
//                     future month, read from the creation date.
//   3. Pace ratio   — last year's final ÷ last year's on-the-books at
//                     the same calendar date (only when the export
//                     still carries last year's reservations).
//   4. Projection   — the mean of the pace estimate and the pick-up
//                     run-rate estimate, capped at 97% of capacity.
//   5. Scenarios    — pesimist / bazë / optimist = 65% / 100% / 135%
//                     of the remaining pick-up the base case assumes.
// ================================================================

// Capacity: 2026 grows through the year as the Garden rooms come online
// (same table the dashboard uses — FO sheet "Nights Available", total 50,252).
const ROOMS_BASE = 110;
const ROOMS_FULL = 160;
const MDAYS = { 1:31, 2:28, 3:31, 4:30, 5:31, 6:30, 7:31, 8:31, 9:30, 10:31, 11:30, 12:31 };
const AVAIL_2026 = { 1:3410, 2:3080, 3:3407, 4:3270, 5:3405, 6:4240, 7:4960, 8:4960, 9:4800, 10:4960, 11:4800, 12:4960 };

const MONTH_SQ = { 1:'Janar', 2:'Shkurt', 3:'Mars', 4:'Prill', 5:'Maj', 6:'Qershor',
                   7:'Korrik', 8:'Gusht', 9:'Shtator', 10:'Tetor', 11:'Nëntor', 12:'Dhjetor' };

// Owner/internal rooms and the SAISTOURS block never count as sold — same
// list the dashboard filters on. ITAKA is NOT excluded: it is sold business.
const EXCL_NAMES = ['olti caci', 'ahmet caci', 'ernest caci', 'jashte pune', 'jasht pune', 'bllok', 'saistours'];

// Sales segments, in priority order — first match wins.
const SEGMENT_RULES = [
  { seg: 'Itaka',       rx: /^itaka/i },
  { seg: 'OTA',         rx: /booking\.?com|expedia|trip\.com|airbnb|agoda|hostelworld|despegar/i },
  { seg: 'Wholesalers', rx: /webbeds|hotel ?beds|w2m|7 ?beds|\bots\b|sondor|miki|restel|jumbo|bedsonline/i },
  { seg: 'Direkt',      rx: /website|booking engine|whatsapp|viber|calls|e-?mail|walk ?in|social media|instagram|facebook|reception|recepsion|direkt|direct/i },
  { seg: 'Agjenci-TO',  rx: /agjen|tour|travel|agency|\bto\b/i },
];
const SEGMENT_ORDER = ['Direkt', 'Wholesalers', 'OTA', 'Itaka', 'Agjenci-TO', 'Të tjera'];

function segmentOf(source) {
  const s = String(source || '').trim();
  if (!s || s === 'N/A') return 'Të tjera';
  for (const r of SEGMENT_RULES) if (r.rx.test(s)) return r.seg;
  return 'Të tjera';
}

// ─── low-level helpers (ports of the dashboard's browser parser) ──────────────
function parseNum(s) {
  s = (s == null ? '' : String(s)).trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const ld = s.lastIndexOf('.'), lc = s.lastIndexOf(',');
  if (ld > lc) return parseFloat(s.replace(/,/g, '')) || 0;
  if (lc > ld) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s) || 0;
}

function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);           if (m) return { yr:+m[1], mo:+m[2], day:+m[3] };
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);         if (m) { let y = +m[3]; if (y < 100) y += 2000; return { yr:y, mo:+m[2], day:+m[1] }; }
  // Trinosoft exports European DD/MM/YYYY — always day first.
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);         if (m) return { yr:+m[3], mo:+m[2], day:+m[1] };
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);         if (m) return { yr:+m[3], mo:+m[2], day:+m[1] };
  const d = new Date(s);
  if (!isNaN(d.getTime())) return { yr: d.getFullYear(), mo: d.getMonth() + 1, day: d.getDate() };
  return null;
}

function isExcluded(client, source) {
  const c = String(client || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const s = String(source || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return EXCL_NAMES.some(function (x) {
    const re = new RegExp('\\b' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    return re.test(c) || re.test(s);
  });
}

const pad2 = v => String(v).padStart(2, '0');
const dayKey = d => (d ? d.yr + '-' + pad2(d.mo) + '-' + pad2(d.day) : '');
const monthKey = (yr, mo) => yr + '-' + pad2(mo);
const daysInMonth = (yr, mo) => new Date(yr, mo, 0).getDate();
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const shiftDays = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

function capacity(yr, mo) {
  if (yr === 2026 && AVAIL_2026[mo] != null) return AVAIL_2026[mo];
  const rooms = yr > 2026 ? ROOMS_FULL : ROOMS_BASE;
  return rooms * (yr % 4 === 0 && mo === 2 ? 29 : (MDAYS[mo] || 30));
}

// ─── SpreadsheetML parser ────────────────────────────────────────────────────
// The export is Trinosoft's XML flavour of .xls; there is no DOM in Node, so the
// rows are read with a scanner. Columns (0-based) match the browser parser:
// 0 nr · 2 dhoma · 3 check-in · 5 klienti · 7 paketa · 10 netët · 11 vlera ·
// 21 burimi · 22 kombësia · 31 data e krijimit.
// The booking creation date moved between Trinosoft versions: older exports
// glue it to the e-mail cell ("mail@x.com - 06/03/2026", col 29), newer ones
// give it its own column (AF = index 31). Both are read, newest column first.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#34': '"' };
function decodeXml(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, function (full, e) {
    if (ENTITIES[e] != null) return ENTITIES[e];
    if (e[0] === '#') return String.fromCharCode(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return full;
  });
}

// Booking creation date — its own column in current exports, appended to the
// e-mail cell in older ones. Anything that is not a real date is ignored, so a
// reservation without one simply drops out of the pick-up windows.
const TAIL_DATE = /(\d{1,2}[\/.]\d{1,2}[\/.]\d{4}|\d{4}-\d{2}-\d{2})\s*$/;
function createdDate(v) {
  for (const i of [31, 32, 30, 29]) {
    const raw = (v[i] || '').trim();
    if (!raw) continue;
    const direct = parseDate(raw);
    if (direct && direct.yr > 2000) return direct;
    const tail = TAIL_DATE.exec(raw);
    if (tail) {
      const d = parseDate(tail[1]);
      if (d && d.yr > 2000) return d;
    }
  }
  return null;
}

function parseExportXml(xml) {
  const rows = [];
  const rowRx = /<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/g;
  const cellRx = /<(?:\w+:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?Cell>)/g;
  const dataRx = /<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/;
  let rowMatch, isHeader = true;
  while ((rowMatch = rowRx.exec(xml)) !== null) {
    if (isHeader) { isHeader = false; continue; } // first row is the header
    const v = [];
    let ci = 0, cellMatch;
    cellRx.lastIndex = 0;
    while ((cellMatch = cellRx.exec(rowMatch[1])) !== null) {
      const idx = /(?:ss:)?Index="(\d+)"/.exec(cellMatch[1] || '');
      if (idx) ci = parseInt(idx[1], 10) - 1;
      const data = cellMatch[2] ? dataRx.exec(cellMatch[2]) : null;
      v[ci] = data ? decodeXml(data[1].replace(/<[^>]+>/g, '')).trim() : '';
      ci++;
    }
    for (let x = 0; x < 35; x++) if (!v[x]) v[x] = '';
    if (isExcluded(v[5], v[21])) continue;
    const din = parseDate(v[3]);
    if (!din) continue;
    let nights = parseNum(v[10]);
    if (nights <= 0) nights = 1;
    const created = createdDate(v);
    rows.push({
      no: v[0], room: v[2], client: v[5], company: v[7],
      nights: nights, rev: parseNum(v[11]),
      source: (v[21] || '').trim() || 'N/A',
      seg: segmentOf(v[21]),
      nat: (v[22] || '').trim(),
      din: din, stay: dayKey(din),
      created: dayKey(created),
    });
  }
  return rows;
}

// ─── aggregation ─────────────────────────────────────────────────────────────
// A stay is spread over the months it actually consumes, so every month's
// nights and revenue reflect nights slept in that month (the dashboard rule).
function eachStayMonth(row, fn) {
  let { yr, mo } = row.din;
  let day = row.din.day || 1, remaining = row.nights, first = true, guard = 0;
  while (remaining > 0 && guard++ < 24) {
    const inMonth = Math.min(remaining, Math.max(1, daysInMonth(yr, mo) - day + 1));
    fn(yr, mo, inMonth, row.rev * (inMonth / row.nights), first);
    first = false;
    remaining -= inMonth;
    day = 1; mo++;
    if (mo > 12) { mo = 1; yr++; }
  }
}

function emptyBucket() { return { nights: 0, rev: 0, res: 0, seg: {} }; }

function addTo(bucket, nights, rev, isFirst, seg) {
  bucket.nights += nights;
  bucket.rev += rev;
  if (isFirst) bucket.res++;
  if (seg) {
    if (!bucket.seg[seg]) bucket.seg[seg] = { nights: 0, rev: 0, res: 0 };
    bucket.seg[seg].nights += nights;
    bucket.seg[seg].rev += rev;
    if (isFirst) bucket.seg[seg].res++;
  }
}

// Everything the projection needs, in one pass over the reservations.
function aggregate(rows, asOf) {
  const lastYearAsOf = shiftDays(asOf, -365);
  const otb = {};        // monthKey → bucket (what is on the books now)
  const lyAtDate = {};   // monthKey of last year → bucket as it stood one year ago
  const pickup = {};     // monthKey → { d7, d14, d28 } booked in the last N days
  const pickupLy = {};   // same window one year ago, for the like-for-like line
  const created = {};    // creation day → { nights, rev, res } (booking curve)

  for (const r of rows) {
    const madeOn = r.created || '';
    const age = madeOn ? diffDays(madeOn, asOf) : null;
    const ageLy = madeOn ? diffDays(madeOn, lastYearAsOf) : null;
    if (madeOn) {
      if (!created[madeOn]) created[madeOn] = { nights: 0, rev: 0, res: 0 };
      created[madeOn].nights += r.nights;
      created[madeOn].rev += r.rev;
      created[madeOn].res++;
    }
    eachStayMonth(r, function (yr, mo, nights, rev, first) {
      const k = monthKey(yr, mo);
      if (!otb[k]) otb[k] = emptyBucket();
      addTo(otb[k], nights, rev, first, r.seg);

      // Last year's book as it stood on this same calendar date.
      if (madeOn && ageLy >= 0) {
        if (!lyAtDate[k]) lyAtDate[k] = emptyBucket();
        addTo(lyAtDate[k], nights, rev, first, r.seg);
      }
      if (age != null && age >= 0) {
        if (!pickup[k]) pickup[k] = { d7: emptyBucket(), d14: emptyBucket(), d28: emptyBucket() };
        if (age <= 7) addTo(pickup[k].d7, nights, rev, first, r.seg);
        if (age <= 14) addTo(pickup[k].d14, nights, rev, first, r.seg);
        if (age <= 28) addTo(pickup[k].d28, nights, rev, first, r.seg);
      }
      if (ageLy != null && ageLy >= 0 && ageLy <= 7) {
        if (!pickupLy[k]) pickupLy[k] = emptyBucket();
        addTo(pickupLy[k], nights, rev, first, r.seg);
      }
    });
  }
  return { otb, lyAtDate, pickup, pickupLy, created };
}

const adrOf = b => (b && b.nights > 0 ? b.rev / b.nights : 0);
const round0 = v => Math.round(v || 0);
const round1 = v => Math.round((v || 0) * 10) / 10;

// ─── the projection ──────────────────────────────────────────────────────────
// Two independent estimators, averaged. Either one alone still produces a
// number; when neither is available the month stays at its on-the-books value
// and is flagged, so the brief never presents a guess as a forecast.
const PICKUP_DECAY = 0.8;   // pick-up thins out once the month is running
const CAP_UTIL     = 0.97;  // no month is ever projected above 97% of capacity
const LOW_FACTOR   = 0.65;
const HIGH_FACTOR  = 1.35;

function projectMonth(key, agg, asOf) {
  const [yr, mo] = key.split('-').map(Number);
  const book = agg.otb[key] || emptyBucket();
  const cap = capacity(yr, mo);
  const monthEnd = key + '-' + pad2(daysInMonth(yr, mo));
  const remainingDays = Math.max(0, diffDays(asOf, monthEnd));

  const lyKey = monthKey(yr - 1, mo);
  const lyFinal = agg.otb[lyKey] || null;
  const lyThen = agg.lyAtDate[lyKey] || null;
  const pu = agg.pickup[key] || null;

  const estimates = [];
  // 1 · pace ratio — how much last year's book still grew from this date on.
  if (lyFinal && lyThen && lyThen.nights > 0 && lyFinal.nights >= lyThen.nights) {
    estimates.push({ src: 'pace', nights: book.nights * (lyFinal.nights / lyThen.nights) });
  }
  // 2 · pick-up run-rate — the last 28 days of actual bookings, carried forward.
  if (pu && remainingDays > 0) {
    let daily = 0;
    if (pu.d28.nights > 0) daily = pu.d28.nights / 28;
    else if (pu.d14.nights > 0) daily = pu.d14.nights / 14;
    else if (pu.d7.nights > 0) daily = pu.d7.nights / 7;
    if (daily > 0) estimates.push({ src: 'pick-up', nights: book.nights + daily * remainingDays * PICKUP_DECAY });
  }

  const capNights = cap * CAP_UTIL;
  let baseNights = book.nights;
  if (estimates.length) baseNights = estimates.reduce((s, e) => s + e.nights, 0) / estimates.length;
  baseNights = Math.min(Math.max(baseNights, book.nights), Math.max(capNights, book.nights));

  const remaining = baseNights - book.nights;
  const lowNights = book.nights + remaining * LOW_FACTOR;
  const highNights = Math.min(book.nights + remaining * HIGH_FACTOR, Math.max(capNights, book.nights));

  // Revenue follows the ADR the room nights are actually being sold at: half
  // the book's own ADR, half the ADR of the last 28 days of pick-up.
  const bookAdr = adrOf(book);
  const puAdr = pu ? adrOf(pu.d28) || adrOf(pu.d14) || adrOf(pu.d7) : 0;
  const addAdr = bookAdr > 0 && puAdr > 0 ? (bookAdr + puAdr) / 2 : (puAdr || bookAdr);
  const revFor = n => book.rev + (n - book.nights) * addAdr;

  const scen = n => ({ nights: round0(n), rev: round0(revFor(n)), adr: round0(n > 0 ? revFor(n) / n : 0), occ: round1(cap > 0 ? (n / cap) * 100 : 0) });

  return {
    month: key,
    label: MONTH_SQ[mo] + ' ' + yr,
    capacity: cap,
    closed: remainingDays <= 0,
    otb: { nights: round0(book.nights), rev: round0(book.rev), adr: round0(bookAdr), occ: round1(cap > 0 ? (book.nights / cap) * 100 : 0), res: book.res },
    ly: lyFinal ? { nights: round0(lyFinal.nights), rev: round0(lyFinal.rev), adr: round0(adrOf(lyFinal)) } : null,
    lyAtSameDate: lyThen ? { nights: round0(lyThen.nights), rev: round0(lyThen.rev) } : null,
    pickup: pu ? {
      d7:  { nights: round0(pu.d7.nights),  rev: round0(pu.d7.rev) },
      d14: { nights: round0(pu.d14.nights), rev: round0(pu.d14.rev) },
      d28: { nights: round0(pu.d28.nights), rev: round0(pu.d28.rev), adr: round0(adrOf(pu.d28)) },
    } : null,
    pickupLyWeek: agg.pickupLy[key] ? { nights: round0(agg.pickupLy[key].nights), rev: round0(agg.pickupLy[key].rev) } : null,
    remainingDays: remainingDays,
    basis: estimates.map(e => e.src),
    forecast: { low: scen(lowNights), base: scen(baseNights), high: scen(highNights) },
    segments: SEGMENT_ORDER
      .filter(s => book.seg[s])
      .map(s => ({ seg: s, nights: round0(book.seg[s].nights), rev: round0(book.seg[s].rev), res: book.seg[s].res,
                   share: round1(book.rev > 0 ? (book.seg[s].rev / book.rev) * 100 : 0) })),
  };
}

function sumScenario(months, which) {
  return months.reduce(function (acc, m) {
    const s = m.forecast[which];
    acc.nights += s.nights; acc.rev += s.rev; acc.capacity += m.capacity;
    return acc;
  }, { nights: 0, rev: 0, capacity: 0 });
}

// Month-to-date sales by source and by segment — "nga kanë ardhur shitjet
// nga fillimi i muajit deri sot", the section the weekly brief opens with.
function monthToDateSources(rows, asOf) {
  const from = asOf.slice(0, 8) + '01';
  const bySource = {}, bySegment = {};
  let total = 0, nights = 0, res = 0;
  for (const r of rows) {
    if (!r.created || r.created < from || r.created > asOf) continue;
    total += r.rev; nights += r.nights; res++;
    const s = r.source || 'N/A';
    if (!bySource[s]) bySource[s] = { rev: 0, nights: 0, res: 0, seg: r.seg };
    bySource[s].rev += r.rev; bySource[s].nights += r.nights; bySource[s].res++;
    if (!bySegment[r.seg]) bySegment[r.seg] = { rev: 0, nights: 0, res: 0 };
    bySegment[r.seg].rev += r.rev; bySegment[r.seg].nights += r.nights; bySegment[r.seg].res++;
  }
  const share = v => round1(total > 0 ? (v / total) * 100 : 0);
  return {
    from: from, to: asOf,
    total: round0(total), nights: round0(nights), reservations: res,
    bySegment: SEGMENT_ORDER.filter(s => bySegment[s]).map(s => ({ seg: s, rev: round0(bySegment[s].rev), nights: round0(bySegment[s].nights), res: bySegment[s].res, share: share(bySegment[s].rev) })),
    bySource: Object.entries(bySource).sort((a, b) => b[1].rev - a[1].rev).slice(0, 12)
      .map(([name, v]) => ({ source: name, seg: v.seg, rev: round0(v.rev), nights: round0(v.nights), res: v.res, share: share(v.rev) })),
  };
}

// Business booked in the last 7 days, whatever month it is for — the
// "Performanca e javës" block, with the same week one year ago beside it.
function weekPickup(rows, asOf) {
  const from = shiftDays(asOf, -7);
  const lyTo = shiftDays(asOf, -365), lyFrom = shiftDays(lyTo, -7);
  const now = { rev: 0, nights: 0, res: 0, seg: {} };
  const ly = { rev: 0, nights: 0, res: 0, seg: {} };
  for (const r of rows) {
    if (!r.created) continue;
    const bucket = (r.created > from && r.created <= asOf) ? now
                 : (r.created > lyFrom && r.created <= lyTo) ? ly : null;
    if (!bucket) continue;
    bucket.rev += r.rev; bucket.nights += r.nights; bucket.res++;
    if (!bucket.seg[r.seg]) bucket.seg[r.seg] = { rev: 0, nights: 0, res: 0 };
    bucket.seg[r.seg].rev += r.rev; bucket.seg[r.seg].nights += r.nights; bucket.seg[r.seg].res++;
  }
  const fmt = b => ({
    rev: round0(b.rev), nights: round0(b.nights), reservations: b.res, adr: round0(b.nights > 0 ? b.rev / b.nights : 0),
    bySegment: SEGMENT_ORDER.filter(s => b.seg[s]).map(s => ({ seg: s, rev: round0(b.seg[s].rev), nights: round0(b.seg[s].nights), res: b.seg[s].res })),
  });
  return { from: from, to: asOf, week: fmt(now), lastYearSameWeek: ly.res ? fmt(ly) : null };
}

// Groups / MICE proxy: several rooms sold to the same company for overlapping
// dates. The export has no market-segment column, so this is the closest
// honest measure — it is labelled as a proxy everywhere it is used.
const MICE_MIN_ROOMS = 5;
const PACKAGE_WORDS = /all inclusive|bed ?& ?breakfast|half board|full board|itaka|janar|viti i ri|valentin|romantik|ramazan|mars|pavar|hotel beds|pa paket/i;

function groupsByMonth(rows) {
  const byCompany = {};
  for (const r of rows) {
    const c = String(r.company || '').replace(/\s+/g, ' ').trim();
    if (!c || PACKAGE_WORDS.test(c)) continue;
    const k = c.toLowerCase() + '|' + monthKey(r.din.yr, r.din.mo);
    if (!byCompany[k]) byCompany[k] = { company: c, month: monthKey(r.din.yr, r.din.mo), rooms: 0, nights: 0, rev: 0 };
    byCompany[k].rooms++; byCompany[k].nights += r.nights; byCompany[k].rev += r.rev;
  }
  const out = {};
  for (const g of Object.values(byCompany)) {
    if (g.rooms < MICE_MIN_ROOMS) continue;
    if (!out[g.month]) out[g.month] = { groups: 0, rooms: 0, nights: 0, rev: 0 };
    out[g.month].groups++; out[g.month].rooms += g.rooms; out[g.month].nights += g.nights; out[g.month].rev += g.rev;
  }
  for (const k of Object.keys(out)) { out[k].nights = round0(out[k].nights); out[k].rev = round0(out[k].rev); }
  return out;
}

// ─── entry point ─────────────────────────────────────────────────────────────
// rows  — parsed reservations (parseExportXml)
// opts  — { asOf: 'YYYY-MM-DD', sourceFile, horizonMonths }
function buildForecast(rows, opts = {}) {
  const asOf = opts.asOf || new Date().toISOString().slice(0, 10);
  const year = parseInt(asOf.slice(0, 4), 10);
  const curMonth = parseInt(asOf.slice(5, 7), 10);
  const agg = aggregate(rows, asOf);

  const horizon = opts.horizonMonths || (12 - curMonth + 1);
  const keys = [];
  for (let i = 0; i < horizon; i++) {
    const mo = curMonth + i;
    keys.push(monthKey(year + Math.floor((mo - 1) / 12), ((mo - 1) % 12) + 1));
  }
  const months = keys.map(k => projectMonth(k, agg, asOf));

  // Year to date: months already behind us, as booked.
  const ytd = { nights: 0, rev: 0, lyNights: 0, lyRev: 0 };
  for (let mo = 1; mo < curMonth; mo++) {
    const b = agg.otb[monthKey(year, mo)], l = agg.otb[monthKey(year - 1, mo)];
    if (b) { ytd.nights += b.nights; ytd.rev += b.rev; }
    if (l) { ytd.lyNights += l.nights; ytd.lyRev += l.rev; }
  }

  const quarterMonths = months.filter(m => Math.ceil(parseInt(m.month.slice(5), 10) / 3) === Math.ceil(curMonth / 3));
  const restOfYear = months;
  const groups = groupsByMonth(rows);

  const scen = (list, which) => {
    const s = sumScenario(list, which);
    return { nights: s.nights, rev: s.rev, adr: round0(s.nights > 0 ? s.rev / s.nights : 0), occ: round1(s.capacity > 0 ? (s.nights / s.capacity) * 100 : 0) };
  };

  return {
    generatedAt: new Date().toISOString(),
    asOf: asOf,
    sourceFile: opts.sourceFile || null,
    reservations: rows.length,
    agent: 'forecast-agent',
    method: [
      'OTB = netët e rezervuara sot, të ndara sipas muajve të qëndrimit.',
      'Pick-up = netët e rezervuara në 7/14/28 ditët e fundit (data e krijimit).',
      'Ritmi (pace) = finalja e vitit të kaluar ÷ librat e vitit të kaluar në të njëjtën datë.',
      'Parashikimi bazë = mesatarja e dy vlerësimeve, e kufizuar në 97% të kapacitetit.',
      'Skenarët: pesimist 65% / bazë 100% / optimist 135% të pick-up-it të mbetur.',
    ],
    months: months,
    quarter: {
      label: 'T' + Math.ceil(curMonth / 3) + ' ' + year,
      months: quarterMonths.map(m => m.month),
      otb: quarterMonths.reduce((a, m) => ({ nights: a.nights + m.otb.nights, rev: a.rev + m.otb.rev }), { nights: 0, rev: 0 }),
      low: scen(quarterMonths, 'low'), base: scen(quarterMonths, 'base'), high: scen(quarterMonths, 'high'),
      ly: quarterMonths.reduce((a, m) => ({ nights: a.nights + (m.ly ? m.ly.nights : 0), rev: a.rev + (m.ly ? m.ly.rev : 0) }), { nights: 0, rev: 0 }),
    },
    restOfYear: {
      months: restOfYear.map(m => m.month),
      low: scen(restOfYear, 'low'), base: scen(restOfYear, 'base'), high: scen(restOfYear, 'high'),
    },
    ytd: { through: monthKey(year, curMonth - 1 || 1), nights: round0(ytd.nights), rev: round0(ytd.rev),
           lyNights: round0(ytd.lyNights), lyRev: round0(ytd.lyRev),
           revDeltaPct: ytd.lyRev > 0 ? round1(((ytd.rev - ytd.lyRev) / ytd.lyRev) * 100) : null },
    week: weekPickup(rows, asOf),
    monthToDate: monthToDateSources(rows, asOf),
    groups: { rule: 'të paktën ' + MICE_MIN_ROOMS + ' dhoma nga e njëjta kompani brenda një muaji (përafrim për MICE/grupe)', byMonth: groups },
    warnings: months.filter(m => !m.basis.length && !m.closed).map(m => 'Muaji ' + m.label + ' nuk ka as ritëm as pick-up — mbetet në nivelin e librave.'),
  };
}

module.exports = {
  parseExportXml, buildForecast, aggregate,
  segmentOf, capacity, MONTH_SQ, SEGMENT_ORDER,
};
