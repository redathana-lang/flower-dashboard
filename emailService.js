'use strict';
// ================================================================
//  emailService.js  —  FLOW Daily Report Email Service
//  Flower Hotels & Resorts · Golem, Albania
// ================================================================

const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');

// ── Fixed recipients ─────────────────────────────────────────
const DEFAULT_RECIPIENTS = 'redathana@gmail.com,ernestcaci@gmail.com';

// ── Logo ─────────────────────────────────────────────────────
let LOGO_URI = '';
try {
  const buf = fs.readFileSync(path.join(__dirname, 'icon-512.png'));
  LOGO_URI  = `data:image/png;base64,${buf.toString('base64')}`;
} catch (_) { /* logo file not found — header shows text only */ }

// ── SMTP transport ────────────────────────────────────────────
function createTransport() {
  return nodemailer.createTransport({
    host  : process.env.EMAIL_HOST || 'smtp.gmail.com',
    port  : parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth  : { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

// ── Number formatter ─────────────────────────────────────────
function fmtN(n, dec) {
  dec = dec === undefined ? 0 : dec;
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  });
}

// ── Date formatter ────────────────────────────────────────────
function fmtDate(s) {
  try {
    return new Date(s + 'T00:00:00').toLocaleDateString('sq-AL', {
      weekday:'long', year:'numeric', month:'long', day:'numeric',
    });
  } catch (_) { return s; }
}

// ── Change badges ─────────────────────────────────────────────
function chgPct(curr, prev) {
  if (!prev || prev === 0) return '';
  const p = ((curr - prev) / Math.abs(prev)) * 100;
  const c = p >= 0 ? '#22c55e' : '#ef4444';
  const a = p >= 0 ? '▲' : '▼';
  return '<span style="color:' + c + ';font-size:10px;">' + a + ' ' + Math.abs(p).toFixed(1) + '%</span>';
}

function chgPP(curr, prev) {
  const d = curr - prev;
  const c = d >= 0 ? '#22c55e' : '#ef4444';
  const a = d >= 0 ? '▲' : '▼';
  return '<span style="color:' + c + ';font-size:10px;">' + a + ' ' + Math.abs(d).toFixed(1) + 'pp</span>';
}

// ── Department bar row ────────────────────────────────────────
function deptRow(name, lek, lyLek, color, maxLek) {
  const isNeg  = lek < 0;
  const pct    = maxLek > 0 ? Math.min(Math.abs(lek) / maxLek * 100, 100) : 0;
  const valCol = isNeg ? '#ef4444' : '#e2e8f0';

  var lyDelta = '—';
  if (lyLek != null && lyLek !== 0) {
    var pp = ((lek - lyLek) / Math.abs(lyLek)) * 100;
    var pc = pp >= 0 ? '#22c55e' : '#ef4444';
    var pa = pp >= 0 ? '▲' : '▼';
    lyDelta = '<span style="color:' + pc + ';font-size:10px;">' + pa + Math.abs(pp).toFixed(0) + '%</span>';
  }

  var barHtml = isNeg
    ? '<div style="background:#111e30;border-radius:3px;height:12px;position:relative;"><div style="background:#991b1b;height:12px;width:' + pct + '%;border-radius:3px;position:absolute;right:0;"></div></div>'
    : '<div style="background:#111e30;border-radius:3px;height:12px;overflow:hidden;"><div style="background:' + color + ';height:12px;width:' + pct + '%;border-radius:3px;"></div></div>';

  return '<tr>'
    + '<td style="padding:5px 10px 5px 12px;font-size:12px;color:#94a3b8;width:22%;white-space:nowrap;">' + name + '</td>'
    + '<td style="padding:5px 6px;width:36%;">' + barHtml + '</td>'
    + '<td style="padding:5px 6px;font-size:12px;color:' + valCol + ';text-align:right;width:18%;white-space:nowrap;font-weight:600;">' + fmtN(lek) + ' L</td>'
    + '<td style="padding:5px 6px;font-size:11px;color:#3d5070;text-align:right;width:14%;white-space:nowrap;">' + (lyLek != null ? fmtN(lyLek) + ' L' : '—') + '</td>'
    + '<td style="padding:5px 6px;text-align:right;width:10%;">' + lyDelta + '</td>'
    + '</tr>';
}

// ── CF detail row ────────────────────────────────────────────
function cfRow(label, lek, color) {
  return '<tr>'
    + '<td style="padding:4px 10px 4px 0;font-size:12px;color:#8496aa;">' + label + '</td>'
    + '<td style="padding:4px 0;font-size:12px;color:' + color + ';text-align:right;font-weight:600;">' + fmtN(lek) + ' L</td>'
    + '</tr>';
}

// ── Expense row ───────────────────────────────────────────────
function expRow(label, lek) {
  return '<tr>'
    + '<td style="padding:4px 10px 4px 0;font-size:12px;color:#8496aa;">' + label + '</td>'
    + '<td style="padding:4px 0;font-size:12px;color:#dde6f0;text-align:right;">' + fmtN(lek) + ' L</td>'
    + '</tr>';
}

// ── Channel rank row ──────────────────────────────────────────
function chRankRow(rank, name, lek, barPct, barColor, chg) {
  var medals = ['🥇','🥈','🥉'];
  var medal  = medals[rank - 1] || '';
  var chgC   = chg > 0 ? '#22c55e' : chg < 0 ? '#ef4444' : '#64748b';
  var chgTxt = chg !== 0
    ? '<span style="color:' + chgC + ';font-size:10px;">' + (chg > 0 ? '▲' : '▼') + Math.abs(chg) + '%</span>'
    : '<span style="color:#64748b;font-size:10px;">—</span>';

  return '<tr>'
    + '<td style="padding:5px 0;font-size:11px;color:#334155;width:14px;">' + rank + '</td>'
    + '<td style="padding:5px 4px;font-size:13px;width:20px;">' + medal + '</td>'
    + '<td style="padding:5px 8px 5px 0;font-size:12px;color:#8496aa;">' + name + '</td>'
    + '<td style="padding:5px 0;" width="40%"><div style="background:#1e3a5f;border-radius:3px;height:8px;overflow:hidden;"><div style="background:' + barColor + ';height:8px;width:' + barPct + '%;border-radius:3px;"></div></div></td>'
    + '<td style="padding:5px 0 5px 8px;font-size:11px;color:#c8d5e4;text-align:right;white-space:nowrap;">' + fmtN(lek) + ' L</td>'
    + '<td style="padding:5px 0 5px 6px;text-align:right;width:44px;">' + chgTxt + '</td>'
    + '</tr>';
}

// ================================================================
//  buildEmailHTML
// ================================================================
function buildEmailHTML(date, d, p) {
  d = d || {};
  p = p || {};

  var dateLabel = fmtDate(date);
  var year      = parseInt((date || '').slice(0, 4)) || new Date().getFullYear();

  // Overview
  var occ        = d.occupancyPct || (d.occupancy && d.occupancy.pct) || 0;
  var lyOcc      = p.occupancyPct || (p.occupancy && p.occupancy.pct) || 0;
  var rooms      = d.roomsOccupied || (d.occupancy && d.occupancy.occupied) || 0;
  var totalRooms = d.totalRooms || 110;
  var totalLek   = d.totalRevenueLek || (d.revenue && d.revenue.totalLek) || 0;
  var totalEur   = d.totalRevenueEur || (d.revenue && d.revenue.totalEur) || 0;
  var lyTotalLek = p.totalRevenueLek || (p.revenue && p.revenue.totalLek) || 0;
  var occColor   = occ >= 80 ? '#22c55e' : occ >= 50 ? '#f59e0b' : '#ef4444';

  // Departments
  var rawDepts = d.departments || (d.revenue && d.revenue.departments) || [];
  var deptMap  = {};
  rawDepts.forEach(function(dep) { deptMap[dep.name] = dep; });

  var DEPTS = [
    { name: 'Hotel (€×100)',   color: '#f0c040' },
    { name: 'Brutal Garden',   color: '#ef4444' },
    { name: 'Flower Rest.',    color: '#f0c040' },
    { name: 'Beach Bar',       color: '#f0c040' },
    { name: 'Pool Bar',        color: '#3b82f6' },
    { name: 'Pool Bar Garden', color: '#8b5cf6' },
    { name: 'House Use',       color: '#991b1b' },
    { name: 'SPA',             color: '#f0c040' },
  ];

  var maxDeptLek = 1;
  DEPTS.forEach(function(dep) {
    var m = deptMap[dep.name];
    if (m) { var v = Math.abs(m.revenueLek || m.lek || 0); if (v > maxDeptLek) maxDeptLek = v; }
  });

  var deptTotalLek   = d.totalRevenueLek || 0;
  var deptTotalLyLek = p.totalRevenueLek || 0;

  var deptRowsHtml = DEPTS.map(function(dep) {
    var m   = deptMap[dep.name] || {};
    var lek = m.revenueLek || m.lek || 0;
    var ly  = m.lyLek != null ? m.lyLek : (m.lyRevenueLek != null ? m.lyRevenueLek : null);
    return deptRow(dep.name, lek, ly, dep.color, maxDeptLek);
  }).join('');

  // Expenses
  var exp      = d.expenses || d.shpenzime || {};
  var expTotal = exp.totalLek || exp.total || 0;
  var expEur   = exp.totalEur || 0;
  var expItems = exp.items || exp.categories || [];
  var expRowsHtml = expItems.length > 0
    ? expItems.map(function(e) { return expRow(e.name || e.category || '—', e.lek || e.amountLek || 0); }).join('')
    : expRow('Nuk ka të dhëna shpenzimesh', 0);
  var netAfterExp = totalLek - expTotal;

  // Cash Flow
  var cf        = d.cashFlow || d.cash || {};
  var cfIn      = cf.totalInLek  || cf.inLek  || 0;
  var cfOut     = cf.totalOutLek || cf.outLek  || 0;
  var cfNet     = cf.netLek != null ? cf.netLek : (cfIn - cfOut);
  var cfNetCol  = cfNet >= 0 ? '#22c55e' : '#ef4444';
  var cfInItems = cf.inItems  || [];
  var cfOutItems= cf.outItems || [];
  var cfInHtml  = cfInItems.length  > 0 ? cfInItems.map( function(r) { return cfRow(r.label || r.name || '—', r.amountLek || r.lek || 0, '#22c55e'); }).join('') : cfRow('—', 0, '#334155');
  var cfOutHtml = cfOutItems.length > 0 ? cfOutItems.map(function(r) { return cfRow(r.label || r.name || '—', r.amountLek || r.lek || 0, '#ef4444'); }).join('') : cfRow('—', 0, '#334155');

  // Front Office
  var fo        = d.fo || d.frontOffice || {};
  var pfo       = p.fo || p.frontOffice || {};
  var adr       = fo.adr    || fo.ADR    || 0;
  var revpar    = fo.revpar || fo.RevPAR || 0;
  var lyAdr     = pfo.adr   || pfo.ADR   || 0;
  var lyRevpar  = pfo.revpar|| pfo.RevPAR|| 0;
  var adrEur    = adr    ? Math.round(adr    / 100) : 0;
  var revparEur = revpar ? (revpar / 100).toFixed(2) : '0';

  // Sales channels
  var channels  = d.channels || fo.channels || [];
  var maxChLek  = 1;
  channels.forEach(function(c) { var v = c.revenueLek || c.lek || 0; if (v > maxChLek) maxChLek = v; });
  var chColors  = ['#0ea5e9','#38bdf8','#0284c7','#0369a1','#075985'];
  var chRankHtml = channels.slice(0, 5).map(function(ch, i) {
    var lek    = ch.revenueLek || ch.lek || 0;
    var barPct = Math.round((lek / maxChLek) * 100);
    return chRankRow(i + 1, ch.name || '—', lek, barPct, chColors[i] || '#0ea5e9', ch.chgPct || 0);
  }).join('');

  // DoD
  var prevDayLek = d.prevDayRevenueLek || 0;
  var dodDiff    = totalLek - prevDayLek;
  var dodPct     = prevDayLek > 0 ? ((dodDiff / prevDayLek) * 100) : 0;
  var dodColor   = dodDiff >= 0 ? '#22c55e' : '#ef4444';
  var dodArrow   = dodDiff >= 0 ? '▲' : '▼';
  var dodSign    = dodDiff >= 0 ? '+' : '';

  // Managerial note
  var topCh    = channels.length > 0 ? channels[0].name : 'Booking.com';
  var topChPct = channels.length > 0 ? (((channels[0].revenueLek||0) / Math.max(totalLek,1)) * 100).toFixed(1) : '—';
  var mgrOcc   = occ >= 70 ? 'e lartë' : occ >= 45 ? 'solide për fazën sezonale' : 'e moderuar';
  var mgrYoy   = lyTotalLek > 0
    ? '(+' + (((totalLek - lyTotalLek) / lyTotalLek) * 100).toFixed(1) + '% krahasuar me ' + (year-1) + ')'
    : '';

  var logoHtml = LOGO_URI
    ? '<td style="padding-right:14px;vertical-align:middle;"><img src="' + LOGO_URI + '" width="52" height="52" style="border-radius:50%;display:block;background:#ffffff;padding:4px;" alt="Flower Hotel"></td>'
    : '';

  var chRankSection = channels.length > 0
    ? '<div style="background:#0D1B3E;border-radius:8px;padding:13px;border:1px solid #1e3a5f;">'
      + '<div style="font-size:9px;color:#0e7490;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:9px;">Kanalet — renditja sipas shitjeve</div>'
      + '<table width="100%" cellpadding="0" cellspacing="0">' + chRankHtml + '</table>'
      + '</div>'
    : '';

  // ── Build HTML string ────────────────────────────────────────

  // ── Sales Report (from in-memory salesState) ──────────────────────────────
  var sr = d.salesReport || null;
  var salesHtml = '';
  if (!sr) {
    salesHtml = '<tr><td style="background:#0f2040;padding:22px 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
      + '<div style="font-size:10px;color:#38bdf8;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;margin-bottom:10px;">05 \u2014 Sales Report</div>'
      + '<div style="background:#0D1B3E;border-radius:8px;padding:14px;border:1px solid #1e3a5f;font-size:12px;color:#475569;text-align:center;">'
      + 'Nuk ka t\u00eb dh\u00ebna Sales \u2014 ngarko Excel-in n\u00eb dashboard.'
      + '</div></td></tr>\n';
  } else {
    var euroFmt = function(v){ return '\u20ac' + Math.round(v).toLocaleString('de-DE'); };
    var adrTotal  = sr.totalNights  > 0 ? Math.round(sr.totalRev    / sr.totalNights)  : 0;
    var adrFlower = sr.flowerNights > 0 ? Math.round(sr.flowerRev   / sr.flowerNights) : 0;
    var adrGarden = sr.gardenNights > 0 ? Math.round(sr.gardenRev   / sr.gardenNights) : 0;
    var MAL = {1:'Janar',2:'Shkurt',3:'Mars',4:'Prill',5:'Maj',6:'Qershor',
               7:'Korrik',8:'Gusht',9:'Shtator',10:'Tetor',11:'N\u00ebntor',12:'Dhjetor'};

    var mBodyHtml = (sr.monthRows||[]).map(function(m){
      var occ = parseFloat(m.occ);
      var occC = occ>=70?'#22c55e':occ>=50?'#f59e0b':'#ef4444';
      return '<tr style="border-bottom:1px solid #131e30;">'
        + '<td style="padding:6px 10px;font-size:11px;color:#c9a84c;font-weight:700;white-space:nowrap;">' + m.label + '</td>'
        + '<td style="padding:6px 8px;font-size:11px;color:#8496aa;text-align:center;">' + m.res + '</td>'
        + '<td style="padding:6px 8px;font-size:11px;color:#8496aa;text-align:center;">' + (m.nights||0).toLocaleString('en-US') + '</td>'
        + '<td style="padding:6px 8px;font-size:12px;color:#c9a84c;font-weight:700;text-align:center;">' + euroFmt(m.rev) + '</td>'
        + '<td style="padding:6px 8px;font-size:11px;color:#8496aa;text-align:center;">' + euroFmt(m.adr) + '</td>'
        + '<td style="padding:6px 8px;font-size:12px;font-weight:700;text-align:center;color:' + occC + ';">' + m.occ + '%</td>'
        + '<td style="padding:6px 8px;font-size:10px;color:#8496aa;text-align:center;">' + euroFmt(m.flowerRev) + ' / ' + euroFmt(m.gardenRev) + '</td>'
        + '<td style="padding:6px 8px;font-size:10px;text-align:center;"><span style="background:rgba(201,168,76,.12);color:#c9a84c;border-radius:20px;padding:2px 7px;">' + m.topSrc + '</span></td>'
        + '</tr>';
    }).join('');

    var chColors  = ['#f59e0b','#3b82f6','#8b5cf6'];
    var chMedals  = ['\uD83E\uDD47','\uD83E\uDD48','\uD83E\uDD49'];
    var ch3Html   = (sr.top3channels||[]).map(function(ch, i){
      return '<tr>'
        + '<td style="padding:6px 0;font-size:13px;width:22px;">' + (chMedals[i]||'') + '</td>'
        + '<td style="padding:6px 8px;font-size:12px;color:#94a3b8;">' + ch.name + '</td>'
        + '<td style="padding:6px 0;" width="40%"><div style="background:#1e3a5f;border-radius:3px;height:8px;overflow:hidden;"><div style="background:' + chColors[i] + ';height:8px;width:' + ch.barPct + '%;border-radius:3px;"></div></div></td>'
        + '<td style="padding:6px 0 6px 10px;font-size:11px;color:#c8d5e4;text-align:right;white-space:nowrap;">' + euroFmt(ch.rev) + '</td>'
        + '<td style="padding:6px 0 6px 6px;font-size:11px;color:#64748b;white-space:nowrap;">' + ch.nights + ' net\u00eb</td>'
        + '</tr>';
    }).join('');

    salesHtml = '<tr><td style="background:#0f2040;padding:22px 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
      + '<div style="font-size:10px;color:#38bdf8;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;margin-bottom:14px;">05 \u2014 Sales Report \u00b7 ' + (sr.seasonLabel||'Sezoni '+year) + '</div>'

      // 4 KPI cards
      + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>'
      + '<td width="25%" style="padding-right:7px;"><div style="background:#0D1B3E;border-radius:8px;padding:12px 10px;border:1px solid #1e3a5f;text-align:center;"><div style="font-size:15px;font-weight:700;color:#38bdf8;">' + (sr.totalRes||0).toLocaleString('en-US') + '</div><div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">Rezervime</div></div></td>'
      + '<td width="25%" style="padding-right:7px;"><div style="background:#0D1B3E;border-radius:8px;padding:12px 10px;border:1px solid #1e3a5f;text-align:center;"><div style="font-size:15px;font-weight:700;color:#c9a84c;">' + (sr.totalNights||0).toLocaleString('en-US') + '</div><div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">Net\u00eb Total</div></div></td>'
      + '<td width="25%" style="padding-right:7px;"><div style="background:#0D1B3E;border-radius:8px;padding:12px 10px;border:1px solid #1e3a5f;text-align:center;"><div style="font-size:15px;font-weight:700;color:#3b82f6;">' + euroFmt(sr.totalRev||0) + '</div><div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">Revenue Total</div></div></td>'
      + '<td width="25%"><div style="background:#0D1B3E;border-radius:8px;padding:12px 10px;border:1px solid #1e3a5f;text-align:center;"><div style="font-size:15px;font-weight:700;color:#a78bfa;">' + euroFmt(adrTotal) + '</div><div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">ADR mesatar</div></div></td>'
      + '</tr></table>'

      // Flower vs Garden
      + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>'
      + '<td width="50%" style="padding-right:7px;"><div style="background:#0D1B3E;border-radius:8px;padding:14px;border:1px solid #1e3a5f;">'
      +   '<div style="font-size:9px;color:#ef4444;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;font-weight:700;">\uD83C\uDF38 Flower Hotel</div>'
      +   '<div style="font-size:18px;font-weight:700;color:#e2e8f0;">' + euroFmt(sr.flowerRev||0) + '</div>'
      +   '<div style="font-size:11px;color:#64748b;margin-top:4px;">' + (sr.flowerNights||0).toLocaleString('en-US') + ' net\u00eb \u00b7 ADR ' + euroFmt(adrFlower) + '</div>'
      + '</div></td>'
      + '<td width="50%"><div style="background:#0D1B3E;border-radius:8px;padding:14px;border:1px solid #1e3a5f;">'
      +   '<div style="font-size:9px;color:#22c55e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;font-weight:700;">\uD83C\uDF3F Garden Hotel</div>'
      +   '<div style="font-size:18px;font-weight:700;color:#e2e8f0;">' + euroFmt(sr.gardenRev||0) + '</div>'
      +   '<div style="font-size:11px;color:#64748b;margin-top:4px;">' + (sr.gardenNights||0).toLocaleString('en-US') + ' net\u00eb \u00b7 ADR ' + euroFmt(adrGarden) + '</div>'
      + '</div></td></tr></table>'

      // Top 3 channels
      + '<div style="background:#0D1B3E;border-radius:8px;padding:13px;border:1px solid #1e3a5f;margin-bottom:12px;">'
      +   '<div style="font-size:9px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:9px;font-weight:700;">Kanalet Top 3 sipas Shitjeve</div>'
      +   '<table width="100%" cellpadding="0" cellspacing="0">' + ch3Html + '</table>'
      + '</div>'

      // Monthly table
      + '<div style="background:#0D1B3E;border-radius:8px;border:1px solid #1e3a5f;overflow:hidden;">'
      +   '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
      +   '<tr style="border-bottom:1px solid #1e3a5f;background:#091525;">'
      +   '<th style="padding:7px 10px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:left;font-weight:600;">Muaji</th>'
      +   '<th style="padding:7px 8px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Rez.</th>'
      +   '<th style="padding:7px 8px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Net\u00eb</th>'
      +   '<th style="padding:7px 8px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Revenue</th>'
      +   '<th style="padding:7px 8px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">ADR</th>'
      +   '<th style="padding:7px 8px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Occ%</th>'
      +   '<th style="padding:7px 8px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Flower / Garden</th>'
      +   '<th style="padding:7px 8px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:left;font-weight:600;">Kanali #1</th>'
      +   '</tr>'
      +   mBodyHtml
      +   '</table></div>'
      + '</td></tr>\n';
  }


  // ── Build HTML string ─────────────────────────────────────────
  return '<!DOCTYPE html>\n'
+ '<html lang="sq">\n'
+ '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
+ '<title>FLOW \u2014 Raport Ditor ' + date + '</title></head>\n'
+ '<body style="margin:0;padding:0;background:#dce3ed;font-family:\'Segoe UI\',Arial,sans-serif;">\n'
+ '<table width="100%" cellpadding="0" cellspacing="0" style="background:#dce3ed;">'
+ '<tr><td align="center" style="padding:24px 16px;">\n'

// Chrome bar
+ '<table width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;margin-bottom:12px;">'
+ '<tr><td style="background:#ffffff;border-radius:10px;padding:12px 16px;border:1px solid #d0d9e8;">'
+ '<div style="font-size:15px;font-weight:700;color:#1a2a4a;">\uD83D\uDCCB FLOW \u2014 Raport Ditor ' + date + '</div>'
+ '<div style="font-size:11px;color:#8a96a8;margin-top:4px;">'
+ 'Nga: &quot;FLOW Dashboard&quot; &lt;' + (process.env.EMAIL_USER || 'flow@flowerhotels.al') + '&gt; &nbsp;&middot;&nbsp; '
+ 'P\u00ebr: redathana@gmail.com, ernestcaci@gmail.com &nbsp;&middot;&nbsp; ' + dateLabel
+ '</div></td></tr></table>\n'

// Email body open
+ '<table width="660" cellpadding="0" cellspacing="0" style="max-width:660px;width:100%;background:#0a1628;border-radius:14px;overflow:hidden;">\n'

// ── HEADER ──
+ '<tr><td style="background:linear-gradient(135deg,#0D1B3E 0%,#162d5c 100%);padding:24px 30px 18px;border-bottom:2px solid #1e3a6e;">'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
+ '<td><table cellpadding="0" cellspacing="0"><tr>'
+ logoHtml
+ '<td style="vertical-align:middle;">'
+ '<div style="font-size:17px;font-weight:800;color:#ffffff;letter-spacing:0.05em;font-family:Georgia,serif;text-transform:uppercase;">Flower Hotel</div>'
+ '<div style="font-size:9px;color:#4a6fa5;margin-top:3px;letter-spacing:0.1em;text-transform:uppercase;">Golem, Albania</div>'
+ '</td></tr></table></td>'
+ '<td align="right" style="vertical-align:middle;">'
+ '<div style="background:#1e3a6e;border-radius:9px;padding:9px 15px;display:inline-block;text-align:right;">'
+ '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.08em;">Raport Ditor</div>'
+ '<div style="font-size:13px;color:#93c5fd;font-weight:700;margin-top:3px;">' + date + '</div>'
+ '</div></td></tr></table>'
+ '<div style="font-size:11px;color:#3d5475;margin-top:12px;">' + dateLabel + '</div>'
+ '</td></tr>\n'

// ── 01 OVERVIEW ──
+ '<tr><td style="background:#0f2040;padding:22px 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="font-size:10px;color:#3b82f6;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;margin-bottom:14px;">01 \u2014 Overview</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
// Occ KPI
+ '<td width="33%" style="padding-right:7px;">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:13px 10px;border:1px solid #1e3a5f;text-align:center;">'
+ '<div style="font-size:22px;font-weight:700;color:' + occColor + ';">' + fmtN(occ,1) + '%</div>'
+ '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:5px;">Occupancy</div>'
+ '<div style="font-size:10px;color:#334155;margin-top:3px;">' + rooms + ' / ' + totalRooms + ' dhoma</div>'
+ '</div></td>'
// Revenue KPI
+ '<td width="34%" style="padding-right:7px;">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:13px 10px;border:1px solid #1e3a5f;text-align:center;">'
+ '<div style="font-size:16px;font-weight:700;color:#e2e8f0;">' + fmtN(totalLek) + ' <span style="font-size:10px;color:#4a6fa5;">L</span></div>'
+ '<div style="font-size:10px;color:#475a72;margin-top:2px;">\u20ac' + fmtN(totalEur,0) + '</div>'
+ '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">T\u00eb ardhura totale</div>'
+ '<div style="margin-top:3px;">' + chgPct(totalLek, lyTotalLek) + ' <span style="font-size:10px;color:#334155;">vs LY</span></div>'
+ '</div></td>'
// LY KPI
+ '<td width="33%">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:13px 10px;border:1px solid #1e3a5f;text-align:center;">'
+ '<div style="font-size:16px;font-weight:700;color:#64748b;">' + fmtN(lyTotalLek) + ' <span style="font-size:10px;color:#334155;">L</span></div>'
+ '<div style="font-size:10px;color:#334155;margin-top:2px;">' + (year-1) + ' \u2014 e nj\u00ebjta dit\u00eb</div>'
+ '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">Vitin e kaluar (LY)</div>'
+ '</div></td>'
+ '</tr></table>\n'

// Dept table
+ '<div style="background:#0D1B3E;border-radius:8px;border:1px solid #1e3a5f;margin-top:14px;overflow:hidden;">'
+ '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
+ '<tr style="border-bottom:1px solid #1a2d45;">'
+ '<td colspan="5" style="padding:9px 12px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;letter-spacing:0.08em;">'
+ 'T\u00eb Ardhurat sipas Departamentit &nbsp;&middot;&nbsp; <span style="color:#4a6fa5;">' + date + '</span></td></tr>'
+ '<tr style="border-bottom:1px solid #1a2d45;">'
+ '<td style="padding:4px 10px 4px 12px;font-size:9px;color:#3d5070;text-transform:uppercase;width:22%;">Departamenti</td>'
+ '<td style="padding:4px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;width:36%;">Shp\u00ebrndarja</td>'
+ '<td style="padding:4px 6px;font-size:9px;color:#3d5070;text-align:right;width:18%;">Sot</td>'
+ '<td style="padding:4px 6px;font-size:9px;color:#3d5070;text-align:right;width:14%;">LY</td>'
+ '<td style="padding:4px 6px;font-size:9px;color:#3d5070;text-align:right;width:10%;">\u0394%</td>'
+ '</tr>'
+ deptRowsHtml
+ '<tr style="border-top:1px solid #1e3a5f;">'
+ '<td style="padding:7px 10px 7px 12px;font-size:12px;color:#f0c040;font-weight:700;">TOTAL</td>'
+ '<td style="padding:7px 6px;"><div style="background:#111e30;border-radius:3px;height:14px;overflow:hidden;"><div style="background:#f0c040;height:14px;width:100%;border-radius:3px;"></div></div></td>'
+ '<td style="padding:7px 6px;font-size:12px;color:#f0c040;text-align:right;font-weight:700;">' + fmtN(deptTotalLek) + ' L</td>'
+ '<td style="padding:7px 6px;font-size:11px;color:#8a7020;text-align:right;">' + fmtN(deptTotalLyLek) + ' L</td>'
+ '<td style="padding:7px 6px;text-align:right;">' + chgPct(deptTotalLek, deptTotalLyLek) + '</td>'
+ '</tr></table></div>'
+ '</td></tr>\n'

// divider
+ '<tr><td style="background:#0f2040;padding:0 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="height:1px;background:linear-gradient(90deg,transparent,#1e3a5f 20%,#1e3a5f 80%,transparent);"></div></td></tr>\n'

// ── 02 SHPENZIME ──
+ '<tr><td style="background:#0f2040;padding:22px 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="font-size:10px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;margin-bottom:14px;">02 \u2014 Shpenzime Ditore</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
+ '<td width="50%" style="padding-right:7px;">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:13px 10px;border:1px solid #1e3a5f;text-align:center;">'
+ '<div style="font-size:18px;font-weight:700;color:#fbbf24;">' + fmtN(expTotal) + ' <span style="font-size:10px;color:#92400e;">L</span></div>'
+ '<div style="font-size:10px;color:#475a72;margin-top:2px;">\u20ac' + fmtN(expEur,0) + '</div>'
+ '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">Shpenzime totale</div>'
+ '</div></td>'
+ '<td width="50%">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:13px 10px;border:1px solid #1e3a5f;text-align:center;">'
+ '<div style="font-size:18px;font-weight:700;color:#22c55e;">' + fmtN(netAfterExp) + ' <span style="font-size:10px;color:#14532d;">L</span></div>'
+ '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:18px;">Neto (pas shpenzimeve)</div>'
+ '</div></td></tr></table>'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:13px;border:1px solid #1e3a5f;margin-top:10px;">'
+ '<table width="100%" cellpadding="0" cellspacing="0">'
+ '<tr><td style="font-size:9px;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;padding-bottom:7px;">Kategoria</td>'
+ '<td style="font-size:9px;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;padding-bottom:7px;text-align:right;">Shuma</td></tr>'
+ expRowsHtml
+ '</table></div>'
+ '</td></tr>\n'

// divider
+ '<tr><td style="background:#0f2040;padding:0 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="height:1px;background:linear-gradient(90deg,transparent,#1e3a5f 20%,#1e3a5f 80%,transparent);"></div></td></tr>\n'

// ── 03 CASH FLOW ──
+ '<tr><td style="background:#0f2040;padding:22px 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="font-size:10px;color:#22c55e;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;margin-bottom:14px;">03 \u2014 Cash Flow Ditor</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
+ '<td width="33%" style="padding-right:7px;"><div style="background:#0D1B3E;border-radius:8px;padding:13px 10px;border:1px solid #1e3a5f;text-align:center;"><div style="font-size:15px;font-weight:700;color:#22c55e;">' + fmtN(cfIn) + ' L</div><div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:5px;">Hyrje Cash</div></div></td>'
+ '<td width="33%" style="padding-right:7px;"><div style="background:#0D1B3E;border-radius:8px;padding:13px 10px;border:1px solid #1e3a5f;text-align:center;"><div style="font-size:15px;font-weight:700;color:#ef4444;">' + fmtN(cfOut) + ' L</div><div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:5px;">Dalje Cash</div></div></td>'
+ '<td width="34%"><div style="background:#0D1B3E;border-radius:8px;padding:13px 10px;border:1px solid #1e3a5f;text-align:center;"><div style="font-size:15px;font-weight:700;color:' + cfNetCol + ';">' + fmtN(cfNet) + ' L</div><div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:0.06em;margin-top:5px;">Balanci</div></div></td>'
+ '</tr></table>'
+ '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>'
+ '<td width="50%" style="padding-right:7px;vertical-align:top;">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:13px;border:1px solid #1e3a5f;">'
+ '<div style="font-size:9px;color:#22c55e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:7px;">\u25b2 Hyrje</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0">' + cfInHtml + '</table></div></td>'
+ '<td width="50%" style="vertical-align:top;">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:13px;border:1px solid #1e3a5f;">'
+ '<div style="font-size:9px;color:#ef4444;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:7px;">\u25bc Dalje</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0">' + cfOutHtml + '</table></div></td>'
+ '</tr></table>'
+ '</td></tr>\n'

// divider
+ '<tr><td style="background:#0f2040;padding:0 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="height:1px;background:linear-gradient(90deg,transparent,#1e3a5f 20%,#1e3a5f 80%,transparent);"></div></td></tr>\n'

// ── 04 FRONT OFFICE ──
+ '<tr><td style="background:#0f2040;padding:22px 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="font-size:10px;color:#8b5cf6;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;margin-bottom:14px;">04 \u2014 Front Office Report</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'

// OCC card
+ '<td width="33%" style="padding-right:7px;">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:14px 10px;border:1px solid #1e3a5f;text-align:center;">'
+ '<div style="font-size:9px;color:#4a3a70;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:7px;">Occupancy</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
+ '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#4a6fa5;margin-bottom:3px;">Sot</div><div style="font-size:22px;font-weight:700;color:' + occColor + ';">' + fmtN(occ,1) + '%</div><div style="font-size:10px;color:#334155;margin-top:2px;">' + rooms + '/' + totalRooms + '</div></td>'
+ '<td style="text-align:center;width:8%;"><div style="width:1px;height:42px;background:#1e3a5f;margin:0 auto;"></div></td>'
+ '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#334155;margin-bottom:3px;">LY</div><div style="font-size:17px;font-weight:700;color:#475569;">' + fmtN(lyOcc,1) + '%</div><div style="margin-top:3px;">' + chgPP(occ, lyOcc) + '</div></td>'
+ '</tr></table></div></td>'

// ADR card
+ '<td width="33%" style="padding-right:7px;">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:14px 10px;border:1px solid #1e3a5f;text-align:center;">'
+ '<div style="font-size:9px;color:#4a3a70;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:7px;">ADR</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
+ '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#4a6fa5;margin-bottom:3px;">Sot</div><div style="font-size:18px;font-weight:700;color:#a78bfa;">' + fmtN(adr) + ' L</div><div style="font-size:10px;color:#334155;margin-top:2px;">\u20ac' + adrEur + '/nat\u00eb</div></td>'
+ '<td style="text-align:center;width:8%;"><div style="width:1px;height:42px;background:#1e3a5f;margin:0 auto;"></div></td>'
+ '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#334155;margin-bottom:3px;">LY</div><div style="font-size:17px;font-weight:700;color:#475569;">' + fmtN(lyAdr) + ' L</div><div style="margin-top:3px;">' + chgPct(adr, lyAdr) + '</div></td>'
+ '</tr></table></div></td>'

// RevPAR card
+ '<td width="34%">'
+ '<div style="background:#0D1B3E;border-radius:8px;padding:14px 10px;border:1px solid #1e3a5f;text-align:center;">'
+ '<div style="font-size:9px;color:#4a3a70;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:7px;">RevPAR</div>'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
+ '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#4a6fa5;margin-bottom:3px;">Sot</div><div style="font-size:18px;font-weight:700;color:#c4b5fd;">' + fmtN(revpar) + ' L</div><div style="font-size:10px;color:#334155;margin-top:2px;">\u20ac' + revparEur + '</div></td>'
+ '<td style="text-align:center;width:8%;"><div style="width:1px;height:42px;background:#1e3a5f;margin:0 auto;"></div></td>'
+ '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#334155;margin-bottom:3px;">LY</div><div style="font-size:17px;font-weight:700;color:#475569;">' + fmtN(lyRevpar) + ' L</div><div style="margin-top:3px;">' + chgPct(revpar, lyRevpar) + '</div></td>'
+ '</tr></table></div></td>'

+ '</tr></table></td></tr>\n'

// divider
+ '<tr><td style="background:#0f2040;padding:0 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="height:1px;background:linear-gradient(90deg,transparent,#1e3a5f 20%,#1e3a5f 80%,transparent);"></div></td></tr>\n'

// divider
+ '<tr><td style="background:#0f2040;padding:0 30px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="height:1px;background:linear-gradient(90deg,transparent,#1e3a5f 20%,#1e3a5f 80%,transparent);"></div></td></tr>\n'

+ salesHtml

// ── MANAGERIAL NOTE ──
+ '<tr><td style="background:#0f2040;padding:22px 30px 26px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
+ '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.14em;font-weight:700;margin-bottom:14px;">Vler\u00ebsim Manaxherial</div>'
+ '<div style="background:#0a1f42;border-left:3px solid #3b82f6;border-radius:0 8px 8px 0;padding:14px 16px;">'
+ '<div style="font-size:9px;color:#3b82f6;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;font-weight:700;">P\u00ebrmbyllje \u00b7 ' + date + '</div>'
+ '<div style="font-size:12px;color:#94a3b8;line-height:1.75;">'
+ 'Dita e <strong style="color:#bfdbfe;">' + date + '</strong> sh\u00ebnon nj\u00eb performanc\u00eb '
+ '<strong style="color:#bfdbfe;">' + mgrOcc + '</strong>, me ' + rooms + ' dhoma t\u00eb z\u00ebna (' + fmtN(occ,1) + '%) '
+ 'dhe t\u00eb ardhura totale prej <strong style="color:#bfdbfe;">' + fmtN(totalLek) + ' L ' + mgrYoy + '</strong>. '
+ (channels.length > 0 ? '<strong style="color:#bfdbfe;">' + topCh + '</strong> mbetet kanali lider me ' + topChPct + '% t\u00eb rezervimeve. ' : '')
+ 'Balanci cash ditor rezulton <strong style="color:#bfdbfe;">' + fmtN(cfNet) + ' L</strong>, '
+ (cfNet >= 0 ? 'i sh\u00ebnd\u00ebtsh\u00ebm n\u00eb raport me shpenzimet operative.' : 'duke k\u00ebrkuar v\u00ebmendje p\u00ebr menaxhimin e likuiditetit.')
+ (expTotal > 0 ? ' Shpenzimet operative arrit\u00ebn <strong style="color:#bfdbfe;">' + fmtN(expTotal) + ' L</strong>, me neto <strong style="color:#bfdbfe;">' + fmtN(netAfterExp) + ' L</strong>.' : '')
+ '</div></div></td></tr>\n'

// ── FOOTER ──
+ '<tr><td style="background:#0D1B3E;padding:14px 30px;border:1px solid #1e3a5f;border-top:2px solid #1e3a6e;border-radius:0 0 14px 14px;">'
+ '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
+ '<td style="font-size:10px;color:#2a3a50;">Gjeneruar automatikisht nga <strong style="color:#3d5a7a;">FLOW Dashboard</strong></td>'
+ '<td style="font-size:10px;color:#2a3a50;text-align:right;">Flower Hotel \u00b7 Golem, Shqip\u00ebri</td>'
+ '</tr></table></td></tr>\n'

+ '</table>\n'
+ '</td></tr></table>\n'
+ '</body></html>';
}

// ================================================================
//  sendDailyReport
// ================================================================
async function sendDailyReport(date, data, prevData) {
  var transporter = createTransport();
  var to          = process.env.EMAIL_TO || DEFAULT_RECIPIENTS;
  var html        = buildEmailHTML(date, data, prevData);

  var info = await transporter.sendMail({
    from   : '"FLOW Dashboard" <' + process.env.EMAIL_USER + '>',
    to     : to,
    subject: '\uD83D\uDCCB FLOW \u2014 Raport Ditor ' + date,
    html   : html,
  });

  console.log('[EMAIL] Report sent for', date, '\u2192', to, '(id:', info.messageId + ')');
  return info;
}

module.exports = { sendDailyReport, buildEmailHTML };
