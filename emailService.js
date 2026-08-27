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
function barRow(name, lek, lyLek, color, maxLek, mtdLek) {
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
    + '<td style="padding:4px 6px 4px 10px;font-size:11px;color:#94a3b8;width:20%;">' + name + '</td>'
    + '<td style="padding:4px 4px;width:22%;">' + bar + '</td>'
    + '<td style="padding:4px 4px;font-size:11px;color:' + vCol + ';text-align:right;width:16%;font-weight:600;white-space:nowrap;">' + fL(lek) + ' L</td>'
    + '<td style="padding:4px 4px;font-size:10px;color:#3d5070;text-align:right;width:14%;white-space:nowrap;">' + (lyLek != null ? fL(lyLek) + ' L' : '') + '</td>'
    + '<td style="padding:4px 4px;text-align:right;width:8%;">' + lyD + '</td>'
    + '<td style="padding:4px 8px 4px 4px;font-size:11px;color:#e2e8f0;text-align:right;width:20%;font-weight:600;white-space:nowrap;">' + (mtdLek != null ? fL(mtdLek) + ' L' : '0 L') + '</td>'
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
  var lyTotalLek  = p.totalRevenueLek || 0;
  var mtdTotalLek = d.mtdTotalRevenueLek || 0;
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
    var m = dMap[dep.name]||{}; return barRow(dep.name, n(m.revenueLek), m.lyLek!=null?n(m.lyLek):null, dep.color, maxD, m.mtdLek!=null?n(m.mtdLek):null);
  }).join('');

  // ── Expenses ──────────────────────────────────────────────────
  var exp     = d.expenses || {};
  var expT    = n(exp.totalLek);
  var expMtdT = (exp.items||[]).reduce(function(s,i){ return s + n(i.mtdLek); }, 0);
  var expRows = (exp.items||[]).filter(function(i){ return n(i.lek)!==0 || n(i.mtdLek)!==0; })
    .map(function(i){
      return '<tr>'
        + '<td style="padding:4px 8px 4px 0;font-size:12px;color:#94a3b8;">' + (i.name||i.category||'—') + '</td>'
        + '<td style="padding:4px 8px 4px 0;font-size:12px;color:#e2e8f0;text-align:right;white-space:nowrap;">' + fL(n(i.lek)) + ' L</td>'
        + '<td style="padding:4px 0;font-size:12px;color:#e2e8f0;text-align:right;white-space:nowrap;">' + fL(n(i.mtdLek)) + ' L</td>'
        + '</tr>';
    }).join('');

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
  var mgrOcc = occ >= 70 ? 'të lartë' : occ >= 45 ? 'solide për fazën sezonale' : 'të moderuar';
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
    + '<title>FLOW \u2014 Raport Ditor ' + date + '</title>'
    + '<style>body,table,td{-webkit-text-size-adjust:100%;}</style>'
    + '</head>'
    + '<body style="margin:0;padding:0;background:#dce3ed;font-family:\'Segoe UI\',Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#dce3ed;">'
    + '<tr><td align="center" style="padding:20px 12px;">'
    + '<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">';

  // Chrome bar
  html += '<tr><td style="background:#fff;border-radius:8px;padding:10px 14px;margin-bottom:10px;border:1px solid #d0d9e8;">'
    + '<div style="font-size:14px;font-weight:700;color:#1a2a4a;">\uD83D\uDCCB FLOW \u2014 Raport Ditor ' + date + '</div>'
    + '<div style="font-size:11px;color:#8a96a8;margin-top:3px;">'
    + dateLabel
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
    + '<td colspan="6" style="padding:7px 10px 5px 10px;font-size:9px;color:#3d5070;text-transform:uppercase;letter-spacing:.07em;">T\u00eb Ardhurat sipas Departamentit &nbsp;\u00b7&nbsp; <span style="color:#4a6fa5;">' + date + '</span></td></tr>'
    + '<tr style="border-bottom:1px solid #1a2d45;">'
    + '<td style="padding:3px 6px 3px 10px;font-size:9px;color:#3d5070;width:20%;">Departamenti</td>'
    + '<td style="padding:3px 4px;font-size:9px;color:#3d5070;width:22%;">Shp\u00ebrndarja</td>'
    + '<td style="padding:3px 4px;font-size:9px;color:#3d5070;text-align:right;width:16%;">Sot</td>'
    + '<td style="padding:3px 4px;font-size:9px;color:#3d5070;text-align:right;width:14%;">LY</td>'
    + '<td style="padding:3px 4px;font-size:9px;color:#3d5070;text-align:right;width:8%;">\u0394%</td>'
    + '<td style="padding:3px 8px 3px 4px;font-size:9px;color:#3d5070;text-align:right;width:20%;">MTD</td></tr>'
    + deptRows
    + '<tr style="border-top:1px solid #1e3a5f;">'
    + '<td style="padding:6px 6px 6px 10px;font-size:12px;color:#f0c040;font-weight:700;">TOTAL</td>'
    + '<td style="padding:6px 4px;"><div style="background:#111e30;border-radius:3px;height:12px;overflow:hidden;"><div style="background:#f0c040;height:12px;width:100%;border-radius:3px;"></div></div></td>'
    + '<td style="padding:6px 4px;font-size:12px;color:#f0c040;text-align:right;font-weight:700;">' + fL(totalLek) + ' L</td>'
    + '<td style="padding:6px 4px;font-size:11px;color:#8a7020;text-align:right;">' + fL(lyTotalLek) + ' L</td>'
    + '<td style="padding:6px 4px;text-align:right;">' + pct(totalLek,lyTotalLek) + '</td>'
    + '<td style="padding:6px 8px 6px 4px;font-size:12px;color:#f0c040;text-align:right;font-weight:700;">' + fL(mtdTotalLek) + ' L</td></tr>'
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
        + '<td style="font-size:9px;color:#92400e;text-transform:uppercase;padding-bottom:6px;text-align:right;padding-right:8px;">Sot</td>'
        + '<td style="font-size:9px;color:#92400e;text-transform:uppercase;padding-bottom:6px;text-align:right;">MTD</td></tr>'
        + expRows
        + '<tr style="border-top:1px solid #1e3a5f;">'
        + '<td style="padding:6px 8px 6px 0;font-size:12px;color:#f0c040;font-weight:700;">TOTAL</td>'
        + '<td style="padding:6px 8px 6px 0;font-size:12px;color:#f0c040;text-align:right;font-weight:700;white-space:nowrap;">' + fL(expT) + ' L</td>'
        + '<td style="padding:6px 0;font-size:12px;color:#f0c040;text-align:right;font-weight:700;white-space:nowrap;">' + fL(expMtdT) + ' L</td>'
        + '</tr>'
        + '</table>', 10)
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
    + '<div style="font-size:9px;color:#334155;margin-top:1px;">' + (lyRooms||'—') + '/' + (p.totalRooms||110) + '</div>'
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

  // ── 05 SHITJET E DITËS ───────────────────────────────────────
  var ds = d.dailySales || null;
  html += '<tr><td style="' + SEC + '">'
    + secHead('05','Shitjet e Ditës','#c9a84c');

  if (!ds) {
    html += '<div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px;font-size:11px;color:#475569;text-align:center;">Nuk ka të dhëna shitjesh — ngarko Excel-in e Trinisoft në dashboard (kolona AF "Data Krijimit").</div>';
  } else {
    var dsAdrC = '#a78bfa';
    html += '<div style="font-size:10px;color:#334155;margin-bottom:10px;">Rezervimet e krijuara më ' + fDate(ds.day)
      + (ds.stale ? ' <span style="color:#f59e0b;">· Excel-i i fundit i ngarkuar është i kësaj date, jo i ' + ds.reportDate + '</span>' : '')
      + '</div>';

    // 4 KPIs
    html += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr>'
      + card(big((ds.res||0).toLocaleString('en-US'),'#38bdf8') + lbl('Rezervime të reja')
             + '<div style="font-size:10px;color:#334155;margin-top:2px;">ALOS ' + ds.alos.toFixed(1) + ' netë</div>', '')
      + card(big(fL(ds.nights),'#c9a84c') + lbl('Netë të shitura')
             + '<div style="font-size:10px;color:#334155;margin-top:2px;">' + ds.channelsTotal + ' kanale</div>', '')
      + card(big(fE(ds.rev||0),'#3b82f6') + lbl('Shitje')
             + '<div style="margin-top:3px;">' + pct(ds.rev, ds.prevRev) + ' <span style="font-size:9px;color:#334155;">vs dje</span></div>', '')
      + card(big(fE(ds.adr||0),dsAdrC) + lbl('ADR')
             + '<div style="font-size:10px;color:#334155;margin-top:2px;">' + (ds.lead != null ? Math.round(ds.lead) + ' ditë lead' : '—') + '</div>', 'padding-right:0;')
      + '</tr></table>';

    // run-rate + MTD strip
    var rrDiff = ds.avg7 > 0 ? ((ds.rev - ds.avg7) / ds.avg7) * 100 : 0;
    var rrC    = rrDiff >= 0 ? '#22c55e' : '#ef4444';
    html += inner('<table width="100%" cellpadding="0" cellspacing="0"><tr>'
      + '<td style="width:50%;vertical-align:top;padding-right:8px;">'
      + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.07em;font-weight:700;">Mesatarja 7-ditore</div>'
      + '<div style="font-size:16px;font-weight:700;color:#c8d5e4;margin-top:3px;">' + fE(ds.avg7) + '</div>'
      + '<div style="font-size:10px;color:#475a72;margin-top:2px;">'
      + (ds.avg7Days ? '<span style="color:' + rrC + ';">' + (rrDiff >= 0 ? '▲' : '▼') + ' ' + Math.abs(rrDiff).toFixed(0) + '%</span> sot vs mesatarja' : 'pa histori')
      + '</div></td>'
      + '<td style="width:50%;vertical-align:top;border-left:1px solid #1e3a5f;padding-left:12px;">'
      + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.07em;font-weight:700;">Muaji deri sot</div>'
      + '<div style="font-size:16px;font-weight:700;color:#c9a84c;margin-top:3px;">' + fE(ds.mtd.rev) + '</div>'
      + '<div style="font-size:10px;color:#475a72;margin-top:2px;">' + ds.mtd.res + ' rez. · ' + fL(ds.mtd.nights) + ' netë</div>'
      + '</td></tr></table>', 0);

    // channels + ADR
    var dsMaxCh = (ds.channels[0] || {}).rev || 1;
    var chRows = ds.channels.map(function (c, i) {
      var cc = ['#c9a84c','#3b82f6','#14b8a6','#8b5cf6','#f59e0b','#ec4899'][i] || '#64748b';
      return '<tr style="border-bottom:1px solid #0d1a28;">'
        + '<td style="padding:5px 6px 5px 0;font-size:11px;color:#c8d5e4;">' + c.name + '</td>'
        + '<td style="padding:5px 4px;width:26%;"><div style="background:#111e30;border-radius:3px;height:8px;overflow:hidden;"><div style="background:' + cc + ';height:8px;width:' + Math.max(2, Math.round(c.rev / dsMaxCh * 100)) + '%;border-radius:3px;"></div></div></td>'
        + '<td style="padding:5px 4px;font-size:11px;color:#8496aa;text-align:center;">' + c.res + '</td>'
        + '<td style="padding:5px 4px;font-size:11px;color:#8496aa;text-align:center;">' + fL(c.nights) + '</td>'
        + '<td style="padding:5px 4px;font-size:11px;color:#c9a84c;font-weight:700;text-align:right;white-space:nowrap;">' + fE(c.rev) + '</td>'
        + '<td style="padding:5px 0 5px 6px;font-size:11px;color:#94a3b8;text-align:right;white-space:nowrap;">' + fE(c.adr) + '</td>'
        + '</tr>';
    }).join('');
    html += '<div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px;margin-top:10px;">'
      + '<div style="font-size:9px;color:#c9a84c;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700;">Sipas Kanalit &amp; ADR</div>'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'
      + '<tr><th style="padding:4px 6px 4px 0;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:left;font-weight:600;">Kanali</th>'
      + '<th></th>'
      + '<th style="padding:4px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Rez.</th>'
      + '<th style="padding:4px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:center;font-weight:600;">Netë</th>'
      + '<th style="padding:4px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:right;font-weight:600;">Shitje</th>'
      + '<th style="padding:4px 0 4px 6px;font-size:9px;color:#3d5070;text-transform:uppercase;text-align:right;font-weight:600;">ADR</th></tr>'
      + chRows
      + '<tr><td style="padding:6px 6px 0 0;font-size:11px;color:#c9a84c;font-weight:700;">TOTALI</td><td></td>'
      + '<td style="padding:6px 4px 0;font-size:11px;color:#c9a84c;font-weight:700;text-align:center;">' + ds.res + '</td>'
      + '<td style="padding:6px 4px 0;font-size:11px;color:#c9a84c;font-weight:700;text-align:center;">' + fL(ds.nights) + '</td>'
      + '<td style="padding:6px 4px 0;font-size:11px;color:#c9a84c;font-weight:700;text-align:right;">' + fE(ds.rev) + '</td>'
      + '<td style="padding:6px 0 0 6px;font-size:11px;color:#c9a84c;font-weight:700;text-align:right;">' + fE(ds.adr) + '</td></tr>'
      + '</table>'
      + (ds.channelsTotal > ds.channels.length ? '<div style="font-size:9px;color:#3d5070;margin-top:6px;">+' + (ds.channelsTotal - ds.channels.length) + ' kanale të tjera më të vogla</div>' : '')
      + '</div>';

    // packages | nationalities
    function dsMini(title, items, color) {
      var mx = (items[0] || {}).rev || 1;
      return '<div style="font-size:9px;color:' + color + ';text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700;">' + title + '</div>'
        + '<table width="100%" cellpadding="0" cellspacing="0">'
        + items.map(function (p) {
            return '<tr><td style="padding:3px 6px 3px 0;font-size:11px;color:#94a3b8;">' + p.name + '</td>'
              + '<td style="padding:3px 4px;width:34%;"><div style="background:#111e30;border-radius:3px;height:7px;overflow:hidden;"><div style="background:' + color + ';height:7px;width:' + Math.max(2, Math.round(p.rev / mx * 100)) + '%;border-radius:3px;"></div></div></td>'
              + '<td style="padding:3px 0;font-size:11px;color:#c8d5e4;text-align:right;white-space:nowrap;">' + fE(p.rev) + '</td></tr>';
          }).join('')
        + '</table>';
    }
    html += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>'
      + '<td style="width:50%;padding-right:5px;vertical-align:top;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px;">'
      + dsMini('Paketa (Kompania)', ds.packages, '#14b8a6') + '</div></td>'
      + '<td style="width:50%;padding-left:5px;vertical-align:top;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px;">'
      + dsMini('Nacionaliteti', ds.nats, '#8b5cf6') + '</div></td>'
      + '</tr></table>';

    // stay-month distribution
    var dsMaxMo = ds.months.reduce(function (m, x) { return Math.max(m, x.rev); }, 1);
    html += inner('<div style="font-size:9px;color:#c9a84c;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;font-weight:700;">Për cilët muaj u shit</div>'
      + '<table width="100%" cellpadding="0" cellspacing="0">'
      + ds.months.map(function (m) {
          return '<tr><td style="padding:3px 6px 3px 0;font-size:11px;color:#94a3b8;width:22%;">' + m.label + '</td>'
            + '<td style="padding:3px 4px;"><div style="background:#111e30;border-radius:3px;height:7px;overflow:hidden;"><div style="background:#3b82f6;height:7px;width:' + Math.max(2, Math.round(m.rev / dsMaxMo * 100)) + '%;border-radius:3px;"></div></div></td>'
            + '<td style="padding:3px 6px;font-size:11px;color:#8496aa;text-align:right;white-space:nowrap;">' + fL(m.nights) + ' netë</td>'
            + '<td style="padding:3px 0;font-size:11px;color:#c8d5e4;text-align:right;white-space:nowrap;">' + fE(m.rev) + '</td></tr>';
        }).join('')
      + '</table>', 10);
  }
  html += '</td></tr>' + HR;

  // ── 06 SALES REPORT ──────────────────────────────────────────
  html += '<tr><td style="' + SEC + '">'
    + '<div style="font-size:10px;color:#38bdf8;text-transform:uppercase;letter-spacing:.14em;font-weight:700;margin-bottom:3px;">06 \u2014 Daily Pick Up \u2014 Vjetor</div>';

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
      var prevLbl = (sr.prevFilename||'Excel i mëparshëm').replace(/^.*[\\/]/,'').replace(/\.xlsx?$/i,'');
      html += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr>'
        + '<td width="50%" style="padding-right:5px;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 10px;text-align:center;">'
        + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">\u0394 Daily Pick Up \u2014 vs Raporti i M\u00ebparsh\u00ebm</div>'
        + '<div style="font-size:9px;color:#334155;margin-bottom:6px;">' + prevLbl + '</div>'
        + '<div style="font-size:22px;font-weight:700;color:' + dC2 + ';">' + dSgn + fE(diff2) + '</div>'
        + '<div style="font-size:13px;color:' + dC2 + ';margin-top:3px;font-weight:600;">' + (diff2>=0?'\u25b2':'\u25bc') + ' ' + Math.abs(diffP).toFixed(1) + '%</div>'
        + '</div></td>'
        + '<td width="50%"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 10px;text-align:center;">'
        + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Shitje vjetore hotel</div>'
        + '<div style="font-size:22px;font-weight:700;color:#38bdf8;">' + fE(sr.totalRev||0) + '</div>'
        + '<div style="font-size:10px;color:#334155;margin-top:4px;">' + (sr.totalNights||0).toLocaleString('en-US') + ' net\u00eb \u00b7 ADR ' + fE(adrT) + '</div>'
        + '</div></td></tr></table>';
    } else {
      html += '<div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:10px;font-size:10px;color:#334155;text-align:center;margin-bottom:10px;">'
        + '\u0394 Daily Pick Up: ngarko Excel-in dy her\u00eb radhazi p\u00ebr t\u00eb par\u00ebr ndryshimin'
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
  var yoyPct   = lyTotalLek > 0 ? ((totalLek - lyTotalLek) / lyTotalLek) * 100 : null;
  var netLek   = totalLek - expT;
  var expRatio = totalLek > 0 ? expT / totalLek : 0;
  var dsRunPct = (ds && ds.avg7 > 0) ? ((ds.rev - ds.avg7) / ds.avg7) * 100 : null;
  var dsTopCh  = (ds && ds.channels && ds.channels[0]) ? ds.channels[0] : null;
  var dsTopMo  = null;
  if (ds && ds.months && ds.months.length) {
    dsTopMo = ds.months.slice().sort(function (a, b) { return b.nights - a.nights; })[0];
  }

  // Traffic-light signal card
  function sig(label, value, note, state) {
    var c = state === 'ok' ? '#22c55e' : state === 'warn' ? '#f59e0b' : state === 'bad' ? '#ef4444' : '#64748b';
    var w = state === 'ok' ? 'Mirë' : state === 'warn' ? 'Kujdes' : state === 'bad' ? 'Dobët' : '—';
    return '<td style="padding:0 4px 0 0;vertical-align:top;"><div style="background:#0d1b3e;border:1px solid #1e3a5f;border-top:2px solid ' + c + ';border-radius:7px;padding:10px 9px;">'
      + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.06em;">' + label + '</div>'
      + '<div style="font-size:17px;font-weight:700;color:#e2e8f0;line-height:1.15;margin-top:4px;">' + value + '</div>'
      + '<div style="font-size:10px;color:#475a72;margin-top:3px;">' + note + '</div>'
      + '<div style="font-size:9px;font-weight:700;color:' + c + ';margin-top:5px;text-transform:uppercase;letter-spacing:.06em;">● ' + w + '</div>'
      + '</div></td>';
  }
  var sigOcc  = occ >= 75 ? 'ok' : occ >= 50 ? 'warn' : 'bad';
  var sigYoy  = yoyPct == null ? 'na' : yoyPct >= 5 ? 'ok' : yoyPct >= -5 ? 'warn' : 'bad';
  // A day with no cash-flow row at all is "no data", not a warning.
  var cfHas   = (cfIn !== 0 || cfOut !== 0);
  var sigCf   = !cfHas ? 'na' : cfNet > 0 ? 'ok' : cfNet === 0 ? 'warn' : 'bad';
  var sigDs   = !ds ? 'na' : dsRunPct == null ? 'warn' : dsRunPct >= 10 ? 'ok' : dsRunPct >= -15 ? 'warn' : 'bad';

  // Bullet points — rule generated, most important first
  var pts = [];
  function pt(state, txt) { pts.push({ s:state, t:txt }); }
  if (occ < 50) pt('bad','Occupancy <strong>' + fL(occ,1) + '%</strong> (' + rooms + '/' + TR + ' dhoma) — nën pragun e 50%; shqyrto oferta last-minute dhe rishikim çmimi për ditët në vijim.');
  else if (occ >= 80) pt('ok','Occupancy <strong>' + fL(occ,1) + '%</strong> — shumë e lartë; ruaj disiplinën e çmimit dhe kontrollo mbivendosjet e dhomave.');
  else pt('warn','Occupancy <strong>' + fL(occ,1) + '%</strong> (' + rooms + '/' + TR + ' dhoma) — hapësirë për mbushje pa ulur ADR-në.');
  if (yoyPct != null) {
    pt(yoyPct >= 0 ? 'ok' : 'bad','Të ardhurat e ditës <strong>' + (yoyPct >= 0 ? '+' : '−') + Math.abs(yoyPct).toFixed(1) + '%</strong> kundrejt ' + (year - 1) + ' (' + fL(lyTotalLek) + ' L → ' + fL(totalLek) + ' L).');
  }
  if (!cfHas) pt('warn','Nuk ka lëvizje cash të regjistruara për këtë ditë — plotëso rreshtin e Cash Flow-it ditor.');
  else if (cfNet < 0) pt('bad','Cash flow neto <strong>' + fL(cfNet) + ' L</strong> — daljet tejkalojnë hyrjet; kontrollo radhën e pagesave ndaj furnitorëve.');
  else pt('ok','Cash flow neto <strong>+' + fL(cfNet) + ' L</strong> (hyrje ' + fL(cfIn) + ' L / dalje ' + fL(cfOut) + ' L).');
  if (expT > 0 && expRatio > 0.8) pt('warn','Shpenzimet operative zënë <strong>' + (expRatio * 100).toFixed(0) + '%</strong> të të ardhurave të ditës — marzh neto ' + fL(netLek) + ' L.');
  if (ds) {
    if (dsRunPct != null) {
      pt(dsRunPct >= 0 ? 'ok' : 'warn','Shitjet e ditës <strong>' + fE(ds.rev) + '</strong> — ' + (dsRunPct >= 0 ? '+' : '−') + Math.abs(dsRunPct).toFixed(0) + '% ndaj mesatares 7-ditore (' + fE(ds.avg7) + ').');
    }
    if (dsTopCh && dsTopCh.share >= 0.35) pt('warn','<strong>' + dsTopCh.name + '</strong> prodhoi ' + (dsTopCh.share * 100).toFixed(0) + '% të shitjeve të ditës — përqendrim i lartë në një kanal.');
    else if (dsTopCh) pt('ok','Kanali kryesor i ditës: <strong>' + dsTopCh.name + '</strong> (' + (dsTopCh.share * 100).toFixed(0) + '% · ADR ' + fE(dsTopCh.adr) + ').');
    if (adrEur > 0 && ds.adr > 0 && ds.adr < adrEur * 0.9) pt('warn','ADR i shitjeve të reja <strong>' + fE(ds.adr) + '</strong> është nën ADR-në e realizuar sot (' + fE(adrEur) + ') — kujdes me uljet.');
    if (ds.lead != null && ds.lead < 7) pt('warn','Lead time mesatar <strong>' + Math.round(ds.lead) + ' ditë</strong> — shitja është kryesisht last-minute.');
    if (dsTopMo && ds.nights > 0) pt('ok','<strong>' + (dsTopMo.nights / ds.nights * 100).toFixed(0) + '%</strong> e netëve të shitura sot shkojnë për <strong>' + dsTopMo.label + '</strong>.');
  } else {
    pt('warn','Nuk ka të dhëna shitjesh për këtë ditë — ngarko Excel-in e Trinisoft në dashboard që ky seksion të plotësohet.');
  }
  var ptsH = pts.slice(0, 6).map(function (x) {
    var c = x.s === 'ok' ? '#22c55e' : x.s === 'warn' ? '#f59e0b' : '#ef4444';
    return '<tr><td style="padding:5px 8px 5px 0;vertical-align:top;width:12px;"><span style="color:' + c + ';font-size:13px;line-height:1.5;">●</span></td>'
      + '<td style="padding:5px 0;font-size:12px;color:#94a3b8;line-height:1.6;">' + x.t + '</td></tr>';
  }).join('');

  html += '<tr><td style="' + SEC + 'padding-bottom:22px;">'
    + secHead('','Vlerësim Manaxherial','#94a3b8');

  // traffic lights
  html += '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>'
    + sig('Occupancy', fL(occ,1) + '%', rooms + '/' + TR + ' dhoma · LY ' + fL(lyOcc,1) + '%', sigOcc)
    + sig('Të ardhura vs LY', yoyPct == null ? fL(totalLek) + ' L' : (yoyPct >= 0 ? '+' : '−') + Math.abs(yoyPct).toFixed(1) + '%', fL(totalLek) + ' L · €' + fL(totalEur), sigYoy)
    + sig('Cash Flow Neto', fL(cfNet) + ' L', 'hyrje ' + fL(cfIn) + ' L / dalje ' + fL(cfOut) + ' L', sigCf)
    + sig('Shitjet e Ditës', ds ? fE(ds.rev) : '—', ds ? (ds.res + ' rez. · ' + fL(ds.nights) + ' netë · ADR ' + fE(ds.adr)) : 'pa të dhëna', sigDs)
    + '</tr></table>';

  // narrative
  html += '<div style="background:#0a1f42;border-left:3px solid #3b82f6;border-radius:0 7px 7px 0;padding:13px 15px;">'
    + '<div style="font-size:9px;color:#3b82f6;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;font-weight:700;">Përmbyllje · ' + dateLabel + '</div>'

    + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:4px;">Operacioni</div>'
    + '<div style="font-size:12px;color:#94a3b8;line-height:1.7;margin-bottom:10px;">'
    + 'Dita shënon një performancë <strong style="color:#bfdbfe;">' + mgrOcc + '</strong>, me <strong style="color:#bfdbfe;">' + rooms + '</strong> dhoma të zëna nga ' + TR + ' (' + fL(occ,1) + '%'
    + (lyOcc > 0 ? ', kundrejt ' + fL(lyOcc,1) + '% një vit më parë' : '') + '). '
    + 'ADR-ja qëndron në <strong style="color:#bfdbfe;">' + fL(adr) + ' L</strong> (€' + fL(adrEur) + ') dhe RevPAR në <strong style="color:#bfdbfe;">' + fL(revpar) + ' L</strong>'
    + (lyAdr > 0 ? ' (ADR ' + (adr >= lyAdr ? '+' : '−') + Math.abs(((adr - lyAdr) / lyAdr) * 100).toFixed(1) + '% vs LY)' : '') + '. '
    + 'Të ardhurat totale arritën <strong style="color:#bfdbfe;">' + fL(totalLek) + ' L</strong> (€' + fL(totalEur) + ') ' + mgrYoy
    + (prevDayLek > 0 ? ', ' + (dodDiff >= 0 ? 'në rritje' : 'në rënie') + ' me <strong style="color:' + dodC + ';">' + (dodDiff >= 0 ? '+' : '−') + Math.abs(dodPct2).toFixed(1) + '%</strong> ndaj një dite më parë' : '')
    + (mtdTotalLek > 0 ? '. Muaji deri sot: <strong style="color:#bfdbfe;">' + fL(mtdTotalLek) + ' L</strong>' : '') + '.'
    + '</div>'

    + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:4px;">Financat</div>'
    + '<div style="font-size:12px;color:#94a3b8;line-height:1.7;margin-bottom:10px;">'
    + (expT > 0
        ? 'Shpenzimet operative të ditës ishin <strong style="color:#bfdbfe;">' + fL(expT) + ' L</strong> (' + (expRatio * 100).toFixed(0) + '% e të ardhurave), duke lënë një rezultat neto prej <strong style="color:' + (netLek >= 0 ? '#22c55e' : '#ef4444') + ';">' + fL(netLek) + ' L</strong>. '
        : 'Nuk ka shpenzime operative të regjistruara për këtë ditë. ')
    + (!cfHas
        ? 'Fleta ditore e Cash Flow-it nuk ka lëvizje të regjistruara për këtë datë.'
        : 'Balanca cash ditore rezulton <strong style="color:' + cfNetC + ';">' + fL(cfNet) + ' L</strong> (hyrje ' + fL(cfIn) + ' L / dalje ' + fL(cfOut) + ' L)'
          + (cfNet < 0 ? ', duke kërkuar vëmendje për menaxhimin e likuiditetit.' : ', e shëndetshme në raport me shpenzimet operative.'))
    + '</div>'

    + '<div style="font-size:9px;color:#4a6fa5;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:4px;">Shitjet e ditës</div>'
    + '<div style="font-size:12px;color:#94a3b8;line-height:1.7;">'
    + (ds
        ? 'U krijuan <strong style="color:#bfdbfe;">' + ds.res + '</strong> rezervime të reja për <strong style="color:#bfdbfe;">' + fL(ds.nights) + '</strong> netë dhe <strong style="color:#c9a84c;">' + fE(ds.rev) + '</strong> (ADR ' + fE(ds.adr) + ', ALOS ' + ds.alos.toFixed(1) + ' netë'
          + (ds.lead != null ? ', lead time ' + Math.round(ds.lead) + ' ditë' : '') + '). '
          + (dsTopCh ? 'Kanali kryesor ishte <strong style="color:#bfdbfe;">' + dsTopCh.name + '</strong> me ' + fE(dsTopCh.rev) + ' (' + (dsTopCh.share * 100).toFixed(0) + '% e shitjeve, ADR ' + fE(dsTopCh.adr) + '), nga ' + ds.channelsTotal + ' kanale aktive. ' : '')
          + (dsTopMo && ds.nights > 0 ? 'Pjesa më e madhe e netëve të shitura — <strong style="color:#bfdbfe;">' + (dsTopMo.nights / ds.nights * 100).toFixed(0) + '%</strong> — shkon për <strong style="color:#bfdbfe;">' + dsTopMo.label + '</strong>. ' : '')
          + (dsRunPct != null ? 'Krahasuar me mesataren e 7 ditëve të fundit (' + fE(ds.avg7) + '), dita është <strong style="color:' + (dsRunPct >= 0 ? '#22c55e' : '#ef4444') + ';">' + (dsRunPct >= 0 ? '+' : '−') + Math.abs(dsRunPct).toFixed(0) + '%</strong>. ' : '')
          + 'Muaji deri sot ka prodhuar <strong style="color:#bfdbfe;">' + fE(ds.mtd.rev) + '</strong> nga ' + ds.mtd.res + ' rezervime.'
        : 'Nuk ka të dhëna për shitjet e ditës — ngarko Excel-in e Trinisoft në dashboard (kolona AF “Data Krijimit”).')
    + '</div>'
    + '</div>';

  // key points
  html += '<div style="background:#0d1b3e;border:1px solid #1e3a5f;border-radius:7px;padding:12px 14px;margin-top:10px;">'
    + '<div style="font-size:9px;color:#c9a84c;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:4px;">Pika kyçe &amp; vëmendje</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0">' + ptsH + '</table>'
    + '</div>';

  html += '</td></tr>';

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
async function sendDailyReport(date, data, prevData, testTo) {
  var transporter = createTransport();
  var html        = buildEmailHTML(date, data, prevData);
  var to          = testTo || process.env.EMAIL_TO || RECIPIENTS;
  var subject     = (testTo ? '[TEST] ' : '') + '\uD83D\uDCCB FLOW \u2014 Raport Ditor ' + date;
  var info = await transporter.sendMail({
    from   : '"FLOW Dashboard" <' + process.env.EMAIL_USER + '>',
    to     : to,
    subject: subject,
    html   : html,
    headers: {
      'X-Entity-Ref-ID': 'flow-report-' + date + '-' + Date.now(),
    },
  });
  console.log('[EMAIL] Sent for', date, '\u2192', info.messageId, testTo ? '(TEST to ' + testTo + ')' : '');
  return info;
}

// ================================================================
//  sendFile — dërgon një skedar të gatshëm (p.sh. PDF-në e raportit
//  mujor) me email, duke përdorur të njëjtin transport SMTP.
//  Marrësi lejohet vetëm nga lista e njohur (RECIPIENTS + FILE_EMAIL_ALLOW),
//  që endpoint-i të mos shndërrohet në relay nëse token-i bie në dorë tjetri.
// ================================================================
function allowedRecipients() {
  return (RECIPIENTS + ',' + (process.env.FILE_EMAIL_ALLOW || ''))
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
async function sendFile({ to, subject, text, html, filename, buffer, mimeType }) {
  const target = String(to || '').trim();
  if (!target) throw new Error('Mungon marrësi.');
  if (!allowedRecipients().includes(target.toLowerCase())) {
    throw new Error('Marrësi "' + target + '" nuk është në listën e lejuar. '
      + 'Shtoje te env FILE_EMAIL_ALLOW nëse duhet.');
  }
  if (!buffer || !buffer.length) throw new Error('Skedari është bosh.');
  if (buffer.length > 25 * 1024 * 1024) throw new Error('Skedari kalon 25MB.');

  const transporter = createTransport();
  const info = await transporter.sendMail({
    from: '"FLOW Dashboard" <' + process.env.EMAIL_USER + '>',
    to: target,
    subject: subject || filename || 'Raport',
    text: text || 'Bashkëngjitur gjeni skedarin: ' + (filename || 'raport'),
    html: html || undefined,
    attachments: [{
      filename: filename || 'raport.pdf',
      content: buffer,
      contentType: mimeType || 'application/pdf',
    }],
  });
  console.log('[EMAIL] File sent:', filename, (buffer.length/1024).toFixed(0) + 'KB',
    '→', target, info.messageId);
  return info;
}

module.exports = { sendDailyReport, buildEmailHTML, sendFile };
