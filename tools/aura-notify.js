#!/usr/bin/env node
// Wyświetla komunikat na wyspie Aury. Przykład:
//   node tools\aura-notify.js "Build gotowy" "0 błędów, 12 s"
const http = require('http');
const [title = 'Aura', body = ''] = process.argv.slice(2);
const data = JSON.stringify({ title, body });
const req = http.request({ host: '127.0.0.1', port: Number(process.env.WYSPA_PORT || 47900), path: '/notify', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => res.resume());
req.on('error', () => { console.error('Aura nie działa.'); process.exitCode = 1; });
req.end(data);
