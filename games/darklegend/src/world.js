/* 豆豆暗黑传奇 · 世界层（可替换）
   结构：一个主城 + N 个小世界房间。
   - 主城：固定小场景，放传送门，人物在里面
   - 房间：独立小地图，从传送门进入；有刷新 CD
   如果要回到开放世界，把人物移出主城、把房间拼起来即可。

   本文件只管地形：生成、碰撞、视野、寻路。
   怪物内容由 game.js 按 spec 刷。
*/
import { DL } from './namespace.js';
const global = globalThis;

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

  // 斜向优先：BFS 等长路径时先扩对角，避免「点斜线却先直走一步」
  const DIRS8 = [
    [1, 1], [1, -1], [-1, 1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  // 把「横一步+竖一步」收成斜一步（可走才收），进一步消直→斜折线
  function tightenPath(map, sx, sy, path) {
    if (!path || path.length < 2) return path;
    const out = [];
    let x = sx, y = sy;
    let i = 0;
    while (i < path.length) {
      if (i + 1 < path.length) {
        const a = path[i], b = path[i + 1];
        const ax = a.x - x, ay = a.y - y;
        const bx = b.x - a.x, by = b.y - a.y;
        const orthPair = (Math.abs(ax) + Math.abs(ay) === 1) && (Math.abs(bx) + Math.abs(by) === 1)
          && ((ax === 0) !== (ay === 0)) && ((bx === 0) !== (by === 0))
          && ax * bx === 0 && ay * by === 0;
        if (orthPair && canStep(map, x, y, ax + bx, ay + by)
          && a.x + bx === b.x && a.y + by === b.y) {
          out.push({ x: b.x, y: b.y });
          x = b.x; y = b.y;
          i += 2;
          continue;
        }
      }
      out.push(path[i]);
      x = path[i].x; y = path[i].y;
      i += 1;
    }
    return out;
  }

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
        return tightenPath(map, sx, sy, path);
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

    // 三个等级段传送门：东侧，离右墙留两格。
    // 主城只比视野宽 48px，出生点相机贴左，门若贴在 x=22，名字中心正好在画面右缘外。
    const tiers = [
      { min: 1, max: 10, name: '1–10 级' },
      { min: 10, max: 20, name: '10–20 级' },
      { min: 20, max: 30, name: '20–30 级' },
    ];
    const ys = [6, 12, 18];
    const doors = tiers.map((t, i) => {
      const d = { x: size - 4, y: ys[i], room: 'portal', name: t.name, tierMin: t.min, tierMax: t.max, lv: t.min };
      m[d.y][d.x] = 2;
      return d;
    });

    const npc = { x: 12, y: 12 };
    const bookNpc = { x: 8, y: 8 };
    const trialNpc = { x: 16, y: 8 };
    const stashNpc = { x: 4, y: 16 }; // 出生点南边，回城就能走到
    const spawn = { x: 3, y: 12 };
    return { map: m, doors, npc, bookNpc, trialNpc, stashNpc, spawn };
  }

  /* ---------- 小世界房间 ---------- */
  // layout: 'open'（开阔+障碍）| 'cave'（两房间+走廊）
  function genRoom(spec, rng) {
    const size = Math.round((spec.size || 20) * 2.2);  // 线性 ×2.2 ≈ 面积 ×5（主人 2026-10-29 定）
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

  // 只给绘制用。0 地面 / 1 土路 / 2 墙。不改 map，不进存档。
  // points[0] 是广场中心，其余是门/NPC/出生点；从中心铺 L 形路过去，带一点拐弯抖动。
  function genTerrain(map, points, seed) {
    const H = map.length;
    const W = map[0].length;
    const g = [];
    for (let y = 0; y < H; y++) {
      g[y] = [];
      for (let x = 0; x < W; x++) g[y][x] = map[y][x] === 1 ? 2 : 0;
    }
    const mul = DL.Core && DL.Core.mulberry32;
    const rnd = mul ? mul((seed >>> 0) || 1) : Math.random;
    const walkable = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && map[y][x] !== 1;
    const pts = (points || []).filter((p) => p && walkable(p.x, p.y));
    if (!pts.length) return g;
    const center = pts[0];

    function stamp(cx, cy, r) {
      const R = Math.ceil(r);
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = cx + dx, y = cy + dy;
          if (!walkable(x, y)) continue;
          if (dx * dx + dy * dy <= r * r) g[y][x] = 1;
        }
      }
    }

    // 广场
    stamp(center.x, center.y, 2.4);

    // 一条带折点的路：两段横竖 + 随机折点，保证从头连到尾；路面 2 格宽
    function road(a, b) {
      function lane(px, py, horiz) {
        stamp(px, py, 0.6);
        if (horiz) stamp(px, py + 1, 0.6);
        else stamp(px + 1, py, 0.6);
      }
      function h(x0, x1, y) {
        const s = x0 <= x1 ? 1 : -1;
        for (let x = x0; x !== x1 + s; x += s) lane(x, y, true);
      }
      function v(y0, y1, x) {
        const s = y0 <= y1 ? 1 : -1;
        for (let y = y0; y !== y1 + s; y += s) lane(x, y, false);
      }
      if (a.x === b.x || a.y === b.y || rnd() < 0.5) {
        const bx = a.x + Math.round((b.x - a.x) * (0.35 + rnd() * 0.3));
        h(a.x, bx, a.y);
        v(a.y, b.y, bx);
        h(bx, b.x, b.y);
      } else {
        const by = a.y + Math.round((b.y - a.y) * (0.35 + rnd() * 0.3));
        v(a.y, by, a.x);
        h(a.x, b.x, by);
        v(by, b.y, b.x);
      }
      stamp(b.x, b.y, 1.1);
    }

    for (let i = 1; i < pts.length; i++) road(center, pts[i]);
    return g;
  }

  DL.World = {
    blank, carve, corridor,
    isWall, visible, canStep, DIRS8, bfs,
    genHub, genRoom, genTerrain,
  };
