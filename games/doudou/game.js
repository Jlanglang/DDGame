/* ============================================================
   守护豆豆 · 单角色自动射击
   ------------------------------------------------------------
   核心循环：外星人从桥那头涌来 → 你自动打 → 活下来 → 选一个升级
   没有塔位，唯一输出就是你自己。
   ============================================================ */

(() => {
  'use strict';

  const W = 720;
  const H = 1600;

  const BRIDGE = { left: 62, right: 658 };
  const BASE_Y = 1230;       // 敌人越过这条线就扣血
  const PLAYER_Y = 1300;

  // 守桥玩家立牌（Cursor 出图，2026-11-25；规范见 docs/主线立牌方案.md 第五节）
  const PLAYER_ART = {
    src: 'assets/whale-back.png',
    h: 150,          // 画布上的立牌高度（旧火柴人约 130）
    ratio: 0.75,     // 图宽/高（576×768）
    footRel: 0.877,  // 脚底在图高里的比例
    muzzleRel: { x: 0.88, y: 0.174 }, // 枪口在图宽/图高里的比例
    footY: 52,       // 脚底相对 p.y 的偏移
  };

  /* ----------------------------------------------------------
     数值配置：想调平衡，只改这一块
     ----------------------------------------------------------
     两张卡都是"先欠债，再还债"：
       攻击卡从 ÷30 开始，攻速从 -20 档开始，弹道从 -20 开始。
       子弹打在卡上不会穿透（卡片就是墙），所以喂卡＝放弃输出。
     攻击卡很少出，是唯一的指数；平时的成长靠"伤害 +N"（随波数变大）。
     敌人血量 = hpBase × hpGrowth^(波数-1)。 */

  const BAL = Object.assign({
    dmgBase: 12,        // 初始单发伤害
    playerHp: 9,        // 桥头血量：漏一个小怪扣 1 点
    baseRate: 5.5,      // 初始攻速（发/秒）
    rateStep: 0.2,      // 每档攻速 +0.2/s
    rateFloor: 0.8,     // 攻速下限（吃了 -20 档的卡也不至于停火）
    rateMaxTier: 32,    // 攻速档位上限 → 5.5 + 6.4 = 11.9/s（原 13.5 偏猛，2026-11-25 调）

    hpBase: 36,         // 第 1 波单个小怪血量
    hpGrowth: 2.3,      // 每过一波 ×2.3（2026-11-25：删击退后难度变低，补回来一点）
    waves: 8,           // 8 波杂兵，清完 BOSS 登场
    bossMul: 10,        // BOSS 血量 = 第 8 波血量 ×10
    formationRowGap: 55, // 阵型里前后排的间距（像素），压紧一点，少等后排走进来
    gruntSpeed: 86,     // 小怪推进速度（像素/秒）→ 决定每波时长和压迫感
    bossSpeed: 42,      // BOSS 推进速度
    waveGap: 0.8,       // 清场后到下一波的休息时间
    waveGapFirst: 1.4,  // 开局第一波的准备时间

    dmgAddMin: 4,       // 伤害卡：固定 +4 起步，每命中 +1，最多 +60
    dmgAddMax: 60,
    dmgCapBase: 65,     // 伤害天花板：前期几十
    dmgCapGrowth: 1.9,  // 每波 ×1.9，跟得上敌人 2.05 的血量增长（原 1.45 后期乘不动）

    atkMin: -29,        // 攻击卡从 ÷30 开始
    atkMax: 12,         // 上限 ×13
    rateMin: -20,       // 攻速卡从 -20 档开始
    shotsMin: -24,      // 弹道卡从 -24 开始
    shotsMax: 9,        // 弹道上限（原 5 太早封顶，2026-11-25 放开）

    cardCd: 14,         // 一对卡之间的冷却（秒）
    cardSpeed: 230,     // 卡片下落速度 → 5.8 秒落地

    // 攻击卡很少出：单张抽到的权重只有 12
    weights: { dmgAdd: 48, rateMul: 25, shots: 15, dmgMul: 12 },
    noAtkBefore: 3,     // 前 3 波不出攻击卡

    // 打击感（2026-11-25：删受击顿挫/击退——每发都停怪会把难度拉低，高攻速下像卡顿）
    hitSquash: 0.38,
    // 只有 BOSS 击杀给全局顿帧 + 冲击环；普通击杀不顿帧
    bossFreeze: 0.14,
    killRing: 90,
    bossRing: 170,
  }, (typeof globalThis !== 'undefined' && globalThis.__BALANCE) || {});

  // 大数字用中文单位：1.2万 / 3.45亿
  const trimZero = (s) => s.replace(/\.?0+$/, '');

  function fmt(n) {
    n = Math.max(0, Math.round(n));
    if (n < 10000) return String(n);
    if (n < 1e8) return `${trimZero((n / 1e4).toFixed(1))}万`;
    if (n < 1e12) return `${trimZero((n / 1e8).toFixed(2))}亿`;
    return `${trimZero((n / 1e12).toFixed(2))}万亿`;
  }

  const signed = (v, digits) => {
    const s = digits === undefined ? String(v) : Number(v).toFixed(digits);
    return v > 0 ? `+${s}` : s;
  };

  /* ----------------------------------------------------------
     升级池
     ---------------------------------------------------------- */

  // 四种卡片都会被子弹喂大
  const CARD_TYPES = [
    { id: 'shots',   label: '弹道', cd: 0.12 },
    { id: 'dmgAdd',  label: '伤害', cd: 0.06 },
    { id: 'dmgMul',  label: '攻击', cd: 0.1 },
    { id: 'rateMul', label: '攻速', cd: 0.1 },
  ];

  // 档位 → 倍率：-1 是 ÷2，0 是 ×1，1 是 ×2；-29 就是 ÷30
  function tierToMul(t) {
    return t >= 0 ? t + 1 : 1 / (1 - t);
  }

  // 攻速：档位累加，线性成长，有下限和上限
  function rateActual(tier) {
    const t = Math.min(BAL.rateMaxTier, tier);
    return Math.max(BAL.rateFloor, BAL.baseRate + BAL.rateStep * t);
  }

  function tierText(t) {
    return t >= 0 ? `×${t + 1}` : `÷${1 - t}`;
  }

  /* ----------------------------------------------------------
     状态
     ---------------------------------------------------------- */

  const G = {
    state: 'playing',        // playing | upgrade | over
    result: null,            // win | lose
    bal: BAL,                // 只读：调试/模拟器用
    wave: 0,
    time: 0,
    kills: 0,
    enemies: [],
    bullets: [],
    cards: [],
    particles: [],
    floats: [],          // 伤害飘字
    rings: [],           // 击杀冲击环
    hitstop: 0,          // 击杀顿帧剩余（真实秒；只在渲染循环里生效，不影响模拟）
    spawnTimer: 0,
    waveGap: 0,
    round: 0,
    waveSize: 0,
    pairsSpawned: 0,
    cols: 2,
    bossSpawned: false,
    cardCd: 0,
    player: {
      x: W / 2,
      y: PLAYER_Y,
      speed: 660,
      hp: BAL.playerHp,
      maxHp: BAL.playerHp,
      rate: BAL.baseRate,
      damage: BAL.dmgBase,
      shots: 1,
      pierce: 0,
      dmgTier: 0,
      rateTier: 0,
      dmgMul: 1,
      cd: 0,
      kick: 0,
      lean: 0,
      leanT: 0,
    },
  };

  /* ----------------------------------------------------------
     元素
     ---------------------------------------------------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // 立牌异步加载；没加载完时继续画旧火柴人兜底（headless 无 Image，直接退回）
  const playerArt = typeof Image === 'function' ? new Image() : { ready: false };
  if (typeof Image === 'function') {
    playerArt.onload = () => { playerArt.ready = true; };
    playerArt.src = PLAYER_ART.src;
  }

  // 守桥背景 / 敌人贴图（Cursor 出图，2026-11-25）
  const bgArt = typeof Image === 'function' ? new Image() : { ready: false };
  const enemyArt = { ready: false, grunt: null, boss: null };
  if (typeof Image === 'function') {
    bgArt.onload = () => { bgArt.ready = true; };
    bgArt.src = 'assets/bridge-bg.png';

    let enemyLoaded = 0;
    const enemyDone = () => { if (++enemyLoaded === 2) enemyArt.ready = true; };
    enemyArt.grunt = new Image();
    enemyArt.boss = new Image();
    enemyArt.grunt.onload = enemyDone;
    enemyArt.boss.onload = enemyDone;
    enemyArt.grunt.src = 'assets/enemy.png';
    enemyArt.boss.src = 'assets/boss.png';
  }
  const hpFill = document.getElementById('hpFill');
  const stageName = document.getElementById('stageName');
  const upgradeEl = document.getElementById('upgrade');
  const buffsEl = document.getElementById('buffs');
  let buffRows = [];
  const overEl = document.getElementById('over');
  const overSub = document.getElementById('overSub');
  const pauseBtn = document.getElementById('pause');
  const pausedVeil = document.getElementById('pausedVeil');

  /* ----------------------------------------------------------
     暂停
     ---------------------------------------------------------- */

  let paused = false;

  function setPaused(v) {
    if (G.state !== 'playing') return;
    paused = v;
    pauseBtn.classList.toggle('paused', paused);
    pauseBtn.setAttribute('aria-label', paused ? '继续' : '暂停');
    pausedVeil.hidden = !paused;
  }

  /* ----------------------------------------------------------
     预生成的桥面细节：裂缝、碎石
     ---------------------------------------------------------- */

  const CRACKS = [];
  for (let i = 0; i < 9; i++) {
    const pts = [];
    let x = 110 + Math.random() * 500;
    let y = Math.random() * 1200;
    const segs = 3 + Math.floor(Math.random() * 3);
    for (let k = 0; k < segs; k++) {
      pts.push([x, y]);
      x += (Math.random() - 0.5) * 80;
      y += 50 + Math.random() * 90;
    }
    CRACKS.push(pts);
  }

  const DEBRIS = [];
  for (let i = 0; i < 60; i++) {
    const left = Math.random() < 0.5;
    DEBRIS.push({
      x: left ? Math.random() * 60 : 660 + Math.random() * 60,
      y: Math.random() * 1300,
      w: 8 + Math.random() * 26,
      h: 6 + Math.random() * 18,
      a: 0.12 + Math.random() * 0.2,
    });
  }

  /* ----------------------------------------------------------
     工具
     ---------------------------------------------------------- */

  const rnd = (a, b) => a + Math.random() * (b - a);

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ----------------------------------------------------------
     阵型：每波固定一个形状，整组同时出现在桥顶
     ----------------------------------------------------------
     行号 0 是最前面（离桥头最近）的一排，行号越大越靠后。
     形状用 (列, 行) 生成，再换算成屏幕坐标。 */

  const WAVE_SCHEDULE = [
    { kind: 'line',    w: 4, h: 1 },   // 1 波：4       一字
    { kind: 'rect',    w: 3, h: 2 },   // 2 波：6       长方形
    { kind: 'invTri',  w: 4, h: 4 },   // 3 波：10      倒三角（尖头朝桥头）
    { kind: 'rect',    w: 4, h: 3 },   // 4 波：12      长方形
    { kind: 'diamond', w: 4, h: 4 },   // 5 波：16      菱形
    { kind: 'invTri',  w: 5, h: 5 },   // 6 波：15      倒三角
    { kind: 'rect',    w: 5, h: 3 },   // 7 波：15      长方形
    { kind: 'rect',    w: 5, h: 4 },   // 8 波：20      长方形（终波）
  ];

  function formationCells(kind, w, h) {
    const cells = [];
    const row = (r, width) => {
      const start = (w - width) / 2;
      for (let k = 0; k < width; k++) cells.push({ c: start + k, r });
    };

    if (kind === 'line') row(0, w);
    else if (kind === 'rect') for (let r = 0; r < h; r++) row(r, w);
    else if (kind === 'tri') for (let r = 0; r < h; r++) row(r, h - r);
    else if (kind === 'invTri') for (let r = 0; r < h; r++) row(r, r + 1);
    else if (kind === 'diamond') {
      const rows = 2 * w - 1;
      for (let r = 0; r < rows; r++) row(r, w - Math.abs(w - 1 - r));
    }
    return cells;
  }

  // 敌人站位：整组居中，第一波（2 列）正好落在左右半屏的中线上（180 / 540）。
  // 列数变多时只往两边铺，但不会超出"玩家站得到"的范围。
  const LANE_MIN = BRIDGE.left + 76;                 // 138
  const LANE_MAX = BRIDGE.right - 76;                // 582
  const LANE_SPAN = LANE_MAX - LANE_MIN;             // 444

  function laneX(i, cols) {
    if (cols <= 1) return W / 2;
    const gap = Math.min(W / 2, LANE_SPAN / (cols - 1));
    const total = gap * (cols - 1);
    return W / 2 - total / 2 + gap * i;
  }

  /* ----------------------------------------------------------
     HUD
     ---------------------------------------------------------- */

  function syncHud() {
    const p = G.player;
    const ratio = Math.max(0, p.hp / p.maxHp);
    hpFill.style.width = `${ratio * 100}%`;
    hpFill.classList.toggle('low', ratio <= 0.3);
    stageName.textContent = G.bossSpawned
      ? '守护豆豆 · BOSS'
      : `守护豆豆 · 第 ${G.wave} 波`;
  }

  /* ----------------------------------------------------------
     波次
     ---------------------------------------------------------- */

  function startWave() {
    G.wave = 1;
    G.state = 'playing';
    G.waveGap = BAL.waveGapFirst;
    G.cols = 2;
    G.pairsSpawned = 0;
    G.bossSpawned = false;
    G.spawnTimer = 0;
    G.cardCd = 0;
    G.round = 0;

    syncHud();
    ensureCards();
    startNextWave();
  }

  // 血量按波数指数增长：第 1 波 36，第 2 波 58，第 3 波 92……
  function enemyHp(wave) {
    return Math.round(BAL.hpBase * Math.pow(BAL.hpGrowth, wave - 1));
  }

  // 伤害天花板：前期几十、中期几百、后期几千。超出的部分直接扔掉。
  function damageCap() {
    return BAL.dmgCapBase * Math.pow(BAL.dmgCapGrowth, G.wave - 1);
  }

  // 在指定位置放一个杂兵（一波开始时整组一起放出来）
  function spawnGrunt(x, y, col) {
    const hp = enemyHp(G.wave);

    G.enemies.push({
      kind: 'grunt',
      x,
      y,
      hp,
      maxHp: hp,
      speed: BAL.gruntSpeed,
      r: 22,
      dead: false,
      hitFlash: 0,
      squash: 0,
      // 相邻两列的血条错开，后期数字长，不然会糊成一片
      lift: (Math.round(col) % 2) * 34,
      wob: Math.random() * Math.PI * 2,
      hopPhase: Math.random() * Math.PI * 2,
    });
  }

  function spawnBoss() {
    // BOSS 是这道坎：当前波血量的十几倍
    // BOSS 按第 10 波的基准血量放大
    const hp = Math.round(enemyHp(BAL.waves) * BAL.bossMul);

    G.enemies.push({
      kind: 'boss',
      x: W / 2,
      y: -120,
      hp,
      maxHp: hp,
      speed: BAL.bossSpeed,
      r: 46,
      dead: false,
      hitFlash: 0,
      squash: 0,
      wob: 0,
      hopPhase: 0,
    });
  }

  // 卡片：同时最多两张，左右并排、同一高度
  // 一对卡落地后，还要空这么久才会有下一对
  const CARD_COOLDOWN = BAL.cardCd;

  function spawnCard(side, y, exclude, forceId) {
    let type;

    if (forceId) {
      // 固定卡：开局前两对用，保证起手是攻速/弹道/伤害
      type = CARD_TYPES.find((t) => t.id === forceId) || CARD_TYPES[0];
    } else {
      // 按权重抽卡：攻击卡很少出
      // 前 3 波不出攻击卡——开局先让玩家把攻速/弹道/伤害铺起来
      let pool = CARD_TYPES.filter((t) => t.id !== exclude);
      if (G.wave <= BAL.noAtkBefore) pool = pool.filter((t) => t.id !== 'dmgMul');
      const total = pool.reduce((s, t) => s + (BAL.weights[t.id] || 1), 0);
      let roll = Math.random() * total;
      type = pool[pool.length - 1];
      for (const t of pool) {
        roll -= BAL.weights[t.id] || 1;
        if (roll <= 0) { type = t; break; }
      }
    }

    // 每张卡自己带 min/max/step
    const range = cardRange(type);
    const start = range.min;

    const card = {
      type,
      value: start,
      min: range.min,
      max: range.max,
      step: range.step,
      side,
      y: y === undefined ? -100 : y,
      speed: BAL.cardSpeed,
      flash: 0,
      cd: 0,
      dead: false,
    };

    G.cards.push(card);
    return card;
  }

  // 卡片数值范围：伤害卡是固定低保（+4 起步，每命中 +1），其余是固定的深负数
  function cardRange(type) {
    if (type.id === 'dmgAdd') return { min: BAL.dmgAddMin, max: BAL.dmgAddMax, step: 1 };
    if (type.id === 'dmgMul') return { min: BAL.atkMin, max: BAL.atkMax, step: 1 };
    if (type.id === 'rateMul') return { min: BAL.rateMin, max: BAL.rateMaxTier, step: 1 };
    return { min: BAL.shotsMin, max: BAL.shotsMax, step: 1 };
  }

  // 一对卡：两张都消失后才补，且两张必定是不同类型
  function ensureCards() {
    const alive = G.cards.filter((c) => !c.dead);
    if (alive.length > 0) return;

    if (G.cardCd > 0) return;
    G.cardCd = CARD_COOLDOWN;

    const pair = G.pairsSpawned;
    G.pairsSpawned += 1;

    // 前两对固定：攻速 + 弹道 / 攻速 + 伤害。
    // 开局不再靠运气，玩家第一眼看到的就是"喂哪张"的选择。
    if (pair === 0) {
      spawnCard('left', -100, null, 'rateMul');
      spawnCard('right', -100, 'rateMul', 'shots');
    } else if (pair === 1) {
      spawnCard('left', -100, null, 'rateMul');
      spawnCard('right', -100, 'rateMul', 'dmgAdd');
    } else {
      const left = spawnCard('left', -100);
      spawnCard('right', -100, left.type.id);
    }
  }

  // 卡片宽度：喂得多的那边变宽，另一边被挤窄
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // 0 = 还是下限，1 = 喂满
  function cardProgress(c) {
    if (!c) return 0;
    return clamp01((c.value - c.min) / Math.max(1, c.max - c.min));
  }

  function cardWidths() {
    const left = G.cards.find((c) => c.side === 'left' && !c.dead);
    const right = G.cards.find((c) => c.side === 'right' && !c.dead);

    const tL = cardProgress(left);
    const tR = cardProgress(right);

    const wL = W * (0.5 + (tL - tR) * 0.22);
    return { wL, wR: W - wL, left, right };
  }

  // 一波一波来：整组阵型一次放出来 → 等清场 → 歇一会 → 下一波
  // 第 10 波清完，第 11 波直接上 BOSS。
  function startNextWave() {
    G.round += 1;
    G.wave = G.round;
    G.spawnTimer = 0;
    G.waveGap = BAL.waveGap;           // 清场后的休息时间

    if (G.round > BAL.waves) {
      if (!G.bossSpawned) {
        spawnBoss();
        G.bossSpawned = true;
      }
      syncHud();
      return;
    }

    const sched = WAVE_SCHEDULE[Math.min(G.round - 1, WAVE_SCHEDULE.length - 1)];
    const cells = formationCells(sched.kind, sched.w, sched.h);
    G.cols = sched.w;
    G.waveSize = cells.length;

    // 整组同时放出来：y 用行号错开，阵型就固定住了
    for (const cell of cells) {
      spawnGrunt(
        laneX(cell.c, G.cols),
        -70 - cell.r * BAL.formationRowGap,
        cell.c
      );
    }

    syncHud();
  }

  function updateSpawner(dt) {
    if (G.bossSpawned && G.enemies.length === 0) return;
    if (G.enemies.length > 0) return;

    // 清场了，歇一会儿再开下一波
    G.waveGap -= dt;
    if (G.waveGap <= 0) startNextWave();
  }

  /* ----------------------------------------------------------
     主角
     ---------------------------------------------------------- */

  function clampX(x) {
    return Math.max(BRIDGE.left + 76, Math.min(BRIDGE.right - 76, x));
  }

  function updatePlayer(dt) {
    const p = G.player;

    // 左右移动：这一版唯一的操作
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir !== 0) {
      p.x = clampX(p.x + dir * p.speed * dt);
      p.leanT = dir;
    }
    // 立牌倾斜：按最近一次移动方向平滑趋近，松手后回正
    p.lean += ((p.leanT || 0) - p.lean) * Math.min(1, dt * 10);
    p.leanT *= Math.max(0, 1 - dt * 2.5);

    if (p.kick > 0) p.kick = Math.max(0, p.kick - dt * 8);

    const dmg = p.damage;
    const rate = rateActual(p.rateTier);
    p.rate = rate;

    p.cd -= dt;
    if (p.cd > 0) return;

    // 一直开火，不管有没有敌人。
    // 成长卡是靠"持续命中"喂的，停火就等于自废。
    shoot(dmg);
    p.cd = 1 / rate;
    p.kick = 1;
  }

  // 立牌枪口在图里的位置（子弹从这里出）
  function playerMuzzleY() {
    const p = G.player;
    return p.y + PLAYER_ART.footY
      - PLAYER_ART.footRel * PLAYER_ART.h
      + PLAYER_ART.muzzleRel.y * PLAYER_ART.h;
  }

  function playerMuzzleX() {
    const w = PLAYER_ART.h * PLAYER_ART.ratio;
    return G.player.x + (PLAYER_ART.muzzleRel.x - 0.5) * w;
  }

  function shoot(dmg, originX, originY) {
    const p = G.player;
    const x0 = originX === undefined ? playerMuzzleX() : originX;
    // 与立牌枪口对齐；显式传 originY 时保留旧偏移
    const muzzleY = originY === undefined ? playerMuzzleY() : originY - 142;

    const n = p.shots;
    const gap = 18;   // 弹道之间的横向间距（越小越密）

    // 多弹道是"平行直射"，不是扇形散射：
    // 每发都朝正上方，只是起点错开，这样覆盖面是整条竖带。
    for (let i = 0; i < n; i++) {
      const bx = x0 + (i - (n - 1) / 2) * gap;

      G.bullets.push({
        x: bx,
        y: muzzleY,
        vx: 0,
        vy: -1150,
        damage: dmg,
        pierce: p.pierce,
        hit: [],
        dead: false,
      });
    }

    burst(x0, muzzleY, '#ffd166', 3);
  }

  /* ----------------------------------------------------------
     敌人
     ---------------------------------------------------------- */

  function updateEnemies(dt) {
    for (const e of G.enemies) {
      if (e.dead) continue;

      if (e.hitFlash > 0) e.hitFlash -= dt * 6;
      if (e.squash > 0) e.squash = Math.max(0, e.squash - dt * 5.5);

      const hopHz = e.kind === 'boss' ? 3.2 : 5.5;
      e.hopPhase = (e.hopPhase || 0) + dt * hopHz;
      e.y += e.speed * dt;

      if (e.y >= BASE_Y) {
        e.dead = true;

        // BOSS 过桥 = 直接失守，不然它会在场上留一个"空局"
        if (e.kind === 'boss') {
          G.player.hp = 0;
          burst(e.x, BASE_Y, '#ff5a4a', 40);
          syncHud();
          lose();
          return;
        }

        G.player.hp -= 1;
        burst(e.x, BASE_Y, '#ff5a4a', 16);
        syncHud();

        if (G.player.hp <= 0) {
          lose();
          return;
        }
      }
    }

    G.enemies = G.enemies.filter((e) => !e.dead);
  }

  /* ----------------------------------------------------------
     掉落卡片：和敌人一样从上往下飘
     子弹扫到 → 数字变大；主角碰到 → 吃掉
     ---------------------------------------------------------- */

  function updateCards(dt) {
    let ate = false;    // 一次最多吃一张

    for (const c of G.cards) {
      if (c.dead) continue;

      if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 3);
      if (c.cd > 0) c.cd -= dt;

      c.y += c.speed * dt;

      // 主角站哪半边就吃哪张
      if (!ate && Math.abs(c.y - G.player.y) < 78) {
        const { wL } = cardWidths();
        const inLeft = G.player.x < wL && c.side === 'left';
        const inRight = G.player.x >= wL && c.side === 'right';
        if (inLeft || inRight) {
          consumeCard(c);
          ate = true;
          continue;
        }
      }

      // 飘出桥头就没了
      if (c.y > BASE_Y + 60) c.dead = true;
    }

    G.cards = G.cards.filter((c) => !c.dead);

    if (G.cardCd > 0) G.cardCd -= dt;
    ensureCards();
  }

  function consumeCard(c) {
    c.dead = true;
    applyCard(c);
    burst(160, c.y, '#ffe28a', 22);

    // 吃了一张，另一张立刻消失——这对卡是一次性的
    for (const other of G.cards) {
      if (other !== c && !other.dead) {
        other.dead = true;
        burst(160, other.y, '#8d99b5', 10);
      }
    }
  }

  function applyCard(c) {
    const p = G.player;
    const v = Math.round(c.value);

    switch (c.type.id) {
      case 'shots':
        // 负数会真的扣弹道；扣到 1 为止
        p.shots = Math.max(1, Math.min(BAL.shotsMax, p.shots + v));
        break;

      case 'dmgAdd':
        // 低保：卡面写多少就加多少（不受天花板影响）
        p.damage += Math.max(1, v);
        break;

      case 'dmgMul': {
        // 乘在当前总伤害上，但不能超过当前波的天花板；
        // dmgMul 只记实际生效的倍率，别让 UI 显示虚高
        const m = tierToMul(v);
        const before = p.damage;
        p.damage = Math.min(before * m, damageCap());
        p.dmgMul *= p.damage / before;
        p.dmgTier += v;
        break;
      }

      case 'rateMul':
        p.rateTier = Math.max(-60, Math.min(BAL.rateMaxTier, p.rateTier + v));
        break;

      default:
        break;
    }

    p.damage = Math.max(1, p.damage);

    syncBuffs();
  }

  /* ----------------------------------------------------------
     子弹
     ---------------------------------------------------------- */

  function updateBullets(dt) {
    for (const b of G.bullets) {
      if (b.dead) continue;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.y < -60 || b.x < -60 || b.x > W + 60) {
        b.dead = true;
        continue;
      }

      // 卡片挡子弹：整个卡面都算，不只是文字
      const { wL, wR } = cardWidths();
      let hitCard = false;
      for (const c of G.cards) {
        if (c.dead) continue;

        const cw = c.side === 'left' ? wL : wR;
        const cx = c.side === 'left' ? cw / 2 : wL + cw / 2;

        if (Math.abs(b.x - cx) <= cw / 2 && Math.abs(b.y - c.y) <= 48) {
          // 卡片就是墙：子弹一律被吃掉，不会穿过去
          b.dead = true;
          hitCard = true;

          // 但只有冷却好了才算"喂"它
          if (c.cd <= 0) {
            c.value = Math.min(c.max, c.value + c.step);
            c.cd = c.type.cd || 0.2;
            c.flash = 1;
            burst(b.x, b.y, '#ffe28a', 4);
          }
          break;
        }
      }
      if (hitCard) continue;

      for (const e of G.enemies) {
        if (e.dead) continue;
        if (b.hit.indexOf(e) !== -1) continue;

        const dx = e.x - b.x;
        const dy = e.y - b.y;

        if (dx * dx + dy * dy < (e.r + 10) * (e.r + 10)) {
          hitEnemy(e, b);
          b.hit.push(e);

          // 先扣穿透，扣到负数才停：穿透 1 = 还能再打一个
          b.pierce -= 1;
          if (b.pierce < 0) {
            b.dead = true;
            break;
          }
        }
      }
    }

    G.bullets = G.bullets.filter((b) => !b.dead);
  }

  function hitEnemy(e, b) {
    if (e.dead) return;

    const dmg = b.damage;
    const killed = e.hp - dmg <= 0;
    e.hp -= dmg;

    // ① 受击闪白
    e.hitFlash = 1;
    // ② 压扁（删了受击回推/顿挫：击退会让难度变低）
    e.squash = Math.max(e.squash || 0, BAL.hitSquash);
    // ② 命中火花
    impactSparks(b.x, b.y, killed);
    // ⑥ 伤害飘字（抛物线）
    spawnFloat(e.x, e.y - (e.kind === 'boss' ? 70 : 40), dmg, killed);

    if (killed) {
      e.dead = true;
      G.kills += 1;
      burst(e.x, e.y, '#9be26a', e.kind === 'boss' ? 70 : 18);
      // 三档：普通命中不动全局；击杀给中档顿帧 + 小环；BOSS 给大档
      if (e.kind === 'boss') {
        G.hitstop = Math.max(G.hitstop, BAL.bossFreeze);
        addRing(e.x, e.y, BAL.bossRing, '#ffd166');
        win();
      } else {
        addRing(e.x, e.y, BAL.killRing, '#ffe28a');
      }
    }
  }

  /* ----------------------------------------------------------
     粒子 / 飘字（打击感通道）
     ---------------------------------------------------------- */

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(40, 240);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rnd(0.25, 0.6),
        max: 0.6,
        color,
        size: rnd(2, 4.5),
        streak: false,
      });
    }
  }

  // 命中火花：大颗 + 短拖尾，朝四周炸开
  function impactSparks(x, y, heavy) {
    const n = heavy ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
      const sp = rnd(heavy ? 180 : 140, heavy ? 420 : 280);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rnd(40, 120),
        life: rnd(0.22, 0.5),
        max: 0.5,
        color: i % 3 === 0 ? '#ffffff' : (heavy ? '#ffe28a' : '#ffd166'),
        size: rnd(3.5, heavy ? 7 : 5.5),
        streak: true,
      });
    }
    // 中心亮核一下
    G.particles.push({
      x, y,
      vx: 0,
      vy: 0,
      life: 0.12,
      max: 0.12,
      color: '#ffffff',
      size: heavy ? 14 : 9,
      streak: false,
    });
  }

  // 抛物线飘字：左右初速 + 上抛，再受重力落下
  function spawnFloat(x, y, dmg, kill) {
    const side = Math.random() < 0.5 ? -1 : 1;
    G.floats.push({
      x: x + rnd(-6, 6),
      y,
      vx: side * rnd(70, 140),
      vy: kill ? -220 : -170,
      g: kill ? 520 : 480,
      life: kill ? 0.85 : 0.6,
      max: kill ? 0.85 : 0.6,
      text: fmt(dmg),
      kill: !!kill,
    });
  }

  function updateParticles(dt) {
    for (const p of G.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.vy += 180 * dt;
      p.life -= dt;
    }
    G.particles = G.particles.filter((p) => p.life > 0);
  }

  function updateFloats(dt) {
    for (const f of G.floats) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += f.g * dt;
      f.vx *= 0.98;
      f.life -= dt;
    }
    G.floats = G.floats.filter((f) => f.life > 0);
  }

  /* 击杀冲击环：普通命中不出，只有击杀 / BOSS 才出 */
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function addRing(x, y, r1, color) {
    if (!r1) return;
    G.rings.push({ x, y, r0: 12, r1, t: 0, life: 0.26, max: 0.26, color });
    if (G.rings.length > 12) G.rings.shift();
  }

  function updateRings(dt) {
    for (const r of G.rings) {
      r.t += dt;
      r.life -= dt;
    }
    G.rings = G.rings.filter((r) => r.life > 0);
  }

  function drawRings() {
    for (const r of G.rings) {
      const k = Math.max(0, Math.min(1, 1 - r.life / r.max));
      const rad = r.r0 + (r.r1 - r.r0) * easeOutCubic(k);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ----------------------------------------------------------
     升级 / 结算
     ---------------------------------------------------------- */

  function resultLine() {
    const p = G.player;
    return `击杀 ${G.kills} · 伤害 ${fmt(p.damage)} · 攻速 ${rateActual(p.rateTier).toFixed(1)}/s`;
  }

  function win() {
    G.state = 'over';
    G.result = 'win';
    upgradeEl.hidden = true;

    document.getElementById('overK').textContent = '守住了';
    document.getElementById('overK').classList.remove('lost');
    document.getElementById('overTitle').textContent = '豆豆安全了';

    overSub.innerHTML = resultLine();

    overEl.hidden = false;
  }

  function lose() {
    G.state = 'over';
    G.result = 'lose';
    upgradeEl.hidden = true;

    document.getElementById('overK').textContent = '失守';
    document.getElementById('overK').classList.add('lost');
    document.getElementById('overTitle').textContent = '豆豆被外星人抓走了';

    overSub.innerHTML = resultLine();

    overEl.hidden = false;
  }

  function reset() {
    G.state = 'playing';
    G.result = null;
    G.wave = 0;
    G.time = 0;
    G.kills = 0;
    G.enemies = [];
    G.bullets = [];
    G.cards = [];
    G.particles = [];
    G.floats = [];
    G.spawnTimer = 0;
    G.waveGap = 0;
    G.round = 0;
    G.waveSize = 0;
    G.pairsSpawned = 0;
    G.bossSpawned = false;
    G.cardCd = 0;

    G.player = {
      x: W / 2,
      y: PLAYER_Y,
      speed: 660,
      hp: BAL.playerHp,
      maxHp: BAL.playerHp,
      rate: BAL.baseRate,
      damage: BAL.dmgBase,
      shots: 1,
      pierce: 0,
      dmgTier: 0,
      rateTier: 0,
      dmgMul: 1,
      cd: 0,
      kick: 0,
    };

    overEl.hidden = true;
    upgradeEl.hidden = true;
    upgradeEl.innerHTML = '';

    setPaused(false);

    syncHud();
    startWave();
  }

  /* ----------------------------------------------------------
     更新
     ---------------------------------------------------------- */

  function update(dt) {
    G.time += dt;

    if (G.state === 'playing') {
      updateSpawner(dt);
      updateEnemies(dt);
      if (G.state !== 'playing') return;

      updateCards(dt);
      if (G.state !== 'playing') return;

      updatePlayer(dt);
      updateBullets(dt);
      return;
    }
  }

  function updateJuice(dt) {
    updateParticles(dt);
    updateFloats(dt);
    updateRings(dt);
  }

  /* ----------------------------------------------------------
     渲染
     ---------------------------------------------------------- */

  function render() {
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, W, H);

    drawGround();
    drawBridge();
    drawBarricade();
    drawEnemies();
    drawRings();
    drawCards();
    drawBullets();
    drawPlayer();
    drawParticles();
    drawFloats();
  }

  function drawGround() {
    // 背景贴图（bridge-bg.png 720×1600）：桥面 + 深渊一体
    if (bgArt.ready) {
      ctx.drawImage(bgArt, 0, 0, W, H);
      return;
    }
    // 桥外深渊：上亮下暗一点，别一整块死黑
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#121820');
    sky.addColorStop(0.55, '#0a0d12');
    sky.addColorStop(1, '#07090c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    for (const d of DEBRIS) {
      ctx.fillStyle = `rgba(48, 56, 68, ${d.a})`;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.fillStyle = `rgba(70, 80, 96, ${d.a * 0.45})`;
      ctx.fillRect(d.x, d.y, d.w * 0.35, d.h * 0.4);
    }
  }

  function drawBridge() {
    if (bgArt.ready) return;   // 背景贴图自带桥面与警示条
    const x0 = BRIDGE.left;
    const w = BRIDGE.right - BRIDGE.left;

    // 桥板厚度：左亮右暗，读得出体量
    const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    g.addColorStop(0, '#4a5160');
    g.addColorStop(0.45, '#3a404c');
    g.addColorStop(1, '#2a3038');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, w, H);

    // 远近石板横缝（近处略密）
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 2;
    for (let y = 40; y < H; y += 96) {
      ctx.beginPath();
      ctx.moveTo(x0 + 6, y);
      ctx.lineTo(x0 + w - 6, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    for (let y = 42; y < H; y += 96) {
      ctx.beginPath();
      ctx.moveTo(x0 + 6, y);
      ctx.lineTo(x0 + w * 0.35, y);
      ctx.stroke();
    }

    // 竖缝错落
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    for (let y = 40; y < H; y += 96) {
      const off = ((y / 96) | 0) % 2 === 0 ? 0 : 140;
      for (let x = x0 + 100 + off; x < x0 + w - 40; x += 280) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, Math.min(H, y + 96));
        ctx.stroke();
      }
    }

    // 裂缝
    ctx.strokeStyle = 'rgba(8, 10, 14, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const pts of CRACKS) {
      ctx.beginPath();
      pts.forEach(([cx, cy], i) => {
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    }

    // 桥沿栏杆：立柱节奏 + 上下扶手（还是线，但有结构）
    const rail = (edgeX, inward) => {
      ctx.strokeStyle = '#1a1e26';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(edgeX, 0);
      ctx.lineTo(edgeX, H);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90, 100, 118, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(edgeX + inward * 3, 0);
      ctx.lineTo(edgeX + inward * 3, H);
      ctx.stroke();
      for (let y = 28; y < H; y += 72) {
        ctx.strokeStyle = '#242a34';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(edgeX, y);
        ctx.lineTo(edgeX + inward * 14, y - 10);
        ctx.stroke();
      }
    };
    rail(x0 - 4, 1);
    rail(x0 + w + 4, -1);

    // 桥沿压条
    ctx.fillStyle = '#1c2129';
    ctx.fillRect(x0 - 10, 0, 10, H);
    ctx.fillRect(x0 + w, 0, 10, H);
    ctx.fillStyle = 'rgba(120, 132, 150, 0.18)';
    ctx.fillRect(x0 - 10, 0, 3, H);
  }

  function drawBarricade() {
    const y = BASE_Y + 18;
    const x0 = BRIDGE.left;
    const w = BRIDGE.right - BRIDGE.left;

    // 混凝土墩有厚度：顶面亮一线
    ctx.fillStyle = '#3e4552';
    ctx.fillRect(x0 - 8, y + 6, w + 16, 32);
    ctx.fillStyle = '#5a6270';
    ctx.fillRect(x0 - 8, y, w + 16, 10);
    ctx.fillStyle = 'rgba(200, 210, 220, 0.2)';
    ctx.fillRect(x0 - 8, y, w + 16, 3);

    for (let x = x0 - 6; x < x0 + w + 6; x += 42) {
      ctx.fillStyle = '#e8c44a';
      ctx.beginPath();
      ctx.moveTo(x, y + 38);
      ctx.lineTo(x + 22, y + 4);
      ctx.lineTo(x + 40, y + 4);
      ctx.lineTo(x + 18, y + 38);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#1a1d22';
      ctx.beginPath();
      ctx.moveTo(x + 40, y + 38);
      ctx.lineTo(x + 62, y + 4);
      ctx.lineTo(x + 80, y + 4);
      ctx.lineTo(x + 58, y + 38);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- 成片火柴人：仍是线，但有线压、关节、姿态 ---------- */

  function shadeHex(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * (1 - t));
    const g = Math.round(((n >> 8) & 255) * (1 - t));
    const b = Math.round((n & 255) * (1 - t));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // 受击提亮：沿身体颜色往白靠，不是盖一层白圆
  function liftHex(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const r0 = (n >> 16) & 255;
    const g0 = (n >> 8) & 255;
    const b0 = n & 255;
    const r = Math.round(r0 + (255 - r0) * t);
    const g = Math.round(g0 + (255 - g0) * t);
    const b = Math.round(b0 + (255 - b0) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function limb(ax, ay, bx, by, w, hi, lo) {
    ctx.strokeStyle = lo;
    ctx.lineWidth = w + 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = hi;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(ax - 0.6, ay - 0.8);
    ctx.lineTo(bx - 0.6, by - 0.8);
    ctx.stroke();
  }

  function joint(ax, ay, mx, my, bx, by, w, hi, lo) {
    limb(ax, ay, mx, my, w, hi, lo);
    limb(mx, my, bx, by, w * 0.9, hi, lo);
  }

  // 弯肢纯色一条，无描边双层
  function softLimb(ax, ay, mx, my, bx, by, w, color) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
  }

  function handBlob(hx, hy, r, color) {
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // 后脑勺：参考「cheek weld 从背后看」——整颗发圆贴枪托，无侧脸凸包（凸包=鸡嘴）
  function stickHead(cx, cy, r, skin) {
    const hair = '#b44e7a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = hair;
    ctx.fill();
    // 颈根连身体
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + r * 0.78, r * 0.32, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = skin;
    ctx.fill();
    // 呆毛：细软弯向左后，不是竖刺鸡冠
    ctx.strokeStyle = hair;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - r * 0.72);
    ctx.quadraticCurveTo(cx - 11, cy - r * 1.05, cx - 5, cy - r * 1.28);
    ctx.stroke();
  }

  // MP5 类侧剪影：托→机匣→弹匣下垂→护木→枪管；握把在机匣后下
  // 返回肩托中心 / 握把 / 护木握点 / 枪口
  function drawSmg(ax, ay) {
    // ay = 枪托抵肩高度；枪口朝 -Y
    const metal = '#8e97a8';
    const dark = '#3a404c';
    const stock = { x: ax, y: ay };
    const grip = { x: ax + 6, y: ay + 10 };
    const guard = { x: ax + 1, y: ay - 42 };
    const muzzle = { x: ax + 1, y: ay - 78 };

    ctx.fillStyle = metal;
    // 枪托（扁，塞进右肩）
    ctx.beginPath();
    ctx.moveTo(ax - 5, ay + 6);
    ctx.lineTo(ax + 6, ay + 2);
    ctx.lineTo(ax + 5, ay - 10);
    ctx.lineTo(ax - 6, ay - 4);
    ctx.closePath();
    ctx.fill();
    // 机匣（最厚）
    ctx.beginPath();
    ctx.moveTo(ax - 3, ay - 6);
    ctx.lineTo(ax + 6, ay - 12);
    ctx.lineTo(ax + 5, ay - 36);
    ctx.lineTo(ax - 3, ay - 32);
    ctx.closePath();
    ctx.fill();
    // 护木
    ctx.beginPath();
    ctx.moveTo(ax - 2, ay - 32);
    ctx.lineTo(ax + 4.5, ay - 36);
    ctx.lineTo(ax + 3.5, ay - 54);
    ctx.lineTo(ax - 1.5, ay - 50);
    ctx.closePath();
    ctx.fill();
    // 枪管（短一截，别整根细棍）
    ctx.beginPath();
    ctx.moveTo(ax - 1, ay - 50);
    ctx.lineTo(ax + 3, ay - 54);
    ctx.lineTo(ax + 2.4, muzzle.y);
    ctx.lineTo(ax - 0.4, muzzle.y + 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = dark;
    // 手枪握把（右下斜）
    ctx.beginPath();
    ctx.moveTo(ax + 1, ay - 4);
    ctx.lineTo(ax + 12, ay + 12);
    ctx.lineTo(ax + 7, ay + 15);
    ctx.lineTo(ax - 1, ay + 2);
    ctx.closePath();
    ctx.fill();
    // 弹匣（机匣下方垂，冲锋枪辨识关键）
    ctx.beginPath();
    ctx.moveTo(ax + 0, ay - 18);
    ctx.lineTo(ax + 6, ay - 20);
    ctx.lineTo(ax + 10, ay + 4);
    ctx.lineTo(ax + 3, ay + 7);
    ctx.closePath();
    ctx.fill();

    return { stock, grip, guard, muzzleX: muzzle.x, muzzleY: muzzle.y };
  }

  // 参考：左脚前、托压右肩、贴腮、右手握把、左手护木、肘贴身——上半身锁成一块
  function stick(x, y, scale, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const hipX = 1;
    const hipY = 10;
    const shX = 2;
    const shY = -22;

    // 左脚朝目标迈半步，右脚撑
    softLimb(hipX, hipY, -8, 22, -15, 38, 7.0, color);
    softLimb(hipX, hipY, 10, 26, 15, 42, 7.0, color);
    softLimb(shX, shY, hipX + 1, -6, hipX, hipY, 8.0, color);

    // 层级：左臂(后) → 枪 → 右臂/手 → 后脑贴托（cheek weld）
    const gunAx = 8;
    const gunAy = -20;
    // 护木/握把点与 drawSmg 内一致
    const guard = { x: gunAx + 1, y: gunAy - 42 };
    const grip = { x: gunAx + 6, y: gunAy + 10 };
    softLimb(shX - 2, shY + 1, -4, -16, guard.x, guard.y, 5.6, color);
    const gun = drawSmg(gunAx, gunAy);
    softLimb(shX + 3, shY + 2, 14, -2, grip.x, grip.y, 5.6, color);
    handBlob(grip.x, grip.y, 4.0, color);
    handBlob(guard.x, guard.y, 3.6, color);
    stickHead(2, -36, 11.5, color);

    const muzzle = { x: x + gun.muzzleX * scale, y: y + gun.muzzleY * scale };
    ctx.restore();
    return muzzle;
  }

  /* 非人形外星球：椭圆躯干 + 刺 + 短触肢，靠弹跳不用走路 */
  function drawAlien(e, color) {
    const isBoss = e.kind === 'boss';
    const scale = isBoss ? 2.35 : e.kind === 'elite' ? 1.65 : 1.15;
    const flash = Math.min(1, e.hitFlash || 0);
    const lit = flash > 0 ? liftHex(color, 0.55 + flash * 0.4) : color;
    const hi = lit;
    const lo = shadeHex(lit, flash > 0 ? 0.12 : 0.28);
    const phase = e.hopPhase || 0;
    const hop = Math.abs(Math.sin(phase));
    const land = 1 - hop;
    const lift = hop * (isBoss ? 26 : 16);
    const sq = e.squash || 0;
    const sx = 1 + hop * 0.1 - land * 0.1 + sq * 0.35;
    const sy = 1 - hop * 0.14 + land * 0.1 - sq * 0.45;

    // 影子贴地（弹起时缩小）
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + (isBoss ? 36 : 28), (isBoss ? 34 : 20) * (1 - hop * 0.35), (isBoss ? 11 : 7) * (1 - hop * 0.25), 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.28 - hop * 0.12})`;
    ctx.fill();

    // 贴图模式：立牌 + 弹跳/压扁/闪白（有图就不画旧程序化身体）
    if (enemyArt.ready) {
      const base = isBoss ? 124 : (e.kind === 'elite' ? 84 : 62);
      ctx.save();
      ctx.translate(e.x, e.y - lift);
      ctx.scale(sx, sy);
      if (flash > 0.02) ctx.filter = `brightness(${1 + flash * 1.2})`;
      ctx.drawImage(isBoss ? enemyArt.boss : enemyArt.grunt, -base / 2, -base * 0.5, base, base);
      ctx.restore();
      return scale;
    }

    ctx.save();
    ctx.translate(e.x, e.y - lift);
    ctx.scale(scale * sx, scale * sy);

    // 触肢 / 短腿：落地压扁张开，腾空收拢
    const footY = 22 + land * 4;
    const footSpread = 14 + land * 8;
    for (const s of [-1, 0, 1]) {
      limb(s * 6, 8, s * footSpread, footY, isBoss ? 5.5 : 4.2, hi, lo);
    }

    // 躯干：扁椭圆（boss 更大更扁）
    const bw = isBoss ? 28 : 18;
    const bh = isBoss ? 22 : 15;
    ctx.strokeStyle = lo;
    ctx.lineWidth = isBoss ? 8 : 6;
    ctx.beginPath();
    ctx.ellipse(0, -4, bw, bh, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = hi;
    ctx.lineWidth = isBoss ? 5.5 : 4;
    ctx.beginPath();
    ctx.ellipse(-1, -5, bw, bh, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 头顶刺 / 触角
    const spikes = isBoss ? 5 : 3;
    for (let i = 0; i < spikes; i++) {
      const t = spikes === 1 ? 0 : (i / (spikes - 1)) * 2 - 1;
      const ax = t * (isBoss ? 18 : 12);
      const ay = -bh - 2;
      limb(ax * 0.4, ay + 4, ax, ay - (10 + (1 - Math.abs(t)) * 8), isBoss ? 4 : 3.2, shadeHex(color, 0.1), lo);
    }

    // 眼睛（boss 三只）
    ctx.fillStyle = hi;
    if (isBoss) {
      ctx.beginPath();
      ctx.arc(-10, -6, 3.2, 0, Math.PI * 2);
      ctx.arc(10, -6, 3.2, 0, Math.PI * 2);
      ctx.arc(0, -14, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(-6, -6, 2.6, 0, Math.PI * 2);
      ctx.arc(6, -6, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 侧鳍一点动感
    const fin = hop * 6;
    limb(-bw + 2, 0, -bw - 10, -4 - fin, 3, hi, lo);
    limb(bw - 2, 0, bw + 10, -4 - fin, 3, hi, lo);

    ctx.restore();
    return scale;
  }

  function drawPlayer() {
    const p = G.player;
    const kick = p.kick;

    // 地面光环（成长越高越亮）
    const t = Math.min(1, Math.log10(Math.max(1, p.dmgMul)) / 6);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 44, 42 + t * 54, 13 + t * 17, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 190, 130, ${0.05 + t * 0.18})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 214, 120, ${0.18 + t * 0.72})`;
    ctx.lineWidth = 2 + t * 2.5;
    ctx.stroke();

    // 待机呼吸 + 左右拖倾斜 + 开火后坐（动感全在代码，图是静态立牌）
    const bob = Math.sin(performance.now() / 520) * 1.6;
    const press = kick * 2;
    const Hp = PLAYER_ART.h;
    const Wp = Hp * PLAYER_ART.ratio;
    const footY = p.y + PLAYER_ART.footY + press;

    if (playerArt.ready) {
      ctx.save();
      ctx.translate(p.x, footY);
      ctx.rotate((p.lean || 0) * 0.045);   // ±约 2.6°
      ctx.drawImage(playerArt, -Wp / 2, -PLAYER_ART.footRel * Hp + bob, Wp, Hp);
      ctx.restore();
    } else {
      stick(p.x, p.y, 1.45, '#ff9ec4');
    }

    // 枪口火花：位置读立牌枪口比例，跟呼吸/后坐一起动
    if (kick > 0.35) {
      ctx.beginPath();
      ctx.arc(playerMuzzleX(), playerMuzzleY() + press + bob, 6 + 4 * kick, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 214, 120, 0.85)';
      ctx.fill();
    }
  }

  function drawEnemies() {
    for (const e of G.enemies) {
      if (e.dead) continue;

      const isBoss = e.kind === 'boss';
      const body = isBoss ? '#e8695f' : e.kind === 'elite' ? '#5fa83a' : '#7ec850';
      const scale = drawAlien(e, body);

      const label = fmt(e.hp);
      const lift = e.lift || 0;
      const hop = Math.abs(Math.sin(e.hopPhase || 0));
      const fs = Math.round(30 * (e.kind === 'elite' ? 1.35 : isBoss ? 1.3 : 1));
      ctx.font = '800 ' + fs + 'px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
      const ly = e.y - (isBoss ? 78 : 58) * scale - lift - hop * (isBoss ? 26 : 16);
      ctx.strokeText(label, e.x, ly);
      ctx.fillStyle = '#ff5a4a';
      ctx.fillText(label, e.x, ly);
    }
  }

  function drawBullets() {
    ctx.lineCap = 'round';

    for (const b of G.bullets) {
      const len = 26;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const tx = b.x - (b.vx / sp) * len;
      const ty = b.y - (b.vy / sp) * len;

      ctx.strokeStyle = 'rgba(255, 214, 120, 0.45)';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff3c4';
      ctx.fill();
    }

    ctx.lineCap = 'butt';
  }

  // 统一配色：只看"这张卡现在是坑还是收益"
  // 红 = 减益（还没喂回来），绿 = 增益
  function cardColors(c) {
    const tiered = c.type.id === 'dmgMul' || c.type.id === 'rateMul' || c.type.id === 'shots';
    const debuff = tiered && Math.round(c.value) < 0;

    return debuff
      ? ['rgba(235, 92, 92, 0.55)', 'rgba(180, 46, 46, 0.55)']
      : ['rgba(120, 222, 140, 0.55)', 'rgba(52, 168, 88, 0.55)'];
  }

  function drawCards() {
    const { wL, wR } = cardWidths();
    const h = 94;

    for (const c of G.cards) {
      if (c.dead) continue;

      const cw = c.side === 'left' ? wL : wR;
      const cx = c.side === 'left' ? cw / 2 : wL + cw / 2;
      const x = cx - cw / 2;
      const y = c.y - h / 2;
      const t = cardProgress(c);

      // 外光晕：被子弹喂得越多越亮
      ctx.fillStyle = `rgba(255, 224, 130, ${0.05 + t * 0.16 + c.flash * 0.3})`;
      ctx.fillRect(x, y - 6, cw, h + 12);

      // 卡面（半透明，能看见后面的桥）
      const g = ctx.createLinearGradient(x, y, x, y + h);
      const colors = cardColors(c);
      g.addColorStop(0, colors[0]);
      g.addColorStop(1, colors[1]);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cw, h);

      // 边框
      ctx.strokeStyle = `rgba(255, 236, 170, ${0.55 + t * 0.4})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1.5, y + 1.5, cw - 3, h - 3);

      // 文字
      ctx.font = '800 28px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#151812';

      let txt;
      const v = Math.round(c.value);
      if (c.type.id === 'dmgMul') {
        txt = `攻击 ${tierText(v)}`;
      } else if (c.type.id === 'rateMul') {
        txt = `攻速 ${signed(BAL.rateStep * v, 1)}`;
      } else if (c.type.id === 'shots') {
        txt = `弹道 ${signed(v)}`;
      } else {
        txt = `伤害 +${fmt(v)}`;
      }

      ctx.fillText(txt, cx, c.y);
    }
  }

  function drawParticles() {
    ctx.lineCap = 'round';
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.streak) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const len = p.size * 2.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(2, p.size * 0.7 * a);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len);
        ctx.stroke();
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a * (p.streak ? 0.55 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  function drawFloats() {
    for (const f of G.floats) {
      const t = Math.max(0, f.life / f.max);
      const a = t < 0.2 ? t / 0.2 : 1;
      ctx.globalAlpha = a;
      const fs = f.kill ? 36 : 26;
      ctx.font = '800 ' + fs + 'px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.kill ? '#ffe28a' : '#fff6d0';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // 属性面板：只读，随卡成长实时跳
  let lastBuffKey = '';

  function syncBuffs() {
    const p = G.player;

    const rows = [
      ['伤害', fmt(p.damage)],
      ['攻速', `${rateActual(p.rateTier).toFixed(1)}/s`],
      ['弹道', String(p.shots)],
    ];

    const key = rows.map((r) => r.join(':')).join('|');
    if (key === lastBuffKey) return;
    lastBuffKey = key;

    buffsEl.innerHTML = rows
      .map(([k, v]) => `<div class="buff"><span class="k">${k}</span><span class="v">${v}</span></div>`)
      .join('');

    buffsEl.hidden = false;
  }

  /* ----------------------------------------------------------
     画布尺寸
     ---------------------------------------------------------- */

  let sx = 1;
  let sy = 1;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    sx = canvas.width / W;
    sy = canvas.height / H;
  }

  window.addEventListener('resize', resize);

  /* ----------------------------------------------------------
     循环
     ---------------------------------------------------------- */

  let last = 0;
  const QS = new URLSearchParams(location.search);
  const FAST = Math.max(1, Math.min(8, Number(QS.get('fast')) || 1));

  function frame(now) {
    if (!last) last = now;
    let dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const rawDt = dt;
    dt *= FAST;

    if (!paused) {
      // 顿帧：击杀 / BOSS 时压慢游戏时间，但按真实时间倒计，不会卡住
      let step = dt;
      if (G.hitstop > 0) {
        G.hitstop = Math.max(0, G.hitstop - rawDt);
        step = dt * 0.05;
      }
      update(step);
      updateJuice(step);
    }
    syncBuffs();
    render();

    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------
     控件
     ---------------------------------------------------------- */

  /* ----------------------------------------------------------
     控件与输入
     ---------------------------------------------------------- */

  // 左右移动是这一版唯一的操作：键盘，或者直接拖
  const keys = { left: false, right: false };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  /* ----------------------------------------------------------
     拖动：PC 鼠标 + 手机触摸共用一套 Pointer Events
     ----------------------------------------------------------
     手机上的坑：
       1. 没有 touch-action: none 时，浏览器会把拖动当成滚动/缩放，
          直接发 pointercancel，表现就是"拖到一半就断了"。
       2. 多根手指会互相抢 pointerId，只认第一根按下的。
       3. 老浏览器没有 PointerEvent，用 touch 事件兜底。 */

  let dragging = false;
  let dragId = null;

  function moveToClientX(clientX) {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0) return;
    const nx = clampX(((clientX - r.left) / r.width) * W);
    const dx = nx - G.player.x;
    if (Math.abs(dx) > 0.5) G.player.leanT = Math.sign(dx);
    G.player.x = nx;
  }

  function startDrag(e) {
    if (paused || G.state === 'over') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 只认左键
    if (dragId !== null) return;                             // 已经有一根手指在拖

    dragId = e.pointerId;
    dragging = true;

    try { canvas.setPointerCapture(e.pointerId); } catch { /* 某些环境不支持 */ }

    // 触摸/笔：按下即跟手；鼠标：保持原来"按住拖"的手感
    if (e.pointerType !== 'mouse') moveToClientX(e.clientX);

    e.preventDefault();
  }

  function moveDrag(e) {
    if (!dragging || e.pointerId !== dragId || paused) return;
    moveToClientX(e.clientX);
    e.preventDefault();
  }

  function endDrag(e) {
    if (e.pointerId !== dragId) return;
    dragging = false;
    dragId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* 同上 */ }
  }

  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', startDrag, { passive: false });
    canvas.addEventListener('pointermove', moveDrag, { passive: false });
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);
  } else {
    // 兜底：iPhone 12 以前的 Safari / 一些老安卓浏览器
    const touchOf = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;

    canvas.addEventListener('touchstart', (e) => {
      if (paused || G.state === 'over') return;
      const t = touchOf(e);
      if (!t) return;
      dragging = true;
      moveToClientX(t.clientX);
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!dragging || paused) return;
      const t = touchOf(e);
      if (!t) return;
      moveToClientX(t.clientX);
      e.preventDefault();
    }, { passive: false });

    const endTouch = (e) => {
      dragging = false;
      if (e.cancelable) e.preventDefault();
    };

    canvas.addEventListener('touchend', endTouch, { passive: false });
    canvas.addEventListener('touchcancel', endTouch, { passive: false });
  }

  // 手机上长按会弹菜单/选择，影响拖动
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  pauseBtn.addEventListener('click', () => setPaused(!paused));

  // 空格 / P 也能暂停
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      setPaused(!paused);
    }
  });

  document.getElementById('again').addEventListener('click', reset);

  /* ----------------------------------------------------------
     启动
     ---------------------------------------------------------- */

  resize();
  reset();
  if (QS.has('debug')) {
    window.__g = G;
    window.__bal = BAL;
  }
  requestAnimationFrame(frame);

})();
