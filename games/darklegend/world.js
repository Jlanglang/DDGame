/* 豆豆暗黑传奇 · 世界层（可替换）
   结构：一个主城 + N 个小世界房间。
   - 主城：固定小场景，放传送门，人物在里面
   - 房间：独立小地图，从传送门进入；有刷新 CD
   如果要回到开放世界，把人物移出主城、把房间拼起来即可。

   本文件只管地形：生成、碰撞、视野、寻路。
   怪物内容由 game.js 按 spec 刷。
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

  // 八向一步：斜走时两侧正交有墙则禁止穿角
  function canStep(map, x, y, dx, dy) {
    if (!dx && !dy) return false;
    const nx = x + dx, ny = y + dy;
    if (isWall(map, nx, ny)) return false;
    if (dx !== 0 && dy !== 0) {
      if (isWall(map, x + dx, y) || isWall(map, x, y + dy)) return false;
    }
    return true;
  }

  const DIRS8 = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  /* ---------- BFS 寻路（八向） ---------- */
  function bfs(map, sx, sy, tx, ty, blocked) {
    const W = map[0].length, H = map.length;
    if (sx === tx && sy === ty) return [];
    const prev = new Int32Array(W * H).fill(-1);
    const start = sy * W + sx;
    prev[start] = start;
    const q = [start];
    let head = 0;
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
      for (const [dx, dy] of DIRS8) {
        if (!canStep(map, cx, cy, dx, dy)) continue;
        const nx = cx + dx, ny = cy + dy;
        if (blocked && blocked(nx, ny) && !(nx === tx && ny === ty)) continue;
        const ni = ny * W + nx;
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    return null;
  }

  /* ---------- 主城 ---------- */
  // 24×24 小村庄：左出生、右侧一个传送门（进去后选房间）、中间商人
  function genHub(rooms) {
    const size = 24;
    const m = blank(size, size);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) m[y][x] = 0;
    }

    // 中间一条石板路（视觉用，不挡路）
    for (let x = 2; x < size - 2; x++) m[12][x] = 0;

    // 三个等级段传送门：靠商人右侧（勿贴地图右缘——手机 cover 裁切会裁掉）
    const tiers = [
      { min: 1, max: 10, name: '1–10 级' },
      { min: 10, max: 20, name: '10–20 级' },
      { min: 20, max: 30, name: '20–30 级' },
    ];
    const doorX = 14;
    const ys = [6, 12, 18];
    const doors = tiers.map((t, i) => {
      const d = { x: doorX, y: ys[i], room: 'portal', name: t.name, tierMin: t.min, tierMax: t.max, lv: t.min };
      m[d.y][d.x] = 2;
      return d;
    });

    const npc = { x: 12, y: 12 };
    const spawn = { x: 3, y: 12 };
    return { map: m, doors, npc, spawn };
  }

  /* ---------- 小世界房间 ---------- */
  // layout: 'open'（开阔+障碍）| 'cave'（两房间+走廊）
  function genRoom(spec, rng) {
    const size = spec.size || 20;
    const r = rng || Math.random;
    const rndi = (a, b) => Math.floor(a + r() * (b - a + 1));

    if (spec.layout === 'cave') {
      const m = blank(size, size);
      const w = Math.floor(size * 0.4), h = Math.floor(size * 0.45);
      const a = { x: 2, y: Math.floor(size * 0.35) };
      const b = { x: size - 2 - w, y: Math.floor(size * 0.3) };
      carve(m, a.x, a.y, w, h);
      carve(m, b.x, b.y, w, h);
      corridor(m, { x: a.x + w - 1, y: a.y + Math.floor(h / 2) }, { x: b.x, y: b.y + Math.floor(h / 2) });
      const exit = { x: a.x, y: a.y + Math.floor(h / 2) };
      m[exit.y][exit.x] = 2;
      return { map: m, spawn: { x: a.x + 1, y: exit.y }, exit };
    }

    // 开阔小房间：内部全部打通，撒少量障碍
    const m = blank(size, size);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) m[y][x] = 0;
    }
    const obstacles = Math.floor(size * 0.8);
    for (let i = 0; i < obstacles; i++) {
      const x = rndi(2, size - 3), y = rndi(2, size - 3);
      if (Math.abs(x - 2) + Math.abs(y - Math.floor(size / 2)) < 3) continue; // 出口附近留空
      m[y][x] = 1;
    }
    const exit = { x: 1, y: Math.floor(size / 2) };
    m[exit.y][exit.x] = 2;
    return { map: m, spawn: { x: 2, y: exit.y }, exit };
  }

  DL.World = {
    blank, carve, corridor,
    isWall, visible, canStep, DIRS8, bfs,
    genHub, genRoom,
  };
})(typeof window !== 'undefined' ? window : globalThis);
