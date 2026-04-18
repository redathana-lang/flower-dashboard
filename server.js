const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const SUBS_FILE = path.join(__dirname, 'subscriptions.json');

const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : __dirname;

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

// VAPID keys (hardcoded - generated once)
const VAPID_PUBLIC  = 'BBhLXpHFoobumd5D0D2a-AsZVS30YoZggjPe2X65-_yVYTVGYWEQCbTT53iuag99iJCgqkCGhTW3EjLl5XISaas';
const VAPID_PRIVATE = 'nPnaCTyXqTiLxkiIELJKCte8B2KyNUI7uQAZeQ9uZkg';
const VAPID_SUBJECT = 'mailto:info@hotel-flower.com';

// ── helpers ────────────────────────────────────────────────
function b64urlDecode(s){ return Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64'); }
function b64urlEncode(b){ return Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }

function makeVapidToken(audience){
  const now = Math.floor(Date.now()/1000);
  const header = b64urlEncode(JSON.stringify({typ:'JWT',alg:'ES256'}));
  const payload = b64urlEncode(JSON.stringify({aud:audience,exp:now+3600,sub:VAPID_SUBJECT}));
  const signing = `${header}.${payload}`;
  const privKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('308193020100301306072a8648ce3d020106082a8648ce3d030107047930770201010420','hex'),
      b64urlDecode(VAPID_PRIVATE),
      Buffer.from('a00a06082a8648ce3d030107a14403420004','hex'),
      b64urlDecode(VAPID_PUBLIC)
    ]),
    format:'der', type:'pkcs8'
  });
  const sig = crypto.sign('sha256', Buffer.from(signing), {key:privKey, dsaEncoding:'ieee-p1363'});
  return `${signing}.${b64urlEncode(sig)}`;
}

function sendPush(sub, payload){
  return new Promise((resolve,reject)=>{
    try{
      const endpoint = new url.URL(sub.endpoint);
      const audience = `${endpoint.protocol}//${endpoint.host}`;
      const token = makeVapidToken(audience);
      const authKey = b64urlDecode(sub.keys.auth);
      const p256dh = b64urlDecode(sub.keys.p256dh);
      // Simple plaintext push (no encryption for now - works on most browsers)
      const body = Buffer.from(JSON.stringify(payload));
      const opts = {
        hostname: endpoint.hostname,
        path: endpoint.pathname + endpoint.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length,
          'Authorization': `vapid t=${token},k=${VAPID_PUBLIC}`,
          'TTL': '86400'
        }
      };
      const req = https.request(opts, res=>{
        let d=''; res.on('data',c=>d+=c);
        res.on('end',()=>resolve({status:res.statusCode, body:d}));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    }catch(e){ reject(e); }
  });
}

// ── data ──────────────────────────────────────────────────
function loadData(){ try{ if(fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }catch(e){} return {}; }
function saveData(d){ try{ fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2)); return true; }catch(e){ return false; } }
function loadSubs(){ try{ if(fs.existsSync(SUBS_FILE)) return JSON.parse(fs.readFileSync(SUBS_FILE,'utf8')); }catch(e){} return []; }
function saveSubs(s){ try{ fs.writeFileSync(SUBS_FILE,JSON.stringify(s,null,2)); }catch(e){} }

let DB = loadData();

const DEPT_LABELS = {
  frontoffice:'🗝️ Front Office', spa:'💆 SPA', fnb:'🍽️ F&B',
  allinclusive:'⭐ All Inclusive / HK', finance:'💰 Cash Flow', financefnb:'🧾 Finance'
};

// ── API ───────────────────────────────────────────────────
app.get('/api/vapid-public-key', (req,res) => res.json({publicKey: VAPID_PUBLIC}));

app.post('/api/subscribe', (req,res)=>{
  const { subscription, userId } = req.body;
  if(!subscription) return res.status(400).json({error:'No subscription'});
  let subs = loadSubs().filter(s => s.userId !== userId);
  subs.push({ subscription, userId, createdAt: new Date().toISOString() });
  saveSubs(subs);
  console.log(`Subscribed: ${userId}`);
  res.json({success:true});
});

app.post('/api/unsubscribe', (req,res)=>{
  const { userId } = req.body;
  saveSubs(loadSubs().filter(s => s.userId !== userId));
  res.json({success:true});
});

app.post('/api/report', (req,res)=>{
  const { dept, date, submittedBy, ...fields } = req.body;
  if(!dept||!date) return res.status(400).json({error:'dept dhe date janë të detyrueshme'});
  if(!DB[date]) DB[date]={};
  DB[date][dept] = { dept, date, ...fields, submittedBy, saved_at: new Date().toISOString() };
  const ok = saveData(DB);

  // Notify MANAGER only
  const subs = loadSubs().filter(s => s.userId === 'MANAGER');
  if(subs.length > 0){
    const deptName = DEPT_LABELS[dept] || dept;
    const notifPayload = {
      title: 'FLOW — Flower Hotels',
      body: `${deptName} ka dorëzuar raportin · ${date}`,
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      dept, date
    };
    subs.forEach(({subscription})=>{
      sendPush(subscription, notifPayload).then(r=>{
        console.log(`Push sent to MANAGER: ${r.status}`);
        if(r.status===410||r.status===404) saveSubs(loadSubs().filter(s=>s.userId!=='MANAGER'));
      }).catch(e=> console.error('Push error:',e.message));
    });
  }
  res.json({success:ok});
});

app.get('/api/reports', (req,res)=>{
  const { date } = req.query;
  if(!date) return res.status(400).json({error:'date e nevojshme'});
  res.json(DB[date]||{});
});

app.get('/api/reports/range', (req,res)=>{
  const { from, to } = req.query;
  if(!from||!to) return res.status(400).json({error:'from dhe to'});
  const result={};
  const cur=new Date(from); const end=new Date(to);
  while(cur<=end){
    const d=cur.toISOString().split('T')[0];
    result[d]=DB[d]||{};
    cur.setDate(cur.getDate()+1);
  }
  res.json(result);
});

app.get('/api/ping', (req,res) => res.json({status:'ok',records:Object.keys(DB).length}));

app.get('*', (req,res)=>{
  const p = path.join(publicDir,'index.html');
  if(fs.existsSync(p)) res.sendFile(p);
  else res.status(404).send('index.html not found');
});

app.listen(PORT, ()=> console.log(`FLOW running on port ${PORT}`));
