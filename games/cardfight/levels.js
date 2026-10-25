/* 卡牌战斗 · 20 关数据
   每关：敌人（怪物 art + 号位）、以及按关数算的成长倍率。
   数值只是第一版曲线，后面调 SLOT 里的 mult 就行。 */
(function (global) {
  'use strict';

  var CHAPTERS = ['试炼台', '苔庭', '熔岩坑', '夜翼崖'];

  var RAW = [
    [['mslime', 4]],
    [['mgolem', 2]],
    [['mgolem', 2], ['mslime', 4]],
    [['mbat', 3], ['mslime', 5]],
    [['mgolem', 2], ['mbat', 3], ['mslime', 4]],
    [['mgolem', 2], ['mgolem', 1]],
    [['mbat', 3], ['mbat', 5], ['mslime', 4]],
    [['mgolem', 2], ['mslime', 4], ['mslime', 5]],
    [['mgolem', 2], ['mbat', 3], ['mbat', 5], ['mslime', 4]],
    [['mgolem', 1], ['mgolem', 2], ['mslime', 4], ['mbat', 3]],
    [['mbat', 3], ['mbat', 5], ['mgolem', 2]],
    [['mgolem', 1], ['mgolem', 2], ['mslime', 4], ['mslime', 5]],
    [['mgolem', 2], ['mbat', 3], ['mbat', 5], ['mslime', 5]],
    [['mgolem', 1], ['mgolem', 2], ['mbat', 3], ['mslime', 4]],
    [['mgolem', 2], ['mgolem', 1], ['mbat', 3], ['mbat', 5]],
    [['mgolem', 1], ['mgolem', 2], ['mbat', 3], ['mbat', 5], ['mslime', 4]],
    [['mgolem', 1], ['mgolem', 2], ['mbat', 3], ['mbat', 5], ['mslime', 5]],
    [['mgolem', 1], ['mgolem', 2], ['mbat', 3], ['mslime', 4], ['mslime', 5]],
    [['mgolem', 1], ['mgolem', 2], ['mbat', 3], ['mbat', 5], ['mslime', 4]],
    [['mgolem', 1], ['mgolem', 2], ['mbat', 3], ['mbat', 5], ['mslime', 5]]
  ];

  var LEVELS = RAW.map(function (list, i) {
    var id = i + 1;
    var chapter = Math.min(4, Math.ceil(id / 5));
    return {
      id: id,
      chapter: chapter,
      chapterName: CHAPTERS[chapter - 1],
      name: CHAPTERS[chapter - 1],
      enemies: list.map(function (x) { return { art: x[0], slot: x[1] }; }),
      mult: { hp: 1 + (id - 1) * 0.10, atk: 1 + (id - 1) * 0.06 }
    };
  });

  function byId(id) {
    var n = parseInt(id, 10);
    if (!(n >= 1 && n <= LEVELS.length)) return null;
    return LEVELS[n - 1];
  }

  /* 敌人单位（数值按关卡倍率放大） */
  function enemyUnits(level) {
    return level.enemies.map(function (e, i) {
      var base = global.CF.MONSTERS[e.art];
      var hp = Math.round(base.hp * level.mult.hp);
      var atk = Math.round(base.atk * level.mult.atk);
      return {
        id: 'e' + i + '-' + e.art,
        art: e.art,
        name: base.name,
        img: base.img,
        side: 'enemy',
        row: e.slot <= 2 ? 'front' : 'back',
        slot: e.slot,
        col: e.slot <= 2 ? e.slot - 1 : e.slot - 4,
        atk: atk,
        hp: hp,
        maxHp: hp,
        rage: 0,
        rageSkill: base.rageSkill,
        alive: true
      };
    });
  }

  global.CF = global.CF || {};
  global.CF.LEVELS = LEVELS;
  global.CF.CHAPTERS = CHAPTERS;
  global.CF.levelById = byId;
  global.CF.enemyUnits = enemyUnits;
})(window);
