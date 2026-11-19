/* Wyspa Deck — logika strony na telefonie: parowanie, gładzik z gestami, przyciski, klawiatura. */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const base = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
const token = (base.match(/\/d\/([^/]+)\//) || [])[1] || 'x';
const STORE = 'wyspaDeck:' + token;
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
let creds = null; try { creds = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch {}
let ws = null, opened = false, fails = 0, retry = null;

// ---------- parowanie ----------
function guessName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone'; if (/iPad/.test(ua)) return 'iPad';
  const m = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/); if (m && !/^K$/.test(m[1])) return m[1].trim();
  return /Android/.test(ua) ? 'Telefon z Androidem' : 'Telefon';
}
$('#devName').value = guessName();
let pairId = null, pairTimer = null;
$('#pairBtn').onclick = async () => {
  $('#pairMsg').textContent = '';
  try {
    const r = await fetch(base + 'pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#devName').value.trim() }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Nie udało się.');
    pairId = j.id; $('#pairCode').textContent = j.code; $('#pair').classList.add('waiting');
    poll();
  } catch (e) { $('#pairMsg').textContent = e.message || 'Brak połączenia z komputerem. Czy jesteś w tej samej sieci Wi-Fi?'; }
};
$('#pairCancel').onclick = () => { clearTimeout(pairTimer); pairId = null; $('#pair').classList.remove('waiting'); };
async function poll() {
  if (!pairId) return;
  try {
    const j = await (await fetch(base + 'pair/' + pairId, { cache: 'no-store' })).json();
    if (j.status === 'approved') { creds = { id: j.id, key: j.key }; localStorage.setItem(STORE, JSON.stringify(creds)); buzz(20); showMain(); return; }
    if (j.status === 'denied') { $('#pair').classList.remove('waiting'); $('#pairMsg').textContent = 'Komputer odrzucił połączenie.'; return; }
    if (j.status === 'expired') { $('#pair').classList.remove('waiting'); $('#pairMsg').textContent = 'Prośba wygasła. Spróbuj jeszcze raz.'; return; }
  } catch {}
  pairTimer = setTimeout(poll, 1200);
}
function showPair(msg) {
  try { ws && ws.close(); } catch {} ws = null;
  creds = null; localStorage.removeItem(STORE);
  $('#main').classList.remove('on'); $('#pair').classList.add('on'); $('#pair').classList.remove('waiting');
  $('#pairMsg').textContent = msg || '';
}
function showMain() { $('#pair').classList.remove('on'); $('#main').classList.add('on'); connect(); }

// ---------- połączenie ----------
function connect() {
  clearTimeout(retry);
  if (!creds) return showPair();
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${base}ws?dev=${encodeURIComponent(creds.id)}&key=${encodeURIComponent(creds.key)}`;
  ws = new WebSocket(url); opened = false;
  ws.onopen = () => { opened = true; fails = 0; setConn(true); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = e => {
    setConn(false);
    if (e.code === 4001) return showPair('Ten telefon został usunięty na komputerze. Połącz go ponownie.');
    if (e.code === 4000) { $('#conn').textContent = 'otwarte na innej karcie'; return; }
    if (!opened && ++fails >= 3) return showPair('Komputer nie rozpoznaje już tego telefonu. Połącz go ponownie.');
    retry = setTimeout(connect, Math.min(8000, 800 * (fails + 1)));
  };
}
function setConn(on) { $('#dot').classList.toggle('on', on); $('#conn').textContent = on ? 'połączono' : 'łączę…'; }
const send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
document.addEventListener('visibilitychange', () => { if (!document.hidden && creds && (!ws || ws.readyState > 1)) connect(); });

function onMsg(m) {
  if (m.t === 'hello') {
    $('#pcName').textContent = m.name || 'Komputer';
    const box = $('#apps'); box.innerHTML = '';
    (m.apps || []).forEach((a, i) => {
      if (!a) return;
      const b = document.createElement('button'); b.className = 'app';
      if (a.icon && /^data:image\//.test(a.icon)) { const img = document.createElement('img'); img.src = a.icon; img.alt = ''; b.append(img); }
      const s = document.createElement('span'); s.textContent = a.name || 'Aplikacja'; b.append(s);
      b.onclick = () => { buzz(12); send({ t: 'launch', i }); };
      box.append(b);
    });
    $('#appsEmpty').classList.toggle('hide', box.children.length > 0);
  } else if (m.t === 'media' && m.m) {
    $('#nowTitle').textContent = m.m.title || '—'; $('#nowArtist').textContent = m.m.artist || '';
  }
}

// ---------- zakładki i przyciski ----------
$$('#tabs button').forEach(b => b.onclick = () => {
  $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === b.dataset.tab));
});
$$('[data-k]').forEach(b => b.onclick = () => { buzz(10); send({ t: 'k', k: b.dataset.k }); });
$$('[data-x]').forEach(b => b.onclick = () => { buzz(10); send({ t: 'x', k: b.dataset.x }); });
$('#sendText').onclick = () => { const t = $('#text').value; if (!t) return; send({ t: 'text', s: t }); $('#text').value = ''; buzz(12); };

// przyciski myszy: przytrzymanie = przeciąganie
$$('.mbtn').forEach(b => {
  b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); buzz(8); send({ t: 'd', b: b.dataset.btn }); };
  const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); send({ t: 'u', b: b.dataset.btn }); };
  b.onpointerup = up; b.onpointercancel = up;
});

// ---------- gładzik ----------
const pad = $('#pad'), sensEl = $('#sens');
let sens = Number(localStorage.getItem('wyspaDeck:sens')) || 1.4; sensEl.value = sens;
sensEl.oninput = () => { sens = Number(sensEl.value); localStorage.setItem('wyspaDeck:sens', sens); };
const pts = new Map();
let g = null;           // bieżący gest: { start, maxPts, moved, lastT }
let lastTapEnd = 0, dragArmed = false, dragging = false;
let accX = 0, accY = 0, accS = 0, accH = 0, raf = 0;
function flush() {
  raf = 0;
  const x = Math.trunc(accX), y = Math.trunc(accY); accX -= x; accY -= y;
  if (x || y) send({ t: 'm', x, y });
  const s = Math.trunc(accS), h = Math.trunc(accH); accS -= s; accH -= h;
  if (s || h) send({ t: 's', y: s, x: h });
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(flush); };
pad.addEventListener('pointerdown', e => {
  e.preventDefault(); pad.setPointerCapture(e.pointerId); pad.classList.add('used');
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
  const now = e.timeStamp;
  if (pts.size === 1) { g = { start: now, maxPts: 1, moved: 0 }; dragArmed = now - lastTapEnd < 260; }
  else if (g) g.maxPts = Math.max(g.maxPts, pts.size);
});
pad.addEventListener('pointermove', e => {
  const p = pts.get(e.pointerId); if (!p || !g) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y, dt = Math.max(1, e.timeStamp - p.t);
  p.x = e.clientX; p.y = e.clientY; p.t = e.timeStamp;
  g.moved += Math.abs(dx) + Math.abs(dy);
  if (pts.size === 1) {
    if (dragArmed && !dragging && g.moved > 4) { dragging = true; pad.classList.add('drag'); send({ t: 'd', b: 'l' }); buzz(15); }
    const speed = Math.hypot(dx, dy) / dt;               // px/ms
    const gain = sens * 2 * (1 + Math.min(2.5, speed) * 0.85); // przyspieszenie jak w gładzikach
    accX += dx * gain; accY += dy * gain;
  } else if (pts.size === 2) {
    // dwa palce: przewijanie (treść jedzie za palcami); każdy palec daje połowę ruchu
    accS += dy * 2.2; accH += -dx * 2.2;
  }
  schedule();
});
function endPointer(e) {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  if (pts.size > 0 || !g) return;
  const dur = e.timeStamp - g.start;
  if (dragging) { dragging = false; pad.classList.remove('drag'); send({ t: 'u', b: 'l' }); }
  else if (g.maxPts >= 2 && dur < 300 && g.moved < 24) { send({ t: 'c', b: 'r' }); buzz(10); }
  else if (g.maxPts === 1 && dur < 220 && g.moved < 10) { send({ t: 'c', b: 'l' }); buzz(8); lastTapEnd = e.timeStamp; }
  dragArmed = false; g = null;
}
pad.addEventListener('pointerup', endPointer);
pad.addEventListener('pointercancel', endPointer);

// start
if (creds) showMain(); else showPair();
