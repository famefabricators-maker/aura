#!/usr/bin/env node
// Hook Codex CLI -> Aura (ustawienie `notify` w ~/.codex/config.toml). Codex uruchamia go z JSON-em zdarzenia
// jako ostatnim argumentem (np. "agent-turn-complete"). Wysyła stan na lokalny punkt Aury (127.0.0.1),
// a potem przekazuje zdarzenie do programu, który był w `notify` wcześniej (np. aplikacji Codex), żeby nic nie zginęło.
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const port = Number(process.env.WYSPA_PORT || 47900);
const arg = process.argv[process.argv.length - 1] || '{}';
let ev = {};
try { ev = JSON.parse(arg); } catch {}

// poprzedni program powiadomień Codexa (zapisany przy łączeniu z Aurą)
function forward() {
  try {
    const orig = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.codex', 'aura-notify-original.json'), 'utf8'));
    if (Array.isArray(orig) && orig.length && typeof orig[0] === 'string') {
      spawn(orig[0], [...orig.slice(1), arg], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
  } catch {}
}

const last = Array.isArray(ev['input-messages']) ? ev['input-messages'][ev['input-messages'].length - 1] : '';
const body = JSON.stringify({
  session: String(ev['thread-id'] || ev['turn-id'] || 'codex'),
  harness: 'Codex',
  state: ev.type === 'agent-turn-complete' ? 'done' : 'needs',
  project: ev.cwd ? path.basename(ev.cwd) : '',
  title: String(last || '').replace(/\s+/g, ' ').slice(0, 90) || undefined,
  message: String(ev['last-assistant-message'] || '').replace(/\s+/g, ' ').slice(0, 140) || undefined,
});
const req = http.request({ host: '127.0.0.1', port, path: '/agent', method: 'POST', timeout: 800,
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => { res.resume(); res.on('end', done); });
req.on('error', done);
req.on('timeout', () => { req.destroy(); done(); });
req.end(body);
let finished = false;
function done() { if (finished) return; finished = true; forward(); setTimeout(() => process.exit(0), 50); }
