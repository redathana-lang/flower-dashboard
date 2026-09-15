'use strict';
// facts.js — çdo shifër e raportit mujor llogaritet këtu, jo nga agjentët.
// përdorimi: node facts.js <workbook.xlsx> [dosja] [muaji YYYY-MM]
// Blloku i reputacionit (Guestflip) mbartet nga skedari ekzistues nëse gjendet.
const XLSX = require('xlsx'), fs = require('fs'), path = require('path');
const WB = process.env.MR_WORKBOOK || process.argv[2];
const DIR = process.env.MR_DIR || process.argv[3] || __dirname + '/data';
const AY = process.env.MR_MONTH || process.argv[4] || '2026-08';
if (!WB) { console.error('përdorimi: node facts.js <workbook.xlsx> [dosja] [muaji]'); process.exit(1); }
const [ayY, ayM] = AY.split('-').map(Number);
const LY = (ayY - 1) + '-' + String(ayM).padStart(2, '0');
const PREV = (ayM === 1 ? ayY - 1 : ayY) + '-' + String(ayM === 1 ? 12 : ayM - 1).padStart(2, '0');
const R = 100; // Lek → EUR

const wb = XLSX.readFile(WB);
const S = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
const mk = s => typeof s === 'number' ? new Date(Date.UTC(1899,11,30) + Math.round(s)*86400000).toISOString().slice(0,7) : String(s);
const dk = s => typeof s === 'number' ? new Date(Date.UTC(1899,11,30) + Math.round(s)*86400000).toISOString().slice(0,10) : String(s);
const pct = (a,b) => b ? ((a-b)/Math.abs(b)*100) : null;
const r0 = v => v==null?null:Math.round(v), r1 = v => v==null?null:Math.round(v*10)/10;
const F = {};

// ── EX. SUMMARY ──────────────────────────────────────────────────────────────
const ex = S('EX. SUMMARY'), EH = ex[0], ei = {}; EH.forEach((h,i)=>{ if(h) ei[h]=i; });
const row = k => ex.slice(1).find(r => mk(r[0]) === k);
const e = row(AY), l = row(LY), p = row(PREV);
if (!e) { console.error('muaji ' + AY + ' nuk gjendet te EX. SUMMARY'); process.exit(1); }
const V = (r,k) => r ? (+r[ei[k]] || 0) : 0;

// ── P&L (ALL ÷ 100) ──────────────────────────────────────────────────────────
const pl = S('P&L'); const plFor = k => { const r = pl.slice(1).find(x => mk(x[0])===k); return r ? { rev:r[2]/R, budRev:r[3]/R, exp:r[4]/R, budExp:r[5]/R, prf:r[6]/R, budPrf:r[7]/R } : null; };
const B = plFor(AY) || { budRev:0, budExp:0, budPrf:0 };

F.period = { month: AY, ly: LY, prev: PREV };
const rev=V(e,'OPERATING REVENUES'), lrev=V(l,'OPERATING REVENUES');
const exp_=V(e,'TOTAL EXPENSES'), lexp=V(l,'TOTAL EXPENSES');
const nop=V(e,'NOP'), lnop=V(l,'NOP');
F.kpi = {
  nights:{ay:V(e,'ROOMS SOLD'), ly:V(l,'ROOMS SOLD'), d:r1(pct(V(e,'ROOMS SOLD'),V(l,'ROOMS SOLD')))},
  avail:{ay:V(e,'ROOMS AVAILABLE'), ly:V(l,'ROOMS AVAILABLE'), d:r1(pct(V(e,'ROOMS AVAILABLE'),V(l,'ROOMS AVAILABLE')))},
  occ:{ay:r1(V(e,'OCCUPANCY')*100), ly:r1(V(l,'OCCUPANCY')*100), dPts:r1((V(e,'OCCUPANCY')-V(l,'OCCUPANCY'))*100)},
  adr:{ay:r1(V(e,'ADR')), ly:r1(V(l,'ADR')), d:r1(pct(V(e,'ADR'),V(l,'ADR')))},
  revpar:{ay:r1(V(e,'REVPAR')), ly:r1(V(l,'REVPAR')), d:r1(pct(V(e,'REVPAR'),V(l,'REVPAR')))},
  trevpar:{ay:r1(V(e,'TREVPAR')), ly:r1(V(l,'TREVPAR')), d:r1(pct(V(e,'TREVPAR'),V(l,'TREVPAR')))},
  alos:{ay:V(e,'ALOS'), ly:V(l,'ALOS'), d:r1(pct(V(e,'ALOS'),V(l,'ALOS')))},
  rev:{ay:r0(rev), ly:r0(lrev), d:r1(pct(rev,lrev)), bud:r0(B.budRev), vsBud:r1(rev/B.budRev*100), gap:r0(rev-B.budRev)},
  exp:{ay:r0(exp_), ly:r0(lexp), d:r1(pct(exp_,lexp)), bud:r0(B.budExp), vsBud:r1(exp_/B.budExp*100), gap:r0(exp_-B.budExp)},
  gop:{ay:r0(V(e,'GOP')), ly:r0(V(l,'GOP')), d:r1(pct(V(e,'GOP'),V(l,'GOP'))), marginAy:r1(V(e,'GOP')/rev*100), marginLy:r1(V(l,'GOP')/lrev*100)},
  ebitda:{ay:r0(V(e,'EBITDA')), ly:r0(V(l,'EBITDA')), d:r1(pct(V(e,'EBITDA'),V(l,'EBITDA')))},
  nop:{ay:r0(nop), ly:r0(lnop), d:r1(pct(nop,lnop)), marginAy:r1(nop/rev*100), marginLy:r1(lnop/lrev*100), bud:r0(B.budPrf), vsBud:r1(nop/B.budPrf*100), gap:r0(nop-B.budPrf)},
  labor:{ay:r0(V(e,'LABOR COST')), ly:r0(V(l,'LABOR COST')), d:r1(pct(V(e,'LABOR COST'),V(l,'LABOR COST'))),
    pctAy:r1(V(e,'LABOR COST')/rev*100), pctLy:r1(V(l,'LABOR COST')/lrev*100),
    fteAy:V(e,"FTE`S"), fteLy:V(l,"FTE`S"), avgAy:r0(V(e,'AVERAGE LABOR COSTS')), avgLy:r0(V(l,'AVERAGE LABOR COSTS')),
    perSoldAy:r1(V(e,'LABOR COST')/V(e,'ROOMS SOLD')), perSoldLy:r1(V(l,'LABOR COST')/V(l,'ROOMS SOLD'))},
  cpor:{ay:r1(V(e,'ROOMS EXPENSES')/V(e,'ROOMS SOLD')), ly:r1(V(l,'ROOMS EXPENSES')/V(l,'ROOMS SOLD')), sheetAy:r1(V(e,'CPOR')), sheetLy:r1(V(l,'CPOR'))},
  roomsRev:{ay:r0(V(e,'ROOMS REVENUE')), ly:r0(V(l,'ROOMS REVENUE')), d:r1(pct(V(e,'ROOMS REVENUE'),V(l,'ROOMS REVENUE')))},
  fnbRev:{ay:r0(V(e,'F&B REVENUE')), ly:r0(V(l,'F&B REVENUE')), d:r1(pct(V(e,'F&B REVENUE'),V(l,'F&B REVENUE')))},
  otherRev:{ay:r0(V(e,'OTHER REVENUE')), ly:r0(V(l,'OTHER REVENUE')), d:r1(pct(V(e,'OTHER REVENUE'),V(l,'OTHER REVENUE')))},
  deptExp:{ay:r0(V(e,'DEPARTAMENTAL EXPENSES')), ly:r0(V(l,'DEPARTAMENTAL EXPENSES')), d:r1(pct(V(e,'DEPARTAMENTAL EXPENSES'),V(l,'DEPARTAMENTAL EXPENSES'))), pctAy:r1(V(e,'DEPARTAMENTAL EXPENSES')/rev*100), pctLy:r1(V(l,'DEPARTAMENTAL EXPENSES')/lrev*100)},
  undistExp:{ay:r0(V(e,'UNDISTRIBUTED EXPENSES')), ly:r0(V(l,'UNDISTRIBUTED EXPENSES')), d:r1(pct(V(e,'UNDISTRIBUTED EXPENSES'),V(l,'UNDISTRIBUTED EXPENSES'))), pctAy:r1(V(e,'UNDISTRIBUTED EXPENSES')/rev*100)},
  houseUse:{ay:r0(V(e,'HOUSE USE')), ly:r0(V(l,'HOUSE USE'))},
  avgCheck:{flowerAy:V(e,'AVERAGE CHECK FLOWER'), flowerLy:V(l,'AVERAGE CHECK FLOWER'), brutalAy:V(e,'AVERAGE CHECK BRUTAL'), brutalLy:V(l,'AVERAGE CHECK BRUTAL')},
};
F.revDelta = r0(rev-lrev); F.prfDelta = r0(nop-lnop);
F.flowThrough = r1((nop-lnop)/(rev-lrev)*100);
F.vsPrev = { rev:r0(V(p,'OPERATING REVENUES')), nop:r0(V(p,'NOP')), adr:r1(V(p,'ADR')), occ:r1(V(p,'OCCUPANCY')*100), nights:V(p,'ROOMS SOLD'),
  revD:r1(pct(rev,V(p,'OPERATING REVENUES'))), nopD:r1(pct(nop,V(p,'NOP'))), adrD:r1(pct(V(e,'ADR'),V(p,'ADR'))) };
const ytd=(y,upto)=>{ let a={rev:0,nop:0,nights:0,avail:0}; for(let m=1;m<=upto;m++){ const r=row(y+'-'+String(m).padStart(2,'0')); if(!r) continue;
  a.rev+=V(r,'OPERATING REVENUES'); a.nop+=V(r,'NOP'); a.nights+=V(r,'ROOMS SOLD'); a.avail+=V(r,'ROOMS AVAILABLE'); } return {rev:r0(a.rev),nop:r0(a.nop),nights:a.nights,avail:a.avail}; };
F.ytd = { ay:ytd(ayY,ayM), ly:ytd(ayY-1,ayM) };
F.ytd.revD=r1(pct(F.ytd.ay.rev,F.ytd.ly.rev)); F.ytd.nopD=r1(pct(F.ytd.ay.nop,F.ytd.ly.nop));
let bR=0,bP=0; for(let m=1;m<=ayM;m++){ const b=plFor(ayY+'-'+String(m).padStart(2,'0')); if(b){bR+=b.budRev;bP+=b.budPrf;} }
F.ytd.budRev=r0(bR); F.ytd.budPrf=r0(bP); F.ytd.prfGap=r0(F.ytd.ay.nop-bP);

// ── kanalet ──────────────────────────────────────────────────────────────────
const ch=S('CHANNEL PERFORMANCE');
const chFor=k=>{ const m={}; ch.slice(1).forEach(r=>{ if(mk(r[0])!==k) return; const n=String(r[1]||'').trim(); if(!n||r[2]==='') return;
  if(!m[n]) m[n]={channel:n,rev:0,nights:0,res:0,commission:0};
  m[n].rev+=(+r[2]||0); m[n].commission+=(+r[4]||0); m[n].nights+=(+r[5]||0); m[n].res+=(+r[6]||0); });
  return Object.values(m); };
const cAy=chFor(AY), cLy={}; chFor(LY).forEach(c=>cLy[c.channel]=c.rev);
const totCh=cAy.reduce((s,c)=>s+c.rev,0);
F.channels=cAy.filter(c=>c.rev>0).sort((a,b)=>b.rev-a.rev).map(c=>({channel:c.channel, rev:r0(c.rev), nights:c.nights, res:c.res,
  adr:r1(c.nights? c.rev/c.nights:0), alos:Math.round((c.res? c.nights/c.res:0)*100)/100, share:r1(c.rev/totCh*100),
  lyRev:r0(cLy[c.channel]||0), d: cLy[c.channel]? r1(pct(c.rev,cLy[c.channel])):null, commission:r0(c.commission)}));
F.channelTotal={rev:r0(totCh), nights:cAy.reduce((s,c)=>s+c.nights,0), res:cAy.reduce((s,c)=>s+c.res,0)};
const sub=n=>F.channels.filter(c=>n.includes(c.channel)), sum=a=>a.reduce((s,c)=>s+c.rev,0);
const WH=['HOTELBEDS','W2M','OTS','7 BEDS','WEBBEDS','TUI DESTIMO','APOLLO','SCHAUINSLAND'], OT=['BOOKING','EXPEDIA','TRIP.COM'], DR=['DIRECT','WEBSITE'];
F.groups={ wholesale:{rev:r0(sum(sub(WH))), share:r1(sum(sub(WH))/totCh*100)},
  ota:{rev:r0(sum(sub(OT))), share:r1(sum(sub(OT))/totCh*100), commission:r0(sub(OT).reduce((s,c)=>s+c.commission,0))},
  direct:{rev:r0(sum(sub(DR))), share:r1(sum(sub(DR))/totCh*100)},
  itaka:{rev:r0(sum(sub(['ITAKA']))), share:r1(sum(sub(['ITAKA']))/totCh*100)} };

// ── tregjet, paketat, segmentet ──────────────────────────────────────────────
const wide=(sheet,drop)=>{ const a=S(sheet), h=a[0]; const g=k=>{ const r=a.slice(1).find(x=>mk(x[0])===k); if(!r) return [];
  return h.map((x,i)=> i>0&&x&&!drop.includes(String(x)) ? {name:String(x), rev:+r[i]||0} : null).filter(x=>x&&x.rev!==0).sort((a,b)=>b.rev-a.rev); };
  return {ay:g(AY), ly:g(LY)}; };
const sm=wide('SOURCE MARKETS',['TOTAL']);
const smL={}; sm.ly.forEach(m=>smL[m.name]=m.rev);
F.markets=sm.ay.slice(0,12).map(m=>({market:m.name, rev:r0(m.rev), lyRev:r0(smL[m.name]||0), d: smL[m.name]? r1(pct(m.rev,smL[m.name])):null}));
const bd=wide('BOARD',['Revenue']); const bdT=bd.ay.reduce((s,x)=>s+x.rev,0), bdLT=bd.ly.reduce((s,x)=>s+x.rev,0);
const bdL={}; bd.ly.forEach(x=>bdL[x.name]=x.rev);
F.board=bd.ay.map(x=>({board:x.name, rev:r0(x.rev), share:r1(x.rev/bdT*100), lyShare: bdLT? r1((bdL[x.name]||0)/bdLT*100):null}));
const ms=wide('MARKET SEGMENT',['TOTAL']); const msT=ms.ay.reduce((s,x)=>s+x.rev,0);
const msL={}; ms.ly.forEach(x=>msL[x.name]=x.rev);
F.segments=ms.ay.map(x=>({segment:x.name, rev:r0(x.rev), share:r1(x.rev/msT*100), lyRev:r0(msL[x.name]||0), d: msL[x.name]? r1(pct(x.rev,msL[x.name])):null}));

// ── shpenzimet ───────────────────────────────────────────────────────────────
const exS=S('Expenses');
const expFor=k=>exS.slice(1).filter(r=>mk(r[0])===k&&r[1]).map(r=>({cat:String(r[1]).replace(/\s*❗/,'').trim(), lek:+r[2]||0, budget:+r[4]||0}));
const eL={}; expFor(LY).forEach(x=>eL[x.cat]=x.lek);
const eA=expFor(AY), eT=eA.reduce((s,x)=>s+x.lek,0);
F.expenses=eA.sort((a,b)=>b.lek-a.lek).map(x=>({cat:x.cat, lek:r0(x.lek), lekM:Math.round(x.lek/10000)/100, budget:r0(x.budget), varr:r0(x.lek-x.budget),
  lyLek:r0(eL[x.cat]||0), d: eL[x.cat]? r1(pct(x.lek,eL[x.cat])):null, share:r1(x.lek/eT*100)}));
F.expenseTotalLek=r0(eT);

// ── outletet F&B ─────────────────────────────────────────────────────────────
const fb=S('DAILY F&B REVENUES'), fh=fb[0].map(x=>String(x).trim());
const fbSum=k=>{ const t={}; fb.slice(1).forEach(r=>{ if(typeof r[0]!=='number'||dk(r[0]).slice(0,7)!==k) return;
  fh.forEach((h,i)=>{ if(i>0&&h) t[h]=(t[h]||0)+(+r[i]||0); }); }); return t; };
const oA=fbSum(AY), oL=fbSum(LY), OUT=['Flower Restaurant','Pool Bar','Brutal Garden','Pool Bar Garden','Beach Bar'];
F.outlets=OUT.map(o=>({outlet:o, lek:r0(oA[o]||0), lyLek:r0(oL[o]||0), d: oL[o]? r1(pct(oA[o]||0,oL[o])):null})).sort((a,b)=>b.lek-a.lek);
F.outletTotal={lek:r0(OUT.reduce((s,o)=>s+(oA[o]||0),0)), lyLek:r0(OUT.reduce((s,o)=>s+(oL[o]||0),0))};
F.outletTotal.d=r1(pct(F.outletTotal.lek,F.outletTotal.lyLek));

// ── korrigjime të dokumentuara të fletës ─────────────────────────────────────
// Kur fleta mban një vlerë që dihet se është e gabuar, korrigjimi bëhet KËTU dhe
// raportohet hapur te seksioni përkatës — kurrë në heshtje. Çdo zë ka arsyen.
const CORRECTIONS = {
  '2026-08': [
    { sheet: 'Monthly Cash Flow', field: 'Dalje Investime Banke Leke', to: 0,
      note: 'Investimet e gushtit u shlyen në euro; pagesa në Lek ishte zero. Konfirmuar nga COO-ja dhe në përputhje me uljen e angazhimeve të investimeve brenda muajit.' },
  ],
};
const CORR = CORRECTIONS[AY] || [];
const correctionFor = (sheet, field) => CORR.find(c => c.sheet === sheet && c.field === field);

// ── cash flow ────────────────────────────────────────────────────────────────
const cfS=S('Monthly Cash Flow'), CH=cfS[0].map(h=>String(h).trim());
const LBL={'Hyrje Non Cash Lek':'Non Cash Lek','Hyrje Non Cash Bank Euro':'Non Cash Bankë Euro','Hyrje recepsion Cash Euro':'Recepsion Cash Euro','Hyrje Recepsion Cash Lek':'Recepsion Cash Lek','Hyrje Allotments/guarantee Euro':'Allotments/garanci Euro','Disbursim Kredi Euro':'Disbursim Kredi Euro','Hyrje F&B Lek':'F&B Lek','Hyrje MICE Euro':'MICE Euro','Hyrje MICE Lek':'MICE Lek','Dalje Paga Lek':'Paga Lek','Dalje Taksa dhe Utilitete Lek':'Taksa dhe Utilitete Lek','Dalje Kredi Euro':'Kredi Euro','Dalje Kredi Leke':'Kredi Lek','Dalje House Use Lek':'House Use Lek','Dalje Furnitore Cash Lek':'Furnitorë Cash Lek','Dalje Furnitore Cash Euro':'Furnitorë Cash Euro','Dalje Furnitore Banke Leke':'Furnitorë Bankë Lek','Dalje Furnitore Banke Euro':'Furnitorë Bankë Euro','Dalje Investime Banke Euro':'Investime Bankë Euro','Dalje Investime Banke Leke':'Investime Bankë Lek','Dalje Investime Cash Lek':'Investime Cash Lek'};
const cfBuild=k=>{ const r=cfS.slice(1).find(x=>mk(x[0])===k); if(!r) return null;
  const inn=[],out=[],broken=[];
  CH.forEach((h,i)=>{ if(i===0||!h) return; const v=r[i], isIn=/^Hyrje|^Disbursim/i.test(h), isOut=/^Dalje/i.test(h);
    if(!isIn&&!isOut) return;
    if(typeof v!=='number'){ broken.push({field:LBL[h]||h, value: v===''?'(bosh)':String(v)}); return; }
    const fix = k===AY ? correctionFor('Monthly Cash Flow', h) : null;
    const raw = fix ? fix.to : v;
    if (fix) { fix.was = v; fix.label = LBL[h]||h; }
    if (fix && raw === 0) return; // zëri hiqet nga lista, jo shfaqet si zero
    (isIn?inn:out).push({label:LBL[h]||h.replace(/^(Hyrje|Dalje)\s*/,''), eur:r0(/Lek|Leke/i.test(h)? raw/R : raw)}); });
  const nz=a=>a.filter(x=>x.eur!==0);
  const innN=nz(inn).sort((a,b)=>b.eur-a.eur), outN=nz(out).sort((a,b)=>b.eur-a.eur);
  inn.length=0; inn.push(...innN); out.length=0; out.push(...outN);
  const iS=inn.reduce((s,x)=>s+x.eur,0), oS=out.reduce((s,x)=>s+x.eur,0);
  const g=n=>{ const i=CH.indexOf(n); return i<0? null : (typeof r[i]==='number'? r[i] : null); };
  return { in:inn, out:out, totals:{in:iS,out:oS,net:iS-oS}, broken,
    obligations:{ furnitoreStart:r0((g('Detyrimet e Furnitoreve ne fillim te muajit  Lek')||0)/R), furnitoreEnd:r0((g('Detyrimet e Furnitoreve ne fund te muajit  Lek')||0)/R),
      investimeStart:r0((g('Detyrimet e Investimeve ne fillim te muajit Lek')||0)/R), investimeEnd:r0((g('Detyrimet e Investimeve ne fund te muajit  Lek')||0)/R),
      miceReceivable:r0(g('Pagesa per tu mbledhur nga MICE Euro')||0), otaReceivable:r0(g('Pagesa per tu mbledhur nga OTA Euro')||0) } }; };
const cAyF=cfBuild(AY), cPrev=cfBuild(PREV);
const grp=(o,rx)=>o.filter(x=>rx.test(x.label)).reduce((s,x)=>s+x.eur,0);
F.cash={ ay:cAyF, prev:cPrev,
  groups:{ investime:{ay:grp(cAyF.out,/Investime/), ly:grp(cPrev.out,/Investime/)},
    furnitore:{ay:grp(cAyF.out,/Furnitor/), ly:grp(cPrev.out,/Furnitor/)},
    paga:{ay:grp(cAyF.out,/Paga/), ly:grp(cPrev.out,/Paga/)},
    kredi:{ay:grp(cAyF.out,/Kredi/), ly:grp(cPrev.out,/Kredi/)},
    taksa:{ay:grp(cAyF.out,/Taksa/), ly:grp(cPrev.out,/Taksa/)} } };
F.cash.groups.investimeShare=r1(F.cash.groups.investime.ay/cAyF.totals.out*100);
F.cash.groups.furnitoreDelta=r1(pct(F.cash.groups.furnitore.ay,F.cash.groups.furnitore.ly));
const ob=cAyF.obligations;
F.cash.obligationMove={ furnitore:r0(ob.furnitoreEnd-ob.furnitoreStart), investime:r0(ob.investimeEnd-ob.investimeStart),
  total:r0((ob.furnitoreEnd+ob.investimeEnd)-(ob.furnitoreStart+ob.investimeStart)),
  totalStart:r0(ob.furnitoreStart+ob.investimeStart), totalEnd:r0(ob.furnitoreEnd+ob.investimeEnd) };
F.cash.prevObligations = cPrev ? cPrev.obligations : null;
F.cash.complete = cAyF.broken.length === 0;
F.corrections = CORR.map(c => ({ sheet:c.sheet, field:c.field, label:c.label||c.field, was:c.was==null?null:c.was,
  wasEur: c.was==null? null : r0(/Lek|Leke/i.test(c.field)? c.was/R : c.was), to:c.to, note:c.note }));
F.cash.corrections = F.corrections.filter(c => c.sheet === 'Monthly Cash Flow');

// ── marketingu ───────────────────────────────────────────────────────────────
const mc=S('MARKETING COST'), MH=mc[0].map(h=>String(h).trim());
const mFor=k=>{ const r=mc.slice(1).find(x=>mk(x[0])===k); if(!r) return null; const o={}; MH.forEach((h,i)=>{ if(i>0&&h) o[h]=typeof r[i]==='number'?r[i]:0; }); return o; };
const m8=mFor(AY), m7=mFor(PREV);
const mktLine=(F.expenses.find(x=>/^Marketing$/i.test(x.cat))||{});
F.marketing={ totalEur:r0(m8['MARKETING COST']), houseUse:r0(m8['HOUSE USE']), cashEur:r0(m8['MARKETING COST']-m8['HOUSE USE']),
  meta:r0(m8['Social Media- META ADS']), google:m8['Metasearch + Google Ads'], events:r0(m8['Events']||0), advertising:r0(m8['Advertising Company']||0),
  subscriptions:r0((m8['Guestflip']||0)+(m8['Cloudbeds']||0)+(m8['Zoho CRM']||0)+(m8['Other Subscriptions']||0)),
  pctOfRev:r1(m8['MARKETING COST']/rev*100),
  prev:{totalEur:r0(m7['MARKETING COST']), meta:r0(m7['Social Media- META ADS']), google:m7['Metasearch + Google Ads'], events:r0(m7['Events']||0)},
  accountingLineLek:mktLine.lek||null, accountingLineEur:mktLine.lek? r0(mktLine.lek/R):null,
  budgetLek:mktLine.budget||null, varianceLek:mktLine.varr||null, lyLek:mktLine.lyLek||null, dLy:mktLine.d, shareOfExpenses:mktLine.share };
F.marketing.googleShare=r1(m8['Metasearch + Google Ads']/(m8['MARKETING COST']-m8['HOUSE USE'])*100);
// a rakordon linja kontabël me fletën e marketingut?
F.marketing.reconciles = Math.abs((mktLine.lek||0)/R - (m8['MARKETING COST']-m8['HOUSE USE'])) < 1;

// ── okupanca ditore ──────────────────────────────────────────────────────────
const hd=S('HOTEL DAILY PERFORMANCE');
F.daily=hd.slice(1).filter(r=>typeof r[0]==='number'&&dk(r[0]).slice(0,7)===AY)
  .map(r=>({day:+dk(r[0]).slice(8), occ:r1((+r[2]||0)*100), nights:+r[3]||0, rev:r0(+r[5]||0)}));
F.weakDays=F.daily.filter(x=>x.occ<90).map(x=>({day:x.day, occ:x.occ}));
F.fullDays=F.daily.filter(x=>x.occ>=99).length;

// ── seria mujore ─────────────────────────────────────────────────────────────
F.series=[]; [ayY-1,ayY].forEach(y=>{ for(let m=1;m<=12;m++){ const k=y+'-'+String(m).padStart(2,'0'); const r=row(k), b=plFor(k);
  if(r && (V(r,'OPERATING REVENUES')||V(r,'NOP'))) F.series.push({month:k, rev:r0(V(r,'OPERATING REVENUES')), nop:r0(V(r,'NOP')), budRev:b?r0(b.budRev):null}); }});

// ── reputacioni: mbartet nga skedari ekzistues (burimi është Guestflip) ──────
const outPath = path.join(DIR, 'facts_' + AY + '.json');
try { const old = JSON.parse(fs.readFileSync(outPath,'utf8'));
  if (old.reputation) { F.reputation = old.reputation; F.reputationAvailable = true; } } catch(_) { F.reputationAvailable = false; }

fs.writeFileSync(outPath, JSON.stringify(F,null,1));
console.log('faktet u shkruan te', outPath);
console.log('  të ardhura €'+F.kpi.rev.ay.toLocaleString('de-DE')+' · shpenzime €'+F.kpi.exp.ay.toLocaleString('de-DE')+' · NOP €'+F.kpi.nop.ay.toLocaleString('de-DE')+' ('+F.kpi.nop.vsBud+'% e buxhetit)');
console.log('  flow-through '+F.flowThrough+'% · YTD hendek €'+F.ytd.prfGap.toLocaleString('de-DE'));
console.log('  cash: hyrje €'+F.cash.ay.totals.in.toLocaleString('de-DE')+' dalje €'+F.cash.ay.totals.out.toLocaleString('de-DE')+' neto €'+F.cash.ay.totals.net.toLocaleString('de-DE')+' · i plotë: '+F.cash.complete);
console.log('  detyrimet: furnitorë '+(F.cash.obligationMove.furnitore>=0?'+':'')+F.cash.obligationMove.furnitore+'€ · investime '+F.cash.obligationMove.investime+'€');
console.log('  marketing €'+F.marketing.totalEur+' (cash €'+F.marketing.cashEur+') · rakordon me librat: '+F.marketing.reconciles);
