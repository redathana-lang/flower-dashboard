/**
 * emailify.js — kthen daljen e render.js në HTML të sigurt për email.
 *
 * Pse duhet: Gmail-i e heq bllokun <style> në aplikacionin celular dhe e pret
 * mesazhin mbi ~102 KB. Prandaj çdo stil vihet inline, flexbox-i zëvendësohet me
 * tabela, dhe rreshtat marrin kufirin te <tr> (jo te çdo <td>) që të mos fryhet
 * madhësia — 780 qeliza × ~50 bajt do të kalonin kufirin vetëm nga padding-u.
 *
 *   node .claude/monthly-report/emailify.js <in.html> <out.html>
 */
const fs = require('fs');

const GOLD = '#c9a84c', NAVY = '#0f2040', INK = '#1c2b3f', MUTED = '#6b7f96', LINE = '#e3e8ef';
const S = o => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';');

const src = process.argv[2] || '.claude/monthly-report/data/raporti_mujor_2026-08.html';
const dst = process.argv[3] || '.claude/monthly-report/data/raporti_email_2026-08.html';
let h = fs.readFileSync(src, 'utf8');

const title = (h.match(/<title>([^<]*)<\/title>/) || [, ''])[1];
h = h.slice(h.indexOf('<body>') + 6, h.lastIndexOf('</body>'));

// 1 · kreu dhe fundi i faqes janë kromë shtypi — 13 përsëritje të së njëjtës rresht
h = h.replace(/<div class="pghd">.*?<\/div>\n?/gs, '')
     .replace(/<div class="pgft">.*?<\/div>\n?/gs, '');

// 2 · kartat e treguesve: flex → tabelë me dy kolona (flex-i nuk mbahet nga Gmail-i).
// Duhet skaner me thellësi, jo regex: `.cal` përmban div-e të ngulitura, ndaj `.*?`
// ndalon te `</div>`-i i parë i brendshëm dhe gëlltit mbylljen e `.pgbody`.
function sliceDiv(src, openIdx) {
  let i = openIdx, depth = 0;
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = openIdx;
  let m;
  while ((m = re.exec(src))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { inner: src.slice(openIdx + src.slice(openIdx).indexOf('>') + 1, m.index), end: re.lastIndex };
  }
  throw new Error('div i pambyllur te ' + openIdx);
}

function calTable(inner) {
  const items = [];
  let idx;
  while ((idx = inner.indexOf('<div class="cal-i">')) !== -1) {
    const { inner: it, end } = sliceDiv(inner, idx);
    items.push(it);
    inner = inner.slice(end);
  }
  if (!items.length) return '';
  const cell = it => {
    const g = c => { const i = it.indexOf(`<div class="${c}">`); return i === -1 ? '' : sliceDiv(it, i).inner; };
    const l = g('cal-l'), v = g('cal-v'), n = g('cal-n');
    return `<td width="50%" style="${S({ padding: '8px 10px', border: `1px solid ${LINE}`, 'border-top': `2px solid ${GOLD}`, 'background-color': '#fafbfc', 'vertical-align': 'top' })}">`
      + `<div style="${S({ 'font-size': '8.5px', 'letter-spacing': '1.3px', 'text-transform': 'uppercase', color: MUTED, 'font-weight': '700' })}">${l}</div>`
      + `<div style="${S({ 'font-size': '19px', 'font-weight': '700', color: NAVY, 'line-height': '1.2', margin: '3px 0' })}">${v}</div>`
      + (n ? `<div style="${S({ 'font-size': '10px', color: MUTED })}">${n}</div>` : '') + '</td>';
  };
  let rows = '';
  for (let i = 0; i < items.length; i += 2) {
    rows += '<tr>' + cell(items[i]) + (items[i + 1] ? cell(items[i + 1]) : '<td width="50%"></td>') + '</tr>';
  }
  return `<table width="100%" cellpadding="0" cellspacing="4" style="border-collapse:separate;margin:12px 0">${rows}</table>`;
}

for (let i; (i = h.indexOf('<div class="cal">')) !== -1;) {
  const { inner, end } = sliceDiv(h, i);
  h = h.slice(0, i) + calTable(inner) + h.slice(end);
}

// 3 · Grafikët me shtylla vertikale → tabelë me tri rreshta: mbushës, shtyllë, etiketë.
// Dy arsye. (a) Ngjyra duhet të jetë atribut `bgcolor` te një <td>, jo `background` te
// një <div>: Gmail-i e heq atë shkurtore dhe shtyllat zhduken krejt — pikërisht ajo
// hapësirë bosh që doli në celular. (b) Stili i etiketave vihet një herë te <tr> dhe
// trashëgohet, në vend që të përsëritet te 51 qeliza.
h = h.replace(/<table class="vbars"><tr>(.*?)<\/tr><\/table>/gs, (m, body) => {
  const bars = [...body.matchAll(/<td><div class="vb"><span style="height:(\d+)px;background:([^"]+)"><\/span><\/div><div class="vl">([^<]*)<\/div><\/td>/g)]
    .map(x => ({ h: +x[1], c: x[2], l: x[3] }));
  if (!bars.length) return m;
  // Etiketat e gjata nuk nisin në një ekran 390px (20 × "25/01" ≈ 440px): hiqet çdo e dyta.
  const thin = bars.length >= 13 && bars.some(b => b.l.length > 3);
  // Çdo shtyllë e ka tabelën e vet: brenda një rreshti të vetëm të gjitha qelizat
  // marrin lartësinë e rreshtit, ndaj tri rreshta të përbashkët i bëjnë shtyllat njësoj.
  const bar = b => `<td valign="bottom"><table width="100%" cellspacing="0"><tr>`
    + `<td height="${b.h}" bgcolor="${b.c}"></td></tr></table></td>`;
  return '<table cellpadding="1" cellspacing="0" width="100%" style="table-layout:fixed;width:100%">'
    + `<tr>${bars.map(bar).join('')}</tr>`
    + `<tr style="${S({ 'font-size': '7.5px', color: MUTED, 'text-align': 'center', 'white-space': 'nowrap' })}">`
    + `${bars.map((b, i) => `<td>${thin && i % 2 ? '' : b.l}</td>`).join('')}</tr></table>`;
});


// 4 · Tabelat: padding te atributi `cellpadding`, jo te çdo qelizë — 780 qeliza ×
// ~50 bajt do ta kalonin kufirin e Gmail-it vetëm nga padding-u. Padding 4 dhe 10,5px
// (në vend të 6 dhe 11,5) i fut tabelat e gjera brenda një ekrani 390px; me 6/11,5
// tabela e kanaleve del 488px dhe kolona e fundit pritet.
h = h.replace(/<table class="tbl">/g, `<table cellpadding="4" cellspacing="0" width="100%" style="${S({ 'border-collapse': 'collapse', width: '100%', 'font-size': '10.5px' })}">`);
h = h.replace(/<table class="bars">/g, `<table cellpadding="5" cellspacing="0" width="100%" style="${S({ 'border-collapse': 'collapse', width: '100%', 'font-size': '11.5px' })}">`);

// stili i kokës vihet një herë te <thead> — vetitë e tekstit trashëgohen te çdo <th>
const THEAD = `<thead bgcolor="${NAVY}" style="${S({ 'background-color': NAVY, color: '#fff', 'font-size': '8.5px', 'letter-spacing': '1px', 'text-transform': 'uppercase', 'font-weight': '700' })}">`;
h = h.replace(/<thead>/g, THEAD)
     .replace(/<th class="r">/g, '<th align="right">')
     .replace(/<th>/g, '<th align="left">');

// Rekomandimet: kokat gjithnjë majtas, dhe stilet që vinin nga `td:nth-child(...)`
// vihen me dorë — përzgjedhësit pozicionalë nuk inline-hen dot.
h = h.replace(/(<div class="recs">.*?<\/table>)/s, blk => blk
  .replace(/<th align="right"/g, '<th align="left"')
  .replace(/<tbody>(.*?)<\/tbody>/s, (m, body) => '<tbody>' + body.replace(/<tr([^>]*)>(.*?)<\/tr>/gs, (r, attrs, cells) => {
    let i = 0;
    return `<tr${attrs}>` + cells.replace(/<td>/g, () => {
      i++;
      if (i === 1) return `<td width="22" valign="top" style="color:${GOLD};font-weight:700">`;
      if (i === 3) return `<td width="15%" valign="top" style="color:${MUTED}">`;
      if (i === 4) return `<td width="24%" valign="top" style="color:${MUTED}">`;
      return '<td valign="top" style="line-height:1.55">';
    }) + '</tr>';
  }) + '</tbody>'));

// Rreshtat e tabelave: brez ngjyre në vend të kufirit për rresht. Kufiri te <tr>
// kërkon border-collapse dhe nuk mbahet nga çdo klient; bgcolor mbahet nga të gjithë,
// dhe kursen ~7 KB mbi 166 rreshta.
h = h.replace(/<tbody>(.*?)<\/tbody>/gs, (m, body) => {
  let i = 0;
  return '<tbody>' + body.replace(/<tr(?: class="tot")?>/g, tag =>
    tag.includes('tot')
      ? `<tr bgcolor="#eef2f7" style="${S({ 'font-weight': '700', 'border-top': `2px solid ${NAVY}` })}">`
      : (i++ % 2 ? '<tr bgcolor="#f7f9fb">' : '<tr>')) + '</tbody>';
});
// tabelat e shtyllave horizontale s'kanë tbody — atyre u mbetet kufiri për rresht
h = h.replace(/(<table cellpadding="5"[^>]*>)(.*?)(<\/table>)/gs,
  (m, open, body, close) => open + body.replace(/<tr>/g, `<tr style="border-bottom:1px solid ${LINE}">`) + close);

h = h.replace(/<td class="r"/g, '<td align="right"')
     .replace(/<td class="bl">/g, `<td width="24%" style="${S({ 'white-space': 'nowrap', 'font-weight': '600', color: NAVY })}">`)
     .replace(/<td class="bv">/g, `<td width="18%" align="right" style="white-space:nowrap">`)
     .replace(/<td class="bb">/g, '<td width="44%">')
     // varianti me ngjyrë i pari: përndryshe do të mbeteshin dy atribute `style`
     // në të njëjtën qelizë dhe shenja +/- do ta humbte ngjyrën
     .replace(/<td class="bd" style="color:([^"]+)"/g, '<td width="14%" align="right" style="white-space:nowrap;font-size:10.5px;color:$1"')
     .replace(/<td class="bd"/g, '<td width="14%" align="right" style="white-space:nowrap;font-size:10.5px"');
// shtyllat horizontale: span → div me lartësi (span-i inline nuk merr height)
h = h.replace(/<span style="width:(\d+)%;background:([^"]+)"><\/span>/g,
  (m, w, c) => `<table width="${w}%" cellpadding="0" cellspacing="0"><tr>`
    + `<td height="8" bgcolor="${c}" style="font-size:0;line-height:0">&nbsp;</td></tr></table>`);

// 5 · kontejnerët
const D = {
  pgbody: { padding: '18px 28px 14px' },
  cover: { padding: '14px 0 18px', 'border-bottom': `2px solid ${GOLD}`, 'margin-bottom': '16px' },
  eyebrow: { 'font-size': '9px', 'letter-spacing': '3px', color: GOLD, 'font-weight': '700', 'text-transform': 'uppercase' },
  sub: { 'font-size': '12px', color: MUTED },
  fine: { 'font-size': '10.5px', color: MUTED, 'line-height': '1.55', margin: '0 0 10px' },
  warn: { 'background-color': '#fdf6e3', 'border-left': `3px solid ${GOLD}`, padding: '10px 12px', margin: '10px 0', 'font-size': '12.5px' },
  cap: { 'font-size': '10px', color: MUTED, margin: '4px 0 12px', 'font-style': 'italic' },
  vwrap: { margin: '14px 0' },
  tw: { 'overflow-x': 'auto' },
  recs: {},
};
for (const [cls, st] of Object.entries(D)) {
  const tag = cls === 'fine' ? 'p' : 'div';
  h = h.replace(new RegExp(`<${tag} class="${cls}">`, 'g'), Object.keys(st).length ? `<${tag} style="${S(st)}">` : `<${tag}>`);
}
h = h.replace(/<section class="pg">/g, `<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="${S({ 'background-color': '#fff', 'max-width': '900px', margin: '14px auto', 'border-top': `4px solid ${GOLD}` })}"><tr><td>`)
     .replace(/<\/section>/g, '</td></tr></table>');

// 6 · tipografia — pa bllok <style>, çdo kokë e ka stilin e vet
h = h.replace(/<h1>/g, `<h1 style="${S({ 'font-size': '28px', margin: '8px 0 6px', color: NAVY, 'line-height': '1.15' })}">`)
     .replace(/<h2>/g, `<h2 style="${S({ 'font-size': '16px', color: NAVY, margin: '22px 0 8px', 'padding-bottom': '5px', 'border-bottom': `1px solid ${LINE}` })}">`)
     .replace(/<h3>/g, `<h3 style="${S({ 'font-size': '13px', color: NAVY, margin: '18px 0 6px' })}">`)
     .replace(/<p>/g, '<p style="margin:0 0 10px">');

const out = `<!DOCTYPE html><html lang="sq"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${title}</title></head>
<body style="${S({ margin: '0', 'background-color': '#eef1f5', color: INK, font: '14px/1.6 Arial,Helvetica,sans-serif' })}">
${h}
</body></html>`;

fs.writeFileSync(dst, out);
const kb = Buffer.byteLength(out) / 1024;
console.log(`${dst} · ${kb.toFixed(1)} KB · kufiri i Gmail-it ~102 KB · ${kb < 95 ? 'OK' : 'SHUMË I MADH'}`);
