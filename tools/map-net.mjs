// 路网草图 → 格子地图：把「一堆等宽线段」落成可走的格子，并算路口 / 死路 / 连通 / 直径
// 用法（仓库根）: node tools/map-net.mjs docs/maps/hand1-96.segments.json [路宽格=6] [补缝格=8]
//
// 手画的线头常差一点点没接上（画快了），默认 8 格内自动补一小段接住；
// 补缝调小可以保留"故意断开"的路，调大能救更多手滑。
//
// 输入格式（tools/trace-map.py 直接产出）：
// { "grid": { "w": 96, "h": 86 }, "segments": [{ "x1":..,"y1":..,"x2":..,"y2":.. }] }

import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const spec = JSON.parse(readFileSync(file, 'utf8'));
const W = spec.grid.w, H = spec.grid.h;
const ROAD = Number(process.argv[3] ?? spec.roadWidth ?? 6);
const SNAP = Number(process.argv[4] ?? 8);     // 线头之间 ≤ 这么多格就自动补缝（手画快了）
const R = ROAD / 2;
const segs = spec.segments;

// 点到线段距离
function d2seg(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const L2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

// ---- 补缝：线头离别的线 ≤ SNAP 格，就补一小段接上（手画快了留下的缝，不是设计）----
function nearestOn(px, py, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const L2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L2));
  return [s.x1 + t * dx, s.y1 + t * dy];
}

const snaps = [];
const patched = new Set();
segs.forEach((s, i) => {
  for (const [px, py] of [[s.x1, s.y1], [s.x2, s.y2]]) {
    let best = null, bestD = SNAP;
    segs.forEach((o, j) => {
      if (i === j) return;
      const [qx, qy] = nearestOn(px, py, o);
      const d = Math.hypot(qx - px, qy - py);
      if (d < bestD) { bestD = d; best = [qx, qy]; }
    });
    if (best) {
      snaps.push({ x1: px, y1: py, x2: best[0], y2: best[1] });
      patched.add(`${px},${py}`);
    }
  }
});
const allSegs = segs.concat(snaps);

// ---- 栅格化 ----
const grid = Array.from({ length: H }, () => Array(W).fill('#'));
let roadCells = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    if (allSegs.some(s => d2seg(cx, cy, s) <= R)) { grid[y][x] = '='; roadCells++; }
  }
}

// ---- 线段求交（= 岔路口）----
function inter(a, b) {
  const d1x = a.x2 - a.x1, d1y = a.y2 - a.y1;
  const d2x = b.x2 - b.x1, d2y = b.y2 - b.y1;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.x1 - a.x1) * d2y - (b.y1 - a.y1) * d2x) / den;
  const u = ((b.x1 - a.x1) * d1y - (b.y1 - a.y1) * d1x) / den;
  if (t < -0.01 || t > 1.01 || u < -0.01 || u > 1.01) return null;
  return [a.x1 + t * d1x, a.y1 + t * d1y];
}

const hits = [];
for (let i = 0; i < segs.length; i++)
  for (let j = i + 1; j < segs.length; j++) {
    const p = inter(segs[i], segs[j]);
    if (p) hits.push(p);
  }
// 同一个路口的多条线交点合并
const clusters = [];
for (const p of hits) {
  const c = clusters.find(c => Math.hypot(c.x - p[0], c.y - p[1]) < ROAD);
  if (c) c.n++; else clusters.push({ x: p[0], y: p[1], n: 1 });
}

// ---- 端点悬空 = 死路 ----
const ends = [];
for (const s of segs) for (const p of [[s.x1, s.y1], [s.x2, s.y2]]) {
  if (patched.has(`${p[0]},${p[1]}`)) continue;
  const near = segs.some(o => o !== s && d2seg(p[0], p[1], o) <= R + 0.5);
  if (!near) ends.push(p);
}
const deadEnds = ends.filter((p, i) => ends.findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < ROAD) === i);

// ---- 连通：BFS（用栅格，最实在）----
const can = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] === '=';
let start = null, best = 1e9;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  if (can(x, y) && x + y < best) { best = x + y; start = [x, y]; }

function bfs([sx, sy]) {
  const d = new Map([[sy * W + sx, 0]]);
  const q = [[sx, sy]];
  let far = [sx, sy], farD = 0;
  while (q.length) {
    const [x, y] = q.shift();
    const dv = d.get(y * W + x);
    if (dv > farD) { farD = dv; far = [x, y]; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (can(nx, ny) && !d.has(ny * W + nx)) { d.set(ny * W + nx, dv + 1); q.push([nx, ny]); }
    }
  }
  return { d, far, farD };
}

const b1 = start ? bfs(start) : { d: new Map(), far: null, farD: 0 };
const b2 = b1.far ? bfs(b1.far) : { farD: 0 };

console.log(`${file}  ${W}×${H} 格，路宽 ${ROAD} 格，线段 ${segs.length} 条\n`);
grid.forEach((row, y) => console.log(String(y).padStart(2) + ' ' + row.join('')));

console.log(`\n路面 ${roadCells} 格（占全图 ${(roadCells / (W * H) * 100).toFixed(0)}%）`);
console.log(`补缝 ${snaps.length} 处（线头相距 ≤ ${SNAP} 格，判定为画快了没接上）`);
console.log(`路口 ${clusters.length} 个` + (clusters.length ? `（含 ${clusters.filter(c => c.n >= 3).length} 个三线以上的大路口）` : ''));
console.log(`死路 ${deadEnds.length} 条（线头悬空、不接任何线）`);
if (start) {
  const reach = b1.d.size;
  console.log(`连通：从左上角入口能走到 ${reach} / ${roadCells} 格` + (reach === roadCells ? '  ✔ 全通' : '  !! 有断开的区域'));
  console.log(`长轴：入口到最远 ${b1.farD} 步；全图直径 ${b2.farD} 步`);
}

// ---- 可选：把栅格直接吐成游戏用的 map.js ----
const jsIdx = process.argv.indexOf('--js');
if (jsIdx > 0 && start) {
  const out = process.argv[jsIdx + 1];
  const rows = grid.map(r => r.join(''));
  const body =
`// 自动生成，别手改。
// 重新生成：node tools/map-net.mjs ${file} ${ROAD} ${SNAP} --js ${out}
const MAP = {
  w: ${W}, h: ${H},
  spawn: [${start[0]}, ${start[1]}],
  rows: [
${rows.map(r => `    "${r}",`).join('\n')}
  ]
};
if (typeof globalThis !== 'undefined') globalThis.MAP = MAP;
`;
  writeFileSync(out, body);
  console.log(`已写出 ${out}（${rows.length} 行 × ${W} 列）`);
}
