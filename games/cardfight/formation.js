/* 卡牌战斗 · 共享数据
   站位规则 / 英雄与怪物数据 / 阵容存档 / 进度存档
   主页面（index.html）和战斗页（battle.html）都引这一份 */
(function (global) {
  'use strict';

  /* ---------------- 站位规则（定稿） ----------------
     X 轴：1、3 是起点，2 的中心 = 1 的左切面，4 = 3，5 = 4（可见轮廓宽 / 2）
     3/4/5 整列再往对面挪半个圈（BACK_FWD）
     Y 轴：身位 120；3→4→5 每格 0.8 身位，远格 ×0.92、近格 ×1.08
     1 = 3 下方 0.75 格，2 = 4 下方 0.75 格
     透视：立绘远 0.86 → 近 1.0；横向步进 ±5%；地圈按 0.323 压扁
     -------------------------------------------------- */
  var BODY_H = 120;
  var STEP_Y = BODY_H * 0.8;
  var STAGGER = 0.75;
  var BACK_FWD = 36;
  var DEPTH_FAR = 0.86, DEPTH_NEAR = 1.0;
  var Y_FAR = 0.92, Y_NEAR = 1.08;
  var X_RAMP = 0.05;
  var FLOOR_RATIO = 0.323;
  var FAR_Y = 445, NEAR_Y = 637;

  var ANCHOR = {
    player: { 1: { left: 524 }, 3: { left: 358, bottom: 275 } },
    enemy: { 1: { left: 756 }, 3: { left: 922, bottom: 275 } }
  };

  var ART_W = {
    aurora: 0.760, dajian: 0.688, yueguang: 0.715,
    mgolem: 0.871, mslime: 0.787, mbat: 0.721
  };

  /* ---------------- 英雄 / 怪物 ---------------- */
  var HEROES = {
    dajian: {
      name: '紫垣', img: 'cutouts/actions/dajian-7.webp', atk: 20, hp: 200,
      rageSkill: 'guard', attackFrames: ['cutouts/actions/dajian-6.webp'],
      skillImg: 'cutouts/actions/dajian-7.webp',
      desc: '前排大剑，靠磐石架势顶住第一轮。'
    },
    aurora: {
      name: '极光', img: 'cutouts/actions/aurora-1.webp', atk: 30, hp: 100,
      rageSkill: 'back', attackFrames: ['cutouts/actions/aurora-attack.webp'],
      skillImg: 'cutouts/actions/aurora-9.webp',
      desc: '后排狙击，专挑对面后排下手。'
    },
    yueguang: {
      name: '银翎', img: 'cutouts/actions/yueguang-3.webp', atk: 15, hp: 95,
      rageSkill: 'execute', skillImg: 'cutouts/actions/yueguang-skill.webp',
      desc: '银发白羽的远程，后排斩杀位：先打一下，收掉人再追打残血。'
    }
  };
  var HERO_ORDER = ['dajian', 'aurora', 'yueguang'];
  // 月光那轮改身份留下的存档：chixing 现在叫月光但没解锁，读档时并回银翎
  var HERO_ID_ALIAS = { chixing: 'yueguang' };

  var MONSTERS = {
    mgolem: { name: '岩石傀儡', img: 'cutouts/monster-golem-clean.webp', atk: 14, hp: 160, rageSkill: 'front-sweep' },
    mslime: { name: '青苔史莱姆', img: 'cutouts/monster-slime-clean.webp', atk: 10, hp: 90, rageSkill: 'execute' },
    mbat: { name: '夜翼蝙蝠', img: 'cutouts/monster-bat-clean.webp', atk: 12, hp: 80, rageSkill: 'row-sweep' }
  };

  function widthOf(art) { return BODY_H * (ART_W[art] || 0.72); }

  function depthT(feetY) {
    return Math.max(0, Math.min(1, (feetY - FAR_Y) / (NEAR_Y - FAR_Y)));
  }

  function depthScale(feetY) {
    return DEPTH_FAR + (DEPTH_NEAR - DEPTH_FAR) * depthT(feetY);
  }

  /* slotW: {1: 宽, 3: 宽, 4: 宽}，由实际站在这些格子上的单位决定 */
  function computeSlots(side, slotW) {
    var a = ANCHOR[side];
    var dir = side === 'player' ? -1 : 1;
    var fwd = side === 'player' ? 1 : -1;
    var y3 = 720 - a[3].bottom;
    var stepA = STEP_Y * Y_FAR;
    var stepB = STEP_Y * Y_NEAR;
    var y4 = y3 + stepA;
    var y5 = y4 + stepB;
    var y1 = y3 + stepA * STAGGER;
    var y2 = y4 + stepB * STAGGER;
    var bx = a[3].left + fwd * BACK_FWD;

    function step(w, feetY) {
      return dir * w / 2 * (1 - X_RAMP + X_RAMP * 2 * depthT(feetY));
    }

    var p = {};
    p[1] = { left: a[1].left, bottom: 720 - y1 };
    p[2] = { left: a[1].left + step(slotW[1] || widthOf('x'), y1), bottom: 720 - y2 };
    p[3] = { left: bx, bottom: 720 - y3 };
    p[4] = { left: bx + step(slotW[3] || widthOf('x'), y3), bottom: 720 - y4 };
    p[5] = { left: p[4].left + step(slotW[4] || widthOf('x'), y4), bottom: 720 - y5 };
    return p;
  }

  /* ---------------- 阵容存档 ---------------- */
  var FORM_KEY = 'cf.formation.v1';

  function defaultFormation() {
    return [
      { hero: 'dajian', slot: 2 },
      { hero: 'aurora', slot: 3 },
      { hero: 'yueguang', slot: 5 }
    ];
  }

  function loadFormation() {
    try {
      var raw = global.localStorage.getItem(FORM_KEY);
      if (!raw) return defaultFormation();
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return defaultFormation();
      var seenSlot = {};
      var out = [];
      arr.forEach(function (it) {
        if (!it) return;
        var id = HERO_ID_ALIAS[it.hero] || it.hero;
        if (!HEROES[id]) return;
        var slot = parseInt(it.slot, 10);
        if (!(slot >= 1 && slot <= 5) || seenSlot[slot]) return;
        seenSlot[slot] = true;
        out.push({ hero: id, slot: slot });
      });
      return out.length ? out : defaultFormation();
    } catch (e) {
      return defaultFormation();
    }
  }

  function saveFormation(list) {
    try {
      global.localStorage.setItem(FORM_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------- 进度存档 ---------------- */
  var PROG_KEY = 'cf.progress.v1';

  function loadProgress() {
    try {
      var raw = global.localStorage.getItem(PROG_KEY);
      var obj = raw ? JSON.parse(raw) : null;
      if (!obj || !Array.isArray(obj.cleared)) return { cleared: [] };
      return { cleared: obj.cleared.filter(function (n) { return n >= 1 && n <= 20; }) };
    } catch (e) {
      return { cleared: [] };
    }
  }

  function saveProgress(p) {
    try { global.localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch (e) {}
  }

  function isCleared(id) { return loadProgress().cleared.indexOf(id) >= 0; }

  function isUnlocked(id) {
    if (id <= 1) return true;
    return isCleared(id - 1) || isCleared(id);
  }

  function markCleared(id) {
    var p = loadProgress();
    if (p.cleared.indexOf(id) < 0) {
      p.cleared.push(id);
      p.cleared.sort(function (a, b) { return a - b; });
      saveProgress(p);
    }
  }

  function nextUncleared() {
    var p = loadProgress();
    for (var i = 1; i <= 20; i += 1) {
      if (p.cleared.indexOf(i) < 0) return i;
    }
    return 20;
  }

  global.CF = {
    BODY_H: BODY_H, STEP_Y: STEP_Y, STAGGER: STAGGER, BACK_FWD: BACK_FWD,
    DEPTH_FAR: DEPTH_FAR, DEPTH_NEAR: DEPTH_NEAR, Y_FAR: Y_FAR, Y_NEAR: Y_NEAR,
    X_RAMP: X_RAMP, FLOOR_RATIO: FLOOR_RATIO,
    ANCHOR: ANCHOR, ART_W: ART_W,
    HEROES: HEROES, HERO_ORDER: HERO_ORDER, MONSTERS: MONSTERS,
    widthOf: widthOf, depthT: depthT, depthScale: depthScale, computeSlots: computeSlots,
    defaultFormation: defaultFormation, loadFormation: loadFormation, saveFormation: saveFormation,
    loadProgress: loadProgress, isCleared: isCleared, isUnlocked: isUnlocked,
    markCleared: markCleared, nextUncleared: nextUncleared
  };
})(window);
