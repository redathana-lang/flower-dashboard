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

### Korrigjime të bëra pas testit të parë

1. **Cash flow.** Qelia `Dalje Investime Cash Lek` kthen `#REF!` për gushtin (korrik:
   223.500 Lek = €2.235). Prandaj dalja €771.808 është **dysheme**, jo përfundimtare,
   dhe fluksi neto €209.854 është aq ose më pak. Gjashtë kolona të tjera janë bosh:
   detyrimet e furnitorëve dhe angazhimet e investimeve (fillim/fund muaji), arkëtimet
   MICE (€9.442 në korrik) dhe OTA (€83.375 në korrik).
   → U shtua një gjetje e re: pagesat ndaj furnitorëve ranë në €197.496 nga €289.884
   (−31,9%) pikërisht në muajin me xhiron më të lartë — dhe pa kolonat e borxhit nuk
   dihet nëse është ulje reale apo shtyrje pagese.
2. **Marketing.** Google/metasearch ishte shtuar në fletë pas nxjerrjes së parë:
   €128,70, jo €0. Totali €17.899 (jo €17.770), cash €11.839, 1,6% e të ardhurave.

### E hapur — për t'u sqaruar nga COO-ja

> **Ka diçka të pasaktë te marketingu.** COO-ja do ta saktësojë; asgjë s'duhet dërguar
> te ekipi para kësaj.

Konteksti i pyetjes: ndarja `cash = MARKETING COST − HOUSE USE` u mor nga vetë raporti
i Korrikut ("€21.517 total, prej të cilave €14.317 cash" — 21.517,25 − 7.200 = 14.317,25).
House Use për marketingun merret nga **kolona N e fletës MARKETING COST** (gusht: 6.060).
Në workbook ka katër «House Use» të ndryshme që nuk duhen ngatërruar:

| Burimi | Gusht 2026 | Çfarë është |
|---|---|---|
| MARKETING COST · N | €6.060 | pjesa e marketingut e mbuluar me house use |
| EX. SUMMARY · HOUSE USE | €15.150,55 | house use i plotë i muajit |
| Monthly Cash Flow · Dalje House Use Lek | 1.088.451 Lek (€10.885) | dalje reale arke |
| DAILY F&B REVENUES · House Use | −1.979.205 Lek | konsum i brendshëm te outletet |

Gjithashtu: **emaili test i dërguar ka dy shifra të vjetruara** — rekomandimi 9 thotë ende
"€0 në Google" dhe rekomandimi 8 nuk e përmend `#REF!`-in. PDF-ja dhe preview-ja janë të
sakta. Emaili duhet ridërguar para se të shkojë te ekipi.

## Kufizimi i emailit

Raporti i plotë është ~100 KB HTML; Gmail e pret mesazhin mbi ~102 KB. Prandaj:

- **te ekipi** e dërgon serveri, me `POST /api/send-monthly-report` — e merr skedarin nga
  Drive dhe s'ka kufi madhësie (shih `server.js`, `latestMonthlyReport()`);
- **testi me dorë** përmban bërthamën vendimmarrëse: përmbledhja ekzekutive, tabela e
  KPI-ve, reputacioni, të nëntë rekomandimet dhe përfundimi.

Që butoni ta gjejë raportin, skedari duhet ruajtur në Drive me emër që fillon me
`Raporti_Mujor_` dhe mbaron me `.html`.

## Email te financa (Brunilda) — draft, pa dërgim automatik

**Draft Gmail** `r-2388506497762178891`, te `financa@hotel-flower.com`, në llogarinë
`flowreport26@gmail.com`. **Dërgimi automatik u anulua** — COO-ja e dërgon vetë nga
adresa e saj. Asnjë routine nuk e nis.

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
