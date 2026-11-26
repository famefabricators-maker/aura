/* Szuflada czatu transmisji. Dane: W.on('chat', {kind:'message'|'remove'|'state', …}), W.on('settings', S).
   Start: W.invoke('chat-recent') -> { messages, state }, W.invoke('settings-get') -> S.
   Bez preload (np. podgląd w przeglądarce) włącza się tryb demo z przykładowymi wiadomościami. */
const W = window.wyspa || demoBridge();
const $ = s => document.querySelector(s);
const list = $('#list'), drawer = $('#drawer'), more = $('#more');
const MAX = 200;
let channel = '', atBottom = true;

const ICON = {
  broadcaster: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>',
  moderator: '<svg viewBox="0 0 24 24"><path d="M14.5 4.5l5 5L9 20H4v-5z"/></svg>',
  vip: '<svg viewBox="0 0 24 24"><path d="M12 3l3 6 6 .5-4.6 4 1.5 6.5L12 16.5 6.1 20l1.5-6.5L3 9.5 9 9z"/></svg>',
};

// ---------- wygląd z ustawień ----------
function hexRgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return Number.isNaN(n) || h.length !== 6 ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function applySettings(S) {
  if (!S) return;
  const r = document.documentElement.style;
  const bg = hexRgb(S.chatBackground) || [11, 11, 12];
  const alpha = Math.max(0, Math.min(100, S.chatOpacity ?? 92)) / 100;
  r.setProperty('--bg', bg.join(','));
  r.setProperty('--alpha', alpha);
  r.setProperty('--fg', S.chatTextColor || '#f5f5f7');
  r.setProperty('--size', Math.max(10, Math.min(32, S.chatTextSize || 14)) + 'px');
  if (S.accentHex) r.setProperty('--accent', S.accentHex);
  drawer.classList.toggle('clear', alpha < 0.35);
}

// ---------- stan połączenia ----------
function setState(s) {
  if (!s) return;
  channel = s.channel || '';
  $('#chan').textContent = channel ? '#' + channel : L('Czat transmisji', 'Stream chat');
  const live = $('#live'), st = $('#state');
  live.className = 'live' + (s.connected ? ' on' : s.error ? ' err' : '');
  st.textContent = s.error ? s.error : !s.enabled ? L('wyłączony', 'off') : s.connected ? L('połączono · tylko odczyt', 'connected · read only') : L('łączę…', 'connecting…');
  $('#emptyText').textContent = !s.enabled
    ? L('Wpisz kanał Twitch w Ustawieniach → Streaming, a czat pojawi się tutaj.', 'Enter a Twitch channel in Settings → Streaming and the chat will show up here.')
    : s.error ? s.error : L(`Czekam na wiadomości z #${channel}`, `Waiting for messages from #${channel}`);
}

// ---------- wiadomości ----------
function render(m) {
  const row = document.createElement('div');
  row.className = 'msg' + (m.action ? ' action' : '') + (m.highlight ? ' hl' : '');
  row.dataset.id = m.id; row.dataset.login = m.login;
  for (const b of ['broadcaster', 'moderator', 'vip']) if ((m.badges || []).includes(b)) {
    const i = document.createElement('span'); i.className = 'badge'; i.innerHTML = ICON[b]; i.title = { broadcaster: L('Nadawca', 'Sender'), moderator: 'Moderator', vip: 'VIP' }[b]; row.append(i);
  }
  const name = document.createElement('span'); name.className = 'name'; name.textContent = m.user; name.style.color = readable(m.color); row.append(name);
  const txt = document.createElement('span'); txt.className = 'txt'; if (m.action) txt.style.color = readable(m.color);
  for (const p of m.parts && m.parts.length ? m.parts : [{ type: 'text', text: m.text }]) {
    if (p.type === 'emote' && /^https:\/\/static-cdn\.jtvnw\.net\//.test(p.url)) { const img = document.createElement('img'); img.className = 'emote'; img.src = p.url; img.alt = p.name; img.title = p.name; img.loading = 'lazy'; txt.append(img); }
    else txt.append(document.createTextNode(p.text || p.name || ''));
  }
  row.append(txt);
  return row;
}
// za ciemne kolory nicków rozjaśnia, żeby były czytelne na ciemnym tle
function readable(hex) {
  const c = hexRgb(hex); if (!c) return 'var(--accent)';
  const l = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  if (l >= 0.42) return hex;
  const k = (0.42 - l) / (1 - l) * 1.3, mix = v => Math.round(v + (255 - v) * Math.min(0.75, k));
  return `rgb(${mix(c[0])},${mix(c[1])},${mix(c[2])})`;
}
function add(m, quiet) {
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  const row = render(m); if (quiet) row.style.animation = 'none';
  list.append(row);
  while (list.children.length > MAX) list.firstChild.remove();
  $('#empty').classList.add('hide');
  if (nearBottom || quiet) { list.scrollTop = list.scrollHeight; more.classList.remove('on'); }
  else more.classList.add('on');
}
function remove(r) {
  const rows = r.id ? list.querySelectorAll(`[data-id="${CSS.escape(r.id)}"]`) : r.login ? list.querySelectorAll(`[data-login="${CSS.escape(r.login)}"]`) : list.children;
  for (const row of [...rows]) { row.classList.add('gone'); const t = row.querySelector('.txt'); if (t) t.textContent = L('wiadomość usunięta', 'message deleted'); }
}
list.addEventListener('scroll', () => { atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40; if (atBottom) more.classList.remove('on'); });
more.onclick = () => { list.scrollTo({ top: list.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
$('#close').onclick = () => window.close();
let pinned = true; $('#top').classList.add('on');
$('#top').onclick = () => { pinned = !pinned; $('#top').classList.toggle('on', pinned); if (W.send) W.send('chat-pin', pinned); };

// ---------- dane ----------
W.on('chat', d => {
  if (!d) return;
  if (d.kind === 'message') add(d.m);
  else if (d.kind === 'remove') remove(d);
  else if (d.kind === 'state') setState(d.s);
});
W.on('settings', applySettings);
W.invoke('settings-get').then(applySettings).catch(() => {});
W.invoke('chat-recent').then(r => { if (!r) return; setState(r.state); (r.messages || []).forEach(m => add(m, true)); }).catch(() => setState({ enabled: false }));

// ---------- tryb demo (podgląd bez Electrona) ----------
function demoBridge() {
  const handlers = {};
  const users = [['Kasia_Gra', '#FF69B4'], ['tomek', ''], ['ModRobot', '#00FF7F', ['moderator']], [L('Nadawca', 'Sender'), '#9147ff', ['broadcaster']], ['zuzia_k', '#1E90FF'], ['Bartek88', '#0000FF'], ['vip_ola', '#DAA520', ['vip']]];
  const lines = [L('hej wszystkim!', 'hi everyone!'), 'ale gra 🔥', 'GG WP', L('kiedy następny stream?', 'when’s the next stream?'), 'Kappa', L('to było mocne', 'that was intense'), L('pozdro z Nowego Targu', 'greetings from the mountains'), L('ta muzyka w tle jest super', 'this background music is great'), 'LUL', L('dzięki za stream!', 'thanks for the stream!')];
  let n = 0;
  const make = () => {
    const [user, color, badges] = users[n % users.length]; const text = lines[(n * 7) % lines.length]; n++;
    const parts = text === 'Kappa' || text === 'LUL' ? [{ type: 'emote', name: text, url: `https://static-cdn.jtvnw.net/emoticons/v2/${text === 'Kappa' ? 25 : 425618}/default/dark/2.0` }] : [{ type: 'text', text }];
    return { id: 'd' + n, login: user.toLowerCase(), user, color, text, parts, badges: badges || [], action: n % 13 === 0, highlight: n % 17 === 0, ts: Date.now() };
  };
  setTimeout(() => {
    setInterval(() => (handlers.chat || []).forEach(f => f({ kind: 'message', m: make() })), 1100);
  }, 400);
  const q = new URLSearchParams(location.search);
  return {
    on: (ch, f) => { (handlers[ch] = handlers[ch] || []).push(f); },
    send: () => {},
    invoke: async ch => ch === 'settings-get'
      ? { chatBackground: q.get('bg') || '#0B0B0C', chatOpacity: Number(q.get('op') || 92), chatTextColor: '#F5F5F7', chatTextSize: Number(q.get('size') || 14) }
      : { state: { enabled: true, connected: true, channel: 'demo_kanal' }, messages: Array.from({ length: 6 }, make) },
  };
}
