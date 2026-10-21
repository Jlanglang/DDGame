/* 豆豆暗黑传奇 · 世界层（可替换）
   只管"地形"：生成地图、碰撞、视野、寻路。
   不碰怪物内容、不碰 UI、不碰战斗。
   换房间制时，只改这个文件。

   约定：
   - 所有函数显式接收 map / 坐标，不读全局
   - 生成器返回数据对象，由 game.js 赋值并刷怪
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});

  /* ---------- 格子工具 ---------- */
  function blank(w, h) {
    return Array.from({ length: h }, () => Array.from({ length: w }, () => 1));
  }

  function carve(m, x, y, w, h) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        if (j > 0 && i > 0 && j < m.length - 1 && i < m[0].length - 1) m[j][i] = 0;
      }
    }
  }

  function corridor(m, a, b) {
    let x = a.x, y = a.y;
    while (x !== b.x) { x += x < b.x ? 1 : -1; m[y][x] = 0; }
    while (y !== b.y) { y += y < b.y ? 1 : -1; m[y][x] = 0; }
  }

  const isWall = (map, x, y) =>
    x < 0 || y < 0 || x >= map[0].length || y >= map.length || map[y][x] === 1;

  const visible = (px, py, x, y, radius) =>
    Math.max(Math.abs(x - px), Math.abs(y - py)) <= radius;

  /* ---------- BFS 寻路 ---------- */
  function bfs(map, sx, sy, tx, ty, blocked) {
    const W = map[0].length, H = map.length;
    if (sx === tx && sy === ty) return [];
    const prev = new Int32Array(W * H).fill(-1);
    const start = sy * W + sx;
    prev[start] = start;
    const q = [start];
    let head = 0;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < q.length) {
      const cur = q[head++];
      const cx = cur % W, cy = (cur / W) | 0;
      if (cx === tx && cy === ty) {
        const path = [];
        let k = cur;
        while (k !== prev[k]) {
          path.push({ x: k % W, y: (k / W) | 0 });
          k = prev[k];
        }
        path.reverse();
        return path;
      }
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (map[ny][nx] === 1) continue;
        if (blocked && blocked(nx, ny) && !(nx === tx && ny === ty)) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    return null;
  }

  /* ---------- 生成器 ---------- */
  // 图 1 野外：48×48 开阔地形 + 村庄 + 洞穴入口
  function genOverworld(rng) {
    const mrand = (a, b) => a + rng() * (b - a);
    const mrandi = (a, b) => Math.floor(mrand(a, b + 1));

    const m = blank(48, 48);

    // 开阔野外：内部全部打通，只放少量树丛/石头障碍
    for (let y = 1; y < 47; y++) {
      for (let x = 1; x < 47; x++) m[y][x] = 0;
    }

    const village = { x: 3, y: 22, w: 7, h: 6, cx: 6, cy: 25 };
    const gate = { x: 40, y: 22, w: 5, h: 5, cx: 42, cy: 24 };

    // 村庄到洞穴入口的主路，保证连通
    for (let x = village.cx; x <= gate.cx; x++) {
      for (let y = 23; y <= 26; y++) m[y][x] = 0;
    }
    carve(m, village.x, village.y, village.w, village.h);
    carve(m, gate.x, gate.y, gate.w, gate.h);

    // 随机障碍：避开村庄、入口和主路
    for (let i = 0; i < 55; i++) {
      const x = mrandi(2, 45), y = mrandi(2, 45);
      if (x >= village.x - 2 && x <= village.x + village.w + 2 &&
        y >= village.y - 2 && y <= village.y + village.h + 2) continue;
      if (x >= gate.x - 2 && x <= gate.x + gate.w + 2 &&
        y >= gate.y - 2 && y <= gate.y + gate.h + 2) continue;
      if (y >= 23 && y <= 26) continue;
      m[y][x] = 1;
      if (mrand() < 0.4 && x + 1 < 47) m[y][x + 1] = 1;
    }

    const npc = { x: village.cx + 1, y: village.cy };
    const door = { x: gate.cx, y: gate.cy };
    m[door.y][door.x] = 2;

    return { map: m, village, gate, npc, door };
  }

  // 图 1 洞穴：固定 26×26，两个房间 + 走廊
  function genCave() {
    const m = blank(26, 26);
    carve(m, 2, 9, 6, 8);
    carve(m, 14, 8, 8, 10);
    corridor(m, { x: 5, y: 13 }, { x: 17, y: 13 });

    const back = { x: 3, y: 13 };
    m[back.y][back.x] = 2;

    return { map: m, entry: { x: 4, y: 13 }, back };
  }

  DL.World = {
    blank, carve, corridor,
    isWall, visible, bfs,
    genOverworld, genCave,
  };
})(typeof window !== 'undefined' ? window : globalThis);
