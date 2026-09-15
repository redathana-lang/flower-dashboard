'use strict';
// Renders the monthly performance report in the approved layout:
// white A4-style pages, gold rule, navy headings, tables and CSS bar charts.
const fs = require('fs');
const P = (process.env.MR_DIR || process.argv[2] || __dirname + '/data') + '/';
const MONTH_KEY = process.env.MR_MONTH || process.argv[3] || '2026-08';
const F = JSON.parse(fs.readFileSync(P + 'facts_' + MONTH_KEY + '.json', 'utf8'));
const SECTIONS = JSON.parse(fs.readFileSync(P + 'sections_' + MONTH_KEY + '.json', 'utf8'));

const MONTH = 'Gusht', YEAR = 2026;
const GOLD = '#c9a84c', NAVY = '#0f2040', INK = '#1c2b3f', MUTED = '#6b7f96', LINE = '#e3e8ef';
const GREEN = '#1f7a4d', RED = '#b8352f';

const eur = v => '€' + Math.round(v || 0).toLocaleString('de-DE');
const eur2 = v => '€' + (Math.round((v || 0) * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = v => Math.round(v || 0).toLocaleString('de-DE');
const pctS = v => v == null ? '—' : (v >= 0 ? '+' : '') + String(v).replace('.', ',') + '%';
const pctP = v => v == null ? '—' : String(v).replace('.', ',') + '%';
const lekM = v => (Math.round((v || 0) / 10000) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rich = s => esc(s).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
const sign = v => v == null ? MUTED : (v >= 0 ? GREEN : RED);

let pageNo = 0;
function page(inner) {
  pageNo++;
  return `<section class="pg">
  <div class="pghd"><span>FLOWER HOTEL &amp; SPA · RAPORTI MUJOR I PERFORMANCËS ${MONTH.toUpperCase()} ${YEAR} · KONFIDENCIAL</span></div>
  <div class="pgbody">${inner}</div>
  <div class="pgft"><span>Burimet: FLOW dashboard · Fleta raportuese Power BI · Eksportet POS të outleteve (${MONTH} 2025 / ${MONTH} ${YEAR})</span><span>Faqja ${pageNo}</span></div>
</section>`;
}

const sec = k => SECTIONS.find(s => s.key === k) || { heading: '', paragraphs: [], callouts: [] };
function body(s) {
  return `<h2>${esc(s.heading)}</h2>` + (s.paragraphs || []).map(p => `<p>${rich(p)}</p>`).join('');
}
function callouts(s) {
  const c = (s.callouts || []).slice(0, 4);
  if (!c.length) return '';
  return `<div class="cal">${c.map(x => `<div class="cal-i"><div class="cal-l">${esc(x.label)}</div><div class="cal-v">${esc(x.value)}</div>${x.note ? `<div class="cal-n">${esc(x.note)}</div>` : ''}</div>`).join('')}</div>`;
}

// ── chart helpers ────────────────────────────────────────────────────────────
function hbars(rows, opts = {}) {
  const max = Math.max(...rows.map(r => Math.abs(r.v)), 1);
  return `<table class="bars">${rows.map(r => `<tr>
    <td class="bl">${esc(r.l)}</td>
    <td class="bv">${opts.fmt ? opts.fmt(r.v) : eur(r.v)}</td>
    <td class="bb"><span style="width:${Math.max(1, Math.round(Math.abs(r.v) / max * 100))}%;background:${r.c || GOLD}"></span></td>
    <td class="bd" style="color:${sign(r.d)}">${r.d == null ? '' : pctS(r.d)}</td>
  </tr>`).join('')}</table>`;
}
function vbars(rows, opts = {}) {
  const vals = rows.map(r => r.v);
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const span = max - min || 1;
  return `<div class="vwrap"><table class="vbars"><tr>${rows.map(r => {
    const h = Math.round(Math.abs(r.v) / span * 90);
    const col = r.c || (r.v < 0 ? RED : GOLD);
    return `<td><div class="vb"><span style="height:${Math.max(2, h)}px;background:${col}"></span></div><div class="vl">${esc(r.l)}</div></td>`;
  }).join('')}</tr></table><div class="cap">${esc(opts.caption || '')}</div></div>`;
}
function table(head, rows, opts = {}) {
  return `<div class="tw"><table class="tbl"><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.total ? ' class="tot"' : ''}>${r.cells.map((c, i) => `<td${i && !(c && c.left) ? ' class="r"' : ''}${c && c.color ? ` style="color:${c.color}"` : ''}>${c && c.v != null ? (c.rich ? rich(c.v) : esc(c.v)) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${opts.caption ? `<div class="cap">${esc(opts.caption)}</div>` : ''}`;
}

// ── page 1 · cover + executive summary ───────────────────────────────────────
const k = F.kpi;
const kpiRows = [
  { cells: ['Netë të shitura', num(k.nights.ly), num(k.nights.ay), { v: pctS(k.nights.d), color: sign(k.nights.d) }, '—', '—'] },
  { cells: ['Dhoma të disponueshme', num(k.avail.ly), num(k.avail.ay), { v: pctS(k.avail.d), color: sign(k.avail.d) }, '—', '—'] },
  { cells: ['Okupanca', pctP(k.occ.ly), pctP(k.occ.ay), { v: (k.occ.dPts >= 0 ? '+' : '') + String(k.occ.dPts).replace('.', ',') + ' pikë', color: sign(k.occ.dPts) }, '—', '—'] },
  { cells: ['ADR', eur2(k.adr.ly), eur2(k.adr.ay), { v: pctS(k.adr.d), color: sign(k.adr.d) }, '—', '—'] },
  { cells: ['RevPAR / TRevPAR', eur2(k.revpar.ly) + ' / ' + eur2(k.trevpar.ly), eur2(k.revpar.ay) + ' / ' + eur2(k.trevpar.ay), { v: pctS(k.revpar.d) + ' / ' + pctS(k.trevpar.d), color: sign(k.revpar.d) }, '—', '—'] },
  { cells: ['Të ardhurat operative', eur(k.rev.ly), eur(k.rev.ay), { v: pctS(k.rev.d), color: sign(k.rev.d) }, eur(k.rev.bud), pctP(k.rev.vsBud)] },
  { cells: ['Shpenzimet totale', eur(k.exp.ly), eur(k.exp.ay), { v: pctS(k.exp.d), color: sign(-k.exp.d) }, eur(k.exp.bud), pctP(k.exp.vsBud)] },
  { cells: ['GOP (marzhi)', eur(k.gop.ly) + ' (' + pctP(k.gop.marginLy) + ')', eur(k.gop.ay) + ' (' + pctP(k.gop.marginAy) + ')', { v: pctS(k.gop.d), color: sign(k.gop.d) }, '—', '—'] },
  { cells: ['EBITDA', eur(k.ebitda.ly), eur(k.ebitda.ay), { v: pctS(k.ebitda.d), color: sign(k.ebitda.d) }, '—', '—'] },
  { cells: ['Fitimi neto operativ', eur(k.nop.ly), eur(k.nop.ay), { v: pctS(k.nop.d), color: sign(k.nop.d) }, eur(k.nop.bud), pctP(k.nop.vsBud)] },
  { cells: ['Kosto e punës (% të ardh.)', eur(k.labor.ly) + ' (' + pctP(k.labor.pctLy) + ')', eur(k.labor.ay) + ' (' + pctP(k.labor.pctAy) + ')', { v: pctS(k.labor.d), color: sign(-k.labor.d) }, '—', '—'] },
  { cells: ['CPOR *', eur2(k.cpor.ly), eur2(k.cpor.ay), { v: pctS(Math.round((k.cpor.ay - k.cpor.ly) / k.cpor.ly * 1000) / 10), color: sign(-(k.cpor.ay - k.cpor.ly)) }, '—', '—'] },
  { cells: ['ALOS', String(k.alos.ly).replace('.', ',') + ' netë', String(k.alos.ay).replace('.', ',') + ' netë', { v: pctS(k.alos.d), color: sign(k.alos.d) }, '—', '—'] },
];

let html = '';
html += page(`
  <div class="cover">
    <div class="eyebrow">FLOWER HOTEL &amp; SPA · GOLEM, SHQIPËRI</div>
    <h1>Raporti Mujor i Performancës</h1>
    <div class="sub">Flower Hotel &amp; Spa · ${MONTH} ${YEAR} · krahasuar me ${MONTH} 2025 dhe Buxhetin ${YEAR} · Përgatitur nga Drejtori i Përgjithshëm</div>
  </div>
  ${body(sec('executive'))}
  ${callouts(sec('executive'))}
  ${table(['KPI', (MONTH + ' 2025').toUpperCase(), (MONTH + ' ' + YEAR).toUpperCase(), 'Δ NDAJ VK', 'BUXHETI 26', 'VS BUXHETI'], kpiRows)}
  <p class="fine">Shifrat financiare nga fleta raportuese Power BI (EX. SUMMARY / P&amp;L); KPI-të operative të verifikuara me panelin admin të FLOW. Kursi referencë: ~95–100 Lek/€. VK = viti i kaluar.</p>
  <p class="fine"><b>* Shënim mbi CPOR:</b> fleta raporton ${eur2(k.cpor.sheetAy)} për ${MONTH.toLowerCase()}in ${YEAR}, e llogaritur mbi <b>shpenzimet totale</b>. Mbi <b>shpenzimet e dhomave</b> — baza e krahasueshme me muajt e tjerë — CPOR-i është <b>${eur2(k.cpor.ay)}</b>. Formula në fletë duhet korrigjuar.</p>
`);

// ── page 2 · P&L ─────────────────────────────────────────────────────────────
const serie = F.series.filter(s => s.rev != null);
html += page(`
  ${vbars(serie.map(s => ({ l: s.month.slice(2).replace('-', '/'), v: s.rev, c: s.month.startsWith('2026') ? GOLD : '#b9c6d6' })), { caption: `Të ardhurat operative sipas muajve · 2025 (gri) dhe ${YEAR} (ari).` })}
  ${body(sec('pl'))}
  ${callouts(sec('pl'))}
  ${table(['ZËRI P&L (€)', (MONTH + ' 2025').toUpperCase(), (MONTH + ' ' + YEAR).toUpperCase(), 'Δ NDAJ VK', 'BUXHETI ' + YEAR, 'VARIANCA'], [
    { cells: ['Të ardhura nga dhomat', eur(k.roomsRev.ly), eur(k.roomsRev.ay), { v: pctS(k.roomsRev.d), color: sign(k.roomsRev.d) }, '—', '—'] },
    { cells: ['Të ardhura F&B (neto)', eur(k.fnbRev.ly), eur(k.fnbRev.ay), { v: pctS(k.fnbRev.d), color: sign(k.fnbRev.d) }, '—', '—'] },
    { cells: ['Të ardhura të tjera (SPA etj.)', eur(k.otherRev.ly), eur(k.otherRev.ay), { v: pctS(k.otherRev.d), color: sign(k.otherRev.d) }, '—', '—'] },
    { cells: ['Të ardhurat operative', eur(k.rev.ly), eur(k.rev.ay), { v: pctS(k.rev.d), color: sign(k.rev.d) }, eur(k.rev.bud), { v: eur(k.rev.gap), color: sign(k.rev.gap) }], total: true },
    { cells: ['Shpenzime departamentale', eur(k.deptExp.ly), eur(k.deptExp.ay), { v: pctS(k.deptExp.d), color: sign(-k.deptExp.d) }, '—', '—'] },
    { cells: ['Shpenzime të pashpërndara', eur(k.undistExp.ly), eur(k.undistExp.ay), { v: pctS(k.undistExp.d), color: sign(-k.undistExp.d) }, '—', '—'] },
    { cells: ['Shpenzimet totale', eur(k.exp.ly), eur(k.exp.ay), { v: pctS(k.exp.d), color: sign(-k.exp.d) }, eur(k.exp.bud), { v: eur(k.exp.gap), color: sign(-k.exp.gap) }], total: true },
    { cells: ['GOP', eur(k.gop.ly), eur(k.gop.ay), { v: pctS(k.gop.d), color: sign(k.gop.d) }, '—', '—'] },
    { cells: ['Fitimi neto operativ', eur(k.nop.ly), eur(k.nop.ay), { v: pctS(k.nop.d), color: sign(k.nop.d) }, eur(k.nop.bud), { v: eur(k.nop.gap), color: sign(k.nop.gap) }], total: true },
  ])}
`);

// ── page 3 · rooms ───────────────────────────────────────────────────────────
html += page(`
  ${body(sec('rooms'))}
  ${callouts(sec('rooms'))}
  ${vbars(F.daily.map(d => ({ l: String(d.day), v: d.occ, c: d.occ >= 95 ? GREEN : d.occ >= 88 ? GOLD : RED })), { caption: `Okupanca ditore, ${MONTH} ${YEAR}. Jeshile ≥95% · e artë 88–94% · e kuqe <88%.` })}
  <h3>Miksi i paketave</h3>
  ${hbars(F.board.map(b => ({ l: b.board, v: b.rev, d: null })), {})}
  <div class="cap">Të ardhurat e dhomave sipas paketës (€). Pesha: ${F.board.map(b => b.board + ' ' + pctP(b.share)).join(' · ')}.</div>
`);

// ── page 4 · markets + segments ──────────────────────────────────────────────
html += page(`
  <h3>Tregjet burimore</h3>
  ${hbars(F.markets.slice(0, 10).map(m => ({ l: m.market, v: m.rev, d: m.d })))}
  <div class="cap">Dhjetë tregjet kryesore burimore sipas të ardhurave (€), me ndryshimin ndaj ${MONTH.toLowerCase()}it 2025.</div>
  <h3>Segmentet e tregut</h3>
  ${table(['SEGMENTI', 'TË ARDHURA', 'PESHA', MONTH.toUpperCase() + ' 2025', 'Δ NDAJ VK'], F.segments.map(s => ({
    cells: [s.segment, eur(s.rev), pctP(s.share), eur(s.lyRev), { v: pctS(s.d), color: sign(s.d) }],
  })))}
`);

// ── page 5–6 · channels ──────────────────────────────────────────────────────
const chTop = F.channels.filter(c => c.rev > 0).slice(0, 10);
html += page(`
  ${body(sec('channels'))}
  ${callouts(sec('channels'))}
  ${hbars(chTop.map(c => ({ l: c.channel, v: c.rev, d: c.d })))}
  <div class="cap">Dhjetë kanalet kryesore sipas të ardhurave (€), me ndryshimin ndaj ${MONTH.toLowerCase()}it 2025.</div>
`);
html += page(`
  ${table(['KANALI', 'TË ARDHURA', 'NETË', 'REZERVIME', 'ADR', 'ALOS', 'PESHA', 'Δ NDAJ VK'], [
    ...F.channels.filter(c => c.rev > 0).map(c => ({
      cells: [c.channel, eur(c.rev), num(c.nights), num(c.res), eur2(c.adr), String(c.alos).replace('.', ','), pctP(c.share), { v: c.d == null ? 'i ri' : pctS(c.d), color: c.d == null ? MUTED : sign(c.d) }],
    })),
    { cells: ['TOTALI', eur(F.channelTotal.rev), num(F.channelTotal.nights), num(F.channelTotal.res), eur2(k.adr.ay), String(k.alos.ay).replace('.', ','), '100%', { v: pctS(k.roomsRev.d), color: sign(k.roomsRev.d) }], total: true },
  ])}
  ${table(['GRUPIMI', 'TË ARDHURA', 'PESHA'], [
    { cells: ['Direkt (DIRECT + WEBSITE)', eur(F.groups.direct.rev), pctP(F.groups.direct.share)] },
    { cells: ['Garanci (ITAKA)', eur(F.groups.itaka.rev), pctP(F.groups.itaka.share)] },
    { cells: ['Wholesalers / bed-bank', eur(F.groups.wholesale.rev), pctP(F.groups.wholesale.share)] },
    { cells: ['OTA', eur(F.groups.ota.rev), pctP(F.groups.ota.share)] },
  ], { caption: `Komisionet e OTA-ve: ${eur(F.groups.ota.commission)}.` })}
`);

// ── page 7 · F&B ─────────────────────────────────────────────────────────────
html += page(`
  ${body(sec('fnb'))}
  ${callouts(sec('fnb'))}
  ${hbars(F.outlets.map(o => ({ l: o.outlet, v: o.lek, d: o.d })), { fmt: v => lekM(v) + ' Lek' })}
  ${table(['OUTLET (LEK)', 'BRUTO 25', 'BRUTO 26', 'Δ'], [
    ...F.outlets.map(o => ({ cells: [o.outlet, num(o.lyLek), num(o.lek), { v: pctS(o.d), color: sign(o.d) }] })),
    { cells: ['Totali outlete', num(F.outletTotal.lyLek), num(F.outletTotal.lek), { v: pctS(F.outletTotal.d), color: sign(F.outletTotal.d) }], total: true },
  ], { caption: 'Shënim: kolonat Fatura dhe Kuverta nuk janë ende në dispozicion — nevojitet eksporti POS i outleteve.' })}
`);

// ── page 8 · expenses ────────────────────────────────────────────────────────
html += page(`
  ${body(sec('expenses'))}
  ${callouts(sec('expenses'))}
  ${hbars(F.expenses.map(e => ({ l: e.cat, v: e.lek, d: e.d })), { fmt: v => lekM(v) + ' Lek' })}
  ${table(['KATEGORIA (LEK)', MONTH.toUpperCase() + ' 2025', MONTH.toUpperCase() + ' ' + YEAR, 'Δ NDAJ VK', 'BUXHETI', 'VARIANCA'], [
    ...F.expenses.map(e => ({ cells: [e.cat, num(e.lyLek), num(e.lek), { v: pctS(e.d), color: sign(-e.d) }, num(e.budget), { v: (e.varr >= 0 ? '+' : '') + num(e.varr), color: sign(-e.varr) }] })),
    { cells: ['Totali', '—', num(F.expenseTotalLek), '—', '—', '—'], total: true },
  ])}
`);

// ── page 9 · profit & staff ──────────────────────────────────────────────────
html += page(`
  ${body(sec('profit'))}
  ${callouts(sec('profit'))}
  ${vbars(F.series.filter(s => s.nop != null).map(s => ({ l: s.month.slice(2).replace('-', '/'), v: s.nop, c: s.nop < 0 ? RED : GREEN })), { caption: `Fitimi neto operativ sipas muajve, Janar 2025 – ${MONTH} ${YEAR} (€). Jeshile = fitim, e kuqe = humbje.` })}
  ${table(['TREGUES STAFI', MONTH.toUpperCase() + ' 2025', MONTH.toUpperCase() + ' ' + YEAR, 'Δ'], [
    { cells: ['Kosto e punës', eur(k.labor.ly), eur(k.labor.ay), { v: pctS(k.labor.d), color: sign(-k.labor.d) }] },
    { cells: ['FTE', num(k.labor.fteLy), num(k.labor.fteAy), { v: (k.labor.fteAy - k.labor.fteLy >= 0 ? '+' : '') + num(k.labor.fteAy - k.labor.fteLy), color: MUTED }] },
    { cells: ['Kosto mesatare / FTE', eur(k.labor.avgLy), eur(k.labor.avgAy), { v: pctS(Math.round((k.labor.avgAy - k.labor.avgLy) / k.labor.avgLy * 1000) / 10), color: sign(-(k.labor.avgAy - k.labor.avgLy)) }] },
    { cells: ['Kosto pune / dhomë e zënë', eur2(k.labor.perSoldLy), eur2(k.labor.perSoldAy), { v: pctS(Math.round((k.labor.perSoldAy - k.labor.perSoldLy) / k.labor.perSoldLy * 1000) / 10), color: sign(-(k.labor.perSoldAy - k.labor.perSoldLy)) }] },
    { cells: ['Pesha ndaj të ardhurave', pctP(k.labor.pctLy), pctP(k.labor.pctAy), { v: (k.labor.pctAy - k.labor.pctLy >= 0 ? '+' : '') + String(Math.round((k.labor.pctAy - k.labor.pctLy) * 10) / 10).replace('.', ',') + ' pikë', color: sign(-(k.labor.pctAy - k.labor.pctLy)) }] },
  ])}
`);

// ── page 10 · cash flow ──────────────────────────────────────────────────────
const CF = F.cash;
const cfIn = CF.ay.in, cfOut = CF.ay.out;
const maxRows = Math.max(cfIn.length, cfOut.length);
const cfRows = [];
for (let i = 0; i < maxRows; i++) {
  const a = cfIn[i], b = cfOut[i];
  cfRows.push({ cells: [a ? a.label : '', a ? eur(a.eur) : '', b ? b.label : '', b ? eur(b.eur) : ''] });
}
cfRows.push({ cells: ['Gjithsej hyrje', eur(CF.ay.totals.in), 'Gjithsej dalje', eur(CF.ay.totals.out)], total: true });
const ob = CF.ay.obligations, obm = CF.obligationMove;
html += page(`
  ${body(sec('cash'))}
  ${callouts(sec('cash'))}
  ${vbars([{ l: 'Hyrje', v: CF.ay.totals.in, c: GREEN }, { l: 'Dalje', v: CF.ay.totals.out, c: RED }, { l: 'Neto', v: CF.ay.totals.net, c: GOLD }], { caption: `Fluksi i parasë, ${MONTH} ${YEAR} (€). Korriku: hyrje ${eur(CF.prev.totals.in)} · dalje ${eur(CF.prev.totals.out)} · neto ${eur(CF.prev.totals.net)}.` })}
  ${table(['HYRJET (€)', 'VLERA', 'DALJET (€)', 'VLERA'], cfRows)}
  <h3>Detyrimet dhe arkëtimet — lëvizja brenda muajit</h3>
  ${table(['ZËRI', 'FILLIM MUAJI', 'FUND MUAJI', 'NDRYSHIMI'], [
    { cells: ['Detyrime ndaj furnitorëve', eur(ob.furnitoreStart), eur(ob.furnitoreEnd),
      { v: (obm.furnitore >= 0 ? '+' : '') + eur(obm.furnitore), color: obm.furnitore > 0 ? RED : GREEN }] },
    { cells: ['Angazhime investimesh', eur(ob.investimeStart), eur(ob.investimeEnd),
      { v: (obm.investime >= 0 ? '+' : '') + eur(obm.investime), color: obm.investime > 0 ? RED : GREEN }] },
    { cells: ['Gjithsej detyrime', eur(obm.totalStart), eur(obm.totalEnd),
      { v: (obm.total >= 0 ? '+' : '') + eur(obm.total), color: obm.total > 0 ? RED : GREEN }], total: true },
    { cells: ['Arkëtim i mbetur · OTA', eur(CF.prev.obligations.otaReceivable), eur(ob.otaReceivable),
      { v: eur(ob.otaReceivable - CF.prev.obligations.otaReceivable), color: GREEN }] },
    { cells: ['Arkëtim i mbetur · MICE', eur(CF.prev.obligations.miceReceivable), eur(ob.miceReceivable),
      { v: eur(ob.miceReceivable - CF.prev.obligations.miceReceivable), color: MUTED }] },
  ], { caption: 'Kolona "fillim muaji" e furnitorëve dhe e investimeve është gjendja më 1 gusht; për arkëtimet, kolonat tregojnë korrikun dhe gushtin.' })}
  ${(F.corrections && F.corrections.length) ? `<div class="warn"><b>Korrigjim i deklaruar.</b> ${F.corrections.map(c => `Fleta <i>${esc(c.sheet)}</i> mban ${esc(c.label)} me ${c.was != null ? num(c.was) + ' Lek (' + eur(c.wasEur) + ')' : '—'} për ${MONTH.toLowerCase()}in; vlera e saktë është <b>${eur(c.to)}</b>. ${esc(c.note)}`).join(' ')} Shifrat e këtij seksioni janë llogaritur mbi vlerën e korrigjuar; fleta duhet përditësuar që të përputhet.</div>` : ''}
  ${table(['GRUPIMI I DALJEVE', MONTH.toUpperCase() + ' ' + YEAR, 'KORRIK ' + YEAR, 'PESHA'], [
    { cells: ['Furnitorë', eur(CF.groups.furnitore.ay), eur(CF.groups.furnitore.ly), { v: pctS(CF.groups.furnitoreDelta), color: MUTED }] },
    { cells: ['Investime', eur(CF.groups.investime.ay), eur(CF.groups.investime.ly), pctP(CF.groups.investimeShare)] },
    { cells: ['Paga', eur(CF.groups.paga.ay), eur(CF.groups.paga.ly), '—'] },
    { cells: ['Taksa dhe utilitete', eur(CF.groups.taksa.ay), eur(CF.groups.taksa.ly), '—'] },
    { cells: ['Kredi', eur(CF.groups.kredi.ay), eur(CF.groups.kredi.ly), '—'] },
  ], { caption: 'Kolona e fundit: ndryshimi ndaj korrikut për furnitorët, pesha ndaj daljeve për investimet.' })}
`);

// ── page 11–12 · reputation ──────────────────────────────────────────────────
const R = F.reputation;
if (R && F.reputationAvailable) {
  const jr = R.julyReference;
  html += page(`
  ${body(sec('reputation'))}
  ${callouts(sec('reputation'))}
  ${table(['PLATFORMA', 'KOMENTE', 'VLERËSIMI', 'NORMALIZUAR /5', 'POZITIVE', 'NEGATIVE'], [
    ...R.platforms.map(p => ({ cells: [p.platform, num(p.reviews), String(p.rating).replace('.', ',') + ' / ' + p.scale, String(p.normalized).replace('.', ','), num(p.positive), { v: num(p.negative), color: p.negative > p.positive ? RED : INK }] })),
    { cells: ['Gjithsej', num(R.overall.reviews), String(R.overall.rating).replace('.', ',') + ' / 5', String(R.overall.rating).replace('.', ','), num(R.overall.positive), num(R.overall.negative)], total: true },
  ], { caption: `Norma e përgjigjes ndaj komenteve: ${pctP(R.overall.responseRate)} (korrik ${pctP(jr.responseRate)}).` })}
  <h3>Shpërndarja e vlerësimeve</h3>
  ${hbars([
    { l: '5 ★', v: R.stars.s5, c: GREEN }, { l: '4 ★', v: R.stars.s4, c: '#5c9c6f' },
    { l: '3 ★', v: R.stars.s3, c: GOLD }, { l: '2 ★', v: R.stars.s2, c: '#d08a4a' }, { l: '1 ★', v: R.stars.s1, c: RED },
  ], { fmt: v => num(v) + ' komente' })}
  <div class="cap">Gjithsej ${num(R.stars.total)} komente. 5★ = ${pctP(R.stars.pct5)} · 1★ = ${pctP(R.stars.pct1)} (korrik: 1★ = ${pctP(jr.pct1)}).</div>
`);
  html += page(`
  ${table(['KATEGORIA E VLERËSIMIT', 'GUSHT 2026', 'BENCHMARK', 'DIFERENCA'], R.categories.map(c => ({
    cells: [c.category, String(c.rating).replace('.', ','), String(c.benchmark).replace('.', ','),
      { v: (c.diff >= 0 ? '+' : '') + String(c.diff).replace('.', ','), color: sign(c.diff) }],
  })))}
  <h3>Sentimenti sipas temës</h3>
  ${table(['TEMA', 'KOMENTE', 'PËRMENDJE', 'POZITIV', 'PËRMENDJE NEG.'], R.sentimentCategories.slice(0, 8).map(c => ({
    cells: [c.category, num(c.reviews), num(c.mentions), { v: pctP(c.positivePct), color: c.positivePct >= 80 ? GREEN : c.positivePct >= 70 ? INK : RED }, num(c.negativeMentions)],
  })), { caption: `Sentimenti i përgjithshëm ${R.sentiment.score} nga ${num(R.sentiment.mentions)} përmendje (${num(R.sentiment.positive)} pozitive, ${num(R.sentiment.negative)} negative).` })}
  <h3>Grupi konkurrues · indeksi GRI</h3>
  ${hbars(R.competition.map(c => ({ l: /flower/i.test(c.hotel) ? c.hotel + ' · ne' : c.hotel, v: c.gri, c: /flower/i.test(c.hotel) ? GOLD : '#b9c6d6' })), { fmt: v => String(v).replace('.', ',') })}
  <div class="cap">Indeksi i Reputacionit të Mysafirëve (GRI), gusht 2026. Jemi #${R.ourRank} nga ${R.competitors} (korrik: #${jr.rank} me GRI ${String(jr.gri).replace('.', ',')}).</div>
  ${table(['SEGMENTI I UDHËTARIT', 'KOMENTE', 'VLERËSIMI'], R.segments.map(s => ({
    cells: [s.segment === 'Not available' ? 'I paspecifikuar' : s.segment === 'Other' ? 'Të tjerë' : s.segment === 'Families' ? 'Familje' : s.segment === 'Couples' ? 'Çifte' : s.segment === 'Friends' ? 'Miq' : s.segment === 'Group' ? 'Grupe' : s.segment,
      num(s.reviews), { v: String(s.score).replace('.', ','), color: s.score < 4 ? RED : INK }],
  })))}
  <p class="fine">Burimi: Guestflip, raporti ${esc(R.period)}. Krahasimet muaj-me-muaj janë bërë me raportin tonë të korrikut ${YEAR}; kolonat "benchmark" të Guestflip-it përdorin periudhën e tyre të krahasimit.</p>
`);
}

// ── page 13 · challenges & recommendations ───────────────────────────────────
const act = sec('actions');
html += page(`
  ${body(act)}
  <div class="recs">${table(['#', 'REKOMANDIMI', 'PËRGJEGJËSI', 'OBJEKTIVI / MATJA'], (act.recommendations || []).map((r, i) => ({
    cells: [String(i + 1), { v: r.text, rich: true, left: true }, { v: r.owner, left: true }, { v: r.target, left: true }],
  })), {})}</div>
  <h2>Në përfundim</h2>
  ${(sec('closing').paragraphs || []).map(p => `<p>${rich(p)}</p>`).join('')}
`);

const doc = `<!DOCTYPE html><html lang="sq"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Raporti Mujor i Performancës · ${MONTH} ${YEAR}</title>
<style>
 :root{--gold:${GOLD};--navy:${NAVY};--ink:${INK};--muted:${MUTED};--line:${LINE}}
 *{box-sizing:border-box}
 body{margin:0;background:#eef1f5;color:var(--ink);font:14px/1.6 Arial,Helvetica,sans-serif}
 .pg{background:#fff;max-width:900px;margin:18px auto;padding:0;box-shadow:0 1px 4px rgba(15,32,64,.12);border-top:4px solid var(--gold)}
 .pghd{font-size:9px;letter-spacing:1.4px;color:var(--muted);text-transform:uppercase;padding:10px 34px 0;border-bottom:1px solid var(--line);padding-bottom:8px}
 .pgbody{padding:18px 34px 8px}
 .pgft{display:flex;justify-content:space-between;gap:12px;font-size:9px;color:var(--muted);border-top:1px solid var(--line);margin:0 34px;padding:8px 0 14px}
 .cover{padding:14px 0 18px;border-bottom:2px solid var(--gold);margin-bottom:16px}
 .eyebrow{font-size:9px;letter-spacing:3px;color:var(--gold);font-weight:700;text-transform:uppercase}
 h1{font-size:30px;margin:8px 0 6px;color:var(--navy);line-height:1.15}
 .sub{font-size:12px;color:var(--muted)}
 h2{font-size:16px;color:var(--navy);margin:22px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--line)}
 h3{font-size:13px;color:var(--navy);margin:18px 0 6px;letter-spacing:.3px}
 p{margin:0 0 10px}
 .fine{font-size:10.5px;color:var(--muted);line-height:1.55}
 .warn{background:#fdf6e3;border-left:3px solid var(--gold);padding:10px 12px;margin:10px 0;font-size:12.5px}
 .cal{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}
 .cal-i{flex:1 1 150px;min-width:130px;border:1px solid var(--line);border-top:2px solid var(--gold);padding:8px 10px;background:#fafbfc}
 .cal-l{font-size:8.5px;letter-spacing:1.3px;text-transform:uppercase;color:var(--muted);font-weight:700}
 .cal-v{font-size:19px;font-weight:700;color:var(--navy);line-height:1.2;margin:3px 0}
 .cal-n{font-size:10px;color:var(--muted)}
 table{border-collapse:collapse;width:100%}
 .tbl{margin:12px 0;font-size:11.5px}
 .tbl th{background:var(--navy);color:#fff;text-align:left;padding:7px 8px;font-size:8.5px;letter-spacing:1px;text-transform:uppercase;font-weight:700}
 .tbl th.r,.tbl td.r{text-align:right}
 .tbl td{padding:6px 8px;border-bottom:1px solid var(--line)}
 .tbl tr.tot td{font-weight:700;background:#f6f8fb;border-bottom:2px solid var(--navy)}
 .tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
 .bars{margin:10px 0;font-size:11.5px}
 .bars td{padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
 .bars .bl{white-space:nowrap;font-weight:600;color:var(--navy);width:24%}
 .bars .bv{text-align:right;white-space:nowrap;width:18%}
 .bars .bb{width:44%}
 .bars .bb span{display:block;height:8px;border-radius:2px}
 .bars .bd{text-align:right;white-space:nowrap;width:14%;font-size:10.5px}
 .vwrap{margin:14px 0}
 .vbars{table-layout:fixed}
 .vbars td{vertical-align:bottom;text-align:center;padding:0 1px}
 .vb{height:96px;display:flex;align-items:flex-end;justify-content:center}
 .vb span{display:block;width:72%;border-radius:2px 2px 0 0}
 .vl{font-size:7.5px;color:var(--muted);padding-top:3px;white-space:nowrap;overflow:hidden}
 .cap{font-size:10px;color:var(--muted);margin:4px 0 12px;font-style:italic}
 .recs .tbl th{text-align:left}
 .recs .tbl th.r{text-align:left}
 .recs .tbl td:first-child{width:22px;color:var(--gold);font-weight:700}
 .recs .tbl td:nth-child(3){width:15%;white-space:nowrap;color:var(--muted)}
 .recs .tbl td:nth-child(4){width:24%;color:var(--muted)}
 .recs .tbl td{vertical-align:top;line-height:1.55}
 @media (max-width:640px){
   .pgbody{padding:14px 16px 6px}.pghd{padding:10px 16px 8px}.pgft{margin:0 16px}
   h1{font-size:22px}.tbl{font-size:10px}.tbl td,.tbl th{padding:5px 4px}
   .bars .bl{width:30%}.bars .bb{width:30%}
   .tbl{min-width:520px}
   .vl{font-size:6px}
 }
 @media print{
   body{background:#fff}
   .pg{box-shadow:none;margin:0;max-width:none;border-top:none}
   .pgbody{padding:10px 14px 4px}
   .pghd,.pgft{display:none}
   h2{break-before:auto;break-after:avoid}
   .tbl,.bars,.vwrap,.cal{break-inside:avoid}
   .tbl{font-size:9.5px}.tbl td,.tbl th{padding:4px 5px}
   .bars{font-size:9.5px}.bars td{padding:3px 5px}
   p{margin:0 0 7px;font-size:11.5px;line-height:1.5}
   h1{font-size:24px}h2{font-size:14px;margin:14px 0 6px}h3{font-size:12px;margin:12px 0 5px}
   .cal-v{font-size:16px}.vb{height:72px}
   .tw{overflow:visible}
 }
</style></head><body>
${html}
</body></html>`;

fs.writeFileSync(P + 'raporti_mujor_' + MONTH_KEY + '.html', doc, 'utf8');
console.log('faqe:', pageNo, '| bytes:', doc.length);
