/* 豆豆暗黑传奇 · 核心工具层
   纯函数：随机、格子工具、装备属性、成长公式。
   不碰 DOM、不碰全局状态；需要玩家对象的地方显式传 p。
   装备属性是「区间」：atkMin/atkMax、defMin/defMax，旧存档的单值 atk/def 自动兼容。
*/
import { DL } from './namespace.js';
const global = globalThis;
  const growth = () => DL.DATA.GROWTH;

  /* ---------- 随机 ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const roll = (v) => v * (0.75 + Math.random() * 0.5);

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randomSeed = () => ((Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0);

  /* ---------- 格子 ---------- */
  const key = (x, y) => x + ',' + y;
  // 八向移动：距离用切比雪夫（斜一步 = 1），贴身/仇恨/寻路步数一致
  const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  /* ---------- 装备属性（区间） ---------- */
  const affixMult = (eq, id) =>
    eq && eq.affix && eq.affix.id === id ? 1 + eq.affix.pct : 1;

  const eqAtkMin = (eq) => (eq ? Math.round((eq.atkMin ?? eq.atk ?? 0) * affixMult(eq, 'sharp')) : 0);
  const eqAtkMax = (eq) => (eq ? Math.round((eq.atkMax ?? eq.atk ?? 0) * affixMult(eq, 'sharp')) : 0);
  const eqDefMin = (eq) => (eq ? Math.round((eq.defMin ?? eq.def ?? 0) * affixMult(eq, 'tough')) : 0);
  const eqDefMax = (eq) => (eq ? Math.round((eq.defMax ?? eq.def ?? 0) * affixMult(eq, 'tough')) : 0);
  const eqHp = (eq) => (eq && eq.hp) || 0;

  // 兼容旧调用：均值
  const eqAtk = (eq) => Math.round((eqAtkMin(eq) + eqAtkMax(eq)) / 2);
  const eqDef = (eq) => Math.round((eqDefMin(eq) + eqDefMax(eq)) / 2);
  const eqScore = (eq) => (eq ? eqAtk(eq) * 2 + eqDef(eq) * 1.5 + eqHp(eq) * 0.12 : 0);

  /* ---------- 多槽装备合计 ---------- */
  const equipSlots = () => (DL.DATA && DL.DATA.EQUIP_SLOTS) || [
    { id: 'weapon' }, { id: 'armor' },
  ];
  const wornEqs = (p) => equipSlots().map((s) => p[s.id]).filter(Boolean);
  const sumEqAtkMin = (p) => wornEqs(p).reduce((n, e) => n + eqAtkMin(e), 0);
  const sumEqAtkMax = (p) => wornEqs(p).reduce((n, e) => n + eqAtkMax(e), 0);
  const sumEqDefMin = (p) => wornEqs(p).reduce((n, e) => n + eqDefMin(e), 0);
  const sumEqDefMax = (p) => wornEqs(p).reduce((n, e) => n + eqDefMax(e), 0);
  const sumEqHp = (p) => wornEqs(p).reduce((n, e) => n + eqHp(e), 0);
  const sumEqAtk = (p) => Math.round((sumEqAtkMin(p) + sumEqAtkMax(p)) / 2);
  const sumEqDef = (p) => Math.round((sumEqDefMin(p) + sumEqDefMax(p)) / 2);

  /* ---------- 成长公式（显式传玩家对象） ---------- */
  const maxHp = (p) => growth().baseHp + growth().hpPerLv * (p.lv - 1) + sumEqHp(p);
  const maxMp = (p) => growth().baseMp + growth().mpPerLv * (p.lv - 1);
  const needExp = (p) => Math.round(growth().expBase * Math.pow(growth().expRate, p.lv - 1));

  const atkRange = (p) => {
    const base = Math.round(growth().baseAtk + growth().atkPerLv * (p.lv - 1));
    return { min: base + sumEqAtkMin(p), max: base + sumEqAtkMax(p) };
  };
  const defRange = (p) => {
    const base = Math.round(growth().baseDef + growth().defPerLv * (p.lv - 1));
    return { min: base + sumEqDefMin(p), max: base + sumEqDefMax(p) };
  };
  const atkMean = (p) => Math.round((atkRange(p).min + atkRange(p).max) / 2);
  const defMean = (p) => Math.round((defRange(p).min + defRange(p).max) / 2);

  /* ---------- 等级差查表 ----------
     gap = 玩家等级 − 怪等级；按表里阈值从低到高覆盖，取最后一个命中的倍率。 */
  function mulByGapTable(gap, table, fallback = 1) {
    const t = table || {};
    let mul = fallback;
    for (const k of Object.keys(t).map(Number).sort((a, b) => a - b)) {
      if (gap >= k) mul = t[k];
    }
    return mul;
  }

  // 经验：EXP_GAP，默认 gap≤3 全给、≥4 归零；越级不加成
  function expMulByGap(gap) {
    return mulByGapTable(gap, DL.DATA && DL.DATA.EXP_GAP, 1);
  }

  // 普通怪金币：GOLD_GAP_NORMAL，默认 ≥5 ×0.5、≥10 ×0
  function goldMulByGapNormal(gap) {
    return mulByGapTable(gap, DL.DATA && DL.DATA.GOLD_GAP_NORMAL, 1);
  }

  DL.Core = {
    rand, randi, clamp, roll, mulberry32, randomSeed,
    key, dist, manhattan,
    eqAtkMin, eqAtkMax, eqDefMin, eqDefMax, eqHp,
    eqAtk, eqDef, eqScore,
    wornEqs, sumEqAtkMin, sumEqAtkMax, sumEqDefMin, sumEqDefMax, sumEqHp, sumEqAtk, sumEqDef,
    maxHp, maxMp, atkRange, defRange, atkMean, defMean, needExp,
    expMulByGap, goldMulByGapNormal, mulByGapTable,
  };
