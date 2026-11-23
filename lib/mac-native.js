// Aura na macOS — rzeczy, których Electron nie daje, wołane prosto z systemu (koffi = wywołania funkcji C z JS):
//  - wyspa „nieruchoma” jak pulpit: Mission Control / App Exposé jej nie przesuwa ani nie chowa
//    (NSWindowCollectionBehaviorStationary — Electron umie tylko „Transient”, przy którym wyspa odjeżdżała),
//  - klawisze głośności i jasności: Aura je przechwytuje, sama zmienia poziom i pokazuje swoje okienko
//    zamiast systemowego (jak aplikacje typu „wyspa” na Macu). Wymaga zgody w Ustawieniach → Prywatność → Dostępność.
// Wszystko w try/catch: gdy coś się nie uda, Aura działa jak dotąd (systemowe okienko, zwykłe okno).
let K = null, L = null;
function load() {
  if (L !== null) return L;
  L = false;
  if (process.platform !== 'darwin') return L;
  try {
    K = require('koffi');
    const objc = K.load('/usr/lib/libobjc.A.dylib');
    const cg = K.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
    const cf = K.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');
    const ca = K.load('/System/Library/Frameworks/CoreAudio.framework/CoreAudio');
    const at = K.load('/System/Library/Frameworks/AudioToolbox.framework/AudioToolbox');
    const as = K.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices');
    K.load('/System/Library/Frameworks/AppKit.framework/AppKit'); // klasy NSEvent / NSWindow muszą być załadowane
    let ds = null; try { ds = K.load('/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices'); } catch {}
    K.struct('AuraAudioAddr', { sel: 'uint32', scope: 'uint32', elem: 'uint32' });
    const cbProto = K.proto('void *AuraTapCallback(void *proxy, uint32 type, void *event, void *refcon)');
    L = {
      cbProto,
      getClass: objc.func('void *objc_getClass(const char *name)'),
      sel: objc.func('void *sel_registerName(const char *name)'),
      msgPtr: objc.func('objc_msgSend', 'void *', ['void *', 'void *']),
      msgPtrPtr: objc.func('objc_msgSend', 'void *', ['void *', 'void *', 'void *']),
      msgULong: objc.func('objc_msgSend', 'uint64', ['void *', 'void *']),
      msgSetULong: objc.func('objc_msgSend', 'void', ['void *', 'void *', 'uint64']),
      msgLong: objc.func('objc_msgSend', 'int64', ['void *', 'void *']),
      msgShort: objc.func('objc_msgSend', 'int16', ['void *', 'void *']),
      tapCreate: cg.func('void *CGEventTapCreate(uint32 tap, uint32 place, uint32 options, uint64 mask, AuraTapCallback *cb, void *refcon)'),
      tapEnable: cg.func('void CGEventTapEnable(void *tap, bool enable)'),
      getFlags: cg.func('uint64 CGEventGetFlags(void *event)'),
      mainDisplay: cg.func('uint32 CGMainDisplayID()'),
      preflightPost: cg.func('bool CGPreflightPostEventAccess()'),
      requestPost: cg.func('bool CGRequestPostEventAccess()'),
      trusted: as.func('bool AXIsProcessTrusted()'),
      srcCreate: cf.func('void *CFMachPortCreateRunLoopSource(void *alloc, void *port, int64 order)'),
      mainLoop: cf.func('void *CFRunLoopGetMain()'),
      addSource: cf.func('void CFRunLoopAddSource(void *rl, void *src, void *mode)'),
      removeSource: cf.func('void CFRunLoopRemoveSource(void *rl, void *src, void *mode)'),
      cfStr: cf.func('void *CFStringCreateWithCString(void *alloc, const char *s, uint32 enc)'),
      aGet: ca.func('int32 AudioObjectGetPropertyData(uint32 obj, const AuraAudioAddr *addr, uint32 qs, void *q, _Inout_ uint32 *size, void *data)'),
      aSet: ca.func('int32 AudioObjectSetPropertyData(uint32 obj, const AuraAudioAddr *addr, uint32 qs, void *q, uint32 size, const void *data)'),
      aHas: ca.func('bool AudioObjectHasProperty(uint32 obj, const AuraAudioAddr *addr)'),
      hsGet: at.func('int32 AudioHardwareServiceGetPropertyData(uint32 obj, const AuraAudioAddr *addr, uint32 qs, void *q, _Inout_ uint32 *size, _Out_ float *data)'),
      hsSet: at.func('int32 AudioHardwareServiceSetPropertyData(uint32 obj, const AuraAudioAddr *addr, uint32 qs, void *q, uint32 size, const float *data)'),
      bGet: ds ? ds.func('int32 DisplayServicesGetBrightness(uint32 display, _Out_ float *v)') : null,
      bSet: ds ? ds.func('int32 DisplayServicesSetBrightness(uint32 display, float v)') : null,
    };
  } catch (e) { L = false; module.exports.error = e; }
  return L;
}

// ---------- wyspa nieruchoma w Mission Control ----------
const CB = { canJoinAllSpaces: 1, managed: 1 << 2, transient: 1 << 3, stationary: 1 << 4, ignoresCycle: 1 << 6, fullScreenAuxiliary: 1 << 8 };
function pinWindow(win) {
  const l = load(); if (!l || !win || win.isDestroyed()) return null;
  try {
    const view = K.decode(win.getNativeWindowHandle(), 'void *');
    const nsWin = l.msgPtr(view, l.sel('window'));
    if (!nsWin) return null;
    const before = Number(l.msgULong(nsWin, l.sel('collectionBehavior')));
    // Transient, Managed i Stationary wykluczają się (NSWindow rzuca wyjątkiem) — najpierw zdejmujemy pozostałe
    const want = (before & ~(CB.managed | CB.transient)) | CB.stationary | CB.canJoinAllSpaces | CB.ignoresCycle | CB.fullScreenAuxiliary;
    if (want !== before) l.msgSetULong(nsWin, l.sel('setCollectionBehavior:'), want);
    return { before, after: Number(l.msgULong(nsWin, l.sel('collectionBehavior'))) };
  } catch (e) { module.exports.error = e; return null; }
}

// ---------- głośność (CoreAudio) ----------
const fcc = s => (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3);
const SYS = 1, OUT = fcc('outp'), GLOB = fcc('glob');
function outDevice(l) {
  const size = [4], id = Buffer.alloc(4);
  if (l.aGet(SYS, { sel: fcc('dOut'), scope: GLOB, elem: 0 }, 0, null, size, id) !== 0) return 0;
  return id.readUInt32LE(0);
}
function getVolume() {
  const l = load(); if (!l) return null;
  try {
    const dev = outDevice(l); if (!dev) return null;
    const v = [0], size = [4];
    if (l.hsGet(dev, { sel: fcc('vmvc'), scope: OUT, elem: 0 }, 0, null, size, v) !== 0) return null;
    const mAddr = { sel: fcc('mute'), scope: OUT, elem: 0 }, mute = Buffer.alloc(4);
    let muted = false; if (l.aHas(dev, mAddr)) { if (l.aGet(dev, mAddr, 0, null, [4], mute) === 0) muted = mute.readUInt32LE(0) === 1; }
    return { level: Math.max(0, Math.min(1, v[0])), mute: muted };
  } catch { return null; }
}
function setVolume(level, mute) {
  const l = load(); if (!l) return false;
  try {
    const dev = outDevice(l); if (!dev) return false;
    if (level != null) l.hsSet(dev, { sel: fcc('vmvc'), scope: OUT, elem: 0 }, 0, null, 4, [Math.max(0, Math.min(1, level))]);
    if (mute != null) { const b = Buffer.alloc(4); b.writeUInt32LE(mute ? 1 : 0); l.aSet(dev, { sel: fcc('mute'), scope: OUT, elem: 0 }, 0, null, 4, b); }
    return true;
  } catch { return false; }
}

// ---------- jasność wbudowanego ekranu (DisplayServices; zewnętrzne monitory — zostaje systemowe okienko) ----------
function getBrightness() {
  const l = load(); if (!l || !l.bGet) return null;
  try { const v = [0]; return l.bGet(l.mainDisplay(), v) === 0 ? Math.max(0, Math.min(1, v[0])) : null; } catch { return null; }
}
function setBrightness(v) {
  const l = load(); if (!l || !l.bSet) return false;
  try { return l.bSet(l.mainDisplay(), Math.max(0, Math.min(1, v))) === 0; } catch { return false; }
}

// ---------- przechwytywanie klawiszy głośności i jasności ----------
// Klawisze multimedialne przychodzą jako zdarzenie systemowe (NX_SYSDEFINED = 14, podtyp 8); kod klawisza i stan są w data1.
const KEY = { 0: 'volUp', 1: 'volDown', 7: 'mute', 2: 'brightUp', 3: 'brightDown' };
let tap = null;
// opts: { volume: bool, bright: bool, onHud({kind, level, mute}) }; zwraca 'ok' | 'brak-zgody' | 'błąd'
function startKeys(opts) {
  const l = load(); if (!l) return 'błąd';
  stopKeys();
  if (!l.preflightPost() && !l.trusted()) { try { l.requestPost(); } catch {} return 'brak-zgody'; } // okno systemowe „Pozwól na dostęp”
  try {
    const nsEvent = l.getClass('NSEvent'), evWith = l.sel('eventWithCGEvent:'), selSub = l.sel('subtype'), selData = l.sel('data1');
    const step = f => { f = Number(f); return (f & 0x80000) && (f & 0x20000) ? 1 / 64 : 1 / 16; }; // ⌥⇧ = drobne kroki, jak w macOS
    const handle = (type, ev) => {
      if (type === 0xFFFFFFFE || type === 0xFFFFFFFF) { if (tap) l.tapEnable(tap.port, true); return ev; } // system wyłączył kran (np. za wolno) — włącz znowu
      if (type !== 14) return ev;
      const ns = l.msgPtrPtr(nsEvent, evWith, ev);
      if (!ns || Number(l.msgShort(ns, selSub)) !== 8) return ev;
      const d1 = Number(l.msgLong(ns, selData)), code = (d1 & 0xFFFF0000) >>> 16, down = ((d1 & 0xFF00) >> 8) === 0x0A;
      const k = KEY[code]; if (!k) return ev;
      const isVol = k === 'volUp' || k === 'volDown' || k === 'mute';
      if (isVol && !opts.volume) return ev;
      if (!isVol && (!opts.bright || !l.bSet)) return ev;
      if (!down) return null; // puszczenie klawisza: też połykamy, żeby system nie pokazał swojego okienka
      const flags = l.getFlags(ev);
      if (isVol) {
        const v = getVolume(); if (!v) return ev;
        let level = v.level, mute = v.mute;
        if (k === 'mute') mute = !mute;
        else { level = Math.max(0, Math.min(1, Math.round((level + (k === 'volUp' ? 1 : -1) * step(flags)) * 64) / 64)); mute = level === 0; }
        setVolume(level, mute);
        opts.onHud({ kind: 'volume', level, mute });
      } else {
        const b = getBrightness(); if (b == null) return ev; // zewnętrzny monitor: zostaw systemowi
        const v = Math.max(0, Math.min(1, Math.round((b + (k === 'brightUp' ? 1 : -1) * step(flags)) * 64) / 64));
        if (!setBrightness(v)) return ev;
        opts.onHud({ kind: 'bright', level: v });
      }
      return null;
    };
    const cb = K.register((proxy, type, ev) => { try { return handle(type, ev); } catch { return ev; } }, K.pointer(l.cbProto));
    const port = l.tapCreate(1 /* sesja */, 0 /* na początku */, 0 /* może połykać */, 1 << 14, cb, null);
    if (!port) { K.unregister(cb); return 'brak-zgody'; }
    const src = l.srcCreate(null, port, 0), mode = l.cfStr(null, 'kCFRunLoopCommonModes', 0x08000100);
    l.addSource(l.mainLoop(), src, mode);
    l.tapEnable(port, true);
    tap = { port, src, mode, cb };
    return 'ok';
  } catch (e) { module.exports.error = e; return 'błąd'; }
}
function stopKeys() {
  if (!tap) return;
  const l = load();
  try { l.tapEnable(tap.port, false); l.removeSource(l.mainLoop(), tap.src, tap.mode); } catch {}
  try { K.unregister(tap.cb); } catch {}
  tap = null;
}

module.exports = { available: () => !!load(), pinWindow, getVolume, setVolume, getBrightness, setBrightness, startKeys, stopKeys, keysActive: () => !!tap, error: null };
