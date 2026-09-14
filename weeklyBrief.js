'use strict';

// ================================================================
// weeklyBrief.js — Raporti Komercial Javor (dërgim automatik)
// Flower Hotels & Resorts · FLOW Dashboard
//
// Builds the weekly commercial brief straight from forecast.js and
// e-mails it every Sunday at 10:00 (Europe/Tirane) over the same SMTP
// transport the daily report uses. No cloud agent, no connector
// approval, no manual step — if the server is up, the brief goes out.
//
// Layout follows the version approved on 14 Sept 2026: week title,
// four KPI tiles, week performance, sales sources month-to-date,
// quarter forecast, three scenarios, problems, suggestions, and the
// year-to-date paragraph LAST.
// ================================================================

const fc = require('./forecast');

const RECIPIENTS = process.env.WEEKLY_BRIEF_TO
  || 'redathana@gmail.com, ernestcaci@gmail.com, info@hotel-flower.com';
const SEND_HOUR = parseInt(process.env.WEEKLY_BRIEF_HOUR || '10', 10);  // local time
const SEND_DOW  = parseInt(process.env.WEEKLY_BRIEF_DOW  || '0', 10);   // 0 = Sunday
const TZ        = process.env.WEEKLY_BRIEF_TZ || 'Europe/Tirane';

const GOLD = '#c9a84c', BG = '#0a1628', CARD = '#0d1b3e', TEXT = '#c7d0e3', MUTED = '#8b9bb8';
const GOOD = '#7fc4a6', WARN = '#e08a6a';
const SEG_COLORS = { 'Direkt': GOLD, 'Wholesalers': '#5b8db8', 'OTA': '#7fc4a6', 'Itaka': '#b07fc4', 'Agjenci-TO': '#e08a6a', 'Të tjera': '#5a6a85' };

const eur = v => '€' + Math.round(v || 0).toLocaleString('de-DE');
const num = v => Math.round(v || 0).toLocaleString('de-DE');
const pct = v => String(Math.round((v || 0) * 10) / 10).replace('.', ',') + '%';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Local calendar parts for a timezone, without pulling in a date library.
function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hour12: false });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const dows = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date: p.year + '-' + p.month + '-' + p.day, hour: parseInt(p.hour, 10) % 24, dow: dows[p.weekday] };
}

function weekTitle(asOf) {
  const to = new Date(asOf + 'T00:00:00Z');
  const from = new Date(to.getTime() - 7 * 86400000);
  const mTo = fc.MONTH_SQ[to.getUTCMonth() + 1].toLowerCase();
  const mFrom = fc.MONTH_SQ[from.getUTCMonth() + 1].toLowerCase();
  const head = from.getUTCMonth() === to.getUTCMonth()
    ? 'Java ' + from.getUTCDate() + '–' + to.getUTCDate() + ' ' + mTo
    : 'Java ' + from.getUTCDate() + ' ' + mFrom + ' – ' + to.getUTCDate() + ' ' + mTo;
  return head + ' ' + to.getUTCFullYear();
}

// ─── small HTML pieces (tables only — Gmail strips <style> and <img>) ─────────
function tile(label, value, color, sub) {
  return '<td width="50%" valign="top" style="padding:6px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + CARD + '" style="background:' + CARD + ';border-radius:8px">'
    + '<tr><td style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif">'
    + '<div style="font-size:11px;color:' + MUTED + ';letter-spacing:.3px">' + esc(label) + '</div>'
    + '<div style="font-size:19px;font-weight:700;color:' + color + ';padding:3px 0">' + esc(value) + '</div>'
    + (sub ? '<div style="font-size:11px;color:' + MUTED + '">' + esc(sub) + '</div>' : '')
    + '</td></tr></table></td>';
}

function section(title) {
  return '<tr><td style="padding:16px 8px 4px 8px;font-family:Arial,Helvetica,sans-serif;'
    + 'font-size:15px;font-weight:700;color:' + GOLD + '">' + esc(title) + '</td></tr>';
}

function bullets(items) {
  return '<tr><td style="padding:2px 10px 6px 10px;font-family:Arial,Helvetica,sans-serif">'
    + items.filter(Boolean).map(t => '<div style="font-size:13px;color:' + TEXT + ';line-height:1.5;padding:4px 0">• ' + t + '</div>').join('')
    + '</td></tr>';
}

function stackedBar(parts) {
  const shown = parts.filter(p => p.share >= 1);
  if (!shown.length) return '';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:4px;overflow:hidden"><tr>'
    + shown.map(p => '<td width="' + Math.round(p.share) + '%" bgcolor="' + (SEG_COLORS[p.seg] || '#5a6a85') + '" '
      + 'style="background:' + (SEG_COLORS[p.seg] || '#5a6a85') + ';height:14px;font-size:1px;line-height:14px">&nbsp;</td>').join('')
    + '</tr></table>';
}

function rowCells(cells, opts = {}) {
  const pad = opts.head ? '7px 6px' : '6px';
  const color = opts.head ? MUTED : TEXT;
  const weight = opts.head ? '600' : '400';
  return '<tr>' + cells.map((c, i) => '<td align="' + (i === 0 ? 'left' : 'right') + '" style="padding:' + pad
    + ';font-family:Arial,Helvetica,sans-serif;font-size:12px;color:' + (c && c.color ? c.color : color)
    + ';font-weight:' + weight + ';border-bottom:1px solid #16264a">' + esc(c && c.v != null ? c.v : c) + '</td>').join('') + '</tr>';
}

// ─── the observations the brief has to make on its own ───────────────────────
function findings(f) {
  const out = { problems: [], actions: [], good: [] };
  const cur = f.months[0];
  const next = f.months[1];
  const w = f.week;

  if (w && w.lastYearSameWeek) {
    const d = w.lastYearSameWeek.rev > 0 ? ((w.week.rev - w.lastYearSameWeek.rev) / w.lastYearSameWeek.rev) * 100 : null;
    if (d != null && d >= 0) out.good.push('Java solli <b>' + eur(w.week.rev) + '</b> të ardhura të reja, ' + pct(d) + ' mbi të njëjtën javë vjet.');
    if (d != null && d < -5) out.problems.push('<b>Ritmi i shitjeve po bie</b> — java solli ' + eur(w.week.rev) + ', ' + pct(Math.abs(d)) + ' nën të njëjtën javë vjet.');
  } else if (w) {
    out.good.push('Java solli <b>' + eur(w.week.rev) + '</b> të ardhura të reja nga ' + num(w.week.reservations) + ' rezervime.');
  }

  for (const m of f.months.slice(0, 3)) {
    if (!m.ly || !m.ly.adr) continue;
    const adr = m.forecast.base.adr;
    if (adr > 0 && adr < m.ly.adr * 0.97) {
      out.problems.push('<b>ADR-ja e ' + m.label.split(' ')[0].toLowerCase() + 'it ' + eur(adr) + '</b> kundrejt ' + eur(m.ly.adr) + ' vjet — ' + eur(m.ly.adr - adr) + ' më pak për natë.');
      out.actions.push('Vendos <b>dysheme tarifore ' + eur(Math.round(m.ly.adr / 5) * 5) + '</b> për ' + m.label.split(' ')[0].toLowerCase() + 'in dhe mbylle shitjen nën të.');
    } else if (adr > 0 && m.ly.adr > 0 && adr >= m.ly.adr) {
      out.good.push(m.label + ': ADR ' + eur(adr) + ' kundrejt ' + eur(m.ly.adr) + ' vjet.');
    }
  }

  // Concentration on one segment is a risk worth naming.
  for (const m of [cur, next].filter(Boolean)) {
    const top = (m.segments || [])[0] && m.segments.slice().sort((a, b) => b.share - a.share)[0];
    if (top && top.share >= 35 && top.seg !== 'Direkt') {
      out.problems.push('<b>Përqendrim te ' + esc(top.seg) + '</b> për ' + m.label.split(' ')[0].toLowerCase() + 'in — ' + pct(top.share) + ' e të ardhurave nga një kanal i vetëm.');
      out.actions.push('Shtyje ' + m.label.split(' ')[0].toLowerCase() + 'in drejt kanaleve direkte me ofertë të shkurtër në bazën e klientëve ekzistues.');
    }
  }

  // Group / MICE business for the rest of the year against last year.
  const gThis = f.months.reduce((s, m) => s + ((f.groups.byMonth[m.month] || {}).rev || 0), 0);
  const gLast = f.months.reduce((s, m) => {
    const ly = (parseInt(m.month.slice(0, 4), 10) - 1) + m.month.slice(4);
    return s + ((f.groups.byMonth[ly] || {}).rev || 0);
  }, 0);
  if (gLast > 0 && gThis < gLast * 0.8) {
    out.problems.push('<b>Grupet/MICE nën vitin e kaluar</b> — ' + eur(gThis) + ' në libra kundrejt ' + eur(gLast) + ' në të njëjtën periudhë vjet.');
    out.actions.push('Fushatë MICE tani mbi bazën e klientëve të mëparshëm, me objektiv <b>' + eur(gLast - gThis) + '</b> deri në fund të vitit.');
  }

  const q = f.quarter;
  if (q && q.ly && q.ly.rev > 0 && q.base.rev > q.ly.rev) {
    out.good.push('Tremujori parashikohet ' + eur(q.base.rev) + ' kundrejt ' + eur(q.ly.rev) + ' vjet.');
  }
  out.actions.push('Paketat tematike (festat e fundvitit) gati dhe në shitje para fundit të muajit.');
  return out;
}

// ─── the e-mail ──────────────────────────────────────────────────────────────
function buildBriefHtml(f) {
  const title = weekTitle(f.asOf);
  const cur = f.months[0] || null;
  const next = f.months[1] || null;
  const fnd = findings(f);
  const mtd = f.monthToDate;
  const w = f.week;

  let h = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title></head>'
    + '<body style="margin:0;padding:0;background:' + BG + '">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + BG + '" style="background:' + BG + '">'
    + '<tr><td align="center" style="padding:14px 8px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%">';

  // header
  h += '<tr><td style="padding:4px 8px 0 8px;font-family:Arial,Helvetica,sans-serif">'
    + '<div style="font-size:11px;color:' + MUTED + ';letter-spacing:1px">FLOWER HOTELS &amp; RESORTS</div>'
    + '<div style="font-size:18px;font-weight:700;color:#ffffff;padding:2px 0">FLOW · Raporti Komercial Javor</div>'
    + '<div style="font-size:15px;font-weight:600;color:' + GOLD + ';padding:0 0 4px 0">' + esc(title) + '</div></td></tr>';

  // KPI tiles
  const gThis = f.months.reduce((s, m) => s + ((f.groups.byMonth[m.month] || {}).rev || 0), 0);
  h += '<tr><td style="padding:4px 2px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + tile(cur ? cur.label.split(' ')[0] + ' në libra' : 'Muaji', cur ? pct(cur.otb.occ) : '—', GOLD, cur ? num(cur.otb.nights) + ' netë · ADR ' + eur(cur.otb.adr) : '')
    + tile(next ? next.label.split(' ')[0] + ' · parashikim' : 'Muaji tjetër', next ? pct(next.forecast.base.occ) : '—', GOOD, next ? num(next.forecast.base.nights) + ' netë · ' + eur(next.forecast.base.rev) : '')
    + '</tr><tr>'
    + tile(next ? 'ADR ' + next.label.split(' ')[0].toLowerCase() : 'ADR', next ? eur(next.forecast.base.adr) : '—', next && next.ly && next.forecast.base.adr < next.ly.adr ? WARN : GOOD, next && next.ly ? 'vjet ' + eur(next.ly.adr) : '')
    + tile('Grupe/MICE deri në fund të vitit', eur(gThis), gThis > 0 ? GOOD : WARN, 'në libra sot')
    + '</tr></table></td></tr>';

  // week performance
  if (w) {
    const segLine = w.week.bySegment.slice(0, 4).map(s => esc(s.seg) + ' ' + eur(s.rev)).join(' · ');
    h += section('Performanca e javës');
    h += bullets([
      'Rezervime të reja: <b>' + num(w.week.reservations) + '</b> · <b>' + num(w.week.nights) + ' netë</b> · <b>' + eur(w.week.rev) + '</b> (ADR ' + eur(w.week.adr) + ').',
      w.lastYearSameWeek ? 'E njëjta javë vjet: ' + num(w.lastYearSameWeek.reservations) + ' rezervime · ' + eur(w.lastYearSameWeek.rev) + '.' : null,
      segLine ? 'Sipas segmentit: ' + segLine + '.' : null,
    ]);
  }

  // sales sources month to date
  if (mtd && mtd.total > 0) {
    h += section('Burimet e shitjeve · ' + parseInt(mtd.from.slice(8), 10) + '–' + parseInt(mtd.to.slice(8), 10) + ' ' + fc.MONTH_SQ[parseInt(mtd.to.slice(5, 7), 10)].toLowerCase());
    h += '<tr><td style="padding:2px 10px 6px 10px">' + stackedBar(mtd.bySegment)
      + '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:' + MUTED + ';padding:6px 0">'
      + mtd.bySegment.map(s => '<span style="color:' + (SEG_COLORS[s.seg] || '#5a6a85') + '">■</span> ' + esc(s.seg) + ' ' + pct(s.share)).join(' &nbsp; ')
      + '</div>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
      + rowCells(['Burimi', 'Rezervime', 'Netë', 'Të ardhura'], { head: true })
      + mtd.bySource.slice(0, 8).map(s => rowCells([s.source, num(s.res), num(s.nights), eur(s.rev)])).join('')
      + '</table>'
      + '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:' + MUTED + ';padding:6px 0">Totali i muajit deri sot: <b style="color:' + TEXT + '">' + eur(mtd.total) + '</b> nga ' + num(mtd.reservations) + ' rezervime.</div>'
      + '</td></tr>';
  }

  // quarter forecast
  h += section('Parashikimi për pjesën e mbetur të vitit');
  h += '<tr><td style="padding:2px 10px 6px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + rowCells(['Muaji', 'Në libra', 'Parashikim', 'Vjet final'], { head: true })
    + f.months.map(m => rowCells([
        m.label.split(' ')[0],
        num(m.otb.nights) + ' n',
        { v: num(m.forecast.base.nights) + ' n · ' + eur(m.forecast.base.rev), color: GOLD },
        m.ly ? num(m.ly.nights) + ' n · ' + eur(m.ly.rev) : '—',
      ])).join('')
    + rowCells([
        { v: 'Totali', color: '#ffffff' },
        { v: num(f.months.reduce((s, m) => s + m.otb.nights, 0)) + ' n', color: '#ffffff' },
        { v: num(f.restOfYear.base.nights) + ' n · ' + eur(f.restOfYear.base.rev), color: GOLD },
        { v: eur(f.months.reduce((s, m) => s + (m.ly ? m.ly.rev : 0), 0)), color: '#ffffff' },
      ])
    + '</table></td></tr>';

  // scenarios
  h += section('Tre skenarë deri në fund të vitit');
  h += '<tr><td style="padding:2px 10px 6px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + rowCells(['Skenari', 'Netë', 'Të ardhura', 'ADR'], { head: true })
    + rowCells([{ v: 'Pesimist', color: WARN }, num(f.restOfYear.low.nights), eur(f.restOfYear.low.rev), eur(f.restOfYear.low.adr)])
    + rowCells([{ v: 'Bazë', color: GOLD }, num(f.restOfYear.base.nights), eur(f.restOfYear.base.rev), eur(f.restOfYear.base.adr)])
    + rowCells([{ v: 'Optimist', color: GOOD }, num(f.restOfYear.high.nights), eur(f.restOfYear.high.rev), eur(f.restOfYear.high.adr)])
    + '</table>'
    + '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:' + MUTED + ';padding:6px 0">Skenarët ndryshojnë vetëm te pick-up-i i mbetur: 65% / 100% / 135%.</div>'
    + '</td></tr>';

  if (fnd.problems.length) { h += section('Problemet për t’u adresuar'); h += bullets(fnd.problems.slice(0, 5)); }
  if (fnd.actions.length)  { h += section('Sugjerime'); h += bullets(fnd.actions.slice(0, 5)); }

  // year to date — last, per the approved format
  const y = f.ytd;
  h += section('Viti deri tani');
  h += '<tr><td style="padding:2px 10px 10px 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:' + TEXT + ';line-height:1.55">'
    + 'Muajt e mbyllur të ' + f.asOf.slice(0, 4) + ' kanë sjellë <b>' + eur(y.rev) + '</b> nga <b>' + num(y.nights) + ' netë</b>'
    + (y.lyRev > 0 ? ', kundrejt ' + eur(y.lyRev) + ' në të njëjtën periudhë të vitit të kaluar (' + (y.revDeltaPct >= 0 ? '+' : '') + pct(y.revDeltaPct) + ')' : '')
    + '. Me parashikimin bazë për pjesën e mbetur, viti mbyllet rreth <b>' + eur(y.rev + f.restOfYear.base.rev) + '</b>.'
    + '</td></tr>';

  h += '<tr><td style="padding:10px 10px 4px 10px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:' + MUTED + ';line-height:1.5">'
    + '<b>Shënime:</b> burimi i të dhënave është eksporti i rezervimeve i datës ' + esc(f.asOf) + ' (' + num(f.reservations) + ' rezervime). '
    + 'Parashikimi ndërtohet mbi librat e sotëm, pick-up-in e 28 ditëve të fundit dhe ritmin e vitit të kaluar në të njëjtën datë. '
    + (f.warnings.length ? esc(f.warnings.join(' ')) + ' ' : '')
    + 'Grupet/MICE maten si ' + esc(f.groups.rule) + '.'
    + '</td></tr>';
  h += '<tr><td style="padding:8px 10px 16px 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#5a6a85">'
    + 'FLOW Dashboard · raport automatik javor</td></tr>';

  h += '</table></td></tr></table></body></html>';
  return h;
}

function subjectFor(f) { return 'FLOW · Raporti Komercial Javor – ' + weekTitle(f.asOf); }

async function sendBrief(f, opts = {}) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw new Error('EMAIL_USER / EMAIL_PASS nuk janë të konfiguruara');
  const nodemailer = require('nodemailer'); // required lazily so the brief can be rendered without the mail stack
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  const to = opts.to || RECIPIENTS;
  const info = await transporter.sendMail({
    from: '"FLOW Dashboard" <' + process.env.EMAIL_USER + '>',
    to: to,
    subject: (opts.test ? '[TEST] ' : '') + subjectFor(f),
    html: buildBriefHtml(f),
    headers: { 'X-Entity-Ref-ID': 'flow-weekly-' + f.asOf },
  });
  console.log('[WEEKLY] Sent', f.asOf, '→', to, info.messageId);
  return info;
}

// ─── scheduler ───────────────────────────────────────────────────────────────
// Checked every 10 minutes; the brief goes out once per calendar week, and the
// last send date is kept by the caller so a restart cannot double-send.
function startScheduler({ getForecast, loadState, saveState }) {
  const tick = async function () {
    try {
      const now = localParts(new Date(), TZ);
      if (now.dow !== SEND_DOW || now.hour < SEND_HOUR) return;
      const state = loadState() || {};
      if (state.lastSent === now.date) return;
      const f = await getForecast();
      if (!f) { console.warn('[WEEKLY] No forecast available yet — skipped'); return; }
      await sendBrief(f);
      saveState({ lastSent: now.date, asOf: f.asOf, sentAt: new Date().toISOString() });
    } catch (e) {
      console.warn('[WEEKLY] Scheduler error:', e.message);
    }
  };
  setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 60 * 1000); // one check shortly after boot, in case we restarted during the window
  console.log('[WEEKLY] Scheduler armed —', ['E diel','E hënë','E martë','E mërkurë','E enjte','E premte','E shtunë'][SEND_DOW] || SEND_DOW, SEND_HOUR + ':00', TZ);
}

module.exports = { buildBriefHtml, sendBrief, subjectFor, weekTitle, startScheduler, localParts };
