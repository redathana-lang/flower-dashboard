const XLSX = require('xlsx');
const fs = require('fs');
const DIR = process.env.MR_DIR || process.argv[3] || __dirname + '/data';
const WB = process.env.MR_WORKBOOK || process.argv[2];
if (!WB) { console.error('përdorimi: node extract.js <workbook.xlsx> [dosja] [muaji YYYY-MM]'); process.exit(1); }
const wb = XLSX.readFile(WB);
const S = n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' });
const mk = s => typeof s === 'number' ? new Date(Date.UTC(1899,11,30) + Math.round(s)*86400000).toISOString().slice(0,7) : String(s);
const dk = s => typeof s === 'number' ? new Date(Date.UTC(1899,11,30) + Math.round(s)*86400000).toISOString().slice(0,10) : String(s);
const AY = process.env.MR_MONTH || process.argv[4] || '2026-08';
const [AYy, AYm] = AY.split('-').map(Number);
const LY = (AYy - 1) + '-' + String(AYm).padStart(2, '0');
const PREV = (AYm === 1 ? AYy - 1 : AYy) + '-' + String(AYm === 1 ? 12 : AYm - 1).padStart(2, '0');
const out = {};

// EX. SUMMARY — every month (for charts) + the three months we compare
const ex = S('EX. SUMMARY'), exH = ex[0];
out.exSummary = {};
ex.slice(1).forEach(r => { if (typeof r[0]==='number') { const o={}; exH.forEach((h,i)=>{ if(h) o[h]=r[i]; }); out.exSummary[mk(r[0])] = o; } });

// P&L (ALL) → EUR ÷100
const pl = S('P&L');
out.pl = {};
pl.slice(1).forEach(r => { if (typeof r[0]==='number') out.pl[mk(r[0])] = {
  rev: r[2]/100, budRev: r[3]/100, exp: r[4]/100, budExp: r[5]/100, prf: r[6]/100, budPrf: r[7]/100,
  revLek: r[2], expLek: r[4], prfLek: r[6] }; });

// CHANNEL PERFORMANCE
const ch = S('CHANNEL PERFORMANCE');
const chFor = key => { const m={}; ch.slice(1).forEach(r=>{ if(mk(r[0])!==key) return; const name=String(r[1]||'').trim(); if(!name||r[2]==='') return;
  if(!m[name]) m[name]={channel:name,rev:0,nights:0,res:0,commission:0};
  m[name].rev+=(+r[2]||0); m[name].commission+=(+r[4]||0); m[name].nights+=(+r[5]||0); m[name].res+=(+r[6]||0); });
  return Object.values(m).map(x=>({...x, adr: x.nights>0? x.rev/x.nights:0, alos: x.res>0? x.nights/x.res:0})).sort((a,b)=>b.rev-a.rev); };
out.channels = { ay: chFor(AY), ly: chFor(LY) };

// SOURCE MARKETS (wide, EUR)
const sm = S('SOURCE MARKETS'), smH = sm[0];
const smFor = key => { const row = sm.slice(1).find(r=>mk(r[0])===key); if(!row) return [];
  return smH.map((h,i)=> i>0&&h ? {market:h, rev:+row[i]||0} : null).filter(x=>x&&x.rev!==0).sort((a,b)=>b.rev-a.rev); };
out.sourceMarkets = { ay: smFor(AY), ly: smFor(LY) };

// BOARD (package mix)
const bd = S('BOARD'), bdH = bd[0];
const bdFor = key => { const row = bd.slice(1).find(r=>mk(r[0])===key); if(!row) return [];
  return bdH.map((h,i)=> i>0&&h&&h!=='Revenue' ? {board:h, rev:+row[i]||0} : null).filter(x=>x&&x.rev!==0).sort((a,b)=>b.rev-a.rev); };
out.board = { ay: bdFor(AY), ly: bdFor(LY) };

// MARKET SEGMENT
const ms = S('MARKET SEGMENT'), msH = ms[0];
const msFor = key => { const row = ms.slice(1).find(r=>mk(r[0])===key); if(!row) return [];
  return msH.map((h,i)=> i>0&&h&&h!=='TOTAL' ? {segment:h, rev:+row[i]||0} : null).filter(x=>x&&x.rev!==0).sort((a,b)=>b.rev-a.rev); };
out.marketSegment = { ay: msFor(AY), ly: msFor(LY), all: {} };
ms.slice(1).forEach(r=>{ if(typeof r[0]==='number'){ const o={}; msH.forEach((h,i)=>{ if(h&&i>0) o[h]=+r[i]||0; }); out.marketSegment.all[mk(r[0])]=o; } });

// Expenses by category (Lek)
const exp = S('Expenses');
const expFor = key => exp.slice(1).filter(r=>mk(r[0])===key && r[1]).map(r=>({cat:String(r[1]).trim(), lek:+r[2]||0, ytd:+r[3]||0, budget:+r[4]||0, varr:+r[5]||0})).sort((a,b)=>b.lek-a.lek);
out.expenses = { ay: expFor(AY), ly: expFor(LY) };

// Revenues by department (Lek)
const rev = S('Revenues');
const revFor = key => rev.slice(1).filter(r=>mk(r[0])===key && r[1]).map(r=>({dept:String(r[1]).trim(), lek:+r[2]||0, ytd:+r[3]||0, budget:+r[4]||0, varr:+r[5]||0})).sort((a,b)=>b.lek-a.lek);
out.revenues = { ay: revFor(AY), ly: revFor(LY) };

// Monthly cash flow
const cf = S('Monthly Cash Flow'), cfH = cf[0];
const cfFor = key => { const row = cf.slice(1).find(r=>mk(r[0])===key); if(!row) return null;
  const o={}; cfH.forEach((h,i)=>{ if(h&&i>0) o[String(h).trim()] = +row[i]||0; }); return o; };
out.cashflow = { ay: cfFor(AY), ly: cfFor(LY), prev: cfFor(PREV) };

// Marketing cost
const mc = S('MARKETING COST'), mcH = mc[0];
const mcFor = key => { const row = mc.slice(1).find(r=>mk(r[0])===key); if(!row) return null;
  const o={}; mcH.forEach((h,i)=>{ if(h&&i>0) o[String(h).trim()] = +row[i]||0; }); return o; };
out.marketing = { ay: mcFor(AY), ly: mcFor(LY) };

// Daily occupancy for the month
const hd = S('HOTEL DAILY PERFORMANCE');
out.daily = hd.slice(1).filter(r=>typeof r[0]==='number' && dk(r[0]).slice(0,7)===AY)
  .map(r=>({date: dk(r[0]), occ: +r[2]||0, nights: +r[3]||0, avail: +r[4]||0, rev: +r[5]||0}));
out.dailyLy = hd.slice(1).filter(r=>typeof r[0]==='number' && dk(r[0]).slice(0,7)===LY)
  .map(r=>({date: dk(r[0]), occ: +r[2]||0, nights: +r[3]||0, avail: +r[4]||0, rev: +r[5]||0}));

// Online reputation
const or_ = S('ONLINE REPUTATION'), orH = or_[0];
out.reputation = {};
or_.slice(1).forEach(r=>{ if(typeof r[0]==='number'){ const o={}; orH.forEach((h,i)=>{ if(h&&i>0) o[String(h).trim()]=r[i]; }); out.reputation[mk(r[0])]=o; } });

// Daily F&B revenues for the month (outlets)
const fb = S('DAILY F&B REVENUES'), fbH = fb[0];
out.fnbHeader = fbH;
const fbSum = key => { const tot={}; fb.slice(1).forEach(r=>{ if(typeof r[0]!=='number'||dk(r[0]).slice(0,7)!==key) return;
  fbH.forEach((h,i)=>{ if(i>0&&h) tot[String(h).trim()]=(tot[String(h).trim()]||0)+(+r[i]||0); }); }); return tot; };
out.fnb = { ay: fbSum(AY), ly: fbSum(LY) };

fs.writeFileSync(DIR + '/data_' + AY + '.json', JSON.stringify(out, null, 1));
console.log('shkruar. çelësa:', Object.keys(out).join(', '));
console.log('kanale gusht 26:', out.channels.ay.length, '| tregje:', out.sourceMarkets.ay.length, '| ditë:', out.daily.length, '| shpenzime:', out.expenses.ay.length);
console.log('F&B header:', fbH.slice(0,10).join(' | '));
console.log('cashflow gusht:', out.cashflow.ay ? Object.keys(out.cashflow.ay).length+' zëra' : 'MUNGON');
console.log('reputacioni gusht:', JSON.stringify(out.reputation[AY]));
