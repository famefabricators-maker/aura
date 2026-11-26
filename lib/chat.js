// Czat transmisji: Twitch przez anonimowe IRC po WebSocket (tylko odczyt, bez logowania — nic nie da się wysłać).
// Plus okno-szuflada czatu (chat/index.html) otwierane przez openChatWindow().
//
// Użycie (proces główny):
//   const { Chat, openChatWindow } = require('./lib/chat');
//   const chat = new Chat();
//   chat.on('message', m => both('chat', { kind: 'message', m }));   // m = { id, user, login, color, text, parts, badges, action, ts }
//   chat.on('remove', r => both('chat', { kind: 'remove', ...r }));   // { id } usunięta wiadomość albo { login } ban/timeout, {} = wyczyszczony czat
//   chat.on('state', s => both('chat', { kind: 'state', s }));        // { enabled, connected, channel, error }
//   chat.start({ twitch: S().chatTwitch });                            // nazwa kanału albo link twitch.tv/...; '' = stop
//   chat.recent    // ostatnie 150 wiadomości (dla świeżo otwartego okna)
//   chat.stop();
//   const win = openChatWindow({ preload, bounds: S().chatBounds, onBounds: b => applySettings({ chatBounds: b }) });
//
// Okno czatu (chat/chat.js) słucha W.on('chat', …) i W.on('settings', …), a na starcie woła W.invoke('chat-recent')
// i W.invoke('settings-get'). Klucze ustawień: chatBackground '#0B0B0C', chatOpacity 92, chatTextColor '#F5F5F7', chatTextSize 14.
const path = require('path');
const { L } = require('./lang');
const { EventEmitter } = require('events');

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const KEEP = 150;
// domyślne kolory Twitcha dla osób, które nie wybrały własnego
const DEFAULT_COLORS = ['#FF0000', '#0000FF', '#008000', '#B22222', '#FF7F50', '#9ACD32', '#FF4500', '#2E8B57', '#DAA520', '#D2691E', '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F'];

// „twitch.tv/Nazwa”, „https://www.twitch.tv/nazwa/videos”, „#nazwa”, „Nazwa” -> „nazwa”
function parseChannel(input) {
  let s = String(input || '').trim();
  const m = s.match(/twitch\.tv\/(?:popout\/)?([A-Za-z0-9_]{2,25})/i);
  if (m) s = m[1];
  s = s.replace(/^[#@]/, '');
  return /^[A-Za-z0-9_]{2,25}$/.test(s) ? s.toLowerCase() : '';
}
function unescapeTag(v) { return String(v).replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'); }
// IRCv3: @tagi :prefix KOMENDA parametry :treść
function parseIrc(line) {
  let i = 0; const out = { tags: {}, prefix: '', command: '', params: [] };
  if (line[0] === '@') {
    const sp = line.indexOf(' ');
    for (const kv of line.slice(1, sp).split(';')) { const eq = kv.indexOf('='); out.tags[eq < 0 ? kv : kv.slice(0, eq)] = eq < 0 ? '' : unescapeTag(kv.slice(eq + 1)); }
    i = sp + 1;
  }
  if (line[i] === ':') { const sp = line.indexOf(' ', i); out.prefix = line.slice(i + 1, sp); i = sp + 1; }
  const rest = line.slice(i);
  const ti = rest.indexOf(' :');
  const head = ti >= 0 ? rest.slice(0, ti) : rest;
  const parts = head.split(' ').filter(Boolean);
  out.command = parts.shift() || '';
  out.params = parts;
  if (ti >= 0) out.params.push(rest.slice(ti + 2));
  return out;
}
function colorFor(login) { let h = 0; for (const c of login) h = (h * 31 + c.charCodeAt(0)) >>> 0; return DEFAULT_COLORS[h % DEFAULT_COLORS.length]; }
// tag emotes: „25:0-4,12-16/1902:6-10” — pozycje liczone w znakach Unicode (nie w jednostkach UTF-16)
function splitEmotes(text, emotesTag) {
  const chars = Array.from(text);
  const marks = [];
  if (emotesTag) for (const group of emotesTag.split('/')) {
    const [id, ranges] = group.split(':'); if (!id || !ranges) continue;
    for (const r of ranges.split(',')) { const [a, b] = r.split('-').map(Number); if (b >= a) marks.push({ a, b, id }); }
  }
  marks.sort((x, y) => x.a - y.a);
  const parts = []; let pos = 0;
  for (const mk of marks) {
    if (mk.a < pos) continue;
    if (mk.a > pos) parts.push({ type: 'text', text: chars.slice(pos, mk.a).join('') });
    const name = chars.slice(mk.a, mk.b + 1).join('');
    parts.push({ type: 'emote', name, url: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(mk.id)}/default/dark/2.0` });
    pos = mk.b + 1;
  }
  if (pos < chars.length) parts.push({ type: 'text', text: chars.slice(pos).join('') });
  return parts;
}

class Chat extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.WS = opts.WebSocket || globalThis.WebSocket;
    this.url = opts.url || IRC_URL;
    this.channel = ''; this.ws = null; this.retry = null; this.delay = 2000; this.pingTimer = null; this.lastData = 0;
    this.recent = [];
    this.s = { enabled: false, connected: false, channel: '', error: '' };
  }
  get state() { return { ...this.s }; }
  emitState() { const j = JSON.stringify(this.s); if (j === this.lastJson) return; this.lastJson = j; this.emit('state', { ...this.s }); }

  start(opts = {}) {
    const raw = typeof opts === 'string' ? opts : opts.twitch;
    const ch = parseChannel(raw);
    if (ch && ch === this.channel && (this.ws || this.retry)) return;
    this.stop(true);
    this.channel = ch;
    this.s = { enabled: !!ch, connected: false, channel: ch, error: raw && !ch ? L('To nie wygląda na kanał Twitch. Wpisz nazwę albo link twitch.tv/…', 'That doesn’t look like a Twitch channel. Enter a name or a twitch.tv/… link') : '' };
    if (ch) { this.recent = []; this.delay = 2000; this.connect(); }
    this.emitState();
  }
  connect() {
    clearTimeout(this.retry); this.retry = null;
    if (!this.channel) return;
    if (!this.WS) { this.s.error = L('Ta wersja nie obsługuje WebSocket.', 'This version doesn’t support WebSocket.'); return this.emitState(); }
    let ws; try { ws = new this.WS(this.url); } catch { return this.schedule(); }
    this.ws = ws; this.lastData = Date.now();
    let done = false;
    // WebSocket z Node (undici) przy odrzuconym połączeniu wysyła tylko 'error', bez 'close'
    const finish = () => { if (done || this.ws !== ws) return; done = true; this.onClose(); };
    ws.onopen = () => {
      const nick = 'justinfan' + (10000 + Math.floor(Math.random() * 80000));
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send(`NICK ${nick}`);
      ws.send(`JOIN #${this.channel}`);
    };
    ws.onmessage = e => { this.lastData = Date.now(); const text = typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8'); for (const line of text.split('\r\n')) if (line) this.onLine(line); };
    ws.onclose = finish;
    ws.onerror = () => { if (ws.readyState !== 1) finish(); };
    // Twitch wysyła PING co ~5 min; jeśli przez 6 min nic nie przyjdzie, łączymy od nowa
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.ws !== ws) return;
      if (Date.now() - this.lastData > 6 * 60e3) { try { ws.close(); } catch {} finish(); }
      else if (ws.readyState === 1) { try { ws.send('PING :wyspa'); } catch {} }
    }, 4 * 60e3);
  }
  schedule() {
    clearTimeout(this.retry);
    const wait = this.delay; this.delay = Math.min(60000, Math.round(this.delay * 1.7));
    this.retry = setTimeout(() => { this.retry = null; this.connect(); }, wait);
  }
  onClose() {
    this.ws = null;
    clearInterval(this.pingTimer); this.pingTimer = null;
    if (!this.channel) return;
    this.s.connected = false; this.emitState();
    this.schedule();
  }
  onLine(line) {
    const m = parseIrc(line);
    switch (m.command) {
      case 'PING': try { this.ws && this.ws.send(`PONG :${m.params[0] || 'tmi.twitch.tv'}`); } catch {} break;
      case 'ROOMSTATE': case '366':
        if (!this.s.connected) { this.s.connected = true; this.s.error = ''; this.delay = 2000; this.emitState(); }
        break;
      case 'NOTICE': {
        const id = m.tags['msg-id'] || '';
        if (/msg_channel_suspended|msg_banned|invalid/i.test(id) || /does not exist|suspended/i.test(m.params[1] || '')) {
          this.s.error = L('Twitch: ten kanał nie istnieje albo jest zawieszony.', 'Twitch: this channel doesn’t exist or is suspended.'); this.s.connected = false; this.emitState();
        }
        break;
      }
      case 'RECONNECT': try { this.ws && this.ws.close(); } catch {} break;
      case 'PRIVMSG': {
        let text = m.params[1] || '';
        let action = false;
        const am = text.match(/^\u0001ACTION (.*)\u0001$/); if (am) { text = am[1]; action = true; }
        const login = (m.prefix.split('!')[0] || '').toLowerCase();
        const badges = (m.tags.badges || '').split(',').filter(Boolean).map(b => b.split('/')[0]);
        const msg = {
          id: m.tags.id || `${login}-${Date.now()}`, login, user: m.tags['display-name'] || login,
          color: m.tags.color || colorFor(login), text, parts: splitEmotes(text, m.tags.emotes), badges,
          mod: m.tags.mod === '1' || badges.includes('broadcaster'), action, ts: Number(m.tags['tmi-sent-ts']) || Date.now(),
          highlight: m.tags['msg-id'] === 'highlighted-message',
        };
        this.recent.push(msg); if (this.recent.length > KEEP) this.recent.splice(0, this.recent.length - KEEP);
        this.emit('message', msg);
        break;
      }
      case 'CLEARMSG': { const id = m.tags['target-msg-id']; if (id) { this.recent = this.recent.filter(x => x.id !== id); this.emit('remove', { id }); } break; }
      case 'CLEARCHAT': {
        const login = (m.params[1] || '').toLowerCase();
        if (login) { this.recent = this.recent.filter(x => x.login !== login); this.emit('remove', { login }); }
        else { this.recent = []; this.emit('remove', {}); }
        break;
      }
    }
  }
  stop(silent) {
    clearTimeout(this.retry); this.retry = null;
    clearInterval(this.pingTimer); this.pingTimer = null;
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; try { ws.close(); } catch {} }
    this.channel = '';
    if (!silent) { this.s = { enabled: false, connected: false, channel: '', error: '' }; this.emitState(); }
  }
}

// Szuflada czatu: osobne okno bez ramki, zawsze na wierzchu, przeciągane za nagłówek, z zapamiętaną pozycją.
function openChatWindow({ preload, bounds, onBounds, parent } = {}) {
  const { BrowserWindow, screen } = require('electron');
  const wa = screen.getPrimaryDisplay().workArea;
  const b = bounds && bounds.width ? bounds : { width: 340, height: 520, x: wa.x + wa.width - 360, y: wa.y + Math.round((wa.height - 520) / 2) };
  const win = new BrowserWindow({
    ...b, minWidth: 260, minHeight: 220, frame: false, transparent: true, resizable: true, skipTaskbar: true, alwaysOnTop: true,
    fullscreenable: false, maximizable: false, minimizable: false, hasShadow: false, show: false, backgroundColor: '#00000000', title: L('Czat transmisji', 'Stream chat'),
    parent, webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, '..', 'chat', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  let t = null;
  const save = () => { clearTimeout(t); t = setTimeout(() => { if (!win.isDestroyed() && onBounds) onBounds(win.getBounds()); }, 400); };
  win.on('moved', save); win.on('resized', save);
  return win;
}

module.exports = { Chat, openChatWindow, parseChannel, parseIrc, splitEmotes };
