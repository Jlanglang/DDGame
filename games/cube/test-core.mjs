/* 豆豆魔方 · 逻辑测试（Node 里跑，不开浏览器）
   用法：node games/cube/test-core.mjs

   覆盖：初始复原、每个记法转四次回原位、正反操作互消、打乱后不是复原、
   逐步撤销能复原、贴纸颜色守恒、位置/旋转矩阵始终合法、复原判定不受整体朝向影响。
*/
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Core = require(path.join(__dirname, 'cube-core.js'));

const lines = [];
let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    lines.push('  PASS ' + name);
  } else {
    fail++;
    lines.push('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
  }
}

function fresh() {
  return Core.createCube();
}

function colorCounts(cube) {
  const counts = {};
  for (const c of cube.cubies) {
    for (const s of c.stickers) if (s) counts[s] = (counts[s] || 0) + 1;
  }
  return counts;
}

function validCube(cube) {
  for (const c of cube.cubies) {
    for (const v of c.pos) {
      if (v !== -1 && v !== 0 && v !== 1) return false;
    }
    const r = c.rot;
    const det =
      r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) -
      r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0]) +
      r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
    if (det !== 1) return false;
    /* 每行每列必须恰好一个 ±1，其余为 0 */
    for (let i = 0; i < 3; i++) {
      let rowSum = 0;
      let colSum = 0;
      for (let j = 0; j < 3; j++) {
        rowSum += Math.abs(r[i][j]);
        colSum += Math.abs(r[j][i]);
      }
      if (rowSum !== 1 || colSum !== 1) return false;
    }
  }
  return true;
}

/* 1. 初始状态 */
{
  const cube = fresh();
  ok('初始 27 个 cubie', cube.cubies.length === 27, cube.cubies.length);
  ok('初始是复原状态', Core.isSolved(cube));
  const counts = colorCounts(cube);
  ok('六色各 9 张', Object.keys(counts).length === 6 && Object.values(counts).every((n) => n === 9), counts);
  ok('初始位置合法', validCube(cube));
}

/* 2. 每个记法转四次回到原位 */
{
  const names = Object.keys(Core.MOVES);
  const base = Core.stateKey(fresh());
  let allOk = true;
  for (const name of names) {
    const cube = fresh();
    const mv = Core.parseMove(name);
    for (let i = 0; i < 4; i++) Core.turn(cube, mv);
    if (Core.stateKey(cube) !== base || !Core.isSolved(cube)) allOk = false;
  }
  ok('U/D/R/L/F/B 各转四次都回到原位', allOk);

  let primeOk = true;
  for (const name of names) {
    const cube = fresh();
    Core.turn(cube, Core.parseMove(name));
    Core.turn(cube, Core.parseMove(name + "'"));
    if (!Core.isSolved(cube)) primeOk = false;
  }
  ok('正转 + 逆转互相抵消', primeOk);
}

/* 3. 记法方向：U 把顶层前面转到右面 */
{
  const cube = fresh();
  const before = Core.findCubie(cube, [0, 1, 1]);
  Core.turn(cube, Core.parseMove('U'));
  const after = Core.findCubie(cube, [1, 1, 0]);
  ok('U 顶层：前 → 右', !!after && after.id === before.id, after && after.id);
  ok('U 之后仍不是复原状态', !Core.isSolved(cube));

  /* 更严格：R 顺时针把顶面那排送到前面 */
  const c3 = fresh();
  const top = Core.findCubie(c3, [1, 1, 0]);
  Core.turn(c3, Core.parseMove('R'));
  const front = Core.findCubie(c3, [1, 0, 1]);
  ok('R：顶 → 前', !!front && front.id === top.id, front && front.id);

  const c4 = fresh();
  const f2 = Core.findCubie(c4, [0, 1, 1]);
  Core.turn(c4, Core.parseMove('F'));
  const right = Core.findCubie(c4, [1, 0, 1]);
  ok('F：顶 → 右', !!right && right.id === f2.id, right && right.id);
}

/* 4. 打乱 / 撤销 */
{
  const cube = fresh();
  const seq = Core.scramble(20);
  ok('打乱 20 步', seq.length === 20, seq.length);
  for (const mv of seq) Core.turn(cube, mv);
  ok('打乱后不是复原状态', !Core.isSolved(cube));
  ok('打乱后贴纸仍然六色各 9', Object.values(colorCounts(cube)).every((n) => n === 9));
  ok('打乱后位置/旋转矩阵合法', validCube(cube));

  const rewind = [...seq].reverse().map(Core.invert);
  for (const mv of rewind) Core.turn(cube, mv);
  ok('逆序撤销后复原', Core.isSolved(cube));
}

/* 5. 中间层也能转、也能撤 */
{
  const cube = fresh();
  const mv = { axis: 'y', layer: 0, dir: 1 };
  Core.turn(cube, mv);
  ok('中间层转动会打乱颜色', !Core.isSolved(cube));
  Core.turn(cube, Core.invert(mv));
  ok('中间层反向转回', Core.isSolved(cube));
}

/* 6. 复原判定按颜色：把魔方整体转一下也应该算复原 */
{
  const cube = fresh();
  /* 相当于整层都转：直接对每个 cubie 应用同一个旋转矩阵 */
  const R = Core.rotMat('y', 90);
  for (const c of cube.cubies) {
    const p = Core.applyMat(R, c.pos);
    c.pos = p.map((n) => Math.round(n));
    c.rot = Core.mulMat(R, c.rot);
  }
  ok('整体旋转后仍判定为复原', Core.isSolved(cube));
}

/* 7. 20 组随机打乱再撤销，全部回到原来的状态键 */
{
  let stable = true;
  for (let round = 0; round < 20; round++) {
    const cube = fresh();
    const seq = Core.scramble(25);
    const before = Core.stateKey(cube);
    for (const mv of seq) Core.turn(cube, mv);
    for (const mv of [...seq].reverse().map(Core.invert)) Core.turn(cube, mv);
    if (Core.stateKey(cube) !== before) stable = false;
  }
  ok('20 组随机打乱 + 撤销都精确还原', stable);
}

/* 8. 每个面的 9 张贴纸确实在外层 */
{
  const cube = fresh();
  Core.turn(cube, Core.parseMove('U'));
  Core.turn(cube, Core.parseMove("R'"));
  Core.turn(cube, Core.parseMove('F'));
  const layout = Core.stickerLayout(cube);
  let all9 = true;
  for (const key of Object.keys(layout)) if (layout[key].length !== 9) all9 = false;
  ok('任意转动后每个世界面都是 9 张', all9, Object.keys(layout).map((k) => layout[k].length));
}

/* 9. 单独验证 U 之后顶面颜色仍然一致（全是白） */
{
  const cube = fresh();
  Core.turn(cube, Core.parseMove('U'));
  const layout = Core.stickerLayout(cube);
  const colors = layout['0,1,0'].map((c) => c.color);
  ok('U 之后顶面 9 张都是白色', colors.every((c) => c === 'W'), colors);
}

console.log(lines.join('\n'));
console.log('');
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
