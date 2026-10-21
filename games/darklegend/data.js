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
    /* 战斗回合节奏 vs 移动节奏（移动不应跟砍怪一样慢） */
    COMBAT_MS: 1000,     // 攻击/技能/战斗中行动间隔
    MOVE_MS: 180,        // 玩家走路节奏（快，便于风筝）
    ENEMY_ACT_MS: 1000,  // 怪追击/攻击：真实 1 秒最多 1 次（可躲开）
    WALK_STEP_MS: 70,    // 点地寻路每格动画间隔
    IDLE_MS: 1000,       // 兼容旧名 = COMBAT_MS

    /* ---------- 挂机（R3.5） ---------- */
    /* 无经验/金币折扣：等级差惩罚已够；挂机与手打同收益，差在目标过滤与捡袋 */
    AUTO_FARM: {
      autoLootMax: 'blue',   // 自动捡袋：袋内最高稀有度 ≤ 此档；yellow/orange 不捡
    },

    /* ---------- 房内刷新（R11.7） ---------- */
    RESPAWN: {
      normalDelayMs: 5000,   // 普通怪死亡后真实 5 秒再补 1 只（不主动维持密度）
      minDist: 4,            // 刷怪距玩家最少格数
      /* 随机保底：进房/刷出后掷阈值 ∈[1, pityMax]，杀普通数达到阈值必出（不满员才计数） */
      elitePityMax: 50,      // 50 只以内必出 1 精英
      eliteCap: 2,
      rarePityMax: 200,      // 200 只以内必出 1 稀有
      rareCap: 1,
      bossDefaultCd: 20,
    },

    /* ---------- 怪物表（图 1：4 种 + 1 BOSS，每种 3 品级） ---------- */
    /* ai：passive 被动（不主动、挨打才还手、追 3 格就放弃）/ active 主动（进 aggro 半径就追） */
    /* BOSS 也是 passive：不主动追；挨打后还手，且激怒后持续追（combat.decide 特例） */
    /* harmless：打玩家 0 伤害（新手兜底，鸡专用） */
    /* gold/goldP：单独定金币区间与掉落概率（不写就按等级通用公式、必掉） */
    MON: [
      { id: 'chicken', name: '鸡', glyph: '🐔', lv: 1, aggro: 0, ai: 'passive', harmless: true, gold: [1, 5], goldP: 0.6 },
      { id: 'scarecrow', name: '稻草人', glyph: '🎃', lv: 3, aggro: 0, ai: 'passive' },
      { id: 'dog', name: '野狗', glyph: '🐕', lv: 5, aggro: 5, ai: 'active' },
      { id: 'boar', name: '野猪', glyph: '🐗', lv: 7, aggro: 5, ai: 'active' },
    ],
    BOSS: { id: 'boss', name: '巨型稻草人', glyph: '👹', lv: 10, aggro: 0, ai: 'passive' },

    /* 怪物 AI 与 BOSS 出招（数值可调） */
    AI: {
      leash: 14,             // 超出这个距离脱战
      passiveChase: 3,       // 被动怪挨打后追到 3 格就放弃
      bossStunP: 0.18,       // BOSS 相邻攻击时：眩晕 1 回合（受击解除）
      bossParalyzeP: 0.12,   // 其次：麻痹 1–2 回合
      bossParalyzeMin: 1,
      bossParalyzeMax: 2,
    },

    /* 怪物品级：普通 / 精英 / 稀有（等级 +0/+1/+2，概率 94/5/1） */
    /* color：名字染色，让玩家一眼看出是精英还是稀有 */
    GRADE: {
      normal: { name: '', color: '#c6cfdf', hp: 1, atk: 0.8, lvAdd: 0, p: 0.94, exp: 1 },
      elite: { name: '精英', color: '#4a9eff', hp: 3, atk: 1.2, lvAdd: 1, p: 0.05, exp: 3 },
      rare: { name: '稀有', color: '#ffd54a', hp: 8, atk: 1.6, lvAdd: 2, p: 0.01, exp: 6 },
      boss: { name: '', color: '#ff8a3d', hp: 4, atk: 1.4, lvAdd: 0, p: 0, exp: 12 },
    },

    /* 碾压：高多少级后怪打玩家无伤；收益大幅衰减，但保底保留 */
    CRUSH: {
      earlyGap: 10,    // 1–29 级：差 10 级碾压
      lateGap: 5,      // 30 级起：差 5 级碾压
      lateFrom: 30,
      goldMul: 0.1,    // 金币 ×0.1
      dropMul: 0.1,    // 普通掉落概率 ×0.1（精英/稀有保底不受影响）
    },

    /* ---------- 稀有度 ---------- */
    /* letter：界面上用 C/B/A/S 标出来，不只靠颜色 */
    RARITY: {
      white: { key: 'white', letter: 'C', name: '普通', mult: 1, color: '#b8c0cc' },
      blue: { key: 'blue', letter: 'B', name: '魔法', mult: 1.15, color: '#4a9eff' },
      yellow: { key: 'yellow', letter: 'A', name: '稀有', mult: 1.35, color: '#ffd54a' },
      orange: { key: 'orange', letter: 'S', name: '传奇', mult: 1.5, color: '#ff8a3d' },
    },

    /* ---------- 掉落概率（R9，v16 收紧 S） ---------- */
    /* 普通怪一条 roll 走累计判定；精英/稀有/BOSS 有保底，S 单独 roll */
    DROP: {
      normal: { c: 0.05, b: 0.02, a: 0.005, s: 0.0002 },
      elite: { a: 0.10, s: 0.002 },     // 必掉 B
      rare: { s: 0.03 },                // 必掉 A
      boss: { s: 0.06 },                // 必掉 B + A
      potion: 0.18,                     // 普通击杀掉初级红药
      potionCrush: 0.03,                // 碾压时
      potionBlueShare: 0.25,            // 掉药时改掉初级蓝的比例
    },

    /* ---------- 药水（R10.9）：三档固定点数；红价=点数，蓝价=红×2 ---------- */
    POTIONS: {
      cd: 3,
      tiers: [
        { id: 'low', name: '初级', amount: 50 },
        { id: 'mid', name: '中级', amount: 300 },
        { id: 'high', name: '高级', amount: 1000 },
      ],
      redMul: 1,
      blueMul: 2,
    },

    /* ---------- 死亡惩罚（R3.19） ---------- */
    DEATH: {
      dropP: 0.5,        // 掉装备的概率
      expLoss: 0.05,     // 掉当前等级经验的 5%
    },

    /* ---------- 品质浮动概率（上下限各自独立；C/白不浮动） ---------- */
    FLOAT_P: { white: 0, blue: 0.2, yellow: 0.35, orange: 0.5 },
    FLOAT_MIN: 5,   // 下限最多 +5
    FLOAT_MAX: 10,  // 上限最多 +10

    /* ---------- 装备槽（R7.1 / R7.1b）：按玩家等级解锁穿戴；怪等级解锁掉落 ---------- */
    /* group：掉落权重组 weapon < jewelry < armor */
    EQUIP_SLOTS: [
      { id: 'weapon', name: '武器', group: 'weapon', unlock: 0, ico: '⚔' },
      { id: 'armor', name: '护甲', group: 'armor', unlock: 0, ico: '🛡' },
      { id: 'gloves', name: '手套', group: 'armor', unlock: 10, ico: '🧤' },
      { id: 'helmet', name: '头盔', group: 'armor', unlock: 20, ico: '⛑' },
      { id: 'necklace', name: '项链', group: 'jewelry', unlock: 30, ico: '📿' },
      { id: 'earring', name: '耳环', group: 'jewelry', unlock: 30, ico: '✦' },
      { id: 'ring', name: '戒指', group: 'jewelry', unlock: 40, ico: '💍' },
    ],
    /* 掉落部位权重：武器 < 首饰 < 防具 */
    DROP_SLOT_WEIGHT: { weapon: 1, jewelry: 2, armor: 3 },
    /* 底材名：按品质档 0=白 1=蓝 2=黄/橙取名 */
    EQUIP_NAMES: {
      weapon: ['铁剑', '精铁剑', '裁决之刃'],
      armor: ['皮甲', '锁子甲', '重盔甲'],
      gloves: ['布手套', '皮手套', '精钢护手'],
      helmet: ['布帽', '铁盔', '战盔'],
      necklace: ['铜项链', '银项链', '金项链'],
      earring: ['木耳环', '银耳环', '玉耳环'],
      ring: ['铜戒', '银戒', '金戒'],
    },
    /* 兼容旧引用 */
    WEAPON_NAMES: ['铁剑', '精铁剑', '裁决之刃'],
    ARMOR_NAMES: ['皮甲', '锁子甲', '重盔甲'],
    /* 各槽基础倍率（相对武器攻 / 护甲防·HP）；首饰 M1 给弱基础，词缀 M2 */
    EQUIP_STAT_MUL: {
      weapon: { atk: 1, def: 0, hp: 0 },
      armor: { atk: 0, def: 1, hp: 1 },
      gloves: { atk: 0, def: 0.55, hp: 0 },
      helmet: { atk: 0, def: 0.55, hp: 0.25 },
      necklace: { atk: 0, def: 0.2, hp: 0.45 },
      earring: { atk: 0.35, def: 0.15, hp: 0 },
      ring: { atk: 0.35, def: 0.2, hp: 0 },
    },

    /* ---------- 商店（药水价由 POTIONS 推，见 game.buyPotion） ---------- */
    SHOP: {
      sword: { price: 80, label: '铁剑' },
      armor: { price: 70, label: '皮甲' },
    },

    /* ---------- 小世界房间（从主城传送门进入） ---------- */
    /* pool：这个房间刷哪些怪（按 id 查 MON），每道门怪不一样 */
    /* lvMin/lvMax：门口标签显示的范围，含品级 +0/+2 */
    ROOMS: [
      { id: 'field1', name: '鸡鸣村外', pool: ['chicken', 'scarecrow'], lvMin: 1, lvMax: 5, size: 24, layout: 'open', mobs: 10, cd: 0 },
      { id: 'field2', name: '荒田', pool: ['scarecrow', 'dog'], lvMin: 3, lvMax: 7, size: 24, layout: 'open', mobs: 12, cd: 5 },
      { id: 'cave1', name: '稻草垛洞', pool: ['boar'], lvMin: 7, lvMax: 10, size: 20, layout: 'cave', mobs: 3, boss: true, cd: 20 },
    ],

    /* ---------- 等级差经验（R2.2c） ----------
       玩家比怪高的级差 gap ≥ 表里的值，就乘对应倍率；gap ≤3 全给。
       鸡 lv1：玩家 5 级起 0 经验 —— 能无伤刷到 5 级，再刷就是白打。 */
    EXP_GAP: { 4: 0 },

    /* ---------- 普通怪金币等级差（与经验分开） ----------
       只卡普通怪；精英/稀有/BOSS 不受影响。 */
    GOLD_GAP_NORMAL: { 5: 0.5, 10: 0 },

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
      /* 有挂机后拉高升级需求，拉长可玩时长（约 ×1.8～2 于旧曲线） */
      expBase: 180, expRate: 1.20,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
