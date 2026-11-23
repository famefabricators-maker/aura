// Test na macOS: wykonuje kod w oknie Aury przez port debugowania (node .github/mac-cdp.js <port> <wzorzec-url> "<wyrażenie>")
const [port, pat, expr] = process.argv.slice(2);
(async () => {
  const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  console.log('okna:', l.map(x => x.url.replace(/^file:\/\/.*\/app\//, '')).join(' | '));
  const t = l.find(x => x.url.includes(pat)); if (!t) { console.log('brak okna', pat); process.exit(0); }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
  const r = await new Promise(res => ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) res(d.result); });
  console.log(JSON.stringify(r.result.value ?? r.result.description ?? r, null, 1));
  process.exit(0);
})().catch(e => { console.log('błąd', e.message); process.exit(0); });
