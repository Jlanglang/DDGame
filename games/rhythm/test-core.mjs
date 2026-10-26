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
ok('一共 50 关', Core.LEVELS.length === 50, Core.LEVELS.length);
ok('难度不倒退', Core.LEVELS.every((lv, i) => i === 0 || lv.diff >= Core.LEVELS[i - 1].diff));
ok('每关都有谱面', Core.LEVELS.every((lv) => lv.pattern.length === lv.bars));
ok('越界关卡回落到第一关', Core.levelAt(99).id === Core.LEVELS[0].id);
ok('三种关卡类型都有', new Set(Core.LEVELS.map((lv) => lv.mode)).size === 3);
ok('没有豆豆示范', Core.LEVELS.every((lv) => lv.pattern.every((p) => p.indexOf('d') < 0)));
ok('每关都是侧面', Core.LEVELS.every((lv) => lv.scene && lv.scene.face === 'side' && lv.scene.part && lv.scene.prop));
ok('听拍只有 1 小节', Core.LEVELS.every((lv) => lv.demoBars === 1 && !/[xd]/.test(lv.pattern[0]) && /x/.test(lv.pattern[1])));
function repeats(bars) {
  if (bars.length < 2 || bars.length % 2 !== 0) return false;
  const head = bars.slice(0, 2).join('|');
  for (let i = 2; i < bars.length; i += 2) {
    if (bars.slice(i, i + 2).join('|') !== head) return false;
  }
  return true;
}
ok('句子会重复；后段变密的关只在后段变', Core.LEVELS.every((lv) => {
  const body = lv.pattern.slice(1);
  if (body.length !== 12) return false;
  if (repeats(body)) return true;
  return repeats(body.slice(0, 8)) && repeats(body.slice(8)) && body[0] !== body[8];
}));
ok('打和打之间至少隔半拍', Core.LEVELS.every((lv, i) => {
  const chart = Core.buildChart(i);
  return chart.every((n, k) => k === 0 || n.beat - chart[k - 1].beat >= 0.5 - 1e-6);
}));
ok('句子跟着情景，不是三句共用', new Set(Core.LEVELS.map((lv) => lv.pattern.join('|'))).size >= 16);
ok('进场跟着情景，不是一种曲线', new Set(Core.LEVELS.map((lv) => lv.enter)).size >= 8);
ok('落下的高球打在第 4 拍', (() => {
  const i = Core.LEVELS.findIndex((l) => l.id === 'high');
  return Core.buildChart(i)[0].slot === 12 && Core.LEVELS[i].enter === 'fall';
})());
ok('滚进来的球打在第 3 拍', (() => {
  const i = Core.LEVELS.findIndex((l) => l.id === 'kick');
  return Core.buildChart(i)[0].slot === 8 && Core.LEVELS[i].enter === 'roll';
})());
ok('飞进来的树枝打在第 2 拍', (() => {
  const i = Core.LEVELS.findIndex((l) => l.id === 'duck');
  return Core.buildChart(i)[0].slot === 4 && Core.LEVELS[i].enter === 'dart';
})());
ok('敲鼓打在正拍', (() => {
  const i = Core.LEVELS.findIndex((l) => l.id === 'drum');
  return Core.buildChart(i)[0].slot === 0 && Core.LEVELS[i].enter === 'snap';
})());
ok('倒水是先倾再落', (() => {
  const i = Core.LEVELS.findIndex((l) => l.id === 'pour');
  const c = Core.buildChart(i);
  return c[0].slot === 8 && c[1].slot === 12 && Core.LEVELS[i].enter === 'pour';
})());
ok('颠球两下隔开 2 拍，走弧线', (() => {
  const i = Core.LEVELS.findIndex((l) => l.id === 'bump');
  const c = Core.buildChart(i);
  return c[1].beat - c[0].beat === 2 && Core.LEVELS[i].enter === 'arc' && Core.LEVELS[i].arc;
})());
ok('翻饼也走弧，句子和颠球不同', (() => {
  const bump = Core.LEVELS.find((l) => l.id === 'bump');
  const cake = Core.LEVELS.find((l) => l.id === 'cake');
  return cake.enter === 'arc' && cake.pattern.join('|') !== bump.pattern.join('|');
})());
ok('叩门前半一下，后半变成两下', (() => {
  const lv = Core.LEVELS.find((l) => l.id === 'knock');
  const body = lv.pattern.slice(1);
  const early = body.slice(0, 8).join('');
  const late = body.slice(8).join('');
  const count = (s) => (s.match(/x/g) || []).length;
  return count(early) === 8 && count(late) === 4 && early !== late;
})());
ok('落在能跟着数的八分上', Core.LEVELS.every((lv, i) => {
  const chart = Core.buildChart(i);
  return chart.every((n) => n.slot % 2 === 0);
}));

/* 2. 没有示范段，要按的就是全部音符。 */
ok('全关没有示范音符', Core.LEVELS.every((lv, i) => Core.buildChart(i).every((n) => !n.demo)));

ok('第 1 关仍是让球', Core.LEVELS[0].id === 'lift' && Core.LEVELS[0].name === '让球');
ok('第 50 关是吹烛', Core.LEVELS[49].id === 'candle' && Core.LEVELS[49].name === '吹烛');

/* 3. 每关谱面合法。清单锁住音符数，改谱面会在这里失败。 */
for (let i = 0; i < Core.LEVELS.length; i++) {
  const lv = Core.levelAt(i);
  const chart = Core.buildChart(i);
  const play = chart.filter((n) => !n.demo);
  const total = Core.totalOf(lv);
  ok(`第 ${i + 1} 关要按的音符 12 个`, play.length === 12, play.length);
  ok(`第 ${i + 1} 关总音符 12 个`, chart.length === 12, chart.length);
  ok(`第 ${i + 1} 关时间严格递增`, chart.every((n, k) => k === 0 || n.t > chart[k - 1].t));
  ok(`第 ${i + 1} 关最后一个拍子在时长内`, chart[chart.length - 1].t < total + 1e-6);
  ok(`第 ${i + 1} 关对齐十六分网格`, chart.every((n) => Number.isInteger(n.beat * 4)));
  ok(`第 ${i + 1} 关没有写进前奏`, chart.every((n) => n.beat >= lv.demoBars * 4));
  ok(`第 ${i + 1} 关时长合理（20~45 秒）`, total > 20 && total < 45, total);
}

/* 4. 谱面里没有不判定的示范音 */
{
  const chart = Core.buildChart(0);
  ok('第 1 关没有示范音', chart.every((n) => !n.demo));
  ok('playNotes 留下全部要按的音', Core.playNotes(chart).length === chart.length);
}

/* 5. 判定窗口边界 */
ok('0ms → 完美', Core.judge(0) === 'perfect');
ok('80ms → 完美（边界）', Core.judge(80) === 'perfect');
ok('-80ms → 完美（早了也算）', Core.judge(-80) === 'perfect');
ok('80.5ms → 不错', Core.judge(80.5) === 'good');
ok('150ms → 不错（边界）', Core.judge(150) === 'good');
ok('150.5ms → 失误', Core.judge(150.5) === 'miss');
ok('220ms → 失误（边界）', Core.judge(220) === 'miss');
ok('220.5ms → 空按', Core.judge(220.5) === 'far');
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
  ok('90% 且无失误 → S', t.grade === 'S', t.grade);
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
ok('85% 且无失误 → S', Core.grade(0.85, 0) === 'S');
ok('85% 但有失误 → A', Core.grade(0.85, 1) === 'A');
ok('84% 无失误 → B', Core.grade(0.84, 0) === 'B');
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

/* 10. 动作落在拍点上，过冲在拍点之后 */
{
  const beat = 2;
  const prev = 1.4;
  const early = Core.cuePose(beat - 0.30, prev, beat);
  ok('拍点前停在蓄力', early.strike === 0 && early.raise === 1, early);
  const mid = Core.cuePose(beat - 0.08, prev, beat);
  ok('出手途中还没到位', mid.strike > 0.4 && mid.strike < 0.95, mid);
  const almost = Core.cuePose(beat - 0.001, prev, beat);
  ok('差 1ms 还没算落到', almost.strike < 1, almost);
  const on = Core.cuePose(beat, beat, beat + 0.6);
  ok('拍点当下落到位', Math.abs(on.strike - 1) < 1e-6, on);
  const after = Core.cuePose(beat + 0.03, beat, beat + 0.6);
  ok('拍点之后才过冲', after.strike > 1.05 && after.raise === 0, after);
  const midGap = Core.cuePose((prev + beat) / 2, prev, beat);
  ok('两拍中间绳子在头顶', Math.abs(midGap.phase - 0.5) < 1e-6, midGap.phase);
  const landed = Core.cuePose(prev, prev, beat);
  ok('上一拍刚落下时绳子在脚下', landed.phase === 0 && Math.abs(landed.strike - 1) < 1e-6, landed);
  const held = Core.cuePose(1.03, 1, 1.2);
  ok('快拍落下后先停住', held.strike >= 1 && held.raise === 0, held);
  const justFast = Core.cuePose(1.2 - 0.001, 1, 1.2);
  ok('快拍也在拍点前落到', justFast.strike > 0.9 && justFast.strike < 1, justFast);
}

/* 11. 插画零件：骨头等长，碰上的点在画面里 */
{
  const Scenes = require(path.join(__dirname, 'scenes.js'));
  const list = Scenes.SCENES;
  ok('场景清单也是 50 关', list && list.length === 50, list && list.length);
  if (list) {
    let bone = true;
    let home = true;
    let path = true;
    for (const s of list) {
      const a = s.visual.actor || {};
      if (a.k === 'leg' || a.k === 'arm') {
        for (const u of [-1, 0, 1]) {
          const L = Scenes.limbAt(a, u);
          const l1 = Math.hypot(L.knee.x - L.hip.x, L.knee.y - L.hip.y);
          const l2 = Math.hypot(L.end.x - L.knee.x, L.end.y - L.knee.y);
          if (Math.abs(l1 - a.len) > 0.3 || Math.abs(l2 - a.len) > 0.3) bone = false;
        }
      }
      if (a.k === 'leg') {
        const L = Scenes.limbAt(a, 0);
        if (L.knee.x < L.hip.x + 20) bone = false;
      }
      if (a.k === 'arm') {
        const L = Scenes.limbAt(a, 1);
        if (!(L.knee.y < (L.hip.y + L.end.y) / 2)) bone = false;
      }
      const h = Scenes.propHome(s.visual);
      if (!(h.x > 40 && h.x < 680 && h.y > 500 && h.y < 980)) home = false;
      const ends = Scenes.propEnds(s.visual);
      const p = s.visual.prop;
      if (p && p.travel === 'x' && Math.abs(ends.enter.y - ends.home.y) > 0.1) path = false;
      if (p && p.travel === 'y' && Math.abs(ends.enter.x - ends.home.x) > 0.1) path = false;
    }
    const duck = list.find((s) => s.id === 'duck');
    const branch = Scenes.propHome(duck.visual);
    const flower = Scenes.actorTip(duck.visual);
    ok('两截骨头等长，膝向身前、肘向上', bone);
    ok('碰上的点都在画面里', home);
    ok('横着来的贴着一条高度，竖直来的贴着一条竖线', path);
    ok('树枝从花的头顶掠过', branch.y < flower.y - 30, { branch, flower });
  }
}

console.log(lines.join('\n'));
console.log('');
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
