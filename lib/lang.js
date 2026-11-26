// Język Aury (pl / en). Ustawienie „lang”: auto (język systemu: polski → pl, każdy inny → en), pl albo en.
// Teksty w kodzie mają postać L('po polsku', 'in English') — wybór zapada raz przy starcie, zmiana języka
// uruchamia Aurę ponownie. Czytamy ustawienia prosto z pliku, bo moduły biorą teksty już przy wczytywaniu.
const fs = require('fs'), path = require('path');
const { app } = require('electron');

function dataDir() {
  const exeDir = path.dirname(process.execPath);
  if (app.isPackaged && fs.existsSync(path.join(exeDir, 'portable'))) return path.join(exeDir, 'dane');
  return app.getPath('userData');
}
function systemLang() {
  let l = '';
  try { l = (app.getPreferredSystemLanguages && app.getPreferredSystemLanguages()[0]) || ''; } catch {}
  if (!l) try { l = Intl.DateTimeFormat().resolvedOptions().locale || ''; } catch {}
  return /^pl/i.test(l) || !l ? 'pl' : 'en';
}
function detect() {
  if (process.env.AURA_LANG === 'pl' || process.env.AURA_LANG === 'en') return process.env.AURA_LANG;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir(), 'ustawienia.json'), 'utf8'));
    if (j.lang === 'pl' || j.lang === 'en') return j.lang;
  } catch {}
  return systemLang();
}
const LANG = detect();
const L = LANG === 'en' ? (pl, en) => en : pl => pl;
module.exports = { L, LANG, systemLang };
