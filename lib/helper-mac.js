// Aura na macOS — odpowiednik helper.ps1. Zdarzenia i komendy mają ten sam kształt co na Windows,
// więc main.js nie musi wiedzieć, na jakim systemie działa.
//  - muzyka: Spotify i Apple Music przez AppleScript/JXA (macOS nie udostępnia „co teraz gra” dla wszystkich aplikacji),
//  - głośność i mikrofon: ustawienia głośności systemu,
//  - schowek: sprawdzanie zmian co sekundę,
//  - notch: rozmiar fabrycznego wycięcia (NSScreen.auxiliaryTopLeft/RightArea).
const { execFile } = require('child_process');
const { EventEmitter } = require('events');
const { clipboard, net } = require('electron');

const jxa = (code, timeout = 4000) => new Promise(resolve => {
  execFile('osascript', ['-l', 'JavaScript', '-e', code], { timeout }, (err, out) => resolve(err ? null : String(out).trim()));
});
const as = code => new Promise(resolve => execFile('osascript', ['-e', code], { timeout: 4000 }, () => resolve()));

const POLL = `
function run() {
  const out = {};
  const running = n => { try { return Application(n).running(); } catch (e) { return false; } };
  for (const name of ['Spotify', 'Music']) {
    if (out.media || !running(name)) continue;
    try {
      const a = Application(name), st = String(a.playerState());
      if (st === 'stopped') continue;
      const t = a.currentTrack;
      const dur = Number(t.duration()) || 0;
      out.media = { app: name, title: t.name(), artist: t.artist(), album: t.album(), playing: st === 'playing',
        pos: Number(a.playerPosition()) || 0, end: name === 'Spotify' ? dur / 1000 : dur,
        art: name === 'Spotify' ? t.artworkUrl() : null };
    } catch (e) {}
  }
  const me = Application.currentApplication(); me.includeStandardAdditions = true;
  try { const v = me.getVolumeSettings(); out.vol = { level: (v.outputVolume || 0) / 100, mute: !!v.outputMuted, input: v.inputVolume }; } catch (e) {}
  return JSON.stringify(out);
}`;

const NOTCH = `
ObjC.import('AppKit');
function run() {
  try {
    const s = $.NSScreen.mainScreen, f = s.frame, ins = s.safeAreaInsets;
    if (!(ins.top > 0)) return JSON.stringify({ has: false });
    const l = s.auxiliaryTopLeftArea, r = s.auxiliaryTopRightArea;
    return JSON.stringify({ has: true, w: Math.round(f.size.width - l.size.width - r.size.width), h: Math.round(ins.top) });
  } catch (e) { return JSON.stringify({ has: false }); }
}`;

class MacHelper extends EventEmitter {
  constructor() { super(); this.timer = null; this.app = 'Spotify'; this.lastMedia = ''; this.lastArt = ''; this.lastVol = ''; this.lastClip = null; this.micLevel = 75; }
  async notch() { try { return JSON.parse(await jxa(NOTCH) || '{}'); } catch { return { has: false }; } }
  start() {
    this.emit('fs', { t: 'fs', on: false });
    const tick = async () => {
      const raw = await jxa(POLL);
      if (raw) {
        let d = {}; try { d = JSON.parse(raw); } catch {}
        const m = d.media;
        const media = m ? { t: 'media', has: true, title: m.title || '', artist: m.artist || '', album: m.album || '', app: m.app, playing: !!m.playing,
          pos: Math.round(m.pos * 10) / 10, end: Math.round(m.end * 10) / 10, upd: Date.now(), canNext: true, canPrev: true, canSeek: true } : { t: 'media', has: false };
        if (m) this.app = m.app;
        const key = JSON.stringify({ ...media, pos: undefined, upd: undefined });
        if (key !== this.lastMedia || (m && m.playing)) { this.lastMedia = key; this.emit('media', media); }
        const art = m && m.art ? m.art : '';
        if (art !== this.lastArt) { this.lastArt = art; this.emit('thumb', { t: 'thumb', data: art ? await this.fetchArt(art) : null }); }
        if (d.vol) {
          const v = { t: 'vol', level: d.vol.level, mute: d.vol.mute, name: 'Głośniki', id: 'mac' };
          const vk = JSON.stringify(v);
          if (vk !== this.lastVol) { this.lastVol = vk; this.emit('vol', v); this.emit('mic', { t: 'mic', level: (d.vol.input || 0) / 100, mute: !d.vol.input, name: 'Mikrofon' }); }
        }
      }
      await this.checkClipboard();
      this.timer = setTimeout(tick, 1000);
    };
    tick();
  }
  async fetchArt(url) {
    try { const r = await net.fetch(url); const b = Buffer.from(await r.arrayBuffer()); return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${b.toString('base64')}`; } catch { return null; }
  }
  async checkClipboard() {
    let sig = '';
    try { const t = await clipboard.readText(); sig = t ? 't:' + t.length + ':' + t.slice(0, 200) : ''; } catch {}
    if (!sig) { try { const items = await clipboard.read(); sig = items.map(i => i.types.join(',')).join('|'); } catch {} }
    if (this.lastClip === null) { this.lastClip = sig; return; }
    if (sig !== this.lastClip) { this.lastClip = sig; this.emit('clip', { t: 'clip', private: false }); }
  }
  send(cmd) {
    const app = this.app === 'Music' ? 'Music' : 'Spotify';
    const tell = s => as(`tell application "${app}" to ${s}`);
    switch (cmd.c) {
      case 'media': tell({ toggle: 'playpause', next: 'next track', prev: 'previous track' }[cmd.a] || 'playpause'); setTimeout(() => { this.lastMedia = ''; }, 300); break;
      case 'seek': tell(`set player position to ${Math.max(0, Number(cmd.s) || 0)}`); break;
      case 'vol': as(`set volume output volume ${Math.round(Math.max(0, Math.min(1, cmd.v)) * 100)}`); this.lastVol = ''; break;
      case 'mute': as(`set volume output muted ${cmd.on ? 'true' : 'false'}`); this.lastVol = ''; break;
      case 'micmute': as(`set volume input volume ${cmd.on ? 0 : this.micLevel}`); this.lastVol = ''; break;
      case 'stats': this.emit('net', { t: 'net', rx: 0, tx: 0 }); break;
      case 'brightget': case 'bright': this.emit('bright', { t: 'bright', v: -1, src: null, initial: true }); break;
      case 'radios': case 'radio': this.emit('radios', { t: 'radios', list: [] }); break;
      case 'power': this.emit('power', { t: 'power', g: '' }); break;
      default: break; // pick, ownpid — brak odpowiednika na macOS
    }
  }
  stop() { clearTimeout(this.timer); this.timer = null; }
}

module.exports = { MacHelper };
