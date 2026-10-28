// 地图草图渲染器：把一张「格子地图」的 spec 渲染成 ASCII，并算出行走数据
// 用法（仓库根）: node tools/map-sketch.mjs docs/maps/field1.json
//
// spec 格式：
// {
//   "name": "图1 鸡鸣村外（草稿）",
//   "size": [24, 24],
//   "default": "#",                  // 没填到的地方
//   "walk": ".,=+@SPQTM!B",          // 哪些字符算「能走」
//   "start": [11, 7],                // 入口
//   "goal": [12, 23],                // 目标（首领房），可为空
//   "rects":  [{ "ch": ".", "x": 1, "y": 1, "w": 22, "h": 6 }],
//   "points": [{ "ch": "M", "x": 7, "y": 11, "label": "鸡群 x3" }]
// }

import { readFileSync } from 'node:fs';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [W, H] = spec.size;
const grid = Array.from({ length: H }, () => Array(W).fill(spec.default ?? '#'));

const put = (x, y, ch) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  grid[y][x] = ch;
};

for (const r of spec.rects ?? [])
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) put(x, y, r.ch);

for (const p of spec.points ?? []) put(p.x, p.y, p.ch);

// ---- 行走数据 ----
const walk = new Set((spec.walk ?? '.,=+@SPQTM!B').split(''));
const can = (x, y) => x >= 0 && y >= 0 && x < W && y < H && walk.has(grid[y][x]);
const key = (x, y) => y * W + x;

const dist = new Map();
if (spec.start) {
  const [sx, sy] = spec.start;
  dist.set(key(sx, sy), 0);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    const d = dist.get(key(x, y));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (can(nx, ny) && !dist.has(key(nx, ny))) {
        dist.set(key(nx, ny), d + 1);
        q.push([nx, ny]);
      }
    }
  }
}

const walkable = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (can(x, y)) walkable.push([x, y]);

const unreachable = spec.start ? walkable.filter(([x, y]) => !dist.has(key(x, y))) : [];
const far = spec.start ? Math.max(0, ...dist.values()) : 0;

const deadEnds = walkable.filter(([x, y]) => {
  const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => can(x + dx, y + dy)).length;
  const isStart = spec.start && x === spec.start[0] && y === spec.start[1];
  return n <= 1 && !isStart;
});

// ---- 输出 ----
console.log(`${spec.name ?? ''}  ${W}×${H}`);
console.log('   ' + Array.from({ length: W }, (_, i) => String(i % 10)).join(''));
grid.forEach((row, y) => console.log(String(y).padStart(2, ' ') + ' ' + row.join('')));

const npc = (spec.points ?? []).filter(p => 'SPQ'.includes(p.ch));
const mobs = (spec.points ?? []).filter(p => p.ch === 'M');
if (npc.length) console.log('\n建筑 / NPC：\n' + npc.map(p => `  (${p.x},${p.y}) ${p.label ?? p.ch}`).join('\n'));
if (mobs.length) console.log('\n怪物点：\n' + mobs.map(p => `  (${p.x},${p.y}) ${p.label ?? ''}`).join('\n'));

console.log(`\n可走 ${walkable.length} 格；入口到最远 ${far} 步；死路 ${deadEnds.length} 条`);
if (unreachable.length) {
  console.log(`!! 走不到的可走格 ${unreachable.length} 个：` + unreachable.map(([x, y]) => `(${x},${y})`).join(' '));
} else if (spec.start) {
  console.log('连通性：从入口全部可达 ✔');
}
