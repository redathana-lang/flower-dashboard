# Raporti Mujor i Performancës — si ndërtohet

Ky është tubacioni që prodhoi **Raportin Mujor të Performancës, Gusht 2026** (13 faqe
HTML / 15 faqe PDF), në të njëjtin format si raporti i Korrikut 2026 që e miratoi COO-ja.

Ndarja e punës është e qëllimshme: **shifrat llogariten me kod, teksti shkruhet nga
agjentët, dhe çdo shifër e tekstit verifikohet kundrejt kodit.** Agjentët nuk bëjnë
aritmetikë — aty gabojnë.

    workbook (Drive)  ──extract.js──▶  data_<muaj>.json
                                            │
                                      (llogaritjet)
                                            ▼
                                      facts_<muaj>.json ──┬──▶ agjentët shkrues ──▶ sections_<muaj>.json
                                                          └──▶ agjentët verifikues ─┘
                                            │
                                      render.js
                                            ▼
                                  raporti_mujor_<muaj>.html ──▶ PDF ──▶ Drive ──▶ butoni i panelit

## Si rigjenerohet

```bash
# 1. shkarko workbook-un "Sample Data Power Bi Flower.xlsx" (Drive id 1abLRrgklWeV3wx-KEmA0u4SgCH5ebw3s)
node .claude/monthly-report/extract.js /rruga/wb.xlsx .claude/monthly-report/data 2026-09
# 2. llogarit faktet (deltat, peshat, grupimet) → facts_<muaj>.json
# 3. shkruaj seksionet me agjentë, duke lexuar VETËM facts_<muaj>.json → sections_<muaj>.json
# 4. faqos
MR_MONTH=2026-09 node .claude/monthly-report/render.js .claude/monthly-report/data
```

`facts_2026-08.json` dhe `sections_2026-08.json` janë ruajtur si referencë — një muaj i
plotë, i verifikuar, për ta parë se çfarë forme duhet të ketë secili.

## Burimet e të dhënave

| Fleta | Çfarë merret |
|---|---|
| EX. SUMMARY | netë, okupancë, ADR, RevPAR, TRevPAR, ALOS, të ardhura, shpenzime, GOP, EBITDA, NOP, kosto pune, FTE |
| P&L | buxheti (ALL ÷ 100 = EUR) |
| CHANNEL PERFORMANCE | të ardhura, netë, rezervime, ADR, ALOS, komision për kanal |
| SOURCE MARKETS | tregjet burimore (EUR, format i gjerë) |
| BOARD | miksi i paketave |
| MARKET SEGMENT | Direct / MICE / OTA / Wholesalers / Guarantee / Allotment |
| Expenses | shpenzimet sipas kategorisë me buxhet (Lek) |
| DAILY F&B REVENUES | outletet |
| Monthly Cash Flow | hyrje/dalje; Lek ÷ 100 = EUR |
| MARKETING COST | Meta, Google/metasearch, abonime, HOUSE USE, totali |
| HOTEL DAILY PERFORMANCE | okupanca ditore |
| Raporti Guestflip (.xlsx) | reputacioni — ngarkohet veçmas, nuk është në workbook |

Kursi: **Lek ÷ 100 = EUR**, i njëjti që përdor P&L-ja.

## Verifikimi — pse nuk hiqet

Kalimi i verifikimit kapi **19 gabime** para botimit, të gjitha nga agjentët shkrues:
raporte të shpikura (ADR e Itakës "dy të tretat e direktit" kur është 57%), renditje
të gabuara ("ADR-ja e dyta më e lartë" kur ishte e treta), numërime të gabuara kanalesh,
pohime vetë-kontradiktore, dhe ekzagjerime cilësore. Asnjë nuk do të ishte kapur me sy.

## Gjendja e raportit të Gushtit 2026

- **Preview:** https://claude.ai/artifact/WceKxe5Kk5NnJ99QUfqMic (Versioni 2)
- **Test i dërguar** vetëm te redathana@gmail.com më 14 shtator (id `1a0a17183a4759fc`)
- **Nuk është dërguar te ekipi** — pret miratimin e COO-s

### Versioni final — 15 shtator 2026

Financa e plotësoi workbook-un dhe raporti u rindërtua mbi të. Tri gjëra ndryshuan.

**1 · Marketingu rakordon.** Linja te libra ra nga 1,56M në **1,39M Lek** dhe tani
përputhet saktësisht me fletën MARKETING COST minus House Use: **€13.888,70** nga të dyja
anët (më parë €15.605 kundrejt €11.839). U shtua edhe zëri *Events* €2.050, ndaj totali i
fletës është €19.949. Kjo uli shpenzimet totale dhe ngriti pak GOP-in e fitimin.

**2 · Cash flow-i është i plotë.** Formula `#REF!` u rregullua dhe gjashtë kolonat u
mbushën, gjë që i jep përgjigje pyetjes që raporti e kishte lënë hapur — dhe përgjigjja
nuk është e favorshme: pagesat ndaj furnitorëve ranë 31,9% ndërsa detyrimet ndaj tyre
**u rritën €22.128**. Ishte shtyrje pagese. Paralelisht angazhimet e investimeve u ulën
€88.290 — CAPEX i shlyer vërtet. Detyrimet totale ranë €66.162, por struktura u
përkeqësua: borxh investimi afatgjatë u shkëmbye me borxh furnitori afatshkurtër.

**3 · Investimet u shlyen në euro.** Fleta mbante 15.067.542,71 Lek te *Dalje Investime
Banke Leke* përveç €136.946 në euro; pagesa në Lek ishte zero. Regjistruar te
`CORRECTIONS` në `facts.js` dhe e shpallur hapur në raport. Daljet bien në **€621.133**
dhe fluksi neto në **+€360.529** — €144.681 mbi korrikun, jo nën të.

Shifrat përfundimtare: të ardhura €1.153.310 · shpenzime €443.727 · GOP €735.664 ·
fitim neto €709.583 (102,2% e buxhetit) · flow-through 85,6% · hendek YTD −€305.992.

**Gjendja:** preview-ja dhe PDF-ja janë të përditësuara. **Nuk është dërguar te ekipi** —
pret miratimin e COO-s. Emaili test i 14 shtatorit ka shifra para këtyre korrigjimeve dhe
duhet ridërguar përpara.

## Kufizimi i emailit

Raporti i plotë është ~100 KB HTML; Gmail e pret mesazhin mbi ~102 KB. Prandaj:

- **te ekipi** e dërgon serveri, me `POST /api/send-monthly-report` — e merr skedarin nga
  Drive dhe s'ka kufi madhësie (shih `server.js`, `latestMonthlyReport()`);
- **testi me dorë** përmban bërthamën vendimmarrëse: përmbledhja ekzekutive, tabela e
  KPI-ve, reputacioni, të nëntë rekomandimet dhe përfundimi.

Që butoni ta gjejë raportin, skedari duhet ruajtur në Drive me emër që fillon me
`Raporti_Mujor_` dhe mbaron me `.html`.

## Email te financa (Brunilda) — I DËRGUAR

**Draft Gmail** `r-2388506497762178891`, te `financa@hotel-flower.com`, në llogarinë
`flowreport26@gmail.com`. **U dërgua e martë 15 shtator 2026, 08:30 Tirana** — mesazhi `1a0a3c726a38d293`,
fill `1a0a19aa384b745c`. Pret përgjigjen e Brunildës.

Temë: *Cash Flow mujor Gusht 2026 — të dhëna që mungojnë, dhe korrigjimi i shpenzimeve
të marketingut*. Kërkon:

1. Rregullimin e formulës `Dalje Investime Cash Lek` që kthen `#REF!` (korrik: 223.500 Lek).
2. Plotësimin e gjashtë kolonave bosh të gushtit — detyrimet e furnitorëve dhe të
   investimeve në fillim e në fund të muajit, arkëtimet MICE dhe OTA. Arsyeja që jepet:
   pagesat ndaj furnitorëve ranë nga ~€290k në ~€197k pikërisht në muajin me xhiron më të
   lartë, dhe pa këto kolona nuk dihet nëse është ulje borxhi apo shtyrje pagese.
3. Përputhjen e fletës `MARKETING COST` me korrigjimin e bërë te Google Sheet
   **PROJEKSIONI GUSHT 2026** (`180Ip3PZNToav73B-f_mbA5zt9ARPva_M`, modifikuar 14 shtator 2026).

**Kufizim që del përsëri:** konektori Gmail është i lidhur vetëm me
`flowreport26@gmail.com`. Draftet dhe dërgimet dalin nga ajo adresë. Për të shkruar te
`redathana@gmail.com` do të duhej lidhur ajo llogari veçmas si konektor.

## Përmbledhja e shtatorit 2026 (kërkesë e COO-së)

Raporti ishte shumë i gjatë. U shkurtua në dy hapa, pa hequr asnjë shifër apo rekomandim:

1. **Grafikët e dyfishtë** — u hoqën 6 grafikë që përsërisnin tabelën poshtë tyre
   (kanalet, outlet-et, shpenzimet, bordi, të ardhurat sipas muajit, tri shtyllat e cash-it).
   Mbeten 5: zënia ditore, tregjet burim, seria 19-mujore e fitimit, shpërndarja e yjeve, GRI.
2. **Proza** — një kalim kondensimi (11 agjentë, një për seksion) me rregullin: vetëm **hiq**,
   asnjë shifër e re, asnjë gjykim i ndryshuar. Pastaj një kontroll programatik i nënbashkësisë:
   çdo numër i versionit të shkurtër duhet të ekzistojë në të gjatin — ✓ asnjë numër i ri.

Rezultati: teksti 47.458 → 19.290 karaktere (**−59%**), PDF-ja **17 → 11 faqe**.
Versioni i gjatë ruhet te `data/sections_2026-08.long.json`.

## Versioni për email (`emailify.js`)

Raporti i plotë ka një bllok `<style>`; Gmail-i e heq atë në aplikacionin celular, ndaj
raporti do të mbërrinte pa formatim. `emailify.js` e kthen daljen e `render.js` në HTML
ku çdo stil është inline:

```bash
node .claude/monthly-report/emailify.js        # → data/raporti_email_<muaj>.html
node .claude/monthly-report/topdf.js  <in.html> <out.pdf> "<koka>"
```

Tri zgjedhje e mbajnë nën kufirin ~102 KB të Gmail-it — pa to del ~130 KB:

| Në vend të | Përdoret | Kursimi |
|---|---|---|
| `style` te secila nga 80 `<th>` | `<thead>` me stil, që trashëgohet | ~8 KB |
| kufi poshtë çdo `<tr>` | brez ngjyre `bgcolor` çdo rresht tjetër | ~7 KB |
| tabelë e ngulitur për çdo shtyllë grafiku | `valign="bottom"` + `height` te `<td>` | ~8 KB |

Flexbox-i (kartat e treguesve, shtyllat vertikale) zëvendësohet me tabela, sepse Gmail-i
nuk e mban. Kontrolli i fundit: çdo numër i versionit email duhet të ekzistojë te raporti
— i vetmi ndryshim i lejuar është heqja e kokës/fundit të faqes.

## Gabim i hapur — Guestflip, kolona "pozitiv"

Tabela e sentimentit merrte nga Guestflip-i vlerën **1600%** për *Front office* (2 komente,
16 përmendje, 0 negative). Vlera është e pamundur dhe nuk rindërtohet dot nga përmendjet:
`positiveMentions` dhe `positivePct` nuk përputhen për asnjë rresht me kolonën "negative"
bosh (Housekeeping 19/25 por 100%, Spa 10/12 por 100%). `render.js` tani i shënon "—" të
gjitha vlerat jashtë 0–100 dhe e deklaron këtë te legjenda. **Duhet verifikuar me eksportin
burimor të Guestflip-it** para raportit të shtatorit.
