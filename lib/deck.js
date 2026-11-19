// PC Deck: telefon jako gładzik, pilot multimediów, launcher aplikacji i pilot do slajdów.
// Strona dla telefonu (deck/) jest serwowana w sieci Wi-Fi pod adresem z losowym tokenem. Każdy telefon
// trzeba zatwierdzić na komputerze (zdarzenie 'pair-request', 4-cyfrowy kod do porównania). Sterowanie idzie
// przez WebSocket tylko od zatwierdzonych telefonów; ruchy i klawisze wykonuje native/deck.ps1 (SendInput).
//
// Użycie (proces główny):
//   const { Deck } = require('./lib/deck');
//   const deck = new Deck({ dataDir: app.getPath('userData'), getApps: async () => [{ name, icon }], launch: i => …, getMedia: () => ({ title, artist, playing }) });
//   deck.on('pair-request', r => …);   // { id, name, ip, code } -> pokaż „Zatwierdź telefon?” -> deck.approve(r.id) / deck.deny(r.id)
//   deck.on('state', s => …);          // { running, url, qr, devices: [{ id, name, connected, lastSeen }], pending: [...] , error }
//   await deck.start();                // zwraca stan z url (i qr jako data URL, jeśli jest pakiet qrcode)
//   deck.stop(); deck.forget(id); deck.resetToken();   // resetToken = nowy adres, wszystkie telefony trzeba sparować od nowa
//   deck.pushMedia({ title, artist, playing });        // opcjonalnie: „teraz gra” na telefonie
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const PREFERRED_PORT = 47910;
const STATIC_DIR = path.join(__dirname, '..', 'deck');
const STATIC = { 'index.html': 'text/html; charset=utf-8', 'deck.css': 'text/css; charset=utf-8', 'deck.js': 'text/javascript; charset=utf-8' };
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Dozwolone klawisze i skróty (nic spoza tej listy nie da się wysłać z telefonu).
const KEYS = {
  play: 0xB3, next: 0xB0, prev: 0xB1, stop: 0xB2, volup: 0xAF, voldown: 0xAE, mute: 0xAD,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28, enter: 0x0D, esc: 0x1B, back: 0x08, tab: 0x09, space: 0x20,
  home: 0x24, end: 0x23, pgup: 0x21, pgdn: 0x22, del: 0x2E, f5: 0x74, f11: 0x7A, b: 0x42, k: 0x4B, j: 0x4A, l: 0x4C, f: 0x46, m: 0x4D,
};
const COMBOS = {
  'alt+tab': [0x12, 0x09], 'win+d': [0x5B, 0x44], 'win+tab': [0x5B, 0x09], 'alt+f4': [0x12, 0x73], 'shift+f5': [0x10, 0x74],
  'ctrl+c': [0x11, 0x43], 'ctrl+v': [0x11, 0x56], 'ctrl+x': [0x11, 0x58], 'ctrl+z': [0x11, 0x5A], 'ctrl+a': [0x11, 0x41],
  'ctrl+w': [0x11, 0x57], 'ctrl+t': [0x11, 0x54], 'ctrl+shift+t': [0x11, 0x10, 0x54], 'ctrl+tab': [0x11, 0x09], 'win': [0x5B],
};

const b64url = n => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const sameHash = (a, b) => { const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function lanAddress() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) for (const a of addrs || []) {
    if (a.family !== 'IPv4' || a.internal) continue;
    if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Bluetooth|Tailscale|ZeroTier|Hamachi/i.test(name)) continue;
    const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
    list.push({ ip: a.address, score: (priv ? 2 : 0) + (/Wi-?Fi|WLAN|Ethernet/i.test(name) ? 1 : 0) });
  }
  list.sort((a, b) => b.score - a.score);
  return list[0] ? list[0].ip : '127.0.0.1';
}
function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// ---------- minimalny WebSocket (serwer) ----------
class Sock extends EventEmitter {
  constructor(socket) {
    super(); this.socket = socket; this.buf = Buffer.alloc(0); this.alive = true; this.closed = false;
    socket.setNoDelay(true);
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.end());
    socket.on('error', () => this.end());
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 2) {
      const fin = this.buf[0] & 0x80, op = this.buf[0] & 0x0f, masked = this.buf[1] & 0x80;
      let len = this.buf[1] & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { this.close(1009); return; }
      if (!masked || len > 8192) { this.close(1002); return; } // klient musi maskować; duże ramki odrzucamy
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) { this.close(1000); return; }
      if (op === 0x9) { this.frame(0xA, data); continue; }
      if (op === 0xA) { this.alive = true; continue; }
      if (op === 0x1 && fin) this.emit('message', data.toString('utf8'));
    }
  }
  frame(op, payload) {
    if (this.closed) return;
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | op, len]) : Buffer.from([0x80 | op, 126, len >> 8, len & 255]);
    try { this.socket.write(Buffer.concat([head, payload])); } catch {}
  }
  send(obj) { this.frame(0x1, Buffer.from(JSON.stringify(obj))); }
  ping() { if (!this.alive) return this.end(); this.alive = false; this.frame(0x9, Buffer.alloc(0)); }
  close(code = 1000) { const b = Buffer.alloc(2); b.writeUInt16BE(code); this.frame(0x8, b); setTimeout(() => this.end(), 100); }
  end() { if (this.closed) return; this.closed = true; try { this.socket.destroy(); } catch {} this.emit('close'); }
}

class Deck extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.dataDir = opts.dataDir || path.join(os.homedir(), '.wyspa');
    this.file = path.join(this.dataDir, 'deck.json');
    this.getApps = opts.getApps || (async () => []);
    this.launch = opts.launch || (() => {});
    this.getMedia = opts.getMedia || (() => null);
    this.runnerFactory = opts.runner || null; // do testów: () => ({ write(line), stop() })
    this.port = opts.port || PREFERRED_PORT;
    this.server = null; this.url = ''; this.qr = '';
    this.pending = new Map(); this.socks = new Map(); this.runner = null; this.error = '';
    this.load();
  }
  load() {
    try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8')); this.token = j.token; this.devices = Array.isArray(j.devices) ? j.devices : []; } catch {}
    if (!this.token) { this.token = b64url(18); this.devices = []; }
  }
  save() {
    try { fs.mkdirSync(this.dataDir, { recursive: true }); fs.writeFileSync(this.file, JSON.stringify({ token: this.token, devices: this.devices }, null, 2)); } catch {}
  }
  get state() {
    return {
      running: !!this.server, url: this.url, qr: this.qr, error: this.error,
      devices: this.devices.map(d => ({ id: d.id, name: d.name, added: d.added, lastSeen: d.lastSeen, connected: this.socks.has(d.id) })),
      pending: [...this.pending.values()].filter(p => p.status === 'pending').map(p => ({ id: p.id, name: p.name, ip: p.ip, code: p.code })),
    };
  }
  emitState() { this.emit('state', this.state); }

  async start() {
    if (this.server) return this.state;
    this.error = '';
    const server = http.createServer((req, res) => this.onRequest(req, res).catch(() => { try { res.writeHead(500); res.end(); } catch {} }));
    server.on('upgrade', (req, socket) => this.onUpgrade(req, socket));
    const listen = port => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', () => { server.removeListener('error', reject); resolve(server.address().port); }); });
    let port;
    try { port = await listen(this.port); } catch { try { port = await listen(0); } catch (e) { this.error = 'Nie udało się uruchomić serwera: ' + e.message; this.emitState(); return this.state; } }
    this.server = server;
    this.url = `http://${lanAddress()}:${port}/d/${this.token}/`;
    try { this.qr = await require('qrcode').toDataURL(this.url, { margin: 1, width: 240, color: { dark: '#000000', light: '#ffffff' } }); } catch { this.qr = ''; }
    this.ping = setInterval(() => { for (const s of this.socks.values()) s.ping(); for (const [id, p] of this.pending) if (Date.now() - p.at > 3 * 60e3) this.pending.delete(id); }, 20000);
    this.emitState();
    return this.state;
  }
  stop() {
    clearInterval(this.ping);
    for (const s of this.socks.values()) s.close(1001);
    this.socks.clear(); this.pending.clear();
    if (this.server) { try { this.server.close(); } catch {} this.server = null; }
    this.url = ''; this.qr = '';
    if (this.runner) { try { this.runner.stop(); } catch {} this.runner = null; }
    this.emitState();
  }
  resetToken() { const was = !!this.server; this.stop(); this.token = b64url(18); this.devices = []; this.save(); if (was) return this.start(); this.emitState(); }
  approve(id) {
    const p = this.pending.get(id); if (!p || p.status !== 'pending') return false;
    p.key = b64url(24); p.status = 'approved';
    this.devices = this.devices.filter(d => d.id !== id);
    this.devices.push({ id, name: p.name, keyHash: sha(p.key), added: Date.now(), lastSeen: 0 });
    this.save(); this.emitState(); return true;
  }
  deny(id) { const p = this.pending.get(id); if (p) p.status = 'denied'; this.emitState(); }
  forget(id) {
    this.devices = this.devices.filter(d => d.id !== id); this.save();
    const s = this.socks.get(id); if (s) s.close(4001);
    this.emitState();
  }
  pushMedia(m) { for (const s of this.socks.values()) s.send({ t: 'media', m }); }

  // ---------- HTTP ----------
  async onRequest(req, res) {
    const u = new URL(req.url, 'http://x');
    const send = (code, body, type = 'application/json; charset=utf-8', extra = {}) => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    const prefix = `/d/${this.token}/`;
    if (!u.pathname.startsWith(prefix)) return send(404, 'Nie ma takiej strony.', 'text/plain; charset=utf-8');
    const rest = u.pathname.slice(prefix.length);
    const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (req.method === 'GET' && (rest === '' || STATIC[rest])) {
      const name = rest || 'index.html';
      return send(200, fs.readFileSync(path.join(STATIC_DIR, name)), STATIC[name], name === 'index.html' ? { 'Content-Security-Policy': CSP } : {});
    }
    if (req.method === 'POST' && rest === 'pair') {
      const j = await readJson(req).catch(() => ({}));
      const waiting = [...this.pending.values()].filter(p => p.status === 'pending');
      if (waiting.length >= 3) return send(429, { error: 'Za dużo telefonów czeka na zatwierdzenie.' });
      const name = String(j.name || 'Telefon').replace(/[\u0000-\u001f<>]/g, '').slice(0, 40) || 'Telefon';
      const id = b64url(9), code = String(crypto.randomInt(1000, 10000));
      this.pending.set(id, { id, name, ip, code, at: Date.now(), status: 'pending' });
      this.emit('pair-request', { id, name, ip, code });
      this.emitState();
      return send(200, { id, code });
    }
    const m = rest.match(/^pair\/([\w-]{6,20})$/);
    if (req.method === 'GET' && m) {
      const p = this.pending.get(m[1]);
      if (!p) return send(404, { status: 'expired' });
      if (p.status === 'approved') { this.pending.delete(p.id); return send(200, { status: 'approved', id: p.id, key: p.key }); }
      if (p.status === 'denied') { this.pending.delete(p.id); return send(200, { status: 'denied' }); }
      return send(200, { status: 'pending', code: p.code });
    }
    return send(404, { error: 'not found' });
  }

  // ---------- WebSocket sterowania ----------
  onUpgrade(req, socket) {
    const u = new URL(req.url, 'http://x');
    const reject = code => { try { socket.write(`HTTP/1.1 ${code} No\r\nConnection: close\r\n\r\n`); } catch {} socket.destroy(); };
    if (u.pathname !== `/d/${this.token}/ws`) return reject(404);
    const dev = this.devices.find(d => d.id === u.searchParams.get('dev'));
    const key = u.searchParams.get('key') || '';
    if (!dev || !key || !sameHash(dev.keyHash, sha(key))) return reject(401);
    const wsKey = req.headers['sec-websocket-key'];
    if (!wsKey || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') return reject(400);
    const accept = crypto.createHash('sha1').update(wsKey + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const s = new Sock(socket);
    const old = this.socks.get(dev.id); if (old) old.close(4000);
    this.socks.set(dev.id, s);
    dev.lastSeen = Date.now(); this.save(); this.emitState();
    let budget = 300, last = Date.now(); // ok. 300 poleceń/s, nadmiar jest odrzucany
    s.on('message', text => {
      const now = Date.now(); budget = Math.min(300, budget + (now - last) * 0.3); last = now;
      if (budget < 1) return; budget--;
      let msg; try { msg = JSON.parse(text); } catch { return; }
      this.handle(msg, s);
    });
    s.on('close', () => { if (this.socks.get(dev.id) === s) { this.socks.delete(dev.id); dev.lastSeen = Date.now(); this.save(); this.emitState(); } });
    Promise.resolve(this.getApps()).then(apps => s.send({ t: 'hello', name: os.hostname(), apps: (apps || []).map(a => a && { name: a.name, icon: a.icon }) })).catch(() => s.send({ t: 'hello', name: os.hostname(), apps: [] }));
    const media = this.getMedia(); if (media) s.send({ t: 'media', m: media });
  }
  input(line) {
    if (!this.runner) this.runner = this.runnerFactory ? this.runnerFactory() : spawnRunner();
    this.runner.write(line);
  }
  handle(m, s) {
    const int = (v, lim) => Math.max(-lim, Math.min(lim, Math.round(Number(v) || 0)));
    const btn = b => (b === 'r' || b === 'm') ? b : 'l';
    switch (m && m.t) {
      case 'm': { const x = int(m.x, 600), y = int(m.y, 600); if (x || y) this.input(`m ${x} ${y}`); break; }
      case 'c': this.input(`c ${btn(m.b)}`); break;
      case 'd': this.input(`b ${btn(m.b)} 1`); break;
      case 'u': this.input(`b ${btn(m.b)} 0`); break;
      case 's': { const y = int(m.y, 2400), x = int(m.x, 2400); if (x || y) this.input(`s ${y} ${x}`); break; }
      case 'k': if (Object.prototype.hasOwnProperty.call(KEYS, m.k)) this.input(`k ${KEYS[m.k]}`); break;
      case 'x': if (Object.prototype.hasOwnProperty.call(COMBOS, m.k)) this.input(`x ${COMBOS[m.k].join(',')}`); break;
      case 'text': { const t = String(m.s || '').slice(0, 500); if (t) this.input(`t ${Buffer.from(t, 'utf8').toString('base64')}`); break; }
      case 'launch': { const i = int(m.i, 20); if (i >= 0) this.launch(i); break; }
      case 'ping': s.send({ t: 'pong' }); break;
    }
  }
}

// proces PowerShell z SendInput (native/deck.ps1), uruchamiany przy pierwszym poleceniu; sam się odradza
function spawnRunner() {
  let proc = null, stopped = false, queue = [];
  const start = () => {
    proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'native', 'deck.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let ready = false;
    proc.stdout.on('data', d => { if (!ready && /ready/.test(String(d))) { ready = true; for (const l of queue) proc.stdin.write(l + '\n'); queue = []; } });
    proc.on('exit', () => { proc = null; if (!stopped) setTimeout(start, 1000); });
    proc.write = l => { if (ready) proc.stdin.write(l + '\n'); else if (queue.length < 200) queue.push(l); };
  };
  start();
  return {
    write: l => { try { proc && proc.write(l); } catch {} },
    stop: () => { stopped = true; try { proc && proc.stdin.write('q\n'); proc && proc.kill(); } catch {} },
  };
}

module.exports = { Deck, lanAddress, KEYS, COMBOS };
