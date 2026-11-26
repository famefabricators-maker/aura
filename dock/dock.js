/* Pasek zadań Aury — widok. Stan przychodzi z lib/taskbar.js kanałem „dock”. */
const W = window.wyspa, I = window.ICONS;
const $ = s => document.querySelector(s);
const dock = $('#dock'), apps = $('#apps');
let S = { items: [], size: 1.4, magnify: true }, h12 = false;

$('#start').innerHTML = '<span class="logo"></span>';
$('#qs').innerHTML = I.svg('wifi');
$('#npIco').innerHTML = I.svg('music');
$('#fcIco').innerHTML = I.svg('focus');
$('#start').onclick = () => W.send('dock-key', 'start');
$('#qs').onclick = () => W.send('dock-key', 'quick');
$('#clock').onclick = () => W.send('dock-key', 'notif');
$('#npPlay').onclick = e => { e.stopPropagation(); W.send('media', 'toggle'); };
$('#np').onclick = () => W.send('dock-np'); // otwórz program, z którego gra muzyka

// klikalny jest tylko sam pasek — reszta okna przepuszcza mysz do okien pod spodem
dock.addEventListener('mouseenter', () => W.send('dock-hover', true));
dock.addEventListener('mouseleave', () => { W.send('dock-hover', false); unmagnify(); });

function render() {
  document.documentElement.style.setProperty('--s', S.size);
  if (S.accent) document.documentElement.style.setProperty('--accent', S.accent);
  h12 = !!S.h12;
  dock.classList.toggle('hidden', !!S.hidden);
  applyLook();
  // aplikacje: przebudowa tylko przy zmianie (żeby nie migało przy każdej aktualizacji)
  const key = JSON.stringify(S.items.map(i => [i.id, !!i.icon, i.open, i.active, i.name]));
  if (key !== apps.dataset.key) {
    apps.dataset.key = key;
    apps.textContent = '';
    for (const it of S.items) {
      const b = document.createElement('div'); b.className = 'app' + (it.active ? ' active' : ''); b.dataset.id = it.id;
      if (it.icon) { const img = document.createElement('img'); img.src = it.icon; img.alt = ''; b.append(img); }
      else { const ph = document.createElement('span'); ph.className = 'ph'; ph.textContent = (it.name || '?').trim().charAt(0).toUpperCase(); b.append(ph); }
      if (it.open) { const d = document.createElement('span'); d.className = 'dots'; for (let i = 0; i < Math.min(3, it.open); i++) d.append(document.createElement('i')); b.append(d); }
      const tip = document.createElement('span'); tip.className = 'tip'; tip.textContent = it.name || ''; b.append(tip);
      b.onclick = () => W.send('dock-click', it.id);
      b.oncontextmenu = e => { e.preventDefault(); W.send('dock-menu', it.id); };
      apps.append(b);
    }
  }
  // ikony zasobnika (Steam, Epic, Discord…)
  const tkey = JSON.stringify((S.tray || []).map(t => t.key));
  const tray = $('#tray');
  if (tkey !== tray.dataset.key) {
    tray.dataset.key = tkey; tray.textContent = '';
    for (const t of S.tray || []) {
      const b = document.createElement('button'); b.title = t.name;
      const img = document.createElement('img'); img.src = t.icon; img.alt = ''; b.append(img);
      b.onclick = () => W.send('dock-tray', t.key);
      b.oncontextmenu = e => { e.preventDefault(); W.send('dock-tray-menu', t.key); };
      tray.append(b);
    }
  }
  // grający utwór
  // między utworami odtwarzacz na chwilę zgłasza „nic nie gra”: kafelek zostaje 3 s, żeby pasek nie skakał
  const m = S.media, np = $('#np'), has = !!(m && m.has);
  if (has) render.npAt = Date.now();
  const keep = !has && Date.now() - (render.npAt || 0) < 3000;
  if (keep) { clearTimeout(render.npT); render.npT = setTimeout(render, 3050 - (Date.now() - render.npAt)); }
  np.classList.toggle('on', has || keep);
  if (has) {
    $('#npTitle').textContent = m.title || ''; $('#npArtist').textContent = m.artist || ''; np.title = `${m.title || ''} — ${m.artist || ''}`;
    const art = $('#npArt'); if (m.thumb) { if (art.getAttribute('src') !== m.thumb) art.src = m.thumb; $('#npIco').style.display = 'none'; } else { art.removeAttribute('src'); $('#npIco').style.display = ''; }
    const ico = m.playing ? 'pause' : 'play';
    if (render.npIco !== ico) { render.npIco = ico; $('#npPlay').innerHTML = I.svg(ico); }
  }
  // minutnik Skupienia
  const f = S.focus, fc = $('#fc');
  fc.classList.toggle('on', !!(f && f.running));
  if (f && f.running) { focusEnd = Date.now() + f.left * 1000; tickFocus(); }
}
let focusEnd = 0;
function tickFocus() { const s = Math.max(0, Math.round((focusEnd - Date.now()) / 1000)); $('#fcTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// zegar
function clock() {
  const d = new Date();
  $('#cTime').textContent = d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', hour12: h12 });
  $('#cDate').textContent = d.toLocaleDateString(LOC, { day: '2-digit', month: '2-digit', year: 'numeric' });
  if ($('#fc').classList.contains('on')) tickFocus();
}
setInterval(clock, 1000); clock();

// efekt docka: ikony rosną pod kursorem (gładko, wg odległości od kursora)
function magnify(x) {
  if (!S.magnify) return;
  const max = 1.55, range = 2.6;
  for (const a of apps.children) {
    const r = a.getBoundingClientRect(), c = r.left + r.width / 2, w = r.width / (parseFloat(a.dataset.sc) || 1);
    const d = Math.abs(x - c) / w;
    const sc = d >= range ? 1 : 1 + (max - 1) * Math.cos((d / range) * Math.PI / 2);
    a.dataset.sc = sc; a.classList.add('mag');
    a.style.transform = `scale(${sc.toFixed(3)})`;
    a.style.margin = `0 ${((sc - 1) * w / 2).toFixed(1)}px 9px`;
  }
}
function unmagnify() { for (const a of apps.children) { a.classList.remove('mag'); a.style.transform = ''; a.style.margin = ''; a.dataset.sc = 1; } }
apps.addEventListener('mousemove', e => magnify(e.clientX));
apps.addEventListener('mouseleave', unmagnify);

W.on('dock', st => { S = st; render(); });
// szerokość paska — żeby wiedzieć, kiedy okno na niego nachodzi
new ResizeObserver(() => W.send('dock-width', Math.round(dock.getBoundingClientRect().width))).observe(dock);
W.invoke('dock-state').then(st => { if (st) { S = st; render(); } });

// ---------- wygląd: „jak wyspa” (szkło albo kolor motywu) lub czarny ----------
// Szkło: ten sam materiał co wyspa (island/glass.js) w kształcie paska z „uszami” przy krawędzi (kształt notcha odbity do dołu).
// Obraz ekranu pobierany oszczędnie: najwyżej 960 px szerokości i 15 kl/s, a gdy pasek schowany — 1 kl/s.
const cv = document.createElement('canvas'); cv.id = 'dockGlass'; document.body.prepend(cv);
let glOk = null, gStream = null, gVideo = null, gFps = 0, gRaf = 0, gUntil = 0, gLook = '';
const gCursors = [];
function gLookNow() {
  const k = S.look || {}, surf = window.WYSPA_THEME.surface(k.surface || 'black');
  return { k, surf, glass: !!surf.glass };
}
function applyLook() {
  const { k, surf, glass } = gLookNow();
  const key = JSON.stringify([k.surface, glass, k.shots]);
  const root = document.documentElement.style;
  const light = !glass && !!surf.light;
  root.setProperty('--bg', glass ? 'transparent' : surf.base);
  root.setProperty('--fg', light ? '#111113' : '#f5f5f7');
  root.setProperty('--dim', light ? 'rgba(17,17,19,.55)' : 'rgba(245,245,247,.55)');
  root.setProperty('--row', light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.08)');
  root.setProperty('--row-hi', light ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.14)');
  document.body.classList.toggle('glass', glass);
  if (key !== gLook) {
    gLook = key;
    if (glass && !k.shots) startCap(); else stopCap();
  }
  if (glass) { if (glOk === null) { try { glOk = WyspaGL.init(cv); } catch { glOk = false; } } tuneFps(); drawSoon(450); }
}
async function startCap() {
  if (gStream) return;
  try {
    gFps = S.hidden ? 1 : 15;
    gStream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { max: 960 }, frameRate: { ideal: gFps, max: gFps } }, audio: false });
    if (!gLookNow().glass) return stopCap();
    gVideo = document.createElement('video'); gVideo.muted = true; gVideo.playsInline = true;
    gVideo.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.append(gVideo); gVideo.srcObject = gStream; await gVideo.play();
    WyspaGL.setVideo(gVideo);
    const onFrame = () => {
      if (!gVideo) return;
      if (!S.hidden) { WyspaGL.uploadFrame(gRegion(), gRecent()); gDraw(); }
      gVideo.requestVideoFrameCallback(onFrame);
    };
    gVideo.requestVideoFrameCallback(onFrame);
  } catch { gStream = null; gLook = ''; setTimeout(applyLook, 3000); } // np. zaraz po starcie Aury, zanim przechwytywanie jest gotowe — ponów
}
function stopCap() {
  if (gStream) gStream.getTracks().forEach(t => t.stop());
  gStream = null; if (gVideo) { gVideo.remove(); gVideo = null; } try { WyspaGL.setVideo(null); } catch {}
}
function tuneFps() {
  const want = S.hidden ? 1 : 15, vt = gStream && gStream.getVideoTracks()[0];
  if (vt && want !== gFps) { gFps = want; vt.applyConstraints({ width: { max: 960 }, frameRate: { ideal: want, max: want } }).catch(() => {}); }
}
// wycinek ekranu: dolny pas z paskiem (+ zapas na załamanie przy krawędzi)
function gRegion() {
  const k = S.look || {}, sw = k.sw || screen.width, sh = k.sh || screen.height, winY = k.winY != null ? k.winY : sh - innerHeight;
  const y0 = Math.max(0, winY - 48);
  return { x: 0, y: y0, w: sw, h: Math.max(1, sh - y0), sw };
}
function gRecent() { const now = performance.now(); while (gCursors.length > 1 && now - gCursors[0].t > 260) gCursors.shift(); return gCursors; }
dock.addEventListener('mousemove', e => { const k = S.look || {}; gCursors.push({ x: e.clientX, y: (k.winY || 0) + e.clientY, t: performance.now() }); if (gCursors.length > 12) gCursors.shift(); drawSoon(120); });
function gDraw() {
  if (!glOk || !document.body.classList.contains('glass')) return;
  const r = dock.getBoundingClientRect(), reg = gRegion(), k = S.look || {};
  const winY = k.winY != null ? k.winY : reg.y + 48;
  const acc = window.WYSPA_THEME.hexToRgb(S.accent || '#8ec5ff');
  // „uszy” shader rysuje przy samej krawędzi ekranu — przy chowaniu paska maleją razem z widoczną częścią,
  // inaczej zostawały w rogach schowanego paska
  const visible = Math.max(0, Math.min(r.height, innerHeight - r.top));
  if (visible < 1) { WyspaGL.draw({ x: 0, y: -999, w: 1, h: 1, r: 0, ear: 0, island: true, flip: true, base: [0, 0, 0], glass: false, blur: 0, tint: 0, screen: { w: 1, h: 1 }, win: { x: 0, y: 0 }, accent: acc, time: 0, open: 0, fx: 0, light: true }); return; }
  WyspaGL.draw({ x: r.left, y: innerHeight - r.bottom, w: r.width, h: r.height, r: 20, ear: Math.min(16, visible * 0.5), island: false, flip: true,
    base: window.WYSPA_THEME.hexToRgb(gLookNow().surf.base), glass: true, blur: k.blur != null ? k.blur : 0.5, tint: 0,
    screen: { w: reg.w, h: reg.h }, win: { x: 0, y: winY - reg.y }, accent: acc, time: performance.now() / 1000, open: 0, fx: 0, light: true });
}
// klatki tylko na czas ruchu (wysuwanie, efekt docka) — w spoczynku rysuje sam obraz ekranu, najwyżej 15 razy na sekundę
function drawSoon(ms) {
  gUntil = Math.max(gUntil, performance.now() + ms);
  if (gRaf) return;
  const loop = () => { gDraw(); gRaf = performance.now() < gUntil ? requestAnimationFrame(loop) : 0; };
  gRaf = requestAnimationFrame(loop);
}
apps.addEventListener('mousemove', () => drawSoon(200));
dock.addEventListener('transitionrun', () => drawSoon(450));
dock.addEventListener('transitionend', () => drawSoon(60));
addEventListener('resize', () => drawSoon(200));
