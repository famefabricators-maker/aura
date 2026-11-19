#!/usr/bin/env node
// Hook Claude Code -> Aura. Użycie w ~/.claude/settings.json:
//   node "<ścieżka>\tools\claude-hook.js" working|needs|done|end
// Czyta JSON zdarzenia ze stdin i wysyła stan sesji na lokalny punkt Aury (127.0.0.1).
const http = require('http');
const path = require('path');

const state = process.argv[2] || 'working';
const port = Number(process.env.WYSPA_PORT || 47900);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', send);
setTimeout(send, 1500); // gdyby stdin się nie zamknął

let sent = false;
function send() {
  if (sent) return; sent = true;
  let ev = {};
  try { ev = JSON.parse(input || '{}'); } catch {}
  const body = JSON.stringify({
    session: ev.session_id || 'claude',
    harness: 'Claude Code',
    state,
    project: ev.cwd ? path.basename(ev.cwd) : '',
    title: (ev.prompt || '').replace(/\s+/g, ' ').slice(0, 90) || undefined,
    message: (ev.message || '').slice(0, 140) || undefined,
  });
  const req = http.request({ host: '127.0.0.1', port, path: '/agent', method: 'POST', timeout: 800,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => { res.resume(); res.on('end', () => process.exit(0)); });
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end(body);
}
