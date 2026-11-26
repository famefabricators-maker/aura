/* Aura — własny układ widżetów i nowe widżety (zadania, notatka, minutniki, prognoza godzinowa).
   Korzysta z W, I, st, $, $$, el, txt, fmt, showAlert, closeAlert, WICON, widgetList z island.js i panels.js. */

// Układ: kolejność i widoczność z ustawień (st.S.widgets). Prawy przycisk na widżecie: menu z wyborem i kolejnością.
function layoutWidgets() {
  const list = widgetList();
  $$('.wgrid .w[data-w]').forEach(w => { const i = list.indexOf(w.dataset.w); w.classList.toggle('off', i < 0); w.style.order = i < 0 ? 99 : i; });
  $('.wgrid').classList.toggle('many', list.length > 4);
  if (list.includes('forecast')) renderForecast();
}
document.addEventListener('settings', layoutWidgets);
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
W.on('weather', () => renderForecast());
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
