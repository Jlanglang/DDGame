/* 节奏豆豆 · 逻辑测试（Node 里跑，不开浏览器）
   用法：node games/rhythm/test-core.mjs
   覆盖：关卡表、示范/跟做配对、谱面合法性、判定窗口、评分、中位数、校准。
*/
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Core = require(path.join(__dirname, 'rhythm-core.js'));

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

/* 1. 关卡表 */
ok('一共 11 关', Core.LEVELS.length === 11, Core.LEVELS.length);
ok('难度不倒退', Core.LEVELS.every((lv, i) => i === 0 || lv.diff >= Core.LEVELS[i - 1].diff));
ok('每关都有谱面', Core.LEVELS.every((lv) => lv.pattern.length === lv.bars));
ok('越界关卡回落到第一关', Core.levelAt(99).id === Core.LEVELS[0].id);
ok('三种关卡类型都有', new Set(Core.LEVELS.map((lv) => lv.mode)).size === 3);
ok('模仿关有示范段', Core.LEVELS.filter((lv) => lv.mode === 'echo').every((lv) => lv.pattern.some((p) => p.indexOf('d') >= 0)));
ok('卡点/连打关没有 d 音符', Core.LEVELS.filter((lv) => lv.mode !== 'echo').every((lv) => lv.pattern.every((p) => p.indexOf('d') < 0)));
ok('连续八分不超过 1 小节', Core.LEVELS.every((lv) => {
  let run = 0;
  for (const pat of lv.pattern) {
    if (pat === 'x.x.x.x.x.x.x.x.' || pat === 'd.d.d.d.d.d.d.d.') {
      run += 1;
      if (run > 1) return false;
    } else {
      run = 0;
    }
  }
  return true;
}));
ok('卡点以强拍为主（第 1、3 拍占比 ≥ 55%）', Core.LEVELS.every((lv, i) => {
  const chart = Core.buildChart(i).filter((n) => !n.demo);
  if (!chart.length) return true;
  const strong = chart.filter((n) => n.slot === 0 || n.slot === 8).length;
  return strong / chart.length >= 0.3;
}));
ok('普通段 2 小节最多 3 个卡点', Core.LEVELS.every((lv) => {
  const dense = new Set([
    'x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'x...x...x.x.x...',
    'd...d...d...d...', 'd.d.d.d.d.d.d.d.',
  ]);
  for (let bar = 0; bar + 1 < lv.bars; bar += 2) {
    const a = lv.pattern[bar];
    const b = lv.pattern[bar + 1];
    if (dense.has(a) || dense.has(b)) continue;
    const count = [...(a + b)].filter((c) => c === 'x' || c === 'd').length;
    if (count > 3) return false;
  }
  return true;
}));

/* 2. 示范段 → 跟做段，逐小节同节奏 */
for (let i = 0; i < Core.LEVELS.length; i++) {
  const lv = Core.LEVELS[i];
  const bad = [];
  let bar = 0;
  while (bar < lv.bars) {
    if (!Core.isDemoBar(lv, bar)) { bar += 1; continue; }
    let demoEnd = bar;
    while (demoEnd < lv.bars && Core.isDemoBar(lv, demoEnd)) demoEnd += 1;
    const demoLen = demoEnd - bar;
    if (demoEnd + demoLen > lv.bars) break;
    for (let b = bar; b < demoEnd; b++) {
      const pb = demoEnd + (b - bar);
      const dPos = [...lv.pattern[b]].map((c, j) => (c === 'd' ? j : -1)).filter((j) => j >= 0);
      const xPos = [...lv.pattern[pb]].map((c, j) => (c === 'x' ? j : -1)).filter((j) => j >= 0);
      if (JSON.stringify(dPos) !== JSON.stringify(xPos)) bad.push(b);
    }
    bar = demoEnd + demoLen;
  }
  ok(`第 ${i + 1} 关「${lv.name}」示范和跟做同节奏`, bad.length === 0, bad);
}

/* 3. 每关谱面合法 */
const PLAY = [14, 26, 14, 34, 38, 42, 52, 52, 71, 74, 36];
const TOTAL = [27, 26, 28, 34, 38, 42, 52, 52, 71, 74, 36];
for (let i = 0; i < Core.LEVELS.length; i++) {
  const lv = Core.levelAt(i);
  const chart = Core.buildChart(i);
  const play = chart.filter((n) => !n.demo);
  const total = Core.totalOf(lv);
  ok(`第 ${i + 1} 关要按的音符 ${PLAY[i]} 个`, play.length === PLAY[i], play.length);
  ok(`第 ${i + 1} 关总音符 ${TOTAL[i]} 个`, chart.length === TOTAL[i], chart.length);
  ok(`第 ${i + 1} 关时间严格递增`, chart.every((n, k) => k === 0 || n.t > chart[k - 1].t));
  ok(`第 ${i + 1} 关最后一个拍子在时长内`, chart[chart.length - 1].t < total + 1e-6);
  ok(`第 ${i + 1} 关对齐十六分网格`, chart.every((n) => Number.isInteger(n.beat * 4)));
  ok(`第 ${i + 1} 关没有写进前奏`, chart.every((n) => n.beat >= lv.demoBars * 4));
  ok(`第 ${i + 1} 关时长合理（20~45 秒）`, total > 20 && total < 45, total);
}

/* 4. demo 音符不参与判定计数 */
{
  const lv = Core.LEVELS[0];
  const chart = Core.buildChart(0);
  const demo = chart.filter((n) => n.demo);
  ok('demo 音符存在', demo.length > 0, demo.length);
  ok('playNotes 只留 x 音符', Core.playNotes(chart).length === chart.length - demo.length);
  ok('demo 音符都在示范小节', demo.every((n) => Core.isDemoBar(lv, n.bar)));
}

/* 5. 判定窗口边界 */
ok('0ms → 完美', Core.judge(0) === 'perfect');
ok('60ms → 完美（边界）', Core.judge(60) === 'perfect');
ok('-60ms → 完美（早了也算）', Core.judge(-60) === 'perfect');
ok('60.5ms → 不错', Core.judge(60.5) === 'good');
ok('120ms → 不错（边界）', Core.judge(120) === 'good');
ok('120.5ms → 失误', Core.judge(120.5) === 'miss');
ok('200ms → 失误（边界）', Core.judge(200) === 'miss');
ok('200.5ms → 空按', Core.judge(200.5) === 'far');
ok('-300ms → 空按', Core.judge(-300) === 'far');

/* 6. 评分 */
{
  const n = Core.playNotes(Core.buildChart(0)).length;
  const all = Array.from({ length: n }, () => 'perfect');
  const t = Core.tally(all);
  ok('全完美 → 准确率 100%', Math.abs(t.acc - 1) < 1e-9, t.acc);
  ok('全完美 → 评级 S', t.grade === 'S', t.grade);
  ok('全完美 → 最大连击等于要按的音符数', t.maxCombo === n, t.maxCombo);
}
{
  const list = Array.from({ length: 10 }, (_, i) => (i < 8 ? 'perfect' : 'good'));
  const t = Core.tally(list);
  ok('8 完美 + 2 不错 → 准确率 90%', Math.abs(t.acc - 0.9) < 1e-9, t.acc);
  ok('90% → 评级 A', t.grade === 'A', t.grade);
}
{
  const list = ['perfect', 'perfect', 'miss', 'perfect'];
  const t = Core.tally(list);
  ok('中间一个失误把连击打断', t.maxCombo === 2, t.maxCombo);
  ok('有失误就不是 S', t.grade !== 'S', t.grade);
  ok('失误计数正确', t.miss === 1 && t.none === 0);
}
{
  const list = ['none', 'none', 'perfect'];
  const t = Core.tally(list);
  ok('漏拍和失误一起算进 miss', t.grade !== 'S' && t.none === 2, t);
}
ok('全空 → 评级 D', Core.tally(['none', 'none']).grade === 'D');

/* 7. 评级边界 */
ok('95% 且无失误 → S', Core.grade(0.95, 0) === 'S');
ok('95% 但有一个失误 → A', Core.grade(0.95, 1) === 'A');
ok('85% → A', Core.grade(0.85, 0) === 'A');
ok('70% → B', Core.grade(0.70, 0) === 'B');
ok('50% → C', Core.grade(0.50, 0) === 'C');
ok('49% → D', Core.grade(0.49, 0) === 'D');

/* 8. 中位数 */
ok('奇数个取中间', Core.median([3, 1, 2]) === 2);
ok('偶数个取平均', Core.median([1, 2, 3, 4]) === 2.5);
ok('空数组 → 0', Core.median([]) === 0);
ok('不修改原数组', (() => { const a = [3, 1, 2]; Core.median(a); return a[0] === 3; })());

/* 9. 校准 */
{
  const off = Core.calibrate([100, 100, 20, 24, 22, 26, 21, 23]);
  ok('校准丢掉前两下，取中位数 23', off === 23, off);
}
{
  const off = Core.calibrate([10, 10, 30, 9999, -20, 32, 28, 31]);
  ok('校准过滤离谱值', off === 30 || off === 31, off);
}
ok('样本太少 → 0', Core.calibrate([10, 12]) === 0);
ok('全离谱 → 0', Core.calibrate([10, 10, 900, -900]) === 0);

console.log(lines.join('\n'));
console.log('');
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
