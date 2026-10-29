/* 校验暗黑传奇留下的图集 PNG 头：尺寸、色深、命名。
   2026-10-29 素材库清空后只剩瓦片：assets/tiles + assets/terrain。
   其余立牌/角色/道具已改走 hd-draw.js 程序化画布，不在这里卡。
   node games/darklegend/check-assets.mjs
*/
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'assets');

const sheets = [
  ['tiles/tiles-cave.png', 512, 512],
  ['terrain/terrain-field.png', 512, 512],
  ['terrain/terrain-cave.png', 512, 512],
  ['terrain/terrain-waste.png', 512, 512],
];

function pngInfo(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig) return null;
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return {
    w: buf.readUInt32BE(16),
    h: buf.readUInt32BE(20),
    bit: buf[24],
    color: buf[25],
    interlace: buf[28],
  };
}

let fail = 0;
for (const [rel, w, h] of sheets) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    console.log(`FAIL 缺图 ${rel} (${w}x${h})`);
    fail++;
    continue;
  }
  const info = pngInfo(readFileSync(path));
  if (!info) {
    console.log(`FAIL ${rel} 不是 PNG`);
    fail++;
    continue;
  }
  const sizeOk = info.w === w && info.h === h;
  const rgba = info.bit === 8 && info.color === 6 && info.interlace === 0;
  if (!sizeOk || !rgba) {
    console.log(`FAIL ${rel} 得到 ${info.w}x${info.h} bit=${info.bit} color=${info.color} interlace=${info.interlace}，要 ${w}x${h} RGBA8 非交错`);
    fail++;
  } else {
    console.log(`OK   ${rel} ${w}x${h}`);
  }
}

console.log(`RESULT fail=${fail}`);
process.exit(fail ? 1 : 0);
