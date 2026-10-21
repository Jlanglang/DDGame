/* 豆豆暗黑传奇 · 核心工具层
   纯函数：随机、格子工具、装备属性、成长公式。
   不碰 DOM、不碰全局状态；需要玩家对象的地方显式传 p。
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

  /* ---------- 装备 ---------- */
  function eqAtk(eq) {
    if (!eq) return 0;
    let v = eq.atk || 0;
    if (eq.affix && eq.affix.id === 'sharp') v *= 1 + eq.affix.pct;
    return Math.round(v);
  }
  function eqDef(eq) {
    if (!eq) return 0;
    let v = eq.def || 0;
    if (eq.affix && eq.affix.id === 'tough') v *= 1 + eq.affix.pct;
    return Math.round(v);
  }
  function eqHp(eq) { return (eq && eq.hp) || 0; }
  const eqScore = (eq) => (eq ? eqAtk(eq) * 2 + eqDef(eq) * 1.5 + eqHp(eq) * 0.12 : 0);

  /* ---------- 成长公式（显式传玩家对象） ---------- */
  const maxHp = (p) => growth().baseHp + growth().hpPerLv * (p.lv - 1) + eqHp(p.armor);
  const maxMp = (p) => growth().baseMp + growth().mpPerLv * (p.lv - 1);
  const atkMean = (p) => growth().baseAtk + growth().atkPerLv * (p.lv - 1) + eqAtk(p.weapon);
  const defMean = (p) => growth().baseDef + growth().defPerLv * (p.lv - 1) + eqDef(p.armor);
  const needExp = (p) => Math.round(growth().expBase * Math.pow(growth().expRate, p.lv - 1));

  DL.Core = {
    rand, randi, clamp, roll, mulberry32, randomSeed,
    key, dist,
    eqAtk, eqDef, eqHp, eqScore,
    maxHp, maxMp, atkMean, defMean, needExp,
  };
})(typeof window !== 'undefined' ? window : globalThis);
