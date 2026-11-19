// Aktualizacje Aury z wydań na GitHubie.
//  - Windows z instalatorem: electron-updater pobiera nową wersję w tle (sprawdza sumę SHA-512),
//    a Aura pokazuje „Aktualizacja gotowa” → „Uruchom ponownie” instaluje ją od razu (inaczej przy zamknięciu).
//  - Wersja przenośna (ZIP) i macOS: tylko powiadomienie z linkiem do strony pobierania
//    (ZIP nie ma instalatora, a samoaktualizacja na Macu wymaga płatnego podpisu Apple).
const { app, net, shell } = require('electron');
const { EventEmitter } = require('events');

const OWNER = 'famefabricators-maker', REPO = 'aura';
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const EVERY = 6 * 3600e3;

const newer = (a, b) => { // czy wersja a > b (np. 2.1.0 > 2.0.2)
  const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; }
  return false;
};

class Updates extends EventEmitter {
  // portable: true dla wersji ZIP
  constructor({ portable }) {
    super();
    this.portable = !!portable;
    this.auto = process.platform === 'win32' && !this.portable && app.isPackaged;
    this.state = { current: app.getVersion(), latest: null, status: 'idle', mode: this.auto ? 'auto' : 'notify' };
    this.timer = null;
    this.ignored = null;
    if (this.auto) {
      const { autoUpdater } = require('electron-updater');
      this.updater = autoUpdater;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }));
      autoUpdater.on('update-not-available', () => this.set({ status: 'current' }));
      autoUpdater.on('update-available', i => this.set({ status: 'downloading', latest: i.version }));
      autoUpdater.on('download-progress', p => this.set({ status: 'downloading', percent: Math.round(p.percent) }));
      autoUpdater.on('update-downloaded', i => { this.set({ status: 'ready', latest: i.version }); this.emit('ready', i.version); });
      autoUpdater.on('error', e => this.set({ status: 'error', error: String(e && e.message || e).slice(0, 200) }));
    }
  }
  set(patch) { this.state = { ...this.state, ...patch }; this.emit('state', this.state); }
  start() { setTimeout(() => this.check(), 15000); this.timer = setInterval(() => this.check(), EVERY); }
  stop() { clearInterval(this.timer); }
  async check(manual = false) {
    if (!app.isPackaged && !process.env.WYSPA_UPDATETEST) { this.set({ status: 'dev' }); return this.state; }
    if (this.auto) { try { await this.updater.checkForUpdates(); } catch (e) { this.set({ status: 'error', error: e.message }); } return this.state; }
    // tryb powiadomień: pytamy API GitHuba o najnowsze wydanie
    this.set({ status: 'checking' });
    try {
      const r = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Aura' } });
      const j = await r.json();
      const latest = String(j.tag_name || '').replace(/^v/, '');
      const current = process.env.WYSPA_UPDATETEST ? '0.0.1' : app.getVersion();
      if (latest && newer(latest, current)) {
        this.set({ status: 'available', latest, url: j.html_url || RELEASES });
        if (manual || this.ignored !== latest) this.emit('available', latest);
      } else this.set({ status: 'current', latest });
    } catch (e) { this.set({ status: 'error', error: e.message }); }
    return this.state;
  }
  install() { if (this.auto && this.state.status === 'ready') { setImmediate(() => this.updater.quitAndInstall(true, true)); } }
  later() { if (this.state.latest) this.ignored = this.state.latest; }
  openPage() { shell.openExternal(this.state.url || RELEASES); }
}

module.exports = { Updates, newer };
