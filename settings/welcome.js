/* Wprowadzenie: kilka kart przy pierwszym uruchomieniu (i później z Ustawienia → Informacje).
   Korzysta z globalnych W, I, S, set() i render() z settings.js. */
window.Welcome = (() => {
  const mac = /mac/i.test(navigator.platform);
  const key = a => String(a || '').split('+').map(k => ({ Control: 'Ctrl', CommandOrControl: mac ? '⌘' : 'Ctrl', Command: '⌘', Alt: mac ? '⌥' : 'Alt', Shift: '⇧', Super: 'Win' }[k] || k));
  const caps = a => key(a).map(k => `<kbd>${k}</kbd>`).join('');
  const where = () => (S.edge === 'bottom' ? L('dolnej', 'bottom') : L('górnej', 'top'));

  // każda karta: ikona/ilustracja, tytuł, opis, opcjonalnie dodatki (html) i akcje po wyrenderowaniu
  const slides = () => [
    {
      art: `<div class="wl-island"><div class="wl-pill"><i class="wl-cover"></i><span class="wl-bars"><b></b><b></b><b></b><b></b></span></div></div>`,
      t: L('Witaj w Aurze', 'Welcome to Aura'),
      d: L('Aura to wyspa przy krawędzi ekranu: muzyka, powiadomienia, schowek, pliki i skróty w jednym miejscu — zawsze pod ręką, nigdy na drodze.', 'Aura is an island at the edge of your screen: music, notifications, clipboard, files and shortcuts in one place — always at hand, never in the way.'),
    },
    {
      art: `<div class="wl-island hover"><div class="wl-pill"></div><i class="wl-cursor"></i></div>`,
      t: L('Najedź, żeby otworzyć', 'Hover to open'),
      d: L(`Zatrzymaj kursor na wyspie przy ${where()} krawędzi ekranu — rozwinie się w kartę. Zjedź kursorem, a sama się zwinie. Karty przełączasz ikonami u góry wyspy.`, `Rest the cursor on the island at the ${where()} edge of the screen — it expands into a card. Move the cursor away and it folds back by itself. Switch cards with the icons at the top of the island.`),
      x: L(`<ul class="wl-tips"><li><b>Kółko myszy</b> na zwiniętej wyspie zmienia głośność</li><li><b>Przesunięcie w bok</b> (gładzik albo Shift + kółko) przełącza utwór</li><li>${caps('Control+Shift+1')} … ${caps('Control+Shift+6')} otwiera od razu daną kartę</li></ul>`, `<ul class="wl-tips"><li><b>Mouse wheel</b> on the closed island changes the volume</li><li><b>Sideways swipe</b> (touchpad or Shift + wheel) switches the track</li><li>${caps('Control+Shift+1')} … ${caps('Control+Shift+6')} opens that card straight away</li></ul>`),
    },
    {
      icon: 'music', t: L('Muzyka w zasięgu ręki', 'Music at your fingertips'),
      d: L('Co gra w Spotify, przeglądarce czy innym odtwarzaczu — okładka, sterowanie, przewijanie i głośność. Po zmianie utworu wyspa na chwilę pokazuje tytuł, a tekst piosenki może lecieć na żywo obok okładki.', 'Whatever plays in Spotify, a browser or another player — cover, controls, seeking and volume. After a track change the island briefly shows the title, and song lyrics can run live next to the cover.'),
    },
    {
      icon: 'shelf', t: L('Półka i schowek', 'Shelf and clipboard'),
      d: L('Przeciągnij pliki na wyspę, żeby odłożyć je na półkę i później przeciągnąć dalej. Schowek pamięta ostatnio skopiowane teksty i obrazy, a w karcie z siatką masz zrzut ekranu, wycinek i nagrywanie.', 'Drag files onto the island to put them on the shelf and drag them on later. The clipboard remembers recently copied text and images, and the grid card has screenshot, snip and recording.'),
    },
    ...(mac ? [] : [{
      icon: 'grid', t: L('Pasek zadań w stylu Maca', 'A Mac-style taskbar'),
      d: L('Aura może zastąpić pasek zadań Windows: ciemny dok z aplikacjami, ikonami przy zegarze i grającą muzyką, który chowa się pod oknami i wysuwa, gdy dojedziesz kursorem do dołu ekranu.', 'Aura can replace the Windows taskbar: a dark dock with your apps, tray icons and the current music, which hides under windows and slides up when you move the cursor to the bottom of the screen.'),
      x: L(`<p class="wl-small">Włączysz go w Ustawieniach → Pasek zadań. Pasek Windows wraca sam po wyłączeniu albo zamknięciu Aury.</p>`, `<p class="wl-small">Turn it on in Settings → Taskbar. The Windows taskbar comes back by itself when you turn it off or close Aura.</p>`),
    }]),
    {
      icon: 'agent', t: L('Skróty klawiszowe', 'Keyboard shortcuts'),
      d: L('Najważniejsze rzeczy bez szukania myszą. Każdy skrót zmienisz w Ustawieniach → Skróty.', 'The most important things without hunting with the mouse. Change any shortcut in Settings → Shortcuts.'),
      x: (() => {
        const h = S.hotkeys || {}, rows = [['open', L('Otwórz / zamknij wyspę', 'Open / close the island')], ['playPause', L('Odtwórz / wstrzymaj', 'Play / pause')], ['micMute', L('Wycisz mikrofon wszędzie', 'Mute the microphone everywhere')], ['screenshot', L('Zrzut ekranu', 'Screenshot')], ['colorPick', L('Kolor spod kursora', 'Colour under the cursor')]].filter(([k]) => h[k]);
        return rows.length ? `<div class="wl-keys">${rows.map(([k, l]) => `<div><span>${l}</span><span>${caps(h[k])}</span></div>`).join('')}</div>` : '';
      })(),
    },
    {
      icon: 'gear', t: L('Gdzie ma być wyspa?', 'Where should the island be?'),
      d: L(`Wybierz krawędź — zmienisz to w każdej chwili. Ustawienia otworzysz zawsze z ikony Aury ${mac ? 'na pasku menu' : 'przy zegarze (strzałka ^ w zasobniku)'}.`, `Choose an edge — you can change it any time. Settings are always one click away on the Aura icon ${mac ? 'in the menu bar' : 'next to the clock (the ^ arrow in the tray)'}.`),
      x: L(`<div class="wl-edge"><button data-edge="top"><i class="e top"></i>Na górze</button><button data-edge="bottom"><i class="e bottom"></i>Na dole</button></div>`, `<div class="wl-edge"><button data-edge="top"><i class="e top"></i>At the top</button><button data-edge="bottom"><i class="e bottom"></i>At the bottom</button></div>`),
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
    root.querySelector('.wl-next').textContent = i === list.length - 1 ? L('Zaczynamy', 'Let’s go') : L('Dalej', 'Next');
    root.querySelector('.wl-skip').style.visibility = i === list.length - 1 ? 'hidden' : 'visible';
  }
  function go(d) { const n = i + d; if (n < 0) return; if (n >= list.length) return close(); i = n; draw(d); }
  function close() {
    if (!root) return;
    W.send('welcome-done'); // przejrzane lub zamknięte — więcej się samo nie pokaże
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
    root.innerHTML = L(`<div class="wl-card"><div class="wl-art"></div><h1></h1><p class="wl-d"></p><div class="wl-x"></div></div>
      <div class="wl-foot"><button class="wl-skip">Pomiń</button><div class="wl-dots"></div><div class="wl-nav"><button class="wl-back" aria-label="Wstecz">Wstecz</button><button class="wl-next"></button></div></div>`, `<div class="wl-card"><div class="wl-art"></div><h1></h1><p class="wl-d"></p><div class="wl-x"></div></div>
      <div class="wl-foot"><button class="wl-skip">Skip</button><div class="wl-dots"></div><div class="wl-nav"><button class="wl-back" aria-label="Back">Back</button><button class="wl-next"></button></div></div>`);
    document.body.append(root);
    root.querySelector('.wl-next').onclick = () => go(1);
    root.querySelector('.wl-back').onclick = () => go(-1);
    root.querySelector('.wl-skip').onclick = close;
    document.addEventListener('keydown', onKey, true);
    addEventListener('beforeunload', () => { if (root) W.send('welcome-done'); }, { once: true }); // zamknięcie okna krzyżykiem też się liczy
    draw(1);
  }
  return { open, close };
})();
