// błędy strony zapamiętane do diagnostyki (test na Macu czyta je przez port debugowania)
addEventListener('error', e => { (window.__err = window.__err || []).push(String(e.message)); });
addEventListener('unhandledrejection', e => { (window.__err = window.__err || []).push('promise: ' + String(e.reason && e.reason.message || e.reason)); });
/* Aura — okno ustawień, generowane ze schematu. Każda zmiana działa od razu. */
const W = window.wyspa, T = window.WYSPA_THEME, I = window.ICONS;
const $ = s => document.querySelector(s);
let S = {}, page = new URLSearchParams(location.search).get('page') || 'look', query = '', hkErrors = [], claude = 'disconnected', codex = 'disconnected', glassReady = '';
// opcje, które działają tylko na Windowsie — na Macu ich nie pokazujemy
const MAC = W.platform === 'darwin';
const WIN_ONLY = new Set(['devBattery', 'appNotifications', 'slimCovered', 'hideInFullscreen', 'gamerOverlay', 'hudLockKeys', 'hudDevice', 'hudMic',
  'privacyDot', 'callTimer', 'colorPick', 'liveWallpaper', 'shape', 'topGap']); // krawędź i położenie wyspy działają też na Macu (na dole bez notcha)
const hiddenRow = r => (MAC && (WIN_ONLY.has(r.key) || r.h === L('Gry', 'Games'))) || (!MAC && (r.key === 'macRealGlass' || r.key === 'tabAirdrop' || r.key === 'macHudKeys')); // opcje tylko dla Maca
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
  { id: 'general', icon: 'gear', name: L('Ogólne', 'General'), rows: [
    seg('lang', 'Język / Language', L('Zmiana języka uruchamia Aurę ponownie.', 'Changing the language restarts Aura.'), [['auto', L('Jak system', 'System')], ['pl', 'Polski'], ['en', 'English']]),
    tog('autostart', L('Uruchamiaj razem z Windows', 'Start with Windows'), L('Aura startuje po zalogowaniu.', 'Aura starts when you sign in.')),
    tog('slimCovered', L('Wąski pasek pod zmaksymalizowanymi oknami', 'Thin line under maximised windows'), L('Gdy okno zasłania górę ekranu, wyspa zwija się do cienkiej linii i nie zasłania kart przeglądarki. Najedź na nią kursorem, żeby ją otworzyć.', 'When a window covers the top of the screen, the island shrinks to a thin line and doesn’t cover your browser tabs. Hover over it to open it.')),
    seg('openOn', L('Gdy wyspa się otwiera', 'When the island opens'), L('Ostatnia karta pamięta też po restarcie. „Muzyka” pokazuje widżety, gdy nic nie gra.', 'The last card is remembered after a restart too. “Music” shows widgets when nothing is playing.'), [['last', L('Ostatnia karta', 'Last card')], ['music', L('Muzyka', 'Music')]]),
    tog('hideInFullscreen', L('Ukrywaj nad grami i filmami na pełnym ekranie', 'Hide over full-screen games and videos'), L('Przypomnienia i tak się pokażą.', 'Reminders still show up.')),
    { h: L('Gry', 'Games') },
    tog('gamerOverlay', L('Pasek dla graczy', 'Gamer bar'), L('Nad grą pełnoekranową zamiast ukrywać wyspę pokazuje wąski pasek: CPU, GPU z temperaturą, RAM, sieć i godzinę. Gra musi być w trybie „pełny ekran bez ramki” (w trybie wyłącznym Windows nie pozwala niczego pokazać nad grą).', 'Over a full-screen game, instead of hiding the island, shows a thin bar: CPU, GPU with temperature, RAM, network and time. The game must run in “borderless full screen” (in exclusive full screen Windows doesn’t let anything show over the game).')),
  ] },
  { id: 'access', icon: 'focus', name: L('Ułatwienia dostępu', 'Accessibility'), rows: [
    { h: L('Ruch i czas', 'Motion and timing') },
    seg('reduceMotion', L('Ogranicz ruch', 'Reduce motion'), L('Wyspa otwiera się i zamyka bez sprężynowania.', 'The island opens and closes without springing.'), [['system', L('Tak jak Windows', 'Same as Windows')], ['on', L('Wł.', 'On')], ['off', L('Wył.', 'Off')]]),
    tog('longerNotices', L('Pokazuj powiadomienia dłużej', 'Show notifications longer'), L('Baner zostaje na wyspie dwa razy dłużej.', 'The banner stays on the island twice as long.')),
  ] },
  { id: 'look', icon: 'palette', name: L('Wygląd', 'Look'), preview: true, rows: [
    { h: L('Powierzchnia', 'Surface') },
    { type: 'surfaces', key: 'surface', label: L('Powierzchnia', 'Surface'), desc: L('Szkło na żywo rozmywa i załamuje to, co jest za wyspą. Motywy Tatry, Noc i Bursztyn mają własny akcent i delikatną animację.', 'Live glass blurs and bends whatever is behind the island. The Mountains, Night and Amber themes have their own accent and a subtle animation.') },
    sld('glassBlur', L('Rozmycie szkła', 'Glass blur'), L('Środek to wygląd domyślny.', 'The middle is the default look.'), 0, 100, '%', { when: s => s.surface === 'glass' }),
    tog('macRealGlass', L('Prawdziwe szkło na Macu', 'Real glass on the Mac'), L('Szkło rozmywa to, co jest pod wyspą, jak na Windowsie. Wymaga zgody na nagrywanie ekranu (Ustawienia systemowe → Prywatność i ochrona → Nagrywanie ekranu) — macOS pokazuje wtedy ikonę nagrywania na pasku menu. Aura pobiera obraz w niskiej rozdzielczości, tylko do rozmycia, i nigdzie go nie zapisuje. Wyłączone: przydymiona tafla bez nagrywania.', 'The glass blurs whatever is under the island, like on Windows. Needs screen recording permission (System Settings → Privacy & Security → Screen Recording) — macOS then shows a recording icon in the menu bar. Aura takes a low-resolution image only for the blur and never saves it. Off: a smoky pane without recording.'), { when: s => s.surface === 'glass' }),
    { type: 'accents', key: 'accent', label: L('Kolor akcentu', 'Accent colour'), desc: 'Wizualizator, paski, kropki stanu, przyciski.' },
    { h: L('Kształt', 'Shape') },
    seg('shape', L('Kształt', 'Shape'), L('Notch zwisa z górnej krawędzi. Wyspa unosi się tuż pod nią.', 'Notch hangs from the top edge. Island floats just below it.'), [['island', L('Wyspa', 'Island')], ['notch', 'Notch']]),
    sld('topGap', L('Odległość od góry', 'Distance from the top'), L('Tylko dla kształtu Wyspa.', 'Only for the Island shape.'), 0, 48, ' px', { when: s => s.shape === 'island' }),
    sld('roundness', L('Narożniki', 'Corners'), L('Od kwadratowych po w pełni zaokrąglone.', 'From square to fully rounded.'), 0, 100, '%'),
    sld('size', L('Rozmiar', 'Size'), L('Pigułka, komunikaty i tekst.', 'Pill, messages and text.'), 70, 150, '%'),
    sld('openSize', L('Rozmiar po otwarciu', 'Size when open'), L('Tylko otwarta karta.', 'Only the open card.'), 70, 150, '%'),
    { h: 'W spoczynku' },
    seg('idleShows', 'W spoczynku pokazuj', L('Gdy nic nie gra i nic się nie dzieje.', 'When nothing is playing and nothing is happening.'), [['none', L('Nic', 'Nothing')], ['clock', L('Godzina', 'Time')], ['date', 'Data'], ['weather', L('Pogoda', 'Weather')], ['event', L('Wydarzenie', 'Event')], ['pet', L('Zwierzak', 'Pet')]]),
    seg('idlePet', L('Zwierzak', 'Pet'), L('Chodzi, siada, mruga i ucina drzemkę.', 'Walks, sits, blinks and takes a nap.'), [['cat', L('Kot', 'Cat')], ['dog', L('Pies', 'Dog')], ['rabbit', L('Królik', 'Rabbit')], ['bot', L('Robocik', 'Robot')]], { when: s => s.idleShows === 'pet' }),
    { h: L('Tekst i muzyka', 'Text and music') },
    seg('font', L('Czcionka', 'Font'), L('Cyfry zawsze mają osobną czcionkę o stałej szerokości.', 'Digits always use a separate fixed-width font.'), T.FONTS.map(f => [f.id, f.name])),
    seg('visualizer', L('Wizualizator', 'Visualiser'), L('Reaguje na prawdziwy dźwięk komputera.', 'Reacts to the real sound of your computer.'), [['pixels', L('Piksele', 'Pixels')], ['bars', L('Paski', 'Bars')]]),
    seg('musicBackground', L('Tło karty muzyki', 'Music card background'), L('Kolory albumu to rozmyta okładka za treścią.', 'Album colours are the blurred cover behind the content.'), [['album', L('Kolory albumu', 'Album colours')], ['solid', L('Jednolite', 'Solid')]]),
    seg('progressBar', L('Pasek postępu', 'Progress bar'), '', [['wave', L('Fala', 'Wave')], ['pixels', L('Piksele', 'Pixels')], ['comet', L('Kometa', 'Comet')], ['line', L('Prosty', 'Simple')]]),
  ] },
  { id: 'island', icon: 'music', name: L('Wyspa', 'Island'), preview: true, rows: [
    { h: L('Umiejscowienie', 'Placement') },
    seg('edge', L('Krawędź ekranu', 'Screen edge'), L('Na dole wyspa stoi nad paskiem zadań (na Macu nad Dockiem), a karta rozwija się do góry. Na Macu z notchem wyspa u góry otacza wycięcie.', 'At the bottom the island sits above the taskbar (above the Dock on a Mac) and the card opens upwards. On a Mac with a notch the island at the top wraps around the cut-out.'), [['top', L('Góra', 'Top')], ['bottom', L('Dół', 'Bottom')]]),
    seg('position', L('Pozycja', 'Position'), '', [['left', L('Lewo', 'Left')], ['center', L('Środek', 'Centre')], ['right', L('Prawo', 'Right')]]),
    sld('edgeMargin', L('Margines od krawędzi', 'Margin from the edge'), L('Dla pozycji Lewo i Prawo.', 'For the Left and Right positions.'), 0, 400, ' px', { when: s => s.position !== 'center' }),
    tog('hiddenUntilHover', L('Ukryta do najechania', 'Hidden until hover'), L('Nic nie widać, dopóki kursor nie stanie przy krawędzi. Komunikaty i tak się pokażą, a jeśli wybierzesz, co pokazywać w spoczynku (np. zwierzaka), wyspa zostaje z nim widoczna.', 'Nothing is visible until the cursor reaches the edge. Messages still show up, and if you choose something to show at rest (e.g. a pet), the island stays visible with it.')),
    sld('hoverDelay', L('Opóźnienie otwarcia', 'Open delay'), L('Ile kursor musi stać na wyspie, zanim się otworzy.', 'How long the cursor has to rest on the island before it opens.'), 0, 600, ' ms', { step: 10 }),
    tog('reverseScroll', L('Odwrócone przewijanie na wyspie', 'Reverse scrolling on the island'), L('Kółko na pigułce zmienia głośność, na pasku kart przełącza karty.', 'The wheel on the pill changes the volume; on the tab bar it switches cards.')),
    seg('animationSpeed', L('Szybkość animacji', 'Animation speed'), L('Szybka skraca czas mniej więcej o jedną trzecią.', 'Fast cuts the time by about a third.'), [['calm', L('Spokojna', 'Calm')], ['normal', L('Normalna', 'Normal')], ['fast', L('Szybka', 'Fast')]]),
    { h: 'Komunikaty (HUD)' },
    tog('hudVolume', L('Głośność', 'Volume'), MAC ? L('Klawisze głośności pokazują okienko na wyspie.', 'Volume keys show a popup on the island.') : L('Okienko Windows też się pokaże — Aura go nie ukrywa.', 'The Windows popup shows too — Aura doesn’t hide it.')),
    tog('hudBrightness', L('Jasność', 'Brightness'), MAC ? L('Klawisze jasności wbudowanego ekranu pokazują okienko na wyspie.', 'Brightness keys of the built-in screen show a popup on the island.') : L('Działa na laptopach i monitorach z DDC/CI.', 'Works on laptops and monitors with DDC/CI.')),
    tog('macHudKeys', L('Zamiast okienka macOS', 'Instead of the macOS popup'), L('Aura przejmuje klawisze głośności i jasności: sama zmienia poziom i pokazuje okienko na wyspie, a systemowe się nie pojawia. Wymaga zgody „Dostępność” (Ustawienia systemowe → Prywatność i ochrona). Wyłączone: pokazuje się okienko macOS.', 'Aura takes over the volume and brightness keys: it changes the level itself and shows a popup on the island, and the system one doesn’t appear. Needs the “Accessibility” permission (System Settings → Privacy & Security). Off: the macOS popup shows.')),
    tog('hudBattery', L('Zasilanie i bateria', 'Power and battery')),
    tog('devBattery', L('Bateria myszy i słuchawek obok wyspy', 'Mouse and headset battery next to the island'), L('Małe kropki przy wyspie z ikoną urządzenia i łukiem baterii; przy 15% wyspa przypomni o ładowaniu. Urządzenia Bluetooth oraz SteelSeries na odbiorniku USB (np. Aerox 3, Arctis 7).', 'Small dots next to the island with the device icon and a battery arc; at 15% the island reminds you to charge. Bluetooth devices and SteelSeries on a USB receiver (e.g. Aerox 3, Arctis 7).')),
    tog('hudLockKeys', 'Caps Lock i Num Lock'),
    tog('hudDevice', L('Zmiana urządzenia dźwięku', 'Sound device change'), L('Np. po podłączeniu słuchawek.', 'E.g. after plugging in headphones.')),
    tog('hudMic', L('Wyciszenie mikrofonu', 'Microphone mute')),
    { h: L('Aktywności na żywo', 'Live activities') },
    tog('privacyDot', L('Kropka prywatności', 'Privacy dot'), L('Pomarańczowa, gdy aplikacja używa mikrofonu; zielona przy kamerze.', 'Orange when an app uses the microphone; green for the camera.')),
    tog('callTimer', L('Minutnik rozmowy', 'Call timer'), L('Licznik czasu, gdy dowolna aplikacja ma otwarty mikrofon.', 'A timer while any app has the microphone open.')),
    { h: L('Teraz odtwarzane', 'Now playing') },
    tog('downloads', L('Pobierania na wyspie', 'Downloads on the island'), MAC ? L('Postęp pobierania z przeglądarki (folder Pobrane), a po zakończeniu komunikat.', 'Progress of browser downloads (Downloads folder), with a message when they finish.') : L('Postęp pobierania z przeglądarki (folder Pobrane) oraz gier w Steamie i Epic Games, a po zakończeniu komunikat.', 'Progress of browser downloads (Downloads folder) and of Steam and Epic Games games, with a message when they finish.')),
    tog('downloadsToShelf', L('Pobrane pliki na półkę', 'Downloaded files to the shelf'), '', { when: s => s.downloads !== false }),
    tog('pillLyrics', L('Tekst piosenki w zamkniętej wyspie', 'Song lyrics in the closed island'), L('Bieżąca linijka, jak karaoke (gdy są włączone teksty piosenek i utwór ma tekst z czasami).', 'The current line, like karaoke (when song lyrics are on and the track has timed lyrics).'), { when: s => s.lyrics }),
    tog('lyrics', L('Teksty piosenek', 'Song lyrics'), L('Tytuł, wykonawca i długość utworu trafiają do LRCLIB (darmowa biblioteka tekstów), raz na utwór. Wyłączone = nic nie wychodzi z komputera.', 'The title, artist and length of the track go to LRCLIB (a free lyrics library), once per track. Off = nothing leaves your computer.')),
    seg('pillTitle', L('Tytuł utworu w zamkniętej wyspie', 'Track title in the closed island'), L('Po zmianie utworu tytuł widać przez 3 sekundy, potem wyspa zwija się do okładki i wizualizera.', 'After a track change the title shows for 3 seconds, then the island shrinks to the cover and visualiser.'), [['change', 'Przez 3 s'], ['always', L('Zawsze', 'Always')], ['never', L('Nigdy', 'Never')]]),
    { h: L('Zrzuty ekranu', 'Screenshots') },
    tog('hideFromCaptures', L('Ukryj wyspę na zrzutach i nagraniach', 'Hide the island in screenshots and recordings'), L('Przy powierzchni Szkło wyspa jest ukryta przed przechwytywaniem, bo sama czyta obraz ekranu — chyba że włączysz niżej „Widać wyspę na zrzutach”.', 'With the Glass surface the island is hidden from capture, because it reads the screen image itself — unless you turn on “Island visible in screenshots” below.')),
    tog('glassInShots', L('Szkło: widać wyspę na zrzutach ekranu', 'Glass: island visible in screenshots'), L('Wyspa pokaże się na zrzutach (Win+Shift+S, Print Screen) i nagraniach. Szkło jest wtedy przydymione — bez rozmywania tła na żywo, bo szkło na żywo musiałoby odbijać samo siebie.', 'The island shows in screenshots (Win+Shift+S, Print Screen) and recordings. The glass is then smoky — without live background blur, because live glass would have to reflect itself.'), { when: s => s.surface === 'glass' }),
  ] },
  { id: 'cards', icon: 'widgets', name: L('Karty', 'Cards'), rows: [
    { h: L('Karty na wyspie', 'Cards on the island') },
    tog('tabWeb', 'Web', L('Ulubione strony otwierane w małej przeglądarce pod wyspą (logowanie zostaje zapamiętane).', 'Favourite pages opened in a small browser under the island (sign-ins are remembered).')),
    tog('webNotifications', L('Powiadomienia ze stron Web na wyspie', 'Notifications from Web pages on the island'), L('Np. Messenger w karcie Web: kto i co napisał pokaże się na wyspie zamiast okienka systemowego. Strona musi być otwarta (może być schowana).', 'E.g. Messenger in the Web card: who wrote what shows on the island instead of a system popup. The page must be open (it can be hidden).')),
    tog('tabNotices', L('Powiadomienia', 'Notifications'), 'Ostatnie 24 komunikaty: skrypty, agenci, telefon, zrzuty, przypomnienia.'),
    tog('tabAgents', L('Agenci AI', 'AI agents')), tog('tabShelf', L('Półka', 'Shelf')), tog('tabClips', L('Schowek', 'Clipboard')), tog('tabWidgets', L('Widżety', 'Widgets')),
    tog('tabControls', L('Sterowanie', 'Controls')), tog('tabLauncher', 'Launcher'), tog('tabDeck', L('Telefon (PC Deck)', 'Phone (PC Deck)'), L('Telefon w tej samej sieci Wi-Fi jako gładzik, pilot muzyki i slajdów. Przy pierwszym włączeniu Windows może zapytać o zgodę zapory — kliknij „Zezwól”. Na Macu Aura potrzebuje zgody „Dostępność” (Ustawienia systemowe → Prywatność i ochrona).', 'Your phone on the same Wi-Fi network as a touchpad, music and slide remote. The first time, Windows may ask for firewall permission — click “Allow”. On a Mac Aura needs the “Accessibility” permission (System Settings → Privacy & Security).')), tog('tabCall', L('Rozmowa', 'Call')), tog('tabAirdrop', 'AirDrop', L('Przeciągnij plik na kartę — otworzy się okno AirDrop z wyborem iPhone’a lub Maca.', 'Drop a file on the card — the AirDrop window opens to pick an iPhone or Mac.')),
    { h: L('Powiadomienia', 'Notifications') },
    tog('appNotifications', L('Powiadomienia z innych aplikacji', 'Notifications from other apps'), L('WhatsApp, Discord, Messenger, poczta i inne pokazują się na wyspie (także nad grą). Aura czyta je przez systemowy dostęp do powiadomień Windows; nic nie wychodzi z komputera. Klik otwiera aplikację.', 'WhatsApp, Discord, Messenger, mail and others show on the island (also over a game). Aura reads them through the system access to Windows notifications; nothing leaves your computer. Clicking opens the app.'), { win: true }),
    sld('noticeSeconds', L('Czas powiadomienia', 'Notification time'), L('Jak długo baner zostaje na wyspie.', 'How long the banner stays on the island.'), 2, 20, ' s'),
    tog('noticeClockTime', L('Godziny zamiast „15m”', 'Clock times instead of “15m”'), L('Na liście powiadomień.', 'In the notification list.')),
    { h: L('Pliki i schowek', 'Files and clipboard') },
    tog('capturesToShelf', L('Zrzuty i nagrania na półce', 'Screenshots and recordings to the shelf')),
    tog('phoneShare', L('Wyślij na telefon', 'Send to phone'), L('Kod QR, ta sama sieć Wi-Fi, w obie strony. Odebrane pliki trafiają do Pobrane\\Aura.', 'QR code, the same Wi-Fi network, both ways. Received files go to Downloads\\Aura.')),
    tog('clipboardEnabled', L('Historia schowka', 'Clipboard history'), L('Szyfrowana kontem Windows. Kopie z menedżerów haseł są pomijane.', 'Encrypted with your Windows account. Copies from password managers are skipped.')),
    seg('clipboardLayout', L('Układ schowka', 'Clipboard layout'), '', [['cards', L('Karty', 'Cards')], ['list', L('Lista', 'List')]]),
    sld('clipboardSize', L('Liczba wpisów', 'Number of entries'), L('Przypięte się nie liczą.', 'Pinned ones don’t count.'), 5, 100, ''),
    sld('clipboardKeepHours', L('Ile godzin przechowywać', 'How many hours to keep'), L('0 = bez limitu.', '0 = no limit.'), 0, 168, ' h'),
    { h: 'Launcher' },
    tog('recordPcSound', L('Nagrywaj dźwięk komputera', 'Record computer sound')),
    tog('recordMic', L('Nagrywaj mikrofon', 'Record microphone')),
    { type: 'slots', label: L('Sześć miejsc na aplikacje', 'Six app slots'), desc: L('Kliknij, żeby wybrać aplikację, skrót albo plik.', 'Click to choose an app, shortcut or file.') },
  ] },
  { id: 'widgets', icon: 'sunny', name: L('Widżety', 'Widgets'), rows: [
    { h: 'Pogoda (Open-Meteo)' },
    { type: 'city', label: L('Miejsce', 'Place'), desc: L('Puste = miasto ze strefy czasowej. Nazwa miejsca trafia do Open-Meteo.', 'Empty = the city from your time zone. The place name is sent to Open-Meteo.') },
    tog('fahrenheit', 'Fahrenheit'),
    { h: L('Kalendarz', 'Calendar') },
    { type: 'text', key: 'calendarIcs', label: L('Kanał kalendarza (.ics)', 'Calendar feed (.ics)'), desc: L('Adres iCal z Google Calendar („Tajny adres w formacie iCal”) albo Outlooka. Najbliższe wydarzenie pojawia się w widżecie Dziś.', 'iCal address from Google Calendar (“Secret address in iCal format”) or Outlook. The next event shows in the Today widget.'), placeholder: 'https://…/basic.ics' },
    tog('meetingNotice', 'Powiadom 5 minut przed wydarzeniem'),
    { h: L('Czas', 'Time') },
    seg('timeFormat', L('Format czasu', 'Time format'), '', [['system', 'System'], ['12', '12-godzinny'], ['24', '24-godzinny']]),
    sld('focusMinutes', L('Minuty skupienia', 'Focus minutes'), '', 5, 90, ' min'),
    sld('breakMinutes', L('Minuty przerwy', 'Break minutes'), '', 1, 30, ' min'),
    seg('reminderSound', L('Dźwięk przypomnień', 'Reminder sound'), L('Aż odpowiem = co 15 s, najwyżej przez minutę.', 'Until I answer = every 15 s, for at most a minute.'), [['repeat', L('Aż odpowiem', 'Until I answer')], ['once', L('Raz', 'Once')], ['off', L('Wył.', 'Off')]]),
    { h: L('Statystyki', 'Stats') },
    seg('netUnit', L('Szybkość sieci', 'Network speed'), '', [['MBs', 'MB/s'], ['Mbps', 'Mb/s']]),
  ] },
  { id: 'streaming', icon: 'camera', name: 'Streaming', rows: [
    { h: 'OBS Studio' },
    tog('obsEnabled', L('Połącz z OBS', 'Connect to OBS'), L('Pigułka REC lub LIVE z czasem trwania i sceną. Skróty do nagrywania i transmisji ustawisz w Skrótach.', 'A REC or LIVE pill with the duration and scene. Set recording and streaming shortcuts in Shortcuts.')),
    { type: 'obs', label: L('OBS na tym komputerze', 'OBS on this computer'), desc: L('Wymaga włączonego serwera WebSocket w OBS: Narzędzia → Ustawienia serwera WebSocket → Włącz.', 'Needs the WebSocket server turned on in OBS: Tools → WebSocket Server Settings → Enable.') },
    tog('obsAuto', L('Użyj ustawień z OBS', 'Use settings from OBS'), L('Port i hasło odczytane z konfiguracji OBS.', 'Port and password read from the OBS configuration.'), { when: s => s.obsEnabled }),
    sld('obsPort', 'Port', '', 1024, 65000, '', { input: true, when: s => s.obsEnabled && !s.obsAuto }),
    { type: 'text', key: 'obsPassword', label: L('Hasło', 'Password'), desc: L('Tylko gdy nie używasz ustawień z OBS.', 'Only when you don’t use the settings from OBS.'), placeholder: L('hasło serwera WebSocket', 'WebSocket server password'), when: s => s.obsEnabled && !s.obsAuto, secret: true },
    { h: 'Czat transmisji (Twitch)' },
    { type: 'text', key: 'chatTwitch', label: L('Kanał Twitch', 'Twitch channel'), desc: L('Nazwa albo link do kanału. Czat czytany anonimowo, bez logowania.', 'A channel name or link. The chat is read anonymously, without signing in.'), placeholder: 'np. twitch.tv/nazwa' },
    { type: 'button', label: L('Szuflada czatu', 'Chat drawer'), desc: L('Okno z czatem, które możesz przeciągnąć obok gry. Skrót ustawisz w Skrótach.', 'A chat window you can drag next to your game. Set the shortcut in Shortcuts.'), text: L('Otwórz / zamknij', 'Open / close'), fn: () => W.send('chat-toggle') },
    { type: 'color', key: 'chatBackground', label: L('Tło czatu', 'Chat background') },
    sld('chatOpacity', L('Krycie tła', 'Background opacity'), '', 0, 100, '%'),
    { type: 'color', key: 'chatTextColor', label: L('Kolor tekstu', 'Text colour') },
    sld('chatTextSize', L('Rozmiar tekstu', 'Text size'), '', 10, 30, ' pt'),
  ] },
  { id: 'taskbar', icon: 'grid', name: L('Pasek zadań', 'Taskbar'), rows: [
    { h: L('Pasek zadań Aury', 'Aura taskbar') },
    tog('dock', L('Pasek zadań Aury', 'Aura taskbar'), L('Wyspa u dołu ekranu zamiast paska Windows: Start, przypięte i otwarte aplikacje, grający utwór, minutnik, szybkie ustawienia i zegar. Prawy przycisk na ikonie przypina albo zamyka. Pasek Windows wraca po wyłączeniu (także gdy Aura się zamknie).', 'An island at the bottom of the screen instead of the Windows taskbar: Start, pinned and open apps, the current track, timer, quick settings and clock. Right-click an icon to pin or close it. The Windows taskbar comes back when you turn it off (also if Aura closes).')),
    tog('dockAutoHide', L('Chowaj, gdy okno na niego nachodzi', 'Hide when a window overlaps it'), L('Jak dock na Macu: pasek wysuwa się po dosunięciu kursora do dolnej krawędzi. Wyłączone: okna kończą się nad paskiem, jak przy pasku Windows.', 'Like the Dock on a Mac: the bar slides up when you move the cursor to the bottom edge. Off: windows end above the bar, like with the Windows taskbar.'), { when: s => s.dock }),
    tog('dockTrayAll', L('Wszystkie ikony zasobnika', 'All tray icons'), L('Wyłączone: tylko te, które Windows pokazuje przy zegarze (np. Steam, Epic, Discord).', 'Off: only the ones Windows shows next to the clock (e.g. Steam, Epic, Discord).'), { when: s => s.dock }),
    seg('dockSurface', L('Wygląd paska', 'Taskbar look'), L('„Jak wyspa”: przy szkle pasek też jest ze szkła, przy innych motywach ma kolor wyspy.', '“Like the island”: with glass the taskbar is glass too; with other themes it takes the island colour.'), [['island', L('Jak wyspa', 'Like the island')], ['black', L('Czarny', 'Black')]], { when: s => s.dock }),
    tog('dockMagnify', L('Efekt docka', 'Dock effect'), L('Ikony rosną pod kursorem, jak w docku na Macu.', 'Icons grow under the cursor, like in the Dock on a Mac.'), { when: s => s.dock }),
    sld('dockSize', L('Rozmiar', 'Size'), '', 100, 200, '%', { when: s => s.dock }),
  ] },
  { id: 'wallpaper', icon: 'shot', name: L('Tapeta', 'Wallpaper'), rows: [
    { h: L('Animowana tapeta', 'Animated wallpaper') },
    tog('liveWallpaper', L('Odtwarzaj animowaną tapetę', 'Play an animated wallpaper'), L('Film z dysku gra za ikonami pulpitu, bez dźwięku, dekodowany przez kartę graficzną. Pauzuje pod grami. Po wyłączeniu wraca Twoja zwykła tapeta.', 'A video from your disk plays behind the desktop icons, without sound, decoded by the graphics card. It pauses under games. When off, your usual wallpaper comes back.')),
    { type: 'button', label: L('Film', 'Video'), desc: 'MP4, MOV, MKV, WebM, WMV, AVI.', text: L('Wybierz film…', 'Choose a video…'), fn: async () => { S = await W.invoke('wallpaper-pick'); render(); }, sub: s => s.liveWallpaperFile ? s.liveWallpaperFile.split('\\').pop() : L('Nie wybrano filmu', 'No video chosen') },
    { h: L('Kolory', 'Colours') },
    sld('wpHue', L('Odcień', 'Hue'), '', 0, 360, '°'),
    sld('wpSaturation', L('Nasycenie', 'Saturation'), '', 0, 200, '%'),
    sld('wpBrightness', L('Jasność', 'Brightness'), '', -100, 100, ''),
    sld('wpContrast', L('Kontrast', 'Contrast'), '', 0, 200, '%'),
    { type: 'button', label: L('Oryginalne kolory', 'Original colours'), text: L('Przywróć', 'Reset'), fn: () => set({ wpHue: 0, wpSaturation: 100, wpBrightness: 0, wpContrast: 100 }) },
  ] },
  { id: 'agents', icon: 'agent', name: L('Agenci AI', 'AI agents'), rows: [
    { h: 'Na wyspie' },
    tog('agentsEnabled', L('Pokazuj agentów AI', 'Show AI agents'), L('Co robi każdy agent: pracuje, czeka na Ciebie, skończył.', 'What each agent is doing: working, waiting for you, finished.')),
    tog('agentsNotifyDone', L('Powiadom, gdy któryś skończy', 'Notify when one finishes')),
    { h: L('Agenci', 'Agents') },
    { type: 'claude', label: 'Claude Code', desc: L('Dodaje hooki do ~/.claude/settings.json (z kopią .aura-backup). Raportują tylko na 127.0.0.1.', 'Adds hooks to ~/.claude/settings.json (with a .aura-backup copy). They report only to 127.0.0.1.') },
    tog('agentApprove', L('Zgody z wyspy', 'Permissions from the island'), L('Gdy Claude Code pyta o zgodę (np. na polecenie w terminalu), wyspa pokazuje Zezwól / Odmów / W terminalu. Bez odpowiedzi po ok. 30 s pytanie wraca do terminala.', 'When Claude Code asks for permission (e.g. for a terminal command), the island shows Allow / Deny / In terminal. With no answer after about 30 s the question goes back to the terminal.')),
    { type: 'codex', label: 'Codex', desc: L('Dodaje powiadomienie Aury w ~/.codex/config.toml (z kopią .aura-backup). Dotychczasowe powiadomienia Codexa nadal działają.', 'Adds an Aura notification in ~/.codex/config.toml (with a .aura-backup copy). Your existing Codex notifications keep working.') },
    { h: L('Limity', 'Limits') },
    tog('claudeUsage', L('Wykorzystanie limitów Claude', 'Claude usage limits'), L('Na karcie Agenci: ile zużyłeś z limitu 5-godzinnego i tygodniowego oraz kiedy się zresetują. Aura używa logowania Claude Code z tego komputera i pyta tylko serwery Anthropic.', 'On the Agents card: how much of the 5-hour and weekly limit you’ve used and when they reset. Aura uses the Claude Code sign-in from this computer and only asks Anthropic’s servers.')),
  ] },
  { id: 'tools', icon: 'script', name: L('Narzędzia', 'Tools'), rows: [
    { h: L('Skrypty i kompilacje', 'Scripts and builds') },
    tog('notifyEndpoint', L('Punkt końcowy powiadomień', 'Notification endpoint'), L('Każdy program na tym komputerze może wyświetlić komunikat na wyspie. Tylko 127.0.0.1, przeglądarki są odrzucane.', 'Any program on this computer can show a message on the island. Only 127.0.0.1; browsers are rejected.')),
    sld('notifyPort', 'Port', '', 1024, 65000, '', { step: 1, input: true }),
    { type: 'code' },
  ] },
  { id: 'keys', icon: 'grid', name: L('Skróty', 'Shortcuts'), rows: [
    { type: 'note', text: L('Kliknij pole i naciśnij kombinację. Backspace czyści, Esc anuluje. Unikaj Ctrl+Alt z literami ą ć ę ł ń ó ś ź ż — to AltGr na polskiej klawiaturze.', 'Click a field and press a combination. Backspace clears, Esc cancels. Avoid Ctrl+Alt with letters ą ć ę ł ń ó ś ź ż — that’s AltGr on a Polish keyboard.') },
    tog('tabHotkeys', L('Ctrl+Shift+1…6 otwiera kartę', 'Ctrl+Shift+1…6 opens a card'), L('Wyspa otwiera się od razu na 1., 2., … 6. karcie z paska kart. Na pigułce: kółko myszy zmienia głośność, przesunięcie w bok (gładzik albo Shift + kółko) przełącza utwór.', 'The island opens straight on the 1st, 2nd, … 6th card of the tab bar. On the pill: the mouse wheel changes the volume, a sideways swipe (touchpad or Shift + wheel) switches the track.')),
    ...[['open', L('Otwórz lub zamknij wyspę', 'Open or close the island')], ['hide', L('Ukryj lub pokaż Aurę', 'Hide or show Aura')], ['playPause', L('Odtwórz / wstrzymaj', 'Play / pause')], ['next', L('Następny utwór', 'Next track')], ['prev', L('Poprzedni utwór', 'Previous track')],
      ['focus', 'Minutnik skupienia: start / pauza'], ['micMute', L('Wycisz lub włącz mikrofon (wszystkie aplikacje)', 'Mute or unmute the microphone (all apps)')], ['colorPick', L('Kopiuj kolor spod kursora', 'Copy the colour under the cursor')],
      ['screenshot', L('Zrzut ekranu (Obrazy + półka)', 'Screenshot (Pictures + shelf)')], ['snip', L('Wycinek ekranu', 'Screen snip')], ['record', L('Nagrywanie ekranu', 'Screen recording')],
      ['chat', L('Szuflada czatu transmisji', 'Stream chat drawer')], ['obsRecord', 'OBS: nagrywanie start / stop'], ['obsStream', 'OBS: transmisja start / stop']].map(([k, l]) => ({ type: 'hotkey', key: k, label: l })),
  ] },
  { id: 'about', icon: 'note', name: L('Informacje', 'About'), rows: [
    { type: 'about' },
    { type: 'button', label: L('Co nowego', 'What’s new'), desc: L('Zmiany w ostatnich wersjach Aury.', 'Changes in the latest versions of Aura.'), text: L('Pokaż zmiany', 'Show changes'), fn: () => WhatsNew.open() },
    { type: 'button', label: L('Wprowadzenie', 'Introduction'), desc: L('Krótki przewodnik po Aurze: jak otwierać wyspę, co jest w kartach, skróty.', 'A short guide to Aura: how to open the island, what’s in the cards, shortcuts.'), text: L('Pokaż wprowadzenie', 'Show the introduction'), fn: () => window.Welcome && Welcome.open() },
    { h: L('Aktualizacje', 'Updates') },
    { type: 'update', label: L('Wersja', 'Version'), desc: L('Aura sprawdza GitHuba przy starcie i co 6 godzin. W wersji z instalatorem (Windows) i na Macu w folderze Aplikacje nowa wersja pobiera się sama i instaluje po ponownym uruchomieniu.', 'Aura checks GitHub at start-up and every 6 hours. In the installer version (Windows) and on a Mac in the Applications folder the new version downloads by itself and installs after a restart.') },
    tog('updateNotify', L('Powiadamiaj o nowych wersjach', 'Notify about new versions'), L('Okienko na wyspie, gdy pojawi się nowa wersja.', 'A popup on the island when a new version comes out.')),
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
    if (glassReady === 'ok') {
      GlassBg.setBlur((S.glassBlur ?? 50) / 100);
      const live = !MAC || S.macRealGlass; // Mac: obraz pulpitu tylko przy włączonym „Prawdziwym szkle”
      if (live && !GlassBg.running) { W.invoke('settings-pos'); GlassBg.start(); } else if (!live && GlassBg.running) GlassBg.stop();
    }
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
    main.append(el('div', 'kicker', L('Szukaj', 'Search')), el('h1', '', L(`„${query}”`, `“${query}”`)));
    let n = 0;
    for (const p of PAGES) {
      if (hiddenPage(p)) continue;
      const hits = p.rows.filter(r => !hiddenRow(r) && r.label && (r.label + ' ' + (r.desc || '')).toLowerCase().includes(query.toLowerCase()));
      if (!hits.length) continue;
      main.append(el('h2', '', p.name)); hits.forEach(r => { main.append(rowEl(r)); n++; });
    }
    if (!n) main.append(el('div', 'empty', L('Nic nie znaleziono.', 'Nothing found.')));
    sendPreviewRect();
    return;
  }
  const p = PAGES.find(x => x.id === page) || PAGES[0];
  main.append(el('div', 'kicker', L('Ustawienia', 'Settings')));
  const h = el('h1', '', p.name);
  queueMicrotask(sendPreviewRect);
  if (p.preview) { const b = el('button', 'preview', L('Pokaż otwartą wyspę', 'Show the open island')); b.title = L('Wyspa zostaje otwarta, dopóki nie najedziesz na nią kursorem i z niej nie zjedziesz.', 'The island stays open until you move the cursor onto it and off again.'); b.onclick = () => W.send('pin-open'); h.append(b); }
  main.append(h);
  if (p.preview) main.append(previewEl());
  for (const r of p.rows) {
    if (hiddenRow(r)) continue;
    if (r.h) { main.append(el('h2', '', r.h)); continue; }
    main.append(rowEl(r));
  }
}
// Podgląd na żywo: prawdziwa wyspa w widoku nad tym miejscem (rysuje ją Aura), przełącznik spoczynek / otwarta.
// Pasek przyklejony u góry strony — widać go przy przewijaniu ustawień.
let pvOpen = false, pvRaf = 0;
function previewEl() {
  const box = el('div', 'pv');
  const stage = el('div', 'pv-stage'); stage.id = 'pvStage';
  const bar = el('div', 'pv-bar');
  bar.append(el('span', 'pv-note', L('Podgląd na żywo — każda zmiana od razu na wyspie. Muzykę możesz sterować także tutaj.', 'Live preview — every change shows on the island right away. You can control the music from here too.')));
  const seg = el('div', 'pv-seg');
  for (const [v, label] of [[false, 'W spoczynku'], [true, L('Otwarta', 'Open')]]) {
    const b = el('button', pvOpen === v ? 'on' : '', label);
    b.onclick = () => { pvOpen = v; W.send('preview-open', v); seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
    seg.append(b);
  }
  bar.append(seg); box.append(stage, bar);
  return box;
}
// gdzie ma stać widok podglądu (albo null, gdy na stronie go nie ma) — po każdym rysowaniu, przewinięciu i zmianie rozmiaru
function sendPreviewRect() {
  cancelAnimationFrame(pvRaf);
  pvRaf = requestAnimationFrame(() => {
    const s = $('#pvStage'), m = $('#main');
    if (!s) return W.send('preview-rect', null);
    const r = s.getBoundingClientRect(), mr = m.getBoundingClientRect();
    const top = Math.max(r.top, mr.top), bottom = Math.min(r.bottom, mr.bottom);
    if (bottom - top < 60) return W.send('preview-rect', null);
    W.send('preview-rect', { x: r.left, y: top, w: r.width, h: bottom - top, zoom: Math.min(1, r.width / 760) });
  });
}
addEventListener('resize', sendPreviewRect);
$('#main') && $('#main').addEventListener('scroll', sendPreviewRect, { passive: true });
function rowEl(r) {
  if (r.type === 'note') { const d = el('p', 'lead', r.text); return d; }
  if (r.type === 'code') {
    const port = S.notifyPort;
    return el('div', 'code', L(`curl -X POST http://127.0.0.1:${port}/notify -d "{\\"title\\":\\"Build\\",\\"body\\":\\"gotowy\\"}"\n\nnode "${location.pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/settings\/index\.html$/, '').replace(/\//g, '\\')}\\tools\\aura-notify.js" "Build gotowy" "0 błędów"\n\nPOST /agent {"session":"id","harness":"Mój agent","state":"working|needs|done|end","title":"…","project":"…"}`, `curl -X POST http://127.0.0.1:${port}/notify -d "{\\"title\\":\\"Build\\",\\"body\\":\\"ready\\"}"\n\nnode "${location.pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/settings\/index\.html$/, '').replace(/\//g, '\\')}\\tools\\aura-notify.js" "Build ready" "0 errors"\n\nPOST /agent {"session":"id","harness":"My agent","state":"working|needs|done|end","title":"…","project":"…"}`));
  }
  if (r.type === 'about') {
    const d = el('div');
    const by = el('p', 'lead'); by.append(document.createTextNode('Autor: '));
    const a = el('a', '', 'FameFabricators'); a.href = '#'; a.style.cssText = 'color:var(--accent);font-weight:700;text-decoration:none';
    a.onclick = e => { e.preventDefault(); W.send('open-author'); };
    by.append(a, document.createTextNode(' · famefabricators.pl'));
    d.append(by);
    d.append(el('p', 'lead', L('Aura — Twoja własna wyspa u góry ekranu. Muzyka, półka na pliki, schowek, widżety, przypomnienia, agenci AI i komunikaty systemowe.', 'Aura — your own island at the top of the screen. Music, a shelf for files, clipboard, widgets, reminders, AI agents and system messages.')));
    d.append(el('p', 'lead', L('Bez konta, bez reklam i bez telemetrii. Ustawienia i dane są w %APPDATA%\\Aura. Pogoda pochodzi z Open-Meteo, teksty piosenek (po włączeniu) z LRCLIB.', 'No account, no ads and no telemetry. Settings and data are in %APPDATA%\\Aura. Weather comes from Open-Meteo, song lyrics (when on) from LRCLIB.')));
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
      const b = el('button', 'btn', L('Sprawdź teraz', 'Check now'));
      const show = s => {
        if (!s) return;
        const txt = { idle: '', dev: L('wersja z kodu (bez aktualizacji)', 'version from source (no updates)'), checking: L('sprawdzam…', 'checking…'), waiting: L(`${s.latest} — czekam na pliki dla tego komputera`, `${s.latest} — waiting for the files for this computer`), current: L('masz najnowszą', 'you have the latest'), available: L(`dostępna ${s.latest}`, `${s.latest} available`),
          downloading: L(`pobieram ${s.latest}`, `downloading ${s.latest}`) + (s.percent != null ? ' · ' + s.percent + '%' : ''), ready: L(`${s.latest} gotowa — uruchom ponownie`, `${s.latest} ready — restart`), error: L('nie udało się sprawdzić', 'couldn’t check') }[s.status] || '';
        status.textContent = `v${s.current}${txt ? ' · ' + txt : ''}`;
        b.textContent = s.status === 'ready' ? L('Uruchom ponownie', 'Restart') : s.status === 'available' && s.mode === 'notify' ? L('Pobierz', 'Download') : L('Sprawdź teraz', 'Check now');
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
      const status = el('span', 'val', L('Sprawdzam…', 'Checking…')); status.style.minWidth = 'auto'; ctl.append(status);
      Promise.all([W.invoke('obs-local'), W.invoke('obs-state')]).then(([loc, s]) => {
        if (s && s.connected) status.textContent = L(`Połączono${s.scene ? ' · ' + s.scene : ''}`, `Connected${s.scene ? ' · ' + s.scene : ''}`);
        else if (s && s.error && S.obsEnabled) status.textContent = s.error;
        else status.textContent = !loc.found ? L('Nie znaleziono OBS', 'OBS not found') : loc.enabled ? L(`Serwer włączony · port ${loc.port}`, `Server on · port ${loc.port}`) : L('Serwer WebSocket wyłączony w OBS', 'WebSocket server is off in OBS');
      });
      break;
    }
    case 'text': {
      const inp = el('input', 'txt'); inp.placeholder = r.placeholder || ''; inp.value = S[r.key] || ''; inp.spellcheck = false; if (r.secret) inp.type = 'password';
      const b = el('button', 'btn', L('Zapisz', 'Save'));
      const go = async () => { await set({ [r.key]: inp.value.trim() }); };
      b.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      ctl.append(inp, b); break;
    }
    case 'city': {
      const inp = el('input', 'txt'); inp.placeholder = S.weatherName || L('np. Kraków', 'e.g. London'); inp.value = S.weatherCity || '';
      const b = el('button', 'btn', L('Zapisz', 'Save'));
      const go = async () => { b.disabled = true; b.textContent = L('Szukam…', 'Searching…'); const w = await W.invoke('weather-city', inp.value.trim()); S = await W.invoke('settings-get'); b.disabled = false; b.textContent = w && !w.error ? `✓ ${S.weatherName || 'Zapisano'}` : L('Nie znaleziono', 'Not found'); };
      b.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      ctl.append(inp, b); break;
    }
    case 'slots': {
      row.classList.add('block'); ctl.style.maxWidth = 'none';
      const g = el('div', 'slots');
      (S.launchApps || []).forEach((p, i) => {
        const s = el('div', 'slot'); s.append(el('b', '', i + 1)); s.append(el('span', '', p ? p.split('\\').pop() : L('Puste', 'Empty')));
        const pick = el('button', 'btn ghost', L('Wybierz', 'Choose')); pick.onclick = async () => { await W.invoke('launch-pick', i); S = await W.invoke('settings-get'); render(); };
        s.append(pick);
        if (p) { const c = el('button', 'btn ghost', L('Wyczyść', 'Clear')); c.onclick = () => { const l = [...S.launchApps]; l[i] = ''; set({ launchApps: l }); }; s.append(c); }
        g.append(s);
      });
      ctl.append(g); break;
    }
    case 'claude': {
      const status = el('span', 'val', { connected: L('Połączono', 'Connected'), disconnected: L('Nie połączono', 'Not connected'), missing: L('Nie znaleziono na tym komputerze', 'Not found on this computer') }[claude] || claude);
      status.style.minWidth = 'auto';
      const b = el('button', 'btn', claude === 'connected' ? L('Odłącz', 'Unpair') : L('Połącz', 'Connect'));
      b.onclick = async () => { claude = await W.invoke('claude-connect', claude !== 'connected'); render(); };
      ctl.append(status, b); break;
    }
    case 'codex': {
      const status = el('span', 'val', { connected: L('Połączono', 'Connected'), disconnected: L('Nie połączono', 'Not connected'), missing: L('Nie znaleziono na tym komputerze', 'Not found on this computer') }[codex] || codex);
      status.style.minWidth = 'auto';
      const b = el('button', 'btn', codex === 'connected' ? L('Odłącz', 'Unpair') : L('Połącz', 'Connect')); b.disabled = codex === 'missing';
      b.onclick = async () => { codex = await W.invoke('codex-connect', codex !== 'connected'); render(); };
      ctl.append(status, b); break;
    }
    case 'hotkey': {
      const b = el('button', 'hk' + (hkErrors.includes(r.key) ? ' err' : ''), pretty(S.hotkeys[r.key]) || L('Nie ustawiono', 'Not set'));
      if (hkErrors.includes(r.key)) lbl.append(el('small', 'warn', L('Ten skrót jest zajęty przez inną aplikację.', 'This shortcut is taken by another app.')));
      if (ALTGR.test(S.hotkeys[r.key] || '')) lbl.append(el('small', 'warn', L('Koliduje z polską literą (AltGr).', 'Clashes with a Polish letter (AltGr).')));
      b.onclick = () => recordHotkey(b, r.key);
      ctl.append(b); break;
    }
  }
  return row;
}
const pretty = a => (a || '').replace('Control', 'Ctrl').replace(/\+/g, ' + ');

// ---------- nagrywanie skrótu ----------
function recordHotkey(btn, key) {
  btn.classList.add('rec'); btn.textContent = L('Naciśnij kombinację…', 'Press a combination…');
  W.send('hotkeys-pause', true);
  const done = accel => { window.removeEventListener('keydown', onKey, true); btn.removeEventListener('blur', cancel); W.send('hotkeys-pause', false); if (accel !== undefined) set({ hotkeys: { [key]: accel } }); else render(); };
  const cancel = () => done();
  const onKey = e => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') return done();
    if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey) return done('');
    if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return;
    const mods = []; if (e.ctrlKey) mods.push('Control'); if (e.altKey) mods.push('Alt'); if (e.shiftKey) mods.push('Shift'); if (e.metaKey) mods.push('Super');
    if (!mods.length) { btn.textContent = L('Dodaj Ctrl, Alt lub Shift', 'Add Ctrl, Alt or Shift'); return; }
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
// welcome.js i whatsnew.js wczytują się po tym pliku, a odpowiedzi z procesu głównego potrafią przyjść wcześniej —
// wtedy „Co nowego” po aktualizacji (i wprowadzenie) po cichu się nie otwierały. Otwieramy je dopiero po wczytaniu strony.
const whenLoaded = fn => (document.readyState === 'complete' ? setTimeout(fn, 0) : addEventListener('load', () => setTimeout(fn, 0), { once: true }));
const openWelcome = () => whenLoaded(() => window.Welcome && Welcome.open());
const openWhatsNew = from => whenLoaded(() => window.WhatsNew && WhatsNew.open(from));
W.on('goto', p => { if (p === 'welcome') { openWelcome(); return; } if (/^whatsnew/.test(p)) { openWhatsNew(p.split(':')[1]); return; } page = p; query = ''; render(); });
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
  if (page === 'welcome') { page = 'look'; openWelcome(); }
  if (/^whatsnew/.test(page)) { const from = page.split(':')[1]; page = 'about'; openWhatsNew(from); } // po aktualizacji
  applyTheme(); render();
})();
