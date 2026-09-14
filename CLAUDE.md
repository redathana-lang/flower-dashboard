# FLOW — Flower Hotels & Resorts

Dashboard-i operativ dhe komercial i Flower Hotel & Spa (Golem). Node/Express, i
shërbyer nga Render; të dhënat vijnë nga Google Sheets, nga eksportet e Trinosoft-it
dhe nga inbox-i i flowreport26@gmail.com.

## Rregulla që kursejnë kohë

- **Kursi:** Lek ÷ 100 = EUR. I njëjti kudo, si te P&L-ja.
- **Agjentët në cloud nuk e arrijnë serverin.** `*.onrender.com` është i bllokuar nga
  proxy-ja. Çdo gjë që duhet ndarë me një sesion Claude kalon nëpër **Google Drive**.
  Token-i i serverit ka `drive` të plotë, ndaj lexon edhe skedarë që i ka shkruar
  konektori i Drive-it.
- **Gmail-i i pret mesazhet mbi ~102 KB** dhe i heq bllokun `<style>` në aplikacionin
  celular. Emailet ndërtohen me tabela dhe stile inline, pa `<img>`.
- **Agjentët nuk bëjnë aritmetikë.** Shifrat llogariten me kod, agjentët shkruajnë
  tekstin, dhe një kalim verifikimi i kontrollon të gjitha kundrejt kodit.

## Automatizimet

| Çfarë | Kur | Ku |
|---|---|---|
| Parashikimi | pas çdo ngarkimi eksporti | `forecast.js` → `forecast.json` në Drive |
| Raporti komercial javor | **e hënë 10:00** Europe/Tirane | `weeklyBrief.js`, dërgim nga serveri |
| Raporti mujor | me një klik nga paneli admin | `.claude/monthly-report/` → Drive → `POST /api/send-monthly-report` |

`WEEKLY_BRIEF_DOW` / `_HOUR` / `_TZ` / `_TO` e ndryshojnë dërgimin javor pa prekur kodin.

## Raporti mujor

Formati, tubacioni, burimet e të dhënave dhe gjendja e raportit të Gushtit 2026 janë te
**`.claude/monthly-report/README.md`**. Lexoje të parin para se të preket raporti mujor —
aty janë edhe pyetjet e hapura.

## Endpoint-et që përdoren shpesh

    GET  /api/forecast?token=…              parashikimi si JSON
    POST /api/forecast/publish              rillogarit dhe e ngarkon në Drive
    POST /api/weekly-brief {preview|to}     ndërton ose dërgon raportin javor
    GET  /api/monthly-report/latest         cilin raport do të dërgonte butoni
    GET  /api/monthly-report/preview        raportin vetë, për ta lexuar
    POST /api/send-monthly-report           dërgon; `testTo` e kufizon te një adresë

Token-i i adminit: `ADMIN_TOKEN` (parazgjedhje `Rep26`).
