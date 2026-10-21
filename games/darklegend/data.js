/* 豆豆暗黑传奇 · 数据层
   只放"表"和"常量"，不放逻辑。
   挂到 window.DL.DATA，game.js 顶部解构引用。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});

  DL.DATA = {
    /* ---------- 视口与存档 ---------- */
    TILE: 32,
    VIEW_W: 720,
    VIEW_H: 1120,
    BAG_MAX: 24,
    SAVE_KEY: 'darklegend-save-v2',
    LEGACY_KEY: 'darklegend-save-v1',
    IDLE_MS: 1000,

    /* ---------- 怪物表 ---------- */
    /* ---------- 怪物表（图 1：4 种 + 1 BOSS，每种 3 品级） ---------- */
    MON: [
      { id: 'chicken', name: '鸡', glyph: '🐔', lv: 1, aggro: 0 },
      { id: 'scarecrow', name: '稻草人', glyph: '🎃', lv: 3, aggro: 0 },
      { id: 'dog', name: '野狗', glyph: '🐕', lv: 5, aggro: 5 },
      { id: 'boar', name: '野猪', glyph: '🐗', lv: 7, aggro: 5 },
    ],
    BOSS: { id: 'boss', name: '巨型稻草人', glyph: '👹', lv: 10, aggro: 6 },

    /* 怪物品级：普通 / 精英 / 稀有（等级 +0/+1/+2，概率 94/5/1） */
    GRADE: {
      normal: { name: '', hp: 1, atk: 1, lvAdd: 0, p: 0.94, exp: 1 },
      elite: { name: '精英', hp: 3, atk: 1.4, lvAdd: 1, p: 0.05, exp: 3 },
      rare: { name: '稀有', hp: 8, atk: 1.8, lvAdd: 2, p: 0.01, exp: 6 },
      boss: { name: '', hp: 4, atk: 1.0, lvAdd: 0, p: 0, exp: 12 },
    },

    /* ---------- 稀有度 ---------- */
    RARITY: {
      white: { key: 'white', name: '普通', mult: 1 },
      blue: { key: 'blue', name: '魔法', mult: 1.15 },
      yellow: { key: 'yellow', name: '稀有', mult: 1.35 },
      orange: { key: 'orange', name: '传奇', mult: 1.5 },
    },

    /* ---------- 品质浮动概率（上下限各自独立；C/白不浮动） ---------- */
    FLOAT_P: { white: 0, blue: 0.2, yellow: 0.35, orange: 0.5 },
    FLOAT_MIN: 5,   // 下限最多 +5
    FLOAT_MAX: 10,  // 上限最多 +10

    /* ---------- 装备名 ---------- */
    WEAPON_NAMES: ['铁剑', '精铁剑', '裁决之刃'],
    ARMOR_NAMES: ['皮甲', '锁子甲', '重盔甲'],

    /* ---------- 商店 ---------- */
    SHOP: {
      potion: { price: 50, label: '药水' },
      sword: { price: 80, label: '铁剑' },
      armor: { price: 70, label: '皮甲' },
    },

    /* ---------- 小世界房间（从主城传送门进入） ---------- */
    ROOMS: [
      { id: 'field1', name: '鸡鸣村外', lvMin: 1, lvMax: 4, size: 24, layout: 'open', mobs: 10, cd: 0 },
      { id: 'field2', name: '荒田', lvMin: 5, lvMax: 8, size: 24, layout: 'open', mobs: 12, cd: 5 },
      { id: 'cave1', name: '稻草垛洞', lvMin: 7, lvMax: 10, size: 20, layout: 'cave', mobs: 3, boss: true, cd: 30 },
    ],

    /* ---------- 区域地面色 ---------- */
    ZONE_FLOOR: [
      '#1c2638', '#1d273a', '#1f283c', '#21293e', '#232a40',
      '#262b42', '#292c44', '#2d2d46', '#322e48', '#372f4a',
    ],

    /* ---------- 成长系数（公式在 core，数值在这） ---------- */
    GROWTH: {
      baseHp: 60, hpPerLv: 18,
      baseMp: 15, mpPerLv: 3,
      baseAtk: 5, atkPerLv: 1.5,
      baseDef: 3, defPerLv: 1,
      expBase: 100, expRate: 1.18,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
