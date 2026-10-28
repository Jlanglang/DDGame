/* 豆豆暗黑传奇 · 等距美术 v2（地面）
   ------------------------------------------------------------------
   和 iso-ground.js 的区别（那份保留，不删，可回退）：
   1. 分辨率：6px/格 → 48px/格（8 倍细节，糊的根因之一）
   2. 不再是"色块双线性插值"，每种材质有自己的笔触（草簇/砖缝/波纹/碎石的）
   3. 材质清单化：KINDS 里 8 种，验收台按种类一张一张过（见 asset-bench.html）

   画法是"俯视图"：相机 45° 正交把 1×1 的正方格压成 2:1 菱形，
   所以贴图里画正方形网格，投影后自然变等距菱形，不需要手工画菱形。
   覆盖层（路/砖/水/泥）用"圆群并集"当遮罩 → 边缘是有机起伏，不是直角。

   对外：
     DL.IsoArt.KINDS / PALETTES / PX
     DL.IsoArt.groundSheet(map, terrain, theme, opts) -> canvas
     DL.IsoArt.patch(kind, theme, cols, rows, seed)   -> canvas（验收台用）
     DL.IsoArt.kindOf(map, terrain, x, y)            -> 'grass'|'path'|'water'|'stone'
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});

  const PX = 48;              // 每格像素（俯视）。24 格 → 1152px
  const TAU = Math.PI * 2;

  /* ================= 色板：明亮暖色童话，一套 ×3 主题 ================= */

  const PALETTES = {
    field: {
      base: '#8CC26A', baseHi: '#A8D77E', baseLo: '#6FA24E',
      rock: '#9C9384', rockHi: '#B4AB9A', rockLo: '#7F7768',
      soil: '#D9B87A', soilHi: '#E7CB96', soilLo: '#BFA066',
      path: '#D9B77E', pathLo: '#C0A168',
      brick: ['#B5624E', '#AE5C49', '#BC6A56'], mortar: '#D4C4A6',
      stone: '#C9BEA8', stoneLo: '#9A8F7C',
      water: '#7FB6D9', waterLo: '#5A8FB3', waterHi: '#C6E4F2',
      sea: '#3F6E92', seaLo: '#2E5675', seaHi: '#7FA8C4',
      mud: '#A5814F', mudLo: '#8A6A3E',
      ink: '#3B2F26', cream: '#F7EEDB',
    },
    cave: {
      base: '#767A8C', baseHi: '#8C90A2', baseLo: '#5E6274',
      rock: '#767A8C', rockHi: '#8C90A2', rockLo: '#5E6274',
      soil: '#8A8478', soilHi: '#9C9587', soilLo: '#6E685E',
      path: '#A39A88', pathLo: '#877E6E',
      brick: ['#8A7F76', '#7A7068', '#988C82'], mortar: '#B6ABA0',
      stone: '#B0A79A', stoneLo: '#867D72',
      water: '#5E8FA0', waterLo: '#48707E', waterHi: '#9FC8D6',
      sea: '#3A6076', seaLo: '#2A4A5C', seaHi: '#7FA8B8',
      mud: '#6E6458', mudLo: '#584F46',
      ink: '#2A2630', cream: '#E8E2D4',
    },
    waste: {
      base: '#C9A96E', baseHi: '#DCC088', baseLo: '#A88C55',
      rock: '#B4A085', rockHi: '#C6B49B', rockLo: '#95846B',
      soil: '#B99A62', soilHi: '#CBAE76', soilLo: '#9A7E4C',
      path: '#D9BE86', pathLo: '#BEA169',
      brick: ['#B08A5E', '#9E7A50', '#BE9A6C'], mortar: '#D6C3A0',
      stone: '#C2B6A0', stoneLo: '#968B78',
      water: '#7AAAA4', waterLo: '#5C8A86', waterHi: '#B4D2CE',
      sea: '#4E7E86', seaLo: '#3A626A', seaHi: '#A6C6C4',
      mud: '#94764C', mudLo: '#785E3C',
      ink: '#3A3226', cream: '#F2E7CE',
    },
  };

  /* ================= 材质清单（验收台/文档按这张表过） ================= */

  const KINDS = {
    grass: { name: '草地', tier: '底材', note: '主城/野外底材。不画格线，靠草簇与低频明暗起伏，否则会变棋盘格' },
    soil: { name: '泥土', tier: '底材', note: '荒地、踩实的空地。比草暖、比土路暗' },
    rock: { name: '岩地', tier: '底材', note: '洞窟底材。冷灰紫、带裂缝' },
    path: { name: '土路', tier: '覆盖', note: '2 格宽的路。圆群遮罩 → 边缘有机起伏，撒碎石' },
    brick: { name: '砖铺', tier: '覆盖', note: '广场/主路。砖 0.5×0.25 格，投影后是 2:1 平行四边形' },
    slab: { name: '石板', tier: '覆盖', note: '大块不规则石板。比砖粗、有高低差' },
    water: { name: '水面', tier: '覆盖', note: '池塘/河。横向波纹，边缘浅、中心深' },
    mud: { name: '泥沼', tier: '覆盖', note: '水边过渡。深褐压住水的硬边，免得水像贴纸' },
    sea: { name: '海', tier: '覆盖', note: '地图外侧。比池塘深、波纹更大；村子临海就是它' },
  };

  const BASE_OF = { field: 'grass', cave: 'rock', waste: 'soil' };

  /* ================= 确定性随机（同一张图每次生成一致） ================= */

  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul((y | 0) + 0x9e3779b9, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  // hash 里再取第 i 个 [0,1) 随机
  function rnd(h, i) {
    let v = hash(h ^ 0x5bf03635, (i | 0) * 2654435761);
    return ((v >>> 8) & 0xffff) / 0x10000;
  }

  /* ---------- 高度场：2D value noise ---------- */
  // 为什么不是每块独立随机：山谷高度是**连续**的，相邻块要接近；
  // 而且分布是**低多高少**——大部分是矮坡，偶尔冒一座高的。

  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);
    const at = (a, b) => rnd(hash(seed, (a * 73856093) ^ (b * 19349663)), 0);
    const v00 = at(xi, yi), v10 = at(xi + 1, yi);
    const v01 = at(xi, yi + 1), v11 = at(xi + 1, yi + 1);
    const top = v00 + (v10 - v00) * sx;
    const bot = v01 + (v11 - v01) * sx;
    return top + (bot - top) * sy;
  }

  /**
   * 崖壁高度系数 0..1（格坐标为输入，所以四角和拐弯处也连续）。
   * pow(1.85) 把分布压成「低多高少」：中位数约 0.25，只有 10% 左右会过 0.6。
   */
  function cliffHeight(x, y, seed) {
    const s = seed || 3;
    const n = vnoise(x * 0.28, y * 0.28, s) * 0.7 + vnoise(x * 0.72, y * 0.72, s + 7) * 0.3;
    return Math.pow(Math.max(0, Math.min(1, n)), 1.85);
  }

  // 颜色解析：'#rrggbb' 和 'rgb(r,g,b)' 都吃。mix 的结果会被再 mix/hexA 一次，
  // 只认十六进制的话第二层就是 NaN → fillStyle 静默失效 → 画出一片黑（踩过）。
  function parseCol(c) {
    if (typeof c !== 'string') return [0, 0, 0];
    if (c.charAt(0) === '#') {
      const n = parseInt(c.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const m = c.match(/(\d+)\D+(\d+)\D+(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  function hexA(col, a) {
    const p = parseCol(col);
    return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')';
  }

  function mix(a, b, t) {
    const A = parseCol(a), B = parseCol(b);
    const f = function (i) {
      return Math.round(A[i] + (B[i] - A[i]) * t);
    };
    return 'rgb(' + f(0) + ',' + f(1) + ',' + f(2) + ')';
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  }

  function rr(g, x, y, w, h, r) {
    const k = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + k, y);
    g.lineTo(x + w - k, y);
    g.quadraticCurveTo(x + w, y, x + w, y + k);
    g.lineTo(x + w, y + h - k);
    g.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
    g.lineTo(x + k, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - k);
    g.lineTo(x, y + k);
    g.quadraticCurveTo(x, y, x + k, y);
    g.closePath();
  }

  /* ================= 地图格分类（沿用旧编码：0 地面 / 1 土路 / 2 墙 / 3 水） ================= */

  function kindOf(map, terrain, x, y) {
    if (!map || !map[y] || map[y][x] === undefined) return 'stone';
    const cell = map[y][x];
    if (cell === 1) return 'stone';
    const tr = terrain && terrain[y] ? terrain[y][x] : 0;
    if (tr === 3) return 'water';
    if (tr === 2) return 'stone';
    if (tr === 1 || cell === 2) return 'path';
    return 'base';
  }

  /* ================= 笔触零件 ================= */

  // 草簇：三笔，中间那笔最高；lean 让它偏一点，避免每簇一样
  function tuft(g, x, y, s, col, lean) {
    g.strokeStyle = col;
    g.lineWidth = Math.max(1, s * 0.16);
    g.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const tip = y - s * (i === 0 ? 1.05 : 0.78);
      g.beginPath();
      g.moveTo(x + i * s * 0.3, y);
      g.quadraticCurveTo(x + i * s * 0.5 + lean * s * 0.3, y - s * 0.55, x + i * s * 0.8 + lean * s * 0.55, tip);
      g.stroke();
    }
  }

  // 小石子：扁椭圆 + 一点高光
  function pebble(g, x, y, s, col, hi) {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, s, s * 0.62, 0, 0, TAU);
    g.fill();
    g.fillStyle = hi;
    g.beginPath();
    g.ellipse(x - s * 0.22, y - s * 0.18, s * 0.38, s * 0.2, 0, 0, TAU);
    g.fill();
  }

  // 有机色斑：几个歪椭圆叠成一块，边缘参差。
  // 不用径向渐变——渐变叠 50 块之后会糊成一片烟，看不出笔触。
  function softBlob(g, x, y, r, col, alpha, h) {
    g.fillStyle = hexA(col, alpha);
    for (let i = 0; i < 4; i++) {
      const a = rnd(h, 10 + i) * TAU;
      const d = r * (0.1 + rnd(h, 20 + i) * 0.4);
      g.beginPath();
      g.ellipse(
        x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7,
        r * (0.5 + rnd(h, 30 + i) * 0.45), r * (0.34 + rnd(h, 40 + i) * 0.32),
        a, 0, TAU
      );
      g.fill();
    }
  }

  // 一根草叶：暗底一笔 + 左上半截亮一笔 → 有厚度的双色叶，不是一个色条
  function blade(g, x, y, len, ang, colDark, colLite, w) {
    const tx = x + Math.sin(ang) * len;
    const ty = y - Math.cos(ang) * len;
    const mx = x + Math.sin(ang) * len * 0.5 - Math.cos(ang) * len * 0.12;
    const my = y - len * 0.56;
    g.lineCap = 'round';
    g.strokeStyle = colDark;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(mx, my, tx, ty);
    g.stroke();
    g.strokeStyle = colLite;
    g.lineWidth = Math.max(1, w * 0.5);
    g.beginPath();
    g.moveTo(x + (mx - x) * 0.5 - 0.5, y + (my - y) * 0.5);
    g.quadraticCurveTo(mx - 0.5, my + (ty - my) * 0.3, tx - 0.4, ty);
    g.stroke();
  }

  // 草簇：根部一团暗影 + 5~7 根叶，扇形偏左上（光源左上）
  function grassClump(g, x, y, s, T, h) {
    const body = mix(T.baseLo, T.ink, 0.12);        // 叶身：比底色深一档就够
    const lite = mix(T.baseHi, T.cream, 0.2);       // 叶尖：亮一档
    g.fillStyle = hexA(mix(T.baseLo, T.ink, 0.3), 0.12);
    g.beginPath();
    g.ellipse(x, y + 0.5, s * 0.85, s * 0.22, 0, 0, TAU);
    g.fill();
    const n = 5 + (h % 3);
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n - 1) - 0.5) * 1.5 + (rnd(h, i) - 0.5) * 0.35;
      const len = s * (0.75 + rnd(h, 8 + i) * 0.6);
      const bx = x + (rnd(h, 20 + i) - 0.5) * s * 0.55;
      blade(g, bx, y, len, a, body, lite, Math.max(1, s * 0.16));
    }
  }

  // 小草：一笔一根、三根一簇。3~6px 的小 V，靠密度和双色出"草皮"，不靠单根大草叶。
  function miniTuft(g, x, y, s, colDark, colLite, h) {
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.5 + (rnd(h, 10 + k) - 0.5) * 0.3;
      const len = s * (0.75 + rnd(h, 20 + k) * 0.5);
      g.strokeStyle = rnd(h, 30 + k) < 0.35 ? colLite : colDark;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len);
      g.stroke();
    }
  }

  // 草皮细纹砖：192px 平铺。整张图靠它铺密度，逐格撒草太贵。
  function turfTile(size, T, seed) {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    const dark = mix(T.baseLo, T.ink, 0.15);
    const lite = mix(T.baseHi, T.cream, 0.25);
    const n = Math.round((size * size) / 70);
    for (let i = 0; i < n; i++) {
      const h = hash(seed + 61, i);
      miniTuft(g, rnd(h, 0) * size, rnd(h, 1) * size, 2.2 + rnd(h, 2) * 2.6, dark, lite, h);
    }
    return c;
  }

  function turf(g, W, H, T, seed) {
    const pat = g.createPattern(turfTile(192, T, seed), 'repeat');
    if (!pat) return;
    g.save();
    g.globalAlpha = 0.62;
    g.fillStyle = pat;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // 裂缝：两三段折线，深色低透明（岩地/石板用）
  function crack(g, x, y, len, ang, col, h, w) {
    g.strokeStyle = col;
    g.lineWidth = w || 1;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    let cx = x, cy = y, a = ang;
    const segs = 2 + (h % 3);
    for (let i = 0; i < segs; i++) {
      a += (rnd(h, i) - 0.5) * 0.9;
      cx += Math.cos(a) * (len / segs);
      cy += Math.sin(a) * (len / segs) * 0.8;
      g.lineTo(cx, cy);
    }
    g.stroke();
  }


  // 大尺度色斑：整片地面的明暗起伏，防止"平涂一块色"
  function blotches(g, W, H, cols, n, seed, alpha) {
    const a = alpha === undefined ? 0.16 : alpha;
    for (let i = 0; i < n; i++) {
      const h = hash(seed, i);
      const r = 48 + rnd(h, 0) * 150;
      const cx = rnd(h, 1) * W;
      const cy = rnd(h, 2) * H;
      const col = cols[h % cols.length];
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, hexA(col, a));
      grd.addColorStop(1, hexA(col, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.fill();
    }
  }

  /* ================= 底材 ================= */

  function paintBase(g, W, H, px, T, base, seed, dens) {
    const cells = ((W * H) / (px * px)) * (dens || 1);
    if (base === 'rock') paintRock(g, W, H, px, T, seed, cells);
    else if (base === 'soil') paintSoil(g, W, H, px, T, seed, cells);
    else paintGrass(g, W, H, px, T, seed, cells);
  }

  // 草地：低频明暗 + 草皮细纹 + 草簇。三样缺一个就回到"一块绿布"。
  function paintGrass(g, W, H, px, T, seed, cells) {
    g.fillStyle = T.base;
    g.fillRect(0, 0, W, H);

    // ① 低频明暗：块要比一格大（0.5~1.6 格），随机撒；太整齐就成了棋盘格。
    //    亮斑只用"偏亮的草绿"，不用 baseHi 原色——原色撒多了像一层雾
    for (let i = 0; i < Math.round(cells * 0.8); i++) {
      const h = hash(seed + 3, i);
      softBlob(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.45 + rnd(h, 2) * 1.15),
        rnd(h, 3) < 0.45 ? mix(T.baseHi, T.base, 0.45) : T.baseLo, 0.12 + rnd(h, 4) * 0.09, h);
    }

    // ② 草皮细纹：96px 小砖平铺。靠它给"毛毯"的密度，
    //    不靠逐格撒草——576 格逐格撒草要几万笔，进房间会卡一下
    turf(g, W, H, T, seed + 5);

    // ③ 草簇：0.9 簇/格，比细纹大一圈，打破平铺感
    for (let i = 0; i < Math.round(cells * 0.9); i++) {
      const h = hash(seed + 17, i);
      grassClump(g, rnd(h, 0) * W, 6 + rnd(h, 1) * (H - 12),
        px * (0.13 + rnd(h, 2) * 0.12), T, h);
    }

    // ④ 小花 / 小石：打散重复感，密度低，多了像撒糖
    for (let i = 0; i < Math.round(cells * 0.08); i++) {
      const h = hash(seed + 77, i);
      g.fillStyle = [T.cream, '#E9A8B4', T.path][h % 3];
      g.beginPath();
      g.arc(rnd(h, 0) * W, rnd(h, 1) * H, 1.5 + rnd(h, 2) * 1.5, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < Math.round(cells * 0.14); i++) {
      const h = hash(seed + 91, i);
      g.globalAlpha = 0.5;
      pebble(g, rnd(h, 0) * W, rnd(h, 1) * H, 1.5 + rnd(h, 2) * 1.5, T.stoneLo, T.stone);
      g.globalAlpha = 1;
    }
  }

  // 泥土：踩实的暖土 + 干草茬 + 碎石 + 裂纹
  function paintSoil(g, W, H, px, T, seed, cells) {
    g.fillStyle = T.soil;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < Math.round(cells * 0.45); i++) {
      const h = hash(seed + 5, i);
      softBlob(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.6 + rnd(h, 2) * 1.9),
        rnd(h, 3) < 0.5 ? T.soilHi : T.soilLo, 0.13 + rnd(h, 4) * 0.1, h);
    }

    // 干草茬：草色掺土色，稀疏几簇，说明"这地方以前是草地"
    const dry = {
      baseLo: mix(T.soilLo, T.baseLo || T.soilLo, 0.5),
      baseHi: mix(T.soilHi, T.baseHi || T.soilHi, 0.45),
      ink: T.ink,
    };
    for (let i = 0; i < Math.round(cells * 0.3); i++) {
      const h = hash(seed + 13, i);
      grassClump(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.12 + rnd(h, 2) * 0.1), dry, h);
    }

    for (let i = 0; i < Math.round(cells * 14); i++) {
      const h = hash(seed + 29, i);
      g.fillStyle = hexA(rnd(h, 3) < 0.5 ? T.soilLo : T.soilHi, 0.35 + rnd(h, 4) * 0.3);
      g.beginPath();
      g.arc(rnd(h, 0) * W, rnd(h, 1) * H, 0.6 + rnd(h, 2) * 1.2, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < Math.round(cells * 0.9); i++) {
      const h = hash(seed + 31, i);
      g.globalAlpha = 0.75;
      pebble(g, rnd(h, 0) * W, rnd(h, 1) * H, 1.6 + rnd(h, 2) * 2.2, T.soilLo, T.soilHi);
      g.globalAlpha = 1;
    }
    for (let i = 0; i < Math.round(cells * 0.3); i++) {
      const h = hash(seed + 37, i);
      crack(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.2 + rnd(h, 2) * 0.35),
        rnd(h, 3) * TAU, hexA(T.soilLo, 0.55), h, 1);
    }
  }

  // 岩地：扁石片 + 缝 + 裂纹。石片要"左上亮、右下暗"，否则是灰纸。
  function paintRock(g, W, H, px, T, seed, cells) {
    // 底 = 缝的颜色（比石头暗），石片才有"嵌在地上"的层次
    g.fillStyle = mix(T.rock, T.rockLo, 0.62);
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < Math.round(cells * 0.6); i++) {
      const h = hash(seed + 2, i);
      softBlob(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.6 + rnd(h, 2) * 2),
        rnd(h, 3) < 0.5 ? T.rockHi : T.rockLo, 0.12 + rnd(h, 4) * 0.1, h);
    }

    const plates = Math.round(cells * 1.7);
    for (let i = 0; i < plates; i++) {
      const h = hash(seed + 7, i);
      const x = rnd(h, 0) * W, y = rnd(h, 1) * H;
      const r = px * (0.11 + rnd(h, 2) * 0.19);
      const k = 5 + (h % 3);
      const lite = mix(T.rock, T.rockHi, 0.6 + rnd(h, 3) * 0.5);
      const drk = mix(T.rock, T.rockLo, 0.2 + rnd(h, 4) * 0.5);
      g.beginPath();
      for (let v = 0; v < k; v++) {
        const a = (v / k) * TAU + rnd(h, 10 + v) * 0.4;
        const rad = r * (0.62 + rnd(h, 20 + v) * 0.5);
        const pxx = x + Math.cos(a) * rad, pyy = y + Math.sin(a) * rad * 0.68;
        v ? g.lineTo(pxx, pyy) : g.moveTo(pxx, pyy);
      }
      g.closePath();
      const grd = g.createLinearGradient(x - r, y - r, x + r, y + r);
      grd.addColorStop(0, lite);
      grd.addColorStop(1, drk);
      g.fillStyle = grd;
      g.fill();
      g.strokeStyle = hexA(T.ink, 0.18);
      g.lineWidth = 1;
      g.stroke();
    }

    for (let i = 0; i < Math.round(cells * 0.55); i++) {
      const h = hash(seed + 43, i);
      crack(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.25 + rnd(h, 2) * 0.5),
        rnd(h, 3) * TAU, hexA(T.ink, 0.22), h, 1.2);
    }
    for (let i = 0; i < Math.round(cells * 8); i++) {
      const h = hash(seed + 47, i);
      g.fillStyle = hexA(rnd(h, 3) < 0.5 ? T.rockHi : T.rockLo, 0.3 + rnd(h, 4) * 0.35);
      g.beginPath();
      g.arc(rnd(h, 0) * W, rnd(h, 1) * H, 0.6 + rnd(h, 2) * 1.3, 0, TAU);
      g.fill();
    }
  }

  /* ================= 覆盖材质（整片画，再用遮罩裁） ================= */

  function paintPath(g, W, H, px, T) {
    g.fillStyle = T.path;
    g.fillRect(0, 0, W, H);
    const cells = (W * H) / (px * px);
    // 踩实的深色泥印（小块，别铺成大花）
    for (let i = 0; i < Math.round(cells * 0.8); i++) {
      const h = hash(61, i);
      softBlob(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.22 + rnd(h, 2) * 0.55),
        rnd(h, 3) < 0.5 ? T.pathLo : T.soilHi, 0.16 + rnd(h, 4) * 0.12, h);
    }
    // 碎石：暗底 + 亮顶，一路撒（路的材质感主要靠它）
    for (let i = 0; i < Math.round(cells * 4); i++) {
      const h = hash(31, i);
      g.globalAlpha = 0.85;
      pebble(g, rnd(h, 0) * W, rnd(h, 1) * H, 1.4 + rnd(h, 2) * 2.6, T.pathLo, T.cream);
      g.globalAlpha = 1;
    }
    // 细沙点
    for (let i = 0; i < Math.round(cells * 20); i++) {
      const h = hash(33, i);
      g.fillStyle = hexA(rnd(h, 3) < 0.5 ? T.pathLo : T.cream, 0.3 + rnd(h, 4) * 0.3);
      g.beginPath();
      g.arc(rnd(h, 0) * W, rnd(h, 1) * H, 0.5 + rnd(h, 2) * 1.1, 0, TAU);
      g.fill();
    }
  }

  function paintBrick(g, W, H, px, T) {
    g.fillStyle = T.mortar;
    g.fillRect(0, 0, W, H);
    // 一块砖 1×0.5 格（俯视 48×24）→ 投影后是 2:1 的等距砖，大小才看得出是砖
    const bw = px, bh = px / 2;
    let row = 0;
    for (let y = -bh; y < H + bh; y += bh, row++) {
      const off = (row % 2) ? bw / 2 : 0;
      for (let x = -bw; x < W + bw; x += bw) {
        const h = hash((x / bw) | 0, row);
        // 每块砖自己一条左上→右下渐变：拼起来就是"每块都有高光边"
        const grd = g.createLinearGradient(x + off, y, x + off + bw, y + bh);
        grd.addColorStop(0, mix(T.brick[h % 3], T.cream, 0.22));
        grd.addColorStop(1, mix(T.brick[h % 3], T.ink, 0.18));
        g.fillStyle = grd;
        rr(g, x + off + 1.2, y + 1.2, bw - 2.4, bh - 2.4, 3);
        g.fill();
        if (h % 7 === 0) {                       // 偶尔一块缺角/脏砖
          g.fillStyle = hexA(T.ink, 0.1);
          rr(g, x + off + 1.2, y + 1.2, bw - 2.4, bh - 2.4, 3);
          g.fill();
        }
      }
    }
  }

  function paintSlab(g, W, H, px, T) {
    // 缝比石板暗一档，板与板才分得开；但不能太黑，主城的石板要亮
    g.fillStyle = mix(T.stoneLo, T.ink, 0.12);
    g.fillRect(0, 0, W, H);
    const cell = px * 0.55;
    let row = 0;
    for (let y = -cell; y < H + cell; y += cell * 0.86, row++) {
      const off = (row % 2) ? cell * 0.5 : 0;
      for (let x = -cell; x < W + cell; x += cell) {
        const h = hash(x | 0, row * 97);
        const w = cell * (0.82 + rnd(h, 0) * 0.16);
        const hh = cell * (0.72 + rnd(h, 1) * 0.14);
        const base = mix(T.stone, T.stoneLo, 0.1 + rnd(h, 2) * 0.5);
        const grd = g.createLinearGradient(x + off, y, x + off + w, y + hh);
        grd.addColorStop(0, mix(base, T.cream, 0.16));
        grd.addColorStop(1, mix(base, T.ink, 0.12));
        g.fillStyle = grd;
        rr(g, x + off + 1.4, y + 1.4, w - 2.8, hh - 2.8, 4 + rnd(h, 3) * 3);
        g.fill();
        // 轻微磨损：板面上几个暗点
        if (rnd(h, 4) < 0.45) {
          g.fillStyle = hexA(T.ink, 0.12);
          g.beginPath();
          g.ellipse(x + off + w * (0.3 + rnd(h, 5) * 0.4), y + hh * (0.3 + rnd(h, 6) * 0.4),
            w * 0.1, hh * 0.08, rnd(h, 7), 0, TAU);
          g.fill();
        }
      }
    }
  }

  function paintWater(g, W, H, px, T) {
    const cells = (W * H) / (px * px);
    const grd = g.createLinearGradient(0, 0, W * 0.35, H);
    grd.addColorStop(0, mix(T.water, T.waterHi, 0.18));
    grd.addColorStop(0.6, T.water);
    grd.addColorStop(1, T.waterLo);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    // 深色水团：水不能是一块纯色，深浅说明"底下有东西"
    for (let i = 0; i < Math.round(cells * 0.35); i++) {
      const h = hash(41, i);
      softBlob(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.5 + rnd(h, 2) * 1.4),
        T.waterLo, 0.2 + rnd(h, 3) * 0.12, h);
    }

    // 波纹：每条亮弧下面压一条暗弧（半个像素的空气感）
    const rn = Math.round(cells * 7);
    for (let i = 0; i < rn; i++) {
      const h = hash(43, i);
      const x = rnd(h, 0) * W, y = rnd(h, 1) * H;
      const w = px * (0.16 + rnd(h, 2) * 0.3);
      const lift = 1 + rnd(h, 3) * 1.6;
      g.lineCap = 'round';
      g.strokeStyle = hexA(T.waterLo, 0.3);
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(x, y + 1.6);
      g.quadraticCurveTo(x + w * 0.5, y + 1.6 - lift, x + w, y + 1.6);
      g.stroke();
      g.strokeStyle = hexA(T.waterHi, 0.45 + rnd(h, 4) * 0.35);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w * 0.5, y - lift, x + w, y);
      g.stroke();
    }

    // 亮点：水面反光，稀疏
    for (let i = 0; i < Math.round(cells * 0.8); i++) {
      const h = hash(45, i);
      g.fillStyle = hexA(T.cream || T.waterHi, 0.4 + rnd(h, 2) * 0.3);
      g.beginPath();
      g.ellipse(rnd(h, 0) * W, rnd(h, 1) * H, 1 + rnd(h, 3) * 1.8, 0.7 + rnd(h, 4) * 0.7, 0, 0, TAU);
      g.fill();
    }
  }

  function paintMud(g, W, H, px, T) {
    const cells = (W * H) / (px * px);
    g.fillStyle = T.mud;
    g.fillRect(0, 0, W, H);
    // 湿泥：大块深色 + 一点反光，不然和土路分不开
    for (let i = 0; i < Math.round(cells * 0.4); i++) {
      const h = hash(57, i);
      softBlob(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.5 + rnd(h, 2) * 1.5),
        T.mudLo, 0.22 + rnd(h, 3) * 0.14, h);
    }
    for (let i = 0; i < Math.round(cells * 2.2); i++) {
      const h = hash(59, i);
      g.fillStyle = hexA(mix(T.mudLo, T.ink, 0.2), 0.5);
      g.beginPath();
      g.ellipse(rnd(h, 0) * W, rnd(h, 1) * H, 2 + rnd(h, 2) * 4, 1.2 + rnd(h, 3) * 2, 0, 0, TAU);
      g.fill();
    }
    // 泥面反光：左上一条短亮弧
    for (let i = 0; i < Math.round(cells * 0.9); i++) {
      const h = hash(63, i);
      const x = rnd(h, 0) * W, y = rnd(h, 1) * H, w = 4 + rnd(h, 2) * 7;
      g.strokeStyle = hexA(T.soilHi, 0.3 + rnd(h, 3) * 0.2);
      g.lineWidth = 1.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w * 0.5, y - 1.4, x + w, y);
      g.stroke();
    }
  }

  // 海：比池塘深，波纹更长更稀。地图外侧用它，而不是一圈石板框
  function paintSea(g, W, H, px, T) {
    const cells = (W * H) / (px * px);
    const base = T.sea || T.water, lo = T.seaLo || T.waterLo, hi = T.seaHi || T.waterHi;
    const grd = g.createLinearGradient(0, 0, W * 0.3, H);
    grd.addColorStop(0, mix(base, hi, 0.16));
    grd.addColorStop(0.55, base);
    grd.addColorStop(1, lo);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < Math.round(cells * 0.45); i++) {
      const h = hash(71, i);
      softBlob(g, rnd(h, 0) * W, rnd(h, 1) * H, px * (0.8 + rnd(h, 2) * 2),
        lo, 0.2 + rnd(h, 3) * 0.14, h);
    }

    const rn = Math.round(cells * 3.4);
    for (let i = 0; i < rn; i++) {
      const h = hash(73, i);
      const x = rnd(h, 0) * W, y = rnd(h, 1) * H;
      const w = px * (0.3 + rnd(h, 2) * 0.55);
      const lift = 1.6 + rnd(h, 3) * 2.4;
      g.lineCap = 'round';
      g.strokeStyle = hexA(lo, 0.34);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y + 2);
      g.quadraticCurveTo(x + w * 0.5, y + 2 - lift, x + w, y + 2);
      g.stroke();
      g.strokeStyle = hexA(hi, 0.34 + rnd(h, 4) * 0.28);
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + w * 0.5, y - lift, x + w, y);
      g.stroke();
    }
  }

  /* ================= 立牌：山崖（边界用，不是贴纸） ================= */
  // 一块等距岩台：顶面是菱形（草沿 + 岩石顶），前面两个侧面往下落。
  // 落地点 = 底边中点，跟 sprite 立牌的锚点一致（three 里脚底贴地）。

  function mountainOld(variant, theme) {
    const T = PALETTES[theme] || PALETTES.field;
    const W = 150, H = 210;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const h = hash(variant | 0, 91);
    const wid = 0.8 + rnd(h, 0) * 0.5;
    const tall = 0.5 + rnd(h, 1) * 1.1;     // 高低差要敢拉开，一样高就成城墙
    const cx = W / 2;
    const baseY = H - 8;
    const tw = 104 * wid;
    const th = tw / 2;
    const bodyH = 74 * tall;
    const topCy = baseY - bodyH - th / 2;

    const L = { x: cx - tw / 2, y: topCy };
    const U = { x: cx, y: topCy - th / 2 };
    const R = { x: cx + tw / 2, y: topCy };
    const D = { x: cx, y: topCy + th / 2 };

    const rock = T.rock || T.stoneLo;
    const rockLo = T.rockLo || T.stoneLo;
    const dark = (col, t) => mix(col, '#2a2320', t);
    const lite = (col, t) => mix(col, '#fff9ee', t);

    // 左前侧（受光中等）
    g.fillStyle = rock;
    g.beginPath();
    g.moveTo(L.x, L.y);
    g.lineTo(D.x, D.y);
    g.lineTo(D.x, baseY);
    g.lineTo(L.x, baseY - th / 2);
    g.closePath();
    g.fill();

    // 右前侧（背光，最暗）
    g.fillStyle = dark(rockLo, 0.22);
    g.beginPath();
    g.moveTo(D.x, D.y);
    g.lineTo(R.x, R.y);
    g.lineTo(R.x, baseY - th / 2);
    g.lineTo(D.x, baseY);
    g.closePath();
    g.fill();

    // 岩层：侧面横折线
    g.strokeStyle = hexA(dark(rockLo, 0.45), 0.5);
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const t = 0.18 + i * 0.26 + rnd(h, 4 + i) * 0.08;
      const yl = L.y + (baseY - th / 2 - L.y) * t;
      const yd = D.y + (baseY - D.y) * t;
      g.beginPath();
      g.moveTo(L.x + tw * 0.04, yl);
      g.lineTo(D.x, yd);
      g.stroke();
      g.beginPath();
      g.moveTo(D.x, yd);
      g.lineTo(R.x - tw * 0.04, yl);
      g.stroke();
    }
    // 裂缝
    for (let i = 0; i < 2; i++) {
      const bx = cx + (rnd(h, 8 + i) - 0.5) * tw * 0.5;
      const by = topCy + th * 0.4;
      g.strokeStyle = hexA(dark(rockLo, 0.6), 0.55);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + (rnd(h, 10 + i) - 0.5) * 12, by + bodyH * 0.4);
      g.lineTo(bx + (rnd(h, 12 + i) - 0.5) * 16, baseY - 6);
      g.stroke();
    }

    // 顶面：岩石顶
    g.fillStyle = lite(rock, 0.18);
    g.beginPath();
    g.moveTo(U.x, U.y); g.lineTo(R.x, R.y); g.lineTo(D.x, D.y); g.lineTo(L.x, L.y);
    g.closePath();
    g.fill();
    // 草沿：沿菱形外圈描两笔（深绿在外、亮绿在内），山顶长草
    const grass = T.base;
    g.lineJoin = 'round';
    g.strokeStyle = T.baseLo || grass;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(U.x, U.y); g.lineTo(R.x, R.y); g.lineTo(D.x, D.y); g.lineTo(L.x, L.y);
    g.closePath();
    g.stroke();
    g.strokeStyle = grass;
    g.lineWidth = 2;
    g.stroke();

    // 顶上撒几簇草
    for (let i = 0; i < 3; i++) {
      const a = rnd(h, 20 + i) * TAU;
      const rad = th * (0.15 + rnd(h, 24 + i) * 0.45);
      tuft(g, cx + Math.cos(a) * rad, topCy + Math.sin(a) * rad * 0.9, 6 + rnd(h, 28 + i) * 4, T.baseLo, 0.2);
    }

    // 山脚碎石
    for (let i = 0; i < 4; i++) {
      const x = cx + (rnd(h, 30 + i) - 0.5) * tw * 0.9;
      pebble(g, x, baseY - 3 - rnd(h, 34 + i) * 6, 2 + rnd(h, 38 + i) * 3, dark(rockLo, 0.1), lite(rock, 0.3));
    }

    return c;
  }

  /* ================= 立牌：山（边界用） ================= */
  // 圆丘形山包：底是等距椭圆、往上收成不规则圆顶、山顶一条起伏的草甸。
  // 之所以不做"方块岩台"——方块并排会连成一圈城墙，圆丘重叠才像山脊。

  function mountain(variant, theme) {
    const T = PALETTES[theme] || PALETTES.field;
    const W = 190, H = 240;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const h = hash(variant | 0, 91);
    const bw = 140 * (0.82 + rnd(h, 0) * 0.42);       // 底宽
    const height = 132 * (0.5 + rnd(h, 1) * 0.95);    // 敢拉开：一半山包，一半小丘
    const cx = W / 2;
    const baseY = H - 12;
    const bh = bw * 0.34;
    const footY = baseY - bh * 0.35;
    const peakY = footY - height;

    const dark = (col, t) => mix(col, '#2a2320', t);
    const lite = (col, t) => mix(col, '#fff9ee', t);
    const rock = dark(T.rock || T.stoneLo, 0.14);   // 山必须比草地暗，浅色会"浮"到前面来
    const rockLo = T.rockLo || T.stoneLo;

    // 山体轮廓：多边形折面，不用圆弧——圆弧画出来一定是"蛋"
    const jit = (i) => (rnd(h, 200 + i) - 0.5);
    function body() {
      g.beginPath();
      g.moveTo(cx - bw / 2, footY);
      g.lineTo(cx - bw * 0.42, peakY + height * 0.58 + jit(1) * height * 0.12);
      g.lineTo(cx - bw * 0.28, peakY + height * 0.24 + jit(2) * height * 0.08);
      g.lineTo(cx - bw * 0.12, peakY + jit(3) * height * 0.07);
      g.lineTo(cx + bw * 0.05, peakY + height * 0.20 + jit(4) * height * 0.1);
      g.lineTo(cx + bw * 0.22, peakY + height * 0.04 + jit(5) * height * 0.07);
      g.lineTo(cx + bw * 0.40, peakY + height * 0.5 + jit(6) * height * 0.12);
      g.lineTo(cx + bw / 2, footY);
      g.ellipse(cx, footY, bw / 2, bh * 0.5, 0, 0, Math.PI);
      g.closePath();
    }

    // 接地椭圆（软影，跟别的立牌同一套左侧光）
    g.fillStyle = hexA(dark(rockLo, 0.55), 0.3);
    g.beginPath();
    g.ellipse(cx, footY + bh * 0.12, bw * 0.54, bh * 0.58, 0, 0, TAU);
    g.fill();

    g.save();
    body();
    g.clip();

    // 岩体：左亮右暗的横向渐变
    const grd = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
    grd.addColorStop(0, lite(rock, 0.2));
    grd.addColorStop(0.5, rock);
    grd.addColorStop(1, dark(rockLo, 0.34));
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    // 棱线：从峰顶下来的折面分界，给崖壁一点"石头块面"感
    g.strokeStyle = hexA(dark(rockLo, 0.62), 0.5);
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const sx = cx - bw * 0.28 + i * bw * 0.28;
      const sy = peakY + height * (0.1 + i * 0.1);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(sx + (rnd(h, 300 + i) - 0.5) * bw * 0.16, footY - 6);
      g.stroke();
    }
    // 岩石层次：斜向的层理
    g.strokeStyle = hexA(dark(rockLo, 0.5), 0.3);
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const y = peakY + height * (0.42 + i * 0.16);
      g.beginPath();
      g.moveTo(0, y + 8);
      g.quadraticCurveTo(W * 0.5, y - 10, W, y + 6);
      g.stroke();
    }

    // 山顶草甸：一条起伏的绿色
    const waveBase = peakY + height * (0.30 + rnd(h, 2) * 0.18);
    const grass = T.base;
    g.fillStyle = grass;
    g.beginPath();
    g.moveTo(0, peakY - 40);
    g.lineTo(W, peakY - 40);
    g.lineTo(W, waveBase);
    for (let x = W; x >= 0; x -= 12) {
      const w2 = Math.sin(x * 0.052 + (h % 11)) * 10 + Math.cos(x * 0.14 + 1.3) * 5;
      g.lineTo(x, waveBase + w2);
    }
    g.closePath();
    g.fill();
    // 草甸暗部（下沿压一圈深绿，草才有厚度）
    g.strokeStyle = hexA(T.baseLo || grass, 0.55);
    g.lineWidth = 4;
    g.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const w2 = Math.sin(x * 0.052 + (h % 11)) * 10 + Math.cos(x * 0.14 + 1.3) * 5;
      x ? g.lineTo(x, waveBase + w2) : g.moveTo(x, waveBase + w2);
    }
    g.stroke();

    // 草甸上的亮斑
    for (let i = 0; i < 5; i++) {
      const x = rnd(h, 20 + i) * W;
      const y = peakY + rnd(h, 30 + i) * (waveBase - peakY) * 0.9;
      g.fillStyle = hexA(T.baseHi || lite(grass, 0.2), 0.7);
      g.beginPath();
      g.ellipse(x, y, 10 + rnd(h, 40 + i) * 16, 4 + rnd(h, 50 + i) * 6, 0, 0, TAU);
      g.fill();
    }

    // 露出岩面的碎石（草甸里几个灰点）
    for (let i = 0; i < 3; i++) {
      const x = rnd(h, 60 + i) * W;
      const y = peakY + height * (0.12 + rnd(h, 70 + i) * 0.2);
      g.fillStyle = hexA(dark(rockLo, 0.2), 0.8);
      g.beginPath();
      g.ellipse(x, y, 6 + rnd(h, 80 + i) * 8, 3 + rnd(h, 90 + i) * 4, 0, 0, TAU);
      g.fill();
    }
    g.restore();

    // 山脚碎石（在轮廓外，落在草地上）
    for (let i = 0; i < 5; i++) {
      const x = cx + (rnd(h, 100 + i) - 0.5) * bw * 1.05;
      pebble(g, x, footY + bh * 0.3 + rnd(h, 110 + i) * 5, 2 + rnd(h, 120 + i) * 3, dark(rockLo, 0.15), lite(rock, 0.35));
    }

    return c;
  }

  /* ================= 立牌：崖壁（边界用，一整块） ================= */
  // 参照主人给的参考图：竖向柱石挤在一起、石块之间贴合、底部一圈软草坡、
  // 石顶长草、前面挂藤蔓。**一整块**，不是单格岩台——单格摆出来只能是一排墩子。

  const CLIFF_PAL = {
    lite: '#E7DBBA',   // 受光面（暖沙黄，亮）
    mid: '#C0AA7C',
    dark: '#7E6A46',   // 背光面要够暗，否则石头没有块面
    deep: '#57482C',   // 石缝
    shadow: '#5A6E8C', // 偏蓝的软影
  };

  function cliffOld(variant, theme) {
    const T = PALETTES[theme] || PALETTES.field;
    const W = 380, H = 330;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const h = hash(variant | 0, 133);
    const cx = W / 2;
    const baseY = H - 52;
    const C = CLIFF_PAL;
    const grass = T.base;
    const grassHi = T.baseHi || mix(grass, '#ffffff', 0.22);
    const grassLo = T.baseLo || mix(grass, '#000000', 0.22);

    // 底部软影（先画，压在草坡下面）
    g.fillStyle = hexA(C.shadow, 0.28);
    g.beginPath();
    g.ellipse(cx + 8, baseY + 22, 176, 40, 0, 0, TAU);
    g.fill();

    // 草坡：一个大椭圆 + 一圈小圆，叠出有机轮廓
    g.fillStyle = grass;
    g.beginPath();
    g.ellipse(cx, baseY + 12, 162, 44, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rnd(h, i) * 0.5;
      g.beginPath();
      g.ellipse(
        cx + Math.cos(a) * (96 + rnd(h, 10 + i) * 54),
        baseY + 12 + Math.sin(a) * 16,
        34 + rnd(h, 20 + i) * 28, 16 + rnd(h, 30 + i) * 12, 0, 0, TAU
      );
      g.fill();
    }

    // 柱石：先定一组，按底边 y 排序（远的先画，近的压上去）
    const n = 5 + (h % 3);
    const pillars = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const dx = (t - 0.5) * 246 + (rnd(h, 40 + i) - 0.5) * 34;
      const back = rnd(h, 70 + i) < 0.45;
      pillars.push({
        x: cx + dx,
        y: baseY + (back ? -30 : 2) + (rnd(h, 80 + i) - 0.5) * 12,
        w: 48 + rnd(h, 50 + i) * 38,
        h: (90 + rnd(h, 60 + i) * 96) * (back ? 1.3 : 1),
        back: back,
      });
    }
    pillars.sort(function (a, b) { return a.y - b.y; });

    const topOf = [];
    pillars.forEach(function (p, pi) {
      const rx = p.w / 2, ry = p.w / 4;
      const topY = p.y - p.h;
      const hh = hash(variant | 0, 300 + pi);

      // 正面：左亮右暗
      const grd = g.createLinearGradient(p.x - rx, 0, p.x + rx, 0);
      grd.addColorStop(0, C.lite);
      grd.addColorStop(0.42, C.mid);
      grd.addColorStop(1, C.dark);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(p.x - rx, topY);
      g.lineTo(p.x - rx, p.y - ry);
      g.ellipse(p.x, p.y - ry, rx, ry, 0, Math.PI, 0, true);
      g.lineTo(p.x + rx, topY);
      g.closePath();
      g.fill();

      // 竖向棱线：石头是块面，不是圆柱
      g.strokeStyle = hexA(C.deep, 0.28);
      g.lineWidth = 1.6;
      for (let k = -1; k <= 1; k += 2) {
        const lx = p.x + k * rx * (0.3 + rnd(hh, k + 2) * 0.3);
        g.beginPath();
        g.moveTo(lx, topY + ry * 0.6);
        g.lineTo(lx + k * 3, p.y - ry * 0.8);
        g.stroke();
      }

      // 顶面
      g.fillStyle = C.lite;
      g.beginPath();
      g.ellipse(p.x, topY, rx, ry, 0, 0, TAU);
      g.fill();
      g.fillStyle = hexA('#ffffff', 0.18);
      g.beginPath();
      g.ellipse(p.x - rx * 0.2, topY - ry * 0.2, rx * 0.5, ry * 0.5, 0, 0, TAU);
      g.fill();

      // 石顶长草（越高的柱越大概率长草）
      const tall = p.h > 150;
      if (tall || rnd(hh, 9) < 0.35) {
        g.fillStyle = grass;
        g.beginPath();
        g.ellipse(p.x, topY - ry * 0.1, rx * 0.86, ry * 0.8, 0, 0, TAU);
        g.fill();
        g.fillStyle = hexA(grassHi, 0.7);
        g.beginPath();
        g.ellipse(p.x + rx * 0.14, topY - ry * 0.24, rx * 0.42, ry * 0.36, 0, 0, TAU);
        g.fill();
      }
      topOf.push({ x: p.x, y: topY, rx: rx, ry: ry, tall: tall });
    });

    // 石缝：柱与柱之间的深处压暗，让石块"挤"在一起
    pillars.forEach(function (p, pi) {
      if (pi === 0) return;
      const rx = p.w / 2;
      g.strokeStyle = hexA(C.deep, 0.34);
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(p.x - rx, p.y - 8);
      g.quadraticCurveTo(p.x - rx * 0.6, p.y - p.h * 0.45, p.x - rx * 0.2, p.y - p.h * 0.8);
      g.stroke();
    });

    // 藤蔓：从高柱的顶面垂下来
    topOf.forEach(function (t, i) {
      if (!t.tall || i % 2) return;
      const x0 = t.x + t.rx * (0.4 + rnd(h, 400 + i) * 0.5);
      const len = 40 + rnd(h, 410 + i) * 60;
      g.strokeStyle = grassLo;
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, t.y + 2);
      g.bezierCurveTo(x0 + 10, t.y + len * 0.4, x0 - 8, t.y + len * 0.7, x0 + 4, t.y + len);
      g.stroke();
      for (let k = 1; k <= 3; k++) {
        const yy = t.y + len * (k / 3.4);
        g.fillStyle = k % 2 ? grassLo : grass;
        g.beginPath();
        g.ellipse(x0 + (k % 2 ? 5 : -4), yy, 4.5, 2.6, 0.5, 0, TAU);
        g.fill();
      }
    });

    // 草坡前沿的草簇，把石头"种"进地里
    for (let i = 0; i < 9; i++) {
      const x = cx + (rnd(h, 500 + i) - 0.5) * 300;
      const y = baseY + 4 + rnd(h, 520 + i) * 22;
      tuft(g, x, y, 5 + rnd(h, 540 + i) * 4, rnd(h, 560 + i) < 0.5 ? grassLo : grassHi, 0.3);
    }

    return c;
  }

  /* 一块石头：不规则多边形顶面 + 向下的侧面，亮暗由法线决定。
     这是"岩石"和"木桩"的分界——圆柱截面画出来永远是原木。 */
  function rockPoly(cx, cy, r, n, seed) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (rnd(seed, i) - 0.5) * 0.8;
      const rr = r * (0.7 + rnd(seed, 10 + i) * 0.55);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.52 });
    }
    return pts;
  }

  function rock(g, poly, h, colLite, colMid, colDark) {
    const n = poly.length;
    let cxx = 0, cyy = 0;
    for (let i = 0; i < n; i++) { cxx += poly[i].x; cyy += poly[i].y; }
    cxx /= n; cyy /= n;

    // 底面比顶面大：石头上小下大，才有"块"的体积感；等宽直筒永远是木桩
    const spread = 1.16;
    const foot = poly.map(function (p) {
      return { x: cxx + (p.x - cxx) * spread, y: cyy + (p.y - cyy) * spread + h };
    });

    const faces = [];
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      faces.push({ a: a, b: b, fa: foot[i], fb: foot[(i + 1) % n], mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 });
    }
    faces.sort(function (p, q) { return p.my - q.my; });   // 远的先画，近的压上去

    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      let nx = f.b.y - f.a.y;
      let ny = -(f.b.x - f.a.x);
      if ((f.mx - cxx) * nx + (f.my - cyy) * ny < 0) { nx = -nx; ny = -ny; }
      const len = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= len; ny /= len;
      // 光从左上：法线越朝左上越亮
      const lit = Math.max(0, Math.min(1, 0.5 - (nx * 0.42 + ny * 0.42)));
      g.fillStyle = lit > 0.5 ? mix(colMid, colLite, (lit - 0.5) * 2) : mix(colDark, colMid, lit * 2);
      g.beginPath();
      g.moveTo(f.a.x, f.a.y);
      g.lineTo(f.b.x, f.b.y);
      g.lineTo(f.fb.x, f.fb.y);
      g.lineTo(f.fa.x, f.fa.y);
      g.closePath();
      g.fill();
      // 面边界描细线：近景下纯色平涂会"折纸"，一条深线就把块面缝起来
      g.strokeStyle = hexA(colDark, 0.22);
      g.lineWidth = 1;
      g.stroke();
    }

    // 顶面：比侧面稍暗一点，别像"切开的木头顶"
    g.fillStyle = mix(colLite, colMid, 0.28);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const p = poly[i];
      i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y);
    }
    g.closePath();
    g.fill();
    // 顶面边缘压一圈暗：石头顶部才有厚度，不是一块平板
    g.strokeStyle = hexA(colDark, 0.3);
    g.lineWidth = 2;
    g.stroke();
  }

  /* ================= 崖壁：优先用 AI 精灵 =================
     主人在 ComfyUI 里出的洋红底图 → key-magenta.py 抠好 → 这里加载。
     有就替掉程序化那一版，缺文件/加载失败自动退回程序化 cliff()，不会白屏。
     为什么要 AI：程序化那版近看是"折纸"（面纯色、面与面硬切），
     多边形的上限就在这儿；AI 只负责画，落地/缩放/排序仍然由代码管。 */

  const cliffArt = [];          // canvas，带 cliffFoot（落地点距底边多少像素）

  function setCliffSprites(imgs) {
    cliffArt.length = 0;
    (imgs || []).forEach(function (im) {
      if (!im || !im.width || !im.height) return;
      const c = makeCanvas(im.width, im.height);
      c.getContext('2d').drawImage(im, 0, 0);
      c.cliffFoot = 4;          // AI 图底下留了一点草坡，落地点基本就在底边
      cliffArt.push(c);
    });
  }

  // 落地点距 sprite 底边多少像素（程序化那版是 52）
  function cliffFoot(img) {
    if (!img) return 52;
    return typeof img.cliffFoot === 'number' ? img.cliffFoot : 52;
  }

  function cliff(variant, theme, hScale) {
    if (cliffArt.length) {
      const s = cliffArt[Math.abs(variant | 0) % cliffArt.length];
      const hs = typeof hScale === 'number' ? Math.max(0, Math.min(1, hScale)) : 0.6;
      // 整体缩放（图片没法只缩高）：矮坡 = 小一圈，高崖 = 大一圈
      const k = 0.72 + hs * 0.5;
      const w = Math.round(s.width * k), h = Math.round(s.height * k);
      const c = makeCanvas(w, h);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(s, 0, 0, w, h);
      c.cliffFoot = Math.max(2, s.cliffFoot * k);
      return c;
    }
    const HS = typeof hScale === 'number' ? hScale : 0.6;   // 0 = 矮坡，1 = 高崖
    const T = PALETTES[theme] || PALETTES.field;
    const W = 380, H = 330;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const h = hash(variant | 0, 133);
    const cx = W / 2;
    const baseY = H - 52;
    const C = CLIFF_PAL;
    const grass = T.base;
    const grassHi = T.baseHi || mix(grass, '#ffffff', 0.22);
    const grassLo = T.baseLo || mix(grass, '#000000', 0.22);

    // 底部软影
    g.fillStyle = hexA(C.shadow, 0.28);
    g.beginPath();
    g.ellipse(cx + 8, baseY + 22, 176, 40, 0, 0, TAU);
    g.fill();

    // 草坡：大椭圆 + 一圈小圆，叠出有机轮廓
    g.fillStyle = grass;
    g.beginPath();
    g.ellipse(cx, baseY + 12, 162, 44, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + rnd(h, i) * 0.5;
      g.beginPath();
      g.ellipse(
        cx + Math.cos(a) * (96 + rnd(h, 10 + i) * 54),
        baseY + 12 + Math.sin(a) * 16,
        34 + rnd(h, 20 + i) * 28, 16 + rnd(h, 30 + i) * 12, 0, 0, TAU
      );
      g.fill();
    }

    // 石头群：后面高、前面矮，横向挤在一起。整体高度由 HS 控制（高度场给）
    const rocks = [];
    const n = (HS < 0.45 ? 4 : HS < 0.8 ? 5 : 6) + (h % 2);
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const back = rnd(h, 70 + i) < 0.45;
      rocks.push({
        x: cx + (t - 0.5) * 246 + (rnd(h, 40 + i) - 0.5) * 26,
        y: baseY + (back ? -32 : 8) + (rnd(h, 80 + i) - 0.5) * 12,
        r: (50 + rnd(h, 50 + i) * 30) * (0.86 + HS * 0.22),
        h: (54 + rnd(h, 60 + i) * 76) * (back ? 1.25 : 1) * (0.5 + HS * 1.05),
        sides: 5 + ((h >>> (i + 1)) % 3),
        back: back,
      });
    }
    rocks.sort(function (a, b) { return a.y - b.y; });

    const tops = [];
    rocks.forEach(function (rk, i) {
      const seed = hash(variant | 0, 200 + i * 13);
      const poly = rockPoly(rk.x, rk.y - rk.h, rk.r, rk.sides, seed);
      rock(g, poly, rk.h, C.lite, C.mid, C.dark);

      // 顶面偏暖的高光边
      g.strokeStyle = hexA('#ffffff', 0.22);
      g.lineWidth = 1.6;
      g.beginPath();
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k];
        k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y);
      }
      g.closePath();
      g.stroke();

      // 裂缝：侧面一条折线
      const f = { x: rk.x + (rnd(seed, 3) - 0.5) * rk.r, y: rk.y - rk.h * 0.7 };
      g.strokeStyle = hexA(C.deep, 0.35);
      g.lineWidth = 1.8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(f.x, f.y);
      g.lineTo(f.x + (rnd(seed, 4) - 0.5) * 14, f.y + rk.h * 0.45);
      g.lineTo(f.x + (rnd(seed, 5) - 0.5) * 20, rk.y - 4);
      g.stroke();

      tops.push({ x: rk.x, y: rk.y - rk.h, r: rk.r, tall: rk.h > 130, seed: seed });
    });

    // 石顶长草
    tops.forEach(function (t) {
      if (!t.tall && rnd(t.seed, 7) > 0.35) return;
      const p = rockPoly(t.x, t.y - 2, t.r * 0.82, 6, hash(t.seed, 9));
      g.fillStyle = grass;
      g.beginPath();
      for (let k = 0; k < p.length; k++) {
        k ? g.lineTo(p[k].x, p[k].y) : g.moveTo(p[k].x, p[k].y);
      }
      g.closePath();
      g.fill();
      g.fillStyle = hexA(grassHi, 0.75);
      g.beginPath();
      g.ellipse(t.x + t.r * 0.1, t.y - t.r * 0.14, t.r * 0.34, t.r * 0.16, 0, 0, TAU);
      g.fill();
    });

    // 藤蔓
    tops.forEach(function (t, i) {
      if (!t.tall || i % 2) return;
      const x0 = t.x + t.r * (0.3 + rnd(t.seed, 11) * 0.5);
      const len = 40 + rnd(t.seed, 13) * 60;
      g.strokeStyle = grassLo;
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, t.y + 2);
      g.bezierCurveTo(x0 + 10, t.y + len * 0.4, x0 - 8, t.y + len * 0.7, x0 + 4, t.y + len);
      g.stroke();
      for (let k = 1; k <= 3; k++) {
        const yy = t.y + len * (k / 3.4);
        g.fillStyle = k % 2 ? grassLo : grass;
        g.beginPath();
        g.ellipse(x0 + (k % 2 ? 5 : -4), yy, 4.5, 2.6, 0.5, 0, TAU);
        g.fill();
      }
    });

    // 草坡前沿的草簇
    for (let i = 0; i < 9; i++) {
      const x = cx + (rnd(h, 500 + i) - 0.5) * 300;
      const y = baseY + 4 + rnd(h, 520 + i) * 22;
      tuft(g, x, y, 5 + rnd(h, 540 + i) * 4, rnd(h, 560 + i) < 0.5 ? grassLo : grassHi, 0.3);
    }

    // 整块颗粒：近景看是手绘的斑驳感，不是纯色块（只叠在已有内容上）
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.1;
    g.fillStyle = g.createPattern(grainTile(64, 'dot', [C.deep, '#ffffff', C.mid], 110, 17), 'repeat');
    g.fillRect(0, 0, W, H);
    g.restore();

    return c;
  }

  const PAINTERS = {
    path: paintPath,
    brick: paintBrick,
    slab: paintSlab,
    water: paintWater,
    mud: paintMud,
    sea: paintSea,
  };

  /* ================= 遮罩：每格一个"圆群"，并集就是有机边 ================= */

  function stampBlob(gm, px, gx, gy, h) {
    const x = gx * px, y = gy * px;
    // 外扩 2px：相邻格轻微重叠 → 区域连续、没有缝；不是内缩，内缩会露出底下的草。
    const pad = -px * 0.04;
    // 圆角必须很小：太大会在四角漏底，露出下面的草，路面上出现"绿斑"
    const r = px * (0.05 + rnd(h, 0) * 0.03);
    gm.beginPath();
    rr(gm, x + pad, y + pad, px - pad * 2, px - pad * 2, r);
    gm.fill();
    // 两个小凸起：把圆角矩形的"方"打散成手绘的不规则边。
    // 半径要小（3~6px），太大就成了"液体的糖霜边"。
    for (let i = 1; i <= 2; i++) {
      const a = rnd(h, i) * TAU;
      const d = px * 0.5;
      gm.beginPath();
      gm.arc(
        x + px * 0.5 + Math.cos(a) * d * 0.94,
        y + px * 0.5 + Math.sin(a) * d * 0.94,
        px * (0.07 + rnd(h, i + 3) * 0.05), 0, TAU
      );
      gm.fill();
    }
  }

  /* ================= 细纹理：一次性平铺，给色块一点"毛毯"手感 ================= */

  function grainTile(size, kind, cols, n, seed) {
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    for (let i = 0; i < n; i++) {
      const h = hash(seed + 3, i);
      const x = rnd(h, 0) * size;
      const y = rnd(h, 1) * size;
      const col = cols[h % cols.length];
      g.strokeStyle = col;
      g.fillStyle = col;
      if (kind === 'tuft') {
        const s = 2 + rnd(h, 2) * 3;
        g.lineWidth = 1;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 0.6, y - s * 0.6, x + (rnd(h, 3) - 0.3) * 2, y - s);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(x, y, 0.5 + rnd(h, 2) * 1.3, 0, TAU);
        g.fill();
      }
    }
    return c;
  }

  /* ================= 水：海 or 池塘 =================
     terrain=3 只说明"这是水"，分不出湖还是海。规则很简单：
     能顺着水走到地图边界的 = 海（外面还有水），被陆地围死的 = 池塘。 */

  function seaMask(terrain, rows, cols) {
    const tag = new Uint8Array(rows * cols);
    if (!terrain) return tag;
    const isW = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && terrain[y] && terrain[y][x] === 3;
    const q = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if ((x === 0 || y === 0 || x === cols - 1 || y === rows - 1) && isW(x, y)) {
          tag[y * cols + x] = 1;
          q.push(x, y);
        }
      }
    }
    for (let i = 0; i < q.length; i += 2) {
      const x = q[i], y = q[i + 1];
      const step = (nx, ny) => {
        if (!isW(nx, ny) || tag[ny * cols + nx]) return;
        tag[ny * cols + nx] = 1;
        q.push(nx, ny);
      };
      step(x + 1, y);
      step(x - 1, y);
      step(x, y + 1);
      step(x, y - 1);
    }
    return tag;
  }

  /* ================= 岸线：水陆交界 =================
     水直接切在草上像贴纸。真正需要的是三样：水侧一圈浅水、交界一条泡沫、
     陆侧一圈湿沙。都沿边撒小椭圆，不用画整条线——线会直得像刀切。 */

  function shoreEdge(g, px, T, x, y, side, h, wet) {
    const x0 = x * px, y0 = y * px;
    const nx = side === 'left' ? -1 : side === 'right' ? 1 : 0;
    const ny = side === 'up' ? -1 : side === 'down' ? 1 : 0;
    const ax = ny !== 0 ? 1 : 0, ay = nx !== 0 ? 1 : 0;    // 沿边方向
    const ex = x0 + px / 2 + nx * px / 2, ey = y0 + px / 2 + ny * px / 2;
    const n = Math.max(3, Math.round(px / 10));
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n - 0.5) * px + (rnd(h, i) - 0.5) * px * 0.2;
      const bx = ex + ax * t, by = ey + ay * t;
      const rx = (ax ? 0.16 : 0.08) * px * (0.8 + rnd(h, 10 + i) * 0.5);
      const ry = (ay ? 0.16 : 0.08) * px * (0.8 + rnd(h, 20 + i) * 0.5);
      // 水侧：浅水（水越靠岸越浅，颜色越亮）
      const sd = px * (0.09 + rnd(h, 30 + i) * 0.06);
      g.fillStyle = hexA(T.waterHi || T.water, 0.3 + rnd(h, 40 + i) * 0.2);
      g.beginPath();
      g.ellipse(bx - nx * sd, by - ny * sd, rx, ry, 0, 0, TAU);
      g.fill();
      // 沸沫：贴着交界的一点奶油色
      g.fillStyle = hexA(T.cream, 0.5 + rnd(h, 50 + i) * 0.25);
      g.beginPath();
      g.ellipse(bx - nx * px * 0.02, by - ny * px * 0.02, rx * 0.55, ry * 0.55, 0, 0, TAU);
      g.fill();
      // 陆侧：湿沙（一圈暗一点的土，把水的硬边压住）
      const ld = px * (0.1 + rnd(h, 60 + i) * 0.07);
      g.fillStyle = hexA(wet, 0.36 + rnd(h, 70 + i) * 0.18);
      g.beginPath();
      g.ellipse(bx + nx * ld, by + ny * ld, rx * 1.05, ry * 1.05, 0, 0, TAU);
      g.fill();
    }
  }

  function shoreline(g, px, T, terrain, rows, cols, seed) {
    if (!terrain) return;
    const wet = mix(T.path, T.mud, 0.4);
    const isWater = (x, y) =>
      x >= 0 && y >= 0 && x < cols && y < rows && terrain[y] && terrain[y][x] === 3;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!isWater(x, y)) continue;
        // 越界不算陆地：贴图外沿是海，不能给整张图描一圈岸
        if (y > 0 && !isWater(x, y - 1)) shoreEdge(g, px, T, x, y, 'up', hash(seed + 5, x * 131 + y * 7), wet);
        if (y < rows - 1 && !isWater(x, y + 1)) shoreEdge(g, px, T, x, y, 'down', hash(seed + 6, x * 139 + y * 11), wet);
        if (x > 0 && !isWater(x - 1, y)) shoreEdge(g, px, T, x, y, 'left', hash(seed + 7, x * 149 + y * 13), wet);
        if (x < cols - 1 && !isWater(x + 1, y)) shoreEdge(g, px, T, x, y, 'right', hash(seed + 8, x * 151 + y * 17), wet);
      }
    }
  }



  /* ================= 主入口 ================= */

  /**
   * @param map     map[y][x]，0 地面 / 1 墙 / 2 门
   * @param terrain terrain[y][x]，0 普通 / 1 土路 / 2 墙 / 3 水
   * @param theme   'field' | 'cave' | 'waste'
   * @param opts    { px, style:{path,brick,slab,water,mud}, force }
   *                style.path='brick' 可以把土路画成砖铺（主城广场就是这么用的）
   *                force 把全场铺成一种材质（验收台用）
   */
  function groundSheet(map, terrain, theme, opts) {
    const o = opts || {};
    const T = PALETTES[theme] || PALETTES.field;
    const cols = map[0].length;
    const rows = map.length;
    // 大图必须降分辨率：128×128 的野外在 48px/格 下是 6144² = 151MB 的一张图，
    // 生成 2.5s、上传显存再卡几帧，手机直接崩。手绘细节是"一屏"的量，不是整张世界的量。
    // 小房间（24×24 / 26×26）不受影响，仍然 48px。
    const MAX_SIDE = o.maxSide || 3072;
    const px = Math.max(12, Math.min(o.px || PX, Math.floor(MAX_SIDE / Math.max(cols, rows))));
    // 格子越小，每格的笔触就该越少（同屏看到的信息量不变，省时间）
    const dens = Math.min(1, Math.max(0.45, px / 48));
    const W = cols * px;
    const H = rows * px;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const seed = o.seed || 7;
    const base = (o.force && KINDS[o.force] && KINDS[o.force].tier === '底材') ? o.force : BASE_OF[theme] || 'grass';

    // 1) 底材
    paintBase(g, W, H, px, T, base, seed, dens);

    // 2) 分类 + 覆盖层
    const groups = { path: [], brick: [], slab: [], water: [], mud: [], sea: [] };
    const style = o.style || {};
    // 同样是水：连到地图边界的算"海"，被陆地围住的算"池塘"。
    // 光看 terrain=3 分不出来，而海和池塘的色深浅、波纹完全不是一回事。
    const seaTag = seaMask(terrain, rows, cols);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let k = o.force || kindOf(map, terrain, x, y);
        if (k === 'stone') k = 'slab';
        else if (k === 'base') k = base;
        else if (k === 'path') k = style.path || 'path';
        else if (k === 'water') {
          k = style.water || (seaTag[y * cols + x] ? 'sea' : 'water');
        }
        if (!groups[k] || KINDS[k].tier !== '覆盖') continue;
        groups[k].push([x, y]);
      }
    }

    const keys = Object.keys(groups);
    for (let gi = 0; gi < keys.length; gi++) {
      const kind = keys[gi];
      const list = groups[kind];
      if (!list.length) continue;
      // a. 整片纹理
      const lay = makeCanvas(W, H);
      const lg = lay.getContext('2d');
      (PAINTERS[kind] || paintPath)(lg, W, H, px, T);
      // b. 圆群遮罩
      const mask = makeCanvas(W, H);
      const mg = mask.getContext('2d');
      mg.fillStyle = '#fff';
      for (let i = 0; i < list.length; i++) {
        const cell = list[i];
        stampBlob(mg, px, cell[0], cell[1], hash(seed * 31 + kind.length, cell[0] * 1013 + cell[1]));
      }
      // c. 裁切后贴到主图
      lg.globalCompositeOperation = 'destination-in';
      lg.drawImage(mask, 0, 0);
      lg.globalCompositeOperation = 'source-over';
      // d. 投影：遮罩糊 3px、往右下挪，压在底材上——路和石头才"坐"在地面上
      const sh = makeCanvas(W, H);
      const sg = sh.getContext('2d');
      sg.drawImage(mask, 0, 0);
      sg.globalCompositeOperation = 'source-in';
      sg.fillStyle = T.ink;
      sg.fillRect(0, 0, W, H);
      g.save();
      g.globalAlpha = 0.2;
      g.filter = 'blur(3px)';
      g.drawImage(sh, 2, 3);
      g.restore();
      g.drawImage(lay, 0, 0);
      // e. 覆盖层上的小细节（路上的碎石、水边的泥点）：直接叠在主图上，限定在格心
      detailOnOverlay(g, kind, list, px, T, seed);
    }

    // 3) 岸线：水陆交界（水岸瓦片）。水不能直接切在草上，那样像贴纸
    shoreline(g, px, T, terrain, rows, cols, seed);

    // 3) 整图低频明暗：让整块地不是一样亮（很淡，重了就成了水渍）
    g.save();
    g.globalCompositeOperation = 'multiply';
    blotches(g, W, H, ['#ffffff', '#f6ecd6'], Math.round((W * H) / (px * px * 9)), seed + 5, 0.1);
    g.restore();

    return c;
  }

  // 覆盖层上的细节只画在格心 60% 区域，避免糊到别的材质上
  function detailOnOverlay(g, kind, list, px, T, seed) {
    for (let i = 0; i < list.length; i++) {
      const x = list[i][0], y = list[i][1];
      const h = hash(seed + 101, x * 977 + y);
      const cx = (x + 0.5) * px, cy = (y + 0.5) * px;
      const jx = (rnd(h, 0) - 0.5) * px * 0.6;
      const jy = (rnd(h, 1) - 0.5) * px * 0.6;
      if (kind === 'path' || kind === 'slab') {
        if (rnd(h, 2) < 0.55) pebble(g, cx + jx, cy + jy, 1.4 + rnd(h, 3) * 2, kind === 'path' ? T.pathLo : T.stoneLo, T.cream);
      } else if (kind === 'water') {
        if (rnd(h, 4) < 0.3) {
          g.strokeStyle = hexA(T.waterHi, 0.6);
          g.lineWidth = 1.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(cx + jx - 6, cy + jy);
          g.quadraticCurveTo(cx + jx, cy + jy - 2.2, cx + jx + 6, cy + jy);
          g.stroke();
        }
      } else if (kind === 'mud' && rnd(h, 5) < 0.4) {
        tuft(g, cx + jx, cy + jy, 4 + rnd(h, 6) * 3, T.baseLo, 0.2);
      }
    }
  }

  /* ================= 验收台：单材质小块 ================= */

  function patch(kind, theme, cols, rows, seed) {
    const W = cols || 4, H = rows || 4;
    const map = [], terrain = [];
    for (let y = 0; y < H; y++) {
      map[y] = [];
      terrain[y] = [];
      for (let x = 0; x < W; x++) {
        map[y][x] = 0;
        terrain[y][x] = kind === 'path' ? 1 : kind === 'water' ? 3 : 0;
      }
    }
    const over = KINDS[kind] && KINDS[kind].tier === '覆盖' ? kind : null;
    if (over) {
      // 让 path/water 的分类落空，整场强制这一种覆盖材质
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) terrain[y][x] = 0;
      }
    }
    return groundSheet(map, terrain, theme, { force: kind, px: PX, seed: seed || 3 });
  }

  DL.IsoArt = {
    PX: PX,
    PALETTES: PALETTES,
    KINDS: KINDS,
    kindOf: kindOf,
    groundSheet: groundSheet,
    patch: patch,
    mountain: mountain,
    cliff: cliff,
    cliffFoot: cliffFoot,
    setCliffSprites: setCliffSprites,
    cliffHeight: cliffHeight,
  };
})(typeof window !== 'undefined' ? window : globalThis);
