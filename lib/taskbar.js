// Pasek zadań Aury (Windows): wyspa u dołu ekranu zamiast paska Windows.
// Start, przypięte i otwarte aplikacje, grający utwór, minutnik Skupienia, szybkie ustawienia i zegar.
// Pasek Windows chowa pomocnik native/taskbar.ps1 i przywraca go przy wyłączeniu. Na wypadek awarii Aury działa
// odłączony stróż: czeka, aż proces Aury zniknie, i jeśli został znacznik „pasek schowany”, przywraca pasek.
const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell } = require('electron');
const { L } = require('./lang');
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
// dziennik paska (%APPDATA%\Aura\pasek-dziennik.txt, najwyżej ~200 KB): zawieszenia, odświeżenia, wolne przełączanie okien —
// żeby przy zgłoszeniu „pasek się zawiesza” było widać, co się działo
const LOG = () => path.join(app.getPath('userData'), 'pasek-dziennik.txt');
function dlog(s) {
  try {
    const f = LOG(); let size = 0; try { size = fs.statSync(f).size; } catch {}
    if (size > 200e3) fs.renameSync(f, f + '.stary');
    fs.appendFileSync(f, new Date().toISOString().replace('T', ' ').slice(0, 19) + '  ' + s + '\n');
  } catch {}
}
const restoreCmd = orig => `$c=[IO.File]::ReadAllText('${NATIVE.replace(/'/g, "''")}'); Add-Type -TypeDefinition $c; [AuraTaskbar]::Restore(${orig})`; // orig: liczba albo zmienna PowerShella ($s)

class Taskbar extends EventEmitter {
  // opts: S() -> ustawienia, set(patch), preload
  constructor(opts) {
    super();
    this.o = opts; this.win = null; this.proc = null; this.windows = []; this.icons = new Map(); this.targets = new Map();
    this.wicons = new Map(); this.clickAt = 0; this.media = null; this.focus = null; this.covered = false; this.reveal = false; this.fullscreen = false; this.hover = false;
    ipcMain.on('dock-hover', (_, on) => { this.hover = !!on; if (this.win && !this.win.isDestroyed()) { this.ignoring = !on; this.win.setIgnoreMouseEvents(!on, { forward: true }); } this.push(); });
    ipcMain.on('dock-click', (_, id) => { this.clickAt = Date.now(); this.click(id); });
    ipcMain.on('dock-eaten', () => dlog('Windows zjadł naciśnięcie przycisku na pasku — kliknięcie obsłużone z puszczenia'));
    ipcMain.on('dock-menu', (_, id) => this.menu(id));
    ipcMain.on('dock-key', (_, k) => { if (['start', 'quick', 'notif'].includes(k)) this.cmd({ c: 'keys', k }); });
    ipcMain.on('dock-tray', (_, k) => this.trayClick(k));
    ipcMain.on('dock-np', () => this.mediaClick());
    ipcMain.on('dock-tray-menu', (_, k) => this.trayMenu(k));
    ipcMain.on('dock-width', (_, w) => { if (Number(w) > 0) this.dockW = Number(w); });
    ipcMain.handle('dock-state', () => this.state());
  }
  get active() { return !!this.win; }
  // ile miejsca nad dolną krawędzią zajmuje pasek (wyspa ustawiona „na dole” staje nad nim)
  // gdy pasek rezerwuje miejsce (AppBar), obszar roboczy już go nie obejmuje — wtedy 0
  get reserve() { return this.active && this.o.S().dockAutoHide === true ? this.barPx() : 0; }
  barPx() { return Math.round(this.size() * 30 + 18); } // jak --bar w dock.css
  size() { return Math.max(1, Math.min(2, (Number(this.o.S().dockSize) || 140) / 100)); }

  // ---------- start / stop ----------
  start() {
    if (process.platform !== 'win32' || this.win) return;
    this.spawn();
    this.makeWin();
    this.place = () => { if (!this.win) return; const b = screen.getPrimaryDisplay().bounds; this.win.setBounds({ x: b.x, y: b.y + b.height - H, width: b.width, height: H }); };
    screen.on('display-metrics-changed', this.place);
    this.lastTick = Date.now(); this.lastPong = Date.now();
    this.poll = setInterval(() => this.tick(), 120);
    this.importPins();
    this.emit('change');
  }
  makeWin() {
    const d = screen.getPrimaryDisplay().bounds;
    const win = this.win = new BrowserWindow({
      x: d.x, y: d.y + d.height - H, width: d.width, height: H, frame: false, transparent: true, resizable: false, movable: false,
      skipTaskbar: true, focusable: false, hasShadow: false, show: false, alwaysOnTop: true,
      webPreferences: { preload: this.o.preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setIgnoreMouseEvents(true, { forward: true }); this.ignoring = true; this.hover = false; // nowe okno: stan myszy od zera (po ponownym włączeniu paska stary stan blokował kliknięcia)
    this.prot = undefined; // nowe okno: ochrona przed przechwytywaniem ustawiana od nowa
    win.loadFile(path.join(__dirname, '..', 'dock', 'index.html'));
    win.once('ready-to-show', () => { if (this.win === win) { win.showInactive(); this.push(); } });
    win.on('closed', () => { if (this.win === win) this.win = null; });
  }
  stop() {
    clearInterval(this.poll);
    if (this.o.clearOrig) this.o.clearOrig(); // pomocnik zaraz przywróci pasek Windows — zapis niepotrzebny
    if (this.place) screen.removeListener('display-metrics-changed', this.place);
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    if (this.proc) { try { this.proc.stdin.write('{"c":"quit"}\n'); this.proc.stdin.end(); } catch {} this.proc = null; }
    this.emit('change');
  }
  spawn() {
    // pierwotny stan paska Windows: znacznik po awarii Aury, a gdy go brak — zapis w danych Aury (np. po awarii
    // całego systemu). Dopiero gdy nie ma żadnego, odczyt bieżącego stanu (wtedy jeszcze nieschowanego przez Aurę).
    let orig = readMarker();
    if (orig == null && this.o.getOrig) { const o = this.o.getOrig(); if (Number.isFinite(o)) orig = o; }
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'native', 'taskbar.ps1'),
      '-Orig', String(orig == null ? -1 : orig), '-Marker', MARKER(), '-AuraPid', String(process.pid)], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    this.proc = proc; this.reserved = null; this.heard = false; // heard: pomocnik już coś odpisał (pierwsze uruchomienie bywa wolne) // nowy pomocnik: rezerwację trzeba zgłosić od nowa
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
    this.heard = true; this.lastPong = Date.now(); // każda wiadomość = pomocnik żyje
    if (m.t === 'pong') return;
    if (m.t === 'acted') { const all = Date.now() - this.clickAt; if (all > 700 || Number(m.ms) > 500) dlog(`wolne przełączenie okna: ${all} ms od kliknięcia (samo przełączenie ${m.ms} ms)`); return; }
    if (m.t === 'jump') {
      const list = String(m.list || '').split('\n').filter(Boolean).map(l => { const [title, p, a] = l.split('\t'); return { title, path: p, args: a || '' }; }).filter(j => j.title && j.path);
      (this.jumps || (this.jumps = new Map())).set(m.key, { t: Date.now(), list });
      const w = this.jumpWait && this.jumpWait.get(m.key); if (w) { this.jumpWait.delete(m.key); w.forEach(r => r(list)); }
      return;
    }
    if (m.t === 'wicon') { this.wicons.set(String(m.key), m.png ? 'data:image/png;base64,' + m.png : ''); if (m.png) this.push(); return; }
    if (m.t === 'state') { if (this.o.saveOrig) this.o.saveOrig(Number(m.s)); return; } // pierwotny stan paska Windows — zapamiętany w danych Aury
    if (m.t === 'windows') {
      const lines = String(m.list || '').split('\n').filter(Boolean);
      // pierwsza linia: proces aktywnej aplikacji (0 = pulpit)
      let fgPid = null;
      if (lines[0] && lines[0].startsWith('FG\t')) fgPid = Number(lines.shift().slice(3)) || 0;
      this.windows = lines.map(l => {
        const [h, pid, min, fg, max, exe, rect, ...t] = l.split('\t');
        const [L, T, R, B] = String(rect || '').split(',').map(Number);
        return { h: Number(h), pid: Number(pid), min: min === '1', fg: fg === '1', max: max === '1', exe, rect: { L, T, R, B }, title: t.join('\t') };
      });
      // jak dock na Macu: liczy się aktywna APLIKACJA — jeśli którekolwiek jej okno nachodzi na pasek, pasek się chowa
      // (np. w Operze kliknięcie panelu Messengera to inne okienko, ale ta sama aplikacja). Klik w Aurę nie zmienia stanu.
      if (fgPid === process.pid) { /* zostaw poprzedni stan */ }
      else if (fgPid != null) this.covered = !!fgPid && this.windows.some(w => w.pid === fgPid && !w.min && this.overlaps(w.rect));
      else this.covered = this.windows.some(w => w.fg && !w.min && this.overlaps(w.rect));
      this.push();
    }
    if (m.t === 'tray' && Array.isArray(m.list)) {
      // jedna ikona na nazwę (np. dwa procesy SteelSeries GG)
      const seen = new Set();
      this.tray = m.list.filter(t => t && t.icon && !seen.has(String(t.name).toLowerCase()) && seen.add(String(t.name).toLowerCase()));
      this.push();
    }
  }
  // czy aktywne okno nachodzi na pasek (jak dock na Macu: wtedy pasek się chowa); prostokąt okna w pikselach ekranu
  overlaps(r) {
    if (!r || !Number.isFinite(r.B)) return false;
    const d = screen.getPrimaryDisplay(), k = d.scaleFactor, b = d.bounds;
    const top = (b.y + b.height - this.barPx() - 4) * k;
    const half = Math.min(b.width, this.dockW || 900) / 2 * k, cx = (b.x + b.width / 2) * k;
    return r.B > top && r.R > cx - half && r.L < cx + half && r.T < (b.y + b.height) * k;
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
  // ikona z okna (jak pasek Windows): aplikacje bez ikony w pliku .exe ustawiają ją dopiero oknu (np. OpenBot);
  // raz na program — pomocnik odpowiada 'wicon'; brak ikony okna = ikona z pliku
  winIcon(key, h) {
    if (this.wicons.has(key)) return this.wicons.get(key) || null;
    this.wicons.set(key, ''); this.cmd({ c: 'wicon', h, key });
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
        it = { id: 'w:' + (exe || w.h), name: w.title, launch: w.exe, exe, pinned: false, wins: [], icon: this.winIcon(exe || String(w.h), w.h) || (w.exe ? this.icon('e:' + exe, w.exe) : null) };
        if (/applicationframehost\.exe$/.test(exe)) it.id = 'w:' + w.h; else byExe.set(exe, it);
        out.push(it);
      }
      it.wins.push(w);
    }
    // nieprzypięte w stałej kolejności pojawienia się na pasku — lista okien z Windows idzie wg kolejności
    // „na wierzchu”, więc kliknięcie aplikacji zamieniało ikony miejscami
    const seen = this.seen || (this.seen = new Map());
    for (const it of out) if (!it.pinned && !seen.has(it.id)) seen.set(it.id, (this.seenN = (this.seenN || 0) + 1));
    for (const id of [...seen.keys()]) if (!out.some(it => it.id === id)) seen.delete(id); // zamknięta: przy ponownym otwarciu trafi na koniec
    const pinned = out.filter(it => it.pinned), loose = out.filter(it => !it.pinned).sort((a, b) => seen.get(a.id) - seen.get(b.id));
    return [...pinned, ...loose].map(it => ({ id: it.id, name: it.wins[0] ? it.wins[0].title : it.name, icon: it.icon, pinned: it.pinned, open: it.wins.length, active: it.wins.some(w => w.fg) }));
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
  // Menu z okna, które nie bierze fokusu, nie znikało po kliknięciu obok — Windows zamyka menu kliknięciem obok tylko,
  // gdy jego okno jest na pierwszym planie (a menu otwiera się chwilę po kliknięciu, po odczycie listy programu).
  // Na czas menu pasek bierze fokus, po zamknięciu oddaje.
  popup(tpl) {
    const w = this.win; if (!w || w.isDestroyed()) return;
    try { w.setFocusable(true); w.focus(); } catch {}
    Menu.buildFromTemplate(tpl).popup({ window: w, callback: () => { try { if (!w.isDestroyed()) { w.setFocusable(false); w.blur(); } } catch {} } });
  }
  // lista szybkiego dostępu programu (jump lista, jak pod prawym przyciskiem na pasku Windows): Steam — ostatnie gry,
  // Sklep, Biblioteka…; przeglądarki — Nowe okno, okno prywatne. Pomocnik czyta ją z plików Windows; pamiętamy 30 s.
  jumpFor(exe) {
    if (!exe) return Promise.resolve([]);
    const c = (this.jumps || (this.jumps = new Map())).get(exe);
    if (c && Date.now() - c.t < 30e3) return Promise.resolve(c.list);
    return new Promise(res => {
      const waiting = (this.jumpWait || (this.jumpWait = new Map()));
      const list = waiting.get(exe) || []; list.push(res); waiting.set(exe, list);
      this.cmd({ c: 'jump', exe });
      setTimeout(() => { const l = waiting.get(exe); if (l && l.includes(res)) { waiting.set(exe, l.filter(x => x !== res)); res(c ? c.list : []); } }, 800); // pomocnik zajęty: menu bez listy
    });
  }
  async menu(id) {
    const f = this.find(String(id || ''));
    const pins = [...(this.o.S().dockPins || [])];
    const tpl = [];
    const jump = await this.jumpFor(f.exe);
    for (const j of jump.slice(0, 16)) tpl.push({ label: j.title.slice(0, 60), click: () => this.cmd({ c: 'run', p: j.path, a: j.args }) });
    if (tpl.length) tpl.push({ type: 'separator' });
    if (f.wins.length) for (const w of f.wins.slice(0, 8)) tpl.push({ label: (w.title || '').slice(0, 60), click: () => this.cmd({ c: 'focus', h: w.h }) });
    if (tpl.length && tpl[tpl.length - 1].type !== 'separator') tpl.push({ type: 'separator' }); // bez dwóch kresek pod rząd
    if (f.launch && !jump.some(j => /^nowe okno$|^new window$/i.test(j.title))) tpl.push({ label: L('Nowe okno', 'New window'), click: () => shell.openPath(f.launch) });
    if (f.pin) tpl.push({ label: L('Odepnij od paska', 'Unpin from taskbar'), click: () => this.o.set({ dockPins: pins.filter(p => p !== f.pin) }) });
    else if (f.launch && !/applicationframehost\.exe$/i.test(f.launch)) tpl.push({ label: L('Przypnij do paska', 'Pin to taskbar'), click: () => this.o.set({ dockPins: [...pins, f.launch].slice(0, 30) }) });
    if (f.wins.length) tpl.push({ type: 'separator' }, { label: f.wins.length > 1 ? L('Zamknij wszystkie okna', 'Close all windows') : L('Zamknij okno', 'Close window'), click: () => f.wins.forEach(w => this.cmd({ c: 'close', h: w.h })) });
    if (tpl.length) this.popup(tpl);
  }

  // ---------- chowanie nad zmaksymalizowanymi oknami ----------
  // Klikalność paska liczona z pozycji kursora, a nie tylko z „najechania” od Chromium: po hibernacji/uśpieniu
  // przekazywanie ruchu myszy do okna z setIgnoreMouseEvents(…, forward) potrafi przestać działać i kliki przelatywały.
  hitTest(hidden) {
    const c = screen.getCursorScreenPoint(), b = this.win.getBounds();
    const w = (this.dockW || 0) + 40, h = this.barPx() + 12;
    const shown = !hidden || this.reveal;
    const inside = shown && this.dockW > 0 && Math.abs(c.x - (b.x + b.width / 2)) <= w / 2 && c.y >= b.y + b.height - h && c.y <= b.y + b.height;
    // schowany pasek nigdy nie łapie myszy (wcześniej „najechanie” trzymało niewidoczne okno i na dole ekranu było martwe pole)
    const ignore = !(inside || (this.hover && shown));
    if (ignore !== this.ignoring) { this.ignoring = ignore; this.win.setIgnoreMouseEvents(ignore, { forward: true }); }
  }
  // po wybudzeniu (hibernacja, uśpienie, odblokowanie): to samo co wyłączenie i włączenie paska, tylko bez mignięcia
  // paska Windows — nowe okno i nowy pomocnik. Stary pomocnik po hibernacji potrafił żyć, ale nie przełączać okien,
  // a okno przestawało dostawać kliknięcia. Zabity (a nie zamknięty) pomocnik nie przywraca paska Windows,
  // a nowy bierze pierwotny stan ze znacznika.
  wake(why) {
    if (!this.win || this.win.isDestroyed()) return;
    if (Date.now() - (this.wokeAt || 0) < 4000) return; // resume + unlock-screen + przerwa w zegarze naraz: raz wystarczy
    this.wokeAt = Date.now();
    dlog('odświeżenie paska po ' + (why || 'wybudzeniu'));
    const old = this.proc; this.proc = null;
    // stary pomocnik: najpierw zwolnij zarezerwowane miejsce (jeśli jeszcze słucha), potem zabij bez przywracania paska Windows
    if (old) { try { old.stdin.write(JSON.stringify({ c: 'unreserve' }) + '\n'); } catch {} setTimeout(() => { try { old.kill(); } catch {} }, 600); }
    this.spawn(); this.lastPong = Date.now();
    const w = this.win; this.makeWin(); try { w.destroy(); } catch {}
    this.place && this.place();
  }
  // „kursor nad paskiem” przychodzi od Chromium (mouseenter/mouseleave), a mouseleave potrafi nie przyjść — np. gdy pasek
  // schowa się spod nieruchomego kursora albo kursor szybko ucieknie z okna. Wtedy pasek wisiał na wierzchu nad
  // zmaksymalizowanym oknem. Sprawdzamy więc po pozycji kursora: poza paskiem (z miejscem na powiększone ikony) ponad 0,4 s = koniec.
  // kursor nad paskiem razem z miejscem na powiększone ikony (piksele ekranu Electrona)
  inZone() {
    const c = screen.getCursorScreenPoint(), b = this.win.getBounds();
    const w = (this.dockW || 0) + 60, h = this.barPx() + this.size() * 30 * 0.7 + 16;
    return this.dockW > 0 && Math.abs(c.x - (b.x + b.width / 2)) <= w / 2 && c.y >= b.y + b.height - h && c.y <= b.y + b.height;
  }
  checkHover(t) {
    if (!this.hover) { this.outSince = 0; return; }
    if (this.inZone()) { this.outSince = 0; return; }
    if (!this.outSince) { this.outSince = t; return; }
    if (t - this.outSince > 400) { this.outSince = 0; this.hover = false; this.push(); }
  }
  tick() {
    if (!this.win || this.win.isDestroyed()) return;
    const t = Date.now(), gap = t - (this.lastTick || t); this.lastTick = t;
    // zegar stał ponad 20 s = komputer spał (gdyby system nie dał znać o wybudzeniu) — odśwież pasek
    if (gap > 20000) { setTimeout(() => this.wake('przerwie ' + Math.round(gap / 1000) + ' s'), 2500); return; }
    if (gap > 1000) dlog(`Aura nie odpowiadała ${gap} ms (pasek stał)`); // zawieszenie procesu głównego
    // pomocnik musi odpowiadać: co 5 s „ping”; brak „pong” przez 15 s = zawieszony, więc nowy pasek
    if (t - (this.lastPing || 0) > 5000) { this.lastPing = t; this.cmd({ c: 'ping' }); }
    if (this.proc && this.heard && t - (this.lastPong || t) > 15000) { this.lastPong = t; this.wake('braku odpowiedzi pomocnika'); return; }
    this.checkHover(t);
    this.hitTest(this.fullscreen || (this.o.S().dockAutoHide === true && this.covered));
    const hide = this.fullscreen || (this.o.S().dockAutoHide === true && this.covered);
    if (!hide) { if (this.reveal) { this.reveal = false; this.push(); } return; }
    const c = screen.getCursorScreenPoint(), b = screen.getPrimaryDisplay().bounds;
    const atEdge = c.y >= b.y + b.height - 2 && !this.fullscreen;
    const now = Date.now();
    // wysunięty pasek zostaje, dopóki kursor jest nad nim (z pozycji kursora — „najechanie” od Chromium bywa spóźnione);
    // chowa się chwilę po zjechaniu kursora
    if (atEdge || (this.reveal && (this.hover || this.inZone()))) this.keepUntil = now + 400;
    const want = now < (this.keepUntil || 0);
    if (want !== this.reveal) { this.reveal = want; this.push(); }
  }
  // klik w grający utwór: okno programu, z którego leci muzyka (albo uruchom go, gdy siedzi tylko w zasobniku)
  mediaClick() {
    const m = this.media; if (!m || !m.app) return;
    const name = String(this.o.mediaProc ? this.o.mediaProc(m.app) : '').toLowerCase();
    const wins = name ? this.windows.filter(w => path.basename(norm(w.exe)).replace(/\.exe$/, '') === name) : [];
    if (wins.length) return this.cmd({ c: 'focus', h: (wins.find(w => !w.min) || wins[0]).h });
    if (/spotify/i.test(m.app)) return shell.openExternal('spotify:');
    const exe = this.o.mediaExe ? this.o.mediaExe(m.app) : null;
    if (exe && fs.existsSync(exe)) shell.openPath(exe);
  }
  // ikony zasobnika: klik = okno programu (albo uruchom go, co u Steama, Epica, Discorda otwiera okno)
  trayItem(key) { return (this.tray || []).find(t => t.key === key); }
  trayClick(key) {
    const t = this.trayItem(String(key || '')); if (!t) return;
    const w = this.windows.filter(x => path.basename(norm(x.exe)) === t.key);
    if (w.length) this.cmd({ c: 'focus', h: w[0].h }); else if (t.exe && fs.existsSync(t.exe)) shell.openPath(t.exe);
  }
  // ikona przy zegarze: lista szybkiego dostępu programu (Steam — Sklep, Biblioteka, Znajomi, Wyjdź…) jak w jego własnym menu
  async trayMenu(key) {
    const t = this.trayItem(String(key || '')); if (!t || !this.win) return;
    const jump = await this.jumpFor(t.key);
    const tpl = [{ label: L(`Otwórz: ${t.name}`, `Open: ${t.name}`).slice(0, 60), click: () => this.trayClick(key) }];
    if (jump.length) tpl.push({ type: 'separator' }, ...jump.slice(0, 16).map(j => ({ label: j.title.slice(0, 60), click: () => this.cmd({ c: 'run', p: j.path, a: j.args }) })));
    tpl.push({ type: 'separator' }, { label: L('Które ikony są widoczne…', 'Which icons are visible…'), click: () => shell.openExternal('ms-settings:taskbar') });
    this.popup(tpl);
  }
  // miejsce na dole ekranu jak dla paska Windows (albo nic, gdy pasek ma się chować nad oknami)
  reserveSpace() {
    if (!this.win || this.win.isDestroyed() || !this.proc) return;
    const want = this.o.S().dockAutoHide === true ? 'off' : String(Math.round((this.barPx() + 6) * screen.getPrimaryDisplay().scaleFactor)); // piksele ekranu
    if (want === this.reserved) return;
    this.reserved = want;
    if (want === 'off') this.cmd({ c: 'unreserve' });
    else { const b = this.win.getNativeWindowHandle(); const h = b.length >= 8 ? Number(b.readBigUInt64LE(0)) : b.readUInt32LE(0); this.cmd({ c: 'reserve', h, px: Number(want) }); }
  }
  setMedia(m) { this.media = m; this.push(); }
  setFocus(f) { this.focus = f; this.push(); }
  setFullscreen(on) { this.fullscreen = !!on; this.push(); }
  isHidden() { return (this.fullscreen || (this.o.S().dockAutoHide === true && this.covered)) && !this.reveal; }
  state() {
    const S = this.o.S();
    const hidden = this.isHidden();
    const tray = (this.tray || []).filter(t => S.dockTrayAll || t.promoted).map(t => ({ key: t.key, name: t.name, icon: 'data:image/png;base64,' + t.icon }));
    // wygląd: „jak wyspa” (szkło / kolor motywu wyspy) albo czarny; dla szkła — gdzie na ekranie stoi okno paska
    const d = screen.getPrimaryDisplay().bounds;
    const look = { surface: S.dockSurface === 'black' ? 'black' : (S.surface || 'black'), blur: (S.glassBlur ?? 50) / 100, shots: !!S.glassInShots, sw: d.width, sh: d.height, winY: d.height - H };
    return { items: this.items(), tray, media: this.media, focus: this.focus, size: this.size(), magnify: S.dockMagnify !== false, hidden, accent: S.accentColor || null, h12: S.timeFormat === '12', look };
  }
  push() {
    this.reserveSpace();
    const hid = this.isHidden(); if (hid !== this.lastHidden) { this.lastHidden = hid; this.emit('visibility', !hid); }
    if (!this.win || this.win.isDestroyed()) return;
    // szkło czyta obraz ekranu, więc pasek musi być niewidoczny dla przechwytywania (inaczej odbijałby sam siebie)
    const S = this.o.S(), prot = S.dockSurface !== 'black' && S.surface === 'glass' && !S.glassInShots;
    if (prot !== this.prot) { this.prot = prot; try { this.win.setContentProtection(prot); } catch {} }
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
