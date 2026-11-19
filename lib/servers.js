// Dwa małe serwery HTTP:
//  1) lokalny (tylko 127.0.0.1) - skrypty i agenci AI wysyłają komunikaty na wyspę,
//  2) telefon (sieć Wi-Fi, losowy token w adresie) - pliki z półki na telefon i z telefonu na komputer.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- 1. lokalny punkt dla skryptów ----------
class LocalEndpoint extends EventEmitter {
  start(port) {
    this.stop();
    this.port = port;
    this.server = http.createServer(async (req, res) => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      // tylko z tego komputera i bez wywołań z przeglądarek (ochrona przed stronami www)
      if (req.headers.origin) return send(403, { ok: false });
      try {
        if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, app: 'wyspa' });
        if (req.method !== 'POST') return send(404, { ok: false });
        let body = await readBody(req);
        let data; try { data = JSON.parse(body || '{}'); } catch { data = { title: body }; }
        if (req.url === '/notify') { this.emit('notify', data); return send(200, { ok: true }); }
        if (req.url === '/agent') { this.emit('agent', data); return send(200, { ok: true }); }
        return send(404, { ok: false });
      } catch { return send(400, { ok: false }); }
    });
    this.server.on('error', e => this.emit('error', e));
    this.server.listen(port, '127.0.0.1');
  }
  stop() { if (this.server) { try { this.server.close(); } catch {} this.server = null; } }
}

// ---------- 2. telefon ----------
function lanAddress() {
  const nets = os.networkInterfaces();
  const cands = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const n of list || []) {
      if (n.family !== 'IPv4' || n.internal) continue;
      const a = n.address;
      const priv = /^192\.168\./.test(a) || /^10\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
      if (!priv) continue;
      const virtual = /vethernet|virtual|vmware|vbox|hyper-v|wsl|loopback|bluetooth|tailscale|zerotier|radmin|hamachi/i.test(name);
      cands.push({ a, score: (virtual ? 0 : 10) + (/wi-?fi|wlan|ethernet/i.test(name) ? 5 : 0) + (/^192\.168\./.test(a) ? 2 : 0) });
    }
  }
  cands.sort((x, y) => y.score - x.score);
  return cands.length ? cands[0].a : null;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class PhoneShare extends EventEmitter {
  constructor(getFiles, saveDir) { super(); this.getFiles = getFiles; this.saveDir = saveDir; this.server = null; }
  get running() { return !!this.server; }
  start(port = 47901) {
    return new Promise((resolve, reject) => {
      if (this.server) return resolve(this.info());
      this.token = crypto.randomBytes(9).toString('base64url');
      this.ip = lanAddress();
      if (!this.ip) return reject(new Error('Brak połączenia z siecią lokalną (Wi-Fi / Ethernet).'));
      this.server = http.createServer((req, res) => this.handle(req, res).catch(() => { try { res.writeHead(500); res.end(); } catch {} }));
      this.server.on('error', e => { this.server = null; reject(e); });
      this.server.listen(port, '0.0.0.0', () => { this.port = port; this.touch(); resolve(this.info()); });
    });
  }
  info() { return { url: `http://${this.ip}:${this.port}/s/${this.token}/`, ip: this.ip }; }
  touch() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop(), 15 * 60 * 1000); // wyłącza się po 15 min bezczynności
  }
  stop() { clearTimeout(this.idle); if (this.server) { try { this.server.close(); } catch {} this.server = null; this.emit('stopped'); } }

  async handle(req, res) {
    const u = new URL(req.url, 'http://x');
    const base = `/s/${this.token}/`;
    if (!u.pathname.startsWith(base)) { res.writeHead(404); return res.end(); }
    this.touch();
    const rest = u.pathname.slice(base.length);
    const files = this.getFiles();
    if (req.method === 'GET' && rest === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(this.page(files));
    }
    if (req.method === 'GET' && rest.startsWith('f/')) {
      const i = parseInt(rest.slice(2), 10);
      const p = files[i];
      if (!p || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      const st = fs.statSync(p);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream', 'Content-Length': st.size,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(p))}`,
      });
      fs.createReadStream(p).pipe(res);
      this.emit('sent', p);
      return;
    }
    if (req.method === 'POST' && rest === 'up') {
      const name = path.basename(u.searchParams.get('name') || 'plik').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120) || 'plik';
      fs.mkdirSync(this.saveDir, { recursive: true });
      let target = path.join(this.saveDir, name);
      for (let n = 1; fs.existsSync(target); n++) { const e = path.extname(name); target = path.join(this.saveDir, `${path.basename(name, e)} (${n})${e}`); }
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(target);
        req.pipe(out); out.on('finish', resolve); out.on('error', reject); req.on('error', reject);
      });
      this.emit('received', target);
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
    }
    if (req.method === 'POST' && rest === 'text') {
      const text = (await readBody(req, 64 * 1024)).trim();
      if (text) this.emit('text', text);
      res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
    }
    res.writeHead(404); res.end();
  }

  page(files) {
    const list = files.map((p, i) => {
      let size = ''; try { const s = fs.statSync(p); if (s.isDirectory()) return ''; size = (s.size / 1048576).toFixed(1) + ' MB'; } catch { return ''; }
      return `<a class="f" href="f/${i}"><span>${esc(path.basename(p))}</span><small>${size}</small></a>`;
    }).join('') || '<p class="muted">Półka jest pusta. Upuść pliki na wyspę na komputerze.</p>';
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aura</title><style>
:root{color-scheme:dark}body{margin:0;font:16px/1.4 system-ui,sans-serif;background:#0b0b0c;color:#f5f5f7;padding:20px 16px 40px}
h1{font-size:22px;margin:4px 0 18px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#8e8e93;margin:26px 0 10px}
.f{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:14px;background:#1c1c1e;color:#f5f5f7;text-decoration:none;margin-bottom:8px}
.f span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.f small{color:#8e8e93;flex:none}.muted{color:#8e8e93}
label.btn,button{display:block;width:100%;box-sizing:border-box;text-align:center;padding:14px;border-radius:14px;border:0;background:#f5f5f7;color:#000;font:600 16px system-ui}
textarea{width:100%;box-sizing:border-box;min-height:90px;border-radius:14px;border:1px solid #333;background:#1c1c1e;color:#f5f5f7;padding:12px;font:16px system-ui;margin-bottom:8px}
#st{margin-top:10px;color:#34d17b;min-height:1.4em}</style></head><body>
<h1>Aura</h1><h2>Pliki z komputera</h2>${list}
<h2>Wyślij na komputer</h2><label class="btn">Wybierz zdjęcia lub pliki<input id="up" type="file" multiple hidden></label>
<h2>Tekst do schowka komputera</h2><textarea id="tx" placeholder="Wklej lub wpisz tekst"></textarea><button id="send">Wyślij tekst</button>
<div id="st"></div>
<script>
const st=document.getElementById('st');
document.getElementById('up').onchange=async e=>{for(const f of e.target.files){st.textContent='Wysyłam '+f.name+'…';
const r=await fetch('up?name='+encodeURIComponent(f.name),{method:'POST',body:f});st.textContent=r.ok?'Wysłano: '+f.name:'Błąd wysyłania';}};
document.getElementById('send').onclick=async()=>{const t=document.getElementById('tx').value;if(!t.trim())return;
const r=await fetch('text',{method:'POST',body:t});st.textContent=r.ok?'Tekst jest w schowku komputera':'Błąd';if(r.ok)document.getElementById('tx').value='';};
</script></body></html>`;
  }
}

module.exports = { LocalEndpoint, PhoneShare, lanAddress };
