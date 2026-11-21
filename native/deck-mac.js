// Aura - PC Deck na macOS: ruchy myszy i klawisze z telefonu (JXA: osascript -l JavaScript, zdarzenia CoreGraphics).
// Ten sam protokół co native/deck.ps1 (jedno polecenie na linię, kody klawiszy jak na Windowsie - tu tłumaczone na Maca):
//   m <dx> <dy> · c <l|r|m> · b <l|r|m> <1|0> · s <dy> <dx> · k <vk> · x <vk,vk,...> · t <base64> · L · Z · q
// Wymaga zgody „Dostępność” dla Aury (Ustawienia systemowe → Prywatność i ochrona → Dostępność).
ObjC.import('Foundation');
ObjC.import('CoreGraphics');
ObjC.import('ApplicationServices');
ObjC.import('AppKit');

const out = s => { $.NSFileHandle.fileHandleWithStandardOutput.writeData($(s + '\n').dataUsingEncoding($.NSUTF8StringEncoding)); };

// Windows VK -> kod klawisza macOS
const KEY = {
  0x25: 123, 0x26: 126, 0x27: 124, 0x28: 125, 0x0D: 36, 0x1B: 53, 0x08: 51, 0x09: 48, 0x20: 49,
  0x24: 115, 0x23: 119, 0x21: 116, 0x22: 121, 0x2E: 117, 0x74: 96, 0x7A: 103, 0x73: 118,
  0x41: 0, 0x42: 11, 0x43: 8, 0x44: 2, 0x46: 3, 0x47: 5, 0x4A: 38, 0x4B: 40, 0x4C: 37, 0x4D: 46, 0x52: 15,
  0x53: 1, 0x54: 17, 0x56: 9, 0x57: 13, 0x58: 7, 0x59: 16, 0x5A: 6,
};
// klawisze multimediów (NX_KEYTYPE_*): wysyłane jako zdarzenia systemowe, jak klawisze F7–F12 na klawiaturze Maca
const MEDIA = { 0xB3: 16, 0xB0: 17, 0xB1: 18, 0xB2: 16, 0xAF: 0, 0xAE: 1, 0xAD: 7 };
const CMD = 0x100000, SHIFT = 0x20000, CTRL = 0x40000, ALT = 0x80000;
// skróty z Windowsa przetłumaczone na odpowiedniki z Maca
const COMBO = {
  '18,9': [CMD, 48],        // Alt+Tab -> Cmd+Tab
  '91,68': [0, 103],        // Win+D -> pokaż biurko (F11)
  '91,9': [CTRL, 126],      // Win+Tab -> Mission Control (Ctrl+↑)
  '18,115': [CMD, 12],      // Alt+F4 -> Cmd+Q
  '91': [CMD, 49],          // Win -> Spotlight (Cmd+Spacja)
  '16,116': [CMD | ALT, 35],// Shift+F5 -> Keynote: odtwarzaj od tego slajdu (Cmd+Opt+P)
};

let pressed = { l: false, r: false, m: false };
const BTN = { l: 0, r: 1, m: 2 };
const loc = () => $.CGEventGetLocation($.CGEventCreate(null));
const post = ev => { $.CGEventPost(0, ev); };

function mouse(type, x, y, btn) { post($.CGEventCreateMouseEvent(null, type, $.CGPointMake(x, y), btn)); }
function move(dx, dy) {
  const p = loc(), x = p.x + dx, y = p.y + dy;
  if (pressed.l) mouse(6, x, y, 0);          // przeciąganie lewym
  else if (pressed.r) mouse(7, x, y, 1);
  else if (pressed.m) mouse(27, x, y, 2);
  else mouse(5, x, y, 0);
}
function button(b, down) {
  const p = loc(), n = BTN[b] ?? 0;
  const t = n === 0 ? (down ? 1 : 2) : n === 1 ? (down ? 3 : 4) : (down ? 25 : 26);
  pressed[b] = down; mouse(t, p.x, p.y, n);
}
function scroll(dy, dx) {
  // Windows: 120 = jeden ząbek; na Macu w pikselach (ok. 40 px na ząbek)
  const ev = $.CGEventCreateScrollWheelEvent2 ? $.CGEventCreateScrollWheelEvent2(null, 0, 2, Math.round(dy / 3), Math.round(dx / 3), 0) : null;
  if (ev) post(ev);
}
function tap(code, flags) {
  for (const down of [true, false]) { const ev = $.CGEventCreateKeyboardEvent(null, code, down); $.CGEventSetFlags(ev, flags || 0); post(ev); }
}
function media(type) {
  for (const down of [true, false]) {
    const ev = $.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(
      14, $.NSMakePoint(0, 0), down ? 0xa00 : 0xb00, 0, 0, null, 8, (type << 16) | ((down ? 0xa : 0xb) << 8), -1);
    post(ev.CGEvent);
  }
}
function key(vk) { if (vk in MEDIA) media(MEDIA[vk]); else if (vk in KEY) tap(KEY[vk]); }
function combo(list) {
  const k = list.join(',');
  if (COMBO[k]) return tap(COMBO[k][1], COMBO[k][0]);
  let flags = 0, last = null;
  for (const vk of list) {
    if (vk === 0x11) flags |= CMD;          // Ctrl z Windowsa = Cmd na Macu (Ctrl+C -> Cmd+C)
    else if (vk === 0x10) flags |= SHIFT;
    else if (vk === 0x12) flags |= ALT;
    else if (vk === 0x5B) flags |= CMD;
    else last = vk;
  }
  if (last != null && last in KEY) tap(KEY[last], flags);
}
function text(s) {
  // wpisanie tekstu przez System Events (obsługuje polskie znaki)
  const se = Application('System Events');
  se.keystroke(s);
}
function sh(cmd) { $.NSTask.launchedTaskWithLaunchPathArguments('/bin/sh', $(['-c', cmd])); }

// zgoda „Dostępność”: bez niej macOS po cichu ignoruje zdarzenia — pytamy raz i mówimy Aurze, jaki jest stan
const trusted = $.AXIsProcessTrustedWithOptions($({ AXTrustedCheckOptionPrompt: true }));
out(trusted ? 'ready' : 'ready noax');

const stdin = $.NSFileHandle.fileHandleWithStandardInput;
let buf = '';
for (;;) {
  const data = stdin.availableData;
  if (!data || data.length === 0) break;      // Aura zamknięta
  buf += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const p = line.split(' ');
    try {
      switch (p[0]) {
        case 'm': move(+p[1] || 0, +p[2] || 0); break;
        case 'c': { const b = p[1] || 'l'; button(b, true); button(b, false); break; }
        case 'b': button(p[1] || 'l', p[2] === '1'); break;
        case 's': scroll(+p[1] || 0, +p[2] || 0); break;
        case 'k': key(+p[1]); break;
        case 'x': combo(p[1].split(',').map(Number)); break;
        case 't': text(ObjC.unwrap($.NSString.alloc.initWithDataEncoding($.NSData.alloc.initWithBase64EncodedStringOptions(p[1], 0), $.NSUTF8StringEncoding))); break;
        case 'L': sh('pmset displaysleepnow'); break;   // ekran gaśnie, Mac blokuje się wg ustawień hasła
        case 'Z': sh('pmset sleepnow'); break;
        case 'q': $.exit(0);
      }
    } catch (e) { out('error: ' + e); }
  }
}
