/* 豆豆暗黑传奇 · 瓦片层
   只负责图集坐标、墙体掩码、加载。不改 map 的 0/1/2，不参与碰撞。
   图集没到（404 / 还在加载）时 ready 为 false，绘制退回色块。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const TILE = 32;

  // 列号 = ID & 0x0F，行号 = ID >> 4
  const wall = [];
  for (let i = 0; i < 16; i++) wall.push(0x10 + i);
  const ATLAS = {
    floor: [0x00, 0x01, 0x02, 0x03],
    wall: wall,
    door: 0x20,
    decor: [0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28],
    wallFx: [0x29, 0x2A, 0x2B, 0x2C],
  };

  function atlasSrc(id) {
    const col = id & 0x0F;
    const row = id >> 4;
    return { col: col, row: row, sx: col * TILE, sy: row * TILE, sw: TILE, sh: TILE };
  }

  // bit0 上 / bit1 右 / bit2 下 / bit3 左。越界当墙。门（2）不算墙。
  function wallMask(map, x, y) {
    const W = map[0].length;
    const H = map.length;
    const solid = (nx, ny) =>
      nx < 0 || ny < 0 || nx >= W || ny >= H || map[ny][nx] === 1;
    return (solid(x, y - 1) ? 1 : 0) |
           (solid(x + 1, y) ? 2 : 0) |
           (solid(x, y + 1) ? 4 : 0) |
           (solid(x - 1, y) ? 8 : 0);
  }

  function hash(x, y, seed) {
    let h = (seed >>> 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  let img = null;
  let ready = false;
  let theme = '';

  function load(dir, themeName, cb) {
    ready = false;
    img = null;
    theme = themeName || 'cave';
    if (typeof Image === 'undefined') {
      if (cb) cb(false);
      return;
    }
    const im = new Image();
    const base = (dir || 'assets/tiles/').replace(/\/?$/, '/');
    im.onload = function () {
      img = im;
      ready = true;
      if (cb) cb(true);
    };
    im.onerror = function () {
      img = null;
      ready = false;
      if (cb) cb(false);
    };
    const ver = (DL.TILEMAP && DL.TILEMAP.atlasVer) || '';
    im.src = base + 'tiles-' + theme + '.png' + (ver ? ('?v=' + ver) : '');
  }

  function useTiles(enabled) {
    return !!enabled && ready && !!img;
  }

  // 16 个地面变体本身只差一点噪声，按 2×2 小块成片选，避免逐格雪花。
  function baseVariant(x, y, seed) {
    return hash(x >> 1, y >> 1, seed) % 16;
  }

  // 越界不算同材质（和墙体掩码不同：墙体越界当墙）。
  function maskOf(grid, x, y, mat) {
    const W = grid[0].length;
    const H = grid.length;
    const same = (nx, ny) =>
      nx >= 0 && ny >= 0 && nx < W && ny < H && grid[ny][nx] === mat;
    return (same(x, y - 1) ? 1 : 0) |
           (same(x + 1, y) ? 2 : 0) |
           (same(x, y + 1) ? 4 : 0) |
           (same(x - 1, y) ? 8 : 0);
  }

  function innerCorners(grid, x, y, mat) {
    const W = grid[0].length;
    const H = grid.length;
    const at = (nx, ny) =>
      (nx >= 0 && ny >= 0 && nx < W && ny < H) ? grid[ny][nx] : null;
    const out = [];
    const checks = [
      [0, 0, -1, -1, 0, -1, -1],
      [1, 0, -1, 1, 0, 1, -1],
      [2, 0, 1, 1, 0, 1, 1],
      [3, 0, 1, -1, 0, -1, 1],
    ];
    for (let i = 0; i < checks.length; i++) {
      const c = checks[i];
      if (at(x + c[1], y + c[2]) === mat && at(x + c[3], y + c[4]) === mat && at(x + c[5], y + c[6]) !== mat) {
        out.push(c[0]);
      }
    }
    return out;
  }

  DL.Tiles = {
    TILE: TILE,
    ATLAS: ATLAS,
    REGION: {
      base: 0x00, decal: 0x10, wall: 0x28, wallInner: 0x38,
      door: 0x3C, path: 0x40, pathInner: 0x50,
    },
    atlasSrc: atlasSrc,
    wallMask: wallMask,
    maskOf: maskOf,
    innerCorners: innerCorners,
    baseVariant: baseVariant,
    hash: hash,
    load: load,
    useTiles: useTiles,
    get ready() { return ready; },
    get image() { return img; },
    get theme() { return theme; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
