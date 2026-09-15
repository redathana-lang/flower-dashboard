/**
 * topdf.js — faqos raportin HTML në PDF me kokë dhe fund faqeje.
 *
 *   node .claude/monthly-report/topdf.js <in.html> <out.pdf> "<titulli i kokës>"
 *
 * Kreu dhe fundi i faqes vijnë nga Chromium (jo nga HTML-ja): CSS-ja e shtypit
 * te render.js i fsheh `.pghd`/`.pgft` pikërisht që të mos dyfishohen.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const [src, dst, head] = process.argv.slice(2);
const label = head || 'FLOWER HOTEL & SPA · RAPORTI MUJOR I PERFORMANCËS · KONFIDENCIAL';
const st = 'font-size:7px;color:#6b7f96;width:100%;padding:0 12mm;font-family:Arial,Helvetica,sans-serif';

(async () => {
  const b = await chromium.launch({ channel: 'chromium' });
  const p = await b.newPage();
  await p.goto('file://' + require('path').resolve(src), { waitUntil: 'networkidle' });
  await p.emulateMedia({ media: 'print' });
  await p.pdf({
    path: dst,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="${st};text-align:left">${label}</div>`,
    footerTemplate: `<div style="${st};display:flex;justify-content:space-between">`
      + `<span>Burimet: FLOW dashboard · Fleta raportuese Power BI · Eksportet POS të outleteve</span>`
      + `<span>Faqja <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '14mm', bottom: '14mm', left: '8mm', right: '8mm' },
  });
  await b.close();
  const kb = require('fs').statSync(dst).size / 1024;
  console.log(`${dst} · ${kb.toFixed(0)} KB`);
})();
