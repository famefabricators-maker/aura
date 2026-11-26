// Animowana tapeta: film z dysku odtwarzany za ikonami pulpitu (ekran główny), bez dźwięku, dekodowany przez GPU.
// Okno Electrona trafia pod ikony przez native/WallpaperNative.cs (WorkerW / Progman 24H2), a po stop() pulpit
// jest przerysowywany, więc wraca zwykła tapeta Windows (jej ustawienia nie są zmieniane).
//
// Użycie (proces główny):
//   const { Wallpaper } = require('./lib/wallpaper');
//   const wp = new Wallpaper();
//   wp.on('state', s => both('wallpaper', s));   // { running, paused, file, error, mode }
//   await wp.start(S().liveWallpaperFile, { hue, saturation, brightness, contrast });  // '' / brak pliku = stop
//   wp.setFilters({ hue: 0..360 (°), saturation: 0..200 (%), brightness: -100..100, contrast: 0..200 (%) });
//   wp.pause(); wp.resume();    // np. gdy gra/okno na pełnym ekranie zasłania pulpit (helper 'fs'); po minucie pauzy film jest zwalniany z pamięci
//   await wp.stop();            // też w 'before-quit'
const path = require('path');
const { L } = require('./lang');
const fs = require('fs');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const { EventEmitter } = require('events');

const VIDEO = /\.(mp4|m4v|mov|mkv|webm|wmv|avi)$/i;
const PS1 = path.join(__dirname, '..', 'native', 'wallpaper.ps1');
const DEFAULT_FILTERS = { hue: 0, saturation: 100, brightness: 0, contrast: 100 };

function native(action, args = {}) {
  const a = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Action', action];
  for (const [k, v] of Object.entries(args)) a.push('-' + k, String(v));
  return new Promise(resolve => execFile('powershell.exe', a, { windowsHide: true, timeout: 20000 }, (err, out) => {
    const line = String(out || '').trim().split(/\r?\n/).pop() || '';
    resolve(err && !line ? 'error: ' + err.message : line);
  }));
}
function cleanFilters(f = {}) {
  const n = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  return { hue: n(f.hue, 0, -360, 360), saturation: n(f.saturation, 100, 0, 300), brightness: n(f.brightness, 0, -100, 100), contrast: n(f.contrast, 100, 0, 300) };
}

class Wallpaper extends EventEmitter {
  constructor() {
    super();
    this.win = null; this.file = ''; this.filters = { ...DEFAULT_FILTERS };
    this.paused = false; this.unloadTimer = null; this.stopping = false; this.restartTimer = null;
    this.s = { running: false, paused: false, file: '', error: '', mode: '' };
    this.onDisplay = () => this.reattach();
  }
  get state() { return { ...this.s }; }
  set(patch) { Object.assign(this.s, patch); this.emit('state', this.state); }

  async start(file, filters) {
    file = String(file || '').trim();
    if (filters) this.filters = cleanFilters(filters);
    if (!file) return this.stop();
    if (!VIDEO.test(file) || !fs.existsSync(file)) { await this.stop(); return this.set({ error: L('Nie znaleziono filmu. Wybierz plik MP4, MOV, MKV, WebM, WMV albo AVI.', 'Video not found. Choose an MP4, MOV, MKV, WebM, WMV or AVI file.') }); }
    if (this.win && !this.win.isDestroyed() && file === this.file) { this.setFilters(this.filters); return; }
    await this.stop(true);
    this.file = file; this.stopping = false;
    const { BrowserWindow, screen } = require('electron');
    const d = screen.getPrimaryDisplay();
    const win = new BrowserWindow({
      ...d.bounds, frame: false, show: false, opacity: 0, skipTaskbar: true, focusable: false, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false, backgroundColor: '#000000', title: 'Aura – tapeta',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required', spellcheck: false },
    });
    this.win = win;
    win.setMenu(null);
    win.webContents.setAudioMuted(true);
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => {
      if (this.win !== win) return;
      this.win = null;
      // okno zniknęło samo (np. restart Eksploratora) -> spróbuj ponownie za chwilę
      if (!this.stopping && this.file) { this.set({ running: false }); clearTimeout(this.restartTimer); this.restartTimer = setTimeout(() => this.start(this.file), 4000); }
    });
    const q = { src: pathToFileURL(file).href, ...this.filters, lang: require('./lang').LANG };
    await win.loadFile(path.join(__dirname, '..', 'wallpaper', 'index.html'), { query: Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])) });
    if (this.win !== win) return;
    win.showInactive();
    const r = await this.attach(win, d);
    if (this.win !== win) return;
    if (!r.startsWith('ok')) { this.stopping = true; win.destroy(); this.win = null; await native('refresh'); return this.set({ running: false, error: L('Nie udało się umieścić filmu pod ikonami pulpitu.', 'Couldn’t place the video under the desktop icons.'), mode: r }); }
    win.setOpacity(1);
    if (this.paused) this.js('pauseVideo()');
    const scr = require('electron').screen;
    scr.removeListener('display-metrics-changed', this.onDisplay); scr.on('display-metrics-changed', this.onDisplay);
    this.set({ running: true, file, error: '', mode: r.replace(/^ok:\s*/, ''), paused: this.paused });
  }
  async attach(win, d) {
    const { screen } = require('electron');
    const px = screen.dipToScreenRect(null, d.bounds); // piksele fizyczne
    const hb = win.getNativeWindowHandle();
    const hwnd = hb.length >= 8 ? hb.readBigUInt64LE(0) : BigInt(hb.readUInt32LE(0));
    return native('attach', { Hwnd: hwnd.toString(), X: px.x, Y: px.y, W: px.width, H: px.height });
  }
  async reattach() {
    if (!this.win || this.win.isDestroyed()) return;
    const { screen } = require('electron');
    await this.attach(this.win, screen.getPrimaryDisplay());
  }
  js(code) { try { if (this.win && !this.win.isDestroyed()) this.win.webContents.executeJavaScript(code, true).catch(() => {}); } catch {} }
  setFilters(f) {
    this.filters = cleanFilters({ ...this.filters, ...(f || {}) });
    this.js(`setFilters(${JSON.stringify(this.filters)})`);
  }
  pause() {
    if (this.paused) return;
    this.paused = true; this.js('pauseVideo()');
    clearTimeout(this.unloadTimer);
    this.unloadTimer = setTimeout(() => this.js('unloadVideo()'), 60e3); // nikt nie patrzy od minuty -> zwolnij pamięć
    if (this.s.running) this.set({ paused: true });
  }
  resume() {
    if (!this.paused) return;
    this.paused = false; clearTimeout(this.unloadTimer); this.js('resumeVideo()');
    if (this.s.running) this.set({ paused: false });
  }
  async stop(keepState) {
    clearTimeout(this.unloadTimer); clearTimeout(this.restartTimer);
    this.stopping = true;
    const win = this.win; this.win = null;
    try { require('electron').screen.removeListener('display-metrics-changed', this.onDisplay); } catch {}
    if (win && !win.isDestroyed()) { win.destroy(); await native('refresh'); }
    if (!keepState) { this.file = ''; this.set({ running: false, paused: false, file: '', error: '', mode: '' }); }
  }
}

module.exports = { Wallpaper, cleanFilters, nativeWallpaper: native };
