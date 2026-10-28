// 临时对照脚本：解析 OpenMir2 数据 + 我们 data.js 的公式，输出对比表（不进仓库）
import fs from 'node:fs';

const SQL = fs.readFileSync('tmp/mir2/mir2_data.sql', 'utf8');
const EXPS = fs.readFileSync('tmp/mir2/Exps.conf', 'utf8');

function colsOf(table) {
  const re = new RegExp('CREATE TABLE `' + table + '`\\s*\\(([\\s\\S]*?)\\)\\s*ENGINE');
  const body = SQL.match(re)[1];
  return [...body.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}
function splitVals(s) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "'" && s[i + 1] === "'") { cur += "'"; i++; continue; }
      if (c === "'") { q = false; continue; }
      cur += c;
    } else if (c === "'") q = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
function rowsOf(table) {
  const cols = colsOf(table);
  const re = new RegExp('INSERT INTO `' + table + '` VALUES \\((.*)\\);', 'g');
  const rows = [];
  let m;
  while ((m = re.exec(SQL))) {
    const vals = splitVals(m[1]);
    const o = {};
    cols.forEach((c, i) => { o[c] = vals[i] === undefined ? null : vals[i]; });
    rows.push(o);
  }
  return rows;
}

const monsters = rowsOf('monsters').map((r) => ({
  name: r.Name, lv: +r.Lvl, hp: +r.HP, ac: +r.AC, mac: +r.MAC,
  dc: +r.DC, dcmax: +r.DCMAX, exp: +r.Exp,
}));
const items = rowsOf('stditems');
const magics = rowsOf('magics');

const expTable = {};
for (const m of EXPS.matchAll(/^Level(\d+)=(\d+)$/gm)) expTable[+m[1]] = +m[2];

const num = (v) => (v == null ? 0 : +v);
const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('en-US');

// ---------- 我们的公式 ----------
const ourMon = (lv) => ({
  hp: 18 * Math.pow(1.16, lv),
  atk: 10 + 4 * lv,
  def: 2 * Math.pow(1.075, lv),
  exp: 10 * Math.pow(1.12, lv - 1),
});
const ourPlayer = (lv, wIlvl) => {
  const w = wIlvl || lv;
  return {
    hp: 60 + 18 * (lv - 1) + (15 + 3 * w),
    atkMin: 5 + 1.5 * (lv - 1) + (4 + 0.2 * w),
    atkMax: 5 + 1.5 * (lv - 1) + (8 + 0.4 * w),
    defMin: 3 + (lv - 1) + (2 + 0.2 * w),
    defMax: 3 + (lv - 1) + (4 + 0.4 * w),
  };
};
const needExp = (lv) => Math.round(180 * Math.pow(1.2, lv - 1));

// ---------- 输出 ----------
const L = [];
L.push('# 临时对照数据\n');

L.push('## 1. 升级经验（到下一级）\n');
L.push('| 级 | 我们 | 传奇 Exps.conf | 倍数 |');
L.push('|---|---|---|---|');
for (let lv = 1; lv <= 30; lv++) {
  const a = needExp(lv), b = expTable[lv];
  L.push(`| ${lv} | ${fmt(a)} | ${b ? fmt(b) : '-'} | ${b ? (a / b).toFixed(2) + '×' : '-'} |`);
}
let sumA = 0, sumB = 0;
for (let lv = 1; lv <= 29; lv++) { sumA += needExp(lv); sumB += expTable[lv] || 0; }
L.push(`\n1→30 累计：我们 **${fmt(sumA)}**，传奇 **${fmt(sumB)}**（${(sumA / sumB).toFixed(1)}×）\n`);

L.push('## 2. 同名/近级怪物\n');
L.push('| 怪 | 传奇 Lv | 传奇 HP | 传奇 防/魔防 | 传奇 攻 | 传奇 经验 | 我们 Lv | 我们 HP | 我们 防 | 我们 攻 | 我们 经验 |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
const nameMap = [
  ['鸡', '鸡'], ['稻草人', '稻草人'], ['狼', '野狼'], ['蝙蝠', '血蝠'], ['尸王', '尸鬼'],
];
for (const [mirName, ourName] of nameMap) {
  const r = monsters.find((x) => x.name === mirName);
  const ourLv = { 鸡: 1, 稻草人: 3, 野狼: 11, 血蝠: 25, 尸鬼: 21 }[ourName];
  const o = ourMon(ourLv);
  if (!r) continue;
  L.push(`| ${ourName} | ${r.lv} | ${r.hp} | ${r.ac}/${r.mac} | ${r.dc}-${r.dcmax} | ${r.exp} | ${ourLv} | ${fmt(o.hp)} | ${fmt(o.def)} | ${fmt(o.atk)} | ${fmt(o.exp)} |`);
}
L.push('\n（传奇只有「鸡 / 稻草人 / 狼 / 蝙蝠 / 尸王」，野狗野猪是我们自己加的）\n');

L.push('## 3. 怪物曲线（按等级，传奇取同段中位数）\n');
L.push('| Lv | 传奇 HP 中位 | 传奇 经验 中位 | 我们 HP | 我们 经验 | 我们 HP/经验 |');
L.push('|---|---|---|---|---|---|');
for (let lv = 5; lv <= 45; lv += 5) {
  const band = monsters.filter((m) => m.lv >= lv - 2 && m.lv <= lv + 2 && m.exp > 0 && m.hp > 0 && m.hp < 5000);
  const med = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const mh = med(band.map((m) => m.hp));
  const me = med(band.map((m) => m.exp));
  const o = ourMon(lv);
  L.push(`| ${lv} | ${fmt(mh)} | ${fmt(me)} | ${fmt(o.hp)} | ${fmt(o.exp)} | ${(o.hp / o.exp).toFixed(1)} |`);
}

L.push('\n## 4. 每级要杀多少只（同级怪）\n');
L.push('| Lv | 我们 需求经验 | 我们 单只经验 | 我们 只数 | 传奇 需求 | 传奇 单只经验 | 传奇 只数 |');
L.push('|---|---|---|---|---|---|---|');
for (let lv = 1; lv <= 30; lv++) {
  const band = monsters.filter((m) => m.lv >= lv - 2 && m.lv <= lv + 2 && m.exp > 0 && m.hp > 0);
  const med = (arr) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const me = med(band.map((m) => m.exp));
  const oe = ourMon(lv).exp;
  const a = needExp(lv) / oe;
  const b = expTable[lv] && me ? expTable[lv] / me : 0;
  L.push(`| ${lv} | ${fmt(needExp(lv))} | ${fmt(oe)} | ${a.toFixed(1)} | ${expTable[lv] ? fmt(expTable[lv]) : '-'} | ${me ? fmt(me) : '-'} | ${me ? b.toFixed(1) : '-'} |`);
}

// ---------- 装备 ----------
const byName = new Map(items.map((i) => [i.Name, i]));
const showItems = (label, names) => {
  L.push(`\n### ${label}\n`);
  L.push('| 名字 | 需求等级 | 攻 DC | 防 AC | 魔防 MAC | 道 SC | 重量 | 价格 |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const n of names) {
    const it = byName.get(n);
    if (!it) { L.push(`| ${n} | - | - | - | - | - | - | - |`); continue; }
    L.push(`| ${it.Name} | ${it.NeedLevel} | ${it.Dc}-${it.DcMax} | ${it.Ac}-${it.AcMax} | ${it.Mac}-${it.MacMax} | ${it.Sc}-${it.ScMax} | ${it.Weight} | ${it.Price} |`);
  }
};
L.push('\n## 5. 装备（传奇原表）\n');
showItems('武器', ['木剑', '短剑', '青铜剑', '铁剑', '偃月', '凌风', '凝霜', '炼狱', '裁决之杖', '屠龙']);
showItems('衣服 / 头盔', ['布衣(男)', '轻型盔甲(男)', '中型盔甲(男)', '重型盔甲(男)', '幽灵战衣(男)', '战神盔甲(男)', '道士头盔', '魔法头盔']);
showItems('首饰', ['金项链', '黑檀项链', '竹笛', '放大镜', '铁戒指', '金戒指', '力量戒指', '珊瑚戒指']);

// 我们的装备
L.push('\n### 我们的装备（同 ilvl，白装区间）\n');
L.push('| ilvl | 武器 攻 | 护甲 防 | 护甲 HP | 手套 防 | 头盔 防 |');
L.push('|---|---|---|---|---|---|');
for (const lv of [1, 5, 10, 15, 20, 25, 30]) {
  const w = [Math.round(4 + 0.2 * lv), Math.round(8 + 0.4 * lv)];
  const a = [Math.round(2 + 0.2 * lv), Math.round(4 + 0.4 * lv)];
  const hp = Math.round(15 + 3 * lv);
  const g = [Math.round((2 + 0.2 * lv) * 0.55), Math.round((4 + 0.4 * lv) * 0.55)];
  const h = [Math.round((2 + 0.2 * lv) * 0.55), Math.round((4 + 0.4 * lv) * 0.55)];
  L.push(`| ${lv} | ${w[0]}-${w[1]} | ${a[0]}-${a[1]} | ${hp} | ${g[0]}-${g[1]} | ${h[0]}-${h[1]} |`);
}

// ---------- 技能 ----------
L.push('\n## 6. 传奇技能表（战士 / 道士，Lv≤35）\n');
L.push('| 技能 | 职业 | 1 级 | 2 级 | 3 级 | 威力 | 耗蓝 | 延迟 |');
L.push('|---|---|---|---|---|---|---|---|');
const jobName = { 0: '战士', 1: '法师', 2: '道士' };
for (const m of magics) {
  const job = +m.Job;
  if (job !== 0 && job !== 2) continue;
  const l1 = +m.NeedL1;
  if (!l1 || l1 > 35) continue;
  L.push(`| ${m.MagName} | ${jobName[job]} | ${m.NeedL1} | ${m.NeedL2} | ${m.NeedL3} | ${m.Power}-${m.MaxPower} | ${m.Spell} | ${m.Delay} |`);
}

fs.writeFileSync('tmp/mir2/compare.md', L.join('\n'), 'utf8');
console.log(L.join('\n'));

// ---------- 7. 刀数：不同 HP 曲线 ----------
const atkMeanAt = (lv) => 5 + 1.5 * (lv - 1) + (4 + 0.2 * lv + 8 + 0.4 * lv) / 2;
const defAt = (lv) => 2 * Math.pow(1.075, lv);
const hits = (lv, hpFn) => hpFn(lv) / Math.max(1, atkMeanAt(lv) - defAt(lv));
console.log('\n## 7. 每只怪要砍几刀（含白装武器）\n');
console.log('| Lv | 当前 1.16 | 1.13 | 1.12 | 1.10 |');
console.log('|---|---|---|---|---|');
for (const lv of [1, 5, 10, 15, 20, 25, 30]) {
  const f = (k) => (18 * Math.pow(k, lv));
  console.log(`| ${lv} | ${hits(lv, () => f(1.16)).toFixed(1)} | ${hits(lv, () => f(1.13)).toFixed(1)} | ${hits(lv, () => f(1.12)).toFixed(1)} | ${hits(lv, () => f(1.10)).toFixed(1)} |`);
}

// ---------- 8. 装备占比 ----------
console.log('\n## 8. 装备占攻击/防御的比例（白装）\n');
console.log('| Lv | 基础攻 | 武器均值 | 装备占比 | 基础防 | 护甲均值 | 装备占比 |');
console.log('|---|---|---|---|---|---|---|');
for (const lv of [1, 5, 10, 15, 20, 25, 30]) {
  const baseAtk = 5 + 1.5 * (lv - 1);
  const wMean = (4 + 0.2 * lv + 8 + 0.4 * lv) / 2;
  const baseDef = 3 + (lv - 1);
  const aMean = (2 + 0.2 * lv + 4 + 0.4 * lv) / 2;
  console.log(`| ${lv} | ${baseAtk.toFixed(1)} | ${wMean.toFixed(1)} | ${(wMean / (baseAtk + wMean) * 100).toFixed(0)}% | ${baseDef} | ${aMean.toFixed(1)} | ${(aMean / (baseDef + aMean) * 100).toFixed(0)}% |`);
}

// ---------- 9. 技能：道士 ----------
console.log('\n## 9. 道士技能（传奇，等级门槛）\n');
console.log('| 技能 | 1 级 | 2 级 | 3 级 | 耗蓝 | 延迟 |');
console.log('|---|---|---|---|---|---|');
for (const m of magics) {
  if (+m.Job !== 2) continue;
  if (+m.NeedL1 > 35 || !+m.NeedL1) continue;
  console.log(`| ${m.MagName} | ${m.NeedL1} | ${m.NeedL2} | ${m.NeedL3} | ${m.Spell} | ${m.Delay} |`);
}
