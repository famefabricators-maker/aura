/* Wyspa — rdzeń: geometria, sprężyna, warstwy, szkło, HUD, banery, pigułka. */
// Podgląd w ustawieniach (island/index.html?preview): ta sama wyspa, ale nie rusza prawdziwej — nie zgłasza obszaru
// klikania ani przytrzymania, nie zapisuje stanu; działa tylko sterowanie muzyką i głośnością. Szkło bez obrazu ekranu.
const PREVIEW = new URLSearchParams(location.search).has('preview');
const PREVIEW_SEND = new Set(['media-app', 'media', 'seek', 'volume', 'mute', 'controls-refresh', 'stats-on', 'weather-refresh', 'ai-usage-refresh']);
const W = PREVIEW ? { ...window.wyspa, send: (ch, ...a) => { if (PREVIEW_SEND.has(ch)) window.wyspa.send(ch, ...a); } } : window.wyspa;
const T = window.WYSPA_THEME, I = window.ICONS;
if (PREVIEW) document.documentElement.classList.add('preview');
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const isl = $('#isl');

const TAB_H = { music: 162, web: 214, deck: 206, notices: 238, agents: 268, shelf: 178, clips: 210, widgets: 262, reminders: 268, controls: 244, launcher: 168, call: 176, airdrop: 176 };
// widżety: własny układ (Ustawienia albo prawy przycisk na widżecie); karta rośnie o kolejne rzędy
const WIDGETS_DEFAULT = ['today', 'focus', 'weather', 'stats'];
const widgetList = () => (Array.isArray(st.S.widgets) && st.S.widgets.length ? st.S.widgets : WIDGETS_DEFAULT);
const tabH = tab => { if (tab === 'music' && lyricsPanel()) return 196; if (tab !== 'widgets') return TAB_H[tab]; const rows = Math.max(1, Math.ceil(widgetList().length / 2)); return 46 + rows * 104 + (rows - 1) * 8; };
// tekst piosenki na żywo: karta muzyki poszerza się o kolumnę tekstu (gdy teksty włączone i utwór ma tekst z czasami)
// kolumna tekstu także w trakcie szukania tekstu nowego utworu i przez 2,5 s przerwy między utworami
// (bez tego karta zwężała się i rozszerzała przy każdej zmianie utworu)
const lyricsPanel = () => {
  const on = !!(st.S.lyrics && st.media && st.media.has && ((st.lyricLines && st.lyricLines.length) || st.lyricsLoading));
  if (on) { st.lyricsPanelAt = Date.now(); return true; }
  const left = 2500 - (Date.now() - (st.lyricsPanelAt || 0));
  if (st.S.lyrics && left > 0) { clearTimeout(st.lyricsHoldT); st.lyricsHoldT = setTimeout(update, left + 30); return true; }
  return false;
};
const cardW = () => (st.tab === 'music' && lyricsPanel() ? 722 : 420);
const TABS = [
  { id: 'music', icon: 'music', name: 'Muzyka' }, { id: 'web', icon: 'globe', name: 'Web', key: 'tabWeb' },
  { id: 'notices', icon: 'bell', name: 'Powiadomienia', key: 'tabNotices' },
  { id: 'agents', icon: 'agent', name: 'Agenci AI', key: 'tabAgents' }, { id: 'shelf', icon: 'shelf', name: 'Półka', key: 'tabShelf' },
  { id: 'clips', icon: 'clip', name: 'Schowek', key: 'tabClips' }, { id: 'widgets', icon: 'widgets', name: 'Widżety', key: 'tabWidgets' },
  { id: 'controls', icon: 'controls', name: 'Sterowanie', key: 'tabControls' }, { id: 'launcher', icon: 'launcher', name: 'Launcher', key: 'tabLauncher' },
  { id: 'deck', icon: 'phone', name: 'Telefon (PC Deck)', key: 'tabDeck' },
  { id: 'call', icon: 'call', name: 'Rozmowa', key: 'tabCall' },
  { id: 'airdrop', icon: 'airdrop', name: 'AirDrop', key: 'tabAirdrop', mac: true }, // tylko macOS
];

const st = {
  S: {}, screen: { w: 1920, h: 1080, winX: 0, winY: 0 }, open: false, tab: 'music', mode: 'pill',
  media: null, thumb: null, vol: null, mic: null, inuse: { mic: [], cam: [] }, keys: null,
  hud: null, banner: null, alert: null, notices: [], agents: [], unread: false,
  focus: { mode: 'focus', total: 0, left: 0, end: 0, running: false },
  rec: { on: false, start: 0 }, callStart: 0, accent: '#c0a4f8', winAccent: null,
};
window.ST = st;

// ---------- wygląd ----------
function applyTheme() {
  const S = st.S, surf = T.surface(S.surface);
  st.light = surf.light;
  st.accent = T.accentHex(S.accent, st.winAccent, surf.light);
  const vars = T.cssVars(S.surface, st.accent);
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  const font = T.FONTS.find(f => f.id === S.font) || T.FONTS[0];
  document.documentElement.style.setProperty('--font', font.css);
  document.body.classList.toggle('light', surf.light);
  const reduce = S.reduceMotion === 'on' || (S.reduceMotion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.body.classList.toggle('reduce', reduce);
  st.reduce = reduce;
  buildTabs();
  ensureCapture();
  kick();
}

// ---------- geometria ----------
const rnd = () => (st.S.roundness ?? 100) / 100;
function obsLive() { return !!(st.obs && st.obs.connected && (st.obs.rec?.active || st.obs.live?.active)); }
function hasLive() { return playing() || st.focus.running || st.rec.on || callActive() || agentWorking() || obsLive() || !!st.download; }
function playing() { return !!(st.media && st.media.has && st.media.playing); }
// Rozmowa = mikrofon otwarty przez aplikację do rozmów (nie np. Voicemod, który trzyma mikrofon cały czas).
// Czas liczymy od chwili, gdy Windows zanotował otwarcie mikrofonu przez tę aplikację (since).
const CALL_APPS = /discord|teams|zoom|slack|whatsapp|telegram|signal|skype|teamspeak|ts3client|mumble|webex|element|messenger|guilded|chrome|msedge|opera|firefox|brave|vivaldi|arc/i;
const NOT_CALL = /voicemod|nvidia|broadcast|obs64|obs32|electron|aura|wyspa|krisp|soundpad|steam|audacity|voicemeeter/i;
const useName = a => (a && typeof a === 'object') ? a.app : String(a || '');
// st.capture = procesy, które W TEJ CHWILI nagrywają z mikrofonu (sesje audio Windows), a nie stare wpisy z rejestru
function callApps() { return (st.capture || []).filter(n => CALL_APPS.test(n) && !NOT_CALL.test(n)); }
function callActive() { return !!st.S.callTimer && callApps().length > 0; }
function callSince() { // najwcześniejszy start mikrofonu wśród aplikacji do rozmów (liczony w Aurze, także przy wyłączonym minutniku)
  const t = callApps().map(a => (st.captureSince || {})[a]).filter(x => x > 0);
  return t.length ? Math.min(...t) : (st.callStart || Date.now());
}
function agentWorking() { return st.agents.some(a => a.state === 'working' || a.state === 'needs'); }

// ---------- macOS z fabrycznym notchem: Aura otacza wycięcie ----------
const isMac = () => st.screen.platform === 'darwin';
const hasNotch = () => isMac() && st.screen.notch && st.screen.notch.has;
function notchTarget(mode) {
  const { w: nw, h: nh } = st.screen.notch, s = st.S.size / 100, o = st.S.openSize / 100;
  switch (mode) {
    case 'card': return { w: Math.max(cardW() * o, nw + 140), h: tabH(st.tab) * o + nh, r: 24 * o, ear: 8, z: o };
    case 'alert': return { w: Math.max(384 * s, nw + 100), h: nh + 104 * s, r: 22 * s, ear: 8, z: s };
    case 'banner': return { w: Math.max(384 * s, nw + 100), h: nh + 64 * s, r: 20 * s, ear: 8, z: s };
    case 'hud': return { w: nw + 2 * 92 * s, h: nh, r: 12, ear: 6, z: s };   // ikona po lewej, pasek po prawej
    default: return { w: hasLive() ? nw + 2 * 78 * s : nw, h: nh, r: 12, ear: 6, z: s }; // w spoczynku = sam notch (niewidoczna)
  }
}

function targetFor(mode) {
  if (hasNotch()) return notchTarget(mode);
  const s = st.S.size / 100, o = st.S.openSize / 100, r = rnd();
  switch (mode) {
    case 'card': return { w: cardW() * o, h: tabH(st.tab) * o, r: 27 * o * r, ear: 16 * o * r, z: o };
    case 'alert': return { w: 384 * s, h: 108 * s, r: 28 * s * r, ear: 15 * s * r, z: s };
    case 'banner': return { w: 384 * s, h: 68 * s, r: 26 * s * r, ear: 15 * s * r, z: s };
    case 'hud': return { w: 236 * s, h: 36 * s, r: 18 * s * r, ear: 14 * s * r, z: s };
    case 'hidden': return { w: 150 * s, h: 0, r: 0, ear: 0, z: s };
    case 'strip': return { w: 350 * s, h: 26 * s, r: 13 * s * r, ear: 10 * s * r, z: s };
    case 'slim': return { w: 150 * s, h: 5, r: 2.5, ear: 0, z: s };
    default: {
      let w = 184;
      if (showTitle() || showLyric()) w = 300;
      else if ((playing() || agentWorking()) && (st.focus.running || st.rec.on || callActive() || obsLive() || st.download)) w = obsLive() ? 270 : 236;
      else if (!playing() && st.download) w = 260;
      else if (!playing() && (st.focus.running || st.rec.on || callActive() || agentWorking() || obsLive())) w = obsLive() ? 250 : 200;
      if (st.S.idleShows !== 'none' && !hasLive()) w = Math.max(w, st.S.idleShows === 'pet' ? 184 : 200);
      return { w: w * s, h: 36 * s, r: 18 * s * r, ear: 14 * s * r, z: s };
    }
  }
}
function currentMode() {
  if (st.alert) return 'alert';
  if (st.open) return 'card';
  return closedMode();
}
function closedMode() {
  if (st.alert) return 'alert';
  if (st.banner) return 'banner';
  if (st.hud) return 'hud';
  if (hasNotch()) return 'pill';                        // na Macu pigułka = notch (+ skrzydełka)
  if (st.game) return 'strip';
  // nowy utwór: wyspa wysuwa się z tytułem na 10 s także nad oknem, które zasłania górę (np. przeglądarką)
  if (showTitle() && (st.S.pillTitle || 'change') === 'change') return 'pill';
  if (st.S.slimCovered && st.covered) return 'slim';   // okno zasłania górę: cienka linia
  // schowana w spoczynku — chyba że wybrano, co ma być wtedy widać (zwierzak, godzina, pogoda…): to wygrywa
  if (st.S.hiddenUntilHover && !hasLive() && (st.S.idleShows || 'none') === 'none') return 'hidden';
  return 'pill';
}
// tytuł utworu w zamkniętej wyspie: przez 10 s po zmianie utworu (domyślnie), zawsze albo nigdy
function showTitle() {
  if (!playing()) return false;
  const m = st.S.pillTitle || 'change';
  return m === 'always' || (m === 'change' && Date.now() < (st.titleUntil || 0));
}
// tekst piosenki w zamkniętej wyspie: po 10 s z tytułem, gdy utwór ma tekst z czasami
function showLyric() { return st.S.lyrics && st.S.pillLyrics !== false && playing() && !!st.lyricLine && !showTitle(); }
function anchorX(w) {
  if (hasNotch()) return (innerWidth - w) / 2;
  const pos = st.S.position, M = 34;
  if (pos === 'left') return M;
  if (pos === 'right') return innerWidth - M - w;
  return (innerWidth - w) / 2;
}
// wyspa przy dolnej krawędzi ekranu (nie na Macu z notchem — tam zawsze otacza wycięcie)
const atBottom = () => !hasNotch() && st.S.edge === 'bottom';
// wyspa na dole z paskiem zadań Aury: przy dolnej krawędzi, a gdy pasek się wysuwa — podjeżdża nad niego (płynnie)
let liftX = 0;
const liftTarget = () => (atBottom() && st.screen && st.screen.dockBelow && st.screen.dockShown ? (st.screen.dockLift || 0) : 0);
const boxY = (h, lift = liftX) => atBottom() ? innerHeight - topY() - h - lift : topY();
// pływająca pigułka (zaokrąglona ze wszystkich stron): z wyboru albo gdy wyspa stoi na dole nad paskiem zadań Aury
const isIslandShape = () => !hasNotch() && (st.S.shape === 'island' || (atBottom() && !!(st.screen && st.screen.dockBelow) && liftX > 2));
const topY = () => (!hasNotch() && st.S.shape === 'island') ? (st.S.topGap ?? 8) : 0;

// ---------- sprężyna ----------
const spring = { w: { x: 184, v: 0 }, h: { x: 36, v: 0 }, r: { x: 18, v: 0 }, ear: { x: 14, v: 0 } };
let target = { w: 184, h: 36, r: 18, ear: 14, z: 1 };
function stepSpring(dt) {
  const speed = { calm: 0.55, normal: 1, fast: 2.25 }[st.S.animationSpeed] || 1;
  const K = 310 * speed;
  let moving = false;
  for (const k of ['w', 'h', 'r', 'ear']) {
    const s = spring[k], t = target[k];
    const shrinking = t < s.x;
    let zeta = k === 'w' ? (shrinking ? 0.56 : 0.8) : k === 'h' ? (shrinking ? 0.86 : 0.76) : 0.9;
    if (st.reduce) zeta = 1.05;
    const C = 2 * zeta * Math.sqrt(K);
    const a = -K * (s.x - t) - C * s.v;
    s.v += a * dt; s.x += s.v * dt;
    if (Math.abs(s.x - t) > 0.05 || Math.abs(s.v) > 0.5) moving = true; else { s.x = t; s.v = 0; }
  }
  return moving;
}

// ---------- pętla rysowania ----------
let raf = 0, lastT = 0, animating = false, t0 = performance.now();
let lyrHold = false; // zwężanie karty po wyłączeniu tekstu utworu (patrz update)
function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
function frame(now) {
  raf = 0;
  const dt = Math.min(0.034, (now - lastT) / 1000); lastT = now;
  let moving = false;
  for (let i = 0; i < 2; i++) moving = stepSpring(dt / 2) || moving;
  const lt = liftTarget();
  if (Math.abs(lt - liftX) > 0.4) { liftX += (lt - liftX) * Math.min(1, dt * 13); moving = true; } else if (liftX !== lt) { liftX = lt; sendRects(); }
  if (animating !== moving) { animating = moving; tuneCapture(); } // koniec animacji: mniej klatek szkła
  if (lyrHold && Math.abs(spring.w.x - target.w) < 1.5) { lyrHold = false; update(); } // zwężanie skończone: zwykły układ
  layoutBox();
  if (placeDevDots(anchorX(spring.w.x), boxY(Math.max(0, spring.h.x)), spring.w.x, Math.max(0, spring.h.x), dt)) moving = true;
  drawGL(now);
  const surf = T.surface(st.S.surface);
  const fx = surf.fx && st.mode === 'card';
  // szkło na żywo: rysujemy, gdy przyjdzie nowa klatka ekranu (uploadFrame woła kick) albo wyspa się rusza —
  // a nie przy każdym odświeżeniu monitora (144 razy na sekundę przy obrazie zmieniającym się 2–30 razy)
  if (moving || fx) kick();
}
function layoutBox() {
  const w = spring.w.x, h = Math.max(0, spring.h.x), r = spring.r.x;
  const x = anchorX(w), y = boxY(h);
  isl.style.left = x + 'px'; isl.style.top = y + 'px';
  isl.style.width = w + 'px'; isl.style.height = h + 'px';
  isl.style.borderRadius = isIslandShape() ? `${Math.min(r, h / 2, w / 2)}px` : atBottom() ? `${Math.min(r, h, w / 2)}px ${Math.min(r, h, w / 2)}px 0 0` : `0 0 ${Math.min(r, h, w / 2)}px ${Math.min(r, h, w / 2)}px`;
}
// otwarta karta z tłem okładki: kształt wyspy (też „uszy” przy krawędzi ekranu i pas przy notchu, których nie zakrywa
// tło karty) przybiera przyciemniony kolor albumu — bez tego wystawały w kolorze motywu
function albumBase(base, openness) {
  const m = typeof albumColor === 'string' && /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(albumColor);
  if (!m || openness <= 0 || !$('#card').classList.contains('album')) return base;
  const k = Math.min(1, openness * 1.4), a = [m[1], m[2], m[3]].map(v => (v / 255) * 0.42);
  return base.map((v, i) => v + (a[i] - v) * k);
}
function drawGL(now) {
  if (!WyspaGL.ok) return;
  const surf = T.surface(st.S.surface);
  const w = spring.w.x, h = Math.max(0, spring.h.x);
  const openness = Math.max(0, Math.min(1, (h - 36) / 140));
  WyspaGL.draw({
    b2: devCapsule(),
    x: anchorX(w), y: atBottom() ? topY() + liftX : topY(), w, h, r: spring.r.x, ear: isIslandShape() ? 0 : spring.ear.x, island: isIslandShape(), flip: atBottom(), soft: isMac(),
    base: albumBase(T.hexToRgb(surf.base), openness), glass: !!surf.glass, blur: (st.S.glassBlur ?? 50) / 100,
    tint: surf.glass ? 0.72 - openness * 0.2 : 0, ...regionUniforms(),
    accent: T.hexToRgb(st.accent), time: (now - t0) / 1000, open: openness, fx: surf.fx || 0, light: surf.light,
  });
}

// ---------- wycinek ekranu pod oknem + kursor do zamalowania ----------
function captureRegion() {
  const M = 48, sw = st.screen.w, sh = st.screen.h;
  const x0 = Math.max(0, st.screen.winX - M), y0 = Math.max(0, st.screen.winY - M);
  const x1 = Math.min(sw, st.screen.winX + innerWidth + M), y1 = Math.min(sh, st.screen.winY + innerHeight + M);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), sw };
}
function regionUniforms() {
  const r = captureRegion();
  return { screen: { w: r.w, h: r.h }, win: { x: st.screen.winX - r.x, y: st.screen.winY - r.y } };
}
st.cursors = [];
// ślad z ostatnich 260 ms + ZAWSZE ostatnia pozycja: stojący kursor też jest w obrazie ekranu (wcześniej po 260 ms
// bez ruchu jego rozmyty „duch” wracał pod szkło, a przy ruchu znikał — wyglądało to jak miganie kursora)
function recentCursors() { const now = performance.now(), last = st.cursors[st.cursors.length - 1]; st.cursors = st.cursors.filter(c => c === last || now - c.t < 260); return st.cursors; }
W.on('cursor', c => { if (!c) st.cursors = []; else { st.cursors.push({ x: c.x, y: c.y, t: performance.now() }); if (st.cursors.length > 12) st.cursors.shift(); } });

// ---------- tryby i warstwy ----------
let lastRects = '';
function update() {
  try { vizKick(); if (typeof progKick === 'function') progKick(); } catch {}
  const mode = currentMode();
  st.mode = mode;
  tuneCapture(); // liczba klatek szkła zależna od stanu wyspy
  target = targetFor(mode);
  $$('.layer').forEach(l => l.classList.remove('on'));
  const layer = { pill: '#pill', hud: '#hud', banner: '#banner', alert: '#banner', card: '#card', strip: '#strip', hidden: null, slim: null }[mode];
  if (layer) $(layer).classList.add('on');
  // zoom treści
  const z = target.z;
  for (const id of ['#pill', '#hud', '#banner', '#strip']) { const el = $(id); el.style.zoom = z; el.style.width = (target.w / z) + 'px'; el.style.height = (target.h / z) + 'px'; }
  const card = $('#card'); const oz = st.S.openSize / 100; card.style.zoom = oz;
  // wyłączony tekst utworu: kształt wyspy zwęża się płynnie, a zawartość przeskakiwała od razu do wąskiego układu
  // (po bokach prześwitywało tło kształtu). Teraz szeroki układ zostaje do końca zwężania, tekst znika, a karta
  // przyklejona do lewej — przycina się tylko prawa strona z tekstem.
  const lp = lyricsPanel(), musicCard = mode === 'card' && st.tab === 'music';
  if (lp || !musicCard) lyrHold = false;
  else if ($('#music').classList.contains('with-lyrics') && !$('#music').classList.contains('lyr-out')) lyrHold = true;
  card.style.setProperty('--card-w', (lyrHold ? 722 : cardW()) + 'px');
  $('#music').classList.toggle('with-lyrics', lp || lyrHold); $('#music').classList.toggle('lyr-out', lyrHold); card.classList.toggle('lyr-hold', lyrHold);
  const nh = hasNotch() ? st.screen.notch.h : 0;
  card.style.height = (tabH(st.tab) + nh / oz) + 'px';
  // notch: przerwa na wycięcie w pigułce/HUD i miejsce pod nim w karcie i banerze
  document.body.classList.toggle('notch', hasNotch());
  if (hasNotch()) {
    const s = st.S.size / 100;
    document.body.style.setProperty('--gap', (st.screen.notch.w / s) + 'px');
    document.body.style.setProperty('--nh-s', (nh / s) + 'px');
    document.body.style.setProperty('--nh-o', (nh / oz) + 'px');
    $('#pill').classList.toggle('idle', !hasLive());
  }
  renderPill();
  sendRects();
  kick();
}
function sendRects() {
  const c = mode2rect(closedMode());
  if (c.h < 4) c.h = 4;
  const o = st.alert ? c : mode2rect('card');
  const key = JSON.stringify([c, o]);
  if (key !== lastRects) { lastRects = key; W.send('rects', { c, o }); }
}
function mode2rect(mode) { const t = targetFor(mode); return { x: Math.round(anchorX(t.w)), y: Math.round(boxY(t.h, liftTarget())), w: Math.round(t.w), h: Math.round(t.h) }; }

// ---------- pigułka ----------
const fmt = sec => { sec = Math.max(0, Math.floor(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
window.fmt = fmt;
// Za długi tytuł/wykonawca: po chwili tekst przejeżdża do końca i wraca (całość do przeczytania w 10 s pokazu)
function buildPillTitle(text, key) {
  const run = document.createElement('span'); run.className = 'pt-run';
  run.textContent = st.media.title || '';
  if (st.media.artist) { const sm = document.createElement('small'); sm.textContent = st.media.artist; run.append(sm); }
  text.append(run); text.dataset.key = key;
  requestAnimationFrame(() => {
    const over = run.scrollWidth - text.clientWidth;
    if (over <= 2) return;
    const travel = Math.min(3.6, Math.max(1.4, over / 45)); // s na przejazd w jedną stronę
    text.style.setProperty('--pt-d', -(over + 14) + 'px');
    text.style.setProperty('--pt-t', (travel * 2 + 2.4).toFixed(2) + 's');
    text.classList.add('run');
  });
}
function renderPill() {
  const art = $('#pArt'), icon = $('#pIcon'), text = $('#pText'), time = $('#pTime');
  const play = playing();
  // tytuł po zmianie utworu budujemy raz (nie przy każdym odświeżeniu), żeby przewijanie się nie restartowało
  const tKey = showTitle() ? (st.media.title || '') + '\u0001' + (st.media.artist || '') : '';
  const keepTitle = tKey && text.dataset.key === tKey && text.querySelector('.pt-run');
  art.removeAttribute('src'); icon.innerHTML = ''; if (!keepTitle) { text.textContent = ''; text.dataset.key = ''; text.classList.remove('run'); } text.classList.remove('lyric'); time.textContent = ''; time.className = 'mono';
  if (play) { if (st.thumb) art.src = st.thumb; else icon.innerHTML = I.svg('music'); }
  else if (agentWorking()) icon.innerHTML = I.svg('agent');
  if (showTitle()) { if (!keepTitle) buildPillTitle(text, tKey); }
  else if (showLyric()) { text.textContent = st.lyricLine; text.classList.add('lyric'); }
  if (obsLive()) {
    const o = st.obs, live = o.live?.active, since = live ? o.live.since : o.rec.since;
    time.textContent = `${live ? 'LIVE' : o.rec.paused ? 'PAUZA' : 'REC'} ${fmt((Date.now() - since) / 1000)}`; time.classList.add('rec');
    if (!play && o.scene) text.textContent = o.scene;
  }
  else if (st.rec.on) { time.textContent = fmt((Date.now() - st.rec.start) / 1000); time.classList.add('rec'); }
  else if (st.download) { // pobieranie z przeglądarki: rozmiar na żywo, a bez muzyki też nazwa pliku
    const mb = st.download.size / 1048576; time.textContent = '↓ ' + (st.download.pct != null ? st.download.pct + '%' : mb >= 1000 ? (mb / 1024).toFixed(1) + ' GB' : mb >= 10 ? Math.round(mb) + ' MB' : mb.toFixed(1) + ' MB'); // gra z launchera: procent
    if (!play) { icon.innerHTML = I.svg('drop'); text.textContent = st.download.count > 1 ? `${st.download.count} pobierania` : st.download.name; }
  }
  else if (st.focus.running || (st.focus.total && st.focus.left > 0)) time.textContent = fmt(st.focus.left);
  else if (callActive()) { time.textContent = fmt((Date.now() - callSince()) / 1000); time.classList.add('call'); }
  else if (agentWorking() && !play) { const a = st.agents.find(x => x.state === 'needs') || st.agents[0]; text.textContent = a.state === 'needs' ? 'Czeka na Ciebie' : 'Pracuje…'; }
  if (!hasLive() && st.S.idleShows !== 'none') {
    const d = new Date();
    if (st.S.idleShows === 'clock') text.textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: st.S.timeFormat === '12' });
    if (st.S.idleShows === 'date') text.textContent = d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
    if (st.S.idleShows === 'weather' && st.weather && !st.weather.error) text.textContent = `${st.weather.temp}° ${st.weather.text}`;
    if (st.S.idleShows === 'event') { const e = (st.calendar || []).find(x => x.end > Date.now()); text.textContent = e ? `${e.start > Date.now() ? new Date(e.start).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : 'teraz'} ${e.title}` : 'Brak wydarzeń'; }
  }
  $('#pet').classList.toggle('on', !hasLive() && st.S.idleShows === 'pet');
  $('#viz').classList.toggle('on', play);
  const dot = $('#pDot');
  const ignore = st.S.privacyIgnore || [];
  const mic = st.inuse.mic.filter(a => !ignore.includes(useName(a))).length, cam = st.inuse.cam.filter(a => !ignore.includes(useName(a))).length;
  dot.className = 'pdot' + (st.S.privacyDot ? (cam ? ' cam' : mic ? ' mic' : '') : '');
}
setInterval(() => { if (st.mode === 'pill') renderPill(); }, 1000);

// ---------- wizualizator ----------
let analyser = null, freq = null;
const viz = $('#viz'), vctx = viz.getContext('2d');
// Pętla chodzi tylko, gdy słupki widać (pigułka + coś gra), najwyżej 30 kl./s — wcześniej kręciła się bez przerwy
// z częstotliwością monitora (144 Hz = 144 razy na sekundę) także przy schowanej wyspie.
let vizRaf = 0;
const vizWanted = () => st.mode === 'pill' && playing() && !document.hidden;
// kolor słupków: kolor okładki grającego utworu (za ciemny — rozjaśniony, żeby był widoczny na wyspie); bez okładki — akcent
let vizCol = { src: '', out: '' };
function vizColor() {
  const src = typeof albumColor === 'string' && albumColor ? albumColor : '';
  if (!src) return st.accent;
  if (vizCol.src !== src) {
    const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(src); let c = m ? [+m[1], +m[2], +m[3]] : null;
    if (c) { const l = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255, k = l < 0.55 ? (0.55 - l) / (1 - l) : 0; c = c.map(v => Math.round(v + (255 - v) * k)); }
    vizCol = { src, out: c ? `rgb(${c.join(',')})` : st.accent };
  }
  return vizCol.out;
}
function vizKick() { if (!vizRaf && vizWanted()) vizRaf = requestAnimationFrame(vizLoop); }
function vizLoop() {
  vizRaf = -1; setTimeout(() => { vizRaf = 0; vizKick(); }, 30); // ~30 kl./s niezależnie od odświeżania monitora
  if (!vizWanted()) return;
  const W2 = viz.width, H2 = viz.height;
  vctx.clearRect(0, 0, W2, H2);
  const cols = 5, levels = [];
  if (analyser) {
    analyser.getByteFrequencyData(freq);
    const bands = [2, 5, 10, 18, 30];
    for (let i = 0; i < cols; i++) { let s = 0; for (let j = bands[i]; j < bands[i] + 4; j++) s += freq[j]; levels.push(Math.min(1, (s / 4 / 255) * 1.25)); }
  } else { const t = performance.now() / 1000; for (let i = 0; i < cols; i++) levels.push(0.35 + 0.3 * Math.sin(t * (3 + i) + i * 1.7) + 0.2 * Math.sin(t * 7.3 + i)); }
  vctx.fillStyle = vizColor();
  if (st.S.visualizer === 'bars') {
    const bw = 5, gap = 3.5;
    levels.slice(0, 4).forEach((l, i) => { const h = Math.max(4, l * H2); const x = i * (bw + gap) + 4; vctx.beginPath(); vctx.roundRect(x, (H2 - h) / 2, bw, h, 2.5); vctx.fill(); });
  } else {
    const px = 4, gap = 1.6, rows = 6;
    levels.forEach((l, i) => { const n = Math.max(1, Math.round(l * rows)); for (let r = 0; r < n; r++) vctx.fillRect(i * (px + gap) + 3, H2 - 2 - (r + 1) * (px + gap) + gap, px, px); });
  }
}
vizKick();

// ---------- przechwytywanie ekranu: szkło + dźwięk ----------
let capStream = null, capVideo = null, capWanted = '', capApplied = '';
// szerokość obrazu ekranu: 1280 px wystarcza do rozmycia; przy prawie przezroczystym szkle 1920 (bez mydła)
// mocne rozmycie nie potrzebuje ostrego obrazu: mniejszy obraz = mniej pamięci i pracy (domyślne 50% → 960 px)
const capWidth = () => { const b = st.S.glassBlur ?? 50; return Math.min((st.screen && st.screen.w) || 1920, b < 12 ? 1920 : b < 35 ? 1280 : 960); };
// klatki: otwarta wyspa / animacja 30, zwinięta 15, cienka linia pod oknem albo schowana 2
const capFps = () => (st.open || animating) ? 30 : ((st.covered && !st.open) || st.mode === 'hidden' || st.mode === 'slim') ? 2 : 15;
function capConstraints() { return { width: { max: capWidth() }, frameRate: { ideal: capFps(), max: 30 } }; }
// dopasowanie w locie (bez nowego strumienia), tylko gdy coś się zmieniło
// więcej klatek od razu (otwieranie wyspy bez przycięć), mniej — dopiero po 1,5 s spokoju (okno przesuwane nad wyspą
// przełączało stan zasłonięcia kilka razy na sekundę, a każda zmiana przestawia przechwytywanie)
let capTuneT = 0;
function tuneCapture() {
  const vt = capStream && capStream.getVideoTracks()[0]; if (!vt || vt.readyState !== 'live') return;
  const key = capWidth() + 'x' + capFps(); if (key === capApplied) return;
  const apply = () => { const k = capWidth() + 'x' + capFps(); if (k === capApplied) return; capApplied = k; vt.applyConstraints(capConstraints()).catch(() => { capApplied = ''; }); };
  const cur = Number(String(capApplied).split('x')[1]) || 0;
  clearTimeout(capTuneT);
  if (capFps() > cur) apply(); else capTuneT = setTimeout(apply, 1500);
}
function glassLive() { return capVideo && T.surface(st.S.surface).glass; }
// podgląd: „ekran” = okienko podglądu (wyspa na jego środku, przy wybranej krawędzi), bez paska zadań i notcha w tle
function previewScreen(s) {
  return { ...(s || {}), w: innerWidth, h: innerHeight, x: 0, y: 0, winX: 0, winY: 0, dockBelow: false, dockShown: false, dockLift: 0,
    notch: s && s.notch && s.notch.has ? s.notch : { has: false, w: 0, h: 0 } };
}
if (PREVIEW) addEventListener('resize', () => { if (st.screen) { st.screen = previewScreen(st.screen); update(); } });
async function ensureCapture() {
  if (PREVIEW) return; // podgląd nie pobiera obrazu ekranu (szkło przydymione)
  // „Widać wyspę na zrzutach”: szkło bez obrazu pulpitu (przydymione) — wyspa nie jest ukryta przed przechwytywaniem,
  // więc obraz na żywo pokazywałby samą wyspę (odbicie w odbiciu)
  const glass = !!T.surface(st.S.surface).glass && !st.S.glassInShots;
  // macOS: bez przechwytywania ekranu w ogóle — nagrywanie ekranu na Macu zapala wskaźnik nagrywania, pyta o zgodę
  // i mocno obciąża procesor; szkło rysujemy tam bez obrazu pulpitu (przydymiona tafla), a dźwięku systemu Electron i tak nie daje
  // Wyjątek: opcja „Prawdziwe szkło na Macu” — świadomie włączona, z lekkim przechwytywaniem (niżej)
  if (isMac() && !(glass && st.S.macRealGlass)) {
    if (capStream) { capStream.getTracks().forEach(t => t.stop()); capStream = null; capWanted = ''; }
    if (capVideo) { capVideo.remove(); capVideo = null; WyspaGL.setVideo(null); }
    return;
  }
  const want = glass ? 'glass' : 'audio';
  if (capWanted === want && capStream) return;
  capWanted = want;
  try {
    if (!capStream) {
      // obraz pomniejszony i najwyżej 30 kl/s (a mniej, gdy wyspa zwinięta) — pełne 4K 60 razy na sekundę zjadało
      // ok. 1,5 rdzenia przy przeciąganiu okien i ekran przestawał być płynny; rozmycie i tak nie potrzebuje ostrości
      capStream = await navigator.mediaDevices.getDisplayMedia({ video: capConstraints(), audio: !isMac() });
      capApplied = '';
      const at = capStream.getAudioTracks()[0];
      if (at) {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(new MediaStream([at]));
        analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.72;
        freq = new Uint8Array(analyser.frequencyBinCount);
        src.connect(analyser);
      }
    }
    const vt = capStream.getVideoTracks()[0];
    if (glass && vt && vt.readyState === 'live') {
      if (!capVideo) {
        capVideo = document.createElement('video');
        capVideo.muted = true; capVideo.playsInline = true;
        capVideo.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
        document.body.append(capVideo);
        capVideo.srcObject = new MediaStream([vt]);
        await capVideo.play();
        WyspaGL.setVideo(capVideo);
        let last = 0;
        const onFrame = () => {
          if (!capVideo) return;
          const now = performance.now();
          // każda klatka ekranu: przewijane obrazy pod szkłem płyną razem z tłem (wcześniej zwinięta wyspa
          // odświeżała się co 260 ms i kolory pod nią przeskakiwały); rzadko tylko jako cienka linia pod oknem
          const busy = !(st.covered && !st.open);
          if (busy || now - last > 260) { last = now; WyspaGL.uploadFrame(captureRegion(), recentCursors()); kick(); }
          capVideo.requestVideoFrameCallback(onFrame);
        };
        capVideo.requestVideoFrameCallback(onFrame);
      }
    } else if (!glass) {
      if (capVideo) { capVideo.remove(); capVideo = null; WyspaGL.setVideo(null); }
      if (vt) { vt.stop(); capStream.removeTrack(vt); }
    }
  } catch (e) { console.warn('capture', e); }
  kick();
}
// po wyłączeniu szkła i ponownym włączeniu potrzebny jest nowy strumień wideo
function resetCaptureIfNeeded() { const vt = capStream && capStream.getVideoTracks()[0]; if (T.surface(st.S.surface).glass && !st.S.glassInShots && !vt) { capStream.getTracks().forEach(t => t.stop()); capStream = null; capVideo = null; capWanted = ''; } }

// ---------- bateria urządzeń: kapsułka obok wyspy ----------
// Kapsułkę rysuje ten sam shader co wyspę (szkło, kolory motywu, cień), a na niej leżą pierścienie jak w widżecie
// baterii iPhone'a: pełny okrąg od góry zgodnie z ruchem wskazówek, ikona w środku, procent obok.
// Biały; poniżej 20% czerwony; ładowanie — zielony z błyskawicą.
let devList = [], ddW = 0;
const dd = { a: 0, w: 0, h: 36, c: 0, x: 0, y: 0, place: 'side' };                     // obecność, szerokość, wysokość kapsułki, widoczność treści
const DD_GAP = 8, DD_H = 36;
const DD_ICON = { mouse: 'mouse', headset: 'headphones', keyboard: 'keyboard', bt: 'bt' };
const DD_R = 10.5, DD_C = 2 * Math.PI * DD_R;
function renderDevDots(list) {
  devList = Array.isArray(list) ? list.slice(0, 3) : [];
  const box = $('#devDots'); box.textContent = '';
  for (const d of devList) {
    const lvl = Math.max(0, Math.min(100, Number(d.level) || 0));
    const dot = document.createElement('div');
    dot.className = 'dd' + (lvl < 20 && !d.charging ? ' low' : '') + (d.charging ? ' charging' : '');
    dot.title = `${d.name}: ${lvl}%`;
    dot.innerHTML = `<div class="dd-ring"><svg viewBox="0 0 26 26"><circle class="bg" cx="13" cy="13" r="${DD_R}"/><circle class="fg" cx="13" cy="13" r="${DD_R}" stroke-dasharray="${(DD_C * lvl / 100).toFixed(2)} ${DD_C.toFixed(2)}"/></svg><span class="ico">${I.svg(DD_ICON[d.kind] || 'battery')}</span>${d.charging ? '<i class="bolt"></i>' : ''}</div><b class="mono">${lvl}%</b>`;
    box.append(dot);
  }
  ddW = 0; update(); kick();
}
W.on('devbat', renderDevDots);
// Gdzie i jak: 'side' — obok wyspy (zamkniętej i otwartej: najechanie na zwiniętą wyspę pokazuje pełną kapsułkę),
// 'below' — szeroka karta (np. z tekstem utworu) nie zostawia miejsca z boku: kapsułka pod kartą (od strony ekranu),
// slim — wyspa zwinięta w kreskę (okno zasłania krawędź): kapsułka też jako kreska.
// Pozycję i rozmiar liczymy w układzie kształtu (odległość od krawędzi ekranu), a potem płynnie do nich dochodzimy.
function devDotsTarget(x, w, h) {
  if (!devList.length || st.S.devBattery === false || st.mode === 'hidden') return null;
  const slim = st.mode === 'slim' || h <= 20;
  if (slim && h <= 1) return null;
  const fy = atBottom() ? innerHeight - (boxY(h) + h) : boxY(h);        // górna krawędź wyspy liczona od krawędzi ekranu
  const fw = slim ? Math.max(24, devList.length * 24) : (ddW || 140), fh = slim ? Math.max(2, Math.min(h, 6)) : DD_H;
  if (x + w + DD_GAP + fw <= innerWidth - 4) return { slim, place: 'side', x: x + w + DD_GAP, y: fy + (Math.min(h, 40) - fh) / 2, w: fw, h: fh };
  if (!slim && fy + h + DD_GAP + fh < innerHeight - 4) return { slim, place: 'below', x: x + w / 2 - fw / 2, y: fy + h + DD_GAP, w: fw, h: fh };
  return null;
}
// wywoływane co klatkę: krok animacji i pozycja treści (zwraca true, dopóki się rusza)
function placeDevDots(x, y, w, h, dt) {
  const box = $('#devDots'), t = devDotsTarget(x, w, h);
  if (t && !ddW) ddW = box.offsetWidth;
  if (t && dd.a < 0.02) { dd.x = t.x; dd.y = t.y; dd.place = t.place; }   // pojawia się: od razu na miejscu, bez przelotu
  if (t) dd.place = t.place;
  const k = Math.min(1, (dt || 0.016) * 11);
  let moving = false;
  const go = (key, v, eps) => { if (Math.abs(v - dd[key]) > eps) { dd[key] += (v - dd[key]) * k; moving = true; } else dd[key] = v; };
  go('a', t ? 1 : 0, 0.002); go('c', t && !t.slim ? 1 : 0, 0.01);
  if (t) { go('x', t.x, 0.3); go('y', t.y, 0.3); go('w', t.w, 0.3); go('h', t.h, 0.2); }
  const vis = dd.a > 0.01 && dd.c > 0.01;
  box.style.visibility = vis ? 'visible' : 'hidden';
  box.style.left = (dd.x + (dd.w - ddW) / 2 * (dd.place === 'below' ? 1 : 0)) + 'px';
  box.style.top = (atBottom() ? innerHeight - dd.y - DD_H : dd.y) + 'px';
  box.style.opacity = (Math.max(0, (dd.a - 0.45) / 0.55) * Math.max(0, (dd.c - 0.4) / 0.6)).toFixed(3);
  return moving;
}
// kształt kapsułki dla shadera (układ kształtu: krawędź ekranu zawsze „u góry”); rośnie od strony wyspy
function devCapsule() {
  if (dd.a <= 0.01 || dd.w < 1) return null;
  const e = 1 - Math.pow(1 - dd.a, 3);
  const ch = dd.h * (0.55 + 0.45 * e), cw = Math.max(ch, dd.w * e);
  const cx = dd.place === 'below' ? dd.x + (dd.w - cw) / 2 : dd.x - DD_GAP * (1 - e);
  return [cx, dd.y + (dd.h - ch) / 2, cw, ch];
}

// ---------- HUD ----------
let hudTimer = null;
function showHud(h) {
  if (st.open || st.alert) return;
  st.hud = h;
  const icon = $('#hIcon'), bar = $('#hBar'), fill = $('#hFill'), text = $('#hText'), dot = $('#hDot');
  bar.classList.remove('on'); text.textContent = ''; dot.className = 'hdot'; dot.style.background = '';
  const setBar = (lvl, ico) => { icon.innerHTML = I.svg(ico); bar.classList.add('on'); fill.style.transform = `scaleX(${Math.max(0, Math.min(1, lvl))})`; };
  switch (h.kind) {
    case 'volume': setBar(h.mute ? 0 : h.level, h.mute || h.level === 0 ? 'volMute' : 'vol'); break;
    case 'bright': setBar(h.level, 'sun'); break;
    case 'keys': {
      const prev = st.keys || { caps: !h.caps, num: h.num };
      const isCaps = prev.caps !== h.caps || prev.num === h.num;
      const on = isCaps ? h.caps : h.num;
      icon.innerHTML = I.svg(isCaps ? 'caps' : 'num');
      text.textContent = `${isCaps ? 'Caps Lock' : 'Num Lock'} ${on ? 'włączony' : 'wyłączony'}`;
      dot.className = 'hdot ' + (on ? 'on' : 'off');
      st.keys = { caps: h.caps, num: h.num };
      break;
    }
    case 'mic': icon.innerHTML = I.svg(h.mute ? 'micOff' : 'mic'); text.textContent = h.mute ? 'Mikrofon wyciszony' : 'Mikrofon włączony'; dot.className = 'hdot ' + (h.mute ? 'off' : 'on'); break;
    case 'device': icon.innerHTML = I.svg('headphones'); text.textContent = h.text; break;
    case 'devbat': icon.innerHTML = I.svg('plug'); text.textContent = `${String(h.name).replace(/^SteelSeries /, '')}: ładowanie · ${h.level}%`; dot.className = 'hdot on'; break;
    case 'battery': icon.innerHTML = I.svg(h.plugged ? 'plug' : 'battery'); text.textContent = h.plugged ? 'Ładowanie' : 'Na baterii'; if (navigator.getBattery) navigator.getBattery().then(b => { text.textContent += ` · ${Math.round(b.level * 100)}%`; }); break;
    case 'color': icon.innerHTML = I.svg('color'); text.textContent = `${h.hex} skopiowany`; dot.className = 'hdot swatch'; dot.style.background = h.hex; break;
  }
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => { st.hud = null; update(); }, 1400);
  update();
}

// ---------- baner i alert ----------
const NOTICE_ICON = { device: 'battery', script: 'script', agent: 'agent', phone: 'phone', capture: 'shot', reminder: 'bell', tool: 'color', download: 'drop', app: 'bell', web: 'globe' };
let bannerTimer = null;
function showBanner(n) {
  if (st.alert) return;
  st.banner = n;
  fillBanner(NOTICE_ICON[n.kind] || 'bell', n.title, n.body, []);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { st.banner = null; update(); }, (st.S.noticeSeconds || 5) * 1000 * (st.S.longerNotices ? 2 : 1));
  if (!st.open) st.unread = true;
  buildTabs();
  update();
}
function fillBanner(icon, title, body, actions) {
  $('#bTile').innerHTML = I.svg(icon);
  $('#bTitle').textContent = title || '';
  $('#bBody').textContent = body || '';
  const act = $('#bAct'); act.textContent = '';
  for (const a of actions) { const b = document.createElement('button'); b.textContent = a.label; if (a.accent) b.className = 'acc'; b.onclick = a.fn; act.append(b); }
  $('#banner').classList.toggle('tall', actions.length > 0);
}
let chimeTimer = null;
function showAlert(a) {
  st.alert = a; st.banner = null; st.hud = null;
  fillBanner(a.icon || 'bell', a.title, a.body, a.actions);
  chime();
  clearInterval(chimeTimer);
  if (a.repeat && st.S.reminderSound === 'repeat') { let n = 0; chimeTimer = setInterval(() => { if (++n > 4 || !st.alert) return clearInterval(chimeTimer); chime(); }, 15000); }
  update();
}
function closeAlert() { st.alert = null; clearInterval(chimeTimer); update(); }
function chime() {
  if (st.S.reminderSound === 'off') return;
  try {
    const ctx = new AudioContext();
    [0, 0.22, 0.44].forEach((at, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = [784, 988, 1175][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.5);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.55);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}
window.showAlert = showAlert; window.closeAlert = closeAlert;

// ---------- karty ----------
function enabledTabs() { return TABS.filter(t => (!t.key || st.S[t.key] !== false) && (!t.mac || isMac())); }
function buildTabs() {
  const nav = $('#tabs'); nav.textContent = '';
  for (const t of enabledTabs()) {
    const b = document.createElement('button');
    b.innerHTML = I.svg(t.icon); b.title = t.name; b.dataset.tab = t.id;
    if (t.id === st.tab || (st.tab === 'reminders' && t.id === 'widgets')) b.classList.add('on');
    if (t.id === 'notices' && st.unread) b.classList.add('badge');
    b.onclick = () => setTab(t.id);
    nav.append(b);
  }
}
let saveTab = null;
function setTab(id) {
  if (!TAB_H[id]) return;
  st.tab = id;
  if (id === 'notices') st.unread = false;
  $$('section').forEach(s => s.classList.toggle('on', s.dataset.tab === id));
  buildTabs();
  document.dispatchEvent(new CustomEvent('tab', { detail: id }));
  if (id !== 'reminders') { clearTimeout(saveTab); saveTab = setTimeout(() => W.invoke('settings-set', { lastPanel: id }), 800); }
  update();
}
window.setTab = setTab;
$('#gear').innerHTML = I.svg('gear');
$('#gear').onclick = () => W.send('open-settings');

// Ctrl+Shift+1…6: otwórz wyspę na konkretnej karcie (kolejność jak na pasku kart)
// prośba agenta o zgodę: Zezwól / Odmów / W terminalu (bez odpowiedzi po ~28 s wraca do terminala)
let askId = null;
W.on('agent-ask', a => { askId = a.id; const ans = d => () => { W.send('agent-answer', { id: a.id, decision: d }); askId = null; closeAlert(); };
  showAlert({ icon: 'agent', title: a.title, body: a.body, actions: [{ label: 'Odmów', fn: ans('deny') }, { label: 'Zawsze', fn: ans('always') }, { label: 'Zezwól', accent: true, fn: ans('allow') }] }); });
W.on('agent-ask-done', id => { if (id === askId) { askId = null; closeAlert(); } });
W.on('download', d => { st.download = d || null; update(); });
W.on('goto-tab', n => { const t = enabledTabs()[Number(n) - 1]; if (t) { st.open = true; setTab(t.id); update(); } });
function onOpen(on) {
  if (on && !st.open) {
    let tab = st.S.lastPanel || 'music';
    if (st.banner) tab = 'notices';
    else if (st.S.openOn === 'music') tab = playing() || st.media?.has ? 'music' : 'widgets';
    if (!enabledTabs().some(t => t.id === tab) && tab !== 'reminders') tab = 'music';
    st.banner = null; st.hud = null;
    st.open = true; setTab(tab);
  } else if (!on && st.open) { st.open = false; document.dispatchEvent(new CustomEvent('closed')); update(); }
}
W.on('open', on => { if (!PREVIEW) onOpen(on); });
W.on('preview-open', on => { if (PREVIEW) onOpen(!!on); }); // przełącznik „W spoczynku / Otwarta” w ustawieniach

// kółko myszy: na pigułce głośność, na karcie przewijanie kart
let swipeAcc = 0, swipeAt = 0;
isl.addEventListener('wheel', e => {
  const dir = (e.deltaY > 0 ? -1 : 1) * (st.S.reverseScroll ? -1 : 1);
  // przesunięcie w bok (gładzik albo Shift + kółko) na pigułce: następny / poprzedni utwór
  const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
  if ((st.mode === 'pill' || st.mode === 'hud') && st.media?.has && Math.abs(dx) > Math.abs(e.shiftKey ? 0 : e.deltaY)) {
    e.preventDefault();
    const now = Date.now(); if (now - swipeAt < 700) return;
    swipeAcc += dx;
    if (Math.abs(swipeAcc) >= 90) { W.send('media', swipeAcc > 0 ? 'next' : 'prev'); swipeAcc = 0; swipeAt = now; }
    clearTimeout(isl._swT); isl._swT = setTimeout(() => { swipeAcc = 0; }, 250);
    return;
  }
  if (st.mode === 'pill' || st.mode === 'hud') {
    if (!st.vol) return;
    const v = Math.max(0, Math.min(1, st.vol.level + dir * 0.02));
    W.send('volume', v); e.preventDefault();
  } else if (st.mode === 'card' && e.target.closest('header')) {
    const ids = enabledTabs().map(t => t.id); const i = ids.indexOf(st.tab);
    setTab(ids[(i - dir + ids.length) % ids.length]);
  }
}, { passive: false });

// ---------- zdarzenia z procesu głównego ----------
W.on('settings', s => { const prevSurf = st.S.surface, prevReal = st.S.macRealGlass, prevShots = st.S.glassInShots; st.S = s; if (prevSurf !== s.surface || prevShots !== s.glassInShots) resetCaptureIfNeeded(); if (prevReal !== s.macRealGlass || prevShots !== s.glassInShots) ensureCapture(); applyTheme(); update(); document.dispatchEvent(new CustomEvent('settings')); });
W.on('screen', s => { if (PREVIEW) return; st.screen = s; if (st.S && st.S.surface) update(); else kick(); });
W.on('hud', h => showHud(h));
W.on('banner', n => showBanner(n));
W.on('inuse', m => { st.inuse = { mic: m.mic || [], cam: m.cam || [] }; update(); });
W.on('capture-since', m => { st.captureSince = m || {}; });
W.on('capture', apps => { const was = callActive(); st.capture = apps || []; if (!was && callActive()) st.callStart = Date.now(); if (!callActive()) st.callStart = 0; update(); });
W.on('agents', a => { st.agents = a || []; update(); });
W.on('obs', s => { st.obs = s; update(); });
W.on('covered', on => { st.covered = !!on; update(); });
W.on('game', on => { st.game = !!on; $('#gIco').innerHTML = I.svg('game'); update(); });

// ---------- start ----------
(async () => {
  let gl = false;
  try { gl = WyspaGL.init($('#bg')); } catch (e) { console.warn(e); }
  if (!gl) document.body.classList.add('nogl');
  const d = await W.invoke('init');
  st.S = d.settings; st.screen = PREVIEW ? previewScreen(d.screen) : d.screen; st.winAccent = d.winAccent || null;
  st.media = d.sys.media; st.thumb = d.sys.thumb; st.vol = d.sys.vol; st.mic = d.sys.mic; st.inuse = d.sys.inuse || st.inuse; st.capture = d.sys.capture || []; st.captureSince = d.sys.captureSince || {};
  st.agents = d.agents || []; st.notices = d.notices || []; st.covered = !!d.sys.covered;
  if (d.sys.devbat && d.sys.devbat.length) setTimeout(() => renderDevDots(d.sys.devbat), 0);
  if (callActive()) st.callStart = Date.now();
  st.tab = d.settings.lastPanel || 'music';
  applyTheme();
  setTab(st.tab);
  st.open = false;
  // dane startowe zapamiętane: odpowiedź potrafi przyjść, zanim wczyta się panels.js — wtedy sam je odbierze
  window.__wyspaInit = d;
  window.dispatchEvent(new CustomEvent('wyspa-init', { detail: d }));
  W.invoke('obs-state').then(s => { st.obs = s; update(); });
  update();
})();
