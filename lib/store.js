// Ustawienia i dane Aury (JSON w %APPDATA%\Aura). Historia schowka jest szyfrowana
// kluczem konta Windows (safeStorage = DPAPI).
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  // ogólne
  autostart: true,
  slimCovered: true,         // wąska linia, gdy okno zasłania górę ekranu (otwiera się po najechaniu)
  openOn: 'last',            // last | music
  lastPanel: 'music',
  // ułatwienia dostępu
  reduceMotion: 'system',    // system | on | off
  longerNotices: false,
  // wygląd
  shape: 'notch',            // notch (przyklejony, z „uszami”) | island (unosi się pod krawędzią)
  topGap: 8,                 // odstęp od góry dla kształtu island (px)
  idleShows: 'none',         // none | clock | date | weather | pet
  idlePet: 'cat',            // cat | fox
  size: 100,                 // skala zwiniętej wyspy (%)
  openSize: 100,             // skala otwartej wyspy (%)
  visualizer: 'pixels',      // pixels | bars
  font: 'manrope',           // manrope | inter | system
  roundness: 100,            // zaokrąglenie narożników (%)
  // na Macu domyślnie czysta czerń — zlewa się z fabrycznym notchem; szkło wymaga zgody na nagrywanie ekranu
  surface: process.platform === 'darwin' ? 'pure' : 'glass', // black | pure | graphite | white | glass | tatry | noc | bursztyn
  glassBlur: 50,             // 0-100
  accent: 'lilac',
  musicBackground: 'album',  // album | solid
  progressBar: 'wave',       // wave | pixels | comet | line
  // wyspa
  position: 'center',        // left | center | right
  edgeMargin: 24,
  hiddenUntilHover: false,
  hoverDelay: 150,
  reverseScroll: false,
  animationSpeed: 'normal',  // calm | normal | fast
  hudVolume: true, hudBrightness: true, hudBattery: true, hudLockKeys: true, hudDevice: true, hudMic: true,
  privacyDot: true, privacyIgnore: [],
  lyrics: false,
  titleInPill: false,
  hideFromCaptures: false,
  hideInFullscreen: true,
  // karty
  noticeSeconds: 5, noticeClockTime: false,
  tabNotices: true, tabAgents: true, tabShelf: true, tabClips: true, tabWidgets: true,
  tabControls: true, tabLauncher: true, tabCall: true,
  capturesToShelf: true, phoneShare: true,
  clipboardEnabled: true, clipboardLayout: 'cards', clipboardSize: 30, clipboardKeepHours: 0,
  recordMic: false, recordPcSound: true,
  launchApps: ['', '', '', '', '', ''],
  // widżety
  weatherCity: '', weatherLat: null, weatherLon: null, weatherName: '', fahrenheit: false, weatherLook: 'minimal',
  timeFormat: 'system',      // system | 12 | 24
  focusMinutes: 25, breakMinutes: 5,
  reminderSound: 'repeat',   // repeat | once | off
  netUnit: 'MBs',            // MBs | Mbps
  calendarIcs: '', meetingNotice: true,
  // web
  tabWeb: true,
  webPins: [
    { name: 'YouTube Music', url: 'https://music.youtube.com/' },
    { name: 'YouTube', url: 'https://www.youtube.com/' },
    { name: 'Spotify', url: 'https://open.spotify.com/' },
  ],
  // gry
  gamerOverlay: false,
  // streaming (OBS + czat)
  obsEnabled: false, obsAuto: true, obsPort: 4455, obsPassword: '',
  chatTwitch: '', chatBackground: '#0B0B0C', chatOpacity: 92, chatTextColor: '#F5F5F7', chatTextSize: 14, chatBounds: null,
  // animowana tapeta
  liveWallpaper: false, liveWallpaperFile: '', wpHue: 0, wpSaturation: 100, wpBrightness: 0, wpContrast: 100,
  // PC Deck
  tabDeck: true,
  // rozmowy
  callTimer: true,
  // agenci i skrypty
  agentsEnabled: true, agentsNotifyDone: true, notifyEndpoint: true, notifyPort: 47900,
  // skróty (puste = wyłączony). Bez liter z AltGr (ą ć ę ł ń ó ś ź ż), żeby nie psuć pisania.
  hotkeys: {
    open: 'Control+Alt+I',
    hide: 'Control+Alt+H',
    playPause: 'Control+Alt+P',
    next: '',
    prev: '',
    focus: 'Control+Alt+T',
    micMute: 'Control+Alt+M',
    colorPick: 'Control+Alt+K',
    screenshot: 'Control+Alt+F',
    snip: '',
    record: 'Control+Alt+R',
    chat: '',
    obsRecord: '',
    obsStream: '',
  },
};

const DATA_DEFAULTS = { files: [], reminders: [], notes: '', todos: [], notices: [] };

const dir = () => app.getPath('userData');
const file = n => path.join(dir(), n);

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}
function writeJsonSoon(name, getter, timers) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    try { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(file(name), JSON.stringify(getter(), null, 1)); } catch {}
  }, 300);
}

class Store {
  constructor() {
    this.timers = {};
    const s = readJson('ustawienia.json', {});
    this.settings = { ...DEFAULTS, ...s, hotkeys: { ...DEFAULTS.hotkeys, ...(s.hotkeys || {}) } };
    // migracja z wersji 1 (dane.json)
    const old = readJson('dane.json', null);
    this.data = { ...DATA_DEFAULTS, ...readJson('dane2.json', {}) };
    if (old && !fs.existsSync(file('dane2.json'))) {
      this.data.files = old.files || [];
      if (typeof old.autostart === 'boolean') this.settings.autostart = old.autostart;
    }
    this.clips = this.loadClips(old);
  }
  loadClips(old) {
    try {
      const buf = fs.readFileSync(file('schowek.bin'));
      const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
      return JSON.parse(json);
    } catch {}
    return (old && Array.isArray(old.clips)) ? old.clips.filter(c => c.type === 'text') : [];
  }
  saveSettings() { writeJsonSoon('ustawienia.json', () => this.settings, this.timers); }
  saveData() { writeJsonSoon('dane2.json', () => this.data, this.timers); }
  saveClips() {
    clearTimeout(this.timers.clips);
    this.timers.clips = setTimeout(() => {
      const keep = this.clips.filter(c => c.type === 'text');
      const json = JSON.stringify(keep);
      try {
        const out = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json);
        fs.writeFileSync(file('schowek.bin'), out);
      } catch {}
    }, 400);
  }
  set(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULTS)) continue;
      this.settings[k] = k === 'hotkeys' ? { ...this.settings.hotkeys, ...v } : v;
    }
    this.saveSettings();
  }
}

module.exports = { Store, DEFAULTS };
