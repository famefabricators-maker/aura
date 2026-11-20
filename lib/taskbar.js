// Pasek zadań Aury (Windows): wyspa u dołu ekranu zamiast paska Windows.
// Start, przypięte i otwarte aplikacje, grający utwór, minutnik Skupienia, szybkie ustawienia i zegar.
// Pasek Windows chowa pomocnik native/taskbar.ps1 i przywraca go przy wyłączeniu. Na wypadek awarii Aury działa
// odłączony stróż: czeka, aż proces Aury zniknie, i jeśli został znacznik „pasek schowany”, przywraca pasek.
const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

const H = 210;                       // wysokość okna (miejsce na powiększone ikony); klikalny jest tylko sam pasek
const PINNED_DIR = () => path.join(process.env.APPDATA || '', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar');
const norm = p => String(p || '').toLowerCase();
const MARKER = () => path.join(app.getPath('userData'), 'pasek-windows-schowany.txt');
const NATIVE = path.join(__dirname, '..', 'native', 'TaskbarNative.cs');
const readMarker = () => { try { const n = parseInt(fs.readFileSync(MARKER(), 'utf8'), 10); return Number.isFinite(n) ? n : null; } catch { return null; } };
const restoreCmd = orig => `$c=[IO.File]::ReadAllText('${NATIVE.replace(/'/g, "''")}'); Add-Type -TypeDefinition $c; [AuraTaskbar]::Restore(${orig})`; // orig: liczba albo zmienna PowerShella ($s)

class Taskbar extends EventEmitter {
  // opts: S() -> ustawienia, set(patch), preload
  constructor(opts) {
    super();
    this.o = opts; this.win = null; this.proc = null; this.windows = []; this.icons = new Map(); this.targets = new Map();
    this.media = null; this.focus = null; this.covered = false; this.reveal = false; this.fullscreen = false; this.hover = false;
    ipcMain.on('dock-hover', (_, on) => { this.hover = !!on; if (this.win && !this.win.isDestroyed()) this.win.setIgnoreMouseEvents(!on, { forward: true }); this.push(); });
    ipcMain.on('dock-click', (_, id) => this.click(id));
    ipcMain.on('dock-menu', (_, id) => this.menu(id));
    ipcMain.on('dock-key', (_, k) => { if (['start', 'quick', 'notif'].includes(k)) this.cmd({ c: 'keys', k }); });
    ipcMain.handle('dock-state', () => this.state());
  }
  get active() { return !!this.win; }
  // ile miejsca nad dolną krawędzią zajmuje pasek (wyspa ustawiona „na dole” staje nad nim)
  get reserve() { return this.active ? Math.round(this.size() * 30 + 26) : 0; }
  size() { return Math.max(1, Math.min(2, (Number(this.o.S().dockSize) || 140) / 100)); }

  // ---------- start / stop ----------
  start() {
    if (process.platform !== 'win32' || this.win) return;
    this.spawn();
    const d = screen.getPrimaryDisplay().bounds;
    this.win = new BrowserWindow({
      x: d.x, y: d.y + d.height - H, width: d.width, height: H, frame: false, transparent: true, resizable: false, movable: false,
      skipTaskbar: true, focusable: false, hasShadow: false, show: false, alwaysOnTop: true,
      webPreferences: { preload: this.o.preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    this.win.setAlwaysOnTop(true, 'pop-up-menu');
    this.win.setIgnoreMouseEvents(true, { forward: true });
    this.win.loadFile(path.join(__dirname, '..', 'dock', 'index.html'));
    this.win.once('ready-to-show', () => { this.win && this.win.showInactive(); this.push(); });
    this.win.on('closed', () => { this.win = null; });
    this.place = () => { if (!this.win) return; const b = screen.getPrimaryDisplay().bounds; this.win.setBounds({ x: b.x, y: b.y + b.height - H, width: b.width, height: H }); };
    screen.on('display-metrics-changed', this.place);
    this.poll = setInterval(() => this.tick(), 120);
    this.importPins();
    this.emit('change');
  }
  stop() {
    clearInterval(this.poll);
    if (this.place) screen.removeListener('display-metrics-changed', this.place);
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    if (this.proc) { try { this.proc.stdin.write('{"c":"quit"}\n'); this.proc.stdin.end(); } catch {} this.proc = null; }
    this.emit('change');
  }
  spawn() {
    const orig = readMarker(); // po awarii: stan sprzed schowania, a nie obecny (już schowany)
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'native', 'taskbar.ps1'),
      '-Orig', String(orig == null ? -1 : orig), '-Marker', MARKER()], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    this.proc = proc;
    if (!this.watchdog) {
      // stróż: odłączony (przeżyje awarię Aury), bez wejścia i wyjścia — czeka na koniec procesu Aury i jeśli
      // został znacznik „pasek schowany”, przywraca pasek Windows
      // (wscript, bo odłączony PowerShell bez konsoli w ogóle nie startuje)
      this.watchdog = spawn('wscript.exe', ['//B', '//Nologo', path.join(__dirname, '..', 'native', 'taskbar-watchdog.js'), String(process.pid), MARKER(), NATIVE],
        { windowsHide: true, detached: true, stdio: 'ignore' });
      this.watchdog.on('error', () => {});
      this.watchdog.unref();
    }
    let buf = '';
    proc.stdout.on('data', d => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this.onLine(line); }
    });
    proc.on('exit', () => { if (this.proc === proc) { this.proc = null; if (this.win) setTimeout(() => this.win && !this.proc && this.spawn(), 1500); } });
    this.cmd({ c: 'pid', pid: process.pid });
  }
  cmd(o) { try { this.proc && this.proc.stdin.write(JSON.stringify(o) + '\n'); } catch {} }
  onLine(line) {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (m.t === 'windows') {
      this.windows = String(m.list || '').split('\n').filter(Boolean).map(l => {
        const [h, pid, min, fg, max, exe, ...t] = l.split('\t');
        return { h: Number(h), pid: Number(pid), min: min === '1', fg: fg === '1', max: max === '1', exe, title: t.join('\t') };
      });
      this.covered = this.windows.some(w => w.fg && w.max && !w.min);
      this.push();
    }
  }

  // ---------- przypięte aplikacje ----------
  // przy pierwszym włączeniu bierzemy przypięte z paska Windows
  importPins() {
    if (Array.isArray(this.o.S().dockPins)) return;
    let pins = [];
    try { pins = fs.readdirSync(PINNED_DIR()).filter(f => /\.lnk$/i.test(f)).map(f => path.join(PINNED_DIR(), f)); } catch {}
    this.o.set({ dockPins: pins.slice(0, 20) });
  }
  // nazwa programu (np. discord.exe), po której przypięty skrót łączy się z otwartymi oknami
  target(p) {
    if (!this.targets.has(p)) {
      let t = p;
      if (/\.lnk$/i.test(p)) {
        try {
          const l = shell.readShortcutLink(p); t = l.target || '';
          const m = /--processStart\s+"?([^"\s]+)/i.exec(l.args || ''); if (m) t = m[1];  // Discord, Slack… (Update.exe)
          if (/chrome_proxy\.exe$/i.test(t) || /--app-id/i.test(l.args || '')) t = '';     // aplikacje z przeglądarki
        } catch { t = ''; }
      }
      this.targets.set(p, t ? path.basename(norm(t)) : '');
    }
    return this.targets.get(p);
  }
  // ikona skrótu .lnk: z pliku ikony skrótu albo z programu, na który wskazuje (a nie ikona samego pliku .lnk)
  iconFile(p) {
    if (!/\.lnk$/i.test(p)) return p;
    try {
      const l = shell.readShortcutLink(p);
      const ex = s => String(s || '').replace(/%([^%]+)%/g, (m, v) => process.env[v] || process.env[v.toUpperCase()] || m); // %LOCALAPPDATA% itp.
      const icon = ex(l.icon), target = ex(l.target);
      if (icon && /\.(exe|ico)$/i.test(icon) && fs.existsSync(icon)) return icon;
      if (target && fs.existsSync(target)) return target;
    } catch {}
    if (/explorer|eksplorator/i.test(path.basename(p))) return path.join(process.env.WINDIR || 'C:\\Windows', 'explorer.exe');
    return p;
  }
  icon(key, file) {
    if (this.icons.has(key)) return this.icons.get(key);
    this.icons.set(key, null);
    if (/\.ico$/i.test(file)) { // plik .ico: sam obraz (system dałby ikonę „pliku ICO”)
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) { this.icons.set(key, img.resize({ width: 64, height: 64, quality: 'best' }).toDataURL()); return this.icons.get(key); }
    }
    app.getFileIcon(file, { size: 'large' }).then(img => { if (!img.isEmpty()) { this.icons.set(key, img.toDataURL()); this.push(); } }).catch(() => {});
    return null;
  }
  items() {
    const pins = (this.o.S().dockPins || []).filter(p => fs.existsSync(p));
    const out = [], byExe = new Map();
    for (const p of pins) {
      const exe = this.target(p);
      const it = { id: 'p:' + p, name: path.basename(p).replace(/\.(lnk|exe|url)$/i, ''), launch: p, exe, pinned: true, wins: [], icon: this.icon('p:' + p, this.iconFile(p)) };
      out.push(it); if (exe) byExe.set(exe, it);
    }
    for (const w of this.windows) {
      const exe = path.basename(norm(w.exe));
      let it = byExe.get(exe);
      if (!it || /applicationframehost\.exe$/.test(exe)) { // aplikacje ze Sklepu: każde okno osobno
        it = { id: 'w:' + (exe || w.h), name: w.title, launch: w.exe, exe, pinned: false, wins: [], icon: w.exe ? this.icon('e:' + exe, w.exe) : null };
        if (/applicationframehost\.exe$/.test(exe)) it.id = 'w:' + w.h; else byExe.set(exe, it);
        out.push(it);
      }
      it.wins.push(w);
    }
    return out.map(it => ({ id: it.id, name: it.wins[0] ? it.wins[0].title : it.name, icon: it.icon, pinned: it.pinned, open: it.wins.length, active: it.wins.some(w => w.fg) }));
  }
  find(id) {
    const pins = this.o.S().dockPins || [];
    const base = w => path.basename(norm(w.exe));
    if (id.startsWith('p:')) { const p = id.slice(2); const exe = this.target(p); return { pin: p, launch: p, exe, wins: exe ? this.windows.filter(w => base(w) === exe) : [] }; }
    const key = id.slice(2);
    const wins = /^\d+$/.test(key) ? this.windows.filter(w => String(w.h) === key) : this.windows.filter(w => base(w) === key);
    const exe = wins[0] ? wins[0].exe : '';
    const name = path.basename(norm(exe));
    return { pin: pins.find(p => this.target(p) && this.target(p) === name) || null, launch: exe, exe: name, wins };
  }
  click(id) {
    const f = this.find(String(id || ''));
    if (!f.wins.length) { if (f.launch) shell.openPath(f.launch); return; }
    if (f.wins.length === 1) return this.cmd({ c: 'act', h: f.wins[0].h });
    // kilka okien jednej aplikacji: kolejno na wierzch (aktywne -> następne)
    const i = f.wins.findIndex(w => w.fg);
    this.cmd({ c: 'focus', h: f.wins[(i + 1) % f.wins.length].h });
  }
  menu(id) {
    const f = this.find(String(id || ''));
    const pins = [...(this.o.S().dockPins || [])];
    const tpl = [];
    if (f.wins.length) for (const w of f.wins.slice(0, 8)) tpl.push({ label: (w.title || '').slice(0, 60), click: () => this.cmd({ c: 'focus', h: w.h }) });
    if (tpl.length) tpl.push({ type: 'separator' });
    if (f.launch) tpl.push({ label: 'Nowe okno', click: () => shell.openPath(f.launch) });
    if (f.pin) tpl.push({ label: 'Odepnij od paska', click: () => this.o.set({ dockPins: pins.filter(p => p !== f.pin) }) });
    else if (f.launch && !/applicationframehost\.exe$/i.test(f.launch)) tpl.push({ label: 'Przypnij do paska', click: () => this.o.set({ dockPins: [...pins, f.launch].slice(0, 30) }) });
    if (f.wins.length) tpl.push({ type: 'separator' }, { label: f.wins.length > 1 ? 'Zamknij wszystkie okna' : 'Zamknij okno', click: () => f.wins.forEach(w => this.cmd({ c: 'close', h: w.h })) });
    if (tpl.length && this.win) Menu.buildFromTemplate(tpl).popup({ window: this.win });
  }

  // ---------- chowanie nad zmaksymalizowanymi oknami ----------
  tick() {
    if (!this.win) return;
    const hide = this.fullscreen || (this.o.S().dockHideMax !== false && this.covered);
    if (!hide) { if (this.reveal) { this.reveal = false; this.push(); } return; }
    const c = screen.getCursorScreenPoint(), b = screen.getPrimaryDisplay().bounds;
    const atEdge = c.y >= b.y + b.height - 2 && !this.fullscreen;
    const want = atEdge || (this.reveal && this.hover);
    if (want !== this.reveal) { this.reveal = want; this.push(); }
  }
  setMedia(m) { this.media = m; this.push(); }
  setFocus(f) { this.focus = f; this.push(); }
  setFullscreen(on) { this.fullscreen = !!on; this.push(); }
  state() {
    const S = this.o.S();
    const hidden = (this.fullscreen || (S.dockHideMax !== false && this.covered)) && !this.reveal;
    return { items: this.items(), media: this.media, focus: this.focus, size: this.size(), magnify: S.dockMagnify !== false, hidden, accent: S.accentColor || null, h12: S.timeFormat === '12' };
  }
  push() {
    if (!this.win || this.win.isDestroyed()) return;
    clearTimeout(this.pushT);
    this.pushT = setTimeout(() => { if (this.win && !this.win.isDestroyed()) this.win.webContents.send('dock', this.state()); }, 30);
  }
}

// Pasek Aury wyłączony, a znacznik „pasek schowany” został (np. awaria bez stróża): przywróć pasek Windows raz.
function restoreLeftover() {
  const orig = readMarker();
  if (process.platform !== 'win32' || orig == null) return;
  try { fs.unlinkSync(MARKER()); } catch {}
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', restoreCmd(String(orig | 0))], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
}

module.exports = { Taskbar, restoreLeftover };
