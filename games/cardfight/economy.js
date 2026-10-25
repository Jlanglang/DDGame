/* 卡牌战斗 · 金币与英雄等级
   规则：英雄等级只能花金币升，战斗只给金币、不给经验。
   账号「等级」= 初始拥有的英雄里最高的那个英雄等级（用来做解锁门槛）。 */
(function (global) {
  'use strict';

  var GOLD_KEY = 'cf.gold.v1';
  var LV_KEY = 'cf.heroLv.v1';
  var START_GOLD = 500;
  var MAX_LV = 30;

  function readGold() {
    try {
      var v = global.localStorage.getItem(GOLD_KEY);
      if (v == null) return START_GOLD;
      var n = parseInt(v, 10);
      return isFinite(n) && n >= 0 ? n : START_GOLD;
    } catch (e) {
      return START_GOLD;
    }
  }

  function writeGold(n) {
    try { global.localStorage.setItem(GOLD_KEY, String(n)); } catch (e) {}
  }

  function storedLevels() {
    try {
      var raw = global.localStorage.getItem(LV_KEY);
      var obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function levelOf(id) {
    var lv = storedLevels()[id];
    if (lv) return lv;
    var db = global.HERO_DB && global.HERO_DB[id];
    return db ? db.lv : 1;
  }

  /* 账号等级：只看初始拥有的英雄（A 档），否则会和解锁条件打转 */
  function playerLevel() {
    var list = global.HERO_LIST || [];
    var best = 0;
    list.forEach(function (id) {
      var h = global.HERO_DB[id];
      if (!h || h.unlockAt !== 0) return;
      best = Math.max(best, levelOf(id));
    });
    return best;
  }

  function cost(id) {
    return 30 + levelOf(id) * 12;
  }

  function upgrade(id) {
    var lv = levelOf(id);
    if (lv >= MAX_LV) return { ok: false, reason: '已经满级' };
    var c = cost(id);
    var gold = readGold();
    if (gold < c) return { ok: false, reason: '金币不够（还差 ' + (c - gold) + '）' };
    var m = storedLevels();
    m[id] = lv + 1;
    try { global.localStorage.setItem(LV_KEY, JSON.stringify(m)); } catch (e) {}
    writeGold(gold - c);
    return { ok: true, lv: lv + 1, cost: c };
  }

  function addGold(n) {
    var g = readGold() + Math.max(0, Math.round(n));
    writeGold(g);
    return g;
  }

  function stageReward(stageId) {
    return 40 + stageId * 12;
  }

  global.ECO = {
    START_GOLD: START_GOLD,
    MAX_LV: MAX_LV,
    gold: readGold,
    addGold: addGold,
    levelOf: levelOf,
    playerLevel: playerLevel,
    cost: cost,
    upgrade: upgrade,
    stageReward: stageReward
  };
})(window);
