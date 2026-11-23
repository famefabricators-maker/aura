// Aura — proces główny: okna, ustawienia, skróty, schowek, półka, przypomnienia, serwery.
const {
  app, BrowserWindow, ipcMain, screen, clipboard, ClipboardItem, nativeImage, Tray, Menu,
  globalShortcut, shell, dialog, desktopCapturer, session, powerMonitor, net, systemPreferences, WebContentsView,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const { Store } = require('./lib/store');
const { Helper } = require('./lib/helper');
const { LocalEndpoint, PhoneShare } = require('./lib/servers');
const { Taskbar, restoreLeftover } = require('./lib/taskbar');

// Wersja przenośna (ZIP): plik „portable” obok Aura.exe → wszystkie dane, pamięć podręczna i pliki tymczasowe
// trzymamy w folderze aplikacji, np. na dysku D:, a nie na C:.
const PORTABLE = app.isPackaged && fs.existsSync(path.join(path.dirname(process.execPath), 'portable'));
if (PORTABLE) {
  const base = path.join(path.dirname(process.execPath), 'dane');
  app.setPath('userData', base);
  const tmp = path.join(base, 'tmp');
  try { fs.mkdirSync(tmp, { recursive: true }); process.env.TEMP = process.env.TMP = tmp; } catch {}
}
process.env.AURA_CACHE = path.join(app.getPath('userData'), 'native'); // tu pomocnicy kompilują kod natywny

// Dziennik błędów (Windows: %APPDATA%\Aura, macOS: ~/Library/Application Support/Aura) — żeby dało się sprawdzić,
// czemu Aura nie startuje, bez dostępu do komputera użytkownika.
const logError = (kind, e) => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'aura-bledy.log'), `${new Date().toISOString()} ${app.getVersion()} ${kind}: ${(e && e.stack) || e}\n`); } catch {} };
// Ikona pliku/aplikacji. macOS 26: app.getFileIcon w Electronie 45 wywraca całą Aurę (EXC_BREAKPOINT w wątku tła,
// np. przy ikonie Spotify zaraz po starcie) — na Macu bez ikon systemowych, Aura ma własne zastępcze.
const fileIcon = (p, opts = { size: 'large' }) => (process.platform === 'darwin' ? Promise.resolve(nativeImage.createEmpty()) : app.getFileIcon(p, opts));
process.on('uncaughtException', e => logError('wyjątek', e));
process.on('unhandledRejection', e => logError('obietnica', e));
app.on('render-process-gone', (_, wc, d) => logError('okno', `${d.reason} (${d.exitCode}) ${wc && wc.getURL().split('/').slice(-2).join('/')}`));
app.on('child-process-gone', (_, d) => { if (d.reason !== 'clean-exit') logError('proces', `${d.type} ${d.reason} (${d.exitCode})`); });

app.setAppUserModelId('pl.aura.app');
// macOS: Chromium szyfruje ciasteczka kluczem z pęku kluczy, a bez podpisu Developer ID system pytał o hasło po każdej
// aktualizacji i Aura stała do odpowiedzi. Atrapa pęku kluczy wyłącza to pytanie.
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain');
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const WIN_W = 780, WIN_H = 500;
migrateFromWyspa();
const store = new Store();

// Zmiana nazwy Wyspa -> Aura: jednorazowo przenosi ustawienia i dane ze starego folderu
// (razem z „Local State”, bo nim jest zaszyfrowana historia schowka) i usuwa stary wpis autostartu.
function migrateFromWyspa() {
  try {
    const dst = app.getPath('userData');
    const src = path.join(app.getPath('appData'), 'Wyspa');
    if (path.resolve(src).toLowerCase() === path.resolve(dst).toLowerCase()) return;
    if (fs.existsSync(path.join(dst, 'ustawienia.json')) || !fs.existsSync(path.join(src, 'ustawienia.json'))) return;
    fs.mkdirSync(dst, { recursive: true });
    for (const f of ['ustawienia.json', 'dane2.json', 'dane.json', 'schowek.bin', 'deck.json', 'Local State']) {
      try { if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f)); } catch {}
    }
    execFile('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'pl.wyspa.app', '/f'], { windowsHide: true }, () => {});
  } catch {}
}
const S = () => store.settings;
// macOS: własny pomocnik (AppleScript zamiast PowerShella), okno nad paskiem menu wokół fabrycznego notcha
const IS_MAC = process.platform === 'darwin';
const helper = IS_MAC ? new (require('./lib/helper-mac').MacHelper)() : new Helper();
let notch = { has: false, w: 0, h: 0 };
// notch liczy się tylko przy wyspie u góry; na dole (także na Macu) wyspa to zwykła pigułka nad Dockiem
const notchActive = () => IS_MAC && notch.has && S().edge !== 'bottom';
const endpoint = new LocalEndpoint();
const downloadsDir = () => path.join(app.getPath('downloads'), 'Aura');
const phone = new PhoneShare(() => store.data.files, downloadsDir());

let island = null, settingsWin = null, tray = null, quitting = false;
let rects = { c: { x: 300, y: 0, w: 180, h: 36 }, o: { x: 180, y: 0, w: 420, h: 240 } };
let interactive = false, open = false, insideSince = 0, lastInside = 0, hold = false, pin = false, pinEntered = false;
let userHidden = false, fsHidden = false, alertActive = false;

// ---------- pomocnicze ----------
const send = (ch, payload, win = island) => { if (!quitting && win && !win.isDestroyed()) win.webContents.send(ch, payload); };
const both = (ch, payload) => { send(ch, payload, island); send(ch, payload, settingsWin); };
const newId = () => crypto.randomBytes(6).toString('hex');

// ---------- okno wyspy ----------
function place() {
  if (!island) return;
  const d = screen.getPrimaryDisplay().bounds;
  const m = Number(S().edgeMargin) || 24, pad = 34; // pad = odstęp wyspy od krawędzi okna (renderer)
  let x = d.x + (d.width - WIN_W) / 2;
  const centered = notchActive(); // na Macu z notchem (wyspa u góry) wyspa otacza wycięcie
  if (!centered && S().position === 'left') x = d.x + m - pad;
  if (!centered && S().position === 'right') x = d.x + d.width - m + pad - WIN_W;
  // na dole: okno stoi nad paskiem zadań (obszar roboczy), wyspa przy jego dolnej krawędzi
  const wa = screen.getPrimaryDisplay().workArea;
  // na dole z paskiem zadań Aury: wyspa pływa tuż nad paskiem (dolna krawędź ekranu zostaje dla paska)
  // na dole: okno przy dolnej krawędzi obszaru roboczego; nad pasek zadań Aury wyspę unosi sam widok (dockLift)
  const y = !centered && S().edge === 'bottom' ? wa.y + wa.height - WIN_H : d.y;
  island.setBounds({ x: Math.round(x), y, width: WIN_W, height: WIN_H });
  send('screen', screenInfo());
}
function screenInfo() {
  const d = screen.getPrimaryDisplay();
  const b = island ? island.getBounds() : { x: 0, y: 0 };
  return { w: d.bounds.width, h: d.bounds.height, x: d.bounds.x, y: d.bounds.y, winX: b.x - d.bounds.x, winY: b.y - d.bounds.y, scale: d.scaleFactor,
    // WYSPA_FAKE_NOTCH: podgląd układu macOS z notchem na Windowsie (tylko do testów)
    platform: process.env.WYSPA_FAKE_NOTCH ? 'darwin' : process.platform,
    notch: S().edge === 'bottom' ? { has: false, w: 0, h: 0 } : process.env.WYSPA_FAKE_NOTCH ? { has: true, w: 200, h: 32 } : notch,
    dockBelow: !!(taskbar && taskbar.active && S().edge === 'bottom'),        // wyspa nad paskiem zadań Aury = pływająca pigułka
    dockShown: !!(taskbar && taskbar.active && !taskbar.isHidden()), dockLift: taskbar && taskbar.active ? taskbar.reserve + 4 : 0 };
}

let macNativeMod = null;
const macNative = () => macNativeMod || (macNativeMod = IS_MAC ? require('./lib/mac-native') : { pinWindow: () => null, startKeys: () => 'błąd', stopKeys() {}, keysActive: () => false, dragState: () => null, dragFiles: () => [] });
function createIsland() {
  island = new BrowserWindow({
    width: WIN_W, height: WIN_H, frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false,
    alwaysOnTop: true, show: false, backgroundColor: '#00000000', title: 'Aura',
    // macOS: hiddenInMissionControl — w Mission Control / widoku wszystkich okien wyspa nie jest układana razem
    // z innymi oknami (wcześniej odjeżdżała w lewo)
    ...(IS_MAC ? { type: 'panel', enableLargerThanScreen: true, focusable: true, hiddenInMissionControl: true } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  place();
  island.setAlwaysOnTop(true, 'screen-saver');
  if (IS_MAC) {
    island.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    // „nieruchoma” jak pulpit: Mission Control i widok okien jej nie ruszają (Transient z Electrona ją przesuwał);
    // gdy się nie da — dawne ukrywanie w Mission Control
    const pinned = macNative().pinWindow(island);
    if (!pinned) island.setHiddenInMissionControl(true);
    else setInterval(() => { if (island && !island.isDestroyed()) macNative().pinWindow(island); }, 4000); // system potrafi z powrotem dodać „zarządzane” — pilnujemy
    if (process.env.WYSPA_SHOT) console.log('wyspa: zachowanie okna', JSON.stringify(pinned), macNative().error ? String(macNative().error) : '');
  }
  island.setIgnoreMouseEvents(true, { forward: true });
  applyGlassProtection();
  island.loadFile(path.join('island', 'index.html'));
  island.once('ready-to-show', applyVisibility);
  island.on('blur', () => { hold = false; });
}
function applyGlassProtection() {
  // Szkło czyta obraz ekranu, więc samo okno musi być niewidoczne dla przechwytywania (inaczej odbija samo siebie).
  if (island) island.setContentProtection(S().surface === 'glass' || S().hideFromCaptures);
}
function applyVisibility() {
  if (quitting || !island || island.isDestroyed()) return;
  const show = !userHidden && (!fsHidden || alertActive);
  if (show && !island.isVisible()) { island.showInactive(); island.setAlwaysOnTop(true, 'screen-saver'); }
  if (!show && island.isVisible()) island.hide();
  updateTray();
}

// Pozycja kursora dla szkła: przechwytywanie ekranu zawiera kursor, więc szkło go zamalowuje.
let lastCur = '', curNear = { island: false, settings: false }, lastCurPt = { x: 0, y: 0 };
function sendCursor(p, ib) {
  if (S().surface !== 'glass') return;
  const d = screen.getPrimaryDisplay().bounds;
  const rel = { x: p.x - d.x, y: p.y - d.y };
  const key = rel.x + ',' + rel.y;
  const near = (b, m) => b && p.x > b.x - m && p.x < b.x + b.width + m && p.y > b.y - m && p.y < b.y + b.height + m;
  for (const [name, win, b] of [['island', island, ib], ['settings', settingsWin, settingsWin && !settingsWin.isDestroyed() && settingsWin.isVisible() ? settingsWin.getContentBounds() : null]]) {
    const n = near(b, 140);
    if (n && key !== lastCur) send('cursor', rel, win);
    else if (!n && curNear[name]) send('cursor', null, win);
    curNear[name] = n;
  }
  lastCur = key;
}

// macOS: okno wyspy nie dostaje zdarzeń upuszczania plików, więc przeciąganie wykrywa Aura sama: przycisk myszy wciśnięty
// i nowa zawartość schowka przeciągania (pliki). Nad otwartą wyspą widok pokazuje pola Półka / AirDrop, a po puszczeniu
// przycisku nad wyspą — plik trafia tam, gdzie był kursor.
let md = { down: false };
function macDragTick(inside, p, b) {
  const s = macNative().dragState(); if (!s) return;
  if (s.pressed && !md.down) { md = { down: true, base: s.change, fromIsland: inside, active: false }; return; }
  if (!md.down) return;
  const rel = { x: p.x - b.x, y: p.y - b.y };
  if (s.pressed) {
    if (!md.active && !md.fromIsland && s.change !== md.base) { const files = macNative().dragFiles(); if (files.length) { md.active = true; md.files = files; } }
    if (md.active) { const over = open && inside; if (over || md.over) send('drag-pick', over ? rel : null); md.over = over; }
    return;
  }
  if (md.active && md.over) send('drag-drop', { ...rel, files: md.files }); // puszczony nad wyspą
  else if (md.active) send('drag-pick', null);
  md = { down: false };
}

// Kursor: okno przepuszcza kliknięcia wszędzie poza samą wyspą.
const cursorLoop = setInterval(() => {
  if (quitting || !island || island.isDestroyed() || !island.isVisible()) return;
  const p = screen.getCursorScreenPoint();
  const b = island.getBounds();
  const rx = p.x - b.x, ry = p.y - b.y;
  sendCursor(p, b);
  const r = open ? rects.o : rects.c;
  const pad = open ? 10 : 2;
  // u góry liczy się też sama krawędź ekranu nad wyspą; na dole tylko sama wyspa (wcześniej cały pas nad nią otwierał wyspę)
  const bottom = S().edge === 'bottom';
  const inside = rx >= r.x - pad && rx <= r.x + r.w + pad && ry >= (bottom ? r.y - pad : -2) && ry <= r.y + r.h + pad;
  const now = Date.now();
  // zamiar: szybki przejazd kursora przez wyspę jej nie otwiera — odliczanie startuje, gdy kursor zwolni
  const speed = Math.hypot(p.x - lastCurPt.x, p.y - lastCurPt.y); lastCurPt = p; // piksele na 30 ms
  if (inside) { lastInside = now; if (!insideSince || (!open && speed > 14)) insideSince = now; } else insideSince = 0;
  if (inside !== interactive) { interactive = inside; island.setIgnoreMouseEvents(!inside, { forward: true }); }
  if (IS_MAC) macDragTick(inside, p, b);
  if (pin && inside) pinEntered = true;
  if (pin && pinEntered && !inside && now - lastInside > 400) { pin = false; pinEntered = false; }
  const delay = S().hoverDelay;
  const realMouse = !process.env.WYSPA_SHOT || !!process.env.WYSPA_DRAGTEST; // w trybie testowym kursor nie otwiera wyspy (poza testem przeciągania)
  const hover = realMouse && inside;
  const want = pin || hold || (hover && now - insideSince >= delay) || (open && hover) || (open && realMouse && now - lastInside < 260);
  if (want !== open) { open = want; send('open', open); }
}, 30);

// ---------- ustawienia ----------
function applySettings(patch) {
  store.set(patch);
  const k = Object.keys(patch);
  if (k.includes('surface') || k.includes('hideFromCaptures')) applyGlassProtection();
  if (k.includes('hotkeys') || k.includes('tabHotkeys')) registerHotkeys();
  if (k.includes('autostart')) setAutostart();
  if (k.includes('notifyPort') || k.includes('agentsEnabled') || k.includes('notifyEndpoint')) startEndpoint();
  if (k.includes('hideInFullscreen') && !S().hideInFullscreen) { fsHidden = false; applyVisibility(); }
  if (k.includes('position') || k.includes('edgeMargin') || k.includes('edge')) place();
  if (k.includes('edge') && helper.setEdge) helper.setEdge(S().edge === 'bottom');
  if (k.includes('downloads')) configureDownloads();
  if (k.includes('claudeUsage')) refreshClaudeUsage(true);
  if (k.includes('appNotifications')) configureToasts();
  if (k.includes('lyrics')) { lyricsKey = ''; if (S().lyrics) onTrack(sys.media); else send('lyrics', null); } // włączone w trakcie utworu: tekst od razu
  if (k.some(x => ['hudVolume', 'hudBrightness', 'macHudKeys'].includes(x))) configureMacKeys();
  if (k.includes('devBattery')) configureDevBattery();
  if (k.includes('dock')) configureDock(); else if (k.some(x => /^dock[A-Z]/.test(x))) { if (taskbar) taskbar.push(); if (k.includes('dockSize')) place(); }
  if (k.some(x => x.startsWith('weather'))) refreshWeather(true);
  if (k.includes('calendarIcs')) refreshCalendar();
  if (k.some(x => x.startsWith('obs'))) configureObs();
  if (k.includes('chatTwitch')) configureChat();
  if (k.includes('liveWallpaper') || k.includes('liveWallpaperFile')) configureWallpaper();
  else if (k.some(x => /^wp[A-Z]/.test(x))) wp.setFilters(wpFilters());
  send('settings', S(), chatWin);
  if (k.includes('clipboardSize') || k.includes('clipboardKeepHours')) pruneClips();
  both('settings', S());
}
ipcMain.handle('settings-get', () => S());
ipcMain.handle('settings-set', (_, patch) => { applySettings(patch || {}); return S(); });
ipcMain.on('open-settings', (_, page) => openSettings(page));
ipcMain.on('welcome-done', () => { if (!store.data.welcomeDone) { store.data.welcomeDone = true; store.saveData(); } });

function openSettings(page) {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); if (page) send('goto', page, settingsWin); return; }
  const glass = S().surface === 'glass';
  settingsWin = new BrowserWindow({
    width: 860, height: 760, minWidth: 720, minHeight: 520, show: false, title: 'Aura — ustawienia',
    // Szkło: tło rysuje strona (rozmyty obraz pulpitu pod oknem, jak na wyspie)
    backgroundColor: '#0b0b0e',
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: glass ? '#00000000' : '#0b0b0c', symbolColor: '#f5f5f7', height: 40 } }),
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join('settings', 'index.html'), { query: { page: page || '' } });
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
  for (const ev of ['move', 'moved', 'resize', 'show', 'maximize', 'unmaximize', 'restore', 'will-move']) settingsWin.on(ev, sendSettingsPos);
  // podczas przeciągania okna Windows nie zawsze wysyła „move” na bieżąco — dopytujemy o pozycję co klatkę
  let lastPos = '';
  const posTimer = setInterval(() => {
    if (!settingsWin || settingsWin.isDestroyed()) return clearInterval(posTimer);
    const b = settingsWin.getContentBounds(), k = b.x + ',' + b.y;
    if (k !== lastPos) { lastPos = k; sendSettingsPos(); }
  }, 16);
  settingsWin.on('focus', () => send('settings-focus', true, settingsWin));
  settingsWin.on('blur', () => send('settings-focus', false, settingsWin));
  if (glass) settingsWin.setContentProtection(true);
}
ipcMain.on('settings-titlebar', (_, c) => {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  try {
    settingsWin.setBackgroundColor(c.glass ? '#0b0b0e' : c.bg);
    settingsWin.setTitleBarOverlay({ color: c.glass ? '#00000000' : c.bg, symbolColor: c.fg, height: 40 });
    // okno ze szkłem czyta obraz ekranu, więc nie może widzieć samego siebie
    settingsWin.setContentProtection(!!c.glass);
    sendSettingsPos();
  } catch {}
});
function sendSettingsPos() {
  if (!settingsWin || settingsWin.isDestroyed()) return;
  const b = settingsWin.getContentBounds(), pd = screen.getPrimaryDisplay();
  const onPrimary = screen.getDisplayMatching(b).id === pd.id;
  send('settings-pos', { x: b.x - pd.bounds.x, y: b.y - pd.bounds.y, sw: pd.bounds.width, sh: pd.bounds.height, ok: onPrimary }, settingsWin);
}
ipcMain.handle('settings-pos', () => { sendSettingsPos(); return true; });

// ---------- skróty klawiszowe ----------
const HOTKEY_ACTIONS = {
  open: () => { pin = !open; pinEntered = false; if (!pin) { open = false; send('open', false); } },
  hide: () => { userHidden = !userHidden; applyVisibility(); },
  playPause: () => helper.send({ c: 'media', a: 'toggle' }),
  next: () => helper.send({ c: 'media', a: 'next' }),
  prev: () => helper.send({ c: 'media', a: 'prev' }),
  focus: () => send('focus-toggle'),
  micMute: () => toggleMic(),
  colorPick: () => helper.send({ c: 'pick' }),
  screenshot: () => takeScreenshot(),
  snip: () => snip(),
  record: () => send('record-toggle'),
  chat: () => toggleChatWindow(),
  obsRecord: () => obs.toggleRecord(),
  obsStream: () => obs.toggleStream(),
};
let hotkeyErrors = [];
function registerHotkeys() {
  globalShortcut.unregisterAll();
  hotkeyErrors = [];
  for (const [action, accel] of Object.entries(S().hotkeys)) {
    if (!accel || !HOTKEY_ACTIONS[action]) continue;
    try { if (!globalShortcut.register(accel, HOTKEY_ACTIONS[action])) hotkeyErrors.push(action); } catch { hotkeyErrors.push(action); }
  }
  // Ctrl+Shift+1…6: wyspa otwiera się od razu na danej karcie
  if (S().tabHotkeys !== false) for (let n = 1; n <= 6; n++) {
    try { globalShortcut.register(`Control+Shift+${n}`, () => { pin = true; pinEntered = false; open = true; send('open', true); send('goto-tab', n); }); } catch {}
  }
  both('hotkey-errors', hotkeyErrors);
}
ipcMain.handle('hotkey-errors', () => hotkeyErrors);
ipcMain.on('hotkeys-pause', (_, on) => { if (on) globalShortcut.unregisterAll(); else registerHotkeys(); });

// ---------- pomocnik systemowy ----------
const sys = { vol: null, mic: null, inuse: { mic: [], cam: [] }, bright: { v: -1, src: null }, power: '', radios: [] };
// Ikona aplikacji, która gra (Spotify, Opera, Chrome…): ścieżka procesu → ikona pliku .exe.
const appIcons = new Map();
const APP_PROC = [[/spotify/i, 'Spotify'], [/opera/i, 'opera'], [/chrome/i, 'chrome'], [/msedge|edge/i, 'msedge'], [/firefox/i, 'firefox'], [/brave/i, 'brave'],
  [/vlc/i, 'vlc'], [/zunemusic|mediaplayer/i, 'Microsoft.Media.Player'], [/tidal/i, 'TIDAL'], [/deezer/i, 'Deezer'], [/foobar/i, 'foobar2000'], [/aimp/i, 'AIMP']];
// nazwa procesu programu, który gra (Spotify, chrome, opera…) i jego ścieżka — także dla paska zadań Aury
const appExe = new Map();
function mediaProcName(id) {
  const known = APP_PROC.find(([re]) => re.test(id));
  return (known ? known[1] : String(id).split('!').pop().replace(/\.exe$/i, '').split('.').pop()).replace(/[^\w.\- ]/g, '');
}
async function resolveAppIcon(id) {
  if (!id || appIcons.has(id)) return appIcons.get(id) || null;
  appIcons.set(id, null);
  const name = mediaProcName(id);
  if (!name) return null;
  if (IS_MAC) { // macOS: ikona pakietu .app
    const app_ = ['/Applications/Spotify.app', '/System/Applications/Music.app'].find(p => p.toLowerCase().includes(id.toLowerCase()) && fs.existsSync(p));
    if (!app_) return null;
    try { const ic = await fileIcon(app_); const url = ic.isEmpty() ? null : ic.toDataURL(); appIcons.set(id, url); return url; } catch { return null; }
  }
  const exe = await new Promise(r => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-Process -Name '${name}' -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1).Path`],
    { windowsHide: true, timeout: 6000 }, (e, out) => r(e ? '' : String(out).trim())));
  if (!exe) return null;
  appExe.set(id, exe);
  try { const ic = await fileIcon(exe); if (ic.isEmpty()) return null; const url = ic.toDataURL(); appIcons.set(id, url); return url; } catch { return null; }
}
helper.on('media', m => {
  sys.media = m; send('media', m); onTrack(m);
  if (taskbar) taskbar.setMedia(dockMedia());
  try { if (deckState && deckState.running && m.has) deck.pushMedia({ title: m.title, artist: m.artist, playing: m.playing }); } catch {}
  if (m.app && !appIcons.has(m.app)) resolveAppIcon(m.app).then(url => { if (url) send('app-icon', { id: m.app, icon: url }); });
});
ipcMain.handle('app-icon', (_, id) => appIcons.get(id) || null);
helper.on('thumb', m => { sys.thumb = m.data; send('thumb', m.data); if (taskbar) taskbar.setMedia(dockMedia()); });
let gameOn = false;
helper.on('fs', m => {
  const on = !!m.on;
  if (taskbar) taskbar.setFullscreen(on); // pasek zadań Aury nie wisi nad grami i filmami
  // pasek dla graczy: zamiast chować wyspę, pokazuje wąski pasek CPU/GPU/RAM nad grą
  gameOn = on && S().gamerOverlay;
  fsHidden = on && S().hideInFullscreen && !gameOn;
  send('game', gameOn);
  applyVisibility();
  try { if (wpState && wpState.running) { if (on) wp.pause(); else wp.resume(); } } catch {} // tapeta pauzuje pod grą
});
helper.on('clip', m => { clearTimeout(clipTimer); clipTimer = setTimeout(() => onClipboardChange(0, !!m.private), 120); });
helper.on('vol', m => {
  const prev = sys.vol; sys.vol = m; send('vol', m);
  if (prev && prev.id !== m.id && S().hudDevice) send('hud', { kind: 'device', text: m.name });
  else if (prev && (Math.abs(prev.level - m.level) > 0.004 || prev.mute !== m.mute) && S().hudVolume && Date.now() - lastKeyHud > 2500) send('hud', { kind: 'volume', level: m.level, mute: m.mute }); // po klawiszu (Mac) okienko już było
});
// macOS: klawisze głośności i jasności przechwytuje Aura — sama zmienia poziom i pokazuje swoje okienko zamiast systemowego
let lastKeyHud = 0, keysRetry = null, keysAsked = false;
function configureMacKeys() {
  if (!IS_MAC) return;
  clearTimeout(keysRetry);
  const want = S().macHudKeys !== false && (S().hudVolume || S().hudBrightness);
  if (!want) { macNative().stopKeys(); return; }
  const r = macNative().startKeys({ volume: !!S().hudVolume, bright: !!S().hudBrightness, onHud: h => { lastKeyHud = Date.now(); send('hud', h); } });
  if (process.env.WYSPA_SHOT) console.log('wyspa: klawisze głośności/jasności:', r, macNative().error ? String(macNative().error) : '');
  if (r === 'brak-zgody') {
    if (!keysAsked) { keysAsked = true; addNotice({ kind: 'tool', title: 'Głośność i jasność na wyspie', body: 'Pozwól Aurze w Ustawieniach systemowych → Prywatność i ochrona → Dostępność, a okienko głośności i jasności pokaże się na wyspie zamiast systemowego.' }); }
    keysRetry = setTimeout(configureMacKeys, 5000); // zgoda dana w Ustawieniach: kran rusza sam, bez restartu
  }
}
helper.on('mic', m => {
  const prev = sys.mic; sys.mic = m; send('mic', m);
  if (prev && prev.mute !== m.mute && S().hudMic) send('hud', { kind: 'mic', mute: m.mute });
});
helper.on('keys', m => { if (S().hudLockKeys) send('hud', { kind: 'keys', caps: m.caps, num: m.num }); });
helper.on('inuse', m => { sys.inuse = m; send('inuse', m); });
helper.on('bright', m => {
  const prev = sys.bright; sys.bright = m; send('bright', m);
  if (!m.initial && prev && prev.v >= 0 && m.v !== prev.v && S().hudBrightness) send('hud', { kind: 'bright', level: m.v / 100 });
});
// Od kiedy każda aplikacja nagrywa z mikrofonu — liczone zawsze (także przy wyłączonym minutniku), żeby po jego
// włączeniu w trakcie rozmowy pokazać prawdziwy czas. Rejestr Windows (ConsentStore) bywa pusty albo nieaktualny.
// Zapis na dysk co minutę: po restarcie Aury (np. aktualizacji) w ciągu 3 min rozmowa liczy się dalej, nie od zera.
sys.captureSince = {};
{ const saved = store.data.captureSince; if (saved && saved.map && Date.now() - (saved.seen || 0) < 180e3) sys.captureRestore = saved.map; }
function saveCaptureSince() { store.data.captureSince = { map: sys.captureSince, seen: Date.now() }; store.saveData(); }
helper.on('capture', m => { // kto naprawdę nagrywa z mikrofonu
  sys.capture = m.apps || [];
  const now = Date.now(), next = {}, old = sys.captureRestore || {}, gone = sys.captureGone || (sys.captureGone = {});
  for (const a in sys.captureSince) if (!sys.capture.includes(a)) gone[a] = { since: sys.captureSince[a], at: now }; // np. wyciszenie w Discordzie zamyka mikrofon
  for (const a in gone) if (now - gone[a].at > 600e3) delete gone[a]; // po 10 min przerwy to już nowa rozmowa
  for (const a of sys.capture) next[a] = sys.captureSince[a] || (gone[a] && gone[a].since) || (old[a] > 0 && old[a] < now ? old[a] : now);
  for (const a of sys.capture) delete gone[a];
  sys.captureRestore = null; sys.captureSince = next; saveCaptureSince();
  send('capture-since', next); send('capture', sys.capture);
});
setInterval(() => { if (Object.keys(sys.captureSince).length) saveCaptureSince(); }, 60e3).unref?.();
helper.on('covered', m => { sys.covered = !!m.on; send('covered', sys.covered); });
// bateria myszy, słuchawek itp. (Windows): kropki obok wyspy + przypomnienie przy 15%
const devLow = new Set();
helper.on('devbat', m => {
  const list = Array.isArray(m.list) ? m.list.filter(d => d && d.name && Number.isFinite(Number(d.level))) : [];
  sys.devbat = list; send('devbat', list);
  for (const d of list) {
    const low = Number(d.level) <= 15 && !d.charging;
    if (low && !devLow.has(d.name)) { devLow.add(d.name); addNotice({ kind: 'device', title: `${d.name}: ${d.level}% baterii`, body: 'Czas naładować.' }); }
    if (!low && Number(d.level) >= 25) devLow.delete(d.name);
  }
});
function configureDevBattery() { if (!IS_MAC) helper.send({ c: 'devbat', on: S().devBattery !== false }); }
helper.on('power', m => { sys.power = m.g; send('power', m.g); });
helper.on('radios', m => { sys.radios = m.list || []; send('radios', sys.radios); });
helper.on('net', m => { sys.net = m; });
helper.on('color', m => {
  clipboard.writeText(m.hex);
  send('hud', { kind: 'color', hex: m.hex });
  addNotice({ kind: 'tool', title: `Kolor ${m.hex}`, body: 'Skopiowano kod koloru' });
});
function toggleMic() { const mute = !(sys.mic && sys.mic.mute); helper.send({ c: 'micmute', on: mute }); }

ipcMain.on('media', (_, a) => helper.send({ c: 'media', a }));
ipcMain.on('seek', (_, s) => helper.send({ c: 'seek', s }));
ipcMain.on('volume', (_, v) => helper.send({ c: 'vol', v }));
ipcMain.on('mute', (_, on) => helper.send({ c: 'mute', on }));
ipcMain.on('mic-toggle', toggleMic);
ipcMain.on('brightness', (_, v) => helper.send({ c: 'bright', v }));
ipcMain.on('power-mode', (_, g) => helper.send({ c: 'power', g }));
// urządzenia dźwięku (karta Rozmowa): lista i przełączanie domyślnych głośników/mikrofonu
helper.on('devices', m => { sys.devices = { out: m.out || [], in: m.in || [] }; send('devices', sys.devices); });
ipcMain.on('audio-devices', () => { if (!IS_MAC) helper.send({ c: 'devices' }); });
ipcMain.on('audio-set', (_, id) => { // tylko id z ostatniej listy od Windows
  const d = sys.devices; if (IS_MAC || !d || typeof id !== 'string' || ![...d.out, ...d.in].some(x => x.id === id)) return;
  helper.send({ c: 'setdev', id });
});
ipcMain.on('radio', (_, r) => helper.send({ c: 'radio', kind: r.kind, on: r.on }));
ipcMain.on('controls-refresh', () => { helper.send({ c: 'brightget' }); helper.send({ c: 'power' }); helper.send({ c: 'radios' }); });
ipcMain.on('open-uri', (_, uri) => { if (/^ms-settings:|^ms-screenclip:/.test(uri)) shell.openExternal(uri); });
// strona autora (tylko ten adres)
const AUTHOR_URL = 'https://famefabricators.pl';
ipcMain.on('open-author', () => shell.openExternal(AUTHOR_URL));
ipcMain.handle('sys', () => ({ ...sys, net: undefined }));

// ---------- schowek ----------
const images = new Map();
let suppress = false, clipTimer = null, clipBusy = false;
const clipsOut = () => store.clips.map(c => ({ id: c.id, type: c.type, text: c.type === 'text' ? c.text.slice(0, 2000) : c.text, len: c.type === 'text' ? c.text.length : 0, img: c.thumb, ts: c.ts, pinned: !!c.pinned }));
async function readClipboard() {
  let text = '';
  try { text = (await clipboard.readText()) || ''; } catch {}
  if (text.trim()) return { text };
  try {
    for (const item of await clipboard.read()) {
      const type = item.types.find(t => t === 'image/png') || item.types.find(t => t.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      if (blob && typeof blob.arrayBuffer === 'function') return { image: Buffer.from(await blob.arrayBuffer()) };
    }
  } catch {}
  return null;
}
function pruneClips() {
  const s = S();
  const now = Date.now();
  let kept = 0;
  store.clips = store.clips.filter(c => {
    if (c.pinned) return true;
    if (s.clipboardKeepHours > 0 && now - c.ts > s.clipboardKeepHours * 3600e3) return false;
    kept++; return kept <= s.clipboardSize;
  });
  for (const id of images.keys()) if (!store.clips.some(c => c.id === id)) images.delete(id);
  store.saveClips();
  send('clips', clipsOut());
}
async function onClipboardChange(attempt, isPrivate) {
  if (!S().clipboardEnabled) return;
  if (isPrivate) { suppress = false; return; } // menedżer haseł
  if (clipBusy) { clipTimer = setTimeout(() => onClipboardChange(attempt, isPrivate), 150); return; }
  clipBusy = true;
  try {
    const got = await readClipboard();
    if (!got) { if (attempt < 4) clipTimer = setTimeout(() => onClipboardChange(attempt + 1, isPrivate), 200); return; }
    const own = suppress; suppress = false;
    if (own) return;
    if (got.text) {
      const text = got.text.slice(0, 20000);
      const ex = store.clips.findIndex(c => c.type === 'text' && c.text === text);
      if (ex === 0) return;
      const pinned = ex > 0 && store.clips[ex].pinned;
      if (ex > 0) store.clips.splice(ex, 1);
      store.clips.unshift({ id: newId(), type: 'text', text, ts: Date.now(), pinned });
    } else {
      const img = nativeImage.createFromBuffer(got.image);
      if (img.isEmpty()) return;
      const hash = crypto.createHash('md5').update(got.image).digest('hex');
      const ex = store.clips.findIndex(c => c.hash === hash);
      if (ex === 0) return;
      if (ex > 0) store.clips.splice(ex, 1);
      const id = newId(), s = img.getSize();
      images.set(id, got.image);
      store.clips.unshift({ id, type: 'image', hash, thumb: (s.width > 360 ? img.resize({ width: 360 }) : img).toDataURL(), text: `${s.width} × ${s.height}`, ts: Date.now() });
      store.clips.filter(c => c.type === 'image').slice(10).forEach(c => { images.delete(c.id); store.clips.splice(store.clips.indexOf(c), 1); });
    }
    pruneClips();
  } catch {} finally { clipBusy = false; }
}
ipcMain.on('clip-copy', async (_, id) => {
  const c = store.clips.find(x => x.id === id); if (!c) return;
  suppress = true;
  try {
    if (c.type === 'text') await clipboard.writeText(c.text);
    else if (images.has(id)) await clipboard.write([new ClipboardItem({ 'image/png': new Blob([images.get(id)], { type: 'image/png' }) })]);
  } catch { suppress = false; }
});
// przeciąganie ze schowka: pełny tekst (do wyspy trafia tylko podgląd) i obraz jako plik PNG
ipcMain.handle('clip-text', (_, id) => { const c = store.clips.find(x => x.id === id); return c && c.type === 'text' ? c.text : ''; });
ipcMain.on('clip-drag', (e, id) => {
  const c = store.clips.find(x => x.id === id); if (!c || c.type !== 'image' || !images.has(id)) return;
  try {
    const dir = path.join(app.getPath('temp'), 'Aura-schowek'); fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); try { if (Date.now() - fs.statSync(p).mtimeMs > 86400e3) fs.unlinkSync(p); } catch {} } // stare (ponad dobę) sprzątamy
    const d = new Date(c.ts || Date.now()), pad = n => String(n).padStart(2, '0');
    const file = path.join(dir, `Obraz ze schowka ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.png`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(images.get(id)));
    const img = nativeImage.createFromPath(file);
    e.sender.startDrag({ file, icon: img.isEmpty() ? nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 32 }) : img.resize({ width: 64 }) });
  } catch (err) { logError('clip-drag', err); }
});
ipcMain.on('clip-pin', (_, id) => { const c = store.clips.find(x => x.id === id); if (c) { c.pinned = !c.pinned; pruneClips(); } });
ipcMain.on('clip-remove', (_, id) => { store.clips = store.clips.filter(c => c.id !== id); pruneClips(); });
ipcMain.on('clips-clear', () => { store.clips = store.clips.filter(c => c.pinned); pruneClips(); });
setInterval(pruneClips, 10 * 60 * 1000);

// ---------- półka ----------
const thumbs = new Map();
async function thumbFor(p) {
  if (thumbs.has(p)) return thumbs.get(p);
  let img = null;
  try { img = await nativeImage.createThumbnailFromPath(p, { width: 96, height: 96 }); } catch {}
  if (!img || img.isEmpty()) { try { img = await fileIcon(p); } catch {} }
  thumbs.set(p, img);
  return img;
}
function mediaInfo(p) {
  try {
    const st = fs.statSync(p);
    if (st.isDirectory()) return 'Folder';
    const mb = st.size / 1048576;
    let info = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(st.size / 1024))} KB`;
    if (/\.(png|jpe?g|gif|bmp|webp)$/i.test(p)) { const s = nativeImage.createFromPath(p).getSize(); if (s.width) info = `${s.width} × ${s.height} · ${info}`; }
    return info;
  } catch { return ''; }
}
async function filesOut() {
  store.data.files = store.data.files.filter(p => fs.existsSync(p));
  const out = [];
  for (const p of store.data.files) {
    const t = await thumbFor(p);
    out.push({ path: p, name: path.basename(p) || p, thumb: t && !t.isEmpty() ? t.toDataURL() : null, info: mediaInfo(p) });
  }
  return out;
}
async function addFiles(paths) {
  for (const p of paths || []) {
    if (typeof p !== 'string' || !p || !fs.existsSync(p)) continue;
    store.data.files = store.data.files.filter(x => x !== p);
    store.data.files.unshift(p);
  }
  store.data.files = store.data.files.slice(0, 40);
  store.saveData();
  const list = await filesOut();
  send('files', list);
  return list;
}
ipcMain.handle('files-add', (_, paths) => addFiles(paths));
ipcMain.handle('file-remove', async (_, p) => { store.data.files = store.data.files.filter(x => x !== p); store.saveData(); return filesOut(); });
ipcMain.handle('files-clear', async () => { store.data.files = []; store.saveData(); return filesOut(); });
ipcMain.on('file-open', (_, p) => { if (store.data.files.includes(p)) shell.openPath(p); });
ipcMain.on('file-show', (_, p) => { if (store.data.files.includes(p) || p.startsWith(app.getPath('pictures')) || p.startsWith(app.getPath('videos'))) shell.showItemInFolder(p); });
// ---------- pobierania z przeglądarki: postęp na wyspie, komunikat i półka po zakończeniu ----------
// Przeglądarki zapisują pobierany plik z tymczasową końcówką (.crdownload — Chrome/Edge/Opera/Brave, .part — Firefox).
const DL_TMP = /\.(crdownload|part|opdownload|partial)$/i;
const dls = new Map(); // ścieżka tymczasowa -> { size, t, speed, seen }
let dlWatch = null, dlTimer = null, dlLast = '';
function configureDownloads() {
  const on = S().downloads !== false;
  if (!on) { if (dlWatch) { try { dlWatch.close(); } catch {} dlWatch = null; } clearInterval(dlTimer); dlTimer = null; dls.clear(); send('download', null); return; }
  if (dlWatch) return;
  const dir = app.getPath('downloads');
  try { dlWatch = fs.watch(dir, () => dlScan()); } catch { return; }
  dlScan(); dlTimer = setInterval(dlTick, 1000);
}
function dlScan() {
  const dir = app.getPath('downloads');
  let names = []; try { names = fs.readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (!DL_TMP.test(n)) continue;
    const p = path.join(dir, n);
    if (!dls.has(p)) { try { const s = fs.statSync(p); if (Date.now() - s.mtimeMs < 120e3) dls.set(p, { size: s.size, t: Date.now(), speed: 0, seen: Date.now() }); } catch {} }
  }
}
function dlTick() {
  dlScan();
  const now = Date.now();
  for (const [p, d] of dls) {
    let s; try { s = fs.statSync(p); } catch { s = null; }
    if (!s) { // zniknął plik tymczasowy: pobrane (jest plik bez końcówki) albo anulowane
      dls.delete(p);
      const final = p.replace(DL_TMP, '');
      if (final !== p && fs.existsSync(final) && !/^Unconfirmed \d+/i.test(path.basename(final))) {
        addNotice({ kind: 'download', title: 'Pobrano', body: path.basename(final), path: final });
        if (S().downloadsToShelf !== false) addFiles([final]);
      }
      continue;
    }
    const dt = (now - d.t) / 1000;
    if (s.size !== d.size) { d.speed = d.speed * 0.5 + ((s.size - d.size) / Math.max(dt, 0.2)) * 0.5; d.size = s.size; d.seen = now; }
    d.t = now;
    if (now - d.seen > 90e3) dls.delete(p); // od półtorej minuty nic nie przybywa — porzucone pobieranie
  }
  const act = [...dls.entries()].filter(([, d]) => now - d.seen < 15e3);
  const out = act.length ? { name: path.basename(act[0][0]).replace(DL_TMP, '').replace(/^Unconfirmed \d+$/i, 'plik'), size: act[0][1].size, speed: Math.max(0, act[0][1].speed), count: act.length } : null;
  const key = JSON.stringify(out && [out.name, Math.round(out.size / 2e5), out.count]);
  if (key !== dlLast) { dlLast = key; send('download', out); }
}

// ---------- półka: konwersja zdjęć (PNG / JPG / WebP, zmniejszanie) ----------
// Dekodowanie i kodowanie robi ukryte okno (Chromium zna WebP/AVIF/GIF), plik wynikowy ląduje obok oryginału i na półce.
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif' };
let convWin = null;
async function convertImage(p, fmt, opts = {}) {
  const mime = IMG_MIME[path.extname(p).slice(1).toLowerCase()];
  const outMime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[fmt];
  if (!mime || !outMime) throw new Error('To nie jest obsługiwany obraz');
  const data = (await fs.promises.readFile(p)).toString('base64');
  if (!convWin || convWin.isDestroyed()) {
    convWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await convWin.loadURL('about:blank');
  }
  const res = await convWin.webContents.executeJavaScript(`new Promise((ok, no) => { const i = new Image();
    i.onload = () => { let k = ${Number(opts.scale) || 1}; const maxW = ${Number(opts.maxW) || 0}; if (maxW && i.naturalWidth * k > maxW) k = maxW / i.naturalWidth;
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(i.naturalWidth * k)); c.height = Math.max(1, Math.round(i.naturalHeight * k));
      const x = c.getContext('2d'); ${fmt === 'jpg' ? "x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);" : ''} x.imageSmoothingQuality = 'high'; x.drawImage(i, 0, 0, c.width, c.height);
      ok({ url: c.toDataURL('${outMime}', 0.88), w: c.width, h: c.height }); };
    i.onerror = () => no(new Error('Nie udało się odczytać obrazu')); i.src = 'data:${mime};base64,${data}'; })`);
  const base = path.join(path.dirname(p), path.basename(p, path.extname(p)) + (opts.suffix || ''));
  let out = `${base}.${fmt}`;
  for (let n = 1; fs.existsSync(out); n++) out = `${base} (${n}).${fmt}`;
  try { await fs.promises.writeFile(out, Buffer.from(res.url.split(',')[1], 'base64')); }
  catch { // brak prawa zapisu obok oryginału -> Pobrane\Aura
    const dir = path.join(app.getPath('downloads'), 'Aura'); fs.mkdirSync(dir, { recursive: true });
    out = path.join(dir, path.basename(out)); await fs.promises.writeFile(out, Buffer.from(res.url.split(',')[1], 'base64'));
  }
  await addFiles([out]);
  const kb = Math.round(fs.statSync(out).size / 1024);
  addNotice({ kind: 'tool', title: `Zapisano ${path.basename(out)}`, body: `${res.w} × ${res.h} · ${kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'}`, path: out });
  return out;
}
// macOS: AirDrop — systemowe menu „Udostępnij” (AirDrop, Wiadomości, Mail…) dla upuszczonych plików albo plików z półki
ipcMain.on('airdrop', (e, paths) => {
  if (!IS_MAC) return;
  const list = (Array.isArray(paths) ? paths : []).filter(p => typeof p === 'string' && path.isAbsolute(p) && fs.existsSync(p)).slice(0, 20);
  if (!list.length) return;
  const win = BrowserWindow.fromWebContents(e.sender) || undefined;
  const shareMenu = () => { try { const { ShareMenu } = require('electron'); new ShareMenu({ filePaths: list }).popup({ window: win }); } catch (err) { logError('airdrop', err); } };
  // najpierw prosto okno AirDrop (wybór telefonu); gdy AirDrop niedostępny — menu „Udostępnij”
  const name = list.length === 1 ? path.basename(list[0]) : `${list.length} pliki`;
  send('airdrop-state', { state: 'opening', name });
  // czyste środowisko: bez identyfikatora Aury (__CFBundleIdentifier itp.) — inaczej macOS przypisywał okno AirDrop
  // do Aury (aplikacji w tle bez okien w Docku) i go nie pokazywał
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(__CF|XPC_|ELECTRON_|CHROME_)/.test(k)));
  execFile('/usr/bin/osascript', ['-l', 'JavaScript', path.join(__dirname, 'native', 'airdrop-mac.js'), ...list], { timeout: 11 * 60e3, env }, (err, out) => {
    const o = String(out || '');
    if (/niedostępny/.test(o)) { send('airdrop-state', { state: 'fallback', name }); shareMenu(); return; }
    if (/wysłano/.test(o)) { send('airdrop-state', { state: 'sent', name }); addNotice({ kind: 'phone', title: 'Wysłano przez AirDrop', body: name }); return; }
    if (/anulowano/.test(o)) { send('airdrop-state', { state: 'cancel', name }); return; }
    if (err && !/ok/.test(o)) { logError('airdrop', err); send('airdrop-state', { state: 'fallback', name }); shareMenu(); return; }
    send('airdrop-state', { state: 'idle', name });
  });
});
ipcMain.on('file-menu', (e, p) => {
  if (!store.data.files.includes(p)) return;
  const conv = (fmt, o) => () => convertImage(p, fmt, o).catch(err => addNotice({ kind: 'tool', title: 'Konwersja się nie udała', body: err.message }));
  const ext = path.extname(p).slice(1).toLowerCase();
  const tpl = [{ label: IS_MAC ? 'Pokaż w Finderze' : 'Pokaż w folderze', click: () => shell.showItemInFolder(p) }];
  if (IS_MAC) tpl.push({ label: 'Udostępnij (AirDrop…)', role: 'shareMenu', sharingItem: { filePaths: [p] } }); // AirDrop na telefon
  if (IMG_MIME[ext]) {
    const same = ext === 'jpeg' ? 'jpg' : ['png', 'jpg', 'webp'].includes(ext) ? ext : 'png';
    tpl.push({ type: 'separator' },
      { label: 'Zapisz jako PNG', enabled: ext !== 'png', click: conv('png') },
      { label: 'Zapisz jako JPG', enabled: ext !== 'jpg' && ext !== 'jpeg', click: conv('jpg') },
      { label: 'Zapisz jako WebP (na strony www)', enabled: ext !== 'webp', click: conv('webp') },
      { type: 'separator' },
      { label: 'Zmniejsz o połowę', click: conv(same, { scale: 0.5, suffix: '-50%' }) },
      { label: 'Zmniejsz do 1920 px szerokości', click: conv(same, { maxW: 1920, suffix: '-1920' }) });
  }
  Menu.buildFromTemplate(tpl).popup({ window: BrowserWindow.fromWebContents(e.sender) || undefined });
});
ipcMain.on('file-drag', (e, p) => {
  if (!store.data.files.includes(p)) return;
  const t = thumbs.get(p);
  const icon = t && !t.isEmpty() ? t.resize({ width: 48 }) : nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 32 });
  e.sender.startDrag({ file: p, icon });
});

// ---------- telefon ----------
phone.on('received', async p => { await addFiles([p]); addNotice({ kind: 'phone', title: 'Z telefonu', body: path.basename(p), path: p }); });
phone.on('text', async t => { suppress = false; await clipboard.writeText(t); addNotice({ kind: 'phone', title: 'Tekst z telefonu', body: t.slice(0, 80) }); });
phone.on('sent', p => addNotice({ kind: 'phone', title: 'Wysłano na telefon', body: path.basename(p) }));
phone.on('stopped', () => send('phone', null));
ipcMain.handle('phone-start', async () => {
  if (!S().phoneShare) return { error: 'Wysyłanie na telefon jest wyłączone w ustawieniach.' };
  try { const info = await phone.start(); return { ...info, qr: await QRCode.toDataURL(info.url, { margin: 1, width: 220, color: { dark: '#000000', light: '#ffffff' } }) }; }
  catch (e) { return { error: e.message || 'Nie udało się uruchomić.' }; }
});
ipcMain.on('phone-stop', () => phone.stop());

// ---------- powiadomienia na wyspie ----------
function addNotice(n) {
  const notice = { id: newId(), ts: Date.now(), kind: n.kind || 'script', title: String(n.title || 'Aura').slice(0, 120), body: String(n.body || '').slice(0, 240), path: n.path, aumid: n.aumid && /^[\w.!{}\\-]+$/.test(n.aumid) ? n.aumid : undefined }; // identyfikator aplikacji (tylko bezpieczne znaki)
  store.data.notices = [notice, ...(store.data.notices || [])].slice(0, 24);
  store.saveData();
  send('notices', store.data.notices);
  if (n.banner !== false) send('banner', notice);
}
ipcMain.handle('notices', () => store.data.notices || []);
ipcMain.on('notice-remove', (_, id) => { store.data.notices = (store.data.notices || []).filter(n => n.id !== id); store.saveData(); send('notices', store.data.notices); });
ipcMain.on('notices-clear', () => { store.data.notices = []; store.saveData(); send('notices', []); });
// Pliki z telefonu, które dałoby się uruchomić (programy, skrypty, skróty…), tylko pokazujemy w folderze — klik w komunikat niczego nie uruchamia.
const RUNNABLE = /\.(exe|com|scr|pif|msi|msix|msp|appx|appxbundle|bat|cmd|ps1|psm1|psd1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|url|reg|cpl|inf|jar|chm|scf|application|appref-ms|settingcontent-ms|library-ms|iso|img|vhd|vhdx|xll|docm|xlsm|pptm|dll|sys|gadget|msc)$/i;
ipcMain.on('notice-open', (_, id) => {
  const n = (store.data.notices || []).find(x => x.id === id);
  if (n && n.kind === 'web') { if (webWin && !webWin.isDestroyed()) { if (webWin.isMinimized()) webWin.restore(); webWin.show(); webWin.focus(); } return; } // powiadomienie ze strony: pokaż okno Web
  if (n && n.kind === 'app' && n.aumid) { execFile('explorer.exe', ['shell:AppsFolder\\' + n.aumid], () => {}); return; } // otwórz program, od którego było powiadomienie
  if (!n || !n.path || !fs.existsSync(n.path)) return;
  if ((n.kind === 'phone' || n.kind === 'download') && RUNNABLE.test(n.path)) shell.showItemInFolder(n.path); else shell.openPath(n.path);
});

// ---------- skrypty i agenci AI (127.0.0.1) ----------
const agents = new Map();
function agentsOut() { return [...agents.values()].sort((a, b) => b.since - a.since); }
endpoint.on('notify', d => addNotice({ kind: 'script', title: d.title, body: d.body }));
endpoint.on('agent', d => {
  if (!S().agentsEnabled) return;
  const id = String(d.session || 'agent');
  if (d.state === 'end') { agents.delete(id); for (const k of alwaysAllow) if (k.startsWith(id + '|')) alwaysAllow.delete(k); send('agents', agentsOut()); return; }
  const prev = agents.get(id) || {};
  // kroki agenta: nowe polecenie od użytkownika zaczyna listę od nowa, każde użyte narzędzie dopisuje krok (ostatnie 12)
  let steps = d.title && d.title !== prev.title ? [] : (prev.steps || []);
  if (d.step && d.step.tool) steps = [...steps.filter(s => !(s.pending && s.tool === d.step.tool)), { tool: String(d.step.tool).slice(0, 30), text: String(d.step.summary || '').slice(0, 140), ok: true }].slice(-12);
  const a = { id, harness: d.harness || prev.harness || 'Agent', project: d.project || prev.project || '', title: d.title || prev.title || '', state: d.state || 'working', message: d.message || prev.message || '', since: prev.state === (d.state || 'working') ? prev.since : Date.now(), steps };
  agents.set(id, a);
  send('agents', agentsOut());
  const where = a.project ? ` · ${a.project}` : '';
  if (a.state === 'needs' && prev.state !== 'needs') addNotice({ kind: 'agent', title: `${a.harness} czeka na Ciebie${where}`, body: a.message || a.title });
  // Codex zgłasza tylko koniec tury (bez „pracuje”), więc dla niego komunikat od razu
  if (a.state === 'done' && (prev.state === 'working' || a.harness === 'Codex') && S().agentsNotifyDone) addNotice({ kind: 'agent', title: `${a.harness} skończył${where}`, body: a.message || a.title });
});

// ---------- powiadomienia innych aplikacji (WhatsApp, Discord…) na wyspie ----------
// Opcja do włączenia (appNotifications). Pomocnik czyta je systemowym odbiornikiem powiadomień Windows; nic nie wychodzi z komputera.
const configureToasts = () => helper.send({ c: 'toasts', on: !IS_MAC && S().appNotifications === true });
setInterval(configureToasts, 30000); // także po restarcie pomocnika
helper.on('toast', t => {
  if (S().appNotifications !== true) return;
  const app = String(t.app || '').slice(0, 40);
  if (/^(aura|electron|wyspa)$/i.test(app)) return;
  const ignore = (S().appNotificationsIgnore || []).map(x => String(x).toLowerCase());
  if (ignore.includes(app.toLowerCase())) return;
  addNotice({ kind: 'app', title: t.title ? `${app}: ${t.title}` : app || 'Powiadomienie', body: t.body || '', aumid: t.aumid });
});

// ---------- limity Claude (karta Agenci) ----------
// Tylko po włączeniu przez użytkownika (claudeUsage): token z logowania Claude Code na tym komputerze idzie wyłącznie
// do serwera Anthropic, który go wydał; nic nie jest zapisywane ani wysyłane gdzie indziej.
let claudeUsage = null, usageAt = 0;
async function refreshClaudeUsage(force) {
  if (!S().claudeUsage) { if (claudeUsage) { claudeUsage = null; send('ai-usage', null); } return; }
  if (!force && claudeUsage && Date.now() - usageAt < 9 * 60e3) return send('ai-usage', claudeUsage);
  usageAt = Date.now();
  let token = null;
  try { const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8')); token = c && c.claudeAiOauth && c.claudeAiOauth.accessToken; } catch {}
  if (!token) { claudeUsage = { error: 'Zaloguj się w Claude Code (claude, potem /login).' }; return send('ai-usage', claudeUsage); }
  try {
    const r = await net.fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' } });
    if (r.status === 401) claudeUsage = { error: 'Sesja Claude Code wygasła — uruchom claude, żeby ją odświeżyć.' };
    else if (r.status === 429) { if (!claudeUsage || claudeUsage.error) claudeUsage = { error: 'Serwer prosi o chwilę przerwy — spróbuję za kilka minut.' }; } // zostaw ostatni dobry wynik
    else if (!r.ok) claudeUsage = { error: `Limity chwilowo niedostępne (${r.status}).` };
    else {
      const j = await r.json();
      const pick = x => (x && x.utilization != null ? { pct: Math.round(x.utilization <= 1 ? x.utilization * 100 : x.utilization), reset: x.resets_at || null } : null);
      claudeUsage = { five: pick(j.five_hour), week: pick(j.seven_day) };
    }
  } catch { claudeUsage = { error: 'Brak połączenia z serwerem.' }; }
  send('ai-usage', claudeUsage);
}
setInterval(() => refreshClaudeUsage(), 10 * 60e3); // serwer ogranicza częstotliwość pytań
ipcMain.on('ai-usage-refresh', () => refreshClaudeUsage());

// ---------- prośby agentów o zgodę (hook PermissionRequest): decyzja na wyspie ----------
const asks = new Map(); // id -> { respond, timer }
const alwaysAllow = new Set(); // sesja|narzędzie|polecenie zatwierdzone przyciskiem „Zawsze”
endpoint.on('ask', (d, respond) => {
  if (!S().agentsEnabled || S().agentApprove === false) return respond({ decision: 'ask' });
  const key = `${d.session}|${d.tool}|${d.summary}`;
  if (alwaysAllow.has(key)) return respond({ decision: 'allow' }); // „Zawsze” w tej sesji
  const ag = agents.get(String(d.session || ''));
  if (ag) { ag.steps = [...(ag.steps || []), { tool: String(d.tool || '').slice(0, 30), text: String(d.summary || '').slice(0, 140), pending: true }].slice(-12); send('agents', agentsOut()); }
  const id = newId();
  const finish = decision => { const x = asks.get(id); if (!x) return; clearTimeout(x.timer); asks.delete(id); x.respond({ decision }); send('agent-ask-done', id); };
  asks.set(id, { respond, timer: setTimeout(() => finish('ask'), 28000), session: String(d.session || ''), key }); // bez odpowiedzi: pytanie wraca do terminala
  const tool = String(d.tool || 'narzędzie').slice(0, 40);
  send('agent-ask', { id, title: `${String(d.harness || 'Agent').slice(0, 30)} prosi o zgodę: ${tool}${d.project ? ' · ' + String(d.project).slice(0, 40) : ''}`, body: String(d.summary || '').slice(0, 220) });
  alertActive = true; applyVisibility();
});
endpoint.on('ask-cancel', d => { for (const [id, x] of asks) if (x.session === String(d.session || '')) { clearTimeout(x.timer); asks.delete(id); send('agent-ask-done', id); } });
ipcMain.on('agent-answer', (_, a) => {
  if (!a || !asks.has(a.id) || !['allow', 'deny', 'ask', 'always'].includes(a.decision)) return;
  const x = asks.get(a.id); clearTimeout(x.timer); asks.delete(a.id);
  if (a.decision === 'always') alwaysAllow.add(x.key);
  x.respond({ decision: a.decision === 'always' ? 'allow' : a.decision });
  const ag = agents.get(x.session);
  if (ag && ag.steps) { const s = [...ag.steps].reverse().find(q => q.pending); if (s) { s.pending = false; s.ok = a.decision !== 'deny'; s.denied = a.decision === 'deny'; } send('agents', agentsOut()); } alertActive = false; applyVisibility();
});
setInterval(() => { const now = Date.now(); for (const [id, a] of agents) if (a.state !== 'working' && now - a.since > 30 * 60e3) agents.delete(id); send('agents', agentsOut()); }, 60e3);
ipcMain.handle('agents', () => agentsOut());
function startEndpoint() { endpoint.stop(); if (S().notifyEndpoint || S().agentsEnabled) endpoint.start(Number(S().notifyPort) || 47900); }
endpoint.on('error', e => console.error('endpoint', e.message));

// Claude Code: dopisuje / usuwa hooki Aury w ~/.claude/settings.json (z kopią zapasową).
const claudeSettings = path.join(os.homedir(), '.claude', 'settings.json');
const hookScript = path.join(__dirname, 'tools', 'claude-hook.js');
// PermissionRequest: prośby o zgodę trafiają na wyspę (Zezwól / Odmów / W terminalu); czeka do ~30 s
const HOOK_EVENTS = { UserPromptSubmit: 'working', Notification: 'needs', Stop: 'done', SessionEnd: 'end', PermissionRequest: 'permission', PostToolUse: 'step' };
function writeClaudeHooks(on) {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(claudeSettings, 'utf8')); fs.copyFileSync(claudeSettings, claudeSettings + '.aura-backup'); } catch {}
  j.hooks = j.hooks || {};
  for (const [ev, state] of Object.entries(HOOK_EVENTS)) {
    const list = (j.hooks[ev] || []).map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !String(h.command || '').includes('claude-hook.js')) })).filter(g => g.hooks.length);
    if (on) list.push({ hooks: [{ type: 'command', command: `node "${hookScript}" ${state}`, timeout: state === 'permission' ? 35 : 5 }] });
    if (list.length) j.hooks[ev] = list; else delete j.hooks[ev];
  }
  if (!Object.keys(j.hooks).length) delete j.hooks;
  fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
  fs.writeFileSync(claudeSettings, JSON.stringify(j, null, 2));
}
// już połączone hooki z wcześniejszej wersji: dopisz brakujący hook zgód (z kopią zapasową)
function upgradeClaudeHooks() {
  try {
    if (claudeStatus() !== 'connected' || S().agentApprove === false) return;
    const j = JSON.parse(fs.readFileSync(claudeSettings, 'utf8'));
    const has = ev => JSON.stringify((j.hooks || {})[ev] || []).includes('claude-hook.js');
    if (!has('PermissionRequest') || !has('PostToolUse')) writeClaudeHooks(true); // nowe hooki: zgody i kroki agenta
  } catch {}
}
function claudeStatus() {
  try {
    const j = JSON.parse(fs.readFileSync(claudeSettings, 'utf8'));
    return JSON.stringify(j.hooks || {}).includes('claude-hook.js') ? 'connected' : 'disconnected';
  } catch { return fs.existsSync(path.dirname(claudeSettings)) ? 'disconnected' : 'missing'; }
}
ipcMain.handle('claude-status', () => claudeStatus());
ipcMain.handle('claude-connect', async (_, on) => {
  const r = await dialog.showMessageBox(settingsWin || undefined, {
    type: 'question', buttons: [on ? 'Połącz' : 'Odłącz', 'Anuluj'], defaultId: 0, cancelId: 1, title: 'Claude Code',
    message: on ? 'Dodać hooki Aury do ustawień Claude Code?' : 'Usunąć hooki Aury z ustawień Claude Code?',
    detail: `Plik: ${claudeSettings}\nPrzed zmianą zapiszę kopię .aura-backup. Hooki wysyłają stan sesji tylko na 127.0.0.1.`,
  });
  if (r.response !== 0) return claudeStatus();
  writeClaudeHooks(on);
  return claudeStatus();
});

// Codex CLI: hook w `notify` (~/.codex/config.toml). Poprzedni program powiadomień zapisujemy obok i hook go wywołuje,
// więc np. aplikacja Codex dalej dostaje swoje powiadomienia.
const codexConfig = path.join(os.homedir(), '.codex', 'config.toml');
const codexOrig = path.join(os.homedir(), '.codex', 'aura-notify-original.json');
const codexHook = path.join(__dirname, 'tools', 'codex-hook.js');
const NOTIFY_RE = /^[ \t]*notify[ \t]*=[ \t]*\[[\s\S]*?\][ \t]*\r?\n?/m;
function codexStatus() {
  try { return fs.readFileSync(codexConfig, 'utf8').includes('codex-hook.js') ? 'connected' : 'disconnected'; }
  catch { return fs.existsSync(path.dirname(codexConfig)) ? 'disconnected' : 'missing'; }
}
ipcMain.handle('codex-status', () => codexStatus());
ipcMain.handle('codex-connect', async (_, on) => {
  const r = await dialog.showMessageBox(settingsWin || undefined, {
    type: 'question', buttons: [on ? 'Połącz' : 'Odłącz', 'Anuluj'], defaultId: 0, cancelId: 1, title: 'Codex',
    message: on ? 'Dodać powiadomienia Aury do ustawień Codexa?' : 'Usunąć powiadomienia Aury z ustawień Codexa?',
    detail: `Plik: ${codexConfig}\nPrzed zmianą zapiszę kopię .aura-backup. Dotychczasowy program powiadomień (np. aplikacja Codex) dalej będzie je dostawał.`,
  });
  if (r.response !== 0) return codexStatus();
  let t = ''; try { t = fs.readFileSync(codexConfig, 'utf8'); fs.copyFileSync(codexConfig, codexConfig + '.aura-backup'); } catch {}
  const m = t.match(NOTIFY_RE);
  if (on) {
    if (m && !m[0].includes('codex-hook.js')) {
      const raw = m[0].replace(/^[^=]*=/, '').trim().replace(/,\s*\]$/, ']');
      let arr = null;
      try { arr = JSON.parse(raw); } catch { try { arr = JSON.parse(raw.replace(/'([^']*)'/g, (_, s) => JSON.stringify(s))); } catch {} } // też TOML 'dosłowne'
      if (!Array.isArray(arr)) { // nie ruszamy cudzego ustawienia, którego nie umiemy odtworzyć
        await dialog.showMessageBox(settingsWin || undefined, { type: 'warning', title: 'Codex', message: 'Nie udało się odczytać obecnego ustawienia „notify” w Codexie.', detail: 'Niczego nie zmieniłem w pliku config.toml.' });
        return codexStatus();
      }
      fs.writeFileSync(codexOrig, JSON.stringify(arr));
    }
    const line = `notify = ${JSON.stringify(['node', codexHook])}\n`;
    t = m ? t.replace(NOTIFY_RE, line) : line + t; // klucz najwyższego poziomu: na początku pliku, przed tabelami
  } else {
    let orig = null; try { orig = JSON.parse(fs.readFileSync(codexOrig, 'utf8')); } catch {}
    t = m ? t.replace(NOTIFY_RE, orig ? `notify = ${JSON.stringify(orig)}\n` : '') : t;
    try { fs.unlinkSync(codexOrig); } catch {}
  }
  fs.mkdirSync(path.dirname(codexConfig), { recursive: true });
  fs.writeFileSync(codexConfig, t);
  return codexStatus();
});

// ---------- przypomnienia ----------
function remindersOut() { return [...(store.data.reminders || [])].sort((a, b) => a.at - b.at); }
function nextRepeat(r) {
  const d = new Date(r.at);
  const step = () => d.setDate(d.getDate() + (r.repeat === 'weekly' ? 7 : 1));
  do { step(); } while (d.getTime() <= Date.now() || (r.repeat === 'weekdays' && (d.getDay() === 0 || d.getDay() === 6)));
  return d.getTime();
}
ipcMain.handle('reminders', () => remindersOut());
ipcMain.handle('reminder-add', (_, r) => {
  if (!r || !r.text || !r.at) return remindersOut();
  store.data.reminders = [...(store.data.reminders || []), { id: newId(), text: String(r.text).slice(0, 200), at: Number(r.at), repeat: r.repeat || 'once' }];
  store.saveData(); send('reminders', remindersOut()); return remindersOut();
});
ipcMain.handle('reminder-remove', (_, id) => { store.data.reminders = (store.data.reminders || []).filter(r => r.id !== id); store.saveData(); send('reminders', remindersOut()); return remindersOut(); });
ipcMain.on('reminder-answer', (_, { id, action }) => {
  const r = (store.data.reminders || []).find(x => x.id === id);
  alertActive = false; applyVisibility();
  if (!r) return;
  if (action === 'snooze') { r.at = Date.now() + 10 * 60e3; r.fired = false; }
  else {
    addNotice({ kind: 'reminder', title: `Przypomnienie · ${r.text}`, body: 'Gotowe', banner: false });
    if (r.repeat && r.repeat !== 'once') { r.at = nextRepeat(r); r.fired = false; }
    else store.data.reminders = store.data.reminders.filter(x => x.id !== id);
  }
  store.saveData(); send('reminders', remindersOut());
});
setInterval(() => {
  const now = Date.now();
  for (const r of store.data.reminders || []) {
    if (!r.fired && r.at <= now) {
      r.fired = true; store.saveData();
      alertActive = true; applyVisibility();
      send('reminder-fire', r);
    }
  }
}, 2000);

// ---------- zrzuty i nagrania ----------
async function takeScreenshot() {
  try {
    const displays = screen.getAllDisplays();
    const maxW = Math.max(...displays.map(d => Math.round(d.size.width * d.scaleFactor)));
    const maxH = Math.max(...displays.map(d => Math.round(d.size.height * d.scaleFactor)));
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
    const dir = path.join(app.getPath('pictures'), 'Screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const saved = [];
    sources.forEach((s, i) => {
      const p = path.join(dir, `Aura ${stamp}${sources.length > 1 ? ' ' + (i + 1) : ''}.png`);
      fs.writeFileSync(p, s.thumbnail.toPNG()); saved.push(p);
    });
    if (saved[0]) {
      suppress = true;
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([fs.readFileSync(saved[0])], { type: 'image/png' }) })]).catch(() => { suppress = false; });
      if (S().capturesToShelf) await addFiles(saved);
      addNotice({ kind: 'capture', title: 'Zrzut ekranu zapisany', body: path.basename(saved[0]), path: saved[0] });
    }
  } catch (e) { addNotice({ kind: 'capture', title: 'Zrzut się nie udał', body: e.message }); }
}
ipcMain.on('screenshot', () => setTimeout(takeScreenshot, 350));
// wycinek: Windows — narzędzie Wycinanie; macOS — zaznaczenie do schowka (jak Cmd+Ctrl+Shift+4)
function snip() { if (IS_MAC) execFile('screencapture', ['-ic'], () => {}); else shell.openExternal('ms-screenclip:'); }
ipcMain.on('snip', snip);
let recStream = null, recPath = null;
ipcMain.handle('rec-start', () => {
  const dir = path.join(app.getPath('videos'), 'Aura');
  fs.mkdirSync(dir, { recursive: true });
  recPath = path.join(dir, `Nagranie ${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.webm`);
  recStream = fs.createWriteStream(recPath);
  return recPath;
});
ipcMain.on('rec-chunk', (_, buf) => { if (recStream) recStream.write(Buffer.from(buf)); });
ipcMain.on('rec-stop', async () => {
  if (!recStream) return;
  const p = recPath; recStream.end(); recStream = null;
  if (S().capturesToShelf) await addFiles([p]);
  addNotice({ kind: 'capture', title: 'Nagranie zapisane', body: path.basename(p), path: p });
});

// ---------- launcher ----------
ipcMain.handle('launch-pick', async (_, i) => {
  const r = await dialog.showOpenDialog(settingsWin || island, {
    title: 'Wybierz aplikację lub plik', defaultPath: path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    properties: ['openFile'], filters: [{ name: 'Aplikacje i skróty', extensions: ['exe', 'lnk', 'url', 'bat', 'cmd'] }, { name: 'Wszystko', extensions: ['*'] }],
  });
  if (r.canceled || !r.filePaths[0]) return S().launchApps;
  const list = [...S().launchApps]; list[i] = r.filePaths[0];
  applySettings({ launchApps: list });
  return list;
});
const launchInfo = () => Promise.all(S().launchApps.map(async p => {
  if (!p || !fs.existsSync(p)) return null;
  let icon = null; try { const ic = await fileIcon(p); if (!ic.isEmpty()) icon = ic.toDataURL(); } catch {}
  return { path: p, name: path.basename(p).replace(/\.(lnk|exe|url)$/i, ''), icon };
}));
ipcMain.handle('launch-info', launchInfo);
const launchSlot = i => { const p = S().launchApps[i]; if (p && fs.existsSync(p)) shell.openPath(p); };
ipcMain.on('launch', (_, i) => launchSlot(i));

// ---------- czat transmisji (moduł z drugiej sesji) ----------
const { Chat, openChatWindow } = require('./lib/chat');
const chat = new Chat();
let chatWin = null, chatState = null;
const sendChat = p => send('chat', p, chatWin);
chat.on('message', m => sendChat({ kind: 'message', m }));
chat.on('remove', r => sendChat({ kind: 'remove', ...r }));
chat.on('state', s => { chatState = s; sendChat({ kind: 'state', s }); send('chat-state', s, settingsWin); });
ipcMain.handle('chat-recent', () => ({ messages: chat.recent || [], state: chatState }));
ipcMain.handle('chat-state', () => chatState);
ipcMain.on('chat-pin', (_, on) => { if (chatWin && !chatWin.isDestroyed()) chatWin.setAlwaysOnTop(!!on, on ? 'screen-saver' : 'floating'); });
function configureChat() { chat.start({ twitch: S().chatTwitch || '' }); }
function toggleChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) { chatWin.close(); return; }
  chatWin = openChatWindow({ preload: path.join(__dirname, 'preload.js'), bounds: S().chatBounds, onBounds: b => applySettings({ chatBounds: b }) });
  chatWin.on('closed', () => { chatWin = null; });
}
ipcMain.on('chat-toggle', toggleChatWindow);

// ---------- animowana tapeta (moduł z drugiej sesji) ----------
const { Wallpaper } = require('./lib/wallpaper');
const wp = new Wallpaper();
let wpState = null;
wp.on('state', s => { wpState = s; both('wallpaper', s); });
const wpFilters = () => ({ hue: S().wpHue, saturation: S().wpSaturation, brightness: S().wpBrightness, contrast: S().wpContrast });
function configureWallpaper() { if (IS_MAC) return; wp.start(S().liveWallpaper ? S().liveWallpaperFile : '', wpFilters()).catch(e => both('wallpaper', { running: false, error: e.message })); }
ipcMain.handle('wallpaper-state', () => wpState);
ipcMain.handle('wallpaper-pick', async () => {
  const r = await dialog.showOpenDialog(settingsWin || undefined, { title: 'Wybierz film na tapetę', defaultPath: app.getPath('videos'), properties: ['openFile'], filters: [{ name: 'Filmy', extensions: ['mp4', 'mov', 'mkv', 'webm', 'wmv', 'avi'] }] });
  if (!r.canceled && r.filePaths[0]) applySettings({ liveWallpaperFile: r.filePaths[0], liveWallpaper: true });
  return S();
});

// ---------- PC Deck: telefon jako pilot (moduł z drugiej sesji) ----------
const { Deck } = require('./lib/deck');
const deck = new Deck({
  dataDir: app.getPath('userData'),
  // zgodnie z API modułu: 6 miejsc (null = puste), indeks = numer miejsca
  getApps: async () => (await launchInfo()).map(a => a && { name: a.name, icon: a.icon }),
  launch: i => launchSlot(i),
  getMedia: () => sys.media && sys.media.has ? { title: sys.media.title, artist: sys.media.artist, playing: sys.media.playing,
    art: sys.thumb && sys.thumb.length < 270000 ? sys.thumb : undefined } : null,
  // statystyki dla kart Tryby i Komputer na telefonie
  getStats: async () => {
    const a = cpuSample(); await new Promise(r => setTimeout(r, 250)); const b = cpuSample();
    const cpu = 100 * (1 - (b.idle - a.idle) / Math.max(1, b.total - a.total));
    const g = await gpuSample();
    return { cpu: Math.round(cpu), gpu: g ? Math.round(g.util) : null, ram: Math.round(100 * memUsed() / os.totalmem()), temp: g ? Math.round(g.temp) : null };
  },
  // akcje z telefonu: mikrofon, zrzut i nagrywanie robi Aura; zasilanie robi Deck, a my tylko powiadamiamy
  onAction: (name, info) => {
    if (name === 'mic') toggleMic();
    else if (name === 'screenshot') takeScreenshot();
    else if (name === 'record') send('record-toggle');
    else if (name === 'restart' || name === 'shutdown') addNotice({ kind: 'phone', title: name === 'restart' ? 'Ponowne uruchomienie z telefonu' : 'Wyłączanie z telefonu', body: `Za ${info && info.delay ? info.delay : 30} s · zapisz pracę` });
    else if (name === 'cancel') addNotice({ kind: 'phone', title: 'Anulowano z telefonu', body: 'Komputer zostaje włączony' });
  },
  // „Edytuj” na telefonie zmienia miejsca launchera
  setApp: async (slot, p) => { if (slot < 0 || slot > 5) return; const l = [...S().launchApps]; l[slot] = p || ''; applySettings({ launchApps: l }); },
});
let deckState = null;
deck.on('state', s => { deckState = s; both('deck', s); });
deck.on('need-accessibility', () => addNotice({ kind: 'phone', title: 'PC Deck: daj Aurze dostęp', body: 'Ustawienia systemowe → Prywatność i ochrona → Dostępność → włącz Aurę. Bez tego Mac ignoruje ruchy z telefonu.' }));
deck.on('pair-request', r => { alertActive = true; applyVisibility(); send('deck-pair', r); });
ipcMain.handle('deck-state', () => deckState);
ipcMain.handle('deck-start', async () => { try { return await deck.start(); } catch (e) { return { running: false, error: e.message }; } });
ipcMain.on('deck-stop', () => deck.stop());
ipcMain.on('deck-forget', (_, id) => deck.forget(id));
ipcMain.on('deck-reset', () => deck.resetToken());
ipcMain.on('deck-answer', (_, { id, ok }) => { alertActive = false; applyVisibility(); if (ok) deck.approve(id); else deck.deny(id); });

// ---------- widżety: statystyki, pogoda ----------
let statsOn = false, prevCpu = null, gpuOk = true;
const cpuSample = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); a.idle += c.times.idle; a.total += t; return a; }, { idle: 0, total: 0 });
function gpuSample() {
  return new Promise(resolve => {
    if (!gpuOk) return resolve(null);
    execFile('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 1500 }, (err, out) => {
      if (err) { gpuOk = false; return resolve(null); }
      const [u, t] = String(out).split('\n')[0].split(',').map(x => parseFloat(x));
      resolve({ util: u, temp: t });
    });
  });
}
// ---------- pamięć RAM ----------
// macOS: „wolna” pamięć jest prawie zawsze mała (system trzyma tam pamięć podręczną), więc 1 − wolna/całość daje
// ok. 90%. Liczymy jak Monitor aktywności: pamięć aplikacji (aktywna) + zablokowana + skompresowana.
let macMem = null;
function refreshMacMem() {
  execFile('/usr/bin/vm_stat', (err, out) => {
    if (err) return;
    const ps = Number((String(out).match(/page size of (\d+)/) || [])[1]) || 16384;
    const pg = k => Number((String(out).match(new RegExp(k + ':\\s+(\\d+)')) || [])[1]) || 0;
    // „Pamięć aplikacji” jak w Monitorze aktywności: strony anonimowe bez możliwych do zwolnienia (bez pamięci
    // podręcznej plików, którą macOS zalicza do „aktywnej”); starsze systemy bez tej linii — aktywna
    const anon = pg('Anonymous pages'), appMem = anon ? Math.max(0, anon - pg('Pages purgeable')) : pg('Pages active');
    const used = (appMem + pg('Pages wired down') + pg('Pages occupied by compressor')) * ps;
    macMem = Math.min(used, os.totalmem());
  });
}
function memUsed() {
  if (IS_MAC) { refreshMacMem(); if (macMem != null) return macMem; }
  return os.totalmem() - os.freemem();
}
// Co zużywa najwięcej pamięci: procesy zsumowane po aplikacji (np. wszystkie procesy Chrome razem), w MB
function topMemory() {
  return new Promise(resolve => {
    const done = map => resolve([...map.entries()].map(([name, kb]) => ({ name, mb: Math.round(kb / 1024) })).sort((a, b) => b.mb - a.mb).slice(0, 8));
    const map = new Map(), add = (n, kb) => { if (n && kb > 0) map.set(n, (map.get(n) || 0) + kb); };
    if (IS_MAC) {
      execFile('/bin/ps', ['-axo', 'rss=,comm='], { maxBuffer: 4 << 20 }, (err, out) => {
        for (const line of String(out || '').split('\n')) {
          const m = line.trim().match(/^(\d+)\s+(.+)$/); if (!m) continue;
          const app = (m[2].match(/\/([^/]+)\.app\//) || [])[1]; // pierwsza aplikacja w ścieżce (pomocniki liczą się do niej)
          add(app || path.basename(m[2]), Number(m[1]));
        }
        done(map);
      });
    } else {
      execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, maxBuffer: 4 << 20 }, (err, out) => {
        for (const line of String(out || '').split(/\r?\n/)) {
          const c = line.match(/"([^"]*)"/g); if (!c || c.length < 5) continue;
          const name = c[0].slice(1, -1).replace(/\.exe$/i, ''), kb = Number(c[4].slice(1, -1).replace(/[^\d]/g, ''));
          add(name, kb);
        }
        done(map);
      });
    }
  });
}
ipcMain.handle('mem-top', async () => ({ total: os.totalmem(), used: memUsed(), list: await topMemory() }));
if (IS_MAC) refreshMacMem();
setInterval(async () => {
  if (!statsOn && !gameOn) return;
  helper.send({ c: 'stats' });
  const s = cpuSample();
  const cpu = prevCpu ? 100 * (1 - (s.idle - prevCpu.idle) / Math.max(1, s.total - prevCpu.total)) : 0;
  prevCpu = s;
  const gpu = await gpuSample();
  const used = memUsed();
  send('stats', { cpu, ram: 100 * used / os.totalmem(), ramUsed: used / 1073741824, gpu, net: sys.net || { rx: 0, tx: 0 } });
}, 2000);
ipcMain.on('stats-on', (_, on) => { statsOn = !!on; });

let weather = null, weatherAt = 0;
const WMO = { 0: 'Bezchmurnie', 1: 'Przeważnie słonecznie', 2: 'Częściowe zachmurzenie', 3: 'Pochmurno', 45: 'Mgła', 48: 'Szadź', 51: 'Mżawka', 53: 'Mżawka', 55: 'Mżawka', 61: 'Deszcz', 63: 'Deszcz', 65: 'Ulewa', 66: 'Marznący deszcz', 67: 'Marznący deszcz', 71: 'Śnieg', 73: 'Śnieg', 75: 'Śnieżyca', 77: 'Krupa', 80: 'Przelotny deszcz', 81: 'Przelotny deszcz', 82: 'Ulewa', 85: 'Przelotny śnieg', 86: 'Przelotny śnieg', 95: 'Burza', 96: 'Burza z gradem', 99: 'Burza z gradem' };
async function refreshWeather(force) {
  if (!force && Date.now() - weatherAt < 20 * 60e3 && weather) return send('weather', weather);
  try {
    let { weatherLat: lat, weatherLon: lon, weatherCity: city } = S();
    if (lat == null || lon == null) {
      const q = city || (Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop() || 'Warsaw').replace(/_/g, ' ');
      const g = await (await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=pl&name=${encodeURIComponent(q)}`)).json();
      if (!g.results || !g.results[0]) throw new Error('Nie znaleziono miejsca');
      lat = g.results[0].latitude; lon = g.results[0].longitude;
      store.set({ weatherLat: lat, weatherLon: lon, weatherName: g.results[0].name });
    }
    const unit = S().fahrenheit ? '&temperature_unit=fahrenheit' : '';
    const w = await (await net.fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code&forecast_hours=7&timezone=auto&forecast_days=1${unit}`)).json();
    weather = { temp: Math.round(w.current.temperature_2m), code: w.current.weather_code, day: !!w.current.is_day, text: WMO[w.current.weather_code] || '', max: Math.round(w.daily.temperature_2m_max[0]), min: Math.round(w.daily.temperature_2m_min[0]), place: S().weatherName,
      // prognoza na najbliższe godziny (widżet Prognoza godzinowa)
      hours: w.hourly && Array.isArray(w.hourly.time) ? w.hourly.time.map((t, i) => ({ h: String(t).slice(11, 13), temp: Math.round(w.hourly.temperature_2m[i]), code: w.hourly.weather_code[i] })).slice(1, 7) : [] };
    weatherAt = Date.now();
    send('weather', weather);
  } catch (e) { send('weather', { error: e.message }); }
}
ipcMain.on('weather-refresh', () => refreshWeather(false));
ipcMain.handle('weather-city', async (_, city) => { store.set({ weatherCity: city, weatherLat: null, weatherLon: null, weatherName: '' }); await refreshWeather(true); both('settings', S()); return weather; });

// ---------- teksty piosenek (LRCLIB, tylko po włączeniu) ----------
let lyricsKey = '';
async function onTrack(m) {
  if (!S().lyrics || !m || !m.has || !m.title) return;
  const key = `${m.artist}|${m.title}`;
  if (key === lyricsKey) return;
  lyricsKey = key;
  if (!m.artist) { send('lyrics', null); return; }
  send('lyrics', 'loading'); // karta zostaje szeroka, dopóki szukamy tekstu (wcześniej zwężała się i rozszerzała przy każdej zmianie utworu)
  const H = { headers: { 'User-Agent': 'Aura/2.1 (https://github.com/famefabricators-maker/aura)' } };
  // „Recap (feat. X)”, „Song - Remastered 2011”, „A, B” -> czysty tytuł i pierwszy wykonawca do wyszukiwania
  const clean = s => String(s || '').replace(/\s*[([](feat\.?|ft\.?|with|prod\.?)[^)\]]*[)\]]/ig, '').replace(/\s+-\s+(.*remaster.*|radio edit|live.*|.*version)$/i, '').trim();
  const artist1 = String(m.artist).split(/,|&| x | feat\.? /i)[0].trim();
  let synced = null;
  try {
    // 1) dokładne dopasowanie (tytuł, wykonawca, album, długość)
    if (m.end > 30) {
      const q = `track_name=${encodeURIComponent(m.title)}&artist_name=${encodeURIComponent(m.artist)}&album_name=${encodeURIComponent(m.album || '')}&duration=${Math.round(m.end)}`;
      const r = await net.fetch(`https://lrclib.net/api/get?${q}`, H);
      if (r.ok) synced = (await r.json()).syncedLyrics || null;
    }
    // 2) wyszukiwanie: oczyszczony tytuł + pierwszy wykonawca, najbliższa długość utworu
    if (!synced) {
      const r = await net.fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(clean(m.title))}&artist_name=${encodeURIComponent(artist1)}`, H);
      if (r.ok) {
        const list = (await r.json()).filter(x => x && x.syncedLyrics);
        if (m.end > 30) list.sort((a, b) => Math.abs((a.duration || 0) - m.end) - Math.abs((b.duration || 0) - m.end));
        const best = list[0];
        if (best && (!(m.end > 30) || Math.abs((best.duration || m.end) - m.end) <= 8)) synced = best.syncedLyrics;
      }
    }
  } catch {}
  if (lyricsKey !== key) return;
  if (!synced) { send('lyrics', null); return; }
  const lines = synced.split('\n').map(l => { const mm = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/); return mm ? { t: +mm[1] * 60 + +mm[2], text: mm[3] } : null; }).filter(Boolean);
  send('lyrics', lines);
}

// ---------- kalendarz (.ics) ----------
let calendar = [], calNotified = new Set();
// moduł z drugiej sesji: strefy czasowe (też Outlooka), powtarzanie, linki Teams/Meet/Zoom
const { Calendar } = require('./lib/calendar');
const cal = new Calendar({ fetch: net.fetch });
cal.on('events', list => { calendar = list || []; both('calendar', calendar); });
cal.on('error', m => send('calendar', { error: m }));
function refreshCalendar() { cal.setSource((S().calendarIcs || '').trim()); }
setInterval(() => {
  if (!S().meetingNotice) return;
  const now = Date.now();
  for (const e of calendar) {
    const key = e.title + e.start;
    if (!e.allDay && e.start - now <= 5 * 60e3 && e.start > now && !calNotified.has(key)) {
      calNotified.add(key);
      addNotice({ kind: 'reminder', title: e.title, body: `Za ${Math.max(1, Math.round((e.start - now) / 60e3))} min${e.location ? ' · ' + e.location : ''}` });
    }
  }
}, 30e3);
ipcMain.handle('calendar', () => calendar);

// ---------- OBS Studio (moduł z drugiej sesji) ----------
const { Obs } = require('./lib/obs');
const obs = new Obs();
let obsState = null;
obs.on('state', s => { obsState = s; both('obs', s); });
obs.on('recorded', async p => { if (S().capturesToShelf) await addFiles([p]); addNotice({ kind: 'capture', title: 'Nagranie OBS zapisane', body: path.basename(p), path: p }); });
function configureObs() { obs.configure({ enabled: S().obsEnabled, auto: S().obsAuto, port: Number(S().obsPort) || 4455, password: S().obsPassword || '' }); }
ipcMain.handle('obs-local', () => Obs.findLocal());
ipcMain.handle('obs-state', () => obsState);

// ---------- aktualizacje z GitHuba ----------
const { Updates } = require('./lib/updates');
const updates = new Updates({ portable: PORTABLE });
updates.on('state', s => send('update-state', s, settingsWin));
updates.on('ready', v => { alertActive = true; applyVisibility(); send('update-alert', { version: v, kind: 'ready' }); });
updates.on('available', v => { if (!S().updateNotify) return; alertActive = true; applyVisibility(); send('update-alert', { version: v, kind: 'available' }); });
ipcMain.handle('update-state', () => updates.state);
ipcMain.handle('update-check', () => updates.check(true));
ipcMain.on('update-answer', (_, a) => {
  alertActive = false; applyVisibility();
  if (a === 'install') updates.install(); else if (a === 'open') updates.openPage(); else updates.later();
});

// ---------- mała przeglądarka pod wyspą (karta Web) ----------
// Okno ze szklaną ramką (Acrylic) i własnym paskiem; strona siedzi w osobnym widoku z zaokrąglonymi rogami.
let webWin = null, webView = null;
const WEB_PAD = 8, WEB_BAR = 44;
function layoutWeb() {
  if (!webWin || webWin.isDestroyed() || !webView) return;
  const [w, h] = webWin.getContentSize();
  webView.setBounds({ x: WEB_PAD, y: WEB_BAR, width: Math.max(0, w - WEB_PAD * 2), height: Math.max(0, h - WEB_BAR - WEB_PAD) });
}
function webInfo() {
  if (!webView) return;
  const wc = webView.webContents;
  send('web-info', { title: wc.getTitle(), url: wc.getURL(), back: wc.navigationHistory.canGoBack(), fwd: wc.navigationHistory.canGoForward(), loading: wc.isLoading() }, webWin);
}
function hideWeb() { if (webWin && !webWin.isDestroyed()) webWin.hide(); }
ipcMain.on('web-open', (_, url) => {
  if (!/^https?:\/\//i.test(url || '')) return;
  const d = screen.getPrimaryDisplay().workArea;
  const w = 480, h = Math.min(760, d.height - 90);
  const b = island.getBounds();
  const x = Math.round(Math.min(Math.max(d.x + 8, b.x + WIN_W / 2 - w / 2), d.x + d.width - w - 8));
  const webY = S().edge === 'bottom' ? d.y + d.height - h - 70 : d.y + 70; // przy wyspie na dole — nad nią
  if (!webWin || webWin.isDestroyed()) {
    webWin = new BrowserWindow({
      width: w, height: h, x, y: webY, frame: false, show: false, resizable: true, minWidth: 340, minHeight: 300,
      backgroundColor: '#00000000', backgroundMaterial: 'acrylic', roundedCorners: true, title: 'Aura — Web',
      icon: path.join(__dirname, 'icon.ico'),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    webWin.setMenu(null);
    webWin.loadFile(path.join('web', 'index.html'));
    webView = new WebContentsView({ webPreferences: { partition: 'persist:wyspa-web', contextIsolation: true, sandbox: true, backgroundThrottling: false,
      preload: path.join(__dirname, 'web', 'page-preload.js') } }); // powiadomienia stron -> wyspa; bez dławienia w tle (np. Messenger)
    webView.setBorderRadius(12);
    webView.setBackgroundColor('#0b0b0c');
    webWin.contentView.addChildView(webView);
    const wc = webView.webContents;
    wc.setWindowOpenHandler(({ url: u }) => { if (/^https?:/i.test(u)) wc.loadURL(u); return { action: 'deny' }; });
    wc.on('will-navigate', (e, u) => { if (!/^https?:/i.test(u)) e.preventDefault(); }); // tylko strony www, bez file:// itp.
    for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading']) wc.on(ev, webInfo);
    // Esc zamyka okno (strona dalej gra w tle — np. muzyka)
    const esc = (e, input) => { if (input.type === 'keyDown' && input.key === 'Escape' && !wc.isFullScreen?.()) { hideWeb(); e.preventDefault(); } };
    wc.on('before-input-event', esc);
    webWin.webContents.on('before-input-event', esc);
    webWin.on('resize', layoutWeb);
    // położenie i rozmiar zapamiętane (po zamknięciu i ponownym otwarciu okno wraca na swoje miejsce)
    let saveT = null;
    const saveBounds = () => { clearTimeout(saveT); saveT = setTimeout(() => { if (!webWin || webWin.isDestroyed() || webWin.isMinimized()) return; store.data.webBounds = webWin.getBounds(); store.saveData(); }, 400); };
    for (const ev of ['moved', 'resized', 'move', 'resize']) webWin.on(ev, saveBounds);
    webWin.on('close', e => { if (!quitting) { e.preventDefault(); hideWeb(); } });
    webWin.on('closed', () => { webWin = null; webView = null; });
  }
  // zapamiętane położenie, o ile ekran nadal istnieje; inaczej domyślnie przy wyspie
  const sb = store.data.webBounds;
  const onScreen = sb && screen.getAllDisplays().some(dd => { const a = dd.workArea; return sb.x + 60 < a.x + a.width && sb.x + sb.width - 60 > a.x && sb.y >= a.y - 10 && sb.y + 40 < a.y + a.height; });
  if (!webWin.isVisible() && !webWin.isMinimized()) webWin.setBounds(onScreen ? sb : { x, y: webY, width: w, height: h });
  if (webWin.isMinimized()) webWin.restore();
  layoutWeb();
  if (webView.webContents.getURL() !== url) webView.webContents.loadURL(url);
  webWin.show(); webWin.focus();
  setTimeout(webInfo, 300);
});
ipcMain.on('web-cmd', (_, cmd) => {
  if (!webView) return;
  const wc = webView.webContents, h = wc.navigationHistory;
  if (cmd === 'back' && h.canGoBack()) h.goBack();
  if (cmd === 'fwd' && h.canGoForward()) h.goForward();
  if (cmd === 'reload') wc.reload();
  if (cmd === 'external' && /^https?:\/\//i.test(wc.getURL())) shell.openExternal(wc.getURL());
  if (cmd === 'close') hideWeb();
  if (cmd === 'min' && webWin && !webWin.isDestroyed()) webWin.minimize();
});
// powiadomienia stron z karty Web (np. Messenger: kto i co napisał) -> wyspa; tylko z naszego widoku, z limitem
const webNotifyLog = [];
ipcMain.on('web-notify', (e, n) => {
  if (!webView || e.sender !== webView.webContents || !S().webNotifications || !n) return;
  const now = Date.now(); while (webNotifyLog.length && now - webNotifyLog[0] > 60000) webNotifyLog.shift();
  if (webNotifyLog.length >= 20 || (webNotifyLog.length && now - webNotifyLog[webNotifyLog.length - 1] < 800)) return; // najwyżej 20/min
  webNotifyLog.push(now);
  let site = ''; try { site = new URL(webView.webContents.getURL()).hostname.replace(/^www\./, ''); } catch {}
  const title = String(n.title || '').trim(), body = String(n.body || '').trim();
  if (!title && !body) return;
  addNotice({ kind: 'web', title: title || site, body: body ? body : site, site });
});
ipcMain.on('web-pins', (_, pins) => { if (Array.isArray(pins)) applySettings({ webPins: pins.filter(p => p && /^https?:\/\//i.test(p.url)).slice(0, 12) }); });

// ---------- widżety: wybór i kolejność (prawy przycisk na widżecie) ----------
const WIDGET_NAMES = { today: 'Dzisiaj', focus: 'Skupienie', weather: 'Pogoda', stats: 'Statystyki komputera', todo: 'Zadania', notes: 'Notatka', timers: 'Minutniki', forecast: 'Prognoza godzinowa' };
ipcMain.on('widgets-menu', (e, id) => {
  const cur = (Array.isArray(S().widgets) && S().widgets.length ? S().widgets : ['today', 'focus', 'weather', 'stats']).filter(k => WIDGET_NAMES[k]);
  const tpl = [];
  if (id && cur.includes(id)) {
    const i = cur.indexOf(id);
    const move = d => () => { const a = [...cur]; [a[i], a[i + d]] = [a[i + d], a[i]]; applySettings({ widgets: a }); };
    tpl.push({ label: `${WIDGET_NAMES[id]}: przesuń wcześniej`, enabled: i > 0, click: move(-1) },
      { label: `${WIDGET_NAMES[id]}: przesuń dalej`, enabled: i < cur.length - 1, click: move(1) },
      { label: `Ukryj: ${WIDGET_NAMES[id]}`, enabled: cur.length > 1, click: () => applySettings({ widgets: cur.filter(x => x !== id) }) },
      { type: 'separator' });
  }
  tpl.push({ label: 'Widżety na karcie', enabled: false });
  for (const [k, name] of Object.entries(WIDGET_NAMES)) {
    tpl.push({ label: name, type: 'checkbox', checked: cur.includes(k), enabled: !(cur.length === 1 && cur.includes(k)),
      click: () => applySettings({ widgets: cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k] }) });
  }
  Menu.buildFromTemplate(tpl).popup({ window: BrowserWindow.fromWebContents(e.sender) || undefined });
});

// ---------- notatki / zadania ----------
ipcMain.handle('notes', () => ({ notes: store.data.notes, todos: store.data.todos }));
ipcMain.on('notes-set', (_, d) => { if (typeof d.notes === 'string') store.data.notes = d.notes.slice(0, 5000); if (Array.isArray(d.todos)) store.data.todos = d.todos.slice(0, 50); store.saveData(); });

// ---------- stan początkowy dla okna wyspy ----------
ipcMain.handle('init', async () => ({
  settings: S(), screen: screenInfo(), files: await filesOut(), clips: clipsOut(), notices: store.data.notices || [],
  reminders: remindersOut(), agents: agentsOut(), sys: { vol: sys.vol, mic: sys.mic, inuse: sys.inuse, media: sys.media, thumb: sys.thumb, bright: sys.bright, covered: !!sys.covered, capture: sys.capture || [], captureSince: sys.captureSince || {}, devbat: sys.devbat || [] },
  hotkeyErrors, winAccent: winAccent(),
}));
function winAccent() { try { const c = systemPreferences.getAccentColor(); return c ? '#' + c.slice(0, 6) : null; } catch { return null; } }
ipcMain.handle('win-accent', () => winAccent());
ipcMain.on('rects', (_, r) => { if (r && r.c && r.o) rects = r; });
ipcMain.on('hold', (_, on) => { hold = !!on; });
ipcMain.on('close-island', () => { pin = false; hold = false; open = false; send('open', false); });
ipcMain.on('pin-open', () => { pin = true; pinEntered = false; });

// ---------- przechwytywanie ekranu (szkło, wizualizator, nagrywanie) ----------
function setupCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const d = screen.getPrimaryDisplay();
      const src = sources.find(s => String(s.display_id) === String(d.id)) || sources[0];
      // dźwięk systemu („loopback”) Electron daje tylko na Windowsie
      cb(req.audioRequested === false || IS_MAC ? { video: src } : { video: src, audio: 'loopback' });
    } catch { cb({}); }
  });
  // kamera/mikrofon/ekran tylko dla własnych stron Aury (file://), nic więcej
  const own = (wc, origin) => (!wc || /^file:/i.test(wc.getURL())) && (!origin || /^file:/i.test(origin));
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, d) => cb(['media', 'display-capture'].includes(perm) && own(wc, d && d.requestingUrl)));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => ['media', 'display-capture'].includes(perm) && own(wc, origin));
  // karta Web (obce strony): bez kamery, mikrofonu, lokalizacji, powiadomień, otwierania programów przez protokoły itp.
  const web = session.fromPartition('persist:wyspa-web');
  const WEB_OK = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'mediaKeySystem']);
  web.setPermissionRequestHandler((wc, perm, cb) => cb(WEB_OK.has(perm)));
  web.setPermissionCheckHandler((wc, perm) => WEB_OK.has(perm));
  web.setDisplayMediaRequestHandler((req, cb) => cb({}));
}
// Własne okna (wyspa, ustawienia, czat, tapeta, pasek Web) nie mogą przejść na obcą stronę ani otwierać nowych okien.
app.on('web-contents-created', (_, wc) => {
  if (wc.session !== session.defaultSession) return; // karta Web ma własne zasady (setWindowOpenHandler przy tworzeniu)
  wc.on('will-navigate', (e, u) => { if (!/^file:/i.test(u)) e.preventDefault(); });
  wc.on('will-redirect', (e, u) => { if (!/^file:/i.test(u)) e.preventDefault(); });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-attach-webview', e => e.preventDefault());
});

// ---------- zasobnik / autostart ----------
function setAutostart() {
  // wersja zainstalowana: sam Aura.exe; uruchamiana z kodu: electron.exe + folder aplikacji
  app.setLoginItemSettings(app.isPackaged ? { openAtLogin: !!S().autostart } : { openAtLogin: !!S().autostart, path: process.execPath, args: [app.getAppPath()] });
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Otwórz wyspę', click: () => HOTKEY_ACTIONS.open() },
    { label: userHidden ? 'Pokaż wyspę' : 'Ukryj wyspę', click: () => HOTKEY_ACTIONS.hide() },
    { label: 'Ustawienia…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Zakończ Aurę', click: () => app.quit() },
  ]));
}

// ---------- pasek zadań Aury ----------
let taskbar = null;
function configureDock() {
  if (IS_MAC) return;
  if (!taskbar) {
    taskbar = new Taskbar({ S, set: p => applySettings(p), preload: path.join(__dirname, 'preload.js'),
      // pierwotny stan paska Windows: zapisany raz (nie nadpisujemy go stanem, który ustawiła sama Aura)
      getOrig: () => store.data.taskbarOrig, saveOrig: v => { if (!Number.isFinite(store.data.taskbarOrig) && Number.isFinite(v)) { store.data.taskbarOrig = v; store.saveData(); } },
      clearOrig: () => { if ('taskbarOrig' in store.data) { delete store.data.taskbarOrig; store.saveData(); } },
      mediaProc: id => mediaProcName(id), mediaExe: id => appExe.get(id) || null });
    taskbar.on('change', place);
    taskbar.on('visibility', () => send('screen', screenInfo())); // pasek wysunięty/schowany: wyspa na dole podjeżdża razem z nim
    if (process.env.WYSPA_WAKETEST) setInterval(() => { // test odświeżania paska po uśpieniu: stan co sekundę do pliku
      const t = taskbar; try { fs.writeFileSync(process.env.WYSPA_WAKETEST, JSON.stringify({ helper: t.proc && t.proc.pid, win: t.win && t.win.id, heard: t.heard, pong: t.lastPong ? Date.now() - t.lastPong : null, woke: t.wokeAt || 0, okna: t.windows.length, ignoring: t.ignoring, hover: t.hover, reveal: t.reveal, covered: t.covered, fullscreen: t.fullscreen, hidden: t.isHidden() })); } catch {}
    }, 250);
  }
  if (S().dock && !taskbar.active) { taskbar.start(); taskbar.setMedia(dockMedia()); }
  else if (!S().dock && taskbar.active) taskbar.stop();
}
const dockMedia = () => (sys.media && sys.media.has ? { has: true, app: sys.media.app || '', title: sys.media.title, artist: sys.media.artist, playing: sys.media.playing, thumb: sys.thumb || null } : null);
ipcMain.on('focus-state', (_, f) => { if (taskbar && f && typeof f === 'object') taskbar.setFocus({ running: !!f.running, left: Number(f.left) || 0 }); });

app.whenReady().then(async () => {
  store.unlock();
  // po awarii przy wyłączonym pasku Aury: przywróć zapamiętany stan paska Windows
  if (!IS_MAC && !S().dock) restoreLeftover();                                // historia schowka i hasła: szyfrowanie działa dopiero teraz
  if (IS_MAC) {
    if (app.dock) app.dock.hide();               // Aura żyje w pasku menu, bez ikony w Docku
    notch = await helper.notch();                // rozmiar fabrycznego wycięcia (0, gdy Mac go nie ma)
    if (!notch.has && store.settings.surface === 'glass') store.set({ surface: 'pure' });
  }
  setupCapture();
  createIsland();
  if ('edgeBottom' in helper) helper.edgeBottom = S().edge === 'bottom'; // pomocnik sprawdza zasłonięcie właściwej krawędzi
  helper.start();
  startEndpoint();
  // macOS: obrazek-szablon (czarny znak A z wyspą) — system sam przebarwia go w jasnym i ciemnym pasku menu
  tray = new Tray(IS_MAC ? (() => { const t = nativeImage.createFromPath(path.join(__dirname, 'trayTemplate.png')); t.setTemplateImage(true); return t; })() : path.join(__dirname, 'icon.ico'));
  tray.setToolTip('Aura');
  if (IS_MAC) tray.on('click', () => tray.popUpContextMenu()); else tray.on('click', () => openSettings());
  updateTray();
  registerHotkeys();
  setAutostart();
  refreshWeather(true);
  refreshCalendar();
  configureObs();
  configureChat();
  updates.start();
  if (S().liveWallpaper) configureWallpaper();
  pruneClips();
  screen.on('display-metrics-changed', place);
  screen.on('display-added', place);
  screen.on('display-removed', place);
  for (const ev of ['resume', 'unlock-screen']) powerMonitor.on(ev, () => setTimeout(() => { try { if (taskbar) taskbar.wake(ev); } catch (e) { logError('wake', e); } }, 2500));
  powerMonitor.on('on-ac', () => S().hudBattery && send('hud', { kind: 'battery', plugged: true }));
  powerMonitor.on('on-battery', () => S().hudBattery && send('hud', { kind: 'battery', plugged: false }));
  configureDock();
  configureMacKeys();
  setTimeout(configureDevBattery, 2000); // pomocnik już działa
  configureDownloads();
  upgradeClaudeHooks(); // dopisz hook zgód do już połączonego Claude Code
  setTimeout(configureToasts, 3000);
  if (process.argv.includes('--settings')) openSettings();
  // macOS: Aura nie ma ikony w Docku, a przy notchu w spoczynku jej nie widać — przy pierwszym uruchomieniu
  // pokazujemy ustawienia, żeby było widać, że działa
  // pierwsza instalacja: wprowadzenie (kilka kart: co robi Aura i jak jej używać); dotychczasowi użytkownicy go nie dostają
  // Wprowadzenie: pokazuje się, dopóki ktoś go nie przejdzie albo nie zamknie (welcomeDone) — wcześniej liczyło się
  // jako pokazane już przy starcie, więc gdy Aura padła zaraz potem (Mac, macOS 26), okno nigdy się nie pojawiło.
  if (!store.data.welcomeDone && !process.env.WYSPA_SHOT) {
    store.data.welcomed = true; store.data.macWelcomed = true; store.saveData();
    setTimeout(() => openSettings('welcome'), 1500);
  }
  if (IS_MAC && !store.data.macWelcomed && !process.env.WYSPA_SHOT) { store.data.macWelcomed = true; store.saveData(); openSettings(); }
  readyAt = Date.now();
  if (process.env.WYSPA_SHOT) testShots(process.env.WYSPA_SHOT);
});
// macOS: ponowne „otwarcie” działającej Aury (Finder, Launchpad, Spotlight) — pokazujemy wyspę i ustawienia,
// zamiast nic nie robić (wcześniej wyglądało to tak, jakby Aura się nie otwierała)
let readyAt = 0;
app.on('activate', () => {
  if (!IS_MAC || !readyAt || Date.now() - readyAt < 3000) return;
  userHidden = false; applyVisibility(); openSettings();
});

// Tryb testowy (tylko z WYSPA_SHOT): zrzuty okna wyspy w kolejnych stanach, potem zamknięcie.
async function testShots(dir) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (process.env.WYSPA_WEB) { await wait(4000); ipcMain.emit('web-open', {}, process.env.WYSPA_WEB); return; }
  if (process.env.WYSPA_VIZ) { // zrzuty do README: Mac z notchem (razem z WYSPA_FAKE_NOTCH) albo Windows; dane przykładowe, nie prawdziwe
    const pre = process.env.WYSPA_FAKE_NOTCH ? 'mac' : 'win';
    const prev = S().surface, prevEdge = S().edge, prevW = S().widgets; if (process.env.WYSPA_VIZ_WIDGETS) applySettings({ widgets: process.env.WYSPA_VIZ_WIDGETS.split(",") }); applySettings({ surface: process.env.WYSPA_VIZ_SURFACE || 'pure', edge: process.env.WYSPA_VIZ_EDGE || prevEdge });
    const shot = async n => fs.writeFileSync(path.join(dir, n.replace(/^mac/, pre) + '.png'), (await island.webContents.capturePage()).toPNG());
    const js = code => island.webContents.executeJavaScript(code);
    const real = !!process.env.WYSPA_VIZ_REAL; // prawdziwy utwór ze Spotify zamiast udawanego
    if (!real) { helper.removeAllListeners('media'); helper.removeAllListeners('thumb'); } // tylko udawany utwór, nie to, co gra naprawdę
    helper.removeAllListeners('covered'); helper.removeAllListeners('fs'); sys.covered = !!process.env.WYSPA_VIZ_COVERED; fsHidden = false; send('covered', sys.covered); applyVisibility(); // bez „cienkiej linii” pod oknami na ekranie
    const fakeWeather = () => { weather = { temp: 4, code: 3, day: true, text: 'Pochmurno', max: 7, min: 1, place: 'Warszawa' }; weatherAt = Date.now(); send('weather', weather); }; // nie prawdziwe miasto
    fakeWeather(); setTimeout(fakeWeather, 3000);
    calendar = [{ title: 'Spotkanie z klientem', start: Date.now() + 2 * 3600e3, end: Date.now() + 3 * 3600e3, allDay: false, location: '' }]; send('calendar', calendar);
    await wait(5000); await shot('mac-1-spoczynek');
    if (pre === 'win') { send('hud', { kind: 'volume', level: 0.62, mute: false }); await wait(700); await shot('win-hud'); await wait(2000); }
    const cover = 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a3d"/><stop offset=".55" stop-color="#d9366e"/><stop offset="1" stop-color="#3a1a5c"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="150" cy="138" r="58" fill="#ffd27a" opacity=".9"/><path d="M0 230 L70 150 L110 190 L160 120 L215 185 L250 160 L300 210 L300 300 L0 300Z" fill="#1d0f33"/><path d="M0 262 L90 205 L150 240 L220 200 L300 245 L300 300 L0 300Z" fill="#120822"/></svg>`).toString('base64');
    if (!real) { sys.thumb = cover; send('thumb', cover); }
    const m = { t: 'media', has: true, title: 'Nocny kurs', artist: 'Tatra Lights', album: 'Halny', app: 'Spotify', playing: true, pos: 72, end: 214, upd: Date.now(), canNext: true, canPrev: true, canSeek: true };
    if (!real) { sys.media = m; send('media', m); } await wait(2500); await shot('mac-2-muzyka');
    addNotice({ kind: 'script', title: 'Build gotowy', body: '0 błędów · 12,4 s' }); await wait(900); await shot('mac-3-powiadomienie'); await wait(5500);
    pin = true; pinEntered = false; open = true; send('open', true); await wait(1200);
    await js(`setTab('music')`); await wait(1200); await shot('mac-4-karta-muzyka');
    await js(`setTab('widgets')`); await wait(1200); fakeWeather(); await wait(1400); await shot('mac-5-karta-widzety');
    pin = false; open = false; send('open', false); await wait(1500); await shot('mac-6-zwinieta');
    applySettings({ surface: prev, edge: prevEdge, widgets: prevW }); await wait(800); app.quit(); return;
  }
  if (process.env.WYSPA_GLASSTEST) { // szkło: kolorowa plansza za wyspą, zakładka przy kilku wartościach rozmycia
    const prev = { surface: S().surface, glassBlur: S().glassBlur };
    applySettings({ surface: 'glass' });
    const b = island.getBounds();
    const back = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, frame: false, focusable: false, skipTaskbar: true, show: false });
    back.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;height:100vh;background:repeating-linear-gradient(90deg,#ff3b5c 0 60px,#ffd23b 60px 120px,#2bd67b 120px 180px,#3b8bff 180px 240px,#b03bff 240px 300px);font:700 46px sans-serif;color:#fff;display:grid;place-items:center">AURA SZKŁO TEST 123</body>'));
    back.showInactive(); island.moveTop();
    await wait(4000);
    pin = true; pinEntered = false; open = true; send('open', true); await wait(900);
    await island.webContents.executeJavaScript(`setTab('${process.env.WYSPA_GLASSTEST}')`); await wait(2500);
    for (const v of [0, 16, 50, 100]) { applySettings({ glassBlur: v }); await wait(2500); fs.writeFileSync(path.join(dir, `szklo-${v}.png`), (await island.webContents.capturePage()).toPNG()); }
    back.destroy(); applySettings(prev); await wait(600); app.quit(); return;
  }
  if (process.env.WYSPA_SECTEST) { // zabezpieczenia: uprawnienia własnych okien i karty Web, blokada nawigacji, Skupienie
    const out = [], log = (k, v) => out.push(`${k}: ${v}`);
    const js = (wc, code) => wc.executeJavaScript(code, true).catch(e => 'wyjątek ' + e.message);
    await wait(4000);
    log('wyspa: przechwytywanie ekranu (szkło)', await js(island.webContents, `navigator.mediaDevices.getDisplayMedia({video:true}).then(s=>{s.getTracks().forEach(t=>t.stop());return 'działa'}).catch(e=>e.name)`));
    await js(island.webContents, `window.open('https://example.com')`); await js(island.webContents, `location.href='https://example.com'`); await wait(1500);
    log('wyspa: po próbie przejścia na obcą stronę', island.webContents.getURL().startsWith('file:') ? 'zostaje na swojej stronie' : 'PRZESZŁA ' + island.webContents.getURL());
    log('wyspa: liczba okien po window.open', BrowserWindow.getAllWindows().length);
    log('Skupienie: przesunięcie pierścienia po +5 +5 −5', await js(island.webContents, `(()=>{Object.assign(st.focus,{mode:'focus',total:0,left:0,running:false});focusAdjust(5);focusAdjust(5);focusAdjust(-5);return document.getElementById('fRing').style.strokeDashoffset+' (0 = pełny) · '+document.getElementById('fTime').textContent})()`));
    ipcMain.emit('web-open', {}, 'https://example.com'); await wait(5000);
    const w = webView.webContents;
    log('Web: mikrofon', await js(w, `navigator.mediaDevices.getUserMedia({audio:true}).then(()=>'DOZWOLONY').catch(e=>e.name)`));
    log('Web: kamera', await js(w, `navigator.mediaDevices.getUserMedia({video:true}).then(()=>'DOZWOLONA').catch(e=>e.name)`));
    log('Web: przechwytywanie ekranu', await js(w, `navigator.mediaDevices.getDisplayMedia({video:true}).then(()=>'DOZWOLONE').catch(e=>e.name)`));
    log('Web: lokalizacja', await js(w, `new Promise(r=>navigator.geolocation.getCurrentPosition(()=>r('DOZWOLONA'),e=>r('odmowa (kod '+e.code+')'),{timeout:4000}))`));
    log('Web: powiadomienia', await js(w, `Notification.requestPermission()`));
    await js(w, `location.href='file:///C:/Windows/win.ini'`); await wait(1000);
    log('Web: przejście na plik z dysku', w.getURL().startsWith('file:') ? 'PRZESZŁA' : 'zablokowane (' + w.getURL() + ')');
    fs.writeFileSync(path.join(dir, 'sec.txt'), out.join('\n'));
    app.quit(); return;
  }
  if (process.env.WYSPA_DRAGTEST && IS_MAC) { // prawdziwe przeciąganie pliku myszą (zdarzenia CoreGraphics) na wyspę: pole AirDrop, potem pole Półka
    const log = s => { fs.appendFileSync(path.join(dir, 'drag.txt'), new Date().toISOString().slice(11, 19) + ' ' + s + '\n'); };
    let adCalls = 0; ipcMain.on('airdrop', (_, p) => { adCalls++; log('IPC airdrop: ' + JSON.stringify(p)); });
    const sb = { x: 40, y: 260, width: 240, height: 180 }; // okno źródła przeciągania (osobny program — .github/mac-drag-source.js, jak Finder)
    await wait(5000);
    log('zachowanie okna wyspy (Mission Control): ' + JSON.stringify(macNative().pinWindow(island)));
    await island.webContents.executeJavaScript(`window.__dl={};['dragenter','dragover','drop','dragleave'].forEach(t=>document.addEventListener(t,e=>{const k=t+' '+((e.target.closest&&e.target.closest('.dp-zone')||{}).dataset?.dp||'-');__dl[k]=(__dl[k]||0)+1},true));'ok'`);
    const b = island.getBounds();
    const pill = { x: b.x + rects.c.x + rects.c.w / 2, y: b.y + rects.c.y + rects.c.h / 2 };
    const zone = side => ({ x: b.x + rects.o.x + rects.o.w * (side === 'air' ? 0.75 : 0.25), y: b.y + rects.o.y + rects.o.h * 0.62 });
    const drive = (to) => new Promise(res => execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `
      ObjC.import('CoreGraphics'); ObjC.import('Foundation');
      function ev(t, x, y) { const e = $.CGEventCreateMouseEvent(null, t, $.CGPointMake(x, y), 0); $.CGEventPost(0, e); }
      function sl(s) { $.NSThread.sleepForTimeInterval(s); }
      function line(a, b, n, t) { for (let i = 1; i <= n; i++) { ev(t, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); sl(0.03); } }
      function run() {
        const s = {x:${sb.x + sb.width / 2}, y:${sb.y + sb.height / 2}}, p = {x:${pill.x}, y:${pill.y}}, z = {x:${to.x}, y:${to.y}};
        ev(5, s.x, s.y); sl(0.3); ev(1, s.x, s.y); sl(0.15);
        line(s, {x: s.x + 30, y: s.y + 10}, 6, 6); line({x: s.x + 30, y: s.y + 10}, p, 30, 6);
        for (let i = 0; i < 30; i++) { ev(6, p.x + (i % 2 ? 2 : -2), p.y); sl(0.06); }  // czekamy, aż wyspa się otworzy
        line(p, z, 20, 6); for (let i = 0; i < 15; i++) { ev(6, z.x + (i % 2 ? 2 : -2), z.y); sl(0.06); }
        ev(2, z.x, z.y); return 'ok';
      }`], { timeout: 30000 }, (err, out) => res(err ? 'błąd: ' + err.message : String(out).trim())));
    const dl = async () => JSON.stringify(await island.webContents.executeJavaScript('window.__dl'));
    log('wyspa: ' + JSON.stringify(b) + ', pole AirDrop: ' + JSON.stringify(zone('air')) + ', pigułka: ' + JSON.stringify(pill));
    const mid = async (name) => { await wait(4000); fs.writeFileSync(path.join(dir, name), (await island.webContents.capturePage()).toPNG()); };
    { const r = drive(zone('air')); mid('drag-nad-airdrop.png'); log('1) na pole AirDrop: ' + await r); } await wait(2500);
    log('   zdarzenia na wyspie: ' + await dl() + ' | wywołań AirDrop: ' + adCalls + ' | otwarta: ' + open);
    fs.writeFileSync(path.join(dir, 'drag-airdrop.png'), (await island.webContents.capturePage()).toPNG());
    await wait(4000); execFile('/usr/bin/pkill', ['-f', 'airdrop-mac.js'], () => {}); await wait(2500);
    await island.webContents.executeJavaScript(`window.__dl={};'ok'`);
    const before = store.data.files.length;
    { const r = drive(zone('shelf')); mid('drag-nad-polka.png'); log('2) na pole Półka: ' + await r); } await wait(2500);
    log('   zdarzenia na wyspie: ' + await dl() + ' | plików na półce: ' + before + ' → ' + store.data.files.length);
    fs.writeFileSync(path.join(dir, 'drag-polka.png'), (await island.webContents.capturePage()).toPNG());
    await wait(500); app.quit(); return;
  }
  if (process.env.WYSPA_KEYSTEST && IS_MAC) { // Mission Control i klawisze głośności: zrzuty ekranu robi skrypt testu
    const log = s => { fs.appendFileSync(path.join(dir, 'klawisze.txt'), new Date().toISOString().slice(11, 19) + ' ' + s + '\n'); };
    await wait(4000);
    log('zachowanie okna: ' + JSON.stringify(macNative().pinWindow(island)) + ' ' + (macNative().error || ''));
    log('głośność teraz: ' + JSON.stringify(macNative().getVolume ? macNative().getVolume() : null) + ', jasność: ' + (macNative().getBrightness ? macNative().getBrightness() : null));
    log('przechwytywanie klawiszy: ' + (macNative().keysActive() ? 'działa' : 'nie działa'));
    const probe = macNative().probeTap(); log('podsłuch testowy: ' + JSON.stringify(probe));
    const t0 = Date.now();
    await wait(30000); // skrypt testu: Mission Control, potem klawisz „głośniej” x2
    log('wywołania kranu: ' + JSON.stringify(macNative().stats));
    log('podsłuch testowy po: ' + JSON.stringify(probe));
    log('okienko głośności z klawisza: ' + (lastKeyHud > t0 ? 'tak' : 'nie') + ', głośność po: ' + JSON.stringify(macNative().getVolume ? macNative().getVolume() : null));
    app.quit(); return;
  }
  if (process.env.WYSPA_AIRDROPTEST && IS_MAC) { // AirDrop: menu „Udostępnij” dla pliku z półki (zrzut ekranu robi test)
    const f = path.join(dir, 'plik-do-airdrop.txt'); fs.writeFileSync(f, 'Aura AirDrop test');
    await wait(4000); pin = true; pinEntered = false; open = true; send('open', true);
    await wait(900); await island.webContents.executeJavaScript(`setTab('airdrop')`); await wait(1500);
    fs.writeFileSync(path.join(dir, 'karta-airdrop.png'), (await island.webContents.capturePage()).toPNG());
    ipcMain.emit('airdrop', { sender: island.webContents }, [f]);
    await wait(4000); fs.writeFileSync(path.join(dir, 'karta-po-upuszczeniu.png'), (await island.webContents.capturePage()).toPNG());
    await wait(5000); app.quit(); return;
  }
  if (process.env.WYSPA_UPDATETEST && !process.env.WYSPA_AUTOUPD) { // aktualizacje: udajemy starą wersję i sprawdzamy GitHuba (z AUTOUPD — pełna aktualizacja niżej)
    await wait(4000);
    const s = await updates.check(true); await wait(1200);
    fs.writeFileSync(path.join(dir, 'update.txt'), JSON.stringify(s));
    fs.writeFileSync(path.join(dir, 'update-alert.png'), (await island.webContents.capturePage()).toPNG());
    app.quit(); return;
  }
  if (process.env.WYSPA_AUTOUPD && (updates.updater || updates.macAuto)) { // automatyczna aktualizacja: wykrycie i pobranie (Mac: z WYSPA_AUTOUPD_INSTALL też podmiana)
    if (updates.updater) updates.updater.autoInstallOnAppQuit = false;
    const log = s => fs.appendFileSync(path.join(dir, 'autoupd.txt'), new Date().toISOString().slice(11, 19) + ' ' + s + '\n');
    updates.on('state', s => log(JSON.stringify(s)));
    await wait(3000); updates.check(true);
    for (let i = 0; i < 90 && !['ready', 'error', 'current', 'available'].includes(updates.state.status); i++) await wait(2000);
    await wait(1500);
    fs.writeFileSync(path.join(dir, 'autoupd-alert.png'), (await island.webContents.capturePage()).toPNG());
    if (process.env.WYSPA_AUTOUPD_INSTALL && updates.macAuto && updates.state.status === 'ready') { log('instaluję'); updates.install(); return; }
    app.exit(0); return;
  }
  if (process.env.WYSPA_DECKE2E) { // udawany telefon: parowanie → WebSocket → ruch myszy → czy kursor się przesunął
    const log = s => fs.appendFileSync(path.join(dir, 'deck-e2e.txt'), new Date().toISOString().slice(11, 19) + ' ' + s + '\n');
    await wait(3000);
    try {
      const st = await deck.start(); log('start ' + JSON.stringify({ running: st.running, error: st.error }));
      const base = st.url;
      const pr = await (await net.fetch(base + 'pair', { method: 'POST', body: JSON.stringify({ name: 'Test' }), headers: { 'Content-Type': 'application/json' } })).json();
      log('pair ' + JSON.stringify(pr));
      deck.approve(pr.id);
      const ok = await (await net.fetch(base + 'pair/' + pr.id)).json(); log('pair-status ' + JSON.stringify({ status: ok.status, key: !!ok.key }));
      const wsUrl = base.replace(/^http/, 'ws') + `ws?dev=${encodeURIComponent(ok.id)}&key=${encodeURIComponent(ok.key)}`;
      const ws = new WebSocket(wsUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('ws error')); setTimeout(() => rej(new Error('ws timeout')), 5000); });
      log('ws open');
      ws.onmessage = e => log('ws <- ' + String(e.data).slice(0, 90));
      const p0 = screen.getCursorScreenPoint();
      ws.send(JSON.stringify({ t: 'm', x: 40, y: 0 })); await wait(6000); // pierwszy ruch uruchamia pomocnika (kompilacja)
      ws.send(JSON.stringify({ t: 'm', x: 40, y: 0 })); await wait(800);
      const p1 = screen.getCursorScreenPoint(); log(`kursor ${p0.x},${p0.y} -> ${p1.x},${p1.y}`);
      ws.send(JSON.stringify({ t: 'm', x: -80, y: 0 })); await wait(500);
      ws.close();
    } catch (e) { log('BŁĄD ' + e.message); }
    deck.stop(); await wait(500); app.exit(0); return;
  }
  if (process.env.WYSPA_DECKTEST) { // pilot: start, strona dla telefonu, statystyki, stop
    await wait(4000);
    const out = {};
    try { const s = await deck.start(); out.running = s.running; out.url = (s.url || '').replace(/\/[^/]*$/, '/…'); const r = await net.fetch(s.url); out.page = r.status; out.html = (await r.text()).includes('Aura Deck'); } catch (e) { out.error = e.message; }
    try { out.stats = await deck.opts?.getStats?.() ?? 'brak'; } catch (e) { out.statsError = e.message; }
    fs.writeFileSync(path.join(dir, 'decktest.txt'), JSON.stringify(out));
    deck.stop(); await wait(500); app.quit(); return;
  }
  if (process.env.WYSPA_CLICKTEST) { // co dostaje kliknięcie w przycisk okienka zatwierdzania telefonu
    await wait(5000);
    send('deck-pair', { id: 'test', name: 'Telefon testowy', ip: '192.168.0.10', code: '1234' }); await wait(900);
    const r = await island.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('#bAct button')].find(x => x.textContent === 'Zatwierdź'); const q = b.getBoundingClientRect(); const z = parseFloat(getComputedStyle(document.querySelector('#banner')).zoom) || 1; const el = document.elementFromPoint((q.left + q.width / 2) * z, (q.top + q.height / 2) * z); return { trafia: el === b ? 'Zatwierdź (OK)' : (el.id || el.className || el.tagName) + ' / ' + (el.closest('button') ? el.closest('button').id || el.closest('button').textContent : '') }; })()`);
    fs.writeFileSync(path.join(dir, 'clicktest.txt'), JSON.stringify(r));
    app.quit(); return;
  }
  if (process.env.WYSPA_WPTEST) { // test tapety: start, stan, zrzut pulpitu, stop (zwykła tapeta wraca)
    const log = s => fs.appendFileSync(path.join(dir, 'wallpaper.txt'), s + '\n');
    wp.on('state', s => log('state ' + JSON.stringify(s)));
    await wait(3000);
    try { await wp.start(process.env.WYSPA_WPTEST, wpFilters()); } catch (e) { log('start error ' + e.message); }
    await wait(5000);
    try { const src = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } }); fs.writeFileSync(path.join(dir, 'pulpit.png'), src[0].thumbnail.toPNG()); } catch (e) { log('shot error ' + e.message); }
    try { await wp.stop(); } catch (e) { log('stop error ' + e.message); }
    await wait(1500); app.quit(); return;
  }
  const shot = async name => fs.writeFileSync(path.join(dir, name + '.png'), (await island.webContents.capturePage()).toPNG());
  const js = code => island.webContents.executeJavaScript(code);
  island.webContents.on('console-message', (e) => { const m = e.message || ''; if (/error|warn/i.test(e.level || '') || /Error/.test(m)) fs.appendFileSync(path.join(dir, 'console.txt'), m + '\n'); });
  await wait(6000);
  await shot('01-pigulka');
  send('hud', { kind: 'volume', level: 0.62, mute: false }); await wait(700); await shot('02-hud-glosnosc');
  send('hud', { kind: 'keys', caps: true, num: true }); await wait(700); await shot('03-hud-caps');
  await wait(1600);
  addNotice({ kind: 'script', title: 'Build gotowy', body: '0 błędów · 12,4 s' }); await wait(800); await shot('04-baner');
  await wait(5500);
  gameOn = true; send('game', true); await wait(4500); await shot('05-pasek-gracza'); gameOn = false; send('game', false); await wait(600);
  calendar = [{ title: 'Stand-up z zespołem', start: Date.now() + 2 * 3600e3, end: Date.now() + 3 * 3600e3, allDay: false, location: '' }]; send('calendar', calendar);
  pin = true; pinEntered = false; open = true; send('open', true); await wait(900);
  for (const t of (process.env.WYSPA_TABS || 'music,notices,agents,shelf,clips,widgets,reminders,controls,launcher,call').split(',')) {
    await js(`setTab('${t}')`); await wait(t === 'widgets' ? 2600 : 700); await shot('10-' + t);
  }
  pin = false; open = false; send('open', false); await wait(900); await shot('20-po-zamknieciu');
  openSettings(); await wait(2500);
  for (const p of (process.env.WYSPA_PAGES || 'look,island,cards,keys').split(',')) {
    send('goto', p, settingsWin); await wait(500);
    fs.writeFileSync(path.join(dir, `30-ust-${p}.png`), (await settingsWin.webContents.capturePage()).toPNG());
  }
  if (!process.env.WYSPA_KEEP) app.quit();
}
app.on('second-instance', (_, argv) => { userHidden = false; applyVisibility(); if (argv.includes('--settings')) openSettings(); });
app.on('before-quit', () => { quitting = true; if (taskbar && taskbar.active) taskbar.stop(); clearInterval(cursorLoop); helper.stop(); endpoint.stop(); phone.stop(); try { cal.stop(); obs.stop(); chat.stop(); deck.stop(); wp.stop(); updates.stop(); } catch {} });
app.on('will-quit', () => { if (app.isReady()) globalShortcut.unregisterAll(); }); // druga kopia kończy się przed „ready”
app.on('window-all-closed', () => { if (quitting) app.quit(); });
