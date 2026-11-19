/* Aura Deck — logika strony na telefonie: parowanie, Teraz, gładzik z polem tekstu, aplikacje (z edycją),
   tryby ze statystykami i karta Komputer (blokada, uśpienie, restart / wyłączenie z odliczaniem). */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const base = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
const token = (base.match(/\/d\/([^/]+)\//) || [])[1] || 'x';
const STORE = 'auraDeck:' + token;
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };
let creds = null; try { creds = JSON.parse(ls.get(STORE, null) || ls.get('wyspaDeck:' + token, null) || 'null'); } catch {} // dane sprzed zmiany nazwy też działają
let ws = null, opened = false, fails = 0, retry = null;
let hello = { name: 'Komputer', os: '', apps: [], editable: false, stats: false };

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
    if (j.status === 'approved') { creds = { id: j.id, key: j.key }; ls.set(STORE, JSON.stringify(creds)); buzz(20); showMain(); return; }
    if (j.status === 'denied') { $('#pair').classList.remove('waiting'); $('#pairMsg').textContent = 'Komputer odrzucił połączenie.'; return; }
    if (j.status === 'expired') { $('#pair').classList.remove('waiting'); $('#pairMsg').textContent = 'Prośba wygasła. Spróbuj jeszcze raz.'; return; }
  } catch {}
  pairTimer = setTimeout(poll, 1200);
}
function showPair(msg) {
  try { ws && ws.close(); } catch {} ws = null;
  creds = null; ls.del(STORE); ls.del('wyspaDeck:' + token);
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
  ws.onopen = () => { opened = true; fails = 0; setConn(true); syncStats(); };
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
const send = m => { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } toast('Brak połączenia z komputerem', true); return false; };
document.addEventListener('visibilitychange', () => { if (!document.hidden && creds && (!ws || ws.readyState > 1)) connect(); syncStats(); });

function onMsg(m) {
  switch (m.t) {
    case 'hello':
      hello = { ...hello, ...m };
      $('#pcName').textContent = $('#pcName2').textContent = m.name || 'Komputer';
      $('#pcOs').textContent = m.os || '';
      $('#editBtn').style.display = m.editable ? '' : 'none';
      renderSlots(m.apps || []);
      break;
    case 'apps': hello.apps = m.apps || []; renderSlots(hello.apps); break;
    case 'media': renderMedia(m.m); break;
    case 'stats': renderStats(m); break;
    case 'power': renderPower(m.kind ? m : null); break;
    case 'ack': toast(m.msg, !m.ok); break;
    case 'applist': renderAppList(m); break;
  }
}

// ---------- komunikat ----------
let toastT = null;
function toast(text, bad) {
  if (!text) return;
  const t = $('#toast'); t.textContent = text; t.classList.toggle('bad', !!bad); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
}

// ---------- zakładki ----------
let tab = ls.get('auraDeck:tab', 'pad');
function setTab(t) {
  if (!$(`.panel[data-panel="${t}"]`)) t = 'pad';
  tab = t; ls.set('auraDeck:tab', t);
  $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  $$('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === t));
  if (t !== 'pad') showType(false);
  syncStats();
}
$$('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
let statsOn = false;
function syncStats() {
  const want = !document.hidden && (tab === 'modes' || tab === 'pc');
  if (want === statsOn || !ws || ws.readyState !== 1) { if (!ws || ws.readyState !== 1) statsOn = false; return; }
  statsOn = want; ws.send(JSON.stringify({ t: 'stats', on: want }));
}

// ---------- przyciski: klawisze, skróty, akcje ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-k],[data-x],[data-act]'); if (!b) return;
  buzz(10);
  if (b.dataset.k) send({ t: 'k', k: b.dataset.k });
  else if (b.dataset.x) send({ t: 'x', k: b.dataset.x });
  else if (b.dataset.act) send({ t: 'act', a: b.dataset.act });
  b.classList.add('ok-flash'); setTimeout(() => b.classList.remove('ok-flash'), 180);
});

// ---------- Teraz ----------
function renderMedia(m) {
  const has = !!(m && m.title);
  $('#nowTitle').textContent = has ? m.title : 'Nic nie gra';
  $('#nowArtist').textContent = has ? (m.artist || '') : 'Włącz muzykę na komputerze';
  $('#playBtn').classList.toggle('playing', !!(m && m.playing));
  const img = $('#artImg');
  if (m && m.art && /^data:image\//.test(m.art)) { img.src = m.art; $('#art').classList.add('has'); }
  else { img.removeAttribute('src'); $('#art').classList.remove('has'); }
}

// ---------- Gładzik: pole tekstu ----------
const typebar = $('#typebar'), typeInput = $('#typeInput'), kbBtn = $('#kbBtn');
function showType(on) {
  typebar.classList.toggle('on', on); kbBtn.classList.toggle('on', on);
  if (on) setTimeout(() => typeInput.focus(), 30); else typeInput.blur();
}
kbBtn.onclick = () => { buzz(8); showType(!typebar.classList.contains('on')); };
typebar.onsubmit = e => {
  e.preventDefault();
  const t = typeInput.value;
  if (!t) { send({ t: 'k', k: 'enter' }); return; } // puste pole + Enter = Enter na komputerze
  if (send({ t: 'text', s: t })) { typeInput.value = ''; buzz(12); }
  typeInput.focus(); // klawiatura telefonu zostaje, można pisać dalej
};

// przyciski myszy: przytrzymanie = przeciąganie
$$('.mbtn').forEach(b => {
  b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); buzz(8); send({ t: 'd', b: b.dataset.btn }); };
  const up = () => { if (!b.classList.contains('on')) return; b.classList.remove('on'); send({ t: 'u', b: b.dataset.btn }); };
  b.onpointerup = up; b.onpointercancel = up;
});

// ---------- Gładzik: gesty ----------
const pad = $('#pad'), sensEl = $('#sens');
let sens = Number(ls.get('auraDeck:sens', ls.get('wyspaDeck:sens', 1.4))) || 1.4; sensEl.value = sens;
sensEl.oninput = () => { sens = Number(sensEl.value); ls.set('auraDeck:sens', sens); };
const pts = new Map();
let g = null, lastTapEnd = 0, dragArmed = false, dragging = false;
let accX = 0, accY = 0, accS = 0, accH = 0, raf = 0;
function flush() {
  raf = 0;
  if (!ws || ws.readyState !== 1) { accX = accY = accS = accH = 0; return; }
  const x = Math.trunc(accX), y = Math.trunc(accY); accX -= x; accY -= y;
  if (x || y) ws.send(JSON.stringify({ t: 'm', x, y }));
  const s = Math.trunc(accS), h = Math.trunc(accH); accS -= s; accH -= h;
  if (s || h) ws.send(JSON.stringify({ t: 's', y: s, x: h }));
}
const schedule = () => { if (!raf) raf = requestAnimationFrame(flush); };
pad.addEventListener('pointerdown', e => {
  e.preventDefault(); pad.setPointerCapture(e.pointerId); pad.classList.add('used');
  if (typebar.classList.contains('on') && document.activeElement === typeInput) typeInput.blur(); // chowa klawiaturę, pole zostaje
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
    const speed = Math.hypot(dx, dy) / dt;
    const gain = sens * 2 * (1 + Math.min(2.5, speed) * 0.85); // przyspieszenie jak w gładzikach
    accX += dx * gain; accY += dy * gain;
  } else if (pts.size === 2) {
    accS += dy * 2.2; accH += -dx * 2.2; // treść jedzie za palcami
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

// ---------- Aplikacje ----------
let editing = false, editSlot = 0, appCache = null;
function letter(name) { return (String(name || '?').trim()[0] || '?').toUpperCase(); }
function renderSlots(apps) {
  const box = $('#slots'); box.innerHTML = '';
  const list = Array.from({ length: 6 }, (_, i) => apps[i] || null);
  list.forEach((a, i) => {
    const b = document.createElement('button');
    b.className = 'slot' + (a ? '' : ' empty');
    if (a) {
      if (a.icon && /^data:image\//.test(a.icon)) { const img = document.createElement('img'); img.src = a.icon; img.alt = ''; b.append(img); }
      else { const l = document.createElement('div'); l.className = 'ltr'; l.textContent = letter(a.name); b.append(l); }
      const s = document.createElement('span'); s.textContent = a.name || 'Aplikacja'; b.append(s);
    } else {
      b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
      const s = document.createElement('span'); s.textContent = editing ? 'Dodaj' : 'Puste'; b.append(s);
    }
    b.onclick = () => {
      buzz(10);
      if (editing) return openAppSheet(i);
      if (a) { send({ t: 'launch', i }); toast(`Uruchamiam: ${a.name || 'aplikacja'}`); }
      else if (hello.editable) toast('Stuknij „Edytuj”, aby dodać aplikację');
    };
    box.append(b);
  });
}
$('#editBtn').onclick = () => {
  editing = !editing;
  $('#editBtn').classList.toggle('on', editing); $('#editBtn').textContent = editing ? 'Gotowe' : 'Edytuj';
  $('#slots').classList.toggle('edit', editing); $('#editNote').classList.toggle('on', editing);
  renderSlots(hello.apps || []);
};
function openAppSheet(i) {
  editSlot = i;
  $('#appSheetTitle').textContent = `Miejsce ${i + 1}`;
  $('#slotClear').style.display = (hello.apps || [])[i] ? '' : 'none';
  $('#appSearch').value = '';
  openSheet('#appSheet');
  if (appCache) drawAppList(); else { $('#appList').innerHTML = '<p class="note">Wczytuję aplikacje z komputera…</p>'; send({ t: 'applist' }); }
}
function renderAppList(m) {
  if (m.error) { $('#appList').innerHTML = ''; const p = document.createElement('p'); p.className = 'note'; p.textContent = m.error; $('#appList').append(p); return; }
  appCache = m.list || []; drawAppList();
}
function drawAppList() {
  const q = $('#appSearch').value.trim().toLowerCase();
  const box = $('#appList'); box.innerHTML = '';
  const items = appCache.filter(a => !q || a.name.toLowerCase().includes(q)).slice(0, 120);
  if (!items.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = q ? 'Nic nie pasuje.' : 'Nie znaleziono aplikacji w menu Start.'; box.append(p); return; }
  for (const a of items) {
    const b = document.createElement('button');
    const l = document.createElement('span'); l.className = 'ltr'; l.textContent = letter(a.name);
    const n = document.createElement('span'); n.textContent = a.name;
    b.append(l, n);
    b.onclick = () => { buzz(12); send({ t: 'setapp', i: editSlot, app: a.i }); closeSheets(); toast(`Miejsce ${editSlot + 1}: ${a.name}`); };
    box.append(b);
  }
}
$('#appSearch').oninput = () => appCache && drawAppList();
$('#slotClear').onclick = () => { send({ t: 'setapp', i: editSlot, app: null }); closeSheets(); toast(`Miejsce ${editSlot + 1} wyczyszczone`); };

// ---------- arkusze ----------
function openSheet(sel) { $('#sheetBg').classList.add('on'); $(sel).classList.add('on'); }
function closeSheets() { $('#sheetBg').classList.remove('on'); $$('.sheet').forEach(s => s.classList.remove('on')); $('#appSearch').blur(); }
$('#sheetBg').onclick = closeSheets;

// ---------- Tryby ----------
let mode = ls.get('auraDeck:mode', 'game');
function setMode(m) {
  if (!$(`.mode[data-mode="${m}"]`)) m = 'game';
  mode = m; ls.set('auraDeck:mode', m);
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $$('.mode').forEach(x => x.classList.toggle('on', x.dataset.mode === m));
}
$$('#modeSeg button').forEach(b => b.onclick = () => { buzz(8); setMode(b.dataset.mode); });

// ---------- statystyki ----------
const STATS = [['cpu', 'CPU', '%'], ['gpu', 'GPU', '%'], ['ram', 'RAM', '%'], ['temp', 'GPU °C', '°']];
$$('[data-stats]').forEach(box => {
  for (const [k, label] of STATS) {
    const d = document.createElement('div'); d.className = 'stat na'; d.dataset.k = k;
    d.innerHTML = `<small>${label}</small><b>—</b><div class="bar"><i></i></div>`;
    box.append(d);
  }
});
function renderStats(m) {
  for (const [k, , unit] of STATS) {
    const v = m[k];
    for (const el of $$(`.stat[data-k="${k}"]`)) {
      const na = v == null;
      el.classList.toggle('na', na);
      el.querySelector('b').textContent = na ? '—' : `${v}${unit === '%' ? '%' : '°'}`;
      const pct = na ? 0 : k === 'temp' ? Math.max(0, Math.min(100, (v - 30) / 65 * 100)) : Math.max(0, Math.min(100, v));
      el.querySelector('i').style.transform = `scaleX(${pct / 100})`; // transform zamiast width: bez przeliczania układu
      el.classList.toggle('hot', !na && (k === 'temp' ? v >= 80 : v >= 80));
      el.classList.toggle('crit', !na && (k === 'temp' ? v >= 90 : v >= 95));
    }
  }
}

// ---------- Komputer: zasilanie ----------
const CONFIRM = {
  sleep: ['Uśpić komputer?', 'Komputer przejdzie w stan uśpienia. Obudzisz go klawiaturą albo myszą.', 'Uśpij', false],
  restart: ['Uruchomić ponownie?', 'Komputer uruchomi się ponownie za 30 sekund. Do tego czasu możesz to anulować tutaj, a na komputerze pojawi się komunikat.', 'Uruchom ponownie', true],
  shutdown: ['Wyłączyć komputer?', 'Komputer wyłączy się za 30 sekund. Do tego czasu możesz to anulować tutaj. Niezapisana praca może przepaść.', 'Wyłącz', true],
};
let confirmAct = null;
$$('[data-power]').forEach(b => b.onclick = () => {
  buzz(10);
  const a = b.dataset.power;
  if (a === 'lock') return send({ t: 'act', a: 'lock' });
  const [title, text, yes, danger] = CONFIRM[a];
  confirmAct = a;
  $('#confirmTitle').textContent = title; $('#confirmText').textContent = text;
  $('#confirmYes').textContent = yes; $('#confirmYes').classList.toggle('danger', danger);
  openSheet('#confirmSheet');
});
$('#confirmNo').onclick = closeSheets;
$('#confirmYes').onclick = () => { if (confirmAct) send({ t: 'act', a: confirmAct }); confirmAct = null; closeSheets(); buzz(20); };

let powerTick = null;
function renderPower(p) {
  clearInterval(powerTick);
  const bar = $('#powerBar');
  if (!p) { bar.classList.remove('on'); return; }
  const label = p.kind === 'restart' ? 'Restart' : 'Wyłączenie';
  const until = Date.now() + (Number.isFinite(p.left) ? p.left : 30) * 1000; // zegar telefonu może się różnić od komputera
  const tickFn = () => {
    const s = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    $('#powerText').textContent = `${label} komputera za ${s} s`;
    if (s <= 0) { clearInterval(powerTick); bar.classList.remove('on'); }
  };
  bar.classList.add('on'); tickFn(); powerTick = setInterval(tickFn, 500);
}
$('#powerCancel').onclick = () => { buzz(20); send({ t: 'act', a: 'cancel' }); };

// ---------- start ----------
setMode(mode);
setTab(tab);
if (creds) showMain(); else showPair();
