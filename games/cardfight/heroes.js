/* 卡牌战斗 · 英雄池数据
   品质：SS 绿 / S 橙黄 / A 紫（颜色见 theme.css）
   unlockAt：0 = 初始拥有；N = 通关第 N 关解锁；不写 = 暂未开放
   等级：初始等级写在 lv，之后只能花金币升（见 economy.js） */
(function (global) {
  'use strict';

  var HERO_DB = {
    dajian: {
      name: '紫垣', q: 'A', lv: 15, role: '前排 · 坦克',
      face: 'faces/dajian.jpg', art: 'cutouts/actions/dajian-7.webp',
      unlockAt: 0, atk: 20, hp: 200,
      desc: '前排大剑，靠磐石架势顶住第一轮，护盾撑到自己下次普攻。',
      equip: [
        { slot: '武器', name: '镇岳重剑', lv: 12, q: 'S' },
        { slot: '护甲', name: '岩纹胸甲', lv: 10, q: 'A' },
        { slot: '饰品', name: '磐石护符', lv: 8, q: 'A' },
        { slot: '靴子', name: null, lv: 0, q: null }
      ]
    },
    aurora: {
      name: '极光', q: 'A', lv: 12, role: '后排 · 狙击',
      face: 'faces/aurora.jpg', art: 'cutouts/actions/aurora-1.webp',
      unlockAt: 0, atk: 30, hp: 100,
      desc: '后排狙击，落日狙击专挑对面后排，300% 攻击，后排没人就落空。',
      equip: [
        { slot: '武器', name: '潮汐法杖', lv: 11, q: 'S' },
        { slot: '护甲', name: '深蓝轻甲', lv: 9, q: 'A' },
        { slot: '饰品', name: '海月坠', lv: 7, q: 'SS' },
        { slot: '靴子', name: '踏浪靴', lv: 6, q: 'A' }
      ]
    },
    yueguang: {
      name: '银翎', q: 'A', lv: 10, role: '后排 · 爆发',
      face: 'faces/yueguang.jpg', art: 'cutouts/actions/yueguang-3.webp',
      unlockAt: 0, atk: 15, hp: 95,
      desc: '银发白羽、手持白龙杖的远程，后排斩杀位，等待技能实装。',
      equip: [
        { slot: '武器', name: '白龙杖', lv: 9, q: 'S' },
        { slot: '护甲', name: '雪羽纱', lv: 8, q: 'A' },
        { slot: '饰品', name: '星纹额饰', lv: 6, q: 'A' },
        { slot: '靴子', name: '踏云靴', lv: 5, q: 'A' }
      ]
    },
    chixing: {
      name: '月光', q: 'S', lv: 10, role: '后排 · 治疗',
      face: 'faces/chixing.jpg', art: 'cutouts/chixing.webp',
      unlockAt: 20, atk: 8, hp: 120,
      desc: '月华治愈拉自己这一排，每人 25% 最大生命，不打输出。',
      equip: [
        { slot: '武器', name: '月白短杖', lv: 8, q: 'A' },
        { slot: '护甲', name: '白羽长袍', lv: 7, q: 'A' },
        { slot: '饰品', name: null, lv: 0, q: null },
        { slot: '靴子', name: '软底靴', lv: 5, q: 'A' }
      ]
    },
    changhong: {
      name: '长虹', q: 'SS', lv: 9, role: '前排 · 群攻',
      face: 'faces/changhong.jpg', art: 'cutouts/changhong.webp',
      atk: 18, hp: 150,
      desc: '横扫一排：前排有人打前排，前排空了改打后排。',
      equip: [
        { slot: '武器', name: '长虹枪', lv: 9, q: 'S' },
        { slot: '护甲', name: '流云甲', lv: 6, q: 'A' },
        { slot: '饰品', name: null, lv: 0, q: null },
        { slot: '靴子', name: null, lv: 0, q: null }
      ]
    },
    kuoren: {
      name: '阔刃', q: 'S', lv: 8, role: '前排 · 横扫',
      face: 'faces/kuoren.jpg', art: 'cutouts/kuoren.webp',
      atk: 17, hp: 140,
      desc: '横扫前排：只扫前排，前排没人就落空，不改打后排。',
      equip: [
        { slot: '武器', name: '阔刃大刀', lv: 8, q: 'A' },
        { slot: '护甲', name: null, lv: 0, q: null },
        { slot: '饰品', name: null, lv: 0, q: null },
        { slot: '靴子', name: null, lv: 0, q: null }
      ]
    },
    yujin: {
      name: '余烬', q: 'S', lv: 7, role: '前排 · 斩杀',
      face: 'faces/yujin.jpg', art: 'cutouts/yujin.webp',
      atk: 16, hp: 130,
      desc: '斩杀追击：先打一下，击杀后追打剩余血最低的人。',
      equip: [
        { slot: '武器', name: '灰烬短刃', lv: 7, q: 'A' },
        { slot: '护甲', name: null, lv: 0, q: null },
        { slot: '饰品', name: null, lv: 0, q: null },
        { slot: '靴子', name: null, lv: 0, q: null }
      ]
    },
    zhenjia: {
      name: '真甲', q: 'S', lv: 6, role: '前排 · 护盾',
      face: 'faces/zhenjia.jpg', art: 'cutouts/zhenjia.webp',
      atk: 14, hp: 170,
      desc: '重甲前排，靠防御吃饭，暂时没有专属怒气技能。',
      equip: []
    },
    tiezhuang: {
      name: '铁装', q: 'SS', lv: 5, role: '前排 · 防御',
      face: 'faces/tiezhuang.jpg', art: 'cutouts/tiezhuang.webp',
      atk: 12, hp: 180,
      desc: '铁皮前排，暂时作为数值占位。',
      equip: []
    },
    gushou: {
      name: '孤守', q: 'S', lv: 4, role: '前排 · 反击',
      face: 'faces/gushou.jpg', art: 'cutouts/gushou.webp',
      atk: 13, hp: 150,
      desc: '独守一线，等待技能实装。',
      equip: []
    },
    candeng: {
      name: '残灯', q: 'S', lv: 3, role: '后排 · 辅助',
      face: 'faces/candeng.jpg', art: 'cutouts/candeng.webp',
      atk: 10, hp: 110,
      desc: '后排辅助，等待技能实装。',
      equip: []
    },
    zaochao: {
      name: '早朝', q: 'SS', lv: 3, role: '后排 · 群攻',
      face: 'faces/zaochao.jpg', art: 'cutouts/zaochao.webp',
      atk: 11, hp: 100,
      desc: '后排群攻，等待技能实装。',
      equip: []
    }
  };

  var HERO_LIST = [
    'dajian', 'aurora', 'yueguang', 'chixing', 'changhong', 'kuoren',
    'yujin', 'zhenjia', 'tiezhuang', 'gushou', 'candeng', 'zaochao'
  ];

  function isUnlocked(id) {
    var h = HERO_DB[id];
    if (!h) return false;
    if (h.unlockAt === 0) return true;                 // 初始拥有
    if (h.unlockAt > 0) return !!(global.CF && global.CF.isCleared(h.unlockAt));
    return false;                                      // 没写解锁条件 = 暂未开放
  }

  function lockText(id) {
    var h = HERO_DB[id] || {};
    if (h.unlockAt > 0) return '通关第 ' + h.unlockAt + ' 关解锁';
    return '暂未开放';
  }

  function unlockedCount() {
    return HERO_LIST.filter(isUnlocked).length;
  }

  function qualityText(q) { return q === 'SS' ? 'SS' : q === 'S' ? 'S' : 'A'; }

  global.HERO_DB = HERO_DB;
  global.HERO_LIST = HERO_LIST;
  global.HeroPool = {
    isUnlocked: isUnlocked,
    unlockedCount: unlockedCount,
    qualityText: qualityText,
    lockText: lockText
  };
})(window);
