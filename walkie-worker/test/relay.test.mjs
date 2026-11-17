// Local test: start `npx wrangler dev --port 8799` with WALKIE_SECRET=test-secret in .dev.vars, then `npm test`.
import crypto from 'node:crypto';

const BASE = process.env.WALKIE_URL || 'ws://127.0.0.1:8799';
const SECRET = process.env.WALKIE_SECRET || 'test-secret';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function pass(id, name, expMs = Date.now() + 3600e3, secret = SECRET) {
  const p = b64u(JSON.stringify({ id, name, role: 'EMPLOYEE', exp: expMs }));
  return p + '.' + b64u(crypto.createHmac('sha256', secret).update(p).digest());
}

function client(id, name, opts = {}) {
  const ws = new WebSocket(`${BASE}/ws?ch=${opts.ch || 'test-' + RUN}&pass=${encodeURIComponent(opts.pass || pass(id, name))}`);
  ws.binaryType = 'arraybuffer';
  const c = { ws, texts: [], bins: [], closed: null };
  ws.onmessage = e => (typeof e.data === 'string' ? c.texts.push(JSON.parse(e.data)) : c.bins.push(new Uint8Array(e.data)));
  ws.onclose = e => { c.closed = e.code; };
  c.open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('connect failed')); });
  c.send = o => ws.send(typeof o === 'string' || o instanceof Uint8Array ? o : JSON.stringify(o));
  c.until = async (fn, ms = 3000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const f = c.texts.find(fn); if (f) return f; await new Promise(r => setTimeout(r, 20)); }
    throw new Error('timeout waiting for message');
  };
  return c;
}

const RUN = Date.now().toString(36);
let fails = 0;
const ok = (cond, label) => { console.log((cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fails++; };

// 1. bad / expired / wrong-secret / bad channel passes are refused
for (const [label, opts] of [
  ['garbage pass refused', { pass: 'abc.def' }],
  ['expired pass refused', { pass: pass('E1', 'Ravi', Date.now() - 1000) }],
  ['wrong secret refused', { pass: pass('E1', 'Ravi', Date.now() + 3600e3, 'other') }],
  ['bad channel refused', { ch: 'Bad Channel!' }],
]) {
  const c = client('E1', 'Ravi', opts);
  let refused = false; try { await c.open; } catch (e) { refused = true; }
  ok(refused, label);
}

// 2. two good clients see each other
const a = client('E1', 'Ravi'), b = client('E2', 'Asha');
await a.open; await b.open;
const roster = await b.until(m => m.t === 'roster' && m.users.length === 2);
ok(roster.users.map(u => u.name).join() === 'Asha,Ravi', 'roster shows both people');

// 3. floor control + audio relay
a.send({ t: 'ptt', on: true });
await a.until(m => m.t === 'granted');
const talking = await b.until(m => m.t === 'talking');
ok(talking.id === 'E1' && talking.name === 'Ravi', 'listener told who is talking');
const frame = new Uint8Array(1600).map((_, i) => i % 251);
a.send(frame);
await new Promise(r => setTimeout(r, 300));
ok(b.bins.length === 1 && Buffer.compare(Buffer.from(b.bins[0]), Buffer.from(frame)) === 0, 'audio frame arrives unchanged');
ok(a.bins.length === 0, 'sender does not get own audio back');
b.send({ t: 'ptt', on: true });
const busy = await b.until(m => m.t === 'busy');
ok(busy.name === 'Ravi', 'second person told the floor is busy');
b.send(frame); await new Promise(r => setTimeout(r, 200));
ok(a.bins.length === 0, 'audio from a non-talker is dropped');

// 4. release
a.send({ t: 'ptt', on: false });
await b.until(m => m.t === 'idle');
ok(true, 'floor released');
b.send({ t: 'ptt', on: true });
await b.until(m => m.t === 'granted');
ok(true, 'second person can talk after release');
b.send({ t: 'ptt', on: false });

// 5. same person on a second phone replaces the first
const a2 = client('E1', 'Ravi'); await a2.open;
await new Promise(r => setTimeout(r, 400));
ok(a.closed === 4000, 'same person on a new phone closes the old connection');

// 6. disconnecting talker frees the floor
a2.send({ t: 'ptt', on: true }); await a2.until(m => m.t === 'granted');
await b.until(m => m.t === 'talking' && m.id === 'E1');
a2.ws.close();
await b.until(m => m.t === 'idle');
const r2 = await b.until(m => m.t === 'roster' && m.users.length === 1);
ok(r2.users[0].name === 'Asha', 'talker leaving frees the floor and updates roster');

b.ws.close();
console.log(fails ? `\n${fails} FAILED` : '\nAll relay tests passed');
process.exit(fails ? 1 : 0);
