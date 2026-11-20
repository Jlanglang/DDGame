/* ============================================================
   守护豆豆 · 小队模式 · 数据层
   ------------------------------------------------------------
   兵种 / 稀有度 / 全局数值 / 波次曲线 / BOSS 全在这一个文件。
   改数值、调平衡只动这里；squad.js 只读，不写数值。

   零构建：squad.html 里按 order 先加载本文件，再加载 squad.js。
   ============================================================ */

(() => {
  'use strict';

  /* 每个兵种占的格子不一样：格子从「容量」变成「拼图」，布阵才有取舍。
     每格输出大致拉平（6~9 dps/格），大单位靠射程 / 穿透 / 溅射赚回占地。
     hp = 1 星基础血；dmg = 0 的是辅助位，靠光环吃饭。 */
  const KINDS = [
    { id: 'rifle', name: '步枪兵', role: '持续输出', color: '#5ec8f0', deep: '#1d6c92', dmg: 5, rate: 1.4, range: 520, pellets: 1, hp: 110, w: 1, h: 1, weight: 1, unlock: 1,
      skill: '精准射击', desc: '均衡的单体枪手，射程内优先打最靠前的敌人，靠高射速压线。' },
    { id: 'shot', name: '霰弹兵', role: '近战群攻', color: '#ffb066', deep: '#a9642a', dmg: 3.2, rate: 1.7, range: 300, pellets: 3, hp: 340, w: 1, h: 2, weight: 0.4, unlock: 1,
      skill: '扇形霰弹', desc: '近距离扇形喷子，站前排清小怪；占 1×2 格，血厚。' },
    { id: 'snipe', name: '狙击手', role: '远程穿透', color: '#c79bff', deep: '#6b4a9e', dmg: 32, rate: 0.55, range: 950, pellets: 1, pierce: 1, hp: 80, w: 2, h: 1, weight: 0.26, unlock: 2,
      skill: '穿透弹', desc: '超远射程，一发打穿一排；占 2×1 格，脆，要放后排。' },
    { id: 'cannon', name: '重炮手', role: '范围重炮', color: '#ff8f6b', deep: '#a34a2c', dmg: 85, rate: 0.38, range: 780, pellets: 1, splash: 90, hp: 460, w: 2, h: 2, weight: 0.11, unlock: 2,
      skill: '爆裂弹', desc: '慢速高伤，命中后溅射一片；占 2×2 格，是阵地核心。' },
    { id: 'medic', name: '医务兵', role: '治疗光环', color: '#7ee8a2', deep: '#2f7d4f', dmg: 0, rate: 0, range: 0, hp: 120, w: 1, h: 1, weight: 0.5, unlock: 3, heal: 0.012,
      skill: '战地急救', desc: '全队每秒回血，自己不吃自己的奶；血线压力大时必带。' },
    { id: 'engineer', name: '工程师', role: '减伤光环', color: '#9fb8d8', deep: '#4a5f7d', dmg: 0, rate: 0, range: 0, hp: 140, w: 1, h: 1, weight: 0.5, unlock: 3, armor: 0.06,
      skill: '工事加固', desc: '每个工程师给全队减伤，多个叠加有上限；前排抗线的底气。' },
    { id: 'advisor', name: '战争顾问', role: '经济', color: '#ffd166', deep: '#a8862a', dmg: 0, rate: 0, range: 0, hp: 100, w: 1, h: 1, weight: 0.5, unlock: 4, coin: 0.35,
      skill: '战地预算', desc: '战斗中持续产金币；越早上场，滚雪球越快。' },
    { id: 'drum', name: '鼓号手', role: '攻速光环', color: '#ff8fb8', deep: '#a84a6d', dmg: 0, rate: 0, range: 0, hp: 110, w: 1, h: 1, weight: 0.5, unlock: 4, haste: 0.07,
      skill: '冲锋号', desc: '全队攻速提升，多个鼓号叠加；适合围着一堆输出位放。' },
    { id: 'laser', name: '激光射手', role: '穿透激光', color: '#8ff0ff', deep: '#2f7f9e', dmg: 20, rate: 0.85, range: 700, pellets: 1, pierce: 3, hp: 90, w: 2, h: 1, weight: 0.22, unlock: 5,
      skill: '激光束', desc: '高射程、多穿透，专门打一条走廊上的密集队列。' },
    { id: 'mortar', name: '迫击炮手', role: '远程溅射', color: '#ffb38a', deep: '#a35a2c', dmg: 120, rate: 0.32, range: 820, pellets: 1, splash: 120, hp: 520, w: 2, h: 2, weight: 0.1, unlock: 5,
      skill: '覆盖炮击', desc: '大范围迫击炮，压密集波；慢，但一发能清一片。' },
  ];

  /* 格子卡（2026-11-20 主人定，原版设计）：格子本身也是抽到的拼图块。
     开局只给中心 3×3，刷新可能抽到 1~4 格的形状，拖到棋盘边上摆好就解锁。 */
  const CELL_SHAPES = [
    { id: 'c1', name: '1 格', weight: 1.4, cells: [[0, 0]] },
    { id: 'c2h', name: '2 格 横', weight: 1.2, cells: [[0, 0], [0, 1]] },
    { id: 'c2v', name: '2 格 竖', weight: 1.2, cells: [[0, 0], [1, 0]] },
    { id: 'c3l', name: '3 格 L', weight: 0.8, cells: [[0, 0], [0, 1], [1, 1]] },
    { id: 'c4', name: '4 格 方块', weight: 0.6, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  ];

  // 稀有度：C-B-A-S-SS ↔ 白板-蓝-紫-金-红。  // 「更强」不靠数字，靠三件事一起拉：描边加粗、外发光变强、高档加双色渐变。
  const RARITY = [
    { tier: 'C',  color: '#d3dbe6', edge: '#8fa0b8', fill: 'rgba(211,219,230,0.10)', glow: 4,  w: 2.5 },
    { tier: 'B',  color: '#4fb8f0', edge: '#2a7fb8', fill: 'rgba(79,184,240,0.12)',  glow: 8,  w: 3.0 },
    { tier: 'A',  color: '#b487ff', edge: '#7442cc', fill: 'rgba(180,135,255,0.14)', glow: 14, w: 3.5 },
    { tier: 'S',  color: '#ffcc44', edge: '#c98f10', fill: 'rgba(255,204,68,0.16)',  glow: 22, w: 4.5 },
    { tier: 'SS', color: '#ff5b5b', edge: '#c21f3a', fill: 'rgba(255,91,91,0.18)',   glow: 32, w: 5.5 },
  ];

  /* 全局数值（可被 --tune / __SQUAD_TUNE 覆盖） */
  const TUNE = {
    // 2026-11-20 主人定：10 关内容相同，压成「1 个世界 = 5 关」，
    // 世界 2 换场景/新兵种，不再靠同一套背景重复 10 遍。
    stages: 5,             // 第一世界 5 关
    worldName: '街区',      // 第一世界场景名（世界 2 换场景时改这里）
    waves: 15,             // 每关 15 波（2026-11-20 从 20 波缩）
    startCoins: 25,
    refreshCost: 14,       // 2026-11-20 难度回调：14 起、每次 +8（原 10/+5 太便宜）
    refreshStep: 8,
    freeBenchPerClear: 1,  // 清波只白送 1 个候选（原来整批免费刷 3 个，太强）
    countBase: 12,         // 数量是「压力」不是难度旋钮：12 起，第 20 波 80 个
    countPerWave: 3.5,
    hpBase: 9,
    hpGrowth: 1.24,
    speedBase: 52,
    speedPerWave: 3,
    spawnBase: 0.55,
    spawnDrop: 0.02,
    starGrowth: 2.2,
    // 敌人防御：越往后越硬。难度靠「血量 + 防御」拉，不靠堆数量（2026-11-20 主人定）
    enemyArmorPerWave: 0.004,
    enemyArmorPerStage: 0.015,
    enemyArmorMax: 0.4,
    // 升级：杀怪攒经验，每关最多 10 次升级（2026-11-20 主人：20 级弹得太烦），升级才弹三选一
    // 经验曲线按「一关 15 波全清 ≈ 满 10 级」配：Σ(40+4lv)=580，一关约 588 杀
    levelCap: 10,
    xpBase: 40,
    xpPerLevel: 4,
    xpBoss: 5,
    // 卡片星级门槛：压成 5 关后节奏一起压：第 2 关起 2 星、第 4 关起 3 星
    star2FromStage: 2,
    star3FromStage: 4,
    // 金币只有三源：战争顾问上场（KINDS[].coin）、清波奖励、三选一补给；
    // 没有「每秒自动产」的基础收入——准备阶段时间冻结，一分钱都不涨。
    waveBonusBase: 5,
    waveBonusPer: 1,
    // 关卡难度：原来 10 关 ×1.1 → 总 2.36 倍；压成 5 关后改成 ×1.24，总跨度不变。
    // 玩家这边也同步加速：5 关内从 Lv3 点到 Lv10（原来要 10 关）。
    stageHpMul: 1.24,
    stageAtkMul: 1.1,
    stageSpeedMul: 1.03,
    // 格子摆放解锁（2026-11-20 主人定，原版设计）：格子也是一种卡片。
    // 开局只给中心 3×3；刷新会抽到 1~4 格的拼图块，拖到棋盘边上摆好就解锁。
    openColsByStage: [3, 4, 5, 5, 5],   // 旧版按列解锁，保留给 headless 兼容
    cellStart: 3,                       // 开局开放中心 3×3
    cellCardChance: 0.22,               // 每次刷新出「格子卡」的概率（格子越满越低）
    // 强化点（2026-11-20 主人定，v0.16）：
    // - 1 点 = 1 级；不再有固定等级加成，改成玩家自选「攻击 / 血量 / 防御」加点。
    // - 每点收益按兵种基数折算成固定值（攻击/血量 = 基数 8%，防御 = 1% 减伤），好控制。
    // - 每关首通发点；点数总量远小于「全兵种点满」，所以必须选。
    pointsPerStage: [6, 8, 10, 12, 14],      // 第 1..5 关首通各发多少点，合计 50
    attrCapByCleared: [4, 8, 12, 16, 20],    // 已通关 0..5 关时，单个兵种最多能加多少点
    // 每点属性：攻击 / 血量按兵种基数的 20%，防御每点 +2% 减伤
    attrPct: { dmg: 0.2, hp: 0.2 },
    defPct: 0.02,
    // 单项上限：攻击 / 血量 / 防御各最多 10 点
    attrCapEach: { dmg: 10, hp: 10, def: 10 },
    // 技能节点（2026-11-20 主人：「强化强的是技能」）：
    // 每个兵种 4 个技能节点，独立花点解锁，不再绑等级；2/3/4/5，共 14 点/兵。
    // 属性点管底子（攻/血/防），技能管质变，同一份强化点抢着用。
    skillCost: [2, 3, 4, 5],
    // 单位生存：每星 +180% 血；敌人围上来打人
    unitHpStar: 1.8,
    enemyAtkBase: 7.5,
    enemyAtkGrowth: 1.1,
    enemyAtkCd: 1.0,
    enemyReach: 0.55,      // 敌人碰到单位格子多深算贴身（格高比例）
    enemyR: 18,            // 小兵半径：和单位本体（约 38 直径）一个量级，不再是小点
  };

  /* BOSS：小 BOSS 穿插在第 5/10/15 波，大 BOSS 压第 20 波。
     「波数 = 同样时间里压过来多少敌人」，BOSS 是这一波的重心。
     没有基地血量：不管小兵还是 BOSS，漏过去就输。 */
  const BOSS = {
    minor: {
      waves: [5, 9, 13],
      hpMul: 28, speedMul: 0.75, atkMul: 1.5, r: 26, armor: 0.08,
      color: '#c05cff', deep: '#5b1f8a',
    },
    major: {
      wave: 15,
      hpMul: 60, speedMul: 0.6, atkMul: 2.2, r: 38, armor: 0.18,
      color: '#ff3b3b', deep: '#7a1414',
    },
  };

  /* 进度条上的波次标记（给 UI 用） */
  const isBossWave = (n) => BOSS.minor.waves.includes(n) || n === BOSS.major.wave;

  /* 养成专精：每个兵种一条独立里程碑（Lv5 / 7 / 9 / 10），2026-11-20 改。
     ------------------------------------------------------------
     为什么不共用一套：辅助位（医务 / 工程师 / 顾问 / 鼓号）没有伤害、射程、
     弹道，共用「攻速→射程→伤害→弹道」等于 4 个节点全空，专精白点。

     调研结论（见 docs/原版玩法调研.md「专精」一节）：
     - 原版每个兵种有 1–5 级「可激活特性」，招牌特性按兵种走
       （3 星狙击蓄力穿透、霰弹击退、迫击炮重伤、鼓号充能）。
     - 同类成熟做法（Rush Royale 天赋树）：节点只加强该单位本来就有的动词。
     所以这里不新增战斗系统，只把现有 effect 管线按兵种重新排：
       rate / range / dmg / hp       → 倍率
       pellets / pierce              → 加数
       splash / heal / armor / coin / haste → 光环/弹道倍率
     每级节点的 lv 仍是 5 / 7 / 9 / 10，和合成上限节点对齐。 */
  const MASTERY = {
    rifle: [
      { lv: 5, key: 'rate', mul: 1.15, text: '攻速 +15%' },
      { lv: 7, key: 'dmg', mul: 1.20, text: '伤害 +20%' },
      { lv: 9, key: 'range', mul: 1.15, text: '射程 +15%' },
      { lv: 10, key: 'pellets', add: 1, text: '弹道 +1' },
    ],
    shot: [
      { lv: 5, key: 'pellets', add: 1, text: '弹丸 +1' },
      { lv: 7, key: 'dmg', mul: 1.20, text: '伤害 +20%' },
      { lv: 9, key: 'range', mul: 1.15, text: '射程 +15%' },
      { lv: 10, key: 'pellets', add: 1, text: '弹丸 +1' },
    ],
    snipe: [
      { lv: 5, key: 'pierce', add: 1, text: '穿透 +1' },
      { lv: 7, key: 'dmg', mul: 1.30, text: '伤害 +30%' },
      { lv: 9, key: 'range', mul: 1.20, text: '射程 +20%' },
      { lv: 10, key: 'pierce', add: 1, text: '穿透 +1' },
    ],
    cannon: [
      { lv: 5, key: 'splash', mul: 1.25, text: '溅射范围 +25%' },
      { lv: 7, key: 'dmg', mul: 1.25, text: '伤害 +25%' },
      { lv: 9, key: 'splash', mul: 1.25, text: '溅射范围 +25%' },
      { lv: 10, key: 'dmg', mul: 1.30, text: '伤害 +30%' },
    ],
    medic: [
      { lv: 5, key: 'heal', mul: 1.30, text: '治疗 +30%' },
      { lv: 7, key: 'heal', mul: 1.30, text: '治疗 +30%' },
      { lv: 9, key: 'heal', mul: 1.35, text: '治疗 +35%' },
      { lv: 10, key: 'heal', mul: 1.40, text: '治疗 +40%' },
    ],
    engineer: [
      { lv: 5, key: 'armor', mul: 1.25, text: '减伤 +25%' },
      { lv: 7, key: 'armor', mul: 1.25, text: '减伤 +25%' },
      { lv: 9, key: 'armor', mul: 1.30, text: '减伤 +30%' },
      { lv: 10, key: 'armor', mul: 1.35, text: '减伤 +35%' },
    ],
    advisor: [
      { lv: 5, key: 'coin', mul: 1.30, text: '产币 +30%' },
      { lv: 7, key: 'coin', mul: 1.30, text: '产币 +30%' },
      { lv: 9, key: 'coin', mul: 1.35, text: '产币 +35%' },
      { lv: 10, key: 'coin', mul: 1.40, text: '产币 +40%' },
    ],
    drum: [
      { lv: 5, key: 'haste', mul: 1.25, text: '攻速光环 +25%' },
      { lv: 7, key: 'haste', mul: 1.25, text: '攻速光环 +25%' },
      { lv: 9, key: 'haste', mul: 1.30, text: '攻速光环 +30%' },
      { lv: 10, key: 'haste', mul: 1.35, text: '攻速光环 +35%' },
    ],
    laser: [
      { lv: 5, key: 'pierce', add: 1, text: '穿透 +1' },
      { lv: 7, key: 'dmg', mul: 1.20, text: '伤害 +20%' },
      { lv: 9, key: 'pierce', add: 1, text: '穿透 +1' },
      { lv: 10, key: 'range', mul: 1.15, text: '射程 +15%' },
    ],
    mortar: [
      { lv: 5, key: 'splash', mul: 1.25, text: '溅射范围 +25%' },
      { lv: 7, key: 'dmg', mul: 1.20, text: '伤害 +20%' },
      { lv: 9, key: 'splash', mul: 1.25, text: '溅射范围 +25%' },
      { lv: 10, key: 'dmg', mul: 1.30, text: '伤害 +30%' },
    ],
  };

  /* 升级三选一词条池（2026-11-20 调研后重做）
     ------------------------------------------------------------
     参考：Vampire Survivors 升级抽 3~4 张、不重复、满级项不再出现；
     远征三选一用「稀有度 + 权重」抽且互不重复；原版是升级/过关给 Buff。
     这里只给「本局 buff」，按玩家等级解锁稀有度，避免前期直接刷出超模词条。
       tier 1 普通：Lv1 起
       tier 2 稀有：Lv5 起
       tier 3 史诗：Lv10 起
     only 字段：只对拥有该特性的兵种出现（穿透/溅射/治疗/减伤/产币/攻速光环）。 */
  const AFFIX = [
    { tier: 1, minLv: 1, name: '强化弹头', stat: 'dmg', mul: 1.20, text: '伤害 +20%' },
    { tier: 1, minLv: 1, name: '快速装填', stat: 'rate', mul: 1.15, text: '攻速 +15%' },
    { tier: 1, minLv: 1, name: '加长枪管', stat: 'range', mul: 1.12, text: '射程 +12%' },
    { tier: 1, minLv: 1, name: '防弹背心', stat: 'hp', mul: 1.15, text: '生命 +15%' },
    { tier: 1, minLv: 1, name: '战地补给', flat: 25, text: '金币 +25' },

    { tier: 2, minLv: 4, name: '穿甲弹', stat: 'dmg', mul: 1.35, text: '伤害 +35%' },
    { tier: 2, minLv: 4, name: '过载枪机', stat: 'rate', mul: 1.25, text: '攻速 +25%' },
    { tier: 2, minLv: 4, name: '高倍瞄具', stat: 'range', mul: 1.20, text: '射程 +20%' },
    { tier: 2, minLv: 4, name: '加厚护甲', stat: 'hp', mul: 1.25, text: '生命 +25%' },
    { tier: 2, minLv: 4, name: '双联弹道', stat: 'pellets', add: 1, text: '弹道 +1' },
    { tier: 2, minLv: 4, name: '穿甲弹芯', stat: 'pierce', add: 1, text: '穿透 +1', only: 'pierce' },
    { tier: 2, minLv: 4, name: '高爆装药', stat: 'splash', mul: 1.20, text: '溅射 +20%', only: 'splash' },
    { tier: 2, minLv: 4, name: '急救包', stat: 'heal', mul: 1.35, text: '治疗 +35%', only: 'heal' },
    { tier: 2, minLv: 4, name: '加固工事', stat: 'armor', mul: 1.30, text: '减伤 +30%', only: 'armor' },
    { tier: 2, minLv: 4, name: '战时预算', stat: 'coin', mul: 1.35, text: '产币 +35%', only: 'coin' },
    { tier: 2, minLv: 4, name: '战鼓', stat: 'haste', mul: 1.30, text: '攻速光环 +30%', only: 'haste' },
    { tier: 2, minLv: 4, name: '军饷', flat: 50, text: '金币 +50' },

    { tier: 3, minLv: 7, name: '破甲重弹', stat: 'dmg', mul: 1.60, text: '伤害 +60%' },
    { tier: 3, minLv: 7, name: '极限射速', stat: 'rate', mul: 1.40, text: '攻速 +40%' },
    { tier: 3, minLv: 7, name: '狙击镜', stat: 'range', mul: 1.30, text: '射程 +30%' },
    { tier: 3, minLv: 7, name: '重型护甲', stat: 'hp', mul: 1.35, text: '生命 +35%' },
    { tier: 3, minLv: 7, name: '三连弹道', stat: 'pellets', add: 1, text: '弹道 +1' },
    { tier: 3, minLv: 7, name: '钨芯穿甲', stat: 'pierce', add: 2, text: '穿透 +2', only: 'pierce' },
    { tier: 3, minLv: 7, name: '巨型装药', stat: 'splash', mul: 1.35, text: '溅射 +35%', only: 'splash' },
    { tier: 3, minLv: 7, name: '野战医院', stat: 'heal', mul: 1.50, text: '治疗 +50%', only: 'heal' },
    { tier: 3, minLv: 7, name: '要塞工事', stat: 'armor', mul: 1.40, text: '减伤 +40%', only: 'armor' },
    { tier: 3, minLv: 7, name: '战争金库', stat: 'coin', mul: 1.50, text: '产币 +50%', only: 'coin' },
    { tier: 3, minLv: 7, name: '总攻号', stat: 'haste', mul: 1.40, text: '攻速光环 +40%', only: 'haste' },
    { tier: 3, minLv: 7, name: '战争经费', flat: 100, text: '金币 +100' },
  ];

  const DATA = {
    KINDS, CELL_SHAPES, RARITY, TUNE, BOSS, MASTERY, AFFIX, isBossWave,
    // 强化点：累计能拿到多少点 / 已通关数对应的等级上限
    totalPoints: () => TUNE.pointsPerStage.reduce((a, b) => a + b, 0),
    lvCapOf: (cleared) => TUNE.lvCapByCleared[Math.max(0, Math.min(TUNE.stages, cleared | 0))],
    // 纯函数：波次 → 数量 / 血量 / 速度 / 攻击（stageMul 由调用方传，避免数据层碰 G）
    waveCount: (n) => Math.round(TUNE.countBase + n * TUNE.countPerWave),
    waveHp: (n, stageMul) => TUNE.hpBase * Math.pow(TUNE.hpGrowth, n - 1) * stageMul,
    waveSpeed: (n, stageMul) => (TUNE.speedBase + n * TUNE.speedPerWave) * stageMul,
    waveEnemyAtk: (n, stageMul) => TUNE.enemyAtkBase * Math.pow(TUNE.enemyAtkGrowth, n - 1) * stageMul,
  };

  // 浏览器里 globalThis === window；headless 的 vm 里也得挂到 globalThis
  const root = typeof globalThis !== 'undefined' ? globalThis : window;
  root.__SQUAD_DATA = DATA;
})();
