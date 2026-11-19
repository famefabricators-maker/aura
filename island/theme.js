/* Wspólne definicje wyglądu (wyspa + okno ustawień). */
window.WYSPA_THEME = (() => {
  const ACCENTS = [
    { id: 'white', name: 'Biały', hex: '#ffffff' },
    { id: 'windows', name: 'Akcent Windows', hex: null },
    { id: 'blue', name: 'Niebieski', hex: '#0a84ff' },
    { id: 'violet', name: 'Fiolet', hex: '#bf5af2' },
    { id: 'raspberry', name: 'Malina', hex: '#ff375f' },
    { id: 'orange', name: 'Pomarańcz', hex: '#ff9f0a' },
    { id: 'green', name: 'Zieleń', hex: '#30d158' },
    { id: 'teal', name: 'Turkus', hex: '#64d2ff' },
    { id: 'lilac', name: 'Liliowy', hex: '#c0a4f8' },
    { id: 'ice', name: 'Lód', hex: '#9ad1ff' },
    { id: 'amber', name: 'Bursztyn', hex: '#ffc46b' },
    { id: 'mint', name: 'Mięta', hex: '#7ee0c3' },
  ];
  // fx: 0 brak, 1 śnieg, 2 gwiazdy, 3 iskry
  const SURFACES = [
    { id: 'black', name: 'Czarny', base: '#0b0b0c', light: false },
    { id: 'pure', name: 'Czysta czerń', base: '#000000', light: false, note: 'dla OLED' },
    { id: 'graphite', name: 'Grafit', base: '#1b1c1e', light: false },
    { id: 'white', name: 'Czysta biel', base: '#ffffff', light: true },
    { id: 'glass', name: 'Szkło', base: '#0c0c10', light: false, glass: true },
    { id: 'tatry', name: 'Tatry', base: '#0d1b2a', light: false, fx: 1, accent: 'ice', note: 'padający śnieg' },
    { id: 'noc', name: 'Noc', base: '#130f2b', light: false, fx: 2, accent: 'lilac', note: 'migoczące gwiazdy' },
    { id: 'bursztyn', name: 'Bursztyn', base: '#26150a', light: false, fx: 3, accent: 'amber', note: 'unoszące się iskry' },
  ];
  const FONTS = [
    { id: 'manrope', name: 'Manrope', css: '"Manrope Variable", "Segoe UI Variable Text", "Segoe UI", sans-serif' },
    { id: 'inter', name: 'Inter', css: '"Inter Variable", "Segoe UI Variable Text", "Segoe UI", sans-serif' },
    { id: 'system', name: 'Segoe UI', css: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif' },
  ];
  const hexToRgb = h => { h = (h || '#ffffff').replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
  function accentHex(id, windowsHex, light) {
    const a = ACCENTS.find(x => x.id === id) || ACCENTS[8];
    let hex = a.id === 'windows' ? (windowsHex || '#0a84ff') : a.hex;
    if (light && hex.toLowerCase() === '#ffffff') hex = '#111111';
    return hex;
  }
  function surface(id) { return SURFACES.find(s => s.id === id) || SURFACES[0]; }
  // zmienne CSS dla danej powierzchni
  function cssVars(surf, accent) {
    const s = surface(surf);
    const L = s.light;
    return {
      '--surface': s.base,
      '--fg': L ? '#111113' : '#f2f2f2',
      '--dim': L ? '#6b6b70' : '#9a9a9a',
      '--faint': L ? '#a1a1a6' : '#5c5c61',
      '--row': L ? '#eeeeef' : 'rgba(255,255,255,.075)',
      '--row-hi': L ? '#e2e2e4' : 'rgba(255,255,255,.13)',
      '--line': L ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)',
      '--btn': L ? '#111113' : '#f5f5f7',
      '--btn-fg': L ? '#ffffff' : '#000000',
      '--accent': accent,
      '--accent-soft': accent + '33',
    };
  }
  return { ACCENTS, SURFACES, FONTS, hexToRgb, accentHex, surface, cssVars };
})();
