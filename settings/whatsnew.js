/* „Co nowego”: po aktualizacji Aura otwiera ustawienia z tym okienkiem (strona ?page=whatsnew:<poprzednia wersja>).
   Pokazuje zmiany ze wszystkich wersji nowszych od poprzedniej; z Ustawienia → Informacje — kilka ostatnich wersji.
   Korzysta z wyglądu wprowadzenia (.welcome) i z globalnych W, I z settings.js. */
window.WhatsNew = (() => {
  const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  let root = null;
  function close() {
    if (!root) return;
    const r = root; root = null; r.classList.add('out'); document.removeEventListener('keydown', onKey, true);
    setTimeout(() => r.remove(), 260);
  }
  function onKey(e) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); } }
  // from: poprzednia wersja (pokaż wszystko nowsze); bez niej — ostatnie 3 wersje
  function open(from) {
    const all = window.AURA_CHANGES || [];
    let list = from ? all.filter(c => newer(c.v, from)) : all.slice(0, 3);
    if (!list.length) list = all.slice(0, 1);
    if (!list.length || root) return;
    root = document.createElement('div'); root.className = 'welcome whatsnew';
    const card = document.createElement('div'); card.className = 'wl-card wn-card in-r';
    card.innerHTML = `<div class="wn-head"><div class="wl-ico">${I.svg('note')}</div><div><div class="wn-kicker"></div><h1></h1></div></div><div class="wn-body"></div>`;
    card.querySelector('.wn-kicker').textContent = from ? L('Aura się zaktualizowała', 'Aura was updated') : L('Ostatnie zmiany', 'Recent changes');
    card.querySelector('h1').textContent = L(`Co nowego w ${list[0].v}`, `What’s new in ${list[0].v}`);
    const body = card.querySelector('.wn-body');
    for (const c of list) {
      const sec = document.createElement('section');
      if (list.length > 1) { const h = document.createElement('h2'); h.textContent = c.v; const d = document.createElement('small'); d.textContent = new Date(c.date).toLocaleDateString(LOC, { day: 'numeric', month: 'long' }); h.append(d); sec.append(h); }
      const ul = document.createElement('ul'); ul.className = 'wn-list';
      for (const t of (LANG === 'en' ? c.en : c.pl) || []) { const li = document.createElement('li'); li.textContent = t; ul.append(li); }
      sec.append(ul); body.append(sec);
    }
    const foot = document.createElement('div'); foot.className = 'wl-foot wn-foot';
    const all_ = document.createElement('button'); all_.className = 'wl-skip'; all_.textContent = L('Wszystkie wydania ↗', 'All releases ↗');
    all_.onclick = () => W.send('open-uri', 'https://github.com/famefabricators-maker/aura/releases');
    const ok = document.createElement('button'); ok.className = 'wl-next'; ok.textContent = L('Super', 'Great'); ok.onclick = close;
    const nav = document.createElement('div'); nav.className = 'wl-nav'; nav.append(ok);
    foot.append(all_, document.createElement('span'), nav);
    root.append(card, foot); document.body.append(root);
    if (from) W.send('whatsnew-seen'); // po aktualizacji: pokazane — Aura zapamięta wersję
    document.addEventListener('keydown', onKey, true);
    ok.focus();
  }
  return { open, close };
})();
