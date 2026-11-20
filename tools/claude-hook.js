#!/usr/bin/env node
// Hook Claude Code -> Aura. Użycie w ~/.claude/settings.json:
//   node "<ścieżka>\tools\claude-hook.js" working|needs|done|end|permission
// Czyta JSON zdarzenia ze stdin i wysyła stan sesji na lokalny punkt Aury (127.0.0.1).
// Tryb „permission” (hook PermissionRequest): pyta o zgodę na wyspie i czeka na odpowiedź.
//   Zezwól/Odmów -> decyzja trafia do Claude Code; „W terminalu”, brak odpowiedzi albo brak Aury -> zwykłe pytanie w terminalu.
const http = require('http');
const path = require('path');

const state = process.argv[2] || 'working';
const port = Number(process.env.WYSPA_PORT || 47900);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { input += d; });
process.stdin.on('end', run);
setTimeout(run, 1500); // gdyby stdin się nie zamknął

let started = false;
function post(p, body, timeout, done) {
  const data = JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', timeout,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
    let out = ''; res.setEncoding('utf8'); res.on('data', d => { out += d; }); res.on('end', () => done(out));
  });
  req.on('error', () => done(''));
  req.on('timeout', () => { req.destroy(); done(''); });
  req.end(data);
}
// krótki opis, o co prosi narzędzie (polecenie, plik, adres)
function summary(tool, inp) {
  inp = inp || {};
  const s = inp.command || inp.file_path || inp.notebook_path || inp.url || inp.pattern || inp.path || inp.query || (Object.keys(inp).length ? JSON.stringify(inp) : '');
  return String(s).replace(/\s+/g, ' ').slice(0, 220);
}
function run() {
  if (started) return; started = true;
  let ev = {};
  try { ev = JSON.parse(input || '{}'); } catch {}
  if (state === 'permission') {
    post('/ask', { session: ev.session_id || 'claude', harness: 'Claude Code', project: ev.cwd ? path.basename(ev.cwd) : '',
      tool: ev.tool_name || '', summary: summary(ev.tool_name, ev.tool_input) }, 32000, out => {
      let d = {}; try { d = JSON.parse(out || '{}'); } catch {}
      if (d.decision === 'allow' || d.decision === 'deny') {
        const decision = d.decision === 'allow' ? { behavior: 'allow' } : { behavior: 'deny', message: 'Odmówiono na wyspie Aury.' };
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }));
      }
      process.exit(0); // bez decyzji: Claude Code zapyta w terminalu jak zwykle
    });
    return;
  }
  post('/agent', {
    session: ev.session_id || 'claude',
    harness: 'Claude Code',
    state,
    project: ev.cwd ? path.basename(ev.cwd) : '',
    title: (ev.prompt || '').replace(/\s+/g, ' ').slice(0, 90) || undefined,
    message: (ev.message || '').slice(0, 140) || undefined,
  }, 800, () => process.exit(0));
}
