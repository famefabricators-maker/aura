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

// klikalny jest tylko sam pasek — reszta okna przepuszcza mysz do okien pod spodem
dock.addEventListener('mouseenter', () => W.send('dock-hover', true));
dock.addEventListener('mouseleave', () => { W.send('dock-hover', false); unmagnify(); });

function render() {
  document.documentElement.style.setProperty('--s', S.size);
  if (S.accent) document.documentElement.style.setProperty('--accent', S.accent);
  h12 = !!S.h12;
  dock.classList.toggle('hidden', !!S.hidden);
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
  const m = S.media, np = $('#np');
  np.classList.toggle('on', !!(m && m.has));
  if (m && m.has) {
    $('#npTitle').textContent = m.title || ''; $('#npArtist').textContent = m.artist || ''; np.title = `${m.title || ''} — ${m.artist || ''}`;
    const art = $('#npArt'); if (m.thumb) { if (art.getAttribute('src') !== m.thumb) art.src = m.thumb; $('#npIco').style.display = 'none'; } else { art.removeAttribute('src'); $('#npIco').style.display = ''; }
    $('#npPlay').innerHTML = I.svg(m.playing ? 'pause' : 'play');
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
  $('#cTime').textContent = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', hour12: h12 });
  $('#cDate').textContent = d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
