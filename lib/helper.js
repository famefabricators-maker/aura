// Uruchamia pomocnika PowerShell i zamienia jego linie JSON na zdarzenia.
const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');

class Helper extends EventEmitter {
  constructor() { super(); this.proc = null; this.stopped = false; this.edgeBottom = null; }
  setEdge(bottom) { this.edgeBottom = !!bottom; this.send({ c: 'edge', bottom: this.edgeBottom }); }
  start() {
    const proc = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '..', 'helper.ps1')],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    this.send({ c: 'ownpid', pid: process.pid }); // okna Wyspy nie liczą się jako „zasłaniające”
    if (this.edgeBottom != null) this.send({ c: 'edge', bottom: this.edgeBottom }); // po restarcie pomocnika: przy której krawędzi jest wyspa
    let buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (process.env.WYSPA_DEBUG) console.log('helper:', line.slice(0, 160));
        this.emit(msg.t, msg);
      }
    });
    proc.stderr.on('data', d => { if (process.env.WYSPA_DEBUG) console.log('helper err:', String(d).slice(0, 300)); });
    proc.on('exit', () => { if (this.proc === proc) this.proc = null; if (!this.stopped) setTimeout(() => this.start(), 3000); });
  }
  send(cmd) { try { if (this.proc) this.proc.stdin.write(JSON.stringify(cmd) + '\n'); } catch {} }
  stop() { this.stopped = true; try { this.proc && this.proc.stdin.end(); this.proc && this.proc.kill(); } catch {} }
}

module.exports = { Helper };
