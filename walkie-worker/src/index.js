/**
 * Travalate Walkie-Talkie relay (Cloudflare Worker + Durable Object).
 *
 * One Durable Object per channel. Phones connect with a WebSocket:
 *   wss://<worker>/ws?ch=<channel>&pass=<pass from the attendance app>
 *
 * - The pass is made by the attendance app's Apps Script (walkiePass) and signed with WALKIE_SECRET.
 * - Text messages (JSON): {t:'ptt', on:true|false}  → ask for / give back the floor.
 * - Binary messages: one audio frame (mu-law, 16 kHz, mono). Only the person holding the floor may send.
 * - Server → phone text: roster, talking, idle, busy, denied, clip. Audio frames are forwarded as-is.
 * - Every finished message is also saved (the last KEEP_CLIPS per channel; older ones are deleted automatically):
 *     GET /history?ch=&pass=          → JSON list, newest first
 *     GET /clip?ch=&pass=&id=<id>     → the raw audio (mu-law, 16 kHz, mono)
 */

const CHANNEL_RE = /^[a-z0-9-]{1,24}$/;
const MAX_TALK_MS = 60000;   // one press can hold the floor for at most 60 s
const MAX_FRAME = 8000;      // bytes; a normal frame is ~1600 (100 ms)
const KEEP_CLIPS = 20;       // saved messages kept per channel
const MIN_CLIP = 4000;       // bytes (~0.25 s); shorter taps are not saved
const MAX_CLIP = 1000000;    // bytes (~62 s); safety cap, fits one database row
const CORS = { 'access-control-allow-origin': '*' };

function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Returns {id, name, role} for a valid, unexpired pass, otherwise null. */
export async function verifyPass(pass, secret, now = Date.now()) {
  try {
    if (!pass || !secret) return null;
    const dot = String(pass).indexOf('.');
    if (dot < 1) return null;
    const payloadB64 = pass.slice(0, dot), sigB64 = pass.slice(dot + 1);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sigB64), new TextEncoder().encode(payloadB64));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    if (!p || !p.id || !(Number(p.exp) > now)) return null;
    return { id: String(p.id), name: String(p.name || p.id).slice(0, 40), role: String(p.role || '') };
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, app: 'walkie' }), { headers: { 'content-type': 'application/json' } });
    }
    const isWs = url.pathname === '/ws', isGet = url.pathname === '/history' || url.pathname === '/clip';
    if (!isWs && !isGet) return new Response('Not found', { status: 404 });
    if (isWs && request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });

    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin');
    if (allowed.length && origin && allowed.indexOf(origin) < 0) return new Response('Origin not allowed', { status: 403 });

    const ch = String(url.searchParams.get('ch') || '').toLowerCase();
    if (!CHANNEL_RE.test(ch)) return new Response('Bad channel', { status: 400, headers: CORS });
    const user = await verifyPass(url.searchParams.get('pass'), env.WALKIE_SECRET);
    if (!user) return new Response('Bad or expired pass', { status: 401, headers: CORS });

    const stub = env.ROOM.get(env.ROOM.idFromName(ch));
    const fwd = new Request(request.url, request);
    fwd.headers.set('x-walkie-id', user.id);
    fwd.headers.set('x-walkie-name', encodeURIComponent(user.name));
    fwd.headers.set('x-walkie-role', user.role);
    return stub.fetch(fwd);
  },
};

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // 'ping' → 'pong' is answered by the runtime without waking the object (keeps phones connected for free).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS clips (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, uid TEXT, name TEXT, dur INTEGER, audio BLOB)');
    this.rec = null;   // the message being recorded right now: {uid, name, ts, chunks, bytes}
  }

  /** Saved messages, newest first (no audio). */
  history() {
    return this.sql.exec('SELECT id, ts, uid, name, dur FROM clips ORDER BY id DESC LIMIT ?', KEEP_CLIPS).toArray();
  }

  /** Save the message being recorded (if long enough) and drop everything older than the newest KEEP_CLIPS. */
  finishRec() {
    const r = this.rec; this.rec = null;
    if (!r || r.bytes < MIN_CLIP) return;
    const audio = new Uint8Array(r.bytes);
    let o = 0;
    for (const c of r.chunks) { audio.set(c, o); o += c.byteLength; }
    const dur = Math.round(r.bytes / 16);   // 16 bytes per ms (16 kHz, 1 byte per sample)
    const id = this.sql.exec('INSERT INTO clips (ts, uid, name, dur, audio) VALUES (?, ?, ?, ?, ?) RETURNING id',
      r.ts, r.uid, r.name, dur, audio).one().id;
    this.sql.exec('DELETE FROM clips WHERE id NOT IN (SELECT id FROM clips ORDER BY id DESC LIMIT ?)', KEEP_CLIPS);
    this.broadcast({ t: 'clip', clip: { id, ts: r.ts, uid: r.uid, name: r.name, dur } });
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/history') {
      return new Response(JSON.stringify(this.history()), { headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (path === '/clip') {
      const id = Number(new URL(request.url).searchParams.get('id'));
      const row = Number.isInteger(id) ? this.sql.exec('SELECT audio FROM clips WHERE id = ?', id).toArray()[0] : null;
      if (!row) return new Response('Gone', { status: 404, headers: CORS });
      return new Response(row.audio, { headers: { ...CORS, 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=86400' } });
    }
    const id = request.headers.get('x-walkie-id');
    const name = decodeURIComponent(request.headers.get('x-walkie-name') || id);
    const role = request.headers.get('x-walkie-role') || '';
    // The same person on a second phone replaces the first connection.
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.id === id) { try { ws.close(4000, 'Opened on another phone'); } catch (e) { /* already closed */ } }
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name, role, talking: false, since: 0 });
    this.broadcastRoster();
    server.send(JSON.stringify(this.floorMessage()));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Who holds the floor now (looked up from the sockets, so it survives the object going to sleep). */
  floorHolder() {
    const now = Date.now();
    for (const ws of this.live()) {
      const a = ws.deserializeAttachment();
      if (a && a.talking) {
        if (now - a.since > MAX_TALK_MS) { a.talking = false; ws.serializeAttachment(a); continue; }
        return { ws, a };
      }
    }
    return null;
  }

  floorMessage() {
    const h = this.floorHolder();
    return h ? { t: 'talking', id: h.a.id, name: h.a.name } : { t: 'idle' };
  }

  /** Sockets that are really open (a socket that is closing can still be listed inside the close handler). */
  live() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }

  roster() {
    return this.live().map(ws => ws.deserializeAttachment()).filter(Boolean)
      .map(a => ({ id: a.id, name: a.name })).sort((p, q) => p.name.localeCompare(q.name));
  }

  broadcast(msg, except) {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of this.live()) {
      if (ws === except) continue;
      try { ws.send(text); } catch (e) { /* closing */ }
    }
  }

  broadcastRoster() { this.broadcast({ t: 'roster', users: this.roster() }); }

  async webSocketMessage(ws, data) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    if (typeof data !== 'string') {
      // Audio frame: forward only from the current talker.
      if (!a.talking || data.byteLength > MAX_FRAME) return;
      const now = Date.now();
      if (now - a.since > MAX_TALK_MS) { this.release(ws, a); return; }
      if (this.rec && this.rec.uid === a.id && this.rec.bytes + data.byteLength <= MAX_CLIP) {
        this.rec.chunks.push(new Uint8Array(data)); this.rec.bytes += data.byteLength;
      }
      for (const other of this.live()) {
        if (other === ws) continue;
        try { other.send(data); } catch (e) { /* closing */ }
      }
      return;
    }
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || m.t !== 'ptt') return;
    if (m.on) {
      const h = this.floorHolder();
      if (h && h.ws !== ws) { ws.send(JSON.stringify({ t: 'busy', id: h.a.id, name: h.a.name })); return; }
      a.talking = true; a.since = Date.now(); ws.serializeAttachment(a);
      this.finishRec();
      this.rec = { uid: a.id, name: a.name, ts: a.since, chunks: [], bytes: 0 };
      ws.send(JSON.stringify({ t: 'granted' }));
      this.broadcast({ t: 'talking', id: a.id, name: a.name }, ws);
    } else if (a.talking) {
      this.release(ws, a);
    }
  }

  release(ws, a) {
    a.talking = false; ws.serializeAttachment(a);
    this.finishRec();
    this.broadcast({ t: 'idle' });
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a && a.talking) { a.talking = false; ws.serializeAttachment(a); this.finishRec(); }
    try { ws.close(); } catch (e) { /* already closed */ }
    this.broadcast({ t: 'idle' }, ws);
    this.broadcastRoster();
  }

  async webSocketError(ws) { await this.webSocketClose(ws); }
}
