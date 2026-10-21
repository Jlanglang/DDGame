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
    MON: [
      { id: 'chicken', name: '鸡', glyph: '🐔', aggro: 0 },
      { id: 'rat', name: '田鼠', glyph: '🐭', aggro: 0 },
      { id: 'dog', name: '野狗', glyph: '🐕', aggro: 5 },
      { id: 'bee', name: '蜜蜂', glyph: '🐝', aggro: 5 },
      { id: 'scarecrow', name: '稻草人', glyph: '🎃', aggro: 0 },
      { id: 'boar', name: '野猪', glyph: '🐗', aggro: 5 },
      { id: 'queen', name: '蜂后', glyph: '🐝', aggro: 5 },
      { id: 'treant', name: '树精', glyph: '🌳', aggro: 5 },
    ],
    BOSS: { id: 'boss', name: '巨型稻草人', glyph: '👹', aggro: 6 },

    /* ---------- 稀有度 ---------- */
    RARITY: {
      white: { key: 'white', name: '普通', mult: 1 },
      blue: { key: 'blue', name: '魔法', mult: 1.15 },
      yellow: { key: 'yellow', name: '稀有', mult: 1.35 },
    },

    /* ---------- 装备名 ---------- */
    WEAPON_NAMES: ['铁剑', '精铁剑', '裁决之刃'],
    ARMOR_NAMES: ['皮甲', '锁子甲', '重盔甲'],

    /* ---------- 商店 ---------- */
    SHOP: {
      potion: { price: 50, label: '药水' },
      sword: { price: 80, label: '铁剑' },
      armor: { price: 70, label: '皮甲' },
    },

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
