/* 豆豆暗黑传奇 · 数据层
   只放"表"和"常量"，不放逻辑。
   挂到 window.DL.DATA，game.js 顶部解构引用。
*/
import { DL } from './namespace.js';
const global = globalThis;

  DL.DATA = {
    /* ---------- 存档 ---------- */
    /* TILE / VIEW_W / VIEW_H / TILEMAP 是已删除的 2D Canvas 模式留下的；
       3D 用 three-pick.js 的 48px/格，这里不再需要。 */
    /* 房间 → 地形主题。没写的用 field。主城固定 field。 */
    THEME_OF_ROOM: {
      field1: 'field', field2: 'field', field2b: 'field', field3: 'field',
      cave1: 'cave', field3b: 'cave', field4: 'cave', field6: 'cave',
      field4b: 'waste', cave3: 'waste', cave2: 'waste',
      field5: 'waste', field6b: 'waste', field7: 'waste',
    },
    BAG_MAX: 40,
    STASH_MAX: 100,
    SAVE_KEY: 'darklegend-save-v2',
    LEGACY_KEY: 'darklegend-save-v1',
    /* 战斗回合节奏 vs 移动节奏（移动不应跟砍怪一样慢） */
    COMBAT_MS: 1000,     // 默认攻击/技能/战斗中行动间隔（1 秒/刀）
    MOVE_MS: 180,        // 玩家走路节奏（快，便于风筝）
    ENEMY_ACT_MS: 1000,  // 怪追击/攻击：保持 1 秒最多 1 次（不随玩家加速）
    WALK_STEP_MS: 180,   // 对齐 R3.8 / MOVE_MS：0.18s/格；直斜同拍（传奇切比雪夫）
    IDLE_MS: 1000,       // 兼容旧名 = COMBAT_MS

    /* ---------- 挂机（R3.5） ---------- */
    /* 无经验/金币折扣：等级差惩罚已够；挂机与手打同收益，差在目标过滤与捡袋 */
    AUTO_FARM: {
      autoLootMax: 'yellow', // 自动捡袋：袋内最高稀有度 ≤ A；S（orange）不捡
    },

    /* ---------- 技能书 ---------- */
    /* 指定首领 10% 掉对应书；掉进地面袋，捡起才学会；书是 S，挂机不捡 */
    SKILL_BOOK: {
      chance: 0.10, // 每次击杀对应首领的掉书概率
      byBossLv: {
        20: 'half',  // 山大王 → 半月弯刀
        30: 'fire',  // 血月怨主 → 烈火剑法
      },
    },

    /* ---------- 被动技能 ---------- */
    PASSIVES: [
      { id: 'swordMaster', name: '剑术精通', unlockLv: 10, desc: '攻速 ×2' },
    ],
    /* 技能真实 CD（毫秒）：按玩家当前攻速换算回合，保证实际时间不因攻速减半 */
    SKILL_CD_MS: { half: 2000, fire: 3000 },

    /* ---------- 技能书商人（M1.47）：城东书商，只卖两本技能书 ---------- */
    BOOK_SHOP: {
      half: { name: '半月弯刀', price: 30000 },
      fire: { name: '烈火剑法', price: 100000 },
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
    /* atkMin/atkMax：固定攻击区间（鸡啄 1–3，不走通用公式） */
    /* gold/goldP：单独定金币区间与掉落概率（不写就按等级通用公式、必掉） */
    MON: [
      { id: 'chicken', name: '鸡', glyph: '🐔', lv: 1, aggro: 0, ai: 'passive', atkMin: 1, atkMax: 3, gold: [1, 5], goldP: 0.6, mat: 'meat' },
      { id: 'scarecrow', name: '稻草人', glyph: '🎃', lv: 3, aggro: 0, ai: 'passive', mat: 'straw' },
      { id: 'dog', name: '野狗', glyph: '🐕', lv: 5, aggro: 5, ai: 'active', mat: 'fur' },
      { id: 'boar', name: '野猪', glyph: '🐗', lv: 7, aggro: 5, ai: 'active', mat: 'hide' },
      { id: 'wolf', name: '野狼', glyph: '🐺', lv: 11, aggro: 6, ai: 'active', mat: 'fang' },
      { id: 'stone', name: '石魔', glyph: '🗿', lv: 15, aggro: 4, ai: 'active', mat: 'stone' },
      { id: 'ghoul', name: '尸鬼', glyph: '🧟', lv: 21, aggro: 5, ai: 'active', mat: 'bone' },
      { id: 'bat', name: '血蝠', glyph: '🦇', lv: 25, aggro: 6, ai: 'active', mat: 'wing' },
      { id: 'wraith', name: '怨灵', glyph: '👻', lv: 29, aggro: 5, ai: 'active', mat: 'essence' },
      { id: 'spider', name: '蜘蛛', glyph: '🕷️', lv: 13, aggro: 5, ai: 'active', mat: 'silk' },
      { id: 'bandit', name: '山贼', glyph: '🥷', lv: 18, aggro: 6, ai: 'active', mat: 'rag' },
      { id: 'mummy', name: '木乃伊', glyph: '🪦', lv: 24, aggro: 5, ai: 'active', mat: 'bandage' },
      { id: 'demon', name: '恶魔', glyph: '😈', lv: 27, aggro: 6, ai: 'active', mat: 'horn' },
    ],
    BOSS: { id: 'boss', name: '巨型稻草人', glyph: '👹', lv: 10, aggro: 0, ai: 'passive' },

    /* ---------- 材料（怪物特色掉落：10% 自动拾取、可堆叠、可出售） ---------- */
    MATS: {
      meat: { name: '鸡肉', price: 2 },
      straw: { name: '稻草', price: 3 },
      fur: { name: '狗毛', price: 5 },
      hide: { name: '猪皮', price: 7 },
      fang: { name: '狼牙', price: 11 },
      silk: { name: '蛛丝', price: 13 },
      stone: { name: '石块', price: 15 },
      rag: { name: '破布', price: 18 },
      bone: { name: '腐骨', price: 21 },
      bandage: { name: '绷带', price: 24 },
      wing: { name: '蝠翼', price: 25 },
      horn: { name: '魔角', price: 27 },
      essence: { name: '怨气', price: 29 },
    },
    MAT_DROP_P: 0.10,

    /* ---------- 试炼官任务（M1.61）：3 次 1 轮，难度递增，第 3 次给经验球 ---------- */
    TRIAL: {
      stages: 3,
      rewardPct: [0.04, 0.06, 0.09], // 试炼是调剂：经验只占小头
      goldBase: 100,
      goldPerLv: 20,
      collectNeed: [3, 6, 10],
      killNeed: [5, 10, 15],
      orbPct: 0.2,      // 经验球：当前等级 20% 经验
      orbBlueP: 0.5,    // 每轮最后：50% 蓝装 / 50% 经验球
      gearGoldMul: 0.5, // 装备路线金币减半
    },

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
      /* 首领血量偏厚：同级拉扯约 1～2 分钟，打得久才有击杀期待感 */
      boss: { name: '', color: '#ff8a3d', hp: 10, atk: 1.35, lvAdd: 0, p: 0, exp: 12 },
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
    /* 1–10 级怪：普通/精英不掉 A（见 game 掉落分支）；11+ 才开普通 A / 精英 A */
    DROP: {
      normal: { c: 0.03, b: 0.008, a: 0.002, s: 0.0001 }, // 下调：早期别刷出一地蓝黄
      elite: { a: 0.08, s: 0.002 },     // 必掉 B；11+ 才 roll A
      rare: { s: 0.03 },                // 必掉 A
      boss: { s: 0.06 },                // 必掉 B + A
      potion: 0.18,                     // 普通击杀掉初级红药
      potionCrush: 0.03,                // 碾压时
      potionBlueShare: 0.25,            // 掉药时改掉初级蓝的比例
    },

    /* ---------- 药水（R10.9）：三档固定点数；红价=点数，蓝价=红×2 ---------- */
    POTIONS: {
      cd: 3,
      cdMs: 3000,        // 药水真实冷却 3 秒（不随攻速变）
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
      { id: 'glovesL', name: '手套·左', group: 'armor', unlock: 10, ico: '🧤' },
      { id: 'glovesR', name: '手套·右', group: 'armor', unlock: 10, ico: '🧤' },
      { id: 'shoes', name: '鞋子', group: 'armor', unlock: 10, ico: '👢' },
      { id: 'helmet', name: '头盔', group: 'armor', unlock: 20, ico: '⛑' },
      { id: 'necklace', name: '项链', group: 'jewelry', unlock: 30, dropAt: 25, ico: '📿' },
      { id: 'earring', name: '耳环', group: 'jewelry', unlock: 30, dropAt: 25, ico: '✦' },
      { id: 'ringL', name: '戒指·左', group: 'jewelry', unlock: 40, ico: '💍' },
      { id: 'ringR', name: '戒指·右', group: 'jewelry', unlock: 40, ico: '💍' },
    ],
    /* 掉落部位权重：武器 < 首饰 < 防具 */
    DROP_SLOT_WEIGHT: { weapon: 1, jewelry: 2, armor: 3 },
    /* 底材固定等级（M1.40）：每槽每 10 级 3 档（段首/段中/段尾）
       ilvl 是底材的固定等级，也是穿戴需求；怪等级只决定掉“≤ 怪等级”的最高档。
       同名底材永远只对应一个 ilvl，不会出现“裁决之刃 Lv.8 / Lv.9”。 */
    EQUIP_BASES: {
      weapon: [
        { ilvl: 1, name: '铁剑' },
        { ilvl: 5, name: '精铁剑' },
        { ilvl: 10, name: '青铜剑' },
        { ilvl: 11, name: '玄铁剑' },
        { ilvl: 15, name: '寒光剑' },
        { ilvl: 20, name: '赤血剑' },
        { ilvl: 21, name: '龙骨剑' },
        { ilvl: 25, name: '血饮' },
        { ilvl: 30, name: '裁决之刃' },
        { ilvl: 40, name: '屠龙' },
      ],
      armor: [
        { ilvl: 1, name: '皮甲' },
        { ilvl: 5, name: '锁子甲' },
        { ilvl: 10, name: '青铜甲' },
        { ilvl: 11, name: '玄铁甲' },
        { ilvl: 15, name: '寒光甲' },
        { ilvl: 20, name: '赤血甲' },
        { ilvl: 21, name: '龙骨甲' },
        { ilvl: 25, name: '血饮甲' },
        { ilvl: 30, name: '天尊道袍' },
      ],
      gloves: [
        { ilvl: 1, name: '布手套' },
        { ilvl: 5, name: '皮手套' },
        { ilvl: 10, name: '锁甲手套' },
        { ilvl: 11, name: '玄铁护手' },
        { ilvl: 15, name: '寒光护手' },
        { ilvl: 20, name: '赤血护手' },
        { ilvl: 21, name: '龙骨护手' },
        { ilvl: 25, name: '血饮护手' },
        { ilvl: 30, name: '天尊护手' },
      ],
      shoes: [
        { ilvl: 1, name: '布鞋' },
        { ilvl: 5, name: '皮靴' },
        { ilvl: 10, name: '锁甲靴' },
        { ilvl: 11, name: '玄铁靴' },
        { ilvl: 15, name: '寒光靴' },
        { ilvl: 20, name: '赤血靴' },
        { ilvl: 21, name: '龙骨靴' },
        { ilvl: 25, name: '血饮靴' },
        { ilvl: 30, name: '天尊战靴' },
      ],
      helmet: [
        { ilvl: 1, name: '布帽' },
        { ilvl: 5, name: '皮帽' },
        { ilvl: 10, name: '铁盔' },
        { ilvl: 11, name: '玄铁盔' },
        { ilvl: 15, name: '寒光盔' },
        { ilvl: 20, name: '赤血盔' },
        { ilvl: 21, name: '龙骨盔' },
        { ilvl: 25, name: '血饮盔' },
        { ilvl: 30, name: '天尊盔' },
      ],
      necklace: [
        { ilvl: 1, name: '铜项链' },
        { ilvl: 5, name: '银项链' },
        { ilvl: 10, name: '金项链' },
        { ilvl: 11, name: '玄铁项链' },
        { ilvl: 15, name: '寒光项链' },
        { ilvl: 20, name: '赤血项链' },
        { ilvl: 21, name: '龙骨项链' },
        { ilvl: 25, name: '血饮项链' },
        { ilvl: 30, name: '天尊项链' },
      ],
      earring: [
        { ilvl: 1, name: '木耳环' },
        { ilvl: 5, name: '银耳环' },
        { ilvl: 10, name: '金耳环' },
        { ilvl: 11, name: '玄铁耳环' },
        { ilvl: 15, name: '寒光耳环' },
        { ilvl: 20, name: '赤血耳环' },
        { ilvl: 21, name: '龙骨耳环' },
        { ilvl: 25, name: '血饮耳环' },
        { ilvl: 30, name: '天尊耳环' },
      ],
      ring: [
        { ilvl: 1, name: '铜戒' },
        { ilvl: 5, name: '银戒' },
        { ilvl: 10, name: '金戒' },
        { ilvl: 11, name: '玄铁戒' },
        { ilvl: 15, name: '寒光戒' },
        { ilvl: 20, name: '赤血戒' },
        { ilvl: 21, name: '龙骨戒' },
        { ilvl: 25, name: '血饮戒' },
        { ilvl: 30, name: '天尊戒' },
      ],
    },

    /* 底材名：按品质档 0=白 1=蓝 2=黄/橙取名 */
    EQUIP_NAMES: {
      weapon: ['铁剑', '精铁剑', '裁决之刃'],
      armor: ['皮甲', '锁子甲', '重盔甲'],
      gloves: ['布手套', '皮手套', '精钢护手'],
      shoes: ['布鞋', '皮靴', '战靴'],
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
      shoes: { atk: 0, def: 0.55, hp: 0.2 },
      helmet: { atk: 0, def: 0.55, hp: 0.25 },
      necklace: { atk: 0, def: 0.2, hp: 0.45 },
      earring: { atk: 0.35, def: 0.15, hp: 0 },
      ring: { atk: 0.35, def: 0.2, hp: 0 },
    },

    /* ---------- 商店（药水价由 POTIONS 推，见 game.buyPotion） ---------- */
    SHOP: {
      sword: { price: 80, label: '铁剑' },
      armor: { price: 70, label: '皮甲' },
      townScroll: { price: 100, label: '回城卷' },
    },

    /* ---------- 小世界房间（从主城传送门进入） ---------- */
    /* pool：这个房间刷哪些怪（按 id 查 MON），每道门怪不一样 */
    /* lvMin/lvMax：门口标签显示的范围，含品级 +0/+2 */
    /* 进房限制（R11.14）：只能进 lvMin ≤ 自身等级 + slack 的图 */
    ROOM_ENTER_SLACK: 10,
    ROOMS: [
      // 1–10：每张地图只刷一种怪；普通怪等级固定，精英 +1、稀有 +2
      { id: 'field1', name: '鸡鸣村外', pool: ['chicken'], lvMin: 1, lvMax: 3, size: 24, layout: 'open', mobs: 10, cd: 0 },
      { id: 'field2', name: '荒田', pool: ['scarecrow'], lvMin: 3, lvMax: 5, size: 24, layout: 'open', mobs: 11, cd: 0 },
      { id: 'field2b', name: '荒田深处', pool: ['dog'], lvMin: 5, lvMax: 7, size: 24, layout: 'open', mobs: 11, cd: 0 },
      { id: 'cave1', name: '稻草垛洞', pool: ['boar'], lvMin: 7, lvMax: 9, size: 20, layout: 'cave', mobs: 3, boss: true, bossLv: 10, cd: 20 },
      // 10–20
      { id: 'field3', name: '狼谷', pool: ['wolf'], lvMin: 11, lvMax: 13, size: 26, layout: 'open', mobs: 12, cd: 0 },
      { id: 'field3b', name: '蛛网洞', pool: ['spider'], lvMin: 13, lvMax: 15, size: 26, layout: 'open', mobs: 12, cd: 0 },
      { id: 'field4', name: '石魔矿洞', pool: ['stone'], lvMin: 15, lvMax: 17, size: 26, layout: 'open', mobs: 12, cd: 0 },
      { id: 'field4b', name: '山贼营地', pool: ['bandit'], lvMin: 17, lvMax: 19, size: 26, layout: 'open', mobs: 12, cd: 0 },
      { id: 'cave3', name: '山贼寨', pool: ['bandit'], lvMin: 19, lvMax: 21, size: 20, layout: 'cave', mobs: 4, boss: true, bossLv: 20, bossName: '山大王', bossGlyph: '🪓', cd: 20 },
      // 20–30
      { id: 'cave2', name: '古墓', pool: ['ghoul'], lvMin: 21, lvMax: 23, size: 22, layout: 'cave', mobs: 4, boss: true, bossLv: 25, bossName: '古墓尸王', bossGlyph: '💀', cd: 25 },
      { id: 'field5', name: '木乃伊墓室', pool: ['mummy'], lvMin: 23, lvMax: 25, size: 26, layout: 'open', mobs: 13, cd: 0 },
      { id: 'field6', name: '血蝠洞', pool: ['bat'], lvMin: 25, lvMax: 27, size: 26, layout: 'open', mobs: 13, cd: 0 },
      { id: 'field6b', name: '恶魔祭坛', pool: ['demon'], lvMin: 27, lvMax: 29, size: 26, layout: 'open', mobs: 13, cd: 0 },
      { id: 'field7', name: '血月荒原', pool: ['wraith'], lvMin: 29, lvMax: 31, size: 22, layout: 'cave', mobs: 4, boss: true, bossLv: 30, bossName: '血月怨主', bossGlyph: '👻', cd: 30 },
    ],

    /* ---------- 等级差经验（R2.2c） ----------
       玩家比怪高的级差 gap ≥ 表里的值，就乘对应倍率；gap ≤3 全给。
       鸡 lv1：玩家 5 级起 0 经验 —— 能练到 5 级，再刷就是白打。 */
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
