/* 豆豆暗黑传奇 · 核心工具层
   纯函数：随机、格子工具、装备属性、成长公式。
   不碰 DOM、不碰全局状态；需要玩家对象的地方显式传 p。
   装备属性是「区间」：atkMin/atkMax、defMin/defMax，旧存档的单值 atk/def 自动兼容。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
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
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

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

  /* ---------- 成长公式（显式传玩家对象） ---------- */
  const maxHp = (p) => growth().baseHp + growth().hpPerLv * (p.lv - 1) + eqHp(p.armor);
  const maxMp = (p) => growth().baseMp + growth().mpPerLv * (p.lv - 1);
  const needExp = (p) => Math.round(growth().expBase * Math.pow(growth().expRate, p.lv - 1));

  const atkRange = (p) => {
    const base = Math.round(growth().baseAtk + growth().atkPerLv * (p.lv - 1));
    return { min: base + eqAtkMin(p.weapon), max: base + eqAtkMax(p.weapon) };
  };
  const defRange = (p) => {
    const base = Math.round(growth().baseDef + growth().defPerLv * (p.lv - 1));
    return { min: base + eqDefMin(p.armor), max: base + eqDefMax(p.armor) };
  };
  const atkMean = (p) => Math.round((atkRange(p).min + atkRange(p).max) / 2);
  const defMean = (p) => Math.round((defRange(p).min + defRange(p).max) / 2);

  /* ---------- 等级差经验（R2.11） ----------
     玩家比怪高的级差 gap，按 data.EXP_GAP 的表查倍率：gap ≤3 全给，7 级起归零。
     gap 可以为负（越级打怪），首版不给加成。 */
  function expMulByGap(gap) {
    const t = (DL.DATA && DL.DATA.EXP_GAP) || {};
    let mul = 1;
    for (const k of Object.keys(t).map(Number).sort((a, b) => a - b)) {
      if (gap >= k) mul = t[k];
    }
    return mul;
  }

  DL.Core = {
    rand, randi, clamp, roll, mulberry32, randomSeed,
    key, dist,
    eqAtkMin, eqAtkMax, eqDefMin, eqDefMax, eqHp,
    eqAtk, eqDef, eqScore,
    maxHp, maxMp, atkRange, defRange, atkMean, defMean, needExp,
    expMulByGap,
  };
})(typeof window !== 'undefined' ? window : globalThis);
