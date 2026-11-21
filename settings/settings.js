/* Aura — okno ustawień, generowane ze schematu. Każda zmiana działa od razu. */
const W = window.wyspa, T = window.WYSPA_THEME, I = window.ICONS;
const $ = s => document.querySelector(s);
let S = {}, page = new URLSearchParams(location.search).get('page') || 'look', query = '', hkErrors = [], claude = 'disconnected', codex = 'disconnected', glassReady = '';
// opcje, które działają tylko na Windowsie — na Macu ich nie pokazujemy
const MAC = W.platform === 'darwin';
const WIN_ONLY = new Set(['appNotifications', 'slimCovered', 'hideInFullscreen', 'gamerOverlay', 'hudBrightness', 'hudLockKeys', 'hudDevice', 'hudMic',
  'privacyDot', 'callTimer', 'tabDeck', 'colorPick', 'liveWallpaper', 'edge', 'position', 'edgeMargin', 'shape', 'topGap']);
const hiddenRow = r => MAC && (WIN_ONLY.has(r.key) || r.h === 'Gry' || r.h === 'Umiejscowienie');
const hiddenPage = p => MAC && (p.id === 'wallpaper' || p.id === 'taskbar');
document.body.classList.toggle('mac', MAC);
W.on('settings-pos', p => GlassBg.setPos(p));
W.on('cursor', c => GlassBg.cursor(c));
W.on('settings-focus', f => GlassBg.setFocus(f));

const seg = (key, label, desc, options, extra = {}) => ({ type: 'seg', key, label, desc, options, ...extra });
const tog = (key, label, desc, extra = {}) => ({ type: 'toggle', key, label, desc, ...extra });
const sld = (key, label, desc, min, max, unit, extra = {}) => ({ type: 'slider', key, label, desc, min, max, unit, ...extra });
const ALTGR = /^Control\+Alt\+(A|C|E|L|N|O|S|X|Z)$|Control\+Alt\+Shift\+(A|C|E|L|N|O|S|X|Z)$/;

const PAGES = [
  { id: 'general', icon: 'gear', name: 'Ogólne', rows: [
    tog('autostart', 'Uruchamiaj razem z Windows', 'Aura startuje po zalogowaniu.'),
    tog('slimCovered', 'Wąski pasek pod zmaksymalizowanymi oknami', 'Gdy okno zasłania górę ekranu, wyspa zwija się do cienkiej linii i nie zasłania kart przeglądarki. Najedź na nią kursorem, żeby ją otworzyć.'),
    seg('openOn', 'Gdy wyspa się otwiera', 'Ostatnia karta pamięta też po restarcie. „Muzyka” pokazuje widżety, gdy nic nie gra.', [['last', 'Ostatnia karta'], ['music', 'Muzyka']]),
    tog('hideInFullscreen', 'Ukrywaj nad grami i filmami na pełnym ekranie', 'Przypomnienia i tak się pokażą.'),
    { h: 'Gry' },
    tog('gamerOverlay', 'Pasek dla graczy', 'Nad grą pełnoekranową zamiast ukrywać wyspę pokazuje wąski pasek: CPU, GPU z temperaturą, RAM, sieć i godzinę. Gra musi być w trybie pełny ekran bez ramki albo w oknie.'),
  ] },
  { id: 'access', icon: 'focus', name: 'Ułatwienia dostępu', rows: [
    { h: 'Ruch i czas' },
    seg('reduceMotion', 'Ogranicz ruch', 'Wyspa otwiera się i zamyka bez sprężynowania.', [['system', 'Tak jak Windows'], ['on', 'Wł.'], ['off', 'Wył.']]),
    tog('longerNotices', 'Pokazuj powiadomienia dłużej', 'Baner zostaje na wyspie dwa razy dłużej.'),
  ] },
  { id: 'look', icon: 'palette', name: 'Wygląd', preview: true, rows: [
    { h: 'Powierzchnia' },
    { type: 'surfaces', key: 'surface', label: 'Powierzchnia', desc: 'Szkło na żywo rozmywa i załamuje to, co jest za wyspą. Motywy Tatry, Noc i Bursztyn mają własny akcent i delikatną animację.' },
    sld('glassBlur', 'Rozmycie szkła', 'Środek to wygląd domyślny.', 0, 100, '%', { when: s => s.surface === 'glass' }),
    { type: 'accents', key: 'accent', label: 'Kolor akcentu', desc: 'Wizualizator, paski, kropki stanu, przyciski.' },
    { h: 'Kształt' },
    seg('shape', 'Kształt', 'Notch zwisa z górnej krawędzi. Wyspa unosi się tuż pod nią.', [['island', 'Wyspa'], ['notch', 'Notch']]),
    sld('topGap', 'Odległość od góry', 'Tylko dla kształtu Wyspa.', 0, 48, ' px', { when: s => s.shape === 'island' }),
    sld('roundness', 'Narożniki', 'Od kwadratowych po w pełni zaokrąglone.', 0, 100, '%'),
    sld('size', 'Rozmiar', 'Pigułka, komunikaty i tekst.', 70, 150, '%'),
    sld('openSize', 'Rozmiar po otwarciu', 'Tylko otwarta karta.', 70, 150, '%'),
    { h: 'W spoczynku' },
    seg('idleShows', 'W spoczynku pokazuj', 'Gdy nic nie gra i nic się nie dzieje.', [['none', 'Nic'], ['clock', 'Godzina'], ['date', 'Data'], ['weather', 'Pogoda'], ['event', 'Wydarzenie'], ['pet', 'Zwierzak']]),
    seg('idlePet', 'Zwierzak', 'Chodzi, siada, mruga i ucina drzemkę.', [['cat', 'Kot'], ['dog', 'Pies'], ['rabbit', 'Królik'], ['bot', 'Robocik']], { when: s => s.idleShows === 'pet' }),
    { h: 'Tekst i muzyka' },
    seg('font', 'Czcionka', 'Cyfry zawsze mają osobną czcionkę o stałej szerokości.', T.FONTS.map(f => [f.id, f.name])),
    seg('visualizer', 'Wizualizator', 'Reaguje na prawdziwy dźwięk komputera.', [['pixels', 'Piksele'], ['bars', 'Paski']]),
    seg('musicBackground', 'Tło karty muzyki', 'Kolory albumu to rozmyta okładka za treścią.', [['album', 'Kolory albumu'], ['solid', 'Jednolite']]),
    seg('progressBar', 'Pasek postępu', '', [['wave', 'Fala'], ['pixels', 'Piksele'], ['comet', 'Kometa'], ['line', 'Prosty']]),
  ] },
  { id: 'island', icon: 'music', name: 'Wyspa', preview: true, rows: [
    { h: 'Umiejscowienie' },
    seg('edge', 'Krawędź ekranu', 'Na dole wyspa stoi nad paskiem zadań, a karta rozwija się do góry.', [['top', 'Góra'], ['bottom', 'Dół']]),
    seg('position', 'Pozycja', '', [['left', 'Lewo'], ['center', 'Środek'], ['right', 'Prawo']]),
    sld('edgeMargin', 'Margines od krawędzi', 'Dla pozycji Lewo i Prawo.', 0, 400, ' px', { when: s => s.position !== 'center' }),
    tog('hiddenUntilHover', 'Ukryta do najechania', 'Nic nie widać, dopóki kursor nie stanie przy krawędzi. Komunikaty i tak się pokażą, a jeśli wybierzesz, co pokazywać w spoczynku (np. zwierzaka), wyspa zostaje z nim widoczna.'),
    sld('hoverDelay', 'Opóźnienie otwarcia', 'Ile kursor musi stać na wyspie, zanim się otworzy.', 0, 600, ' ms', { step: 10 }),
    tog('reverseScroll', 'Odwrócone przewijanie na wyspie', 'Kółko na pigułce zmienia głośność, na pasku kart przełącza karty.'),
    seg('animationSpeed', 'Szybkość animacji', 'Szybka skraca czas mniej więcej o jedną trzecią.', [['calm', 'Spokojna'], ['normal', 'Normalna'], ['fast', 'Szybka']]),
    { h: 'Komunikaty (HUD)' },
    tog('hudVolume', 'Głośność', 'Okienko Windows też się pokaże — Aura go nie ukrywa.'),
    tog('hudBrightness', 'Jasność', 'Działa na laptopach i monitorach z DDC/CI.'),
    tog('hudBattery', 'Zasilanie i bateria'),
    tog('hudLockKeys', 'Caps Lock i Num Lock'),
    tog('hudDevice', 'Zmiana urządzenia dźwięku', 'Np. po podłączeniu słuchawek.'),
    tog('hudMic', 'Wyciszenie mikrofonu'),
    { h: 'Aktywności na żywo' },
    tog('privacyDot', 'Kropka prywatności', 'Pomarańczowa, gdy aplikacja używa mikrofonu; zielona przy kamerze.'),
    tog('callTimer', 'Minutnik rozmowy', 'Licznik czasu, gdy dowolna aplikacja ma otwarty mikrofon.'),
    { h: 'Teraz odtwarzane' },
    tog('downloads', 'Pobierania na wyspie', 'Postęp pobierania z przeglądarki (folder Pobrane), a po zakończeniu komunikat.'),
    tog('downloadsToShelf', 'Pobrane pliki na półkę', '', { when: s => s.downloads !== false }),
    tog('pillLyrics', 'Tekst piosenki w zamkniętej wyspie', 'Bieżąca linijka, jak karaoke (gdy są włączone teksty piosenek i utwór ma tekst z czasami).', { when: s => s.lyrics }),
    tog('lyrics', 'Teksty piosenek', 'Tytuł, wykonawca i długość utworu trafiają do LRCLIB (darmowa biblioteka tekstów), raz na utwór. Wyłączone = nic nie wychodzi z komputera.'),
    seg('pillTitle', 'Tytuł utworu w zamkniętej wyspie', 'Po zmianie utworu tytuł widać przez 10 sekund, potem wyspa zwija się do okładki i wizualizera.', [['change', 'Przez 10 s'], ['always', 'Zawsze'], ['never', 'Nigdy']]),
    { h: 'Zrzuty ekranu' },
    tog('hideFromCaptures', 'Ukryj wyspę na zrzutach i nagraniach', 'Przy powierzchni Szkło wyspa jest zawsze ukryta przed przechwytywaniem, bo sama czyta obraz ekranu.'),
  ] },
  { id: 'cards', icon: 'widgets', name: 'Karty', rows: [
    { h: 'Karty na wyspie' },
    tog('tabWeb', 'Web', 'Ulubione strony otwierane w małej przeglądarce pod wyspą (logowanie zostaje zapamiętane).'),
    tog('tabNotices', 'Powiadomienia', 'Ostatnie 24 komunikaty: skrypty, agenci, telefon, zrzuty, przypomnienia.'),
    tog('tabAgents', 'Agenci AI'), tog('tabShelf', 'Półka'), tog('tabClips', 'Schowek'), tog('tabWidgets', 'Widżety'),
    tog('tabControls', 'Sterowanie'), tog('tabLauncher', 'Launcher'), tog('tabDeck', 'Telefon (PC Deck)', 'Telefon w tej samej sieci Wi-Fi jako gładzik, pilot muzyki i slajdów. Przy pierwszym włączeniu Windows może zapytać o zgodę zapory — kliknij „Zezwól”.'), tog('tabCall', 'Rozmowa'),
    { h: 'Powiadomienia' },
    tog('appNotifications', 'Powiadomienia z innych aplikacji', 'WhatsApp, Discord, Messenger, poczta i inne pokazują się na wyspie (także nad grą). Aura czyta je przez systemowy dostęp do powiadomień Windows; nic nie wychodzi z komputera. Klik otwiera aplikację.', { win: true }),
    sld('noticeSeconds', 'Czas powiadomienia', 'Jak długo baner zostaje na wyspie.', 2, 20, ' s'),
    tog('noticeClockTime', 'Godziny zamiast „15m”', 'Na liście powiadomień.'),
    { h: 'Pliki i schowek' },
    tog('capturesToShelf', 'Zrzuty i nagrania na półce'),
    tog('phoneShare', 'Wyślij na telefon', 'Kod QR, ta sama sieć Wi-Fi, w obie strony. Odebrane pliki trafiają do Pobrane\\Aura.'),
    tog('clipboardEnabled', 'Historia schowka', 'Szyfrowana kontem Windows. Kopie z menedżerów haseł są pomijane.'),
    seg('clipboardLayout', 'Układ schowka', '', [['cards', 'Karty'], ['list', 'Lista']]),
    sld('clipboardSize', 'Liczba wpisów', 'Przypięte się nie liczą.', 5, 100, ''),
    sld('clipboardKeepHours', 'Ile godzin przechowywać', '0 = bez limitu.', 0, 168, ' h'),
    { h: 'Launcher' },
    tog('recordPcSound', 'Nagrywaj dźwięk komputera'),
    tog('recordMic', 'Nagrywaj mikrofon'),
    { type: 'slots', label: 'Sześć miejsc na aplikacje', desc: 'Kliknij, żeby wybrać aplikację, skrót albo plik.' },
  ] },
  { id: 'widgets', icon: 'sunny', name: 'Widżety', rows: [
    { h: 'Pogoda (Open-Meteo)' },
    { type: 'city', label: 'Miejsce', desc: 'Puste = miasto ze strefy czasowej. Nazwa miejsca trafia do Open-Meteo.' },
    tog('fahrenheit', 'Fahrenheit'),
    { h: 'Kalendarz' },
    { type: 'text', key: 'calendarIcs', label: 'Kanał kalendarza (.ics)', desc: 'Adres iCal z Google Calendar („Tajny adres w formacie iCal”) albo Outlooka. Najbliższe wydarzenie pojawia się w widżecie Dziś.', placeholder: 'https://…/basic.ics' },
    tog('meetingNotice', 'Powiadom 5 minut przed wydarzeniem'),
    { h: 'Czas' },
    seg('timeFormat', 'Format czasu', '', [['system', 'System'], ['12', '12-godzinny'], ['24', '24-godzinny']]),
    sld('focusMinutes', 'Minuty skupienia', '', 5, 90, ' min'),
    sld('breakMinutes', 'Minuty przerwy', '', 1, 30, ' min'),
    seg('reminderSound', 'Dźwięk przypomnień', 'Aż odpowiem = co 15 s, najwyżej przez minutę.', [['repeat', 'Aż odpowiem'], ['once', 'Raz'], ['off', 'Wył.']]),
    { h: 'Statystyki' },
    seg('netUnit', 'Szybkość sieci', '', [['MBs', 'MB/s'], ['Mbps', 'Mb/s']]),
  ] },
  { id: 'streaming', icon: 'camera', name: 'Streaming', rows: [
    { h: 'OBS Studio' },
    tog('obsEnabled', 'Połącz z OBS', 'Pigułka REC lub LIVE z czasem trwania i sceną. Skróty do nagrywania i transmisji ustawisz w Skrótach.'),
    { type: 'obs', label: 'OBS na tym komputerze', desc: 'Wymaga włączonego serwera WebSocket w OBS: Narzędzia → Ustawienia serwera WebSocket → Włącz.' },
    tog('obsAuto', 'Użyj ustawień z OBS', 'Port i hasło odczytane z konfiguracji OBS.', { when: s => s.obsEnabled }),
    sld('obsPort', 'Port', '', 1024, 65000, '', { input: true, when: s => s.obsEnabled && !s.obsAuto }),
    { type: 'text', key: 'obsPassword', label: 'Hasło', desc: 'Tylko gdy nie używasz ustawień z OBS.', placeholder: 'hasło serwera WebSocket', when: s => s.obsEnabled && !s.obsAuto, secret: true },
    { h: 'Czat transmisji (Twitch)' },
    { type: 'text', key: 'chatTwitch', label: 'Kanał Twitch', desc: 'Nazwa albo link do kanału. Czat czytany anonimowo, bez logowania.', placeholder: 'np. twitch.tv/nazwa' },
    { type: 'button', label: 'Szuflada czatu', desc: 'Okno z czatem, które możesz przeciągnąć obok gry. Skrót ustawisz w Skrótach.', text: 'Otwórz / zamknij', fn: () => W.send('chat-toggle') },
    { type: 'color', key: 'chatBackground', label: 'Tło czatu' },
    sld('chatOpacity', 'Krycie tła', '', 0, 100, '%'),
    { type: 'color', key: 'chatTextColor', label: 'Kolor tekstu' },
    sld('chatTextSize', 'Rozmiar tekstu', '', 10, 30, ' pt'),
  ] },
  { id: 'taskbar', icon: 'grid', name: 'Pasek zadań', rows: [
    { h: 'Pasek zadań Aury' },
    tog('dock', 'Pasek zadań Aury', 'Wyspa u dołu ekranu zamiast paska Windows: Start, przypięte i otwarte aplikacje, grający utwór, minutnik, szybkie ustawienia i zegar. Prawy przycisk na ikonie przypina albo zamyka. Pasek Windows wraca po wyłączeniu (także gdy Aura się zamknie).'),
    tog('dockAutoHide', 'Chowaj, gdy okno na niego nachodzi', 'Jak dock na Macu: pasek wysuwa się po dosunięciu kursora do dolnej krawędzi. Wyłączone: okna kończą się nad paskiem, jak przy pasku Windows.', { when: s => s.dock }),
    tog('dockTrayAll', 'Wszystkie ikony zasobnika', 'Wyłączone: tylko te, które Windows pokazuje przy zegarze (np. Steam, Epic, Discord).', { when: s => s.dock }),
    tog('dockMagnify', 'Efekt docka', 'Ikony rosną pod kursorem, jak w docku na Macu.', { when: s => s.dock }),
    sld('dockSize', 'Rozmiar', '', 100, 200, '%', { when: s => s.dock }),
  ] },
  { id: 'wallpaper', icon: 'shot', name: 'Tapeta', rows: [
    { h: 'Animowana tapeta' },
    tog('liveWallpaper', 'Odtwarzaj animowaną tapetę', 'Film z dysku gra za ikonami pulpitu, bez dźwięku, dekodowany przez kartę graficzną. Pauzuje pod grami. Po wyłączeniu wraca Twoja zwykła tapeta.'),
    { type: 'button', label: 'Film', desc: 'MP4, MOV, MKV, WebM, WMV, AVI.', text: 'Wybierz film…', fn: async () => { S = await W.invoke('wallpaper-pick'); render(); }, sub: s => s.liveWallpaperFile ? s.liveWallpaperFile.split('\\').pop() : 'Nie wybrano filmu' },
    { h: 'Kolory' },
    sld('wpHue', 'Odcień', '', 0, 360, '°'),
    sld('wpSaturation', 'Nasycenie', '', 0, 200, '%'),
    sld('wpBrightness', 'Jasność', '', -100, 100, ''),
    sld('wpContrast', 'Kontrast', '', 0, 200, '%'),
    { type: 'button', label: 'Oryginalne kolory', text: 'Przywróć', fn: () => set({ wpHue: 0, wpSaturation: 100, wpBrightness: 0, wpContrast: 100 }) },
  ] },
  { id: 'agents', icon: 'agent', name: 'Agenci AI', rows: [
    { h: 'Na wyspie' },
    tog('agentsEnabled', 'Pokazuj agentów AI', 'Co robi każdy agent: pracuje, czeka na Ciebie, skończył.'),
    tog('agentsNotifyDone', 'Powiadom, gdy któryś skończy'),
    { h: 'Agenci' },
    { type: 'claude', label: 'Claude Code', desc: 'Dodaje hooki do ~/.claude/settings.json (z kopią .aura-backup). Raportują tylko na 127.0.0.1.' },
    tog('agentApprove', 'Zgody z wyspy', 'Gdy Claude Code pyta o zgodę (np. na polecenie w terminalu), wyspa pokazuje Zezwól / Odmów / W terminalu. Bez odpowiedzi po ok. 30 s pytanie wraca do terminala.'),
    { type: 'codex', label: 'Codex', desc: 'Dodaje powiadomienie Aury w ~/.codex/config.toml (z kopią .aura-backup). Dotychczasowe powiadomienia Codexa nadal działają.' },
    { h: 'Limity' },
    tog('claudeUsage', 'Wykorzystanie limitów Claude', 'Na karcie Agenci: ile zużyłeś z limitu 5-godzinnego i tygodniowego oraz kiedy się zresetują. Aura używa logowania Claude Code z tego komputera i pyta tylko serwery Anthropic.'),
  ] },
  { id: 'tools', icon: 'script', name: 'Narzędzia', rows: [
    { h: 'Skrypty i kompilacje' },
    tog('notifyEndpoint', 'Punkt końcowy powiadomień', 'Każdy program na tym komputerze może wyświetlić komunikat na wyspie. Tylko 127.0.0.1, przeglądarki są odrzucane.'),
    sld('notifyPort', 'Port', '', 1024, 65000, '', { step: 1, input: true }),
    { type: 'code' },
  ] },
  { id: 'keys', icon: 'grid', name: 'Skróty', rows: [
    { type: 'note', text: 'Kliknij pole i naciśnij kombinację. Backspace czyści, Esc anuluje. Unikaj Ctrl+Alt z literami ą ć ę ł ń ó ś ź ż — to AltGr na polskiej klawiaturze.' },
    tog('tabHotkeys', 'Ctrl+Shift+1…6 otwiera kartę', 'Wyspa otwiera się od razu na 1., 2., … 6. karcie z paska kart. Na pigułce: kółko myszy zmienia głośność, przesunięcie w bok (gładzik albo Shift + kółko) przełącza utwór.'),
    ...[['open', 'Otwórz lub zamknij wyspę'], ['hide', 'Ukryj lub pokaż Aurę'], ['playPause', 'Odtwórz / wstrzymaj'], ['next', 'Następny utwór'], ['prev', 'Poprzedni utwór'],
      ['focus', 'Minutnik skupienia: start / pauza'], ['micMute', 'Wycisz lub włącz mikrofon (wszystkie aplikacje)'], ['colorPick', 'Kopiuj kolor spod kursora'],
      ['screenshot', 'Zrzut ekranu (Obrazy + półka)'], ['snip', 'Wycinek ekranu'], ['record', 'Nagrywanie ekranu'],
      ['chat', 'Szuflada czatu transmisji'], ['obsRecord', 'OBS: nagrywanie start / stop'], ['obsStream', 'OBS: transmisja start / stop']].map(([k, l]) => ({ type: 'hotkey', key: k, label: l })),
  ] },
  { id: 'about', icon: 'note', name: 'Informacje', rows: [
    { type: 'about' },
    { h: 'Aktualizacje' },
    { type: 'update', label: 'Wersja', desc: 'Aura sprawdza GitHuba przy starcie i co 6 godzin. W wersji z instalatorem nowa wersja pobiera się sama i instaluje po ponownym uruchomieniu.' },
    tog('updateNotify', 'Powiadamiaj o nowych wersjach', 'Okienko na wyspie, gdy pojawi się nowa wersja.'),
  ] },
];

// ---------- motyw okna ----------
function applyTheme() {
  const surf = T.surface(S.surface);
  const accent = T.accentHex(S.accent, null, surf.light);
  const L = surf.light;
  const base = surf.glass ? '#0e0e12' : surf.base === '#000000' ? '#050505' : surf.base;
  const vars = {
    '--bg': base, '--side': L ? '#f4f4f5' : shade(base, 6), '--fg': L ? '#111113' : '#f2f2f2', '--dim': L ? '#6b6b70' : '#9a9a9a', '--faint': L ? '#a1a1a6' : '#5c5c61',
    '--row': L ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.06)', '--row-hi': L ? 'rgba(0,0,0,.09)' : 'rgba(255,255,255,.11)', '--line': L ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)',
    '--btn': L ? '#111113' : '#f5f5f7', '--btn-fg': L ? '#fff' : '#000', '--accent': accent,
  };
  if (surf.glass) { // tło rysuje GlassBg: rozmyty obraz pulpitu pod oknem
    Object.assign(vars, { '--bg': 'rgba(10,10,14,0)', '--side': 'rgba(0,0,0,.16)', '--row': 'rgba(255,255,255,.075)', '--row-hi': 'rgba(255,255,255,.14)', '--line': 'rgba(255,255,255,.10)' });
    if (!glassReady) glassReady = GlassBg.init($('#glassbg')) ? 'ok' : 'fail';
    if (glassReady === 'ok') { GlassBg.setBlur((S.glassBlur ?? 50) / 100); if (!GlassBg.running) { W.invoke('settings-pos'); GlassBg.start(); } }
  } else if (glassReady === 'ok' && GlassBg.running) GlassBg.stop();
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  document.body.classList.toggle('glass', !!surf.glass);
  const font = T.FONTS.find(f => f.id === S.font) || T.FONTS[0];
  document.documentElement.style.setProperty('--font', font.css);
  W.send('settings-titlebar', { bg: base, fg: vars['--fg'], glass: !!surf.glass });
}
function shade(hex, amt) { const [r, g, b] = T.hexToRgb(hex).map(x => Math.min(255, Math.round(x * 255 + amt))); return `rgb(${r},${g},${b})`; }

// ---------- zapis ----------
async function set(patch) { S = await W.invoke('settings-set', patch); applyTheme(); render(); }

// ---------- rysowanie ----------
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function renderNav() {
  const nav = $('#nav'); nav.textContent = '';
  for (const p of PAGES) {
    if (hiddenPage(p)) continue;
    const b = el('button'); const ic = el('span'); ic.innerHTML = I.svg(p.icon); b.append(ic, document.createTextNode(p.name));
    if (p.id === page && !query) b.classList.add('on');
    b.onclick = () => { page = p.id; query = ''; $('#search').value = ''; $('.search').classList.remove('has'); render(); $('#main').scrollTop = 0; };
    nav.append(b);
  }
}
function render() {
  renderNav();
  const main = $('#main'); main.textContent = '';
  if (query) {
    main.append(el('div', 'kicker', 'Szukaj'), el('h1', '', `„${query}”`));
    let n = 0;
    for (const p of PAGES) {
      if (hiddenPage(p)) continue;
      const hits = p.rows.filter(r => !hiddenRow(r) && r.label && (r.label + ' ' + (r.desc || '')).toLowerCase().includes(query.toLowerCase()));
      if (!hits.length) continue;
      main.append(el('h2', '', p.name)); hits.forEach(r => { main.append(rowEl(r)); n++; });
    }
    if (!n) main.append(el('div', 'empty', 'Nic nie znaleziono.'));
    return;
  }
  const p = PAGES.find(x => x.id === page) || PAGES[0];
  main.append(el('div', 'kicker', 'Ustawienia'));
  const h = el('h1', '', p.name);
  if (p.preview) { const b = el('button', 'preview', 'Pokaż otwartą wyspę'); b.title = 'Wyspa zostaje otwarta, dopóki nie najedziesz na nią kursorem i z niej nie zjedziesz.'; b.onclick = () => W.send('pin-open'); h.append(b); }
  main.append(h);
  for (const r of p.rows) {
    if (hiddenRow(r)) continue;
    if (r.h) { main.append(el('h2', '', r.h)); continue; }
    main.append(rowEl(r));
  }
}
function rowEl(r) {
  if (r.type === 'note') { const d = el('p', 'lead', r.text); return d; }
  if (r.type === 'code') {
    const port = S.notifyPort;
    return el('div', 'code', `curl -X POST http://127.0.0.1:${port}/notify -d "{\\"title\\":\\"Build\\",\\"body\\":\\"gotowy\\"}"\n\nnode "${location.pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/settings\/index\.html$/, '').replace(/\//g, '\\')}\\tools\\aura-notify.js" "Build gotowy" "0 błędów"\n\nPOST /agent {"session":"id","harness":"Mój agent","state":"working|needs|done|end","title":"…","project":"…"}`);
  }
  if (r.type === 'about') {
    const d = el('div');
    const by = el('p', 'lead'); by.append(document.createTextNode('Autor: '));
    const a = el('a', '', 'FameFabricators'); a.href = '#'; a.style.cssText = 'color:var(--accent);font-weight:700;text-decoration:none';
    a.onclick = e => { e.preventDefault(); W.send('open-author'); };
    by.append(a, document.createTextNode(' · famefabricators.pl'));
    d.append(by);
    d.append(el('p', 'lead', 'Aura — Twoja własna wyspa u góry ekranu. Muzyka, półka na pliki, schowek, widżety, przypomnienia, agenci AI i komunikaty systemowe.'));
    d.append(el('p', 'lead', 'Bez konta, bez reklam i bez telemetrii. Ustawienia i dane są w %APPDATA%\\Aura. Pogoda pochodzi z Open-Meteo, teksty piosenek (po włączeniu) z LRCLIB.'));
    return d;
  }
  const row = el('div', 'row');
  if (r.when && !r.when(S)) row.classList.add('off');
  const lbl = el('div', 'lbl'); lbl.append(el('b', '', r.label)); if (r.desc) lbl.append(el('small', '', r.desc));
  row.append(lbl);
  const ctl = el('div', 'ctl'); row.append(ctl);
  if (query && r.label.toLowerCase().includes(query.toLowerCase())) row.classList.add('hit');
  switch (r.type) {
    case 'toggle': { const b = el('button', 'sw' + (S[r.key] ? ' on' : '')); b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', !!S[r.key]); b.onclick = () => set({ [r.key]: !S[r.key] }); ctl.append(b); break; }
    case 'seg': { const s = el('div', 'seg'); for (const [v, l] of r.options) { const b = el('button', String(S[r.key]) === String(v) ? 'on' : '', l); b.onclick = () => set({ [r.key]: v }); s.append(b); } ctl.append(s); break; }
    case 'slider': {
      const inp = el('input'); inp.type = 'range'; inp.min = r.min; inp.max = r.max; inp.step = r.step || 1; inp.value = S[r.key];
      const val = el('span', 'val', S[r.key] + r.unit);
      const fill = () => inp.style.setProperty('--v', ((inp.value - r.min) / (r.max - r.min) * 100) + '%'); fill();
      let t = null;
      inp.oninput = () => { fill(); val.textContent = inp.value + r.unit; clearTimeout(t); t = setTimeout(() => W.invoke('settings-set', { [r.key]: Number(inp.value) }).then(s => { S = s; }), 120); };
      inp.onchange = () => set({ [r.key]: Number(inp.value) });
      if (r.input) { const n = el('input', 'txt short'); n.value = S[r.key]; n.onchange = () => set({ [r.key]: Number(n.value) || S[r.key] }); ctl.append(n); }
      else ctl.append(inp, val);
      break;
    }
    case 'surfaces': {
      row.classList.add('block'); ctl.style.maxWidth = 'none';
      const g = el('div', 'surfs');
      for (const s of T.SURFACES) {
        const b = el('button', 'surf' + (S.surface === s.id ? ' on' : ''));
        const sw = el('i', s.glass ? 'glass' : ''); if (!s.glass) sw.style.background = s.base; if (s.light) sw.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.12)';
        b.append(sw, el('b', '', s.name)); if (s.note) b.append(el('small', '', s.note));
        b.onclick = () => set(s.accent ? { surface: s.id, accent: s.accent } : { surface: s.id });
        g.append(b);
      }
      ctl.append(g); break;
    }
    case 'accents': {
      const g = el('div', 'accents');
      for (const a of T.ACCENTS) {
        const b = el('button', 'dot' + (S.accent === a.id ? ' on' : '')); b.title = a.name;
        b.style.background = a.id === 'windows' ? 'conic-gradient(#0a84ff, #bf5af2, #ff375f, #ff9f0a, #30d158, #0a84ff)' : a.hex;
        b.onclick = () => set({ accent: a.id }); g.append(b);
      }
      ctl.append(g); break;
    }
    case 'update': {
      const status = el('span', 'val', '…'); status.style.minWidth = 'auto';
      const b = el('button', 'btn', 'Sprawdź teraz');
      const show = s => {
        if (!s) return;
        const txt = { idle: '', dev: 'wersja z kodu (bez aktualizacji)', checking: 'sprawdzam…', current: 'masz najnowszą', available: `dostępna ${s.latest}`,
          downloading: `pobieram ${s.latest}${s.percent != null ? ' · ' + s.percent + '%' : ''}`, ready: `${s.latest} gotowa — uruchom ponownie`, error: 'nie udało się sprawdzić' }[s.status] || '';
        status.textContent = `v${s.current}${txt ? ' · ' + txt : ''}`;
        b.textContent = s.status === 'ready' ? 'Uruchom ponownie' : s.status === 'available' && s.mode === 'notify' ? 'Pobierz' : 'Sprawdź teraz';
        b.onclick = async () => {
          if (s.status === 'ready') return W.send('update-answer', 'install');
          if (s.status === 'available' && s.mode === 'notify') return W.send('update-answer', 'open');
          b.disabled = true; show(await W.invoke('update-check')); b.disabled = false;
        };
      };
      W.invoke('update-state').then(show);
      updateView = show;
      ctl.append(status, b); break;
    }
    case 'button': {
      if (r.sub) { const s = el('span', 'val', r.sub(S)); s.style.minWidth = 'auto'; s.style.maxWidth = '220px'; s.style.overflow = 'hidden'; s.style.textOverflow = 'ellipsis'; s.style.whiteSpace = 'nowrap'; ctl.append(s); }
      const b = el('button', 'btn', r.text); b.onclick = r.fn; ctl.append(b); break;
    }
    case 'color': {
      const inp = el('input'); inp.type = 'color'; inp.value = S[r.key] || '#000000';
      inp.style.cssText = 'width:44px;height:30px;border:0;border-radius:8px;background:none;cursor:pointer';
      const hex = el('span', 'val', (S[r.key] || '').toUpperCase());
      inp.oninput = () => { hex.textContent = inp.value.toUpperCase(); };
      inp.onchange = () => set({ [r.key]: inp.value.toUpperCase() });
      ctl.append(hex, inp); break;
    }
    case 'obs': {
      const status = el('span', 'val', 'Sprawdzam…'); status.style.minWidth = 'auto'; ctl.append(status);
      Promise.all([W.invoke('obs-local'), W.invoke('obs-state')]).then(([loc, s]) => {
        if (s && s.connected) status.textContent = `Połączono${s.scene ? ' · ' + s.scene : ''}`;
        else if (s && s.error && S.obsEnabled) status.textContent = s.error;
        else status.textContent = !loc.found ? 'Nie znaleziono OBS' : loc.enabled ? `Serwer włączony · port ${loc.port}` : 'Serwer WebSocket wyłączony w OBS';
      });
      break;
    }
    case 'text': {
      const inp = el('input', 'txt'); inp.placeholder = r.placeholder || ''; inp.value = S[r.key] || ''; inp.spellcheck = false; if (r.secret) inp.type = 'password';
      const b = el('button', 'btn', 'Zapisz');
      const go = async () => { await set({ [r.key]: inp.value.trim() }); };
      b.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      ctl.append(inp, b); break;
    }
    case 'city': {
      const inp = el('input', 'txt'); inp.placeholder = S.weatherName || 'np. Kraków'; inp.value = S.weatherCity || '';
      const b = el('button', 'btn', 'Zapisz');
      const go = async () => { b.disabled = true; b.textContent = 'Szukam…'; const w = await W.invoke('weather-city', inp.value.trim()); S = await W.invoke('settings-get'); b.disabled = false; b.textContent = w && !w.error ? `✓ ${S.weatherName || 'Zapisano'}` : 'Nie znaleziono'; };
      b.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      ctl.append(inp, b); break;
    }
    case 'slots': {
      row.classList.add('block'); ctl.style.maxWidth = 'none';
      const g = el('div', 'slots');
      (S.launchApps || []).forEach((p, i) => {
        const s = el('div', 'slot'); s.append(el('b', '', i + 1)); s.append(el('span', '', p ? p.split('\\').pop() : 'Puste'));
        const pick = el('button', 'btn ghost', 'Wybierz'); pick.onclick = async () => { await W.invoke('launch-pick', i); S = await W.invoke('settings-get'); render(); };
        s.append(pick);
        if (p) { const c = el('button', 'btn ghost', 'Wyczyść'); c.onclick = () => { const l = [...S.launchApps]; l[i] = ''; set({ launchApps: l }); }; s.append(c); }
        g.append(s);
      });
      ctl.append(g); break;
    }
    case 'claude': {
      const status = el('span', 'val', { connected: 'Połączono', disconnected: 'Nie połączono', missing: 'Nie znaleziono na tym komputerze' }[claude] || claude);
      status.style.minWidth = 'auto';
      const b = el('button', 'btn', claude === 'connected' ? 'Odłącz' : 'Połącz');
      b.onclick = async () => { claude = await W.invoke('claude-connect', claude !== 'connected'); render(); };
      ctl.append(status, b); break;
    }
    case 'codex': {
      const status = el('span', 'val', { connected: 'Połączono', disconnected: 'Nie połączono', missing: 'Nie znaleziono na tym komputerze' }[codex] || codex);
      status.style.minWidth = 'auto';
      const b = el('button', 'btn', codex === 'connected' ? 'Odłącz' : 'Połącz'); b.disabled = codex === 'missing';
      b.onclick = async () => { codex = await W.invoke('codex-connect', codex !== 'connected'); render(); };
      ctl.append(status, b); break;
    }
    case 'hotkey': {
      const b = el('button', 'hk' + (hkErrors.includes(r.key) ? ' err' : ''), pretty(S.hotkeys[r.key]) || 'Nie ustawiono');
      if (hkErrors.includes(r.key)) lbl.append(el('small', 'warn', 'Ten skrót jest zajęty przez inną aplikację.'));
      if (ALTGR.test(S.hotkeys[r.key] || '')) lbl.append(el('small', 'warn', 'Koliduje z polską literą (AltGr).'));
      b.onclick = () => recordHotkey(b, r.key);
      ctl.append(b); break;
    }
  }
  return row;
}
const pretty = a => (a || '').replace('Control', 'Ctrl').replace(/\+/g, ' + ');

// ---------- nagrywanie skrótu ----------
function recordHotkey(btn, key) {
  btn.classList.add('rec'); btn.textContent = 'Naciśnij kombinację…';
  W.send('hotkeys-pause', true);
  const done = accel => { window.removeEventListener('keydown', onKey, true); btn.removeEventListener('blur', cancel); W.send('hotkeys-pause', false); if (accel !== undefined) set({ hotkeys: { [key]: accel } }); else render(); };
  const cancel = () => done();
  const onKey = e => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') return done();
    if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey) return done('');
    if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return;
    const mods = []; if (e.ctrlKey) mods.push('Control'); if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift'); if (e.metaKey) mods.push('Super');
    if (!mods.length) { btn.textContent = 'Dodaj Ctrl, Alt lub Shift'; return; }
    let k = e.code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '');
    if (k === 'Space') k = 'Space';
    if (/^Numpad/.test(k)) k = 'num' + k.replace('Numpad', '');
    done([...mods, k].join('+'));
  };
  window.addEventListener('keydown', onKey, true);
  btn.addEventListener('blur', cancel, { once: true });
}

// ---------- start ----------
$('#sIco').innerHTML = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';
const syncClear = () => $('.search').classList.toggle('has', !!$('#search').value);
$('#search').oninput = e => { query = e.target.value.trim(); syncClear(); render(); };
$('#sClear').innerHTML = I.svg('x');
$('#sClear').onclick = () => { $('#search').value = ''; query = ''; syncClear(); render(); $('#search').focus(); };
$('#search').addEventListener('keydown', e => { if (e.key === 'Escape' && $('#search').value) { e.stopPropagation(); $('#sClear').click(); } });
$('#author').onclick = () => W.send('open-author');
W.on('settings', s => { S = s; applyTheme(); if (!document.activeElement || document.activeElement.type !== 'range') render(); });
W.on('hotkey-errors', e => { hkErrors = e || []; if (page === 'keys') render(); });
W.on('goto', p => { page = p; query = ''; render(); });
W.on('obs', () => { if (page === 'streaming') render(); });
let updateView = null;
W.on('update-state', s => { if (updateView && page === 'about') updateView(s); });
W.on('wallpaper', s => { if (page === 'wallpaper' && s && s.error) { const m = $('main .lead.err') || document.createElement('p'); m.className = 'lead err'; m.style.color = '#ff9f0a'; m.textContent = s.error; $('#main h1').after(m); } });
(async () => {
  S = await W.invoke('settings-get');
  hkErrors = await W.invoke('hotkey-errors');
  claude = await W.invoke('claude-status');
  codex = await W.invoke('codex-status').catch(() => 'missing');
  W.invoke('update-state').then(s => { $('#ver').textContent = 'v' + ((s && s.current) || ''); });
  applyTheme(); render();
})();
