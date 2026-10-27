/* 校验暗黑传奇图集 PNG 头：尺寸、色深、命名。
   默认只卡 P0（清单 §七）。--all 时 29 张都必须在。
   node games/darklegend/check-assets.mjs
*/
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'assets');
const all = process.argv.includes('--all');

const sheets = [
  ['terrain/terrain-field.png', 512, 512, 'P0'],
  ['terrain/terrain-cave.png', 512, 512, 'P0'],
  ['terrain/terrain-waste.png', 512, 512, 'P0'],
  ['chars/player-bean.png', 512, 640, 'P0'],
  ['chars/mobs.png', 768, 672, 'P0'],
  ['chars/bosses.png', 768, 768, 'P0'],
  ['chars/npc.png', 384, 192, 'P0'],
  ['items/pickups.png', 320, 64, 'P0'],
  ['ui/avatar-bean.png', 256, 256, 'P0'],
  ['props/props-field.png', 512, 512, 'P2'],
  ['props/props-cave.png', 512, 512, 'P2'],
  ['props/props-waste.png', 512, 512, 'P2'],
  ['trees/trees-field.png', 768, 768, 'P2'],
  ['trees/trees-cave.png', 768, 768, 'P2'],
  ['trees/trees-waste.png', 768, 768, 'P2'],
  ['chars/portals.png', 640, 512, 'P2'],
  ['items/equip.png', 512, 576, 'P1'],
  ['items/mats.png', 448, 128, 'P1'],
  ['items/consumables.png', 320, 128, 'P1'],
  ['ui/ui-icons.png', 384, 240, 'P1'],
  ['ui/ui-slot.png', 512, 128, 'P1'],
  ['ui/ui-buttons.png', 384, 192, 'P2'],
  ['ui/ui-panels.png', 288, 96, 'P2'],
  ['ui/ui-bars.png', 512, 64, 'P2'],
  ['ui/ui-map.png', 160, 176, 'P2'],
  ['ui/ui-stick.png', 256, 128, 'P2'],
  ['fx/fx.png', 768, 896, 'P2'],
  ['ui/logo.png', 1024, 256, 'P2'],
  ['ui/favicon.png', 64, 64, 'P2'],
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
let skip = 0;
for (const [rel, w, h, batch] of sheets) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    if (all || batch === 'P0') {
      console.log(`FAIL 缺图 ${rel} (${batch} ${w}x${h})`);
      fail++;
    } else {
      console.log(`SKIP ${rel} (${batch} 还没画)`);
      skip++;
    }
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

console.log(`RESULT fail=${fail} skip=${skip}`);
process.exit(fail ? 1 : 0);
