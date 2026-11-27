// Aktualizacje Aury z wydań na GitHubie.
//  - Windows z instalatorem: electron-updater pobiera nową wersję w tle (sprawdza sumę SHA-512),
//    a Aura pokazuje „Aktualizacja gotowa” → „Uruchom ponownie” instaluje ją od razu (inaczej przy zamknięciu).
//  - macOS (Aura w Aplikacjach): własna aktualizacja — wbudowana w Electron wymaga płatnego podpisu Apple.
//    Pobieramy Aura-X-mac-<arch>.zip z wydania, sprawdzamy rozmiar i SHA-256 (podane przez GitHub), rozpakowujemy,
//    sprawdzamy wersję w środku; „Uruchom ponownie” zamyka Aurę, podmienia Aura.app i uruchamia nową.
//  - Wersja przenośna (ZIP) i Mac uruchomiony z .dmg: tylko powiadomienie z linkiem do strony pobierania.
const { app, net, shell } = require('electron');
const { L } = require('./lang');
const { EventEmitter } = require('events');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 20 }, (e, out) => e ? rej(e) : res(String(out))));

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
    // macOS: Aura.app, którą da się podmienić (nie z obrazu .dmg, folder z prawem zapisu)
    this.macBundle = process.platform === 'darwin' && app.isPackaged ? path.resolve(app.getPath('exe'), '..', '..', '..') : null;
    this.macAuto = false;
    if (this.macBundle && /\.app$/.test(this.macBundle) && !this.macBundle.startsWith('/Volumes/')) {
      try { fs.accessSync(path.dirname(this.macBundle), fs.constants.W_OK); fs.accessSync(this.macBundle, fs.constants.W_OK); this.macAuto = true; } catch {}
    }
    this.state = { current: app.getVersion(), latest: null, status: 'idle', mode: this.auto || this.macAuto ? 'auto' : 'notify' };
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
      const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Aura' };
      if (process.env.WYSPA_GH_TOKEN) headers.Authorization = 'Bearer ' + process.env.WYSPA_GH_TOKEN; // tylko testy w chmurze (limit zapytań)
      const r = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers });
      if (!r.ok) throw new Error('GitHub: HTTP ' + r.status); // np. limit zapytań — to błąd, a nie „brak nowej wersji”
      const j = await r.json();
      if (!j || !j.tag_name) throw new Error(L('GitHub: brak wersji w odpowiedzi', 'GitHub: no version in the response'));
      const latest = String(j.tag_name || '').replace(/^v/, '');
      const current = process.env.WYSPA_UPDATETEST ? '0.0.1' : app.getVersion();
      if (latest && newer(latest, current) && this.macAuto) {
        this.set({ url: j.html_url || RELEASES });
        if (this.state.status === 'ready' && this.state.latest === latest) return this.state;
        try { await this.macDownload(j, latest); this.macFails = 0; return this.state; }
        catch (e) {
          // Pliki na Maca trafiają do wydania kilka minut po plikach na Windowsa (budowanie w chmurze). Zamiast od razu
          // odsyłać na GitHuba: cicho spróbuj znowu za 5 min (do godziny); dopiero potem okienko z „Pobierz”.
          this.macFails = (this.macFails || 0) + 1;
          if (this.macFails <= 12) {
            this.set({ status: 'waiting', latest, error: String(e && e.message || e).slice(0, 200) });
            clearTimeout(this.retryT); this.retryT = setTimeout(() => this.check(), 5 * 60e3);
            return this.state;
          }
          this.set({ status: 'available', latest, error: String(e && e.message || e).slice(0, 200) });
          if (manual || this.ignored !== latest) this.emit('available', latest);
          return this.state;
        }
      }
      if (latest && newer(latest, current)) {
        this.set({ status: 'available', latest, url: j.html_url || RELEASES });
        if (manual || this.ignored !== latest) this.emit('available', latest);
      } else this.set({ status: 'current', latest });
    } catch (e) { this.set({ status: 'error', error: e.message }); }
    return this.state;
  }
  // macOS: pobranie i rozpakowanie nowej wersji (w tle), potem status „ready” jak na Windowsie
  async macDownload(j, latest) {
    if (this.busy) return; this.busy = true;
    try {
      const name = `Aura-${latest}-mac-${process.arch}.zip`;
      const asset = (j.assets || []).find(a => a && a.name === name);
      if (!asset || !/^https:\/\/github\.com\//.test(asset.browser_download_url || '')) throw new Error('brak pliku ' + name + ' w wydaniu');
      const dir = path.join(app.getPath('temp'), 'Aura-aktualizacja');
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const zip = path.join(dir, name);
      this.set({ status: 'downloading', latest, percent: 0 });
      const r = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'Aura' } });
      if (!r.ok || !r.body) throw new Error('pobieranie: HTTP ' + r.status);
      const total = Number(asset.size) || Number(r.headers.get('content-length')) || 0;
      const hash = crypto.createHash('sha256'), file = fs.createWriteStream(zip);
      const reader = r.body.getReader(); let got = 0, lastPct = -1;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        const buf = Buffer.from(value); hash.update(buf); got += buf.length;
        if (!file.write(buf)) await new Promise(res => file.once('drain', res));
        const pct = total ? Math.floor(100 * got / total) : 0; if (pct !== lastPct) { lastPct = pct; this.set({ status: 'downloading', percent: pct }); }
      }
      await new Promise((res, rej) => file.end(e => e ? rej(e) : res()));
      if (asset.size && got !== Number(asset.size)) throw new Error(L('niepełne pobranie', 'incomplete download'));
      const digest = String(asset.digest || ''); // GitHub podaje „sha256:…” dla plików w wydaniach
      if (/^sha256:[0-9a-f]{64}$/i.test(digest) && digest.slice(7).toLowerCase() !== hash.digest('hex')) throw new Error(L('suma kontrolna się nie zgadza', 'checksum doesn’t match'));
      const out = path.join(dir, 'nowa');
      await run('/usr/bin/ditto', ['-x', '-k', zip, out]);
      const appPath = path.join(out, 'Aura.app');
      const ver = (await run('/usr/bin/defaults', ['read', path.join(appPath, 'Contents', 'Info'), 'CFBundleShortVersionString'])).trim();
      if (ver !== latest) throw new Error(L(`w paczce jest wersja ${ver}, a nie ${latest}`, `the package contains version ${ver}, not ${latest}`));
      fs.rmSync(zip, { force: true });
      this.macNew = appPath;
      this.set({ status: 'ready', latest, percent: 100 });
      if (this.installWhenReady) { this.installWhenReady = false; this.install(); return; } // kliknięte „Zaktualizuj”: od razu
      this.emit('ready', latest);
    } finally { this.busy = false; }
  }
  install() {
    if (this.auto && this.state.status === 'ready') { setImmediate(() => this.updater.quitAndInstall(true, true)); return; }
    if (this.macAuto && this.state.status === 'ready' && this.macNew && fs.existsSync(this.macNew)) {
      // po zamknięciu Aury: stara wersja na bok, nowa na jej miejsce (przy błędzie stara wraca), uruchom
      const script = [
        'P="$1"; SRC="$2"; DST="$3"',
        'while kill -0 "$P" 2>/dev/null; do sleep 0.3; done',
        'rm -rf "$DST.stara"',
        'if mv "$DST" "$DST.stara" && /usr/bin/ditto "$SRC" "$DST"; then rm -rf "$DST.stara"; else rm -rf "$DST"; mv "$DST.stara" "$DST"; fi',
        '/usr/bin/xattr -dr com.apple.quarantine "$DST" 2>/dev/null',
        // uruchom nową wersję; gdyby „open” nic nie dało, wprost z pliku programu
        '/usr/bin/open "$DST" || nohup "$DST/Contents/MacOS/Aura" >/dev/null 2>&1 &',
        'sleep 6; pgrep -f "$DST/Contents/MacOS/Aura" >/dev/null || nohup "$DST/Contents/MacOS/Aura" >/dev/null 2>&1 &',
      ].join('\n');
      const log = fs.openSync(path.join(app.getPath('temp'), 'Aura-aktualizacja.log'), 'w'); // dziennik podmiany (do diagnozy)
      spawn('/bin/sh', ['-c', script, 'aura-aktualizacja', String(process.pid), this.macNew, this.macBundle], { detached: true, stdio: ['ignore', log, log] }).unref();
      setImmediate(() => app.quit());
    }
  }
  later() { if (this.state.latest) this.ignored = this.state.latest; }
  // „Zaktualizuj” w okienku: tam, gdzie Aura umie się zaktualizować sama — pobierz i zainstaluj bez GitHuba
  async updateNow() {
    if ((this.auto || this.macAuto) && this.state.status === 'ready') return this.install();
    if (this.macAuto) { this.installWhenReady = true; this.macFails = 0; await this.check(true); if (this.state.status !== 'ready' && this.state.status !== 'downloading') { this.installWhenReady = false; this.openPage(); } return; }
    if (this.auto) { try { await this.updater.checkForUpdates(); } catch {} return; } // electron-updater pobiera i pokaże „gotowa”
    this.openPage(); // wersja przenośna: nowa paczka tylko ze strony wydań
  }
  openPage() { const u = this.state.url; shell.openExternal(u && /^https:\/\/github\.com\//.test(u) ? u : RELEASES); }
}

module.exports = { Updates, newer };
