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
    { id: 'rifle', name: '步枪兵', color: '#5ec8f0', deep: '#1d6c92', dmg: 5, rate: 1.4, range: 520, pellets: 1, hp: 110, w: 1, h: 1, weight: 1, unlock: 1 },
    { id: 'shot', name: '霰弹兵', color: '#ffb066', deep: '#a9642a', dmg: 3.2, rate: 1.7, range: 300, pellets: 3, hp: 340, w: 1, h: 2, weight: 0.4, unlock: 1 },
    { id: 'snipe', name: '狙击手', color: '#c79bff', deep: '#6b4a9e', dmg: 32, rate: 0.55, range: 950, pellets: 1, pierce: 1, hp: 80, w: 2, h: 1, weight: 0.26, unlock: 2 },
    { id: 'cannon', name: '重炮手', color: '#ff8f6b', deep: '#a34a2c', dmg: 85, rate: 0.38, range: 780, pellets: 1, splash: 90, hp: 460, w: 2, h: 2, weight: 0.11, unlock: 3 },
    { id: 'medic', name: '医务兵', color: '#7ee8a2', deep: '#2f7d4f', dmg: 0, rate: 0, range: 0, hp: 120, w: 1, h: 1, weight: 0.5, unlock: 4, heal: 0.012 },
    { id: 'engineer', name: '工程师', color: '#9fb8d8', deep: '#4a5f7d', dmg: 0, rate: 0, range: 0, hp: 140, w: 1, h: 1, weight: 0.5, unlock: 5, armor: 0.06 },
    { id: 'advisor', name: '战争顾问', color: '#ffd166', deep: '#a8862a', dmg: 0, rate: 0, range: 0, hp: 100, w: 1, h: 1, weight: 0.5, unlock: 6, coin: 0.35 },
    { id: 'drum', name: '鼓号手', color: '#ff8fb8', deep: '#a84a6d', dmg: 0, rate: 0, range: 0, hp: 110, w: 1, h: 1, weight: 0.5, unlock: 7, haste: 0.07 },
    { id: 'laser', name: '激光射手', color: '#8ff0ff', deep: '#2f7f9e', dmg: 20, rate: 0.85, range: 700, pellets: 1, pierce: 3, hp: 90, w: 2, h: 1, weight: 0.22, unlock: 8 },
    { id: 'mortar', name: '迫击炮手', color: '#ffb38a', deep: '#a35a2c', dmg: 120, rate: 0.32, range: 820, pellets: 1, splash: 120, hp: 520, w: 2, h: 2, weight: 0.1, unlock: 9 },
  ];

  // 稀有度：C-B-A-S-SS ↔ 白板-蓝-紫-金-红。
  // 「更强」不靠数字，靠三件事一起拉：描边加粗、外发光变强、高档加双色渐变。
  const RARITY = [
    { tier: 'C',  color: '#d3dbe6', edge: '#8fa0b8', fill: 'rgba(211,219,230,0.10)', glow: 4,  w: 2.5 },
    { tier: 'B',  color: '#4fb8f0', edge: '#2a7fb8', fill: 'rgba(79,184,240,0.12)',  glow: 8,  w: 3.0 },
    { tier: 'A',  color: '#b487ff', edge: '#7442cc', fill: 'rgba(180,135,255,0.14)', glow: 14, w: 3.5 },
    { tier: 'S',  color: '#ffcc44', edge: '#c98f10', fill: 'rgba(255,204,68,0.16)',  glow: 22, w: 4.5 },
    { tier: 'SS', color: '#ff5b5b', edge: '#c21f3a', fill: 'rgba(255,91,91,0.18)',   glow: 32, w: 5.5 },
  ];

  /* 全局数值（可被 --tune / __SQUAD_TUNE 覆盖） */
  const TUNE = {
    stages: 10,            // 主线 10 关
    waves: 20,             // 每关 20 波
    startCoins: 25,
    refreshCost: 10,       // 每波第一次刷新 10，之后每次 +5（原版就是这样递增）
    refreshStep: 5,
    countBase: 6,          // 敌人多、个体脆（割草感）；6 起，第 20 波 54 个
    countPerWave: 2.4,
    hpBase: 9,
    hpGrowth: 1.24,
    speedBase: 52,
    speedPerWave: 3,
    spawnBase: 0.7,
    spawnDrop: 0.025,
    starGrowth: 2.2,
    // 金币只有三源：战争顾问上场（KINDS[].coin）、清波奖励、三选一补给；
    // 没有「每秒自动产」的基础收入——准备阶段时间冻结，一分钱都不涨。
    waveBonusBase: 8,
    waveBonusPer: 2,
    // 关卡难度：每关敌人 ×1.10 血 / ×1.06 攻击，玩家同时解锁新英雄
    stageHpMul: 1.1,
    stageAtkMul: 1.06,
    stageSpeedMul: 1.02,
    // 单位生存：每星 +180% 血；敌人围上来打人
    unitHpStar: 1.8,
    enemyAtkBase: 7.5,
    enemyAtkGrowth: 1.08,
    enemyAtkCd: 1.0,
    enemyReach: 0.55,      // 敌人碰到单位格子多深算贴身（格高比例）
  };

  /* BOSS：小 BOSS 穿插在第 5/10/15 波，大 BOSS 压第 20 波。
     「波数 = 同样时间里压过来多少敌人」，BOSS 是这一波的重心。
     没有基地血量：不管小兵还是 BOSS，漏过去就输。 */
  const BOSS = {
    minor: {
      waves: [5, 10, 15],
      hpMul: 28, speedMul: 0.75, atkMul: 1.5, r: 16,
      color: '#c05cff', deep: '#5b1f8a',
    },
    major: {
      wave: 20,
      hpMul: 60, speedMul: 0.6, atkMul: 2.2, r: 22,
      color: '#ff3b3b', deep: '#7a1414',
    },
  };

  /* 进度条上的波次标记（给 UI 用） */
  const isBossWave = (n) => BOSS.minor.waves.includes(n) || n === BOSS.major.wave;

  /* 养成专精：等级里程碑（所有兵种共用同一套，2026-11-20）。
     面板要能看到「升到几级解锁什么」；效果由 squad.js 读取。
     Lv3 / Lv5 同时是合成上限节点（可合 3 星 / 5 星），所以从 5 级开始列专精。 */
  const MASTERY = [
    { lv: 5, key: 'rate', text: '攻速 +10%' },
    { lv: 7, key: 'range', text: '射程 +10%' },
    { lv: 9, key: 'dmg', text: '伤害 +20%' },
    { lv: 10, key: 'pellets', text: '弹道 +1' },
  ];

  const DATA = {
    KINDS, RARITY, TUNE, BOSS, MASTERY, isBossWave,
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
