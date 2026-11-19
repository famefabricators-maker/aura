/* Wyspa — zawartość kart. Korzysta z W, T, I, st, $, $$, fmt, setTab, update z island.js. */
const ago = ts => { const s = (Date.now() - ts) / 1000; if (s < 60) return 'teraz'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const txt = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; };
const setIco = (sel, name) => { const e = $(sel); if (e) e.innerHTML = I.svg(name); };
const clock = d => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: st.S.timeFormat === '12' });

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
  for (const [re, n] of [[/spotify/i, 'Spotify'], [/opera/i, 'Opera'], [/msedge|edge/i, 'Edge'], [/chrome/i, 'Chrome'], [/firefox/i, 'Firefox'], [/zunemusic|mediaplayer/i, 'Odtwarzacz'], [/vlc/i, 'VLC'], [/tidal/i, 'Tidal'], [/deezer/i, 'Deezer'], [/brave/i, 'Brave'], [/apple/i, 'Apple Music']])
    if (re.test(id)) return n;
  return id.split('!').pop().replace(/\.exe$/i, '').split('.').pop();
}
let seeking = null, seekGuard = 0; // ułamek utworu podczas przeciągania paska / blokada starych pozycji po przewinięciu
function mediaPos() { const m = st.media; if (!m) return 0; if (seeking != null && m.end > 0) return seeking * m.end; let p = m.pos || 0; if (m.playing && m.upd) p += (Date.now() - m.upd) / 1000; return m.end > 0 ? Math.min(p, m.end) : p; }
let albumColor = null;
function extractColor(src) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data; let best = null, bs = -1;
    for (let i = 0; i < d.length; i += 4) { const [r, g, b] = [d[i], d[i + 1], d[i + 2]]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const s = (mx - mn) * (mx / 255); if (s > bs) { bs = s; best = [r, g, b]; } }
    albumColor = best && bs > 25 ? `rgb(${best.join(',')})` : null; renderMusic();
  };
  img.src = src;
}
function renderMusic() {
  const m = st.media, has = !!(m && m.has && (m.title || m.artist));
  $('#music').classList.toggle('empty-state', !has);
  $('#mEmpty').classList.toggle('on', !has);
  if (!has) { $('#mBg').classList.remove('on'); $('#card').classList.remove('album'); return; }
  $('#mTitle').textContent = m.title || 'Bez tytułu';
  const t = $('.m-title'); t.classList.remove('marquee');
  requestAnimationFrame(() => { const span = $('#mTitle'); if (span.scrollWidth > t.clientWidth + 2) { t.classList.add('marquee'); if (!span.dataset.dup) { span.textContent = (m.title + '  ').repeat(2); span.dataset.dup = '1'; } } else span.dataset.dup = ''; });
  $('#mArtist').textContent = m.artist || prettyApp(m.app);
  const solid = st.S.musicBackground === 'solid';
  $('#mArtist').style.color = solid && albumColor ? albumColor : '';
  const art = $('#mArt');
  if (st.thumb) { art.src = st.thumb; $('#mArtNote').style.display = 'none'; } else { art.removeAttribute('src'); $('#mArtNote').style.display = ''; }
  const bg = $('#mBg');
  bg.classList.toggle('on', !solid && !!st.thumb && T.surface(st.S.surface).id !== 'white');
  $('#card').classList.toggle('album', bg.classList.contains('on') && st.tab === 'music');
  bg.style.backgroundImage = st.thumb ? `url("${st.thumb}")` : '';
  const app = prettyApp(m.app); const badge = $('#mBadge');
  badge.title = app;
  const icon = appIcons[m.app];
  badge.classList.toggle('img', !!icon || /spotify/i.test(m.app));
  if (icon) { badge.innerHTML = ''; const img = el('img'); img.src = icon; img.alt = app; badge.append(img); }
  else if (/spotify/i.test(m.app)) badge.innerHTML = SPOTIFY_BADGE;
  else badge.innerHTML = I.svg('music');
  if (m.app && !(m.app in appIcons)) { appIcons[m.app] = null; W.invoke('app-icon', m.app).then(u => { if (u) { appIcons[m.app] = u; renderMusic(); } }); }
  $('#bPlay').innerHTML = I.svg(m.playing ? 'pause' : 'play');
  $('#bNext').disabled = !m.canNext; $('#bPrev').disabled = !m.canPrev;
  $('#mEnd').textContent = m.end > 1 ? '-' + fmt(m.end - mediaPos()) : (m.playing ? 'na żywo' : '');
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
  const col = (st.S.musicBackground === 'solid' && albumColor) || st.accent;
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
(function progLoop() { requestAnimationFrame(progLoop); if (st.open && st.tab === 'music') drawProgress(); })();
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
  if (!volDrag) { mVol.value = pct; mVol.style.setProperty('--v', pct + '%'); }
  setIco('#mVolIco', v.mute || pct === 0 ? 'volMute' : 'vol'); renderVSliders();
}
mVol.addEventListener('pointerdown', () => { volDrag = true; W.send('hold', true); });
addEventListener('pointerup', () => { if (volDrag) { volDrag = false; W.send('hold', false); } });
mVol.oninput = () => { mVol.style.setProperty('--v', mVol.value + '%'); sendVolume(mVol.value / 100); };
W.on('media', m => {
  // tuż po przewinięciu odtwarzacz bywa spóźniony — zostaw lokalną pozycję, żeby pasek nie skakał w tył
  if (Date.now() < seekGuard && st.media && m.title === st.media.title) { m.pos = st.media.pos; m.upd = st.media.upd; }
  st.media = m; renderMusic(); update();
});
W.on('thumb', d => { st.thumb = d || null; albumColor = null; if (d) extractColor(d); renderMusic(); update(); });
W.on('vol', v => { st.vol = v; renderVol(); renderCall(); });
W.on('lyrics', l => { lyrics = l; $('#mLyric').textContent = ''; });

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
    const x = el('button', 'x', I.svg('x')); x.title = 'Usuń'; x.onclick = e => { e.stopPropagation(); W.send('web-pins', pins.filter((_, j) => j !== i)); }; b.append(x);
    b.onclick = () => W.send('web-open', p.url);
    grid.append(b);
  });
  if (pins.length < 12) { const add = el('button', 'wtile add'); add.append(el('span', 'ico', I.svg('plus')), document.createTextNode('Dodaj stronę')); add.onclick = () => { $('#webAdd').classList.add('on'); $('#webName').focus(); }; grid.append(add); }
}
function webSave() {
  let url = $('#webUrl').value.trim(); if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let name = $('#webName').value.trim(); if (!name) { try { name = new URL(url).hostname.replace(/^www\./, '').split('.')[0]; name = name[0].toUpperCase() + name.slice(1); } catch { name = 'Strona'; } }
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
    row.append(el('div', 'tile', I.svg({ script: 'script', agent: 'agent', phone: 'phone', capture: 'shot', reminder: 'bell', tool: 'color' }[n.kind] || 'bell')));
    const t = el('div', 'txt'); t.append(txt('b', '', n.title)); if (n.body) t.append(txt('span', '', n.body)); row.append(t);
    row.append(txt('span', 'when mono', st.S.noticeClockTime ? clock(new Date(n.ts)) : ago(n.ts)));
    const x = el('button', 'x', I.svg('x')); x.title = 'Usuń'; x.onclick = e => { e.stopPropagation(); W.send('notice-remove', n.id); }; row.append(x);
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
const STATE_TXT = { working: 'pracuje', needs: 'czeka na Ciebie', done: 'skończył' };
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
  }
  $('#aEmpty').classList.toggle('on', !st.agents.length);
  list.style.display = st.agents.length ? '' : 'none';
  const n = st.agents.filter(a => a.state === 'needs').length, w = st.agents.filter(a => a.state === 'working').length;
  $('#aCount').textContent = st.agents.length ? `Czeka: ${n} · pracuje: ${w}` : '';
}
W.on('agents', () => renderAgents());
$('#aSet').onclick = () => W.send('open-settings', 'agents');

// =============== PÓŁKA ===============
let files = [];
function renderShelf() {
  const box = $('#shTiles'); box.textContent = '';
  for (const f of files) {
    const t = el('div', 'ftile'); t.draggable = true; t.title = `${f.path}\nDwuklik: otwórz · prawy przycisk: pokaż w folderze`;
    if (f.thumb) { const img = el('img'); img.src = f.thumb; img.alt = ''; t.append(img); } else t.append(el('span', 'ico', I.svg('file')));
    t.append(txt('span', '', f.name)); if (f.info) t.append(txt('small', 'mono', f.info));
    const x = el('button', 'x', I.svg('x')); x.title = 'Zdejmij z półki'; x.onclick = async e => { e.stopPropagation(); setFiles(await W.invoke('file-remove', f.path)); }; t.append(x);
    t.ondblclick = () => W.send('file-open', f.path);
    t.oncontextmenu = e => { e.preventDefault(); W.send('file-show', f.path); };
    t.ondragstart = e => { e.preventDefault(); W.send('file-drag', f.path); };
    box.append(t);
  }
  $('#shelf').classList.toggle('has', files.length > 0);
  $('#shTitle').textContent = files.length ? `Półka · ${files.length} ${files.length === 1 ? 'plik' : (files.length % 10 >= 2 && files.length % 10 <= 4 && (files.length % 100 < 12 || files.length % 100 > 14)) ? 'pliki' : 'plików'}` : 'Półka';
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
let dropT = null;
const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
document.addEventListener('dragover', e => {
  e.preventDefault();
  if (!hasFiles(e)) return;
  e.dataTransfer.dropEffect = 'copy';
  if (st.open && st.tab !== 'shelf') setTab('shelf');
  $('#shelf').classList.add('dropping');
  clearTimeout(dropT); dropT = setTimeout(() => $('#shelf').classList.remove('dropping'), 250);
});
document.addEventListener('drop', async e => {
  e.preventDefault(); $('#shelf').classList.remove('dropping');
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
    const h = el('div', 'ch'); h.append(txt('span', c.pinned ? 't-pin' : c.type === 'image' ? 't-img' : '', c.pinned ? 'Przypięte' : c.type === 'image' ? 'Obraz' : 'Tekst')); h.append(txt('span', 'mono', ago(c.ts))); card.append(h);
    const b = el('div', 'cb');
    if (c.type === 'image') { const img = el('img'); img.src = c.img; img.alt = ''; b.append(img); } else b.textContent = c.text.replace(/\s+/g, ' ').trim();
    card.append(b);
    const f = el('div', 'cf'); f.append(txt('span', 'mono', c.type === 'image' ? c.text : `${c.len} zn.`)); card.append(f);
    const acts = el('div', 'acts');
    const pin = el('button', '', I.svg('pin')); pin.title = c.pinned ? 'Odepnij' : 'Przypnij (nie znika)'; pin.onclick = e => { e.stopPropagation(); W.send('clip-pin', c.id); };
    const x = el('button', '', I.svg('x')); x.title = 'Usuń'; x.onclick = e => { e.stopPropagation(); W.send('clip-remove', c.id); };
    acts.append(pin, x); card.append(acts);
    card.title = c.type === 'text' ? c.text.slice(0, 400) : 'Kliknij, żeby skopiować';
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
const DAYS = ['N', 'P', 'W', 'Ś', 'C', 'P', 'S'];
function weekNo(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); }
function renderToday() {
  const d = new Date(), box = $('#wToday'); box.textContent = '';
  const left = el('div'); left.append(txt('div', 'big', d.getDate()));
  const next = (st.calendar || []).find(e => e.end > Date.now());
  const right = el('div'); right.append(txt('div', 'dn', d.toLocaleDateString('pl-PL', { weekday: 'short' }).toUpperCase()), txt('div', 'mo', d.toLocaleDateString('pl-PL', { month: 'short' }).toUpperCase()));
  if (!next) right.append(txt('div', 'wk', `Tydzień ${weekNo(d)}`));
  box.append(left, right);
  if (next) { const ev = el('div', 'ev'); ev.title = next.title; ev.append(txt('b', '', next.allDay ? 'cały dzień' : next.start <= Date.now() ? 'teraz' : clock(new Date(next.start)))); ev.append(document.createTextNode(next.title)); box.append(ev); }
  const days = el('div', 'days'); const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) { const x = new Date(mon); x.setDate(mon.getDate() + i); days.append(txt('span', x.toDateString() === d.toDateString() ? 'on' : '', DAYS[x.getDay()])); }
  box.append(days);
}
const WICON = c => c === 0 || c === 1 ? 'sunny' : c <= 3 ? 'cloud' : c <= 48 ? 'fog' : c <= 67 || (c >= 80 && c <= 82) ? 'rain' : c <= 86 ? 'snow' : 'storm';
function renderWeather() {
  const w = st.weather, box = $('#wWeather'); box.textContent = '';
  if (!w) { box.append(txt('small', '', 'Pobieram pogodę…')); return; }
  if (w.error) { box.append(txt('small', '', 'Pogoda niedostępna. Ustaw miejsce w Ustawieniach → Widżety.')); return; }
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
}
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
  $('#wFocus').title = `${F.mode === 'break' ? 'Przerwa' : 'Skupienie'} · ${st.S.focusMinutes} + ${st.S.breakMinutes} min`;
}
function focusToggle() {
  if (F.running) { F.running = false; F.left = Math.max(0, (F.end - Date.now()) / 1000); }
  else { if (!F.total || F.left <= 0) { F.total = focusLen(F.mode); F.left = F.total; } F.end = Date.now() + F.left * 1000; F.running = true; }
  renderFocus(); update();
}
function focusAdjust(d) { if (!F.total) { F.total = focusLen(F.mode); F.left = F.total; } F.left = Math.max(60, F.left + d * 60); F.total = Math.max(F.total, F.left); if (F.running) F.end = Date.now() + F.left * 1000; renderFocus(); update(); }
setInterval(() => {
  if (!F.running) return;
  F.left = Math.max(0, Math.ceil((F.end - Date.now()) / 1000));
  if (F.left <= 0) {
    F.running = false; const was = F.mode; F.mode = was === 'focus' ? 'break' : 'focus'; F.total = 0; F.left = 0;
    showAlert({ icon: 'focus', title: was === 'focus' ? 'Koniec skupienia' : 'Koniec przerwy', body: was === 'focus' ? `Czas na ${st.S.breakMinutes} min przerwy` : 'Wracamy do pracy?',
      actions: [{ label: 'Później', fn: () => closeAlert() }, { label: was === 'focus' ? 'Start przerwy' : 'Start skupienia', accent: true, fn: () => { closeAlert(); focusToggle(); } }] });
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
    t.append(txt('span', 'mono', `${d.toDateString() === new Date().toDateString() ? 'Dziś' : d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })} ${clock(d)}${r.repeat !== 'once' ? ' · ' + { daily: 'codziennie', weekdays: 'dni robocze', weekly: 'co tydzień' }[r.repeat] : ''}`)); row.append(t);
    const x = el('button', 'x', I.svg('x')); x.title = 'Usuń'; x.onclick = async () => { reminders = await W.invoke('reminder-remove', r.id); renderReminders(); }; row.append(x);
    list.append(row);
  }
  list.style.display = reminders.length ? '' : 'none';
  const at = new Date(whenToTime(rWhen));
  $('#rSummary').textContent = `${at.toDateString() === new Date().toDateString() ? 'Dziś' : 'Jutro'} o ${clock(at)}`;
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
  $('#rText').value = ''; $('#rAdd').textContent = '✓ Dodano'; setTimeout(() => { $('#rAdd').textContent = 'Ustaw przypomnienie'; }, 1400);
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
    { label: 'Gotowe', accent: true, fn: () => { W.send('reminder-answer', { id: r.id, action: 'done' }); closeAlert(); } },
  ] });
});

// =============== STEROWANIE ===============
let radios = [], powerMode = '', bright = { v: -1 };
const TOGGLES = [
  { id: 'wifi', icon: 'wifi', name: 'Wi-Fi', state: () => { const r = radios.find(x => x.kind === 'WiFi'); return r ? r.on : null; }, click: on => W.send('radio', { kind: 'WiFi', on: !on }) },
  { id: 'bt', icon: 'bt', name: 'Bluetooth', state: () => { const r = radios.find(x => x.kind === 'Bluetooth'); return r ? r.on : null; }, click: on => on === null ? W.send('open-uri', 'ms-settings:bluetooth') : W.send('radio', { kind: 'Bluetooth', on: !on }) },
  { id: 'night', icon: 'moon', name: 'Tryb nocny', sub: 'Ustawienia', click: () => W.send('open-uri', 'ms-settings:nightlight') },
  { id: 'mute', icon: 'volMute', name: 'Wycisz', state: () => !!(st.vol && st.vol.mute), click: on => W.send('mute', !on) },
  { id: 'out', icon: 'headphones', name: 'Dźwięk', sub: () => st.vol ? st.vol.name : '', click: () => W.send('open-uri', 'ms-settings:sound') },
  { id: 'mic', icon: 'mic', name: 'Mikrofon', state: () => st.mic ? !st.mic.mute : null, click: () => W.send('mic-toggle') },
];
function renderToggles() {
  const box = $('#toggles'); box.textContent = '';
  for (const t of TOGGLES) {
    const on = t.state ? t.state() : null;
    const b = el('button', 'tg' + (on ? ' on' : ''));
    b.append(el('span', 'ti', I.svg(t.id === 'mic' && on === false ? 'micOff' : t.icon)));
    const d = el('div'); d.append(txt('b', '', t.name)); d.append(txt('small', '', typeof t.sub === 'function' ? t.sub() : t.sub || (on === null ? '—' : on ? 'Wł.' : 'Wył.'))); b.append(d);
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
    if (a) { if (a.icon) { const img = el('img'); img.src = a.icon; img.alt = ''; b.append(img); } b.append(txt('span', '', a.name)); b.title = a.path + '\nPrawy przycisk: zmień'; b.onclick = () => W.send('launch', i); b.oncontextmenu = async e => { e.preventDefault(); await W.invoke('launch-pick', i); renderSlots(); }; }
    else { b.append(el('span', 'ico', I.svg('plus'))); b.append(txt('span', '', 'Dodaj')); b.onclick = async () => { await W.invoke('launch-pick', i); renderSlots(); }; }
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
    recorder.onstop = () => { recStreams.forEach(s => s.getTracks().forEach(t => t.stop())); ctx.close(); recorder = null; st.rec.on = false; setTimeout(() => W.send('rec-stop'), 300); $('#lRec').classList.remove('rec'); $('#lRecTxt').textContent = 'Nagraj'; update(); };
    recorder.start(1000);
    st.rec = { on: true, start: Date.now() };
    $('#lRec').classList.add('rec'); $('#lRecTxt').textContent = 'Zatrzymaj';
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
    const r = el('div'); const dot = el('i', d.connected ? 'on' : ''); r.append(dot, txt('span', '', d.name || 'Telefon'));
    const x = el('button', 'link', null); x.textContent = 'Odłącz'; x.onclick = () => W.send('deck-forget', d.id); r.append(x);
    box.append(r);
  }
  if (!(s.devices || []).length && s.running) box.append(txt('small', '', 'Brak sparowanych telefonów.'));
}
W.on('deck', s => { deckState = s; renderDeck(); });
$('#dkStart').onclick = async () => { $('#dkStart').textContent = 'Włączam…'; deckState = await W.invoke('deck-start'); $('#dkStart').textContent = 'Włącz PC Deck'; renderDeck(); };
$('#dkStop').onclick = () => W.send('deck-stop');
$('#dkReset').onclick = () => W.send('deck-reset');
W.on('deck-pair', r => {
  showAlert({ icon: 'phone', title: `Połączyć telefon „${r.name || 'Telefon'}”?`, body: `Kod na telefonie: ${r.code} · ${r.ip || ''}`, actions: [
    { label: 'Odrzuć', fn: () => { W.send('deck-answer', { id: r.id, ok: false }); closeAlert(); } },
    { label: 'Zatwierdź', accent: true, fn: () => { W.send('deck-answer', { id: r.id, ok: true }); closeAlert(); } },
  ] });
});

// =============== AKTUALIZACJE ===============
W.on('update-alert', u => {
  const ready = u.kind === 'ready';
  showAlert({ icon: 'check', title: ready ? `Aura ${u.version} jest gotowa` : `Dostępna Aura ${u.version}`,
    body: ready ? 'Zainstaluje się po ponownym uruchomieniu.' : 'Pobierz nową wersję ze strony wydań.',
    actions: [
      { label: 'Później', fn: () => { W.send('update-answer', 'later'); closeAlert(); } },
      { label: ready ? 'Uruchom ponownie' : 'Pobierz', accent: true, fn: () => { W.send('update-answer', ready ? 'install' : 'open'); closeAlert(); } },
    ] });
});

// =============== ROZMOWA ===============
function renderCall() {
  const m = st.mic, muted = !!(m && m.mute);
  const b = $('#cMic'); b.classList.toggle('muted', muted); setIco('#cMicIco', muted ? 'micOff' : 'mic');
  $('#cState').textContent = muted ? 'Mikrofon wyciszony' : 'Mikrofon włączony';
  $('#cHint').textContent = muted ? 'Kliknij, by włączyć we wszystkich aplikacjach' : 'Kliknij, by wyciszyć we wszystkich aplikacjach';
  $('#cOut').textContent = st.vol ? st.vol.name : '—';
  $('#cIn').textContent = m ? m.name : '—';
}
$('#cMic').onclick = () => W.send('mic-toggle');
$('#cSound').onclick = () => W.send('open-uri', 'ms-settings:sound');
let camStream = null;
function camStop() { if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } $('#cVideo').classList.remove('on'); $('#cCam').lastChild.textContent = 'Sprawdź kamerę'; }
$('#cCam').onclick = async () => {
  if (camStream) return camStop();
  try { camStream = await navigator.mediaDevices.getUserMedia({ video: true }); const v = $('#cVideo'); v.srcObject = camStream; await v.play(); v.classList.add('on'); $('#cCam').lastChild.textContent = 'Wyłącz kamerę'; } catch { $('#cHint').textContent = 'Nie udało się włączyć kamery.'; }
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
function catSvg(frame, flip) {
  const set = st.S.idlePet === 'dog' ? DOG : st.S.idlePet === 'rabbit' ? RABBIT : CAT;
  const rows = set[frame].split('|'); let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '1') r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`; }));
  return `<svg viewBox="0 0 13 9" fill="currentColor" style="${flip ? 'transform:scaleX(-1)' : ''};color:var(--fg)" shape-rendering="crispEdges">${r}</svg>`;
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
  if (id === 'call') renderCall(); else camStop();
  if (id === 'clips') renderClips();
  if (id === 'music') renderMusic();
  if (id === 'reminders') renderReminders();
  if (id === 'web') renderWeb();
  if (id === 'deck') W.invoke('deck-state').then(s => { if (s) deckState = s; renderDeck(); });
});
document.addEventListener('closed', () => { camStop(); if (statsOn) { statsOn = false; W.send('stats-on', false); } $('#qr').classList.remove('on'); });
document.addEventListener('settings', () => { renderMusic(); renderClips(); renderFocus(); renderNotices(); renderWeb(); });

window.addEventListener('wyspa-init', e => {
  const d = e.detail;
  setFiles(d.files); clips = d.clips || []; renderClips(); renderNotices(); renderAgents();
  reminders = d.reminders || []; renderReminders();
  if (st.thumb) extractColor(st.thumb);
  renderMusic(); renderVol(); renderFocus(); renderCall(); renderToday();
  if (d.sys.bright) bright = d.sys.bright;
  W.invoke('calendar').then(c => { st.calendar = c || []; renderToday(); });
  renderWeb();
});
