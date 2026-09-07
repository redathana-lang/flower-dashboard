// heartbeat.js — drop-in for FLOW Dashboard, Gonxhe (Hotel Concierge-Web) and Flow HR (Node/Express).
// Usage:  const { beat } = require('./heartbeat');
//         beat('guest-reply-agent', 'Hotel Concierge-Web (Gonxhe)', 'replied to +355… conversation');
// Never throws, never blocks: a failed heartbeat is logged and ignored.
// Env: HEARTBEAT_URL (Apps Script web-app URL), HEARTBEAT_KEY (same value as the script property).

const HEARTBEAT_URL = process.env.HEARTBEAT_URL || '';
const HEARTBEAT_KEY = process.env.HEARTBEAT_KEY || '';
const last = new Map(); // agent -> ms of last beat, to avoid spamming the sheet

function beat(agent, system, note, opts = {}) {
  if (!HEARTBEAT_URL || !HEARTBEAT_KEY) return;
  const minGapMs = opts.minGapMs ?? 10 * 60 * 1000; // at most one beat per agent per 10 min
  const now = Date.now();
  if (now - (last.get(agent) || 0) < minGapMs) return;
  last.set(agent, now);
  fetch(HEARTBEAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent, system, note: String(note || '').slice(0, 200), key: HEARTBEAT_KEY }),
    redirect: 'follow',
  }).catch((e) => console.warn('[heartbeat]', agent, e.message));
}

module.exports = { beat };

/* WHERE TO CALL IT
 * FLOW Dashboard (server.js):
 *   - after a successful POST /api/sales-raw (export saved + Drive copy):  beat('export-archive-agent','FLOW Dashboard → Google Drive', name)
 *   - after the daily sales-state recompute:                              beat('pick-up-agent','FLOW Dashboard','snapshot rebuilt')
 *   - in gmail-worker after the workbook is written:                       beat('workbook-writer-agent','gmail-worker → Power BI workbook','workbook updated')
 * Gonxhe / Hotel Concierge-Web:
 *   - after each reply is sent to a guest:                                 beat('guest-reply-agent','Hotel Concierge-Web (Gonxhe)','reply sent')
 *   - when a conversation is opened/classified:                            beat('guest-inbox-agent','Hotel Concierge-Web (Gonxhe)','new conversation')
 *   - when post-stay feedback is captured:                                 beat('guest-feedback-agent','Gonxhe CRM','feedback captured')
 * Flow HR:
 *   - when attendance for a day is saved:                                  beat('attendance-agent','Flow HR','attendance saved')
 *   - when payroll for a month is calculated:                              beat('payroll-agent','Flow HR','payroll <month> calculated')
 *   - when a contract PDF is generated:                                    beat('contract-documents-agent','Flow HR','contract generated')
 */
