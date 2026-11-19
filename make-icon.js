// Generuje icon.png i icon.ico (bez zewnetrznych bibliotek).
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function draw(S) {
  const px = Buffer.alloc(S * S * 4);
  const SS = 4; // supersampling
  const rr = (x, y, x0, y0, x1, y1, r) => {
    const cx = Math.max(x0 + r, Math.min(x, x1 - r));
    const cy = Math.max(y0 + r, Math.min(y, y1 - r));
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let a = 0, r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = (x + (sx + 0.5) / SS) / S, v = (y + (sy + 0.5) / SS) / S;
      if (!rr(u, v, 0.04, 0.04, 0.96, 0.96, 0.22)) continue;
      let c = [20, 20, 22];
      if (rr(u, v, 0.17, 0.36, 0.83, 0.62, 0.13)) c = [245, 245, 247];
      if ((u - 0.70) ** 2 + (v - 0.49) ** 2 <= 0.06 ** 2) c = [48, 209, 120];
      a++; r += c[0]; g += c[1]; b += c[2];
    }
    const i = (y * S + x) * 4;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; px[i + 3] = (a / (SS * SS)) * 255; }
  }
  return px;
}

function png(S) {
  const raw = draw(S);
  const rows = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) { rows[y * (S * 4 + 1)] = 0; raw.copy(rows, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizes = [16, 24, 32, 48, 64, 256];
const pngs = sizes.map(png);
const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s; e[1] = s >= 256 ? 0 : s;
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([head, ...entries, ...pngs]));
fs.writeFileSync(path.join(__dirname, 'icon.png'), pngs[sizes.length - 1]);
console.log('icon.ico + icon.png gotowe');
