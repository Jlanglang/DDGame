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
    playerHp: 10,       // 桥头血量：漏一个小怪扣 1 点
    baseRate: 6.0,      // 初始攻速（发/秒）
    rateStep: 0.2,      // 每档攻速 +0.2/s
    rateFloor: 0.8,     // 攻速下限（吃了 -20 档的卡也不至于停火）
    rateMaxTier: 40,    // 攻速档位上限 → 6 + 8 = 14/s

    hpBase: 36,         // 第 1 波单个小怪血量
    hpGrowth: 1.88,     // 每过一波 ×1.88
    waves: 10,          // 10 波杂兵，清完 BOSS 登场
    bossMul: 14,        // BOSS 血量 = 第 10 波血量 ×14
    formationRowGap: 90, // 阵型里前后排的间距（像素）

    dmgAddMin: 4,       // 伤害卡：固定 +4 起步，每命中 +1，最多 +60
    dmgAddMax: 60,
    dmgCapBase: 50,     // 伤害天花板：前期几十
    dmgCapGrowth: 1.4,  // 每波 ×1.4 → 中期几百、后期几千

    atkMin: -29,        // 攻击卡从 ÷30 开始
    atkMax: 12,         // 上限 ×13
    rateMin: -20,       // 攻速卡从 -20 档开始
    shotsMin: -24,      // 弹道卡从 -24 开始
    shotsMax: 5,

    cardCd: 14,         // 一对卡之间的冷却（秒）
    cardSpeed: 230,     // 卡片下落速度 → 5.8 秒落地

    // 攻击卡很少出：单张抽到的权重只有 12
    weights: { dmgAdd: 48, rateMul: 25, shots: 15, dmgMul: 12 },
    noAtkBefore: 3,     // 前 3 波不出攻击卡
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
    spawnTimer: 0,
    waveGap: 0,
    round: 0,
    waveSize: 0,
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
    },
  };

  /* ----------------------------------------------------------
     元素
     ---------------------------------------------------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
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
    { kind: 'rect',    w: 5, h: 4 },   // 8 波：20      长方形
    { kind: 'diamond', w: 5, h: 5 },   // 9 波：25      菱形
    { kind: 'rect',    w: 5, h: 6 },   // 10 波：30     长方形
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
    G.waveGap = 1.4;
    G.cols = 2;
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
      speed: 72,
      r: 22,
      dead: false,
      hitFlash: 0,
      // 相邻两列的血条错开，后期数字长，不然会糊成一片
      lift: (Math.round(col) % 2) * 34,
      wob: Math.random() * Math.PI * 2,
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
      speed: 42,
      r: 46,
      dead: false,
      hitFlash: 0,
      wob: 0,
    });
  }

  // 卡片：同时最多两张，左右并排、同一高度
  // 一对卡落地后，还要空这么久才会有下一对
  const CARD_COOLDOWN = BAL.cardCd;

  function spawnCard(side, y, exclude) {
    // 按权重抽卡：攻击卡很少出
    // 前 3 波不出攻击卡——开局先让玩家把攻速/弹道/伤害铺起来
    let pool = CARD_TYPES.filter((t) => t.id !== exclude);
    if (G.wave <= BAL.noAtkBefore) pool = pool.filter((t) => t.id !== 'dmgMul');
    const total = pool.reduce((s, t) => s + (BAL.weights[t.id] || 1), 0);
    let roll = Math.random() * total;
    let type = pool[pool.length - 1];
    for (const t of pool) {
      roll -= BAL.weights[t.id] || 1;
      if (roll <= 0) { type = t; break; }
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

    const left = spawnCard('left', -100);
    spawnCard('right', -100, left.type.id);
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
    G.waveGap = 2.2;                   // 清场后的休息时间

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
    if (dir !== 0) p.x = clampX(p.x + dir * p.speed * dt);

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

  function shoot(dmg, originX, originY) {
    const p = G.player;
    const x0 = originX === undefined ? p.x : originX;
    const muzzleY = (originY === undefined ? p.y : originY) - 148;

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

      if (e.hitFlash > 0) e.hitFlash -= dt * 4;

      // 直线推进，不拐弯
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
        // 直接乘在当前总伤害上，但不能超过当前波的天花板
        const m = tierToMul(v);
        p.damage = Math.min(p.damage * m, damageCap());
        p.dmgMul *= m;
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

    e.hp -= b.damage;
    e.hitFlash = 1;

    burst(b.x, b.y, '#ffd166', 3);

    if (e.hp <= 0) {
      e.dead = true;
      G.kills += 1;

      burst(e.x, e.y, '#9be26a', e.kind === 'boss' ? 70 : 14);

      if (e.kind === 'boss') {
        win();
      }
    }
  }

  /* ----------------------------------------------------------
     粒子
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
      });
    }
  }

  function updateParticles(dt) {
    for (const p of G.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
    }
    G.particles = G.particles.filter((p) => p.life > 0);
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
    G.spawnTimer = 0;
    G.waveGap = 0;
    G.round = 0;
    G.waveSize = 0;
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
      updateParticles(dt);
      return;
    }

    updateParticles(dt);
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
    drawCards();
    drawBullets();
    drawPlayer();
    drawParticles();
  }

  function drawGround() {
    // 桥两侧的废墟
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, W, H);

    for (const d of DEBRIS) {
      ctx.fillStyle = `rgba(40, 46, 56, ${d.a})`;
      ctx.fillRect(d.x, d.y, d.w, d.h);
    }
  }

  function drawBridge() {
    const x0 = BRIDGE.left;
    const w = BRIDGE.right - BRIDGE.left;

    // 桥面底色
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3c424e');
    g.addColorStop(0.5, '#343a45');
    g.addColorStop(1, '#2b303a');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, w, H);

    // 石板横缝
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 2;
    for (let y = 60; y < H; y += 110) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.stroke();
    }

    // 石板竖缝
    for (let y = 60; y < H; y += 110) {
      const off = (y / 110) % 2 === 0 ? 0 : 150;
      for (let x = x0 + 120 + off; x < x0 + w; x += 300) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 110);
        ctx.stroke();
      }
    }

    // 裂缝
    ctx.strokeStyle = 'rgba(10, 12, 16, 0.55)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (const pts of CRACKS) {
      ctx.beginPath();
      pts.forEach(([cx, cy], i) => {
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    }

    // 桥沿
    ctx.fillStyle = '#20252d';
    ctx.fillRect(x0 - 8, 0, 8, H);
    ctx.fillRect(x0 + w, 0, 8, H);
  }

  function drawBarricade() {
    const y = BASE_Y + 18;
    const x0 = BRIDGE.left;
    const w = BRIDGE.right - BRIDGE.left;

    // 混凝土墩
    ctx.fillStyle = '#4a505c';
    ctx.fillRect(x0 - 6, y, w + 12, 34);

    // 黄黑警示条
    for (let x = x0 - 6; x < x0 + w + 6; x += 42) {
      ctx.fillStyle = '#e8c44a';
      ctx.beginPath();
      ctx.moveTo(x, y + 34);
      ctx.lineTo(x + 24, y);
      ctx.lineTo(x + 42, y);
      ctx.lineTo(x + 18, y + 34);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#1a1d22';
      ctx.beginPath();
      ctx.moveTo(x + 42, y + 34);
      ctx.lineTo(x + 66, y);
      ctx.lineTo(x + 84, y);
      ctx.lineTo(x + 60, y + 34);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- 火柴人 ---------- */

  function stick(x, y, scale, color, pose) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 头
    ctx.beginPath();
    ctx.arc(0, -54, 15, 0, Math.PI * 2);
    ctx.stroke();

    // 躯干
    ctx.beginPath();
    ctx.moveTo(0, -39);
    ctx.lineTo(0, 6);
    ctx.stroke();

    // 手臂
    if (pose === 'hero') {
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(-16, -56);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(18, -58);
      ctx.stroke();
    } else {
      const swing = Math.sin(G.time * 6 + x) * 6;
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(-18, -8 + swing);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(18, -8 - swing);
      ctx.stroke();
    }

    // 腿
    const step = Math.sin(G.time * 6 + x) * 7;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(-13, 38 + step);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.lineTo(13, 38 - step);
    ctx.stroke();

    ctx.restore();
  }

  function drawPlayer() {
    const p = G.player;
    const kick = p.kick * 5;

    // 脚下的光环跟着攻击倍率涨（对数，不然会一秒铺满全屏）
    const t = Math.min(1, Math.log10(Math.max(1, p.dmgMul)) / 6);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 44, 42 + t * 54, 13 + t * 17, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 190, 130, ${0.05 + t * 0.18})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 214, 120, ${0.18 + t * 0.72})`;
    ctx.lineWidth = 2 + t * 2.5;
    ctx.stroke();

    stick(p.x, p.y + kick, 1.45, '#ff9ec4', 'hero');

    // 枪
    ctx.strokeStyle = '#5b6270';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x + 26, p.y - 84 + kick);
    ctx.lineTo(p.x + 26, p.y - 128 + kick);
    ctx.stroke();

    ctx.strokeStyle = '#8d97a8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(p.x + 26, p.y - 128 + kick);
    ctx.lineTo(p.x + 26, p.y - 146 + kick);
    ctx.stroke();

    // 枪口火光
    if (p.kick > 0.35) {
      ctx.beginPath();
      ctx.arc(p.x + 26, p.y - 148 + kick, 9 * p.kick, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
      ctx.fill();
    }
  }

  function drawEnemies() {
    for (const e of G.enemies) {
      if (e.dead) continue;

      const scale = e.kind === 'boss' ? 2.8 : e.kind === 'elite' ? 1.75 : 1.2;
      const body = e.kind === 'boss' ? '#e8695f' : e.kind === 'elite' ? '#5fa83a' : '#7ec850';

      // 影子
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 40, 22, 8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fill();

      stick(e.x, e.y, scale, body, 'walk');

      // 头上的刺
      ctx.strokeStyle = e.kind === 'boss' ? '#8a3a33' : '#4d7a2c';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(e.x + k * 13 * scale * 0.8, e.y - 68 * scale);
        ctx.lineTo(e.x + k * 17 * scale * 0.8, e.y - 88 * scale);
        ctx.stroke();
      }

      // 命中闪白（BOSS 体积大，压低一点，不然像糊了个白球）
      if (e.hitFlash > 0) {
        ctx.globalAlpha = Math.min(0.3, e.hitFlash * 0.3);
        ctx.beginPath();
        ctx.arc(e.x, e.y - 20 * scale, 34 * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 血量数字：后期都是万/亿
      const label = fmt(e.hp);
      const lift = e.lift || 0;
      ctx.font = `800 ${Math.round(30 * (e.kind === 'elite' ? 1.35 : e.kind === 'boss' ? 1.3 : 1))}px "PingFang SC", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.strokeText(label, e.x, e.y - 104 * scale - lift);
      ctx.fillStyle = '#ff5a4a';
      ctx.fillText(label, e.x, e.y - 104 * scale - lift);
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
    for (const p of G.particles) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
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
    dt *= FAST;

    if (!paused) update(dt);
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
    G.player.x = clampX(((clientX - r.left) / r.width) * W);
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
