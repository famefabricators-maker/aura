/* Wprowadzenie: kilka kart przy pierwszym uruchomieniu (i później z Ustawienia → Informacje).
   Korzysta z globalnych W, I, S, set() i render() z settings.js. */
window.Welcome = (() => {
  const mac = /mac/i.test(navigator.platform);
  const key = a => String(a || '').split('+').map(k => ({ Control: 'Ctrl', CommandOrControl: mac ? '⌘' : 'Ctrl', Command: '⌘', Alt: mac ? '⌥' : 'Alt', Shift: '⇧', Super: 'Win' }[k] || k));
  const caps = a => key(a).map(k => `<kbd>${k}</kbd>`).join('');
  const where = () => (S.edge === 'bottom' ? 'dolnej' : 'górnej');

  // każda karta: ikona/ilustracja, tytuł, opis, opcjonalnie dodatki (html) i akcje po wyrenderowaniu
  const slides = () => [
    {
      art: `<div class="wl-island"><div class="wl-pill"><i class="wl-cover"></i><span class="wl-bars"><b></b><b></b><b></b><b></b></span></div></div>`,
      t: 'Witaj w Aurze',
      d: 'Aura to wyspa przy krawędzi ekranu: muzyka, powiadomienia, schowek, pliki i skróty w jednym miejscu — zawsze pod ręką, nigdy na drodze.',
    },
    {
      art: `<div class="wl-island hover"><div class="wl-pill"></div><i class="wl-cursor"></i></div>`,
      t: 'Najedź, żeby otworzyć',
      d: `Zatrzymaj kursor na wyspie przy ${where()} krawędzi ekranu — rozwinie się w kartę. Zjedź kursorem, a sama się zwinie. Karty przełączasz ikonami u góry wyspy.`,
      x: `<ul class="wl-tips"><li><b>Kółko myszy</b> na zwiniętej wyspie zmienia głośność</li><li><b>Przesunięcie w bok</b> (gładzik albo Shift + kółko) przełącza utwór</li><li>${caps('Control+Shift+1')} … ${caps('Control+Shift+6')} otwiera od razu daną kartę</li></ul>`,
    },
    {
      icon: 'music', t: 'Muzyka w zasięgu ręki',
      d: 'Co gra w Spotify, przeglądarce czy innym odtwarzaczu — okładka, sterowanie, przewijanie i głośność. Po zmianie utworu wyspa na chwilę pokazuje tytuł, a tekst piosenki może lecieć na żywo obok okładki.',
    },
    {
      icon: 'shelf', t: 'Półka i schowek',
      d: 'Przeciągnij pliki na wyspę, żeby odłożyć je na półkę i później przeciągnąć dalej. Schowek pamięta ostatnio skopiowane teksty i obrazy, a w karcie z siatką masz zrzut ekranu, wycinek i nagrywanie.',
    },
    ...(mac ? [] : [{
      icon: 'grid', t: 'Pasek zadań w stylu Maca',
      d: 'Aura może zastąpić pasek zadań Windows: ciemny dok z aplikacjami, ikonami przy zegarze i grającą muzyką, który chowa się pod oknami i wysuwa, gdy dojedziesz kursorem do dołu ekranu.',
      x: `<p class="wl-small">Włączysz go w Ustawieniach → Pasek zadań. Pasek Windows wraca sam po wyłączeniu albo zamknięciu Aury.</p>`,
    }]),
    {
      icon: 'agent', t: 'Skróty klawiszowe',
      d: 'Najważniejsze rzeczy bez szukania myszą. Każdy skrót zmienisz w Ustawieniach → Skróty.',
      x: (() => {
        const h = S.hotkeys || {}, rows = [['open', 'Otwórz / zamknij wyspę'], ['playPause', 'Odtwórz / wstrzymaj'], ['micMute', 'Wycisz mikrofon wszędzie'], ['screenshot', 'Zrzut ekranu'], ['colorPick', 'Kolor spod kursora']].filter(([k]) => h[k]);
        return rows.length ? `<div class="wl-keys">${rows.map(([k, l]) => `<div><span>${l}</span><span>${caps(h[k])}</span></div>`).join('')}</div>` : '';
      })(),
    },
    {
      icon: 'gear', t: 'Gdzie ma być wyspa?',
      d: `Wybierz krawędź — zmienisz to w każdej chwili. Ustawienia otworzysz zawsze z ikony Aury ${mac ? 'na pasku menu' : 'przy zegarze (strzałka ^ w zasobniku)'}.`,
      x: `<div class="wl-edge"><button data-edge="top"><i class="e top"></i>Na górze</button><button data-edge="bottom"><i class="e bottom"></i>Na dole</button></div>`,
      after: box => {
        const mark = () => box.querySelectorAll('[data-edge]').forEach(b => b.classList.toggle('on', (S.edge || 'top') === b.dataset.edge));
        box.querySelectorAll('[data-edge]').forEach(b => b.onclick = async () => { await set({ edge: b.dataset.edge }); mark(); });
        mark();
      },
    },
  ];

  let i = 0, list = [], root = null;
  function draw(dir) {
    const s = list[i], card = root.querySelector('.wl-card');
    card.classList.remove('in-l', 'in-r'); void card.offsetWidth; card.classList.add(dir < 0 ? 'in-l' : 'in-r');
    card.querySelector('.wl-art').innerHTML = s.art || `<div class="wl-ico">${I.svg(s.icon)}</div>`;
    card.querySelector('h1').textContent = s.t;
    card.querySelector('.wl-d').textContent = s.d;
    const x = card.querySelector('.wl-x'); x.innerHTML = s.x || '';
    if (s.after) s.after(x);
    root.querySelector('.wl-dots').innerHTML = list.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    root.querySelector('.wl-back').style.visibility = i ? 'visible' : 'hidden';
    root.querySelector('.wl-next').textContent = i === list.length - 1 ? 'Zaczynamy' : 'Dalej';
    root.querySelector('.wl-skip').style.visibility = i === list.length - 1 ? 'hidden' : 'visible';
  }
  function go(d) { const n = i + d; if (n < 0) return; if (n >= list.length) return close(); i = n; draw(d); }
  function close() {
    if (!root) return;
    root.classList.add('out'); document.removeEventListener('keydown', onKey, true);
    setTimeout(() => { root && root.remove(); root = null; }, 260);
  }
  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }
  function open() {
    if (root) return;
    list = slides(); i = 0;
    root = document.createElement('div'); root.className = 'welcome';
    root.innerHTML = `<div class="wl-card"><div class="wl-art"></div><h1></h1><p class="wl-d"></p><div class="wl-x"></div></div>
      <div class="wl-foot"><button class="wl-skip">Pomiń</button><div class="wl-dots"></div><div class="wl-nav"><button class="wl-back" aria-label="Wstecz">Wstecz</button><button class="wl-next"></button></div></div>`;
    document.body.append(root);
    root.querySelector('.wl-next').onclick = () => go(1);
    root.querySelector('.wl-back').onclick = () => go(-1);
    root.querySelector('.wl-skip').onclick = close;
    document.addEventListener('keydown', onKey, true);
    draw(1);
  }
  return { open, close };
})();
