// OBS Studio przez obs-websocket 5 (wbudowany w OBS 28+): REC / LIVE z czasem trwania i sceną
// na pigułce oraz przełączanie nagrywania i transmisji skrótem. Łączy się tylko z 127.0.0.1.
//
// Użycie (proces główny):
//   const { Obs } = require('./lib/obs');
//   const obs = new Obs();
//   obs.on('state', s => send('obs', s));
//   //   s = { enabled, connected, rec: { active, paused, since }, live: { active, since }, scene, error }
//   //   since = Date.now() w chwili startu (pigułka liczy czas sama), error = tekst po polsku albo ''
//   obs.configure({ enabled: S().obsEnabled, auto: S().obsAuto, port: S().obsPort, password: S().obsPassword });
//   obs.toggleRecord(); obs.toggleStream();   // do skrótów Ctrl+Alt+R itd.
//   Obs.findLocal()  // { found, enabled, port, authRequired } — do ustawień („OBS na tym komputerze”)
//   obs.stop();
const fs = require('fs');
const { L } = require('./lang');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const OP = { Hello: 0, Identify: 1, Identified: 2, Event: 5, Request: 6, RequestResponse: 7 };
const SUBS = 1 | 4 | 64; // General, Scenes, Outputs
const CLOSE_AUTH = 4009, CLOSE_NOT_IDENTIFIED = 4007;

function configPath() {
  const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
}
// Odczyt ustawień serwera WebSocket zapisanych przez OBS (Tools > WebSocket Server Settings).
function readObsConfig(file = configPath()) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { found: true, enabled: !!j.server_enabled, port: Number(j.server_port) || 4455, authRequired: !!j.auth_required, password: j.auth_required ? String(j.server_password || '') : '' };
  } catch { return { found: fs.existsSync(path.dirname(path.dirname(path.dirname(file)))), enabled: false, port: 4455, authRequired: false, password: '' }; }
}
function authString(password, salt, challenge) {
  const secret = crypto.createHash('sha256').update(password + salt).digest('base64');
  return crypto.createHash('sha256').update(secret + challenge).digest('base64');
}

class Obs extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.WS = opts.WebSocket || globalThis.WebSocket;
    this.readConfig = opts.readConfig || readObsConfig;
    this.host = opts.host || '127.0.0.1';
    this.cfg = { enabled: false, auto: true, port: 4455, password: '' };
    this.ws = null; this.retry = null; this.delay = 3000; this.reqId = 0; this.pending = new Map();
    this.s = { enabled: false, connected: false, rec: { active: false, paused: false, since: 0 }, live: { active: false, since: 0 }, scene: '', error: '' };
  }
  get state() { return JSON.parse(JSON.stringify(this.s)); }
  emitState() { const j = JSON.stringify(this.s); if (j === this.lastJson) return; this.lastJson = j; this.emit('state', JSON.parse(j)); }
  warn(msg) { if (this.listenerCount('error')) this.emit('error', msg); } // bez nasłuchu 'error' nie wywraca procesu

  configure(c = {}) {
    const next = { enabled: !!c.enabled, auto: c.auto !== false, port: Number(c.port) || 4455, password: String(c.password || '') };
    const same = JSON.stringify(next) === JSON.stringify(this.cfg);
    this.cfg = next;
    if (same && (this.ws || this.retry || !next.enabled)) return;
    this.disconnect();
    this.s.enabled = next.enabled; this.s.error = '';
    if (next.enabled) { this.delay = 3000; this.connect(); } else this.reset();
    this.emitState();
  }
  target() {
    if (!this.cfg.auto) return { port: this.cfg.port, password: this.cfg.password };
    const o = this.readConfig();
    return { port: o.port || this.cfg.port, password: o.authRequired ? o.password : '', local: o };
  }
  connect() {
    clearTimeout(this.retry); this.retry = null;
    if (!this.cfg.enabled) return;
    if (!this.WS) { this.s.error = L('Ta wersja nie obsługuje WebSocket.', 'This version doesn’t support WebSocket.'); return this.emitState(); }
    const t = this.target();
    if (this.cfg.auto && t.local && t.local.found && !t.local.enabled) {
      this.s.error = L('W OBS włącz Tools > WebSocket Server Settings > Enable WebSocket server.', 'In OBS turn on Tools > WebSocket Server Settings > Enable WebSocket server.');
      this.emitState(); return this.schedule(15000);
    }
    let ws;
    try { ws = new this.WS(`ws://${this.host}:${t.port}`, 'obswebsocket.json'); }
    catch { return this.schedule(); }
    this.ws = ws; this.password = t.password; this.identified = false;
    // WebSocket z Node (undici) przy odrzuconym połączeniu wysyła tylko 'error', bez 'close' — obsłuż oba raz.
    let done = false;
    const finish = code => { if (done || this.ws !== ws) return; done = true; clearTimeout(guard); this.onClose(code); };
    const guard = setTimeout(() => { if (!this.identified) { try { ws.close(); } catch {} finish(1006); } }, 8000);
    ws.onmessage = e => this.onMessage(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8'));
    ws.onclose = e => finish(e.code);
    ws.onerror = () => { if (ws.readyState !== 1) finish(1006); };
    ws.onopen = () => clearTimeout(guard);
  }
  schedule(ms) {
    clearTimeout(this.retry);
    const wait = ms || this.delay;
    this.delay = Math.min(30000, Math.round(this.delay * 1.6));
    this.retry = setTimeout(() => { this.retry = null; this.connect(); }, wait);
  }
  onClose(code) {
    const was = this.s.connected;
    this.ws = null; this.identified = false;
    for (const p of this.pending.values()) p.reject(new Error('closed'));
    this.pending.clear();
    this.reset();
    if (code === CLOSE_AUTH) {
      this.s.error = this.cfg.auto ? L('OBS odrzucił hasło z jego ustawień. Wyłącz „Użyj ustawień z OBS” i wpisz hasło.', 'OBS rejected the password from its settings. Turn off “Use settings from OBS” and enter the password.') : L('OBS odrzucił hasło. Sprawdź je w Tools > WebSocket Server Settings.', 'OBS rejected the password. Check it in Tools > WebSocket Server Settings.');
      this.emitState(); return; // bez ponawiania, dopóki ustawienia się nie zmienią
    }
    if (!this.cfg.enabled) return this.emitState();
    this.s.error = was ? '' : this.s.error;
    if (was) this.delay = 3000;
    this.emitState();
    this.schedule();
  }
  reset() { this.s.connected = false; this.s.rec = { active: false, paused: false, since: 0 }; this.s.live = { active: false, since: 0 }; this.s.scene = ''; }
  sendOp(op, d) { try { this.ws && this.ws.send(JSON.stringify({ op, d })); } catch {} }
  request(requestType, requestData) {
    if (!this.ws || !this.identified) return Promise.reject(new Error(L('OBS nie jest połączony', 'OBS is not connected')));
    const requestId = `w${++this.reqId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(L('OBS nie odpowiada', 'OBS is not responding'))); }, 5000);
      this.pending.set(requestId, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
      this.sendOp(OP.Request, { requestType, requestId, ...(requestData ? { requestData } : {}) });
    });
  }
  onMessage(text) {
    let m; try { m = JSON.parse(text); } catch { return; }
    const d = m.d || {};
    switch (m.op) {
      case OP.Hello: {
        const id = { rpcVersion: 1, eventSubscriptions: SUBS };
        if (d.authentication) {
          if (!this.password) { this.s.error = L('OBS wymaga hasła. Wyłącz „Użyj ustawień z OBS” i wpisz hasło albo wyłącz uwierzytelnianie w OBS.', 'OBS needs a password. Turn off “Use settings from OBS” and enter the password, or turn off authentication in OBS.'); this.emitState(); }
          id.authentication = authString(this.password, d.authentication.salt, d.authentication.challenge);
        }
        this.sendOp(OP.Identify, id);
        break;
      }
      case OP.Identified:
        this.identified = true; this.delay = 3000;
        this.s.connected = true; this.s.error = '';
        this.emitState();
        this.sync();
        break;
      case OP.RequestResponse: {
        const p = this.pending.get(d.requestId); if (!p) break;
        this.pending.delete(d.requestId);
        if (d.requestStatus && d.requestStatus.result) p.resolve(d.responseData || {});
        else p.reject(new Error((d.requestStatus && d.requestStatus.comment) || L('Błąd OBS', 'OBS error')));
        break;
      }
      case OP.Event: this.onEvent(d.eventType, d.eventData || {}); break;
    }
  }
  async sync() {
    try {
      const [rec, live, scene] = await Promise.all([this.request('GetRecordStatus'), this.request('GetStreamStatus'), this.request('GetCurrentProgramScene')]);
      const now = Date.now();
      this.s.rec = { active: !!rec.outputActive, paused: !!rec.outputPaused, since: rec.outputActive ? now - (rec.outputDuration || 0) : 0 };
      this.s.live = { active: !!live.outputActive, since: live.outputActive ? now - (live.outputDuration || 0) : 0 };
      this.s.scene = scene.currentProgramSceneName || scene.sceneName || '';
      this.emitState();
    } catch {}
  }
  onEvent(type, e) {
    const now = Date.now();
    if (type === 'RecordStateChanged') {
      const st = e.outputState || '';
      if (st === 'OBS_WEBSOCKET_OUTPUT_STARTED') this.s.rec = { active: true, paused: false, since: now };
      else if (st === 'OBS_WEBSOCKET_OUTPUT_STOPPED') { this.s.rec = { active: false, paused: false, since: 0 }; if (e.outputPath) this.emit('recorded', e.outputPath); }
      else if (st === 'OBS_WEBSOCKET_OUTPUT_PAUSED') this.s.rec.paused = true;
      else if (st === 'OBS_WEBSOCKET_OUTPUT_RESUMED') this.s.rec.paused = false;
      else return;
      this.emitState();
    } else if (type === 'StreamStateChanged') {
      const st = e.outputState || '';
      if (st === 'OBS_WEBSOCKET_OUTPUT_STARTED') this.s.live = { active: true, since: now };
      else if (st === 'OBS_WEBSOCKET_OUTPUT_STOPPED') this.s.live = { active: false, since: 0 };
      else return;
      this.emitState();
    } else if (type === 'CurrentProgramSceneChanged') {
      this.s.scene = e.sceneName || ''; this.emitState();
    } else if (type === 'ExitStarted') {
      try { this.ws && this.ws.close(); } catch {}
    }
  }
  toggleRecord() { return this.request('ToggleRecord').catch(e => this.warn(e.message)); }
  toggleStream() { return this.request('ToggleStream').catch(e => this.warn(e.message)); }
  disconnect() {
    clearTimeout(this.retry); this.retry = null;
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch {} }
    for (const p of this.pending.values()) p.reject(new Error('closed'));
    this.pending.clear();
    this.identified = false; this.reset();
  }
  stop() { this.cfg.enabled = false; this.s.enabled = false; this.disconnect(); }
}
// dla ustawień: czy OBS jest zainstalowany i czy ma włączony serwer
Obs.findLocal = () => { const c = readObsConfig(); return { found: c.found, enabled: c.enabled, port: c.port, authRequired: c.authRequired }; };
Obs.authString = authString;

module.exports = { Obs, readObsConfig, authString };
