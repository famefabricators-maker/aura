/* Język stron Aury. Ładowany jako pierwszy skrypt: daje L('po polsku', 'in English') i LOC (format dat).
   Język wybiera proces główny (preload: wyspa.lang); telefon (PC Deck) dostaje go w zmiennej AURA_LANG.
   Stały tekst z plików .html tłumaczy słownik poniżej (tylko po angielsku — po polsku nic się nie dzieje). */
(() => {
  const lang = (window.wyspa && window.wyspa.lang) || window.AURA_LANG || new URLSearchParams(location.search).get('lang') || 'pl';
  window.LANG = lang;
  window.L = lang === 'en' ? (pl, en) => en : pl => pl;
  window.LOC = lang === 'en' ? (/^en/i.test(navigator.language) ? navigator.language : 'en-US') : 'pl-PL';
  document.documentElement.lang = lang;
  if (lang !== 'en') return;
  const EN = {
    // wyspa
    'Ustawienia': 'Settings', 'Tło: kolory albumu / jednolite': 'Background: album colours / solid',
    'Tekst piosenki: włącz / wyłącz (pobierany z LRCLIB)': 'Song lyrics: on / off (from LRCLIB)', 'Nazwa': 'Name',
    'Upuść tu plik albo kliknij, żeby wysłać pliki z półki przez AirDrop': 'Drop a file here or click to send the shelf files with AirDrop',
    'Wyczyść półkę': 'Clear the shelf', 'Kod QR': 'QR code', 'Karty / lista': 'Cards / list', 'Wróć': 'Back',
    'Dodaj zadanie…': 'Add a task…', 'Szybka notatka…': 'Quick note…', 'Przypomnienia': 'Reminders', 'Przypomnij mi…': 'Remind me…',
    'Wybierz godzinę': 'Pick a time', 'Zmień głośniki': 'Change speakers', 'Zmień mikrofon': 'Change microphone',
    'Nic teraz nie gra': 'Nothing is playing', 'Włącz muzykę w Spotify, YouTube albo innej aplikacji.': 'Play music in Spotify, YouTube or another app.',
    'Dodaj': 'Add', 'Anuluj': 'Cancel', 'Strona otwiera się w małej przeglądarce pod wyspą. Logujesz się raz.': 'The page opens in a small browser under the island. You sign in once.',
    'Brak powiadomień': 'No notifications', 'Tu trafiają komunikaty ze skryptów, agentów, telefonu, zrzutów i przypomnień.': 'Messages from scripts, agents, your phone, screenshots and reminders land here.',
    'Wyczyść wszystko': 'Clear all', 'Brak uruchomionych agentów': 'No agents running', 'Połącz Claude Code w Ustawieniach → Agenci AI.': 'Connect Claude Code in Settings → AI agents.',
    'Ustawienia agentów': 'Agent settings', 'Półka': 'Shelf', 'Wyślij na telefon': 'Send to phone', 'Upuść tu pliki': 'Drop files here',
    'Poczekają na półce, aż przeciągniesz je dalej.': 'They’ll wait on the shelf until you drag them on.', 'Zeskanuj aparatem telefonu': 'Scan with your phone camera',
    'Telefon i komputer muszą być w tej samej sieci Wi-Fi. Działa w obie strony: z telefonu wyślesz zdjęcia, pliki i tekst.': 'The phone and the computer must be on the same Wi-Fi network. It works both ways: from the phone you can send photos, files and text.',
    'Zakończ udostępnianie': 'Stop sharing', 'Zostaw plik na wyspie': 'Keep the file on the island', 'Wyślij na iPhone’a lub Maca': 'Send to an iPhone or Mac',
    'Przeciągnij tu plik — wybierzesz iPhone’a albo Maca, na który go wysłać.': 'Drop a file here — you’ll choose the iPhone or Mac to send it to.',
    'Wszystko': 'All', 'Tekst': 'Text', 'Obrazy': 'Images', 'Przypięte': 'Pinned', 'Wyczyść': 'Clear', 'Schowek jest pusty': 'The clipboard is empty',
    'Skopiuj coś (Ctrl+C), a trafi tutaj. Kliknij wpis, żeby skopiować go ponownie.': 'Copy something (Ctrl+C) and it lands here. Click an entry to copy it again.',
    'Co zużywa pamięć': 'What’s using memory', 'Zamknij': 'Close', 'Za 10 min': 'In 10 min', 'Za 30 min': 'In 30 min', 'Za godzinę': 'In an hour',
    'Dziś wieczorem': 'This evening', 'Jutro rano': 'Tomorrow morning', 'Raz': 'Once', 'Codziennie': 'Daily', 'Dni robocze': 'Weekdays', 'Co tydzień': 'Weekly',
    'Ustaw przypomnienie': 'Set a reminder', 'n/d': 'n/a', 'Bateria': 'Battery', 'Zrównoważony': 'Balanced', 'Wydajność': 'Performance',
    'Zrzut': 'Screenshot', 'Wycinek': 'Snip', 'Nagraj': 'Record',
    'Twój telefon jako pilot do tego komputera: gładzik, muzyka, Twoje aplikacje, pilot do slajdów i pisanie. Przez przeglądarkę telefonu, w tej samej sieci Wi-Fi. Każdy telefon zatwierdzasz tutaj.': 'Your phone as a remote for this computer: touchpad, music, your apps, slide remote and typing. Through the phone’s browser, on the same Wi-Fi network. You approve each phone here.',
    'Włącz PC Deck': 'Turn on PC Deck', 'Telefon się nie łączy? Zezwól Aurze w Zaporze Windows na sieci prywatne.': 'Phone won’t connect? Allow Aura on private networks in Windows Firewall.',
    'Nowy adres': 'New address', 'Wyłącz': 'Turn off', 'Mikrofon włączony': 'Microphone on', 'Kliknij, by wyciszyć we wszystkich aplikacjach': 'Click to mute in all apps',
    'Sprawdź kamerę': 'Check the camera', 'Ustawienia dźwięku': 'Sound settings',
    // ustawienia
    'Szukaj w ustawieniach': 'Search settings', 'Wyczyść wyszukiwanie': 'Clear search', 'Aura — ustawienia': 'Aura — settings', 'stworzone przez': 'made by',
    // pasek zadań
    'Szybkie ustawienia': 'Quick settings', 'Powiadomienia i kalendarz': 'Notifications and calendar', 'Aura — pasek zadań': 'Aura — taskbar',
    // czat
    'Stan połączenia': 'Connection status', 'Przypnij nad wszystkim': 'Keep on top', 'Zamknij czat': 'Close chat', 'Czat transmisji': 'Stream chat', 'Czat': 'Chat',
    'łączę…': 'connecting…', 'Czekam na pierwsze wiadomości': 'Waiting for the first messages', 'Nowe wiadomości': 'New messages',
    // telefon (PC Deck)
    'Poprzedni': 'Previous', 'Odtwórz / pauza': 'Play / pause', 'Następny': 'Next', 'Ciszej': 'Quieter', 'Wycisz': 'Mute', 'Głośniej': 'Louder',
    'Napisz na komputer…': 'Type on the computer…', 'Klawiatura': 'Keyboard', 'Czułość gładzika': 'Touchpad sensitivity', 'Poprzedni slajd': 'Previous slide',
    'Następny slajd': 'Next slide', '10 sekund wstecz': '10 seconds back', '10 sekund do przodu': '10 seconds forward', 'Szukaj aplikacji…': 'Search apps…',
    'Telefon jako pilot do tego komputera: muzyka, gładzik, aplikacje i tryby.': 'Your phone as a remote for this computer: music, touchpad, apps and modes.',
    'Nazwa telefonu': 'Phone name', 'Połącz z komputerem': 'Connect to the computer', 'Na komputerze zatwierdź ten telefon. Sprawdź, czy kod się zgadza:': 'Approve this phone on the computer. Check that the code matches:',
    'Komputer': 'Computer', 'Restart za 30 s': 'Restart in 30 s', 'Nic nie gra': 'Nothing playing', 'Włącz muzykę na komputerze': 'Play some music on the computer',
    'Wyślij': 'Send', 'Przesuń, aby poruszać kursorem': 'Slide to move the cursor', 'stuknij = klik · dwa palce = przewijanie / prawy klik': 'tap = click · two fingers = scroll / right-click',
    'stuknij dwa razy i przesuń = przeciąganie': 'double-tap and slide = drag', 'Lewy': 'Left', 'Prawy': 'Right', 'Czułość': 'Sensitivity', 'Aplikacje': 'Apps',
    'Edytuj': 'Edit', 'Stuknij miejsce, aby wybrać aplikację z komputera.': 'Tap a slot to choose an app from the computer.', 'Przełącz okno': 'Switch window',
    'Pulpit': 'Desktop', 'Gra': 'Game', 'Prezentacja': 'Slides', 'Film': 'Video', 'Praca': 'Work', 'Mikrofon': 'Microphone', 'Zrzut ekranu': 'Screenshot',
    'Zapisz klip': 'Save clip', 'Nagrywanie': 'Recording', 'Od początku': 'From the start', 'Od tego slajdu': 'From this slide', 'Wskaźnik': 'Pointer',
    'Czarny ekran': 'Black screen', 'Biały ekran': 'White screen', 'Zakończ': 'End', 'Pełny ekran': 'Full screen', 'Kopiuj': 'Copy', 'Wklej': 'Paste',
    'Cofnij': 'Undo', 'Zablokuj': 'Lock', 'od razu': 'right away', 'Uśpij': 'Sleep', 'po potwierdzeniu': 'after confirming', 'Uruchom ponownie': 'Restart',
    'za 30 s': 'in 30 s', 'Teraz': 'Now', 'Gładzik': 'Touchpad', 'Tryby': 'Modes', 'Miejsce 1': 'Slot 1', 'Wczytuję aplikacje z komputera…': 'Loading apps from the computer…',
    'Uruchomić ponownie?': 'Restart?',
    // tapeta i Web
    'Aura – tapeta': 'Aura – wallpaper', 'Wstecz': 'Back', 'Dalej': 'Forward', 'Odśwież': 'Reload', 'Otwórz w przeglądarce': 'Open in browser',
    'Minimalizuj': 'Minimise', 'Zamknij (Esc) — strona gra dalej w tle': 'Close (Esc) — the page keeps playing in the background', 'Aura — Web': 'Aura — Web',
  };
  const tr = s => { const k = s.trim(); const e = EN[k]; return e ? s.replace(k, e) : s; };
  function run() {
    document.title = tr(document.title);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) if (n.nodeValue.trim()) n.nodeValue = tr(n.nodeValue);
    for (const el of document.querySelectorAll('[title],[placeholder],[aria-label]'))
      for (const a of ['title', 'placeholder', 'aria-label']) if (el.hasAttribute(a)) el.setAttribute(a, tr(el.getAttribute(a)));
  }
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
})();
