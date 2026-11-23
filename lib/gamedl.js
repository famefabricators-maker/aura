// Pobieranie gier w launcherach (Windows): postęp na wyspie jak przy pobieraniu z przeglądarki.
//  - Steam: steamapps/appmanifest_*.acf ma „BytesDownloaded” i „BytesToDownload” — dokładny postęp.
//  - Epic Games: rozpoczęta instalacja leży w Manifests/Pending/*.item (nazwa, folder, rozmiar po instalacji);
//    postęp = ile już jest na dysku w folderze gry (razem z .egstore) / rozmiar gry — w przybliżeniu.
// Pokazujemy tylko to, co naprawdę się pobiera (przybywa bajtów); wstrzymane znika po chwili.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const EPIC_PENDING = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests', 'Pending');
const vdf = (txt, key) => { const m = new RegExp(`"${key}"\\s+"([^"]*)"`, 'i').exec(txt); return m ? m[1] : null; };

class GameDownloads {
  constructor() { this.items = new Map(); this.steamLibs = null; this.lastSteamLookup = 0; this.done = []; }
  // biblioteki Steama: ścieżka z rejestru + libraryfolders.vdf (odświeżane co 10 min)
  steamLibraries(cb) {
    if (this.steamLibs && Date.now() - this.lastSteamLookup < 600e3) return cb(this.steamLibs);
    this.lastSteamLookup = Date.now();
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      const libs = new Set();
      const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(String(out || ''));
      if (m) {
        const root = m[1].trim().replace(/\//g, '\\'); libs.add(root);
        try { const t = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8'); for (const x of t.matchAll(/"path"\s+"([^"]+)"/gi)) libs.add(x[1].replace(/\\\\/g, '\\')); } catch {}
      }
      const uniq = new Map(); for (const l of libs) uniq.set(l.toLowerCase(), l); // ta sama ścieżka różną wielkością liter
      this.steamLibs = [...uniq.values()]; cb(this.steamLibs);
    });
  }
  dirSize(dir, limit = 30000) {
    let total = 0, n = 0; const stack = [dir];
    while (stack.length && n < limit) {
      const d = stack.pop(); let ents = [];
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) { n++; const p = path.join(d, e.name); if (e.isDirectory()) stack.push(p); else { try { total += fs.statSync(p).size; } catch {} } }
    }
    return total;
  }
  // co kilka sekund: zbiera stan; zwraca listę aktywnych { name, pct, size, speed }
  tick(done) {
    const now = Date.now(), seen = new Set();
    const upd = (id, name, got, total) => {
      seen.add(id);
      const it = this.items.get(id) || { name, got, t: now, speed: 0, moved: 0 };
      if (got > it.got) { const dt = Math.max(0.5, (now - it.t) / 1000); it.speed = it.speed ? it.speed * 0.6 + ((got - it.got) / dt) * 0.4 : (got - it.got) / dt; it.moved = now; }
      Object.assign(it, { name, got, total, t: now }); this.items.set(id, it);
    };
    // Epic
    try {
      for (const f of fs.readdirSync(EPIC_PENDING)) {
        if (!/\.item$/i.test(f)) continue;
        try {
          const j = JSON.parse(fs.readFileSync(path.join(EPIC_PENDING, f), 'utf8'));
          if (!j.InstallLocation || !(j.InstallSize > 0)) continue;
          upd('epic:' + f, j.DisplayName || 'Gra z Epic', this.dirSize(j.InstallLocation), j.InstallSize);
        } catch {}
      }
    } catch {}
    // Steam
    this.steamLibraries(libs => {
      for (const lib of libs) {
        const dir = path.join(lib, 'steamapps'); let names = [];
        try { names = fs.readdirSync(dir).filter(n => /^appmanifest_\d+\.acf$/i.test(n)); } catch { continue; }
        for (const n of names) {
          try {
            const t = fs.readFileSync(path.join(dir, n), 'utf8');
            const total = Number(vdf(t, 'BytesToDownload')) || 0, got = Number(vdf(t, 'BytesDownloaded')) || 0;
            if (total > 0 && got < total) upd('steam:' + n, vdf(t, 'name') || 'Gra ze Steama', got, total);
          } catch {}
        }
      }
    });
    // koniec: pobierało się (było w ruchu) i zniknęło albo doszło do końca
    for (const [id, it] of this.items) {
      const finished = (!seen.has(id) && now - it.t > 15e3) || (it.total && it.got >= it.total);
      if (finished) { this.items.delete(id); if (it.moved && now - it.moved < 300e3 && done) done(it.name); }
    }
    return [...this.items.values()].filter(it => it.moved && now - it.moved < 20e3)
      .map(it => ({ name: it.name, size: it.got, pct: Math.max(0, Math.min(99, Math.floor(it.got / it.total * 100))), speed: it.speed, game: true }));
  }
}
module.exports = { GameDownloads };
