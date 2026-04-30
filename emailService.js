'use strict';
// ================================================================
//  emailService.js — FLOW Daily Report  (compact HTML, <80KB)
//  Flower Hotels & Resorts · Golem, Albania
// ================================================================

const nodemailer = require('nodemailer');

const RECIPIENTS = 'redathana@gmail.com,ernestcaci@gmail.com,Financa@hotel-flower.com,info@hotel-flower.com,pandiolakerthi@gmail.com,rinacaci@gmail.com';

// Logo served via URL — no base64 (keeps email under Gmail 102KB limit)
function logoUrl() {
  return process.env.SELF_URL
    ? process.env.SELF_URL.replace(/\/$/, '') + '/icon-192.png'
    : '';
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

// ── Helpers ───────────────────────────────────────────────────
function n(v) { return Number(v) || 0; }
function fL(v, d) {
  d = d || 0;
  if (v == null || isNaN(v)) return '—';
  return Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fE(v) { return '\u20ac' + Math.round(v).toLocaleString('de-DE'); }
function fDate(s) {
  try { return new Date(s + 'T00:00:00').toLocaleDateString('sq-AL', { weekday:'long', year:'numeric', month:'long', day:'numeric' }); }
  catch(_) { return s; }
}
function pct(a, b) {
  if (!b || b === 0) return '';
  var p = ((a - b) / Math.abs(b)) * 100;
  var c = p >= 0 ? '#22c55e' : '#ef4444';
  return '<span style="color:' + c + ';font-size:10px;">' + (p >= 0 ? '\u25b2' : '\u25bc') + ' ' + Math.abs(p).toFixed(1) + '%</span>';
}
function pp(a, b) {
  var d = a - b;
  var c = d >= 0 ? '#22c55e' : '#ef4444';
  return '<span style="color:' + c + ';font-size:10px;">' + (d >= 0 ? '\u25b2' : '\u25bc') + ' ' + Math.abs(d).toFixed(1) + 'pp</span>';
}

// ── Compact card ──────────────────────────────────────────────
function card(content, extra) {
  return '<td style="padding:0 4px 0 0;vertical-align:top;' + (extra||'') + '"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 10px;text-align:center;">'
    + content + '</div></td>';
}
function lbl(txt) { return '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.06em;margin-top:5px;">' + txt + '</div>'; }
function big(txt, color) { return '<div style="font-size:20px;font-weight:700;color:' + (color||'#e2e8f0') + ';line-height:1.1;">' + txt + '</div>'; }
function sub(txt) { return '<div style="font-size:10px;color:#475a72;margin-top:2px;">' + txt + '</div>'; }

// ── Section header ────────────────────────────────────────────
function secHead(num, title, color) {
  return '<div style="font-size:10px;color:' + color + ';text-transform:uppercase;letter-spacing:.14em;font-weight:700;margin-bottom:12px;">'
    + num + ' \u2014 ' + title + '</div>';
}

// ── Thin horizontal rule ──────────────────────────────────────
var HR = '<tr><td style="background:#0f2040;padding:0 28px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;">'
  + '<div style="height:1px;background:linear-gradient(90deg,transparent,#1e3a5f 20%,#1e3a5f 80%,transparent);"></div></td></tr>';

// ── Inner card wrapper ────────────────────────────────────────
function inner(content, mt) {
  return '<div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px;margin-top:' + (mt||10) + 'px;">' + content + '</div>';
}

// ── Table row ────────────────────────────────────────────────
function tr2(a, b, bold) {
  var s = bold ? 'font-weight:700;' : '';
  return '<tr><td style="padding:4px 8px 4px 0;font-size:12px;color:#94a3b8;' + s + '">' + a
    + '</td><td style="padding:4px 0;font-size:12px;color:#e2e8f0;text-align:right;white-space:nowrap;' + s + '">' + b + '</td></tr>';
}

// ── Bar row (dept / CF) ───────────────────────────────────────
function barRow(name, lek, lyLek, color, maxLek) {
  var isNeg = lek < 0;
  var pctW  = maxLek > 0 ? Math.min(Math.abs(lek) / maxLek * 100, 100) : 0;
  var vCol  = isNeg ? '#ef4444' : '#e2e8f0';
  var bar   = isNeg
    ? '<div style="background:#111e30;border-radius:3px;height:10px;position:relative;"><div style="background:#991b1b;height:10px;width:' + pctW + '%;border-radius:3px;position:absolute;right:0;"></div></div>'
    : '<div style="background:#111e30;border-radius:3px;height:10px;overflow:hidden;"><div style="background:' + color + ';height:10px;width:' + pctW + '%;border-radius:3px;"></div></div>';
  var lyD = '';
  if (lyLek != null && lyLek !== 0) {
    var p2 = ((lek - lyLek) / Math.abs(lyLek)) * 100;
    var c2 = p2 >= 0 ? '#22c55e' : '#ef4444';
    lyD = '<span style="color:' + c2 + ';font-size:10px;">' + (p2 >= 0 ? '\u25b2' : '\u25bc') + Math.abs(p2).toFixed(0) + '%</span>';
  }
  return '<tr>'
    + '<td style="padding:4px 6px 4px 10px;font-size:11px;color:#94a3b8;width:24%;">' + name + '</td>'
    + '<td style="padding:4px 4px;width:34%;">' + bar + '</td>'
    + '<td style="padding:4px 4px;font-size:11px;color:' + vCol + ';text-align:right;width:20%;font-weight:600;white-space:nowrap;">' + fL(lek) + ' L</td>'
    + '<td style="padding:4px 4px;font-size:10px;color:#3d5070;text-align:right;width:14%;white-space:nowrap;">' + (lyLek != null ? fL(lyLek) + ' L' : '') + '</td>'
    + '<td style="padding:4px 4px 4px 0;text-align:right;width:8%;">' + lyD + '</td>'
    + '</tr>';
}

// ── CF item row ───────────────────────────────────────────────
function cfRow(label, lek, color) {
  if (!lek) return '';
  return '<tr><td style="padding:3px 8px 3px 0;font-size:11px;color:#8496aa;">' + label
    + '</td><td style="padding:3px 0;font-size:11px;color:' + color + ';text-align:right;font-weight:600;">' + fL(lek) + ' L</td></tr>';
}

// ── Month table row ───────────────────────────────────────────
function moRow(m) {
  var occ = parseFloat(m.occ);
  var oc  = occ >= 70 ? '#22c55e' : occ >= 50 ? '#f59e0b' : '#ef4444';
  return '<tr style="border-bottom:1px solid #0d1a28;">'
    + '<td style="padding:5px 8px;font-size:11px;color:#c9a84c;font-weight:700;">' + m.label + '</td>'
    + '<td style="padding:5px 6px;font-size:11px;color:#8496aa;text-align:center;">' + m.res + '</td>'
    + '<td style="padding:5px 6px;font-size:11px;color:#8496aa;text-align:center;">' + (m.nights||0).toLocaleString('en-US') + '</td>'
    + '<td style="padding:5px 6px;font-size:11px;color:#c9a84c;font-weight:700;text-align:center;">' + fE(m.rev) + '</td>'
    + '<td style="padding:5px 6px;font-size:11px;color:#8496aa;text-align:center;">' + fE(m.adr) + '</td>'
    + '<td style="padding:5px 6px;font-size:11px;font-weight:700;text-align:center;color:' + oc + ';">' + m.occ + '%</td>'
    + '<td style="padding:5px 6px;font-size:10px;color:#8496aa;text-align:center;">' + fE(m.flowerRev) + '/' + fE(m.gardenRev) + '</td>'
    + '<td style="padding:5px 6px;font-size:10px;text-align:center;"><span style="background:rgba(201,168,76,.12);color:#c9a84c;border-radius:20px;padding:2px 6px;">' + m.topSrc + '</span></td>'
    + '</tr>';
}

// ================================================================
//  buildEmailHTML
// ================================================================
function buildEmailHTML(date, d, p) {
  d = d || {}; p = p || {};

  var dateLabel  = fDate(date);
  var year       = parseInt((date||'').slice(0,4)) || new Date().getFullYear();
  var logo       = logoUrl();

  // ── Overview ─────────────────────────────────────────────────
  var occ        = d.occupancyPct || 0;
  var lyOcc      = p.occupancyPct || 0;
  var lyRooms    = (p.fo && p.fo.roomsOccupied) || 0;
  var rooms      = d.roomsOccupied || 0;
  var TR         = d.totalRooms || 110;
  var totalLek   = d.totalRevenueLek || 0;
  var totalEur   = d.totalRevenueEur || 0;
  var lyTotalLek = p.totalRevenueLek || 0;
  var occCol     = occ >= 80 ? '#22c55e' : occ >= 50 ? '#f59e0b' : '#ef4444';

  // ── Departments ───────────────────────────────────────────────
  var rawDepts = d.departments || [];
  var dMap = {};
  rawDepts.forEach(function(dep){ dMap[dep.name] = dep; });
  var DEPTS = [
    {name:'Hotel (\u20ac\u00d7100)',color:'#f0c040'},{name:'Brutal Garden',color:'#ef4444'},
    {name:'Flower Rest.',color:'#f0c040'},{name:'Beach Bar',color:'#f0c040'},
    {name:'Pool Bar',color:'#3b82f6'},{name:'Pool Bar Garden',color:'#8b5cf6'},
    {name:'House Use',color:'#991b1b'},{name:'SPA',color:'#f0c040'},
  ];
  var maxD = 1;
  DEPTS.forEach(function(dep){ var m=dMap[dep.name]; if(m){ var v=Math.abs(n(m.revenueLek)); if(v>maxD) maxD=v; } });
  var deptRows = DEPTS.map(function(dep){
    var m = dMap[dep.name]||{}; return barRow(dep.name, n(m.revenueLek), m.lyLek!=null?n(m.lyLek):null, dep.color, maxD);
  }).join('');

  // ── Expenses ──────────────────────────────────────────────────
  var exp     = d.expenses || {};
  var expT    = n(exp.totalLek);
  var expRows = (exp.items||[]).filter(function(i){ return n(i.lek)!==0; })
    .map(function(i){ return tr2(i.name||i.category||'—', fL(n(i.lek))+' L'); }).join('');

  // ── Cash Flow ─────────────────────────────────────────────────
  var cf       = d.cashFlow || {};
  var cfIn     = n(cf.totalInLek);
  var cfOut    = n(cf.totalOutLek);
  var cfNet    = n(cf.netLek) || (cfIn - cfOut);
  var cfNetC   = cfNet >= 0 ? '#22c55e' : '#ef4444';
  var cfInH    = (cf.inItems||[]).map(function(r){ return cfRow(r.label||r.name||'—', n(r.amountLek||r.lek), '#22c55e'); }).join('');
  var cfOutH   = (cf.outItems||[]).map(function(r){ return cfRow(r.label||r.name||'—', n(r.amountLek||r.lek), '#ef4444'); }).join('');

  // ── FO ────────────────────────────────────────────────────────
  var fo     = d.fo || {};
  var pfo    = p.fo || {};
  var adr    = n(fo.adr);
  var revpar = n(fo.revpar);
  var lyAdr  = n(pfo.adr);
  var lyRvp  = n(pfo.revpar);
  var adrEur = adr ? Math.round(adr/100) : 0;

  // ── DoD operational ───────────────────────────────────────────
  var prevDayLek = n(d.prevDayRevenueLek);
  var dodDiff    = totalLek - prevDayLek;
  var dodPct2    = prevDayLek > 0 ? ((dodDiff/prevDayLek)*100) : 0;
  var dodC       = dodDiff >= 0 ? '#22c55e' : '#ef4444';

  // ── Sales ─────────────────────────────────────────────────────
  var sr = d.salesReport || null;

  // ── Managerial ────────────────────────────────────────────────
  var mgrOcc = occ >= 70 ? 'e lartë' : occ >= 45 ? 'solide për fazën sezonale' : 'e moderuar';
  var mgrYoy = lyTotalLek > 0
    ? '(+' + (((totalLek-lyTotalLek)/lyTotalLek)*100).toFixed(1) + '% krahasuar me ' + (year-1) + ')'
    : '';

  // ── Styles (reused) ───────────────────────────────────────────
  var SEC  = 'background:#0f2040;padding:20px 28px;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;';
  var TDIV = 'style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;overflow:hidden;margin-top:10px;"';

  // ═══════════════════════════════════════════════════════════════
  //  BUILD HTML
  // ═══════════════════════════════════════════════════════════════
  var html = '<!DOCTYPE html><html lang="sq"><head><meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
    + '<title>FLOW \u2014 Raport Ditor ' + date + '</title></head>'
    + '<body style="margin:0;padding:0;background:#dce3ed;font-family:\'Segoe UI\',Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#dce3ed;">'
    + '<tr><td align="center" style="padding:20px 12px;">'
    + '<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">';

  // Chrome bar
  html += '<tr><td style="background:#fff;border-radius:8px;padding:10px 14px;margin-bottom:10px;border:1px solid #d0d9e8;">'
    + '<div style="font-size:14px;font-weight:700;color:#1a2a4a;">\uD83D\uDCCB FLOW \u2014 Raport Ditor ' + date + '</div>'
    + '<div style="font-size:11px;color:#8a96a8;margin-top:3px;">'
    + 'P\u00ebr: redathana@gmail.com, ernestcaci@gmail.com &nbsp;\u00b7&nbsp; ' + dateLabel
    + '</div></td></tr><tr><td style="height:8px;"></td></tr>';

  // Email table
  html += '<tr><td><table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;border-radius:12px;">';

  // ── HEADER ───────────────────────────────────────────────────
  html += '<tr><td style="background:linear-gradient(135deg,#0D1B3E,#162d5c);padding:20px 28px 16px;border-bottom:2px solid #1e3a6e;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td><table cellpadding="0" cellspacing="0"><tr>'
    + (logo ? '<td style="padding-right:12px;"><img src="' + logo + '" width="48" height="48" style="border-radius:50%;background:#fff;padding:3px;display:block;" alt="FH"></td>' : '')
    + '<td><div style="font-size:16px;font-weight:800;color:#fff;font-family:Georgia,serif;text-transform:uppercase;">Flower Hotel</div>'
    + '<div style="font-size:9px;color:#4a6fa5;letter-spacing:.1em;text-transform:uppercase;margin-top:2px;">Golem, Albania</div></td>'
    + '</tr></table></td>'
    + '<td align="right"><div style="background:#1e3a6e;border-radius:8px;padding:8px 13px;text-align:right;">'
    + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.08em;">Raport Ditor</div>'
    + '<div style="font-size:12px;color:#93c5fd;font-weight:700;margin-top:2px;">' + date + '</div>'
    + '</div></td></tr></table>'
    + '<div style="font-size:11px;color:#3d5475;margin-top:10px;">' + dateLabel + '</div>'
    + '</td></tr>';

  // ── 01 OVERVIEW ──────────────────────────────────────────────
  html += '<tr><td style="' + SEC + '">'
    + secHead('01','Overview','#3b82f6')
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + card(big(fL(occ,1)+'%', occCol) + lbl('Occupancy') + '<div style="font-size:10px;color:#334155;margin-top:2px;">' + rooms + '/' + TR + ' dhoma</div>', '')
    + card(big(fL(totalLek)+' L') + sub('\u20ac' + fL(totalEur)) + lbl('T\u00eb ardhura totale') + '<div style="margin-top:3px;">' + pct(totalLek,lyTotalLek) + ' <span style="font-size:9px;color:#334155;">vs LY</span></div>', '')
    + card(big(fL(lyTotalLek)+' L','#64748b') + sub((year-1)+' \u2014 e nj\u00ebjta dit\u00eb') + lbl('Vitin e kaluar (LY)'), 'padding-right:0;')
    + '</tr></table>'
    + '<div ' + TDIV + '>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
    + '<tr style="border-bottom:1px solid #1a2d45;">'
    + '<td colspan="5" style="padding:7px 10px 5px 10px;font-size:9px;color:#3d5070;text-transform:uppercase;letter-spacing:.07em;">T\u00eb Ardhurat sipas Departamentit &nbsp;\u00b7&nbsp; <span style="color:#4a6fa5;">' + date + '</span></td></tr>'
    + '<tr style="border-bottom:1px solid #1a2d45;">'
    + '<td style="padding:3px 6px 3px 10px;font-size:9px;color:#3d5070;width:24%;">Departamenti</td>'
    + '<td style="padding:3px 4px;font-size:9px;color:#3d5070;width:34%;">Shp\u00ebrndarja</td>'
    + '<td style="padding:3px 4px;font-size:9px;color:#3d5070;text-align:right;width:20%;">Sot</td>'
    + '<td style="padding:3px 4px;font-size:9px;color:#3d5070;text-align:right;width:14%;">LY</td>'
    + '<td style="padding:3px 4px;font-size:9px;color:#3d5070;text-align:right;width:8%;">\u0394%</td></tr>'
    + deptRows
    + '<tr style="border-top:1px solid #1e3a5f;">'
    + '<td style="padding:6px 6px 6px 10px;font-size:12px;color:#f0c040;font-weight:700;">TOTAL</td>'
    + '<td style="padding:6px 4px;"><div style="background:#111e30;border-radius:3px;height:12px;overflow:hidden;"><div style="background:#f0c040;height:12px;width:100%;border-radius:3px;"></div></div></td>'
    + '<td style="padding:6px 4px;font-size:12px;color:#f0c040;text-align:right;font-weight:700;">' + fL(totalLek) + ' L</td>'
    + '<td style="padding:6px 4px;font-size:11px;color:#8a7020;text-align:right;">' + fL(lyTotalLek) + ' L</td>'
    + '<td style="padding:6px 4px;text-align:right;">' + pct(totalLek,lyTotalLek) + '</td></tr>'
    + '</table></div>'
    + '</td></tr>' + HR;

  // ── 02 SHPENZIME ─────────────────────────────────────────────
  html += '<tr><td style="' + SEC + '">'
    + secHead('02','Shpenzime Ditore','#f59e0b')
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + card(big(fL(expT)+' <span style="font-size:10px;color:#92400e;">L</span>','#fbbf24') + lbl('Shpenzime totale'), '')
    + card(big(fL(totalLek-expT)+' <span style="font-size:10px;color:#14532d;">L</span>','#22c55e') + lbl('Neto (pas shpenzimeve)'), 'padding-right:0;')
    + '</tr></table>'
    + inner('<table width="100%" cellpadding="0" cellspacing="0">'
        + '<tr><td style="font-size:9px;color:#92400e;text-transform:uppercase;padding-bottom:6px;">Kategoria</td>'
        + '<td style="font-size:9px;color:#92400e;text-transform:uppercase;padding-bottom:6px;text-align:right;">Shuma</td></tr>'
        + expRows + '</table>', 10)
    + '</td></tr>' + HR;

  // ── 03 CASH FLOW ─────────────────────────────────────────────
  html += '<tr><td style="' + SEC + '">'
    + secHead('03','Cash Flow Ditor','#22c55e')
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + card(big(fL(cfIn)+' L','#22c55e') + lbl('Hyrje Cash'), '')
    + card(big(fL(cfOut)+' L','#ef4444') + lbl('Dalje Cash'), '')
    + card(big(fL(cfNet)+' L',cfNetC) + lbl('Balanca'), 'padding-right:0;')
    + '</tr></table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>'
    + '<td width="50%" style="padding-right:5px;vertical-align:top;">'
    + inner('<div style="font-size:9px;color:#22c55e;text-transform:uppercase;margin-bottom:6px;">\u25b2 Hyrje</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">' + cfInH + '</table>', 0)
    + '</td><td width="50%" style="vertical-align:top;">'
    + inner('<div style="font-size:9px;color:#ef4444;text-transform:uppercase;margin-bottom:6px;">\u25bc Dalje</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">' + cfOutH + '</table>', 0)
    + '</td></tr></table>'
    + '</td></tr>' + HR;

  // ── 04 FRONT OFFICE ──────────────────────────────────────────
  html += '<tr><td style="' + SEC + '">'
    + secHead('04','Front Office Report','#8b5cf6')
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    // OCC
    + '<td style="padding-right:5px;width:33%;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 8px;">'
    + '<div style="font-size:9px;color:#4a3a70;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;text-align:center;">Occupancy</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#4a6fa5;margin-bottom:3px;">Sot</div>'
    + '<div style="font-size:20px;font-weight:700;color:' + occCol + ';">' + fL(occ,1) + '%</div>'
    + '<div style="font-size:9px;color:#334155;margin-top:2px;">' + rooms + '/' + TR + '</div></td>'
    + '<td style="text-align:center;width:8%;"><div style="width:1px;height:40px;background:#1e3a5f;margin:0 auto;"></div></td>'
    + '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#334155;margin-bottom:3px;">LY</div>'
    + '<div style="font-size:17px;font-weight:700;color:#475569;">' + fL(lyOcc,1) + '%</div>'
    + '<div style="font-size:9px;color:#334155;margin-top:1px;">' + (lyRooms||'—') + '/110</div>'
    + '<div style="margin-top:2px;">' + pp(occ,lyOcc) + '</div></td>'
    + '</tr></table></div></td>'
    // ADR
    + '<td style="padding-right:5px;width:33%;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 8px;">'
    + '<div style="font-size:9px;color:#4a3a70;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;text-align:center;">ADR</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#4a6fa5;margin-bottom:3px;">Sot</div>'
    + '<div style="font-size:17px;font-weight:700;color:#a78bfa;">' + fL(adr) + ' L</div>'
    + '<div style="font-size:9px;color:#334155;margin-top:2px;">\u20ac' + adrEur + '/nat\u00eb</div></td>'
    + '<td style="text-align:center;width:8%;"><div style="width:1px;height:40px;background:#1e3a5f;margin:0 auto;"></div></td>'
    + '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#334155;margin-bottom:3px;">LY</div>'
    + '<div style="font-size:17px;font-weight:700;color:#475569;">' + fL(lyAdr) + ' L</div>'
    + '<div style="margin-top:2px;">' + pct(adr,lyAdr) + '</div></td>'
    + '</tr></table></div></td>'
    // RevPAR
    + '<td style="width:34%;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 8px;">'
    + '<div style="font-size:9px;color:#4a3a70;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;text-align:center;">RevPAR</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#4a6fa5;margin-bottom:3px;">Sot</div>'
    + '<div style="font-size:17px;font-weight:700;color:#c4b5fd;">' + fL(revpar) + ' L</div>'
    + '<div style="font-size:9px;color:#334155;margin-top:2px;">\u20ac' + (revpar?Math.round(revpar/100):0) + '</div></td>'
    + '<td style="text-align:center;width:8%;"><div style="width:1px;height:40px;background:#1e3a5f;margin:0 auto;"></div></td>'
    + '<td style="text-align:center;width:46%;"><div style="font-size:9px;color:#334155;margin-bottom:3px;">LY</div>'
    + '<div style="font-size:17px;font-weight:700;color:#475569;">' + fL(lyRvp) + ' L</div>'
    + '<div style="margin-top:2px;">' + pct(revpar,lyRvp) + '</div></td>'
    + '</tr></table></div></td>'
    + '</tr></table></td></tr>' + HR;

  // ── 05 SALES REPORT ──────────────────────────────────────────
  html += '<tr><td style="' + SEC + '">'
    + '<div style="font-size:10px;color:#38bdf8;text-transform:uppercase;letter-spacing:.14em;font-weight:700;margin-bottom:3px;">05 \u2014 Sales Report \u00b7 Prill \u2013 Tetor ' + year + '</div>';

  if (!sr) {
    html += '<div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px;font-size:11px;color:#475569;text-align:center;margin-top:8px;">Nuk ka t\u00eb dh\u00ebna Sales \u2014 ngarko Excel-in n\u00eb dashboard.</div>';
  } else {
    var adrT = sr.totalNights  > 0 ? Math.round(sr.totalRev    / sr.totalNights)  : 0;
    var adrF = sr.flowerNights > 0 ? Math.round(sr.flowerRev   / sr.flowerNights) : 0;
    var adrG = sr.gardenNights > 0 ? Math.round(sr.gardenRev   / sr.gardenNights) : 0;
    var upTs = sr.uploadTs
      ? new Date(sr.uploadTs).toLocaleString('sq-AL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : date;

    html += '<div style="font-size:10px;color:#334155;margin-bottom:10px;">Update: ' + upTs + '</div>';

    // 4 KPIs
    html += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr>'
      + card(big((sr.totalRes||0).toLocaleString('en-US'),'#38bdf8') + lbl('Rezervime'), '')
      + card(big((sr.totalNights||0).toLocaleString('en-US'),'#c9a84c') + lbl('Net\u00eb Total'), '')
      + card(big(fE(sr.totalRev||0),'#3b82f6') + lbl('Revenue Total'), '')
      + card(big(fE(adrT),'#a78bfa') + lbl('ADR mesatar'), 'padding-right:0;')
      + '</tr></table>';

    // DoD
    if (sr.prevTotalRev != null) {
      var diff2  = (sr.totalRev||0) - sr.prevTotalRev;
      var diffP  = sr.prevTotalRev > 0 ? ((diff2/sr.prevTotalRev)*100) : 0;
      var dC2    = diff2 >= 0 ? '#22c55e' : '#ef4444';
      var dSgn   = diff2 >= 0 ? '+' : '';
      var prevLbl = (sr.prevFilename||'Excel i m\u00ebparsh\u00ebm').replace(/^.*[\\/]/,'').replace(/\.xlsx?$/i,'');
      html += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr>'
        + '<td width="50%" style="padding-right:5px;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 10px;text-align:center;">'
        + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">\u0394 Revenue \u2014 Ndryshimi i Shitjeve</div>'
        + '<div style="font-size:9px;color:#334155;margin-bottom:6px;">' + prevLbl.substring(0,28) + (prevLbl.length>28?'\u2026':'') + '</div>'
        + '<div style="font-size:22px;font-weight:700;color:' + dC2 + ';">' + dSgn + fE(diff2) + '</div>'
        + '<div style="font-size:13px;color:' + dC2 + ';margin-top:3px;font-weight:600;">' + (diff2>=0?'\u25b2':'\u25bc') + ' ' + Math.abs(diffP).toFixed(1) + '%</div>'
        + '</div></td>'
        + '<td width="50%"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 10px;text-align:center;">'
        + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Aktual \u00b7 ' + (sr.seasonLabel||'Sezoni') + '</div>'
        + '<div style="font-size:22px;font-weight:700;color:#38bdf8;">' + fE(sr.totalRev||0) + '</div>'
        + '<div style="font-size:10px;color:#334155;margin-top:4px;">' + (sr.totalNights||0).toLocaleString('en-US') + ' net\u00eb \u00b7 ADR ' + fE(adrT) + '</div>'
        + '</div></td></tr></table>';
    } else {
      html += '<div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:10px;font-size:10px;color:#334155;text-align:center;margin-bottom:10px;">'
        + '\u0394 Revenue: ngarko Excel-in dy her\u00eb radhazi p\u00ebr t\u00eb aktivizuar krahasimin'
        + '</div>';
    }

    // Flower / Garden
    html += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr>'
      + '<td width="50%" style="padding-right:5px;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px;">'
      + '<div style="font-size:9px;color:#ef4444;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700;">FLOWER HOTEL</div>'
      + '<div style="font-size:18px;font-weight:700;color:#e2e8f0;">' + fE(sr.flowerRev||0) + '</div>'
      + '<div style="font-size:10px;color:#64748b;margin-top:3px;">' + (sr.flowerNights||0).toLocaleString('en-US') + ' net\u00eb \u00b7 ADR ' + fE(adrF) + '</div>'
      + '</div></td>'
      + '<td width="50%"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px;">'
      + '<div style="font-size:9px;color:#22c55e;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700;">GARDEN HOTEL</div>'
      + '<div style="font-size:18px;font-weight:700;color:#e2e8f0;">' + fE(sr.gardenRev||0) + '</div>'
      + '<div style="font-size:10px;color:#64748b;margin-top:3px;">' + (sr.gardenNights||0).toLocaleString('en-US') + ' net\u00eb \u00b7 ADR ' + fE(adrG) + '</div>'
      + '</div></td></tr></table>';

    // Top 3 channels
    var ch3 = (sr.top3channels||[]).map(function(ch,i){
      var chC = ['#f59e0b','#3b82f6','#8b5cf6'][i]||'#64748b';
      return '<tr><td style="padding:5px 0;font-size:11px;color:#64748b;font-weight:700;width:20px;">' + (i+1) + '.</td>'
        + '<td style="padding:5px 6px;font-size:12px;color:#94a3b8;">' + ch.name + '</td>'
        + '<td style="padding:5px 0;width:38%;"><div style="background:#1e3a5f;border-radius:3px;height:8px;overflow:hidden;"><div style="background:' + chC + ';height:8px;width:' + ch.barPct + '%;border-radius:3px;"></div></div></td>'
        + '<td style="padding:5px 0 5px 8px;font-size:11px;color:#c8d5e4;text-align:right;white-space:nowrap;">' + fE(ch.rev) + '</td>'
        + '</tr>';
    }).join('');
    html += inner('<div style="font-size:9px;color:#c9a84c;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;font-weight:700;">Kanalet Top 3 sipas Shitjeve</div>'
      + '<table width="100%" cellpadding="0" cellspacing="0">' + ch3 + '</table>', 0);

    // Monthly table
    var moH = (sr.monthRows||[]).map(moRow).join('');
    html += '<div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;margin-top:10px;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
      + '<tr style="border-bottom:1px solid #1e3a5f;background:#091525;">'
      + '<th style="padding:6px 8px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:left;font-weight:600;">Muaji</th>'
      + '<th style="padding:6px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Rez.</th>'
      + '<th style="padding:6px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Net\u00eb</th>'
      + '<th style="padding:6px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Revenue</th>'
      + '<th style="padding:6px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">ADR</th>'
      + '<th style="padding:6px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Occ%</th>'
      + '<th style="padding:6px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">F/G</th>'
      + '<th style="padding:6px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:left;font-weight:600;">Kanali #1</th>'
      + '</tr>' + moH
      + '</table></div>';
  }
  html += '</td></tr>' + HR;

  // ── VLERËSIM MANAXHERIAL ─────────────────────────────────────
  html += '<tr><td style="' + SEC + 'padding-bottom:22px;">'
    + secHead('','Vler\u00ebsim Manaxherial','#94a3b8')
    + '<div style="background:#0a1f42;border-left:3px solid #3b82f6;border-radius:0 7px 7px 0;padding:12px 14px;">'
    + '<div style="font-size:9px;color:#3b82f6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px;font-weight:700;">P\u00ebrmbyllje \u00b7 ' + date + '</div>'
    + '<div style="font-size:12px;color:#94a3b8;line-height:1.7;">'
    + 'Dita e <strong style="color:#bfdbfe;">' + date + '</strong> sh\u00ebnon nj\u00eb performanc\u00eb '
    + '<strong style="color:#bfdbfe;">' + mgrOcc + '</strong>, me ' + rooms + ' dhoma t\u00eb z\u00ebna (' + fL(occ,1) + '%) '
    + 'dhe t\u00eb ardhura totale prej <strong style="color:#bfdbfe;">' + fL(totalLek) + ' L ' + mgrYoy + '</strong>. '
    + 'Balanca cash ditore rezulton <strong style="color:' + cfNetC + ';">' + fL(cfNet) + ' L</strong>'
    + (cfNet < 0 ? ', duke k\u00ebrkuar v\u00ebmendje p\u00ebr menaxhimin e likuiditetit.' : ', e sh\u00ebnd\u00ebtshme n\u00eb raport me shpenzimet operative.')
    + (expT > 0 ? ' Shpenzimet operative arrit\u00ebn <strong style="color:#bfdbfe;">' + fL(expT) + ' L</strong>, me neto <strong style="color:#bfdbfe;">' + fL(totalLek-expT) + ' L</strong>.' : '')
    + '</div></div>'
    + '</td></tr>';

  // ── FOOTER ───────────────────────────────────────────────────
  html += '<tr><td style="background:#0D1B3E;padding:12px 28px;border:1px solid #1e3a5f;border-top:2px solid #1e3a6e;border-radius:0 0 12px 12px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="font-size:10px;color:#2a3a50;">Gjeneruar automatikisht nga <strong style="color:#3d5a7a;">FLOW Dashboard</strong></td>'
    + '<td style="font-size:10px;color:#2a3a50;text-align:right;">Flower Hotel \u00b7 Golem, Shqip\u00ebri</td>'
    + '</tr></table></td></tr>';

  html += '</table></td></tr>' // email table
    + '</table></td></tr></table>' // outer wrapper
    + '</body></html>';

  return html;
}

// ================================================================
async function sendDailyReport(date, data, prevData) {
  var transporter = createTransport();
  var html        = buildEmailHTML(date, data, prevData);
  var info = await transporter.sendMail({
    from   : '"FLOW Dashboard" <' + process.env.EMAIL_USER + '>',
    to     : process.env.EMAIL_TO || RECIPIENTS,
    subject: '\uD83D\uDCCB FLOW \u2014 Raport Ditor ' + date,
    html   : html,
  });
  console.log('[EMAIL] Sent for', date, '\u2192', info.messageId);
  return info;
}

module.exports = { sendDailyReport, buildEmailHTML };
