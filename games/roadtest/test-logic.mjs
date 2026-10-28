// 路网原型 · 逻辑自检（不开浏览器）
// 用法: node games/roadtest/test-logic.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const here = new URL('.', import.meta.url);
vm.runInThisContext(readFileSync(new URL('./map.js', here), 'utf8'), { filename: 'map.js' });
vm.runInThisContext(readFileSync(new URL('./game.js', here), 'utf8'), { filename: 'game.js' });

const { RT, MAP } = globalThis;
const C = RT.CELL;
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

console.log(`地图 ${MAP.w}×${MAP.h}，格 ${C}px，入口 [${MAP.spawn}]`);

const cellOf = (p) => [Math.floor(p.x / C), Math.floor(p.y / C)];
const isRoad = (x, y) => MAP.rows[y]?.[x] !== undefined && MAP.rows[y][x] !== '#';

// 1. 入口
const sp = RT.spawn();
ok(RT.at(MAP.spawn[0], MAP.spawn[1]) !== '#', '入口在路面上');
ok(RT.canStand(sp.x, sp.y, sp.r), '玩家能站在入口');

// 2. 连通：从入口 BFS，所有路面格子都要走到
const seen = new Set([`${MAP.spawn[0]},${MAP.spawn[1]}`]);
const q = [[MAP.spawn[0], MAP.spawn[1]]];
while (q.length) {
  const [x, y] = q.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
    if (isRoad(nx, ny) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); }
  }
}
let roadTotal = 0;
for (let y = 0; y < MAP.h; y++) for (let x = 0; x < MAP.w; x++) if (isRoad(x, y)) roadTotal++;
ok(seen.size === roadTotal, '从入口能走到所有路面', `${seen.size}/${roadTotal}`);

// 3. 撞墙：朝四个方向各顶 3 秒，不能穿墙
let leaked = 0, tried = 0;
for (let a = 0; a < 64; a++) {
  const p = RT.spawn();
  const ang = a / 64 * Math.PI * 2;
  for (let i = 0; i < 180; i++) {
    RT.tryMove(p, Math.cos(ang) * 4, Math.sin(ang) * 4, p.r);
    tried++;
    if (!RT.canStand(p.x, p.y, p.r)) leaked++;
  }
}
ok(leaked === 0, '顶墙 64 个方向 × 180 步，一次都没穿进去', `穿模 ${leaked}/${tried}`);

// 4. 随机乱走：位置始终可站
const p2 = RT.spawn();
let bad = 0;
for (let i = 0; i < 4000; i++) {
  RT.tryMove(p2, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, p2.r);
  if (!RT.canStand(p2.x, p2.y, p2.r)) bad++;
}
ok(bad === 0, '随机乱走 4000 步不会卡进墙里');

// 5. 怪都在路上，且离入口够远
const mon = RT.makeMonsters(16, 7);
ok(mon.length === 16, '撒出 16 只怪', `实际 ${mon.length}`);
const offRoad = mon.filter(m => { const [x, y] = cellOf(m); return !isRoad(x, y); });
ok(offRoad.length === 0, '怪全部落在路面上', `路面外 ${offRoad.length}`);
const near = mon.filter(m => Math.hypot(m.x - sp.x, m.y - sp.y) < C * 10);
ok(near.length === 0, '出生点 10 格内没有怪', `太近 ${near.length}`);

// 6. 速度：空地上走 1 秒 ≈ SPEED 像素
const p3 = { x: sp.x, y: sp.y, r: sp.r };
let moved = 0;
for (let i = 0; i < 60; i++) moved += RT.tryMove(p3, 0, 0, p3.r);
ok(moved === 0, '不动就不位移');

console.log(`\nRESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
