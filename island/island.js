/* Wyspa — rdzeń: geometria, sprężyna, warstwy, szkło, HUD, banery, pigułka. */
const W = window.wyspa, T = window.WYSPA_THEME, I = window.ICONS;
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const isl = $('#isl');

const TAB_H = { music: 162, web: 214, deck: 206, notices: 238, agents: 222, shelf: 178, clips: 210, widgets: 262, reminders: 268, controls: 244, launcher: 168, call: 176 };
const TABS = [
  { id: 'music', icon: 'music', name: 'Muzyka' }, { id: 'web', icon: 'globe', name: 'Web', key: 'tabWeb' },
  { id: 'notices', icon: 'bell', name: 'Powiadomienia', key: 'tabNotices' },
  { id: 'agents', icon: 'agent', name: 'Agenci AI', key: 'tabAgents' }, { id: 'shelf', icon: 'shelf', name: 'Półka', key: 'tabShelf' },
  { id: 'clips', icon: 'clip', name: 'Schowek', key: 'tabClips' }, { id: 'widgets', icon: 'widgets', name: 'Widżety', key: 'tabWidgets' },
  { id: 'controls', icon: 'controls', name: 'Sterowanie', key: 'tabControls' }, { id: 'launcher', icon: 'launcher', name: 'Launcher', key: 'tabLauncher' },
  { id: 'deck', icon: 'phone', name: 'Telefon (PC Deck)', key: 'tabDeck' },
  { id: 'call', icon: 'call', name: 'Rozmowa', key: 'tabCall' },
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
function hasLive() { return playing() || st.focus.running || st.rec.on || callActive() || agentWorking() || obsLive(); }
function playing() { return !!(st.media && st.media.has && st.media.playing); }
// Rozmowa = mikrofon otwarty przez aplikację do rozmów (nie np. Voicemod, który trzyma mikrofon cały czas).
// Czas liczymy od chwili, gdy Windows zanotował otwarcie mikrofonu przez tę aplikację (since).
const CALL_APPS = /discord|teams|zoom|slack|whatsapp|telegram|signal|skype|teamspeak|ts3client|mumble|webex|element|messenger|guilded|chrome|msedge|opera|firefox|brave|vivaldi|arc/i;
const NOT_CALL = /voicemod|nvidia|broadcast|obs64|obs32|electron|aura|wyspa|krisp|soundpad|steam|audacity|voicemeeter/i;
const useName = a => (a && typeof a === 'object') ? a.app : String(a || '');
// st.capture = procesy, które W TEJ CHWILI nagrywają z mikrofonu (sesje audio Windows), a nie stare wpisy z rejestru
function callApps() { return (st.capture || []).filter(n => CALL_APPS.test(n) && !NOT_CALL.test(n)); }
function callActive() { return !!st.S.callTimer && callApps().length > 0; }
function callSince() {
  return st.callStart || Date.now();
}
function agentWorking() { return st.agents.some(a => a.state === 'working' || a.state === 'needs'); }

// ---------- macOS z fabrycznym notchem: Aura otacza wycięcie ----------
const isMac = () => st.screen.platform === 'darwin';
const hasNotch = () => isMac() && st.screen.notch && st.screen.notch.has;
function notchTarget(mode) {
  const { w: nw, h: nh } = st.screen.notch, s = st.S.size / 100, o = st.S.openSize / 100;
  switch (mode) {
    case 'card': return { w: Math.max(420 * o, nw + 140), h: TAB_H[st.tab] * o + nh, r: 24 * o, ear: 8, z: o };
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
    case 'card': return { w: 420 * o, h: TAB_H[st.tab] * o, r: 27 * o * r, ear: 16 * o * r, z: o };
    case 'alert': return { w: 384 * s, h: 108 * s, r: 28 * s * r, ear: 15 * s * r, z: s };
    case 'banner': return { w: 384 * s, h: 68 * s, r: 26 * s * r, ear: 15 * s * r, z: s };
    case 'hud': return { w: 236 * s, h: 36 * s, r: 18 * s * r, ear: 14 * s * r, z: s };
    case 'hidden': return { w: 150 * s, h: 0, r: 0, ear: 0, z: s };
    case 'strip': return { w: 350 * s, h: 26 * s, r: 13 * s * r, ear: 10 * s * r, z: s };
    case 'slim': return { w: 150 * s, h: 5, r: 2.5, ear: 0, z: s };
    default: {
      let w = 184;
      if (st.S.titleInPill && playing()) w = 300;
      else if ((playing() || agentWorking()) && (st.focus.running || st.rec.on || callActive() || obsLive())) w = obsLive() ? 270 : 236;
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
  if (st.S.slimCovered && st.covered) return 'slim';   // okno zasłania górę: cienka linia
  if (st.S.hiddenUntilHover && !hasLive()) return 'hidden';
  return 'pill';
}
function anchorX(w) {
  if (hasNotch()) return (innerWidth - w) / 2;
  const pos = st.S.position, M = 34;
  if (pos === 'left') return M;
  if (pos === 'right') return innerWidth - M - w;
  return (innerWidth - w) / 2;
}
// wyspa przy dolnej krawędzi ekranu (nie na Macu z notchem — tam zawsze otacza wycięcie)
const atBottom = () => !hasNotch() && st.S.edge === 'bottom';
const boxY = h => atBottom() ? innerHeight - topY() - h : topY();
const isIslandShape = () => !hasNotch() && st.S.shape === 'island';
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
function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
function frame(now) {
  raf = 0;
  const dt = Math.min(0.034, (now - lastT) / 1000); lastT = now;
  let moving = false;
  for (let i = 0; i < 2; i++) moving = stepSpring(dt / 2) || moving;
  animating = moving;
  layoutBox();
  drawGL(now);
  const surf = T.surface(st.S.surface);
  const fx = surf.fx && st.mode === 'card';
  if (moving || fx || (surf.glass && glassLive())) kick();
}
function layoutBox() {
  const w = spring.w.x, h = Math.max(0, spring.h.x), r = spring.r.x;
  const x = anchorX(w), y = boxY(h);
  isl.style.left = x + 'px'; isl.style.top = y + 'px';
  isl.style.width = w + 'px'; isl.style.height = h + 'px';
  isl.style.borderRadius = isIslandShape() ? `${Math.min(r, h / 2, w / 2)}px` : atBottom() ? `${Math.min(r, h, w / 2)}px ${Math.min(r, h, w / 2)}px 0 0` : `0 0 ${Math.min(r, h, w / 2)}px ${Math.min(r, h, w / 2)}px`;
}
function drawGL(now) {
  if (!WyspaGL.ok) return;
  const surf = T.surface(st.S.surface);
  const w = spring.w.x, h = Math.max(0, spring.h.x);
  const openness = Math.max(0, Math.min(1, (h - 36) / 140));
  WyspaGL.draw({
    x: anchorX(w), y: topY(), w, h, r: spring.r.x, ear: isIslandShape() ? 0 : spring.ear.x, island: isIslandShape(), flip: atBottom(),
    base: T.hexToRgb(surf.base), glass: !!surf.glass, blur: (st.S.glassBlur ?? 50) / 100,
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
function recentCursors() { const now = performance.now(); st.cursors = st.cursors.filter(c => now - c.t < 260); return st.cursors; }
W.on('cursor', c => { if (!c) st.cursors = []; else { st.cursors.push({ x: c.x, y: c.y, t: performance.now() }); if (st.cursors.length > 12) st.cursors.shift(); } });

// ---------- tryby i warstwy ----------
let lastRects = '';
function update() {
  const mode = currentMode();
  st.mode = mode;
  target = targetFor(mode);
  $$('.layer').forEach(l => l.classList.remove('on'));
  const layer = { pill: '#pill', hud: '#hud', banner: '#banner', alert: '#banner', card: '#card', strip: '#strip', hidden: null, slim: null }[mode];
  if (layer) $(layer).classList.add('on');
  // zoom treści
  const z = target.z;
  for (const id of ['#pill', '#hud', '#banner', '#strip']) { const el = $(id); el.style.zoom = z; el.style.width = (target.w / z) + 'px'; el.style.height = (target.h / z) + 'px'; }
  const card = $('#card'); const oz = st.S.openSize / 100; card.style.zoom = oz;
  const nh = hasNotch() ? st.screen.notch.h : 0;
  card.style.height = (TAB_H[st.tab] + nh / oz) + 'px';
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
function mode2rect(mode) { const t = targetFor(mode); return { x: Math.round(anchorX(t.w)), y: Math.round(boxY(t.h)), w: Math.round(t.w), h: Math.round(t.h) }; }

// ---------- pigułka ----------
const fmt = sec => { sec = Math.max(0, Math.floor(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
window.fmt = fmt;
function renderPill() {
  const art = $('#pArt'), icon = $('#pIcon'), text = $('#pText'), time = $('#pTime');
  const play = playing();
  art.removeAttribute('src'); icon.innerHTML = ''; text.textContent = ''; time.textContent = ''; time.className = 'mono';
  if (play) { if (st.thumb) art.src = st.thumb; else icon.innerHTML = I.svg('music'); }
  else if (agentWorking()) icon.innerHTML = I.svg('agent');
  if (st.S.titleInPill && play) { text.textContent = st.media.title || ''; if (st.media.artist) { const sm = document.createElement('small'); sm.textContent = st.media.artist; text.append(sm); } }
  if (obsLive()) {
    const o = st.obs, live = o.live?.active, since = live ? o.live.since : o.rec.since;
    time.textContent = `${live ? 'LIVE' : o.rec.paused ? 'PAUZA' : 'REC'} ${fmt((Date.now() - since) / 1000)}`; time.classList.add('rec');
    if (!play && o.scene) text.textContent = o.scene;
  }
  else if (st.rec.on) { time.textContent = fmt((Date.now() - st.rec.start) / 1000); time.classList.add('rec'); }
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
function vizLoop() {
  requestAnimationFrame(vizLoop);
  if (st.mode !== 'pill' || !playing()) return;
  const W2 = viz.width, H2 = viz.height;
  vctx.clearRect(0, 0, W2, H2);
  const cols = 5, levels = [];
  if (analyser) {
    analyser.getByteFrequencyData(freq);
    const bands = [2, 5, 10, 18, 30];
    for (let i = 0; i < cols; i++) { let s = 0; for (let j = bands[i]; j < bands[i] + 4; j++) s += freq[j]; levels.push(Math.min(1, (s / 4 / 255) * 1.25)); }
  } else { const t = performance.now() / 1000; for (let i = 0; i < cols; i++) levels.push(0.35 + 0.3 * Math.sin(t * (3 + i) + i * 1.7) + 0.2 * Math.sin(t * 7.3 + i)); }
  vctx.fillStyle = st.accent;
  if (st.S.visualizer === 'bars') {
    const bw = 5, gap = 3.5;
    levels.slice(0, 4).forEach((l, i) => { const h = Math.max(4, l * H2); const x = i * (bw + gap) + 4; vctx.beginPath(); vctx.roundRect(x, (H2 - h) / 2, bw, h, 2.5); vctx.fill(); });
  } else {
    const px = 4, gap = 1.6, rows = 6;
    levels.forEach((l, i) => { const n = Math.max(1, Math.round(l * rows)); for (let r = 0; r < n; r++) vctx.fillRect(i * (px + gap) + 3, H2 - 2 - (r + 1) * (px + gap) + gap, px, px); });
  }
}
requestAnimationFrame(vizLoop);

// ---------- przechwytywanie ekranu: szkło + dźwięk ----------
let capStream = null, capVideo = null, capWanted = '';
function glassLive() { return capVideo && T.surface(st.S.surface).glass; }
async function ensureCapture() {
  const glass = !!T.surface(st.S.surface).glass;
  // macOS: Electron nie daje dźwięku systemu, a przechwytywanie ekranu wymaga zgody — tylko dla szkła
  if (isMac() && !glass) return;
  const want = glass ? 'glass' : 'audio';
  if (capWanted === want && capStream) return;
  capWanted = want;
  try {
    if (!capStream) {
      capStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 } }, audio: !isMac() });
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
          const busy = st.mode === 'card' || animating;
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
function resetCaptureIfNeeded() { const vt = capStream && capStream.getVideoTracks()[0]; if (T.surface(st.S.surface).glass && !vt) { capStream.getTracks().forEach(t => t.stop()); capStream = null; capVideo = null; capWanted = ''; } }

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
    case 'battery': icon.innerHTML = I.svg(h.plugged ? 'plug' : 'battery'); text.textContent = h.plugged ? 'Ładowanie' : 'Na baterii'; if (navigator.getBattery) navigator.getBattery().then(b => { text.textContent += ` · ${Math.round(b.level * 100)}%`; }); break;
    case 'color': icon.innerHTML = I.svg('color'); text.textContent = `${h.hex} skopiowany`; dot.className = 'hdot swatch'; dot.style.background = h.hex; break;
  }
  clearTimeout(hudTimer);
  hudTimer = setTimeout(() => { st.hud = null; update(); }, 1400);
  update();
}

// ---------- baner i alert ----------
const NOTICE_ICON = { script: 'script', agent: 'agent', phone: 'phone', capture: 'shot', reminder: 'bell', tool: 'color' };
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
function enabledTabs() { return TABS.filter(t => !t.key || st.S[t.key] !== false); }
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

W.on('open', on => {
  if (on && !st.open) {
    let tab = st.S.lastPanel || 'music';
    if (st.banner) tab = 'notices';
    else if (st.S.openOn === 'music') tab = playing() || st.media?.has ? 'music' : 'widgets';
    if (!enabledTabs().some(t => t.id === tab) && tab !== 'reminders') tab = 'music';
    st.banner = null; st.hud = null;
    st.open = true; setTab(tab);
  } else if (!on && st.open) { st.open = false; document.dispatchEvent(new CustomEvent('closed')); update(); }
});

// kółko myszy: na pigułce głośność, na karcie przewijanie kart
isl.addEventListener('wheel', e => {
  const dir = (e.deltaY > 0 ? -1 : 1) * (st.S.reverseScroll ? -1 : 1);
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
W.on('settings', s => { const prevSurf = st.S.surface; st.S = s; if (prevSurf !== s.surface) resetCaptureIfNeeded(); applyTheme(); update(); document.dispatchEvent(new CustomEvent('settings')); });
W.on('screen', s => { st.screen = s; kick(); });
W.on('hud', h => showHud(h));
W.on('banner', n => showBanner(n));
W.on('inuse', m => { st.inuse = { mic: m.mic || [], cam: m.cam || [] }; update(); });
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
  st.S = d.settings; st.screen = d.screen; st.winAccent = d.winAccent || null;
  st.media = d.sys.media; st.thumb = d.sys.thumb; st.vol = d.sys.vol; st.mic = d.sys.mic; st.inuse = d.sys.inuse || st.inuse; st.capture = d.sys.capture || [];
  st.agents = d.agents || []; st.notices = d.notices || []; st.covered = !!d.sys.covered;
  if (callActive()) st.callStart = Date.now();
  st.tab = d.settings.lastPanel || 'music';
  applyTheme();
  setTab(st.tab);
  st.open = false;
  window.dispatchEvent(new CustomEvent('wyspa-init', { detail: d }));
  W.invoke('obs-state').then(s => { st.obs = s; update(); });
  update();
})();
