/* 豆豆海岛幻想 · 数值体检（零依赖，不碰游戏）
   用法：
     node games/darklegend/balance.mjs          看曲线
     node games/darklegend/balance.mjs --check  超范围返回 1（提交前跑）

   读 src/data.js / src/core.js 的真实数值，按 game.js 的公式复算。
   只做"量"，不做"改"；发现不对先改文档和这里的阈值，再改 data.js。
*/
await import('./src/data.js');
await import('./src/core.js');
const DL = globalThis.DL;
const D = DL.DATA;
const Core = DL.Core;

/* ---- game.js 里的公式（改 game.js 要同步这里） ---- */
const COMBAT_MS = D.COMBAT_MS;
const monStats = (lv, grade = 'normal') => {
  const g = D.GRADE[grade];
  return {
    hp: 18 * Math.pow(1.16, lv) * g.hp,
    atk: (10 + 4 * lv) * g.atk,
    def: 2 * Math.pow(1.075, lv) * (grade === 'boss' ? 1.5 : grade === 'rare' ? 1.4 : grade === 'elite' ? 1.2 : 1),
    exp: 10 * Math.pow(1.12, lv - 1) * g.exp,
  };
};
const playerAtk = (lv, ilvl = lv) => {
  const base = 5 + 1.5 * (lv - 1);
  const wMin = Math.round(4 + 0.2 * ilvl);
  const wMax = Math.max(wMin, Math.round(8 + 0.4 * ilvl));
  return { min: base + wMin, max: base + wMax, base, gear: (wMin + wMax) / 2 };
};
const playerDef = (lv, ilvl = lv) => {
  const base = 3 + (lv - 1);
  const aMin = Math.round(2 + 0.2 * ilvl);
  const aMax = Math.max(aMin, Math.round(4 + 0.4 * ilvl));
  return { min: base + aMin, max: base + aMax, base, gear: (aMin + aMax) / 2 };
};
const hitsToKill = (lv) => {
  const m = monStats(lv);
  const a = playerAtk(lv);
  const atkMean = (a.min + a.max) / 2;
  return m.hp / Math.max(1, atkMean - m.def);
};
const killsPerLevel = (lv) => {
  const need = Core.needExp({ lv });
  const exp = monStats(lv).exp;
  return { need, exp, kills: need / exp };
};
const gearShare = (lv) => {
  const a = playerAtk(lv);
  const d = playerDef(lv);
  return {
    atk: a.gear / (a.base + a.gear),
    def: d.gear / (d.base + d.gear),
  };
};

const L = [];
const push = (s = '') => L.push(s);
push('# 豆豆海岛幻想 · 数值体检');
push('');
push(`数据来源：data.js / core.js；公式：game.js（COMBAT_MS=${COMBAT_MS}）；装备按同级白装。`);
push('');

push('## 1. 等级曲线（同级普通怪）');
push('');
push('| Lv | 升级经验 | 怪 HP | 怪经验 | 刀数 | 只数 | 估算时长 |');
push('|---|---|---|---|---|---|---|');
for (const lv of [1, 5, 10, 15, 20, 25, 29, 30]) {
  const k = killsPerLevel(lv);
  const h = hitsToKill(lv);
  const sec = k.kills * h * (COMBAT_MS / 1000);
  push(`| ${lv} | ${fmt(k.need)} | ${fmt(monStats(lv).hp)} | ${fmt(k.exp)} | ${h.toFixed(1)} | ${k.kills.toFixed(1)} | ${hms(sec)} |`);
}
push('');

push('## 2. 装备占比（白装）');
push('');
push('| Lv | 基础攻 | 武器均值 | 装备占比 | 基础防 | 护甲均值 | 装备占比 |');
push('|---|---|---|---|---|---|---|');
for (const lv of [1, 10, 20, 30]) {
  const a = playerAtk(lv);
  const d = playerDef(lv);
  const g = gearShare(lv);
  push(`| ${lv} | ${a.base.toFixed(1)} | ${a.gear.toFixed(1)} | ${pct(g.atk)} | ${d.base} | ${d.gear.toFixed(1)} | ${pct(g.def)} |`);
}
push('');

push('## 3. 掉落期望（普通怪）');
push('');
const drop = D.DROP.normal;
const sum = drop.c + drop.b + drop.a + drop.s;
push(`- 单只普通怪：掉 1 件装备的概率 **${(sum * 100).toFixed(2)}%**（C ${pctDrop(drop.c)} / B ${pctDrop(drop.b)} / A ${pctDrop(drop.a)} / S ${pctDrop(drop.s)}）`);
push(`- 100 只普通怪期望：**${(sum * 100).toFixed(1)} 件**`);
push(`- 精英保底：阈值 1～${D.RESPAWN.elitePityMax} 随机，期望约 **${((D.RESPAWN.elitePityMax + 1) / 2).toFixed(0)} 杀**出 1 只（必掉 B）`);
push(`- 稀有保底：阈值 1～${D.RESPAWN.rarePityMax} 随机，期望约 **${((D.RESPAWN.rarePityMax + 1) / 2).toFixed(0)} 杀**出 1 只（必掉 A）`);
push('');

push('## 4. BOSS（白装、不喝药、不放技能）');
push('');
push('| Lv | HP | 玩家每刀 | 刀数 | 时长 |');
push('|---|---|---|---|---|');
for (const lv of [10, 20, 25, 30]) {
  const hp = 18 * Math.pow(1.16, lv) * D.GRADE.boss.hp;
  const def = 2 * Math.pow(1.075, lv) * 1.5;
  const atk = (playerAtk(lv).min + playerAtk(lv).max) / 2;
  const dmg = Math.max(1, atk - def);
  const hits = hp / dmg;
  push(`| ${lv} | ${fmt(hp)} | ${dmg.toFixed(1)} | ${hits.toFixed(0)} | ${hms(hits * COMBAT_MS / 1000)} |`);
}
push('');

push('## 5. 检查');
push('');
const checks = [
  ['30 级刀数（毕业段）', hitsToKill(30), 5, 45, '5–45'],
  ['30 级装备占攻', gearShare(30).atk * 100, 35, 65, '35%–65%'],
  ['30 级每级只数', killsPerLevel(30).kills, 80, 500, '80–500'],
  ['1→30 总时长', totalHours(), 1, 8, '1–8 小时'],
];
let fail = 0;
for (const [name, v, lo, hi, range] of checks) {
  const ok = v >= lo && v <= hi;
  if (!ok) fail++;
  push(`- ${ok ? 'PASS' : 'FAIL'} ${name} = ${v.toFixed(1)}（目标 ${range}）`);
}
push('');

if (process.argv.includes('--check') && fail) {
  console.error(L.join('\n'));
  console.error(`\n${fail} 项超范围`);
  process.exit(1);
}
console.log(L.join('\n'));

function totalHours() {
  let sec = 0;
  for (let lv = 1; lv < 30; lv++) {
    const k = killsPerLevel(lv);
    sec += k.kills * hitsToKill(lv) * (COMBAT_MS / 1000);
  }
  return sec / 3600;
}
function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}
function pct(x) {
  return (x * 100).toFixed(0) + '%';
}
function pctDrop(x) {
  const v = x * 100;
  return (v < 1 ? v.toFixed(2) : v.toFixed(1)) + '%';
}
function hms(sec) {
  if (sec < 90) return Math.round(sec) + ' 秒';
  const m = sec / 60;
  if (m < 90) return m.toFixed(1) + ' 分';
  return (m / 60).toFixed(1) + ' 小时';
}
