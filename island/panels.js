/* Wyspa — zawartość kart. Korzysta z W, T, I, st, $, $$, fmt, setTab, update z island.js. */
const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return L('teraz', 'now'); if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const txt = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; };
const setIco = (sel, name) => { const e = $(sel); if (e) e.innerHTML = I.svg(name); };
const clock = d => d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', hour12: st.S.timeFormat === '12' });

// statyczne ikony
[['#mArtNote', 'music'], ['#mEmptyIco', 'music'], ['#nEmptyIco', 'bell'], ['#shPhoneIco', 'phone'], ['#wRemIco', 'bell'],
 ['#vsBrightIco', 'sun'], ['#lShotIco', 'shot'], ['#lSnipIco', 'snip'], ['#cOutIco', 'headphones'], ['#cInIco', 'mic'], ['#cCamIco', 'camera']].forEach(([s, n]) => setIco(s, n));
$('#shClear').innerHTML = I.svg('trash'); $('#bPrev').innerHTML = I.svg('prev'); $('#bNext').innerHTML = I.svg('next'); $('#mPal').innerHTML = I.svg('palette');

// =============== MUZYKA ===============
let lyrics = null;
const appIcons = {};
// zapasowy znaczek Spotify (gdy nie da się odczytać ikony aplikacji)
const SPOTIFY_BADGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M6 9.2c4-1.2 8.6-.8 12 1.2M6.7 12.6c3.3-.9 7-.6 9.9 1.1M7.4 15.8c2.6-.7 5.5-.5 7.8.9" stroke="#000" stroke-width="1.7" stroke-linecap="round" fill="none"/></svg>';
W.on('app-icon', a => { appIcons[a.id] = a.icon; renderMusic(); });
function prettyApp(id) {
  if (!id) return '';
  for (const [re, n] of [[/spotify/i, 'Spotify'], [/opera/i, 'Opera'], [/msedge|edge/i, 'Edge'], [/chrome/i, 'Chrome'], [/firefox/i, 'Firefox'], [/zunemusic|mediaplayer/i, L('Odtwarzacz', 'Player')], [/vlc/i, 'VLC'], [/tidal/i, 'Tidal'], [/deezer/i, 'Deezer'], [/brave/i, 'Brave'], [/apple/i, 'Apple Music']])
    if (re.test(id)) return n;
  return id.split('!').pop().replace(/\.exe$/i, '').split('.').pop();
}
let seeking = null, seekGuard = 0; // ułamek utworu podczas przeciągania paska / blokada starych pozycji po przewinięciu
function mediaPos() { const m = st.media; if (!m) return 0; if (seeking != null && m.end > 0) return seeking * m.end; let p = m.pos || 0; if (m.playing && m.upd) p += (Date.now() - m.upd) / 1000; return m.end > 0 ? Math.min(p, m.end) : p; }
let albumColor = null, progColor = null;
// Kolor paska postępu na tle okładki: wyraźny, ale z tej samej okładki — drugi kolor obrazka, którego odcień leży daleko
// od dominującego (tła). Gdy okładka ma jeden kolor: barwa dopełniająca; szara okładka: prawie biały. Zawsze jasny
// i nasycony, bo tło karty to przyciemniona, rozmyta okładka.
function hsl2rgb(h, s, l) { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0), f(8), f(4)].map(v => Math.round(v * 255)); }
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, s, l]; }
function contrastColor(d) {
  const bins = new Array(12).fill(0), sum = Array.from({ length: 12 }, () => [0, 0, 0]); let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]); const w = s * (1 - Math.abs(2 * l - 1)); // nasycone i nie prawie czarne/białe
    total += 1; if (w < 0.12) continue;
    const b = Math.floor(h / 30) % 12; bins[b] += w; sum[b][0] += d[i] * w; sum[b][1] += d[i + 1] * w; sum[b][2] += d[i + 2] * w;
  }
  const dom = bins.indexOf(Math.max(...bins));
  if (bins[dom] < total * 0.02) return 'rgb(236,236,242)'; // szara / czarno-biała okładka
  const dist = b => Math.min(Math.abs(b - dom), 12 - Math.abs(b - dom));
  let pick = -1, pw = 0;
  for (let b = 0; b < 12; b++) if (dist(b) >= 3 && bins[b] > Math.max(pw, bins[dom] * 0.12)) { pick = b; pw = bins[b]; }
  let h;
  if (pick >= 0) { const [r, g, bl] = sum[pick].map(v => v / bins[pick]); h = rgb2hsl(r, g, bl)[0]; }
  else { const [r, g, bl] = sum[dom].map(v => v / bins[dom]); h = (rgb2hsl(r, g, bl)[0] + 180) % 360; }
  return `rgb(${hsl2rgb(h, 0.8, 0.68).join(',')})`;
}
function extractColor(src) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data; let best = null, bs = -1;
    let lum = 0;
    for (let i = 0; i < d.length; i += 4) { const [r, g, b] = [d[i], d[i + 1], d[i + 2]]; lum += 0.2126 * r + 0.7152 * g + 0.0722 * b; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const s = (mx - mn) * (mx / 255); if (s > bs) { bs = s; best = [r, g, b]; } }
    albumColor = best && bs > 25 ? `rgb(${best.join(',')})` : null;
    progColor = contrastColor(d);
    // jasność okładki 0–1: jasne okładki przyciemniamy mocniej, żeby biały tekst był czytelny na żywym tle
    lum = lum / (d.length / 4) / 255;
    $('#music').style.setProperty('--mbg-dim', Math.max(0, Math.min(0.5, (lum - 0.35) * 0.9)).toFixed(2));
    renderMusic();
  };
  img.src = src;
}
// klik w okładkę (albo znaczek programu): na wierzch aplikacja, z której gra muzyka
$('.m-art').addEventListener('click', e => { e.stopPropagation(); W.send('media-app'); });
function renderMusic() {
  $('#mLyr').classList.toggle('on', !!st.S.lyrics);
  const m = st.media, has = !!(m && m.has && (m.title || m.artist));
  $('#music').classList.toggle('empty-state', !has);
  $('#mEmpty').classList.toggle('on', !has);
  if (!has) { $('#mBg').classList.remove('on'); $('#card').classList.remove('album'); return; }
  // bez zmian w DOM, gdy nic się nie zmieniło: podmiana elementów pod kursorem co aktualizację dawała migotanie
  const mTitleKey = (m.title || '') + '|' + st.tab + '|' + !!st.S.lyrics;
  if (renderMusic.title !== mTitleKey) { renderMusic.title = mTitleKey; $('#mTitle').textContent = m.title || L('Bez tytułu', 'Untitled');
  const t = $('.m-title'); t.classList.remove('marquee');
  requestAnimationFrame(() => { const span = $('#mTitle'); if (span.scrollWidth > t.clientWidth + 2) { t.classList.add('marquee'); if (!span.dataset.dup) { span.textContent = (m.title + '  ').repeat(2); span.dataset.dup = '1'; } } else span.dataset.dup = ''; }); }
  $('#mArtist').textContent = m.artist || prettyApp(m.app);
  const solid = st.S.musicBackground === 'solid';
  $('#mArtist').style.color = solid && albumColor ? albumColor : '';
  const art = $('#mArt');
  if (st.thumb) { if (art.getAttribute('src') !== st.thumb) art.src = st.thumb; $('#mArtNote').style.display = 'none'; } else { art.removeAttribute('src'); $('#mArtNote').style.display = ''; }
  const bg = $('#mBg');
  bg.classList.toggle('on', !solid && !!st.thumb && T.surface(st.S.surface).id !== 'white');
  $('#card').classList.toggle('album', bg.classList.contains('on') && st.tab === 'music');
  const bgImg = st.thumb ? `url("${st.thumb}")` : '';
  if (renderMusic.bg !== bgImg) { renderMusic.bg = bgImg; bg.style.backgroundImage = bgImg; }
  const app = prettyApp(m.app); const badge = $('#mBadge');
  badge.title = app; $('.m-art').title = L(`Otwórz: ${app}`, `Open: ${app}`);
  const icon = appIcons[m.app];
  const badgeKey = icon ? 'i:' + icon : /spotify/i.test(m.app) ? 'spotify' : 'music';
  if (renderMusic.badge !== badgeKey) {
    renderMusic.badge = badgeKey;
    badge.classList.toggle('img', !!icon || /spotify/i.test(m.app));
    if (icon) { badge.innerHTML = ''; const img = el('img'); img.src = icon; img.alt = app; badge.append(img); }
    else if (/spotify/i.test(m.app)) badge.innerHTML = SPOTIFY_BADGE;
    else badge.innerHTML = I.svg('music');
  }
  if (m.app && !(m.app in appIcons)) { appIcons[m.app] = null; W.invoke('app-icon', m.app).then(u => { if (u) { appIcons[m.app] = u; renderMusic(); } }); }
  const playIco = m.playing ? 'pause' : 'play';
  if (renderMusic.play !== playIco) { renderMusic.play = playIco; $('#bPlay').innerHTML = I.svg(playIco); }
  $('#bNext').disabled = !m.canNext; $('#bPrev').disabled = !m.canPrev;
  $('#mEnd').textContent = m.end > 1 ? '-' + fmt(m.end - mediaPos()) : (m.playing ? L('na żywo', 'live') : '');
}
const prog = $('#mProg'), pctx = prog.getContext('2d');
function drawProgress() {
  const dpr = devicePixelRatio || 1, w = prog.clientWidth, h = prog.clientHeight;
  if (!w) return;
  if (prog.width !== w * dpr) { prog.width = w * dpr; prog.height = h * dpr; }
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0); pctx.clearRect(0, 0, w, h);
  const m = st.media; if (!m || !m.has) return;
  const frac = m.end > 1 ? mediaPos() / m.end : 0;
  const x = frac * w, cy = h / 2, t = performance.now() / 1000;
  // tło z okładki: kontrastowy kolor z okładki; jednolite tło: kolor okładki; bez okładki: akcent
  const col = (st.S.musicBackground === 'solid' ? albumColor : $('#card').classList.contains('album') && progColor) || st.accent;
  const style = st.S.progressBar;
  pctx.lineCap = 'round';
  pctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--row-hi'); pctx.lineWidth = 3;
  pctx.beginPath(); pctx.moveTo(Math.min(w - 2, x + 6), cy); pctx.lineTo(w - 2, cy); pctx.stroke();
  if (style === 'pixels') {
    const step = 5; pctx.fillStyle = col;
    for (let px = 2; px < x; px += step) { const a = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 6 + px)) * (px > x - 30 ? 1 : 0.5); pctx.globalAlpha = a; pctx.fillRect(px, cy - 1.5, 3, 3); }
    pctx.globalAlpha = 1; pctx.shadowColor = col; pctx.shadowBlur = 8; pctx.fillRect(x - 3, cy - 2.5, 5, 5); pctx.shadowBlur = 0;
  } else if (style === 'comet') {
    const g = pctx.createLinearGradient(Math.max(0, x - 120), 0, x, 0); g.addColorStop(0, 'transparent'); g.addColorStop(1, col);
    pctx.strokeStyle = g; pctx.lineWidth = 3; pctx.beginPath(); pctx.moveTo(2, cy); pctx.lineTo(x, cy); pctx.stroke();
    pctx.fillStyle = col; pctx.shadowColor = col; pctx.shadowBlur = 10 + 4 * Math.sin(t * 5);
    pctx.beginPath(); pctx.arc(x, cy, 3.6, 0, 7); pctx.fill(); pctx.shadowBlur = 0;
  } else if (style === 'line') {
    pctx.strokeStyle = col; pctx.lineWidth = 5; pctx.beginPath(); pctx.moveTo(3, cy); pctx.lineTo(Math.max(3, x), cy); pctx.stroke();
  } else { // fala
    const amp = m.playing ? 3.2 : 0;
    pctx.strokeStyle = col; pctx.lineWidth = 2.6; pctx.beginPath();
    for (let px = 2; px <= x; px += 1.5) { const y = cy + Math.sin(px / 5.2 - t * 5) * amp; px === 2 ? pctx.moveTo(px, y) : pctx.lineTo(px, y); }
    pctx.stroke();
    pctx.fillStyle = 'currentColor'; pctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--fg');
    pctx.fillRect(x - 1, cy - 6, 2.5, 12);
  }
  $('#mPos').textContent = fmt(mediaPos());
  if (m.end > 1) $('#mEnd').textContent = '-' + fmt(m.end - mediaPos());
  if (lyrics && lyrics.length) { const p = mediaPos(); let line = ''; for (const l of lyrics) { if (l.t <= p + 0.3) line = l.text; else break; } $('#mLyric').textContent = line; }
}
// pasek postępu i przewijany tekst: tylko przy otwartej karcie muzyki, najwyżej 60 kl./s (wcześniej zawsze, 144 Hz)
let progRaf = 0, progLast = 0;
const progWanted = () => st.open && st.tab === 'music' && !document.hidden;
function progKick() { if (!progRaf && progWanted()) progRaf = requestAnimationFrame(progLoop); }
function progLoop() {
  progRaf = 0;
  if (!progWanted()) return;
  drawProgress(); scrollLyrics();
  progRaf = -1; setTimeout(() => { progRaf = 0; progKick(); }, seeking != null ? 0 : 14); // następna klatka nie wcześniej niż za ~16 ms (monitor 144 Hz budził 144×/s)
}
progKick();
document.addEventListener('tab', () => progKick()); // przejście na kartę muzyki
// przewijanie: przeciągasz płynnie (podgląd na bieżąco), utwór przeskakuje po puszczeniu
const fracAt = e => Math.max(0, Math.min(1, e.offsetX / prog.clientWidth));
prog.addEventListener('pointerdown', e => {
  const m = st.media; if (!m || !(m.end > 1)) return;
  prog.setPointerCapture(e.pointerId); seeking = fracAt(e); W.send('hold', true); drawProgress();
});
prog.addEventListener('pointermove', e => { if (seeking == null) return; seeking = fracAt(e); drawProgress(); });
const endSeek = () => {
  if (seeking == null) return;
  const m = st.media, t = seeking * m.end;
  W.send('seek', t); m.pos = t; m.upd = Date.now(); seekGuard = Date.now() + 1800;
  seeking = null; W.send('hold', false);
};
prog.addEventListener('pointerup', endSeek);
prog.addEventListener('pointercancel', endSeek);
$('#bPlay').onclick = () => { W.send('media', 'toggle'); if (st.media) { st.media.playing = !st.media.playing; st.media.pos = mediaPos(); st.media.upd = Date.now(); renderMusic(); update(); } };
$('#bNext').onclick = () => W.send('media', 'next');
$('#bPrev').onclick = () => W.send('media', 'prev');
$('#mLyr').innerHTML = I.svg('lyrics');
$('#mLyr').onclick = e => { e.stopPropagation(); W.invoke('settings-set', { lyrics: !st.S.lyrics }); };
document.addEventListener('settings', () => $('#mLyr').classList.toggle('on', !!st.S.lyrics));
$('#mPal').onclick = () => W.invoke('settings-set', { musicBackground: st.S.musicBackground === 'solid' ? 'album' : 'solid' });
const mVol = $('#mVol');
// głośność: podczas przeciągania suwak słucha tylko myszy (komunikaty z systemu go nie cofają),
// a do systemu idzie najwyżej co 30 ms ostatnia wartość
let volDrag = false, volT = 0, volPending = null, volTimer = null;
function sendVolume(v) {
  volPending = v;
  const now = performance.now();
  if (now - volT >= 30) { volT = now; W.send('volume', volPending); volPending = null; }
  else { clearTimeout(volTimer); volTimer = setTimeout(() => { if (volPending != null) { volT = performance.now(); W.send('volume', volPending); volPending = null; } }, 30); }
}
window.sendVolume = sendVolume;
function renderVol() {
  const v = st.vol; if (!v) return;
  const pct = Math.round((v.mute ? 0 : v.level) * 100);
  if (!volDrag) { mVol.value = pct; mVol.style.setProperty('--v', pct + '%'); $('#mVolPct').textContent = pct + '%'; }
  setIco('#mVolIco', v.mute || pct === 0 ? 'volMute' : 'vol'); renderVSliders();
}
mVol.addEventListener('pointerdown', () => { volDrag = true; W.send('hold', true); });
addEventListener('pointerup', () => { if (volDrag) { volDrag = false; W.send('hold', false); } });
mVol.oninput = () => { mVol.style.setProperty('--v', mVol.value + '%'); $('#mVolPct').textContent = mVol.value + '%'; sendVolume(mVol.value / 100); };
// Drugi suwak: głośność samej aplikacji, z której gra muzyka (Spotify, przeglądarka…), a nie całego systemu.
// Widać go, gdy aplikacja ma sesję dźwięku (Windows) albo to Spotify / Muzyka (Mac).
const mApp = $('#mAppVol');
let appVol = null, appDrag = false, appT = 0, appPending = null, appTimer = null, appVolApp = '';
const APP_STEP = W.platform === 'darwin' ? 90 : 30; // Mac: każda zmiana to osobne polecenie AppleScript
window.appVolShown = () => !!(appVol && st.media && st.media.has);
function sendAppVol(v) {
  appPending = v;
  const now = performance.now();
  if (now - appT >= APP_STEP) { appT = now; W.send('app-volume', v); appPending = null; }
  else { clearTimeout(appTimer); appTimer = setTimeout(() => { if (appPending != null) { appT = performance.now(); W.send('app-volume', appPending); appPending = null; } }, APP_STEP); }
}
function renderAppVol() {
  const has = window.appVolShown(), row = $('#mAppRow');
  if (row.classList.contains('on') !== has) { row.classList.toggle('on', has); update(); } // wysokość karty
  if (!has) return;
  const pct = Math.round((appVol.mute ? 0 : appVol.level) * 100);
  $('#mPosSp').textContent = $('#mPos').textContent; $('#mEndSp').textContent = $('#mEnd').textContent;
  if (!appDrag) { mApp.value = pct; mApp.style.setProperty('--v', pct + '%'); $('#mAppPct').textContent = pct + '%'; }
  const ic = appIcons[st.media.app], box = $('#mAppIco');
  if (ic) { if (box.dataset.src !== ic) { box.dataset.src = ic; box.innerHTML = ''; const img = new Image(); img.src = ic; img.alt = ''; box.append(img); } }
  else if (box.dataset.src !== 'ico') { box.dataset.src = 'ico'; box.innerHTML = I.svg('music'); }
  $('#mAppVolBox').title = L(`Głośność: ${prettyApp(st.media.app)} (tylko ta aplikacja)`, `Volume: ${prettyApp(st.media.app)} (this app only)`);
}
W.on('appvol', v => { if (v && st.media && v.id && v.id !== st.media.app) return; if (appDrag) return; appVol = v; renderAppVol(); });
mApp.addEventListener('pointerdown', () => { appDrag = true; W.send('hold', true); });
addEventListener('pointerup', () => { if (appDrag) { appDrag = false; W.send('hold', false); setTimeout(appVolTick, 500); } });
mApp.oninput = () => { mApp.style.setProperty('--v', mApp.value + '%'); $('#mAppPct').textContent = mApp.value + '%'; if (appVol) appVol = { ...appVol, level: mApp.value / 100, mute: false }; sendAppVol(mApp.value / 100); };
// odczyt przy otwarciu karty muzyki, przy zmianie aplikacji i co 3 s, póki karta muzyki jest otwarta
// (zmiany suwakiem w samej aplikacji albo w Mikserze głośności)
function appVolTick() { if (st.open && st.tab === 'music' && st.media && st.media.has && !appDrag) W.send('appvol-get'); }
setInterval(appVolTick, 3000);
document.addEventListener('tab', () => setTimeout(appVolTick, 30));
W.on('media', m => {
  // tuż po przewinięciu odtwarzacz bywa spóźniony — zostaw lokalną pozycję, żeby pasek nie skakał w tył
  if (Date.now() < seekGuard && st.media && m.title === st.media.title) { m.pos = st.media.pos; m.upd = st.media.upd; }
  // nowy utwór: tytuł w zamkniętej wyspie na 10 s, potem wyspa się zwija
  const key = m && m.has ? `${m.title}|${m.artist}` : '';
  if (key && key !== titleKey) { titleKey = key; st.titleUntil = Date.now() + 3000; clearTimeout(titleTimer); titleTimer = setTimeout(update, 3050); } // tytuł po zmianie utworu: 3 s
  st.media = m; renderMusic(); update();
  if (m && m.app !== appVolApp) { appVolApp = m && m.app || ''; appVol = null; renderAppVol(); appVolTick(); } // inna aplikacja gra
});
let titleKey = '', titleTimer = 0;
W.on('thumb', d => { st.thumb = d || null; albumColor = null; progColor = null; if (d) extractColor(d); renderMusic(); update(); });
W.on('vol', v => { st.vol = v; renderVol(); renderCall(); });
W.on('lyrics', l => {
  st.lyricsLoading = l === 'loading'; if (st.lyricsLoading) { l = null; clearTimeout(st.lyricsLoadT); st.lyricsLoadT = setTimeout(() => { st.lyricsLoading = false; update(); }, 8000); }
  lyrics = l; st.lyricLines = l; $('#mLyric').textContent = ''; st.lyricLine = ''; buildLyrics(); update(); });
// kolumna tekstu: wszystkie linijki, bieżąca na ok. 40% wysokości, klik w linijkę przewija utwór do niej
let lyrCur = -1;
function buildLyrics() {
  const wrap = $('#mLyrWrap'); wrap.textContent = ''; wrap.style.transform = ''; lyrCur = -1;
  for (const l of lyrics || []) {
    const d = txt('div', 'ln' + (l.text.trim() ? '' : ' gap'), l.text.trim() || '♪ ♪ ♪');
    d.onclick = () => { W.send('seek', l.t); if (st.media) { st.media.pos = l.t; st.media.upd = Date.now(); } };
    wrap.append(d);
  }
}
function scrollLyrics() {
  if (!lyrics || !lyrics.length || !$('#music').classList.contains('with-lyrics')) return;
  const p = mediaPos(); let i = -1;
  for (let k = 0; k < lyrics.length; k++) { if (lyrics[k].t <= p + 0.3) i = k; else break; }
  if (i === lyrCur) return;
  lyrCur = i;
  const wrap = $('#mLyrWrap'), box = $('#mLyrics'), rows = wrap.children;
  for (let k = 0; k < rows.length; k++) { rows[k].classList.toggle('cur', k === i); rows[k].classList.toggle('near', Math.abs(k - i) === 1); }
  const row = rows[Math.max(0, i)];
  if (row) wrap.style.transform = `translateY(${-(row.offsetTop - box.clientHeight * 0.4 + row.offsetHeight / 2)}px)`;
}
// linijka tekstu dla zamkniętej wyspy (karaoke) — liczona co 0,3 s, przerysowanie tylko przy zmianie
setInterval(() => {
  let line = '';
  if (lyrics && lyrics.length && st.media?.has && st.media.playing) { const p = mediaPos(); for (const l of lyrics) { if (l.t <= p + 0.3) line = l.text; else break; } }
  line = String(line || '').trim();
  if (line !== (st.lyricLine || '')) { st.lyricLine = line; if (!st.open) update(); }
}, 300);

// =============== WEB ===============
const BRAND = [[/music\.youtube/, '#ff0033', '♪'], [/youtube\.com|youtu\.be/, '#ff0033', '▶'], [/spotify/, '#1db954', 'S'], [/twitch/, '#9146ff', 'T'], [/github/, '#24292f', 'G'], [/chatgpt|openai/, '#10a37f', 'AI'], [/claude\.ai/, '#d97757', 'C'], [/netflix/, '#e50914', 'N'], [/discord/, '#5865f2', 'D'], [/gmail|mail\.google/, '#ea4335', 'M']];
function renderWeb() {
  const grid = $('#webGrid'); grid.textContent = '';
  const pins = st.S.webPins || [];
  pins.forEach((p, i) => {
    const b = el('button', 'wtile'); b.title = p.url;
    const brand = BRAND.find(([re]) => re.test(p.url)) || [null, st.accent, (p.name || '?')[0].toUpperCase()];
    const logo = txt('span', 'wl', brand[2]); logo.style.background = brand[1]; b.append(logo);
    const t = el('div'); t.append(txt('b', '', p.name)); let host = ''; try { host = new URL(p.url).hostname.replace(/^www\./, ''); } catch {} t.append(txt('small', '', host)); b.append(t);
    b.style.background = `linear-gradient(135deg, ${brand[1]}2e, var(--row) 70%)`;
    const x = el('button', 'x', I.svg('x')); x.title = L('Usuń', 'Remove'); x.onclick = e => { e.stopPropagation(); W.send('web-pins', pins.filter((_, j) => j !== i)); }; b.append(x);
    b.onclick = () => W.send('web-open', p.url);
    grid.append(b);
  });
  if (pins.length < 12) { const add = el('button', 'wtile add'); add.append(el('span', 'ico', I.svg('plus')), document.createTextNode(L('Dodaj stronę', 'Add page'))); add.onclick = () => { $('#webAdd').classList.add('on'); $('#webName').focus(); }; grid.append(add); }
}
function webSave() {
  let url = $('#webUrl').value.trim(); if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let name = $('#webName').value.trim(); if (!name) { try { name = new URL(url).hostname.replace(/^www\./, '').split('.')[0]; name = name[0].toUpperCase() + name.slice(1); } catch { name = L('Strona', 'Page'); } }
  W.send('web-pins', [...(st.S.webPins || []), { name, url }]);
  $('#webName').value = ''; $('#webUrl').value = ''; $('#webAdd').classList.remove('on');
}
$('#webSave').onclick = webSave;
$('#webUrl').addEventListener('keydown', e => { if (e.key === 'Enter') webSave(); });
$('#webCancel').onclick = () => $('#webAdd').classList.remove('on');
for (const inp of ['#webName', '#webUrl']) { $(inp).addEventListener('focus', () => W.send('hold', true)); $(inp).addEventListener('blur', () => W.send('hold', false)); }
W.on('calendar', c => { st.calendar = Array.isArray(c) ? c : []; renderToday(); });

// =============== POWIADOMIENIA ===============
function renderNotices() {
  const list = $('#nList'); list.textContent = '';
  for (const n of st.notices) {
    const row = el('div', 'row');
    row.append(el('div', 'tile', I.svg({ script: 'script', agent: 'agent', phone: 'phone', capture: 'shot', reminder: 'bell', tool: 'color', download: 'drop', app: 'bell', web: 'globe' }[n.kind] || 'bell')));
    const t = el('div', 'txt'); t.append(txt('b', '', n.title)); if (n.body) t.append(txt('span', '', n.body)); row.append(t);
    row.append(txt('span', 'when mono', st.S.noticeClockTime ? clock(new Date(n.ts)) : ago(n.ts)));
    const x = el('button', 'x', I.svg('x')); x.title = L('Usuń', 'Remove'); x.onclick = e => { e.stopPropagation(); W.send('notice-remove', n.id); }; row.append(x);
    if (n.path) { row.style.cursor = 'pointer'; row.onclick = () => W.send('notice-open', n.id); }
    list.append(row);
  }
  $('#nEmpty').classList.toggle('on', !st.notices.length);
  list.style.display = st.notices.length ? '' : 'none';
  $('#nCount').textContent = st.notices.length ? `Powiadomienia: ${st.notices.length}` : '';
  $('#nClear').style.display = st.notices.length ? '' : 'none';
}
W.on('notices', n => { st.notices = n || []; renderNotices(); });
$('#nClear').onclick = () => W.send('notices-clear');

// =============== AGENCI ===============
const STATE_TXT = { working: L('pracuje', 'working'), needs: L('czeka na Ciebie', 'waiting for you'), done: L('skończył', 'finished') };
function renderAgents() {
  const list = $('#aList'); list.textContent = '';
  for (const a of st.agents) {
    const row = el('div', 'row');
    const tile = el('div', 'tile', I.svg('agent')); if (/claude/i.test(a.harness)) { tile.style.background = '#d9775733'; tile.style.color = '#e8916f'; }
    row.append(tile);
    const t = el('div', 'txt'); t.append(txt('b', '', a.title || a.harness)); const sub = txt('span', '', ''); const s = txt('span', `state ${a.state}`, STATE_TXT[a.state] || a.state);
    s.style.display = 'inline'; sub.append(s); sub.append(document.createTextNode(a.project ? ` · ${a.project}` : ` · ${a.harness}`)); t.append(sub); row.append(t);
    row.append(txt('span', 'when mono', ago(a.since)));
    list.append(row);
    // ostatnie kroki agenta (czyta, edytuje, polecenie…), czekający na zgodę wyróżniony
    const steps = (a.steps || []).slice(-5);
    if (steps.length) {
      const box = el('div', 'a-steps');
      for (const s of steps) {
        const r = el('div', 'a-step' + (s.pending ? ' pending' : s.denied ? ' denied' : ''));
        r.append(el('span', 'ic', I.svg(s.pending ? 'bell' : s.denied ? 'x' : 'check')), txt('span', 'tx', stepLabel(s)));
        r.title = s.text; box.append(r);
      }
      list.append(box);
    }
  }
  $('#aEmpty').classList.toggle('on', !st.agents.length);
  list.style.display = st.agents.length ? '' : 'none';
  const n = st.agents.filter(a => a.state === 'needs').length, w = st.agents.filter(a => a.state === 'working').length;
  $('#aCount').textContent = st.agents.length ? `Czeka: ${n} · pracuje: ${w}` : '';
}
const STEP_VERB = { Bash: L('Polecenie', 'Command'), PowerShell: L('Polecenie', 'Command'), Read: L('Czyta', 'Reading'), Edit: L('Edytuje', 'Editing'), MultiEdit: L('Edytuje', 'Editing'), Write: L('Zapisuje', 'Writing'), NotebookEdit: L('Edytuje', 'Editing'), Grep: L('Szuka', 'Searching'), Glob: L('Szuka plików', 'Finding files'), WebFetch: L('Pobiera stronę', 'Fetching a page'), WebSearch: L('Szuka w sieci', 'Searching the web'), Task: L('Zleca zadanie', 'Delegating a task'), Agent: L('Zleca zadanie', 'Delegating a task'), TodoWrite: L('Aktualizuje plan', 'Updating the plan') };
function stepLabel(s) {
  const verb = STEP_VERB[s.tool] || s.tool || L('Krok', 'Step');
  let t = String(s.text || '');
  if (/^(Read|Edit|MultiEdit|Write|NotebookEdit)$/.test(s.tool)) t = t.split(/[\\/]/).pop(); // sama nazwa pliku (ścieżki z \ i /)
  if (s.tool === 'TodoWrite') t = '';
  return t ? verb + ': ' + t : verb;
}
W.on('agents', () => renderAgents());
$('#aSet').onclick = () => W.send('open-settings', 'agents');

// =============== PÓŁKA ===============
let files = [];
function renderShelf() {
  const box = $('#shTiles'); box.textContent = '';
  for (const f of files) {
    const t = el('div', 'ftile'); t.draggable = true; t.title = L(`${f.path}\nDwuklik: otwórz · prawy przycisk: folder i konwersja zdjęć`, `${f.path}\nDouble-click: open · right-click: folder and image conversion`);
    if (f.thumb) { const img = el('img'); img.src = f.thumb; img.alt = ''; t.append(img); } else t.append(el('span', 'ico', I.svg('file')));
    t.append(txt('span', '', f.name)); if (f.info) t.append(txt('small', 'mono', f.info));
    const x = el('button', 'x', I.svg('x')); x.title = L('Zdejmij z półki', 'Remove from shelf'); x.onclick = async e => { e.stopPropagation(); setFiles(await W.invoke('file-remove', f.path)); }; t.append(x);
    t.ondblclick = () => W.send('file-open', f.path);
    t.oncontextmenu = e => { e.preventDefault(); W.send('file-menu', f.path); }; // pokaż w folderze, konwersja zdjęć
    t.ondragstart = e => { e.preventDefault(); W.send('file-drag', f.path); };
    box.append(t);
  }
  $('#shelf').classList.toggle('has', files.length > 0);
  $('#shTitle').textContent = files.length ? L(`Półka · ${files.length} ${files.length === 1 ? 'plik' : (files.length % 10 >= 2 && files.length % 10 <= 4 && (files.length % 100 < 12 || files.length % 100 > 14)) ? 'pliki' : 'plików'}`, `Shelf · ${files.length} ${files.length === 1 ? 'file' : 'files'}`) : L('Półka', 'Shelf');
  $('#shClear').style.display = files.length ? '' : 'none';
}
function setFiles(l) { files = l || []; renderShelf(); }
W.on('files', setFiles);
$('#shClear').onclick = async () => setFiles(await W.invoke('files-clear'));
$('#shPhone').onclick = async () => {
  const r = await W.invoke('phone-start');
  if (r.error) { $('#qrUrl').textContent = r.error; $('#qrImg').removeAttribute('src'); }
  else { $('#qrImg').src = r.qr; $('#qrUrl').textContent = r.url; }
  $('#qr').classList.add('on');
};
$('#qrStop').onclick = () => { W.send('phone-stop'); $('#qr').classList.remove('on'); };
W.on('phone', () => $('#qr').classList.remove('on'));
let dropT = null, pickT = 0;
// Mac z kartą AirDrop: przeciągany plik można upuścić na półkę albo od razu wysłać przez AirDrop (bez przełączania kart w trakcie przeciągania)
const dropPickOn = () => isMac() && enabledTabs().some(t => t.id === 'airdrop');
$('#dpShelfIco').innerHTML = I.svg('shelf'); $('#dpAirIco').innerHTML = I.svg('airdrop');

const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
document.addEventListener('dragover', e => {
  e.preventDefault();
  if (!hasFiles(e)) return;
  e.dataTransfer.dropEffect = 'copy';
  if (st.open && dropPickOn()) { // Mac: wybór półka / AirDrop
    const pick = $('#dropPick'), z = e.target.closest && e.target.closest('.dp-zone');
    pick.classList.add('on'); pick.querySelectorAll('.dp-zone').forEach(x => x.classList.toggle('over', x === z));
    clearTimeout(pickT); pickT = setTimeout(() => pick.classList.remove('on'), 300); return;
  }
  if (st.open && st.tab === 'airdrop') { $('#adZone').classList.add('over'); clearTimeout(adT); adT = setTimeout(() => $('#adZone').classList.remove('over'), 250); return; } // karta AirDrop przyjmuje plik sama
  if (st.open && st.tab !== 'shelf') setTab('shelf');
  $('#shelf').classList.add('dropping');
  clearTimeout(dropT); dropT = setTimeout(() => $('#shelf').classList.remove('dropping'), 250);
});
// AirDrop (macOS): plik upuszczony na przycisk idzie prosto do menu „Udostępnij”; klik — wszystkie pliki z półki
$('#shAirdropIco').innerHTML = I.svg('airdrop');
// karta AirDrop: logo, stan wysyłania (otwieram / wysłano / anulowano)
let adT = 0;
$('#adLogo').innerHTML = I.svg('airdrop');
const AD_HINT = L('Przeciągnij tu plik — wybierzesz iPhone’a albo Maca, na który go wysłać.', 'Drop a file here — you’ll choose the iPhone or Mac to send it to.');
W.on('airdrop-state', s => {
  const z = $('#adZone'), h = $('#adHint'); if (!s) return;
  z.classList.toggle('sent', s.state === 'sent');
  h.textContent = s.state === 'opening' ? L(`Wybierz urządzenie w oknie AirDrop: ${s.name}`, `Pick a device in the AirDrop window: ${s.name}`) : s.state === 'sent' ? L(`Wysłano: ${s.name}`, `Sent: ${s.name}`) : s.state === 'cancel' ? L('Anulowano — przeciągnij plik jeszcze raz.', 'Cancelled — drag the file again.')
    : s.state === 'fallback' ? L('AirDrop jest wyłączony (Wi-Fi albo Bluetooth) — wybierz sposób wysłania z menu.', 'AirDrop is off (Wi-Fi or Bluetooth) — choose how to send from the menu.')
    : s.state === 'denied' ? L('macOS nie pozwala Aurze czytać tego folderu. Zezwól w Ustawieniach systemowych → Prywatność i ochrona → Pliki i foldery.', 'macOS doesn’t let Aura read this folder. Allow it in System Settings → Privacy & Security → Files and Folders.')
    : s.state === 'error' ? L('Nie udało się otworzyć AirDrop — wybierz sposób wysłania z menu.', 'Couldn’t open AirDrop — choose how to send from the menu.') : AD_HINT;
  clearTimeout(z._t); if (s.state !== 'opening') z._t = setTimeout(() => { h.textContent = AD_HINT; z.classList.remove('sent'); }, 6000);
});
$('#shAirdrop').onclick = () => { if (files.length) W.send('airdrop', files.map(f => f.path)); else { $('#shAirdrop').classList.add('over'); setTimeout(() => $('#shAirdrop').classList.remove('over'), 600); } };
$('#shAirdrop').addEventListener('dragover', e => { if (hasFiles(e)) $('#shAirdrop').classList.add('over'); });
$('#shAirdrop').addEventListener('dragleave', () => $('#shAirdrop').classList.remove('over'));
// Mac: przeciąganie wykrywane przez Aurę (okno nie dostaje zdarzeń upuszczania) — pozycja kursora względem okna wyspy
const pickZoneAt = pos => { const el = document.elementFromPoint(pos.x, pos.y); return el && el.closest ? el.closest('.dp-zone') : null; };
let lastDomDrop = 0, lastNativeDrop = 0;
W.on('drag-pick', pos => {
  const pick = $('#dropPick'); clearTimeout(pickT);
  if (!pos) { pick.classList.remove('on'); $('#shelf').classList.remove('dropping'); return; }
  if (!dropPickOn()) { if (st.tab !== 'shelf') setTab('shelf'); $('#shelf').classList.add('dropping'); return; }
  pick.classList.add('on'); const z = pickZoneAt(pos);
  pick.querySelectorAll('.dp-zone').forEach(x => x.classList.toggle('over', x === z));
});
W.on('drag-drop', async d => {
  const pick = $('#dropPick'), z = dropPickOn() ? pickZoneAt(d) : null; $('#shelf').classList.remove('dropping');
  pick.classList.remove('on'); pick.querySelectorAll('.dp-zone').forEach(x => x.classList.remove('over'));
  if (Date.now() - lastDomDrop < 800 || !d.files || !d.files.length) return; // okno dostało już zwykłe upuszczenie z plikiem
  lastNativeDrop = Date.now();
  if (z && z.dataset.dp === 'airdrop') { setTab('airdrop'); W.send('airdrop', d.files); return; }
  if (!z && st.tab === 'airdrop') { W.send('airdrop', d.files); return; }
  setFiles(await W.invoke('files-add', d.files)); setTab('shelf');
});
document.addEventListener('drop', async e => {
  e.preventDefault(); $('#shelf').classList.remove('dropping');
  // Mac: upuszczenie przychodzi czasem bez ścieżki pliku — wtedy plik obsłuży Aura (drag-drop niżej), nic tu nie blokujemy
  const domPaths = W.pathsFor(e.dataTransfer.files);
  if (!domPaths.length && isMac()) return;
  if (Date.now() - lastNativeDrop < 800) { $('#dropPick').classList.remove('on'); return; } // Aura już go obsłużyła
  lastDomDrop = Date.now();
  const pick = $('#dropPick');
  if (pick.classList.contains('on')) {
    const z = e.target.closest && e.target.closest('.dp-zone'), paths = domPaths;
    clearTimeout(pickT); pick.classList.remove('on'); pick.querySelectorAll('.dp-zone').forEach(x => x.classList.remove('over'));
    if (!paths.length) return;
    if (z && z.dataset.dp === 'airdrop') { setTab('airdrop'); W.send('airdrop', paths); return; }
    setFiles(await W.invoke('files-add', paths)); setTab('shelf'); return;
  }
  if (st.open && st.tab === 'airdrop') { $('#adZone').classList.remove('over'); if (e.dataTransfer.files.length) W.send('airdrop', W.pathsFor(e.dataTransfer.files)); return; } // karta AirDrop: od razu okno AirDrop
  if (e.target.closest && e.target.closest('#shAirdrop')) { $('#shAirdrop').classList.remove('over'); if (e.dataTransfer.files.length) W.send('airdrop', W.pathsFor(e.dataTransfer.files)); return; }
  if (e.dataTransfer.files.length) { setFiles(await W.invoke('files-add', W.pathsFor(e.dataTransfer.files))); if (st.open) setTab('shelf'); }
});

// =============== SCHOWEK ===============
let clips = [], clipFilter = 'all';
function renderClips() {
  const box = $('#clList'); box.textContent = '';
  box.classList.toggle('list', st.S.clipboardLayout === 'list');
  $('#clLayout').innerHTML = I.svg(st.S.clipboardLayout === 'list' ? 'grid' : 'list');
  const shown = clips.filter(c => clipFilter === 'all' || (clipFilter === 'pinned' ? c.pinned : c.type === clipFilter));
  for (const c of shown) {
    const card = el('div', 'ccard');
    const h = el('div', 'ch'); h.append(txt('span', c.pinned ? 't-pin' : c.type === 'image' ? 't-img' : '', c.pinned ? L('Przypięte', 'Pinned') : c.type === 'image' ? L('Obraz', 'Image') : L('Tekst', 'Text'))); h.append(txt('span', 'mono', ago(c.ts))); card.append(h);
    const b = el('div', 'cb');
    if (c.type === 'image') { const img = el('img'); img.src = c.img; img.alt = ''; b.append(img); } else b.textContent = c.text.replace(/\s+/g, ' ').trim();
    card.append(b);
    const f = el('div', 'cf'); f.append(txt('span', 'mono', c.type === 'image' ? c.text : `${c.len} zn.`)); card.append(f);
    const acts = el('div', 'acts');
    const pin = el('button', '', I.svg('pin')); pin.title = c.pinned ? L('Odepnij', 'Unpin') : L('Przypnij (nie znika)', 'Pin (stays)'); pin.onclick = e => { e.stopPropagation(); W.send('clip-pin', c.id); };
    const x = el('button', '', I.svg('x')); x.title = L('Usuń', 'Remove'); x.onclick = e => { e.stopPropagation(); W.send('clip-remove', c.id); };
    acts.append(pin, x); card.append(acts);
    card.title = c.type === 'text' ? c.text.slice(0, 400) : L('Kliknij, żeby skopiować', 'Click to copy');
    // przeciąganie do innych aplikacji: obraz jako plik PNG (systemowo), tekst jako zwykły tekst
    card.draggable = true;
    if (c.type === 'text') card.onmousedown = () => { if (c.len > c.text.length) W.invoke('clip-text', c.id).then(t => { card._full = t; }); };
    card.ondragstart = e => {
      if (c.type === 'image') { e.preventDefault(); W.send('clip-drag', c.id); return; }
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', card._full || c.text);
    };
    card.onclick = () => { W.send('clip-copy', c.id); card.classList.add('flash'); f.firstChild.textContent = 'skopiowano'; setTimeout(() => card.classList.remove('flash'), 900); };
    box.append(card);
  }
  $('#clEmpty').classList.toggle('on', !shown.length);
  box.style.display = shown.length ? '' : 'none';
}
W.on('clips', l => { clips = l || []; renderClips(); });
$$('#clFilter button').forEach(b => b.onclick = () => { clipFilter = b.dataset.f; $$('#clFilter button').forEach(x => x.classList.toggle('on', x === b)); renderClips(); });
$('#clClear').onclick = () => W.send('clips-clear');
$('#clLayout').onclick = () => W.invoke('settings-set', { clipboardLayout: st.S.clipboardLayout === 'list' ? 'cards' : 'list' });
$('#clList').addEventListener('wheel', e => { if (st.S.clipboardLayout !== 'list' && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { $('#clList').scrollLeft += e.deltaY; e.stopPropagation(); } });

// =============== WIDŻETY ===============
const DAYS = L(['N', 'P', 'W', 'Ś', 'C', 'P', 'S'], ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
function weekNo(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); }
function renderToday() {
  const d = new Date(), box = $('#wToday'); box.textContent = '';
  const left = el('div'); left.append(txt('div', 'big', d.getDate()));
  const next = (st.calendar || []).find(e => e.end > Date.now());
  const right = el('div'); right.append(txt('div', 'dn', d.toLocaleDateString(LOC, { weekday: 'short' }).toUpperCase()), txt('div', 'mo', d.toLocaleDateString(LOC, { month: 'short' }).toUpperCase()));
  if (!next) right.append(txt('div', 'wk', L(`Tydzień ${weekNo(d)}`, `Week ${weekNo(d)}`)));
  box.append(left, right);
  if (next) { const ev = el('div', 'ev'); ev.title = next.title; ev.append(txt('b', '', next.allDay ? L('cały dzień', 'all day') : next.start <= Date.now() ? L('teraz', 'now') : clock(new Date(next.start)))); ev.append(document.createTextNode(next.title)); box.append(ev); }
  const days = el('div', 'days'); const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); days.append(txt('span', x.toDateString() === d.toDateString() ? 'on' : '', DAYS[x.getDay()])); }
  box.append(days);
}
const WICON = c => c === 0 || c === 1 ? 'sunny' : c <= 3 ? 'cloud' : c <= 48 ? 'fog' : c <= 67 || (c >= 80 && c <= 82) ? 'rain' : c <= 86 ? 'snow' : 'storm';
function renderWeather() {
  const w = st.weather, box = $('#wWeather'); box.textContent = '';
  if (!w) { box.append(txt('small', '', L('Pobieram pogodę…', 'Getting the weather…'))); return; }
  if (w.error) { box.append(txt('small', '', L('Pogoda niedostępna. Ustaw miejsce w Ustawieniach → Widżety.', 'Weather unavailable. Set a place in Settings → Widgets.'))); return; }
  const top = el('div', 'wt'); top.append(txt('div', 'tmp', `${w.temp}°`)); top.append(el('span', 'wi', I.svg(WICON(w.code)))); box.append(top);
  box.append(txt('small', '', `${w.text}\nMaks. ${w.max}° · Min. ${w.min}°${w.place ? ' · ' + w.place : ''}`));
  box.lastChild.style.whiteSpace = 'pre-line';
}
W.on('weather', w => { st.weather = w; renderWeather(); });
const statHist = { cpu: [], gpu: [], ram: [] };
function spark(canvas, arr, color) {
  const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return;
  canvas.width = w * dpr; canvas.height = h * dpr; const c = canvas.getContext('2d'); c.scale(dpr, dpr);
  c.strokeStyle = color; c.lineWidth = 1.6; c.lineJoin = 'round'; c.beginPath();
  arr.forEach((v, i) => { const x = (i / 29) * w, y = h - 1 - (v / 100) * (h - 2); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
}
function fmtNet(b) { if (st.S.netUnit === 'Mbps') return (b * 8 / 1e6).toFixed(1) + ' Mb/s'; return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB/s' : Math.round(b / 1024) + ' KB/s'; }
function buildStats() {
  const box = $('#wStats'); box.textContent = '';
  for (const [k, label] of [['cpu', 'CPU'], ['gpu', 'GPU'], ['ram', 'RAM']]) { const r = el('div', 'srow'); r.append(txt('b', '', label), el('canvas'), txt('span', 'v mono', '–')); r.dataset.k = k; box.append(r); }
  const n = el('div', 'snet mono'); n.id = 'sNet'; box.append(n);
  const ram = box.querySelector('.srow[data-k="ram"]'); ram.title = L('Kliknij: co zużywa pamięć', 'Click: what’s using memory'); ram.onclick = openMem;
}
// RAM: lista programów, które zużywają najwięcej pamięci (zsumowane po aplikacji), odświeżana co 3 s
let memTimer = 0;
const fmtMem = mb => mb >= 1024 ? (mb / 1024).toFixed(1).replace('.', ',') + ' GB' : mb + ' MB';
async function loadMem() {
  let d; try { d = await W.invoke('mem-top'); } catch { return; }
  if (!d || !$('#wMem').classList.contains('on')) return;
  const totalMb = d.total / 1048576, list = $('#wMemList');
  $('#wMemSum').textContent = L(`${fmtMem(Math.round(d.used / 1048576))} z ${fmtMem(Math.round(totalMb))}`, `${fmtMem(Math.round(d.used / 1048576))} of ${fmtMem(Math.round(totalMb))}`);
  const rows = d.list || [], top = Math.max(1, ...rows.map(r => r.mb));
  list.textContent = '';
  if (!rows.length) { list.append(txt('small', '', L('Nie udało się odczytać listy programów.', 'Couldn’t read the list of programs.'))); return; }
  for (const r of rows) {
    const row = el('div', 'mem-row'); row.title = L(`${r.name}: ${fmtMem(r.mb)} (${Math.round(100 * r.mb / totalMb)}% pamięci)`, `${r.name}: ${fmtMem(r.mb)} (${Math.round(100 * r.mb / totalMb)}% of memory)`);
    row.append(txt('b', '', r.name), txt('span', 'mono', fmtMem(r.mb)));
    const bar = el('i'); bar.style.setProperty('--s', (r.mb / top).toFixed(3)); row.append(bar);
    list.append(row);
  }
}
function openMem() { $('#wMem').classList.add('on'); $('#wMemList').textContent = ''; $('#wMemList').append(txt('small', '', L('Sprawdzam…', 'Checking…'))); loadMem(); clearInterval(memTimer); memTimer = setInterval(loadMem, 3000); }
function closeMem() { $('#wMem').classList.remove('on'); clearInterval(memTimer); }
$('#wMemBack').onclick = closeMem;
buildStats();
W.on('stats', s => {
  // pasek dla graczy nad grą
  if (st.game) {
    const g = $('#gText'); g.textContent = '';
    const add = (label, val) => { g.append(txt('b', '', label)); g.append(document.createTextNode(val)); };
    add('CPU', ` ${Math.round(s.cpu)}%`); if (s.gpu) add('GPU', ` ${Math.round(s.gpu.util)}% ${Math.round(s.gpu.temp)}°`);
    add('RAM', ` ${Math.round(s.ram)}%`); add('↓', ` ${fmtNet(s.net.rx)}`); add('', ' ' + clock(new Date()));
  }
  const push = (k, v) => { statHist[k].push(v); if (statHist[k].length > 30) statHist[k].shift(); };
  push('cpu', s.cpu); push('ram', s.ram); if (s.gpu) push('gpu', s.gpu.util);
  const colors = { cpu: st.accent, gpu: '#bf5af2', ram: '#ff9f0a' };
  $$('#wStats .srow').forEach(r => {
    const k = r.dataset.k; const v = k === 'gpu' ? (s.gpu ? `${Math.round(s.gpu.util)}%` : 'n/d') : `${Math.round(k === 'cpu' ? s.cpu : s.ram)}%`;
    r.lastChild.textContent = v;
    if (k === 'gpu' && s.gpu) { const sm = document.createElement('small'); sm.textContent = `${Math.round(s.gpu.temp)}°`; r.lastChild.append(sm); }
    spark(r.querySelector('canvas'), statHist[k], colors[k]);
  });
  $('#sNet').textContent = `↓ ${fmtNet(s.net.rx)}   ↑ ${fmtNet(s.net.tx)}`;
});
// minutnik skupienia
const F = st.focus;
function focusLen(mode) { return (mode === 'break' ? st.S.breakMinutes : st.S.focusMinutes) * 60; }
function renderFocus() {
  const total = F.total || focusLen(F.mode), left = F.total ? F.left : total;
  $('#fTime').textContent = fmt(left);
  $('#fLabel').textContent = F.mode === 'break' ? 'przerwa' : `${st.S.focusMinutes} + ${st.S.breakMinutes} min`;
  $('#fRing').style.strokeDashoffset = 169.6 * (1 - left / total);
  $('#fPlay').innerHTML = I.svg(F.running ? 'pause' : 'play');
  W.send('focus-state', { running: !!F.running, left: Math.round(left), mode: F.mode });
  $('#wFocus').title = `${F.mode === 'break' ? L('Przerwa', 'Break') : L('Skupienie', 'Focus')} · ${st.S.focusMinutes} + ${st.S.breakMinutes} min`;
}
function focusToggle() {
  if (F.running) { F.running = false; F.left = Math.max(0, (F.end - Date.now()) / 1000); }
  else { if (!F.total || F.left <= 0) { F.total = focusLen(F.mode); F.left = F.total; } F.end = Date.now() + F.left * 1000; F.running = true; }
  renderFocus(); update();
}
// +/− zmienia długość całej sesji (nie tylko pozostały czas), więc upłynięta część pierścienia się nie zmienia;
// przed startem pierścień zostaje pełny. Zakres: pozostało min. 1 min, cała sesja maks. 3 h.
function focusAdjust(d) {
  if (F.running) F.left = Math.max(0, (F.end - Date.now()) / 1000);
  if (!F.total || F.left <= 0) { F.total = focusLen(F.mode); F.left = F.total; }
  const elapsed = F.total - F.left;
  F.left = Math.min(Math.max(60, F.left + d * 60), 180 * 60 - elapsed);
  F.total = elapsed + F.left;
  if (F.running) F.end = Date.now() + F.left * 1000;
  renderFocus(); update();
}
setInterval(() => {
  if (!F.running) return;
  F.left = Math.max(0, Math.ceil((F.end - Date.now()) / 1000));
  if (F.left <= 0) {
    F.running = false; const was = F.mode; F.mode = was === 'focus' ? 'break' : 'focus'; F.total = 0; F.left = 0;
    showAlert({ icon: 'focus', title: was === 'focus' ? L('Koniec skupienia', 'Focus finished') : L('Koniec przerwy', 'Break finished'), body: was === 'focus' ? L(`Czas na ${st.S.breakMinutes} min przerwy`, `Time for a ${st.S.breakMinutes} min break`) : L('Wracamy do pracy?', 'Back to work?'),
      actions: [{ label: L('Później', 'Later'), fn: () => closeAlert() }, { label: was === 'focus' ? L('Start przerwy', 'Start break') : L('Start skupienia', 'Start focus'), accent: true, fn: () => { closeAlert(); focusToggle(); } }] });
  }
  renderFocus(); if (st.mode === 'pill') update();
}, 500);
$('#fPlay').onclick = focusToggle; $('#fMinus').onclick = () => focusAdjust(-5); $('#fPlus').onclick = () => focusAdjust(5);
W.on('focus-toggle', focusToggle);

// =============== PRZYPOMNIENIA ===============
let reminders = [], rWhen = '10', rRep = 'once';
function whenToTime(w) {
  const d = new Date();
  if (w === 'evening') { d.setHours(18, 0, 0, 0); if (d < Date.now()) d.setDate(d.getDate() + 1); return d.getTime(); }
  if (w === 'morning') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); }
  if (w === 'time') { const [h, m] = ($('#rTime').value || '12:00').split(':').map(Number); d.setHours(h, m, 0, 0); if (d < Date.now()) d.setDate(d.getDate() + 1); return d.getTime(); }
  return Date.now() + Number(w) * 60e3;
}
function renderReminders() {
  const list = $('#rList'); list.textContent = '';
  for (const r of reminders) {
    const row = el('div', 'row'); row.style.minHeight = '34px';
    row.append(el('div', 'tile', I.svg('bell')));
    const t = el('div', 'txt'); t.append(txt('b', '', r.text)); const d = new Date(r.at);
    t.append(txt('span', 'mono', `${d.toDateString() === new Date().toDateString() ? L('Dziś', 'Today') : d.toLocaleDateString(LOC, { weekday: 'short', day: 'numeric', month: 'short' })} ${clock(d)}${r.repeat !== 'once' ? ' · ' + L({ daily: 'codziennie', weekdays: 'dni robocze', weekly: 'co tydzień' }, { daily: 'daily', weekdays: 'weekdays', weekly: 'weekly' })[r.repeat] : ''}`)); row.append(t);
    const x = el('button', 'x', I.svg('x')); x.title = L('Usuń', 'Remove'); x.onclick = async () => { reminders = await W.invoke('reminder-remove', r.id); renderReminders(); }; row.append(x);
    list.append(row);
  }
  list.style.display = reminders.length ? '' : 'none';
  const at = new Date(whenToTime(rWhen));
  $('#rSummary').textContent = L(`${at.toDateString() === new Date().toDateString() ? 'Dziś' : 'Jutro'} o ${clock(at)}`, `${at.toDateString() === new Date().toDateString() ? 'Today' : 'Tomorrow'} at ${clock(at)}`);
  const next = reminders[0];
  $('#wRemTime').textContent = next ? (next.at - Date.now() < 3600e3 ? Math.max(0, Math.round((next.at - Date.now()) / 60e3)) + 'm' : clock(new Date(next.at))) : '';
}
W.on('reminders', r => { reminders = r || []; renderReminders(); });
$$('#rWhen button').forEach(b => b.onclick = () => { rWhen = b.dataset.w; $$('#rWhen button').forEach(x => x.classList.toggle('on', x === b)); renderReminders(); });
$('#rTime').onchange = () => { rWhen = 'time'; $$('#rWhen button').forEach(x => x.classList.remove('on')); renderReminders(); };
$$('#rRep button').forEach(b => b.onclick = () => { rRep = b.dataset.r; $$('#rRep button').forEach(x => x.classList.toggle('on', x === b)); });
async function addReminder() {
  const text = $('#rText').value.trim(); if (!text) { $('#rText').focus(); return; }
  reminders = await W.invoke('reminder-add', { text, at: whenToTime(rWhen), repeat: rRep });
  $('#rText').value = ''; $('#rAdd').textContent = '✓ Dodano'; setTimeout(() => { $('#rAdd').textContent = L('Ustaw przypomnienie', 'Set a reminder'); }, 1400);
  renderReminders();
}
$('#rAdd').onclick = addReminder;
$('#rText').addEventListener('keydown', e => { if (e.key === 'Enter') addReminder(); });
for (const inp of ['#rText', '#rTime']) { $(inp).addEventListener('focus', () => W.send('hold', true)); $(inp).addEventListener('blur', () => W.send('hold', false)); }
$('#wRem').onclick = () => setTab('reminders');
$('#rClose').onclick = () => setTab('widgets');
W.on('reminder-fire', r => {
  showAlert({ icon: 'bell', title: r.text, body: `Przypomnienie · ${clock(new Date(r.at))}`, repeat: true, actions: [
    { label: 'Drzemka 10 min', fn: () => { W.send('reminder-answer', { id: r.id, action: 'snooze' }); closeAlert(); } },
    { label: L('Gotowe', 'Done'), accent: true, fn: () => { W.send('reminder-answer', { id: r.id, action: 'done' }); closeAlert(); } },
  ] });
});

// =============== STEROWANIE ===============
let radios = [], powerMode = '', bright = { v: -1 };
const TOGGLES = [
  { id: 'wifi', icon: 'wifi', name: 'Wi-Fi', state: () => { const r = radios.find(x => x.kind === 'WiFi'); return r ? r.on : null; }, click: on => W.send('radio', { kind: 'WiFi', on: !on }) },
  { id: 'bt', icon: 'bt', name: 'Bluetooth', state: () => { const r = radios.find(x => x.kind === 'Bluetooth'); return r ? r.on : null; }, click: on => on === null ? W.send('open-uri', 'ms-settings:bluetooth') : W.send('radio', { kind: 'Bluetooth', on: !on }) },
  { id: 'night', icon: 'moon', name: L('Tryb nocny', 'Night light'), sub: L('Ustawienia', 'Settings'), click: () => W.send('open-uri', 'ms-settings:nightlight') },
  { id: 'mute', icon: 'volMute', name: L('Wycisz', 'Mute'), state: () => !!(st.vol && st.vol.mute), click: on => W.send('mute', !on) },
  { id: 'out', icon: 'headphones', name: L('Dźwięk', 'Sound'), sub: () => st.vol ? st.vol.name : '', click: () => W.send('open-uri', 'ms-settings:sound') },
  { id: 'mic', icon: 'mic', name: L('Mikrofon', 'Microphone'), state: () => st.mic ? !st.mic.mute : null, click: () => W.send('mic-toggle') },
];
function renderToggles() {
  const box = $('#toggles'); box.textContent = '';
  for (const t of TOGGLES) {
    const on = t.state ? t.state() : null;
    const b = el('button', 'tg' + (on ? ' on' : ''));
    b.append(el('span', 'ti', I.svg(t.id === 'mic' && on === false ? 'micOff' : t.icon)));
    const d = el('div'); d.append(txt('b', '', t.name)); d.append(txt('small', '', typeof t.sub === 'function' ? t.sub() : t.sub || (on === null ? '—' : on ? L('Wł.', 'On') : L('Wył.', 'Off')))); b.append(d);
    b.onclick = () => t.click(on);
    box.append(b);
  }
  $$('#power button').forEach(b => b.classList.toggle('on', b.dataset.g === powerMode));
}
function vsSet(id, frac) { const s = $(id); s.querySelector('.vs-fill').style.height = (Math.max(0, Math.min(1, frac)) * 100) + '%'; }
function renderVSliders() {
  const v = st.vol;
  if (v && !vsDragging) { const f = v.mute ? 0 : v.level; vsSet('#vsVol', f); $('#vsVolVal').textContent = Math.round(f * 100) + '%'; setIco('#vsVolIco', v.mute || f === 0 ? 'volMute' : 'vol'); }
  const b = $('#vsBright'); b.classList.toggle('off', bright.v < 0);
  vsSet('#vsBright', bright.v < 0 ? 0 : bright.v / 100); $('#vsBrightVal').textContent = bright.v < 0 ? 'n/d' : bright.v + '%';
}
let vsDragging = false;
function vsDrag(id, fn) {
  const s = $(id);
  const set = e => { const r = s.getBoundingClientRect(); const f = 1 - (e.clientY - r.top) / r.height; fn(Math.max(0, Math.min(1, f))); };
  s.addEventListener('pointerdown', e => { if (s.classList.contains('off')) return; s.setPointerCapture(e.pointerId); vsDragging = true; W.send('hold', true); set(e); s.onpointermove = set; });
  const up = () => { s.onpointermove = null; if (vsDragging) { vsDragging = false; W.send('hold', false); } };
  s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
}
vsDrag('#vsVol', f => { sendVolume(f); vsSet('#vsVol', f); $('#vsVolVal').textContent = Math.round(f * 100) + '%'; });
let brT = null; vsDrag('#vsBright', f => { const v = Math.round(f * 100); bright.v = v; vsSet('#vsBright', f); $('#vsBrightVal').textContent = v + '%'; clearTimeout(brT); brT = setTimeout(() => W.send('brightness', v), 120); });
$$('#power button').forEach(b => b.onclick = () => { powerMode = b.dataset.g; W.send('power-mode', b.dataset.g); renderToggles(); });
W.on('radios', r => { radios = r || []; renderToggles(); });
W.on('power', g => { powerMode = g; renderToggles(); });
W.on('bright', b => { bright = b; renderVSliders(); });
W.on('mic', m => { st.mic = m; renderToggles(); renderCall(); });

// =============== LAUNCHER + NAGRYWANIE ===============
async function renderSlots() {
  const info = await W.invoke('launch-info'); const box = $('#lSlots'); box.textContent = '';
  info.forEach((a, i) => {
    const b = el('button', 'slot' + (a ? ' has' : ''));
    if (a) { if (a.icon) { const img = el('img'); img.src = a.icon; img.alt = ''; b.append(img); } b.append(txt('span', '', a.name)); b.title = a.path + L('\nPrawy przycisk: zmień', '\nRight-click: change'); b.onclick = () => W.send('launch', i); b.oncontextmenu = async e => { e.preventDefault(); await W.invoke('launch-pick', i); renderSlots(); }; }
    else { b.append(el('span', 'ico', I.svg('plus'))); b.append(txt('span', '', L('Dodaj', 'Add'))); b.onclick = async () => { await W.invoke('launch-pick', i); renderSlots(); }; }
    box.append(b);
  });
}
$('#lShot').onclick = () => { W.send('close-island'); W.send('screenshot'); };
$('#lSnip').onclick = () => { W.send('close-island'); W.send('snip'); };
let recorder = null, recStreams = [];
async function recToggle() {
  if (recorder) { recorder.stop(); return; }
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: !!st.S.recordPcSound });
    recStreams = [screenStream];
    const tracks = [...screenStream.getVideoTracks()];
    const ctx = new AudioContext(), dest = ctx.createMediaStreamDestination(); let hasAudio = false;
    if (screenStream.getAudioTracks().length) { ctx.createMediaStreamSource(new MediaStream(screenStream.getAudioTracks())).connect(dest); hasAudio = true; }
    if (st.S.recordMic) { try { const mic = await navigator.mediaDevices.getUserMedia({ audio: true }); recStreams.push(mic); ctx.createMediaStreamSource(mic).connect(dest); hasAudio = true; } catch {} }
    if (hasAudio) tracks.push(...dest.stream.getAudioTracks());
    await W.invoke('rec-start');
    recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 10e6 });
    recorder.ondataavailable = async e => { if (e.data.size) W.send('rec-chunk', await e.data.arrayBuffer()); };
    recorder.onstop = () => { recStreams.forEach(s => s.getTracks().forEach(t => t.stop())); ctx.close(); recorder = null; st.rec.on = false; setTimeout(() => W.send('rec-stop'), 300); $('#lRec').classList.remove('rec'); $('#lRecTxt').textContent = L('Nagraj', 'Record'); update(); };
    recorder.start(1000);
    st.rec = { on: true, start: Date.now() };
    $('#lRec').classList.add('rec'); $('#lRecTxt').textContent = L('Zatrzymaj', 'Stop');
    W.send('close-island'); update();
  } catch (e) { console.warn('rec', e); }
}
$('#lRec').onclick = recToggle;
W.on('record-toggle', recToggle);

// =============== PC DECK (telefon jako pilot) ===============
let deckState = null;
function renderDeck() {
  const s = deckState || {};
  $('#deck').classList.toggle('running', !!s.running);
  if (s.error && !s.running) $('#dkOff p').textContent = s.error;
  if (s.qr) $('#dkQr').src = s.qr;
  $('#dkUrl').textContent = s.url || '';
  const box = $('#dkDev'); box.textContent = '';
  for (const d of s.devices || []) {
    const r = el('div'); const dot = el('i', d.connected ? 'on' : ''); r.append(dot, txt('span', '', d.name || L('Telefon', 'Phone')));
    const x = el('button', 'link', null); x.textContent = L('Odłącz', 'Unpair'); x.onclick = () => W.send('deck-forget', d.id); r.append(x);
    box.append(r);
  }
  if (!(s.devices || []).length && s.running) box.append(txt('small', '', L('Brak sparowanych telefonów.', 'No paired phones.')));
}
W.on('deck', s => { deckState = s; renderDeck(); });
$('#dkStart').onclick = async () => { $('#dkStart').textContent = L('Włączam…', 'Turning on…'); deckState = await W.invoke('deck-start'); $('#dkStart').textContent = L('Włącz PC Deck', 'Turn on PC Deck'); renderDeck(); };
$('#dkStop').onclick = () => W.send('deck-stop');
$('#dkReset').onclick = () => W.send('deck-reset');
W.on('deck-pair', r => {
  showAlert({ icon: 'phone', title: L(`Połączyć telefon „${r.name || 'Telefon'}”?`, `Pair the phone “${r.name || 'Phone'}”?`), body: L(`Kod na telefonie: ${r.code} · ${r.ip || ''}`, `Code on the phone: ${r.code} · ${r.ip || ''}`), actions: [
    { label: L('Odrzuć', 'Reject'), fn: () => { W.send('deck-answer', { id: r.id, ok: false }); closeAlert(); } },
    { label: L('Zatwierdź', 'Approve'), accent: true, fn: () => { W.send('deck-answer', { id: r.id, ok: true }); closeAlert(); } },
  ] });
});

// =============== AKTUALIZACJE ===============
W.on('update-alert', u => {
  const ready = u.kind === 'ready';
  showAlert({ icon: 'check', title: ready ? L(`Aura ${u.version} jest gotowa`, `Aura ${u.version} is ready`) : L(`Dostępna Aura ${u.version}`, `Aura ${u.version} is available`),
    body: ready ? L('Zainstaluje się po ponownym uruchomieniu.', 'It will install when you restart.') : u.self ? L('Pobierze się i zainstaluje sama.', 'It will download and install by itself.') : L('Pobierz nową wersję ze strony wydań.', 'Download the new version from the releases page.'),
    actions: [
      { label: L('Później', 'Later'), fn: () => { W.send('update-answer', 'later'); closeAlert(); } },
      { label: ready ? L('Uruchom ponownie', 'Restart') : u.self ? L('Zaktualizuj', 'Update') : L('Pobierz', 'Download'), accent: true, fn: () => { W.send('update-answer', ready ? 'install' : u.self ? 'update' : 'open'); closeAlert(); } },
    ] });
});

// =============== ROZMOWA ===============
function renderCall() {
  const m = st.mic, muted = !!(m && m.mute);
  const b = $('#cMic'); b.classList.toggle('muted', muted); setIco('#cMicIco', muted ? 'micOff' : 'mic');
  $('#cState').textContent = muted ? L('Mikrofon wyciszony', 'Microphone muted') : L('Mikrofon włączony', 'Microphone on');
  $('#cHint').textContent = muted ? L('Kliknij, by włączyć we wszystkich aplikacjach', 'Click to unmute in all apps') : L('Kliknij, by wyciszyć we wszystkich aplikacjach', 'Click to mute in all apps');
  $('#cOut').textContent = st.vol ? st.vol.name : '—';
  $('#cIn').textContent = m ? m.name : '—';
}
$('#cMic').onclick = () => W.send('mic-toggle');
$('#cSound').onclick = () => W.send('open-uri', 'ms-settings:sound');
// wybór głośników / mikrofonu prosto z karty (Windows); na Macu bez listy — zostaje link do ustawień
let devices = null, pickFlow = null;
// „Słuchawki (Arctis 7 Game)” -> [„Arctis 7 Game”, „Słuchawki”]: to, co odróżnia urządzenia, na pierwszym planie
function devLabel(name) {
  const m = String(name || L('Urządzenie', 'Device')).match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!m) return [name || L('Urządzenie', 'Device'), ''];
  const generic = /^(słuchawki|głośniki|głośnik|zestaw słuchawkowy|mikrofon.*|headphones|speakers?|headset.*|microphone.*|wejście.*|line in.*)$/i;
  return generic.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
}
function renderPick() {
  const list = $('#cList'); list.innerHTML = '';
  const items = devices ? devices[pickFlow] || [] : [];
  list.classList.toggle('two', items.length > 3);
  $('#cPickT').textContent = pickFlow === 'in' ? L('Mikrofon', 'Microphone') : L('Głośniki', 'Speakers');
  if (!items.length) { const s = el('small'); s.style.color = 'var(--dim)'; s.textContent = devices ? L('Brak urządzeń.', 'No devices.') : L('Wczytuję urządzenia…', 'Loading devices…'); list.append(s); return; }
  for (const d of items) {
    const b = el('button', 'c-opt' + (d.def ? ' on' : '')); const n = el('span'); const [main, sub] = devLabel(d.name);
    const nb = el('b'); nb.textContent = main; n.append(nb); if (sub) { const ns = el('small'); ns.textContent = sub; n.append(ns); }
    const ok = el('i', 'ok'); ok.innerHTML = I.svg('check');
    b.append(n, ok); b.title = d.name;
    b.onclick = () => { if (!d.def) { for (const x of items) x.def = x === d; renderPick(); W.send('audio-set', d.id); } setTimeout(closePick, 220); };
    list.append(b);
  }
  const on = list.querySelector('.c-opt.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}
function openPick(flow) {
  if (isMac()) return W.send('open-uri', 'ms-settings:sound');
  pickFlow = flow; $('#call').classList.add('picking'); renderPick(); W.send('audio-devices');
}
function closePick() { pickFlow = null; $('#call').classList.remove('picking'); }
$('#cOutBtn').onclick = () => openPick('out');
$('#cInBtn').onclick = () => openPick('in');
$('#cBack').onclick = closePick;
W.on('devices', d => { devices = d; if (pickFlow) renderPick(); });
let camStream = null;
function camStop() { if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } $('#cVideo').classList.remove('on'); $('#cCam').lastChild.textContent = L('Sprawdź kamerę', 'Check the camera'); }
$('#cCam').onclick = async () => {
  if (camStream) return camStop();
  try { camStream = await navigator.mediaDevices.getUserMedia({ video: true }); const v = $('#cVideo'); v.srcObject = camStream; await v.play(); v.classList.add('on'); $('#cCam').lastChild.textContent = L('Wyłącz kamerę', 'Turn off the camera'); } catch { $('#cHint').textContent = L('Nie udało się włączyć kamery.', 'Couldn’t turn on the camera.'); }
};

// =============== ZWIERZAK (kot) ===============
const CAT = {
  walk1: '0000000000000|0100000000010|0110000000110|0111111111110|0101101101110|0111111111110|0011111111100|0011111111100|0010100010100',
  walk2: '0000000000000|0100000000010|0110000000110|0111111111110|0101101101110|0111111111110|0011111111100|0011111111100|0001010101000',
  sit: '0000000000000|0001000001000|0001100011000|0001111111000|0001011010000|0001111111000|0000111110010|0001111111010|0001111111100',
  blink: '0000000000000|0001000001000|0001100011000|0001111111000|0001111111000|0001111111000|0000111110010|0001111111010|0001111111100',
  sleep: '0000000000000|0000000000000|0000000000000|0000000000000|0000000000000|0111111111100|1111011111110|1111111111111|0111111111110',
};
const DOG = {
  walk1: '0000000000000|0000000000110|0000000001111|1000000001101|0111111111111|0111111111100|0111111111000|0110000001100|0100000000100',
  walk2: '0000000000000|0000000000110|0000000001111|0100000001101|0111111111111|0111111111100|0111111111000|0011000011000|0001000010000',
  sit: '0000000000000|0000000000110|0000000001111|0000000001101|0000001111111|0000111111100|0001111111000|0011111111000|0011101110000',
  blink: '0000000000000|0000000000110|0000000001111|0000000001111|0000001111111|0000111111100|0001111111000|0011111111000|0011101110000',
  sleep: '0000000000000|0000000000000|0000000000000|0000000000000|0000000000000|0000000001100|1111111111110|1111111111111|0111111111110',
};
const RABBIT = {
  walk1: '0000000101000|0000000101000|0000000111000|0000001111100|0011111111100|0111111111100|0111111111000|0011111110000|0010000010000',
  walk2: '0000001010000|0000001010000|0000000111000|0000001111100|0011111111100|0111111111100|0111111111000|0011111110000|0001000100000',
  sit: '0000000101000|0000000101000|0000000101000|0000000111000|0000001111100|0000011111100|0000111111000|0001111111000|0001111111000',
  blink: '0000000101000|0000000101000|0000000101000|0000000111000|0000001111100|0000011111100|0000111111000|0001111111000|0001111111000',
  sleep: '0000000000000|0000000000000|0000000000000|0000000000000|0000000001100|0000000111111|0011111111110|0111111111110|0011111111100',
};
// Robocik: własna pomarańczowa postać Aury (antena, oczy-okienka, krótkie nóżki)
const BOT = {
  color: '#e8834a',
  walk1: '0000001000000|0000001000000|0001111111000|0011011101100|0011111111100|0011111111100|0001111111000|0001000001000|0010000000100',
  walk2: '0000001000000|0000001000000|0001111111000|0011011101100|0011111111100|0011111111100|0001111111000|0000100010000|0000100010000',
  sit: '0000000000000|0000001000000|0001111111000|0011011101100|0011111111100|0011111111100|0001111111000|0001111111000|0011111111100',
  blink: '0000000000000|0000001000000|0001111111000|0011111111100|0011111111100|0011111111100|0001111111000|0001111111000|0011111111100',
  sleep: '0000000000000|0000000000000|0000000000000|0000000000000|0000000000100|0001111111100|0011111111110|0011111111110|0001111111100',
};
function catSvg(frame, flip) {
  const set = st.S.idlePet === 'dog' ? DOG : st.S.idlePet === 'rabbit' ? RABBIT : st.S.idlePet === 'bot' ? BOT : CAT;
  const rows = set[frame].split('|'); let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '1') r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`; }));
  return `<svg viewBox="0 0 13 9" fill="currentColor" style="${flip ? 'transform:scaleX(-1)' : ''};color:${set.color || 'var(--fg)'}" shape-rendering="crispEdges">${r}</svg>`;
}
const pet = { x: 10, dir: 1, mode: 'walk', t: 0, idle: 0 };
setInterval(() => {
  const p = $('#pet'); if (!p.classList.contains('on')) return;
  const maxX = Math.max(0, p.parentElement.clientWidth - 22);
  pet.t++;
  if (pet.mode === 'walk') {
    pet.x += pet.dir * 1.2;
    if (pet.x <= 0 || pet.x >= maxX) { pet.dir *= -1; pet.x = Math.max(0, Math.min(maxX, pet.x)); }
    if (Math.random() < 0.01) { pet.mode = 'sit'; pet.idle = 0; }
    p.innerHTML = catSvg(pet.t % 4 < 2 ? 'walk1' : 'walk2', pet.dir < 0);
    p.style.transform = st.S.idlePet === 'rabbit' && pet.t % 4 < 2 ? 'translateY(-3px)' : '';
  } else if (pet.mode === 'sit') {
    pet.idle++;
    p.innerHTML = catSvg(pet.idle % 30 === 0 ? 'blink' : 'sit', pet.dir < 0);
    if (pet.idle > 80) pet.mode = Math.random() < 0.4 ? 'sleep' : 'walk';
  } else {
    pet.idle++;
    p.innerHTML = catSvg('sleep', pet.dir < 0) + (pet.idle % 20 < 10 ? '<b style="position:absolute;right:-8px;top:-8px;font-size:8px;color:var(--dim)">z</b>' : '');
    if (pet.idle > 260) { pet.mode = 'walk'; pet.idle = 0; }
  }
  p.style.left = pet.x + 'px';
}, 120);

// =============== przełączanie kart ===============
let statsOn = false;
document.addEventListener('tab', e => {
  const id = e.detail;
  $('#card').classList.toggle('album', id === 'music' && $('#mBg').classList.contains('on'));
  const wantStats = st.open && id === 'widgets';
  if (wantStats !== statsOn) { statsOn = wantStats; W.send('stats-on', statsOn); }
  if (id === 'widgets') { renderToday(); renderFocus(); W.send('weather-refresh'); renderReminders(); }
  if (id === 'controls') { W.send('controls-refresh'); renderToggles(); renderVSliders(); }
  if (id === 'launcher') renderSlots();
  if (id === 'call') renderCall(); else { camStop(); closePick(); }
  if (id !== 'widgets') closeMem();
  if (id === 'clips') renderClips();
  if (id === 'music') renderMusic();
  if (id === 'reminders') renderReminders();
  if (id === 'web') renderWeb();
  if (id === 'deck') W.invoke('deck-state').then(s => { if (s) deckState = s; renderDeck(); });
});
document.addEventListener('closed', () => { camStop(); closeMem(); if (statsOn) { statsOn = false; W.send('stats-on', false); } $('#qr').classList.remove('on'); });
document.addEventListener('settings', () => { renderMusic(); renderClips(); renderFocus(); renderNotices(); renderWeb(); });

// Start kart: z sygnału „wyspa-init” albo od razu, jeśli dane przyszły, zanim ten plik się wczytał
// (wcześniej sygnał wtedy przepadał: pusty schowek, półka i przypomnienia aż do przeładowania wyspy)
let panelsInited = false;
window.addEventListener('wyspa-init', e => initPanels(e.detail));
if (window.__wyspaInit) setTimeout(() => initPanels(window.__wyspaInit), 0);
function initPanels(d) {
  if (panelsInited || !d) return; panelsInited = true;
  document.body.classList.toggle('mac', isMac()); // np. przycisk AirDrop na półce
  setFiles(d.files); clips = d.clips || []; renderClips(); renderNotices(); renderAgents();
  reminders = d.reminders || []; renderReminders();
  if (st.thumb) extractColor(st.thumb);
  renderMusic(); renderVol(); renderFocus(); renderCall(); renderToday();
  if (d.sys.bright) bright = d.sys.bright;
  W.invoke('calendar').then(c => { st.calendar = c || []; renderToday(); });
  renderWeb();
}
