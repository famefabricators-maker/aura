/* Aura — własny układ widżetów i nowe widżety (zadania, notatka, minutniki, prognoza godzinowa).
   Korzysta z W, I, st, $, $$, el, txt, fmt, showAlert, closeAlert, WICON, widgetList z island.js i panels.js. */

// Układ: kolejność i widoczność z ustawień (st.S.widgets). Prawy przycisk na widżecie: menu z wyborem i kolejnością.
function layoutWidgets() {
  const list = widgetList();
  $$('.wgrid .w[data-w]').forEach(w => { const i = list.indexOf(w.dataset.w); w.classList.toggle('off', i < 0); w.style.order = i < 0 ? 99 : i; });
  $('.wgrid').classList.toggle('many', list.length > 4);
  if (list.includes('forecast')) renderForecast();
  requestAnimationFrame(placeRem);
  if (list.includes('brief')) renderBrief();
  if (list.includes('agenda')) renderAgenda();
}
document.addEventListener('settings', layoutWidgets);
// Przycisk przypomnień stoi na skrzyżowaniu czterech kafelków; przy szerokich widżetach takiego miejsca może nie być —
// wtedy w prawym dolnym rogu siatki (wcześniej wchodził na środek kafelka)
function placeRem() {
  const g = $('.wgrid'), rem = $('#wRem'); if (!g || !rem) return;
  const rows = new Map();
  for (const t of g.querySelectorAll('.w[data-w]:not(.off)')) { const k = t.offsetTop; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(t); }
  const keys = [...rows.keys()].sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) if (rows.get(keys[i]).length === 2 && rows.get(keys[i + 1]).length === 2) { rem.classList.remove('corner'); rem.style.top = (keys[i + 1] - 4) + 'px'; return; }
  // w pustym rogu szerokiego widżetu (najlepiej „Dzień w skrócie”), inaczej w prawym dolnym rogu siatki
  const host = g.querySelector('.w.agenda:not(.off)') || g.querySelector('.w.wide:not(.off)');
  rem.classList.add('corner'); rem.style.top = host ? (host.offsetTop + host.offsetHeight - 46) + 'px' : (g.clientHeight - 46) + 'px';
}
$('.wgrid').addEventListener('contextmenu', e => {
  if (e.target.closest('input, textarea')) return;
  e.preventDefault(); const w = e.target.closest('[data-w]'); W.send('widgets-menu', w ? w.dataset.w : '');
});

// --- zadania
let todos = [];
function renderTodos() {
  const box = $('#tdList'); box.textContent = '';
  if (!todos.length) { box.append(txt('small', 'tm-empty', L('Brak zadań', 'No tasks'))); return; }
  todos.forEach((t, i) => {
    const r = el('div', 'td-item' + (t.d ? ' done' : '')); r.append(el('i'), txt('span', '', t.t));
    const x = el('button', '', I.svg('x')); x.title = L('Usuń', 'Remove'); x.onclick = e => { e.stopPropagation(); todos.splice(i, 1); saveTodos(); };
    r.append(x); r.onclick = () => { t.d = !t.d; saveTodos(); }; box.append(r);
  });
}
function saveTodos() { W.send('notes-set', { todos }); renderTodos(); }
$('#tdNew').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return; const v = e.target.value.trim(); if (!v) return;
  todos.unshift({ t: v.slice(0, 120), d: false }); todos = todos.slice(0, 50); e.target.value = ''; saveTodos();
});

// --- notatka
let noteTimer = 0;
$('#ntText').addEventListener('input', e => { clearTimeout(noteTimer); noteTimer = setTimeout(() => W.send('notes-set', { notes: e.target.value }), 500); });
W.invoke('notes').then(d => {
  todos = Array.isArray(d && d.todos) ? d.todos.filter(t => t && typeof t.t === 'string') : [];
  $('#ntText').value = (d && typeof d.notes === 'string') ? d.notes : '';
  renderTodos();
});

// --- minutniki (kilka naraz)
const timers = [];
for (const m of [1, 5, 10, 25]) {
  const b = txt('button', '', `+${m}`); b.title = `Minutnik ${m} min`;
  b.onclick = () => { timers.push({ end: Date.now() + m * 60e3, m }); renderTimers(); };
  $('#tmAdd').append(b);
}
function renderTimers() {
  const box = $('#tmList'); box.textContent = '';
  if (!timers.length) { box.append(txt('small', 'tm-empty', L('Dodaj minutnik', 'Add a timer'))); return; }
  timers.sort((a, b) => a.end - b.end).forEach((t, i) => {
    const r = el('div', 'tm-item'); r.append(txt('b', '', fmt(Math.ceil((t.end - Date.now()) / 1000))), txt('small', '', `${t.m} min`));
    const x = el('button', '', I.svg('x')); x.title = L('Usuń', 'Remove'); x.onclick = () => { timers.splice(i, 1); renderTimers(); };
    r.append(x); box.append(r);
  });
}
setInterval(() => {
  if (!timers.length) return;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].end <= Date.now()) {
    const t = timers.splice(i, 1)[0];
    showAlert({ icon: 'clock', title: L('Minutnik', 'Timer'), body: L(`Minęło ${t.m} min`, `${t.m} min passed`), actions: [{ label: 'OK', accent: true, fn: () => closeAlert() }] });
  }
  if (st.open && st.tab === 'widgets') renderTimers();
}, 1000);
renderTimers();

// --- prognoza godzinowa (z tej samej pogody co widżet Pogoda)
function renderForecast() {
  const box = $('#wForecast'); box.textContent = '';
  const w = st.weather;
  if (!w || w.error || !Array.isArray(w.hours) || !w.hours.length) { box.append(txt('small', '', w && w.error ? L('Pogoda niedostępna', 'Weather unavailable') : L('Pobieram prognozę…', 'Getting the forecast…'))); return; }
  box.append(txt('small', '', L(`Najbliższe godziny${w.place ? ' · ' + w.place : ''}`, `Next hours${w.place ? ' · ' + w.place : ''}`)));
  const row = el('div', 'fc-row');
  for (const h of w.hours.slice(0, 6)) {
    const c = el('div', 'fc-h'); c.append(txt('small', '', h.h), el('span', 'ico', I.svg(WICON(h.code))), txt('b', '', `${h.temp}°`)); row.append(c);
  }
  box.append(row);
}
W.on('weather', () => { renderForecast(); renderBrief(); });

// --- Pogoda w skrócie: jednym zdaniem, czy dziś cieplej czy zimniej niż wczoraj, i pory dnia (dziś / wczoraj)
const deg = v => `${v < 0 ? '−' : ''}${Math.abs(v)}°`; // prawdziwy minus — w czcionce o stałej szerokości równo z cyframi
const SKY = c => c == null ? '' : c <= 1 ? L('Będzie słonecznie.', 'It will be sunny.') : c === 2 ? L('Będzie trochę chmur.', 'It will be partly cloudy.') : c === 3 ? L('Będzie pochmurno.', 'It will be cloudy.')
  : c <= 48 ? L('Będzie mgliście.', 'It will be foggy.') : c <= 57 ? L('Będzie mżyć.', 'It will drizzle.') : c <= 67 || (c >= 80 && c <= 82) ? L('Będzie padać.', 'It will rain.')
  : c <= 86 ? L('Będzie padać śnieg.', 'It will snow.') : L('Będą burze.', 'There will be storms.');
function renderBrief() {
  const box = $('#wBrief'); if (!box || !widgetList().includes('brief')) return;
  box.textContent = '';
  const w = st.weather, b = w && w.brief;
  if (!w || w.error || !b || !b.parts.length) { box.append(txt('div', 'bf-head', w && w.error ? L('Pogoda niedostępna.', 'Weather unavailable.') : L('Pobieram pogodę…', 'Getting the weather…'))); return; }
  const d = b.diff, kind = d == null ? 'same' : d <= -1 ? 'cold' : d >= 1 ? 'warm' : 'same';
  const word = { cold: L('ZIMNIEJ', 'COLDER'), warm: L('CIEPLEJ', 'WARMER'), same: L('PODOBNIE', 'ABOUT THE SAME') }[kind];
  const head = el('div', 'bf-head'), l1 = el('div');
  l1.append(document.createTextNode(L('Dziś jest ', 'Today is ')), txt('b', kind, word), document.createTextNode(kind === 'same' ? L(' jak wczoraj.', ' as yesterday.') : L(' niż wczoraj.', ' than yesterday.')));
  head.append(l1, txt('div', 'bf-sky', SKY(b.code)));
  head.title = w.place || '';
  const parts = el('div', 'bf-parts');
  const NAMES = { 8: L('Rano', 'Morning'), 13: L('Południe', 'Noon'), 18: L('Wieczór', 'Evening'), 22: L('Noc', 'Night') };
  for (const p of b.parts) {
    const c = el('div', 'bf-p'); const t = el('b'); t.append(document.createTextNode(deg(p.temp)), el('span', 'ico', I.svg(WICON(p.code))));
    if (p.was != null) t.append(txt('i', '', `${p.temp < p.was ? '↓' : p.temp > p.was ? '↑' : '='}${deg(p.was)}`)); // wczoraj o tej porze
    c.append(txt('small', '', NAMES[p.h] || `${p.h}:00`), t);
    c.title = p.was != null ? L(`Wczoraj o ${p.h}:00: ${deg(p.was)}`, `Yesterday at ${p.h}:00: ${deg(p.was)}`) : '';
    parts.append(c);
  }
  box.append(head, parts);
}

// --- Dzień w skrócie: data i najbliższe wydarzenia z kalendarza, sam tekst
function renderAgenda() {
  const box = $('#wAgenda'); if (!box || !widgetList().includes('agenda')) return;
  box.textContent = '';
  const now = new Date(), day = now.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' });
  box.append(txt('div', 'ag-date', day));
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const evs = (st.calendar || []).filter(e => e.end > Date.now()).sort((a, b) => a.start - b.start);
  const today = evs.filter(e => e.start <= end.getTime()).slice(0, 3);
  const list = el('div', 'ag-list');
  const time = e => e.allDay ? L('cały dzień', 'all day') : new Date(e.start).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit', hour12: st.S.timeFormat === '12' });
  if (today.length) for (const e of today) { const r = el('div', 'ag-ev' + (e.start <= Date.now() ? ' now' : '')); r.append(txt('b', '', e.start <= Date.now() && !e.allDay ? L('teraz', 'now') : time(e)), txt('span', '', e.title || L('(bez tytułu)', '(untitled)'))); list.append(r); }
  else {
    list.append(txt('div', 'ag-none', st.S.calendarIcs ? L('Dziś nic w kalendarzu.', 'Nothing on the calendar today.') : L('Podłącz kalendarz w Ustawieniach → Widżety.', 'Connect a calendar in Settings → Widgets.')));
    const next = evs[0];
    if (next) { const r = el('div', 'ag-ev'); r.append(txt('b', '', new Date(next.start).toLocaleDateString(LOC, { weekday: 'short' })), txt('span', '', `${time(next)} · ${next.title || ''}`)); list.append(r); }
  }
  box.append(list);
}
W.on('calendar', () => renderAgenda());
document.addEventListener('settings', () => { renderBrief(); renderAgenda(); });
setInterval(() => { if (st.open && st.tab === 'widgets') renderAgenda(); }, 60e3);
document.addEventListener('tab', e => { if (e.detail === 'widgets') { renderBrief(); renderAgenda(); requestAnimationFrame(placeRem); } });
layoutWidgets();

// --- limity Claude na karcie Agenci (gdy włączone w Ustawieniach → Agenci AI)
function resetText(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const today = d.toDateString() === new Date().toDateString();
  return 'reset ' + (today ? '' : d.toLocaleDateString(LOC, { weekday: 'short' }) + ' ') + d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
}
W.on('ai-usage', u => {
  const box = $('#aUsage'); box.textContent = '';
  if (!u) return;
  if (u.error) { box.append(txt('span', 'err', `Limity Claude: ${u.error}`)); return; }
  for (const [label, x] of [['5 godzin', u.five], [L('Tydzień', 'Week'), u.week]]) {
    if (!x) continue;
    const c = el('div', 'u'); const head = el('div'); head.append(txt('b', '', `${label}: ${x.pct}%`), document.createTextNode(x.reset ? ` · ${resetText(x.reset)}` : ''));
    const bar = el('div', 'bar'); const fill = el('i', x.pct >= 80 ? 'hi' : ''); fill.style.width = Math.min(100, x.pct) + '%'; bar.append(fill);
    c.append(head, bar); box.append(c);
  }
});
document.addEventListener('settings', () => { if (st.S.claudeUsage) W.send('ai-usage-refresh'); });
W.send('ai-usage-refresh');
