/* Strona animowanej tapety. Parametry w adresie: src (file://…), hue, saturation, brightness, contrast.
   Proces główny steruje przez executeJavaScript: setFilters({...}), pauseVideo(), resumeVideo(), unloadVideo(). */
const v = document.getElementById('v');
const q = new URLSearchParams(location.search);
let src = q.get('src') || '', savedTime = 0, unloaded = false;

function setFilters(f) {
  f = f || {};
  const hue = Number(f.hue) || 0, sat = f.saturation ?? 100, bri = Number(f.brightness) || 0, con = f.contrast ?? 100;
  // jasność: -100..100 -> 0..2 (0 = bez zmian), reszta w procentach jak w ustawieniach
  v.style.filter = `hue-rotate(${hue}deg) saturate(${sat}%) brightness(${(100 + bri) / 100}) contrast(${con}%)`;
}
function load() {
  if (!/^file:/i.test(src)) return;
  v.src = src;
  v.addEventListener('loadeddata', () => { if (savedTime) { try { v.currentTime = savedTime % (v.duration || 1); } catch {} } v.classList.add('on'); }, { once: true });
  v.play().catch(() => {});
}
function pauseVideo() { v.pause(); }
function resumeVideo() {
  if (unloaded) { unloaded = false; load(); return; }
  v.play().catch(() => {});
}
// zwalnia dekoder i pamięć, zapamiętując miejsce w filmie
function unloadVideo() {
  if (unloaded) return;
  savedTime = v.currentTime || 0; unloaded = true;
  v.classList.remove('on'); v.removeAttribute('src'); v.load();
}
v.addEventListener('error', () => { document.title = 'Aura – tapeta (błąd filmu)'; });

setFilters({ hue: q.get('hue'), saturation: q.get('saturation'), brightness: q.get('brightness'), contrast: q.get('contrast') });
load();
