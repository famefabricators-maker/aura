// Pasek okna Web: wstecz, dalej, odśwież, otwórz w przeglądarce, zamknij.
const W = window.wyspa, $ = s => document.querySelector(s);
for (const id of ['back', 'fwd', 'reload', 'close']) $('#' + id).onclick = () => W.send('web-cmd', id);
$('#ext').onclick = () => W.send('web-cmd', 'external');
document.addEventListener('keydown', e => { if (e.key === 'Escape') W.send('web-cmd', 'close'); });
W.on('web-info', i => {
  $('#t').textContent = i.title || 'Aura — Web';
  let host = ''; try { host = new URL(i.url).hostname.replace(/^www\./, ''); } catch {}
  $('#u').textContent = host;
  $('#back').disabled = !i.back; $('#fwd').disabled = !i.fwd;
  $('#load').classList.toggle('on', !!i.loading);
});
