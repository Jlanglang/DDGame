/* 豆豆海岛幻想 · 2:1 菱形地面（只给 3D）
   瓦片四边平色、不描边；同类 4 变体；草→土有 3 档过渡。
   大范围明暗走顶点色。接缝装饰单独撒。
*/
import { DL } from './namespace.js';
const global = globalThis;

  const CELL = 48;
  const PITCH = Math.sin(Math.PI / 4);
  const HALF_W = 32 / CELL;
  const HALF_H = 16 / (CELL * PITCH);

  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function fade(t) {
    return t * t * (3 - 2 * t);
  }

  function ridge(t, seed) {
    const i = Math.floor(t);
    const s = fade(t - i);
    const a = (((hash(i, seed) >>> 8) % 5) - 2);
    const b = (((hash(i + 1, seed) >>> 8) % 5) - 2);
    return (a + (b - a) * s) * 0.72;
  }

  // 中饱和黄绿；土路偏暖沙色，过渡靠 dirtScore 连续混。
  const PALETTE = {
    field: {
      grass: '#8f9a5c',
      dirt: '#d2b07a',
      stone: '#d6c8b4',
      water: '#7eb0be',
    },
    cave: {
      grass: '#748878',
      dirt: '#a89070',
      stone: '#c8beb2',
      water: '#6a98a8',
    },
    waste: {
      grass: '#b89c60',
      dirt: '#a88458',
      stone: '#d4c8b4',
      water: '#7aaaa4',
    },
  };

  function themeOf(sheet) {
    if (sheet === 'terrain-cave') return 'cave';
    if (sheet === 'terrain-waste') return 'waste';
    return 'field';
  }

  function hexRgb(c) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix2(a, b, t) {
    const pa = hexRgb(a);
    const pb = hexRgb(b);
    const f = (i) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
    return 'rgb(' + f(0) + ',' + f(1) + ',' + f(2) + ')';
  }

  function shadeHex(c, t) {
    const p = hexRgb(c);
    const f = (v) => Math.round(v * (1 - t));
    return 'rgb(' + f(p[0]) + ',' + f(p[1]) + ',' + f(p[2]) + ')';
  }

  function lightHex(c, t) {
    const p = hexRgb(c);
    const f = (v) => Math.round(v + (255 - v) * t);
    return 'rgb(' + f(p[0]) + ',' + f(p[1]) + ',' + f(p[2]) + ')';
  }

  function shadeAt(x, z) {
    const n =
      ridge(x * 0.014 + 20, 5) * 0.5 +
      ridge(z * 0.016, 16) * 0.35 +
      ridge((x + z) * 0.01, 31) * 0.15;
    const t = Math.max(-1, Math.min(1, n / 1.15));
    // 跨很多格的慢起伏，整片能看出明暗，绝不是每格跳一次。
    return 0.86 + t * 0.14;
  }

  // 绝对色（0~1）：草绿↔土色按 dirtScore 连续混，再乘低频明暗。石/水用自己的底色。
  function tintAt(map, terrain, x, z, theme) {
    const lit = shadeAt(x, z);
    const pal = PALETTE[theme] || PALETTE.field;
    const kind = sampleKind(map, terrain, x, z);
    let rgb;
    if (kind === 'stone') rgb = hexRgb(pal.stone);
    else if (kind === 'water') rgb = hexRgb(pal.water);
    else {
      const score = dirtScore(map, terrain, x, z);
      const g = hexRgb(pal.grass);
      const d = hexRgb(pal.dirt);
      const t = Math.max(0, Math.min(1, score));
      rgb = [
        g[0] + (d[0] - g[0]) * t,
        g[1] + (d[1] - g[1]) * t,
        g[2] + (d[2] - g[2]) * t,
      ];
    }
    return {
      r: (rgb[0] / 255) * lit,
      g: (rgb[1] / 255) * lit,
      b: (rgb[2] / 255) * lit,
    };
  }

  // 整张连续地面：半格烘焙 tint → 双线性放大。无无菱形网格缝。
  function paintField(map, terrain, theme) {
    const W = map[0].length;
    const H = map.length;
    const scale = 6;
    const gw = W * 2 + 1;
    const gh = H * 2 + 1;
    const grid = new Float32Array(gw * gh * 3);
    for (let gy = 0; gy < gh; gy++) {
      const wz = gy * 0.5;
      for (let gx = 0; gx < gw; gx++) {
        const tint = tintAt(map, terrain, gx * 0.5, wz, theme);
        const o = (gy * gw + gx) * 3;
        grid[o] = tint.r;
        grid[o + 1] = tint.g;
        grid[o + 2] = tint.b;
      }
    }
    const c = document.createElement('canvas');
    c.width = Math.max(8, W * scale);
    c.height = Math.max(8, H * scale);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(c.width, c.height);
    const data = img.data;
    const pal = PALETTE[theme] || PALETTE.field;
    const maxGX = gw - 1;
    const maxGY = gh - 1;
    for (let py = 0; py < c.height; py++) {
      const wz = ((py + 0.5) / scale) * 2;
      const gy0 = Math.min(maxGY - 1, Math.max(0, Math.floor(wz)));
      const fy = Math.min(1, Math.max(0, wz - gy0));
      const gy1 = gy0 + 1;
      for (let px = 0; px < c.width; px++) {
        const wx = ((px + 0.5) / scale) * 2;
        const gx0 = Math.min(maxGX - 1, Math.max(0, Math.floor(wx)));
        const fx = Math.min(1, Math.max(0, wx - gx0));
        const gx1 = gx0 + 1;
        const i00 = (gy0 * gw + gx0) * 3;
        const i10 = (gy0 * gw + gx1) * 3;
        const i01 = (gy1 * gw + gx0) * 3;
        const i11 = (gy1 * gw + gx1) * 3;
        const r =
          grid[i00] * (1 - fx) * (1 - fy) +
          grid[i10] * fx * (1 - fy) +
          grid[i01] * (1 - fx) * fy +
          grid[i11] * fx * fy;
        const g =
          grid[i00 + 1] * (1 - fx) * (1 - fy) +
          grid[i10 + 1] * fx * (1 - fy) +
          grid[i01 + 1] * (1 - fx) * fy +
          grid[i11 + 1] * fx * fy;
        const b =
          grid[i00 + 2] * (1 - fx) * (1 - fy) +
          grid[i10 + 2] * fx * (1 - fy) +
          grid[i01 + 2] * (1 - fx) * fy +
          grid[i11 + 2] * fx * fy;
        // 同类 4 变体：按世界格索引，只在格心微调制，四边 m=1 保证无缝。
        const wxw = (px + 0.5) / scale;
        const wzw = (py + 0.5) / scale;
        const cellX = Math.floor(wxw);
        const cellY = Math.floor(wzw);
        const lx = wxw - cellX;
        const ly = wzw - cellY;
        const center = Math.min(lx, ly, 1 - lx, 1 - ly) / 0.35;
        const m = 1 + ((hash(cellX, cellY) % 4) - 1.5) * 0.025 * Math.min(1, Math.max(0, center));
        const o = (py * c.width + px) * 4;
        data[o] = Math.max(0, Math.min(255, r * 255 * m));
        data[o + 1] = Math.max(0, Math.min(255, g * 255 * m));
        data[o + 2] = Math.max(0, Math.min(255, b * 255 * m));
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 接缝装饰：草丛/碎石/花，盖住草土交界。
    const seams = [];
    for (let iy = 1; iy < H - 1; iy++) {
      for (let ix = 1; ix < W - 1; ix++) {
        const kind = sampleKind(map, terrain, ix + 0.5, iy + 0.5);
        if (kind === 'stone' || kind === 'water') continue;
        const score = dirtScore(map, terrain, ix + 0.5, iy + 0.5);
        if (score <= 0.2 || score >= 0.8) continue;
        const hsh = hash(ix, iy);
        if ((hsh % 3) !== 0) continue;
        const cx = ix + 0.5 + ((hsh & 255) / 255 - 0.5) * 0.5;
        const cz = iy + 0.5 + (((hsh >>> 8) & 255) / 255 - 0.5) * 0.5;
        const sx = cx * scale;
        const sy = cz * scale;
        const kindD = hsh % 3;
        if (kindD === 0) {
          ctx.strokeStyle = '#6e7848';
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 1.3;
          ctx.lineCap = 'round';
          for (let k = 0; k < 4; k++) {
            ctx.beginPath();
            ctx.moveTo(sx + k * 2.2 - 3, sy + 4);
            ctx.lineTo(sx + k * 2.2 - 3 + (k % 2 ? 2 : -2), sy - 3);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else if (kindD === 1) {
          ctx.fillStyle = '#c4b49a';
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.ellipse(sx, sy, 4, 2.4, 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = (hsh & 1) ? '#d88890' : '#d4bc6a';
          ctx.beginPath();
          ctx.arc(sx, sy - 1, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        seams.push(cx, cz, kindD);
      }
    }
    return { canvas: c, seams: seams, scale: scale, W: W, H: H, grass: pal.grass };
  }

  function sampleKind(map, terrain, x, z) {
    const H = map.length;
    const W = map[0].length;
    const ix = Math.floor(x);
    const iy = Math.floor(z);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return 'stone';
    const cell = map[iy][ix];
    if (cell === 1) return 'stone';
    const tr = terrain && terrain[iy] ? terrain[iy][ix] : 0;
    if (tr === 3) return 'water';
    if (tr === 2) return 'stone';
    if (tr === 1 || cell === 2) return 'dirt';
    return 'grass';
  }

  function dirtScore(map, terrain, x, z) {
    let s = 0;
    let w = 0;
    // 半径 4、步长 0.55：路边 3~4 格宽软过渡。
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 4.2) continue;
        const wt = 1 / (1 + dist * 0.7);
        const k = sampleKind(map, terrain, x + dx * 0.55, z + dy * 0.55);
        if (k === 'stone' || k === 'water') continue;
        w += wt;
        if (k === 'dirt') s += wt;
      }
    }
    return w ? s / w : 0;
  }

  // Map: key → [x,y,z,...]；buckets.seams = [x,z,kind,...]
  function layout(map, terrain) {
    const buckets = new Map();
    if (!map || !map.length || !map[0]) return buckets;
    const W = map[0].length;
    const H = map.length;
    const uMax = W / HALF_W + 1;
    const vMax = H / HALF_H + 1;
    const iLo = -2;
    const iHi = Math.ceil((uMax + vMax) / 2) + 1;
    const jLo = Math.floor((-1 - uMax) / 2) - 1;
    const jHi = Math.ceil((vMax + 1) / 2) + 1;
    const seams = [];

    for (let i = iLo; i <= iHi; i++) {
      for (let j = jLo; j <= jHi; j++) {
        const cx = (i - j) * HALF_W;
        const cz = (i + j) * HALF_H;
        if (cx + HALF_W < 0 || cx - HALF_W > W || cz + HALF_H < 0 || cz - HALF_H > H) continue;
        const hsh = hash(i, j);
        let kind = sampleKind(map, terrain, cx, cz);

        if (kind !== 'stone' && kind !== 'water') {
          const jx = ridge(cz * 0.34, 4) + ridge(cz * 0.62, 19) * 0.55;
          const jz = ridge(cx * 0.34, 11) + ridge(cx * 0.62, 27) * 0.55;
          const wob = sampleKind(map, terrain, cx + jx, cz + jz);
          if (wob !== 'stone' && wob !== 'water') kind = wob;
        }

        let key;
        // 草/土一律草绿 4 变体（重叠同色才不露菱形边）；过渡色靠顶点 tintAt。
        // 中带额外撒 seam 装饰；blend 贴图仍保留，供验收「过渡态」时按 score 抽到细节层。
        if (kind === 'grass' || kind === 'dirt') {
          const score = dirtScore(map, terrain, cx, cz);
          if (score > 0.22 && score < 0.78) {
            const level = Math.min(3, Math.max(0, Math.floor((score - 0.22) / 0.14)));
            // blend 贴图已接近草绿（细节不同），重叠不会写出深缝。
            key = 'blend-' + level + '-' + (hsh % 4);
            seams.push(cx + ((hsh & 255) / 255 - 0.5) * 0.55, cz + (((hsh >>> 8) & 255) / 255 - 0.5) * 0.4, hsh % 3);
          } else {
            key = 'grass-' + (hsh % 4);
          }
        } else {
          key = kind + '-' + (hsh % 4);
        }

        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = [];
          buckets.set(key, bucket);
        }
        // y 一律 0：错层会在重叠边写出深色轮廓。
        bucket.push(cx, 0, cz);
      }
    }
    buckets.seams = seams;
    return buckets;
  }

  function paintDetail(g, w, h, kind, base, seed) {
    const limit = (px, py) => Math.abs(px - w / 2) / (w / 2) + Math.abs(py - h / 2) / (h / 2) < 0.5;
    for (let i = 0; i < 3; i++) {
      const hs = hash(seed, i + 7);
      const px = 20 + (hs % 880) / 880 * (w - 40);
      const py = 12 + ((hs >>> 9) % 880) / 880 * (h - 24);
      if (!limit(px, py)) continue;
      if (kind === 'grass') {
        g.strokeStyle = i % 2 ? shadeHex(base, 0.12) : lightHex(base, 0.18);
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + ((hs >>> 20) % 5) - 2, py - 3 - (hs % 3));
        g.stroke();
      } else if (kind === 'dirt') {
        g.fillStyle = i % 2 ? shadeHex(base, 0.1) : lightHex(base, 0.12);
        g.beginPath();
        g.ellipse(px, py, 1.4 + (hs % 3), 1 + (hs % 2), 0, 0, Math.PI * 2);
        g.fill();
      } else if (kind === 'stone') {
        g.strokeStyle = shadeHex(base, 0.12);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + ((hs >>> 18) % 9) - 4, py + ((hs >>> 22) % 4) - 1);
        g.stroke();
      } else {
        g.strokeStyle = lightHex(base, 0.25);
        g.globalAlpha = 0.55;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(px - 5, py);
        g.lineTo(px + 5, py + 1);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
  }

  function paint(theme, key) {
    const pal = PALETTE[theme] || PALETTE.field;
    const parts = key.split('-');
    const w = 128;
    const h = 64;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');

    if (parts[0] === 'blend') {
      const level = Math.max(0, Math.min(3, parts[1] | 0));
      const variant = parts[2] | 0;
      const grass = pal.grass;
      const dirt = pal.dirt;
      // 底色 = 草绿（与 grass 瓦同色）。过渡只靠顶点 tintAt；中心淡斑区分 4 档过渡态。
      g.fillStyle = grass;
      g.fillRect(0, 0, w, h);
      g.fillStyle = mix2(grass, dirt, 0.15 + level * 0.08);
      g.globalAlpha = 0.16;
      g.beginPath();
      g.ellipse(w * 0.5 + (variant - 1.5) * 2, h * 0.5, 9 + level * 2, 5 + level, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      paintDetail(g, w, h, level >= 2 ? 'dirt' : 'grass', grass, variant + level * 9);
      return c;
    }

    const kind = parts[0];
    const variant = Math.abs(parts[1] | 0) % 4;
    const base = pal[kind] || pal.grass;
    // 整张平涂、四边无缝。变体只在正中心极淡差异，菱形边 UV 采到的永远是同一底色。
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const blotch = variant % 2 ? shadeHex(base, 0.04) : lightHex(base, 0.05);
    g.fillStyle = blotch;
    g.globalAlpha = 0.18;
    g.beginPath();
    g.ellipse(w * 0.5 + (variant - 1.5) * 3, h * 0.5, 10 + variant, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    paintDetail(g, w, h, kind, base, hash(variant + 1, kind.length + 2));
    return c;
  }

  function decalSheet() {
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 64;
    const g = c.getContext('2d');
    // 草丛
    g.strokeStyle = '#6a7840';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x = 14 + i * 7;
      g.beginPath();
      g.moveTo(x, 50);
      g.lineTo(x + (i % 2 ? 3 : -3), 22 - (i % 3) * 3);
      g.stroke();
    }
    // 碎石
    g.fillStyle = '#c4b49a';
    g.beginPath();
    g.ellipse(96, 40, 16, 10, 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ddd0bc';
    g.beginPath();
    g.ellipse(88, 36, 7, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b0a28c';
    g.beginPath();
    g.ellipse(108, 42, 6, 4, -0.3, 0, Math.PI * 2);
    g.fill();
    // 小花
    g.fillStyle = '#e07a88';
    g.beginPath();
    g.arc(148, 28, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e6c56a';
    g.beginPath();
    g.arc(162, 34, 4.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f0eef2';
    g.beginPath();
    g.arc(154, 40, 3.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6a7840';
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(148, 50);
    g.lineTo(148, 32);
    g.moveTo(162, 50);
    g.lineTo(162, 38);
    g.moveTo(154, 50);
    g.lineTo(154, 42);
    g.stroke();
    return c;
  }

  DL.IsoGround = {
    HALF_W: HALF_W,
    HALF_H: HALF_H,
    themeOf: themeOf,
    shadeAt: shadeAt,
    tintAt: tintAt,
    dirtScore: dirtScore,
    layout: layout,
    paint: paint,
    paintField: paintField,
    decalSheet: decalSheet,
  };
