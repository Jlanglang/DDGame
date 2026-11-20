/* ============================================================
   守护豆豆 · 小队模式（v0.8 · 竖屏 2/3 战场 + 1/3 准备区）
   ------------------------------------------------------------
   准备（时间冻结）→ 点/拖人进格 / 两个一样的合成 → 开战 →
   清场 → 三选一 → 下一波。每关 20 波；**漏一个怪就输**（没有基地血量）。

   2026-11-20 竖屏定版（对齐《Survival Shelter》结构）：
     上 2/3（0..960） 一整块战场，留给背景图；格子区只占宽 1/3，街道 2/3。
     下 1/3（960..1440）3 个待命位（和战场同一套绘制，不是卡片）+ 刷新/开战 + 金币。
     5×5 格全开（原版也是这样，前期没金币刷，卡的是钱不是格子）。
   ============================================================ */

(() => {
  'use strict';

  const W = 720;                  // 竖屏舞台 720×1440（1:2）：手机竖着拿基本铺满
  const H = 1440;
  const SPLIT_Y = 960;            // 上 2/3 战场 / 下 1/3 准备区（960 = 1440 × 2/3）

  /* ----------------------------------------------------------
     布局（2026-11-20：上 2/3 战场 + 下 1/3 准备区）
     ---------------------------------------------------------- */

  // 5×5 = 25 格，默认全开。**格子区占宽 40%、街道 60%**（2026-11-20 主人定，好算）。
  const CELL = 56;
  const GRID = { cols: 5, rows: 5, cell: CELL };
  GRID.w = GRID.cols * CELL;       // 280
  GRID.x = 16;
  GRID.y = 340;                    // 战场 0..960 里垂直居中（340..620）
  GRID.h = GRID.rows * CELL;       // 280
  GRID.bottom = GRID.y + GRID.h;   // 620

  /* 刷新区：不是卡片，是 3 个「待命位」。单位按和战场完全一样的画法站进去
     （稀有度框 + 角标 + 枪管），一眼认兵种；占格看框的形状，等级看框色/角标。 */
  const BENCH_N = 3;
  const BENCH = {
    n: BENCH_N,
    cardW: 190, cardH: 200, gap: 16,
    y: 1028,
  };
  BENCH.w = BENCH_N * BENCH.cardW + (BENCH_N - 1) * BENCH.gap;
  BENCH.x0 = (W - BENCH.w) / 2;
  const BENCH_FIT = 160;           // 待命位里单位框的最长边适配到 160（1×1 和 2×2 看着一样饱满）

  // 金币总额放在下半区（2026-11-20 主人定），准备区和按钮同一条动线
  const COIN = { x: 26, y: 968, w: 250, h: 52 };

  const BTN = {
    refresh: { x: 26, y: 1248, w: 330, h: 110 },
    fight: { x: 364, y: 1248, w: 330, h: 110 },
  };

  // 敌人从右侧街道进来，向左压；漏到基地线就直接输
  const SPAWN_X = W - 8;
  const BASE_X = GRID.x - 12;
  const ENEMY_MIN_Y = GRID.y + 14;
  const ENEMY_MAX_Y = GRID.y + GRID.h - 14;

  /* ----------------------------------------------------------
     数据层：兵种 / 稀有度 / 数值 / BOSS 全在 squad-data.js
     （改数值去那个文件；本文件只读）
     ---------------------------------------------------------- */

  const DATA = globalThis.__SQUAD_DATA;
  if (!DATA) throw new Error('squad-data.js 没加载（squad.html 里必须排在 squad.js 前面）');

  const KINDS = DATA.KINDS;
  const RARITY = DATA.RARITY;
  const BOSS = DATA.BOSS;
  const MASTERY = DATA.MASTERY;
  const MAX_STAR = 5;
  const rarityOf = (star) => RARITY[Math.max(1, Math.min(MAX_STAR, star | 0)) - 1];

  const IDX = {};
  KINDS.forEach((k, i) => { IDX[k.id] = i; });

  // 可覆盖的数值：headless 里用 --tune / __SQUAD_TUNE 改，不改文件
  const TUNE = Object.assign({}, DATA.TUNE,
    (typeof globalThis !== 'undefined' && globalThis.__SQUAD_TUNE) || {});

  const starMul = (s) => Math.pow(TUNE.starGrowth, s - 1);

  /* ----------------------------------------------------------
     养成：每个兵种的等级存在本地，跨局保留
     - 等级提升基础攻击（每级 +12%）
     - **合成上限 = 等级**：3 级只能合到 3 星，想合 5 星得先养到 5 级
     - 升级花的是局内金币（每局重新赚），等级本身留着
     ---------------------------------------------------------- */

  const LV_KEY = 'doudou.squad.lv';
  let LV = new Array(KINDS.length).fill(3);
  if (typeof globalThis !== 'undefined' && Array.isArray(globalThis.__SQUAD_LV)) {
    LV = globalThis.__SQUAD_LV;          // 模拟器跨局共享同一份
  } else {
    try {
      const saved = JSON.parse(localStorage.getItem(LV_KEY) || 'null');
      if (Array.isArray(saved) && saved.length === KINDS.length) {
        LV = saved.map((v) => Math.max(1, Math.min(10, Number(v) || 3)));
      }
    } catch { /* 无痕模式 */ }
  }

  const lvMul = (kind) => 1 + (LV[kind] - 1) * 0.12;
  const maxStarOf = (kind) => Math.min(MAX_STAR, LV[kind]);
  const upgradeCost = (kind) => 60 * LV[kind];

  function saveLV() {
    try { localStorage.setItem(LV_KEY, JSON.stringify(LV)); } catch { /* ignore */ }
  }

  /* ----------------------------------------------------------
     主线进度：已解锁到第几关（1..TUNE.stages），跨局/跨会话保留
     ---------------------------------------------------------- */
  const STAGE_KEY = 'doudou.squad.stage';
  let HIGHEST = 1;
  if (typeof globalThis !== 'undefined' && typeof globalThis.__SQUAD_STAGE === 'number') {
    HIGHEST = globalThis.__SQUAD_STAGE;
  } else {
    try {
      HIGHEST = Math.max(1, Math.min(TUNE.stages, Number(localStorage.getItem(STAGE_KEY)) || 1));
    } catch { /* 无痕模式 */ }
  }

  function saveStage() {
    if (typeof globalThis !== 'undefined') globalThis.__SQUAD_STAGE = HIGHEST;
    try { localStorage.setItem(STAGE_KEY, String(HIGHEST)); } catch { /* ignore */ }
  }

  /* ----------------------------------------------------------
     状态
     ---------------------------------------------------------- */

  const G = {
    phase: 'prep',        // prep | battle | choose | win | over
    stage: HIGHEST,       // 当前关卡 1..TUNE.stages
    wave: 1,              // 当前（或即将开始的）波数，1..TUNE.waves
    coins: TUNE.startCoins,
    slots: new Array(GRID.cols * GRID.rows).fill(null),
    bench: new Array(BENCH_N).fill(null),
    buff: KINDS.map(() => ({ dmg: 1, rate: 1, range: 1, pellets: 0, hp: 1 })),  // 每波三选一攒下来的加成
    choices: null,                                         // 当前这三张卡
    coinAcc: 0,
    refreshCount: 0,                                       // 本波刷新了几次（价格递增）
    panel: false,                                          // 养成面板开着没有
    speed: 1,                                              // 战斗倍速：1 / 2 / 3（准备阶段不生效）
    aux: { medic: 0, engineer: 0, advisor: 0, drum: 0 },   // 场上辅助英雄数量
    enemies: [], bullets: [], bits: [], floats: [], rings: [],
    pick: null,                                            // 点选中的单位（点按合成用）
    spawnLeft: 0,
    spawnTimer: 0,
    spawnInterval: 0.6,
    bossKind: null,                                        // 本波还没出场的 BOSS（'minor'/'major'/null）
    battleT: 0,                                            // 本波已经打了多久（超时兜底用）
    drag: null,
    shake: 0,
    flash: 0,
    flashColor: '255,255,255',
    time: 0,
    baseHit: 0,                                            // 漏怪时基地线红脉冲（不抖屏）
    toast: '',
    toastT: 0,
    stats: { kills: 0, merges: 0, best: 1, deaths: 0 },
  };

  /* ----------------------------------------------------------
     工具
     ---------------------------------------------------------- */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));

  // 点到线段的距离：子弹一帧可能飞很远（掉帧 / 倍速 / 小怪），必须用扫掠判定，不能只看落点
  function distPointSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 < 0.0001) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  function rr(c, x, y, w, h, r) {
    const k = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + k, y);
    c.arcTo(x + w, y, x + w, y + h, k);
    c.arcTo(x + w, y + h, x, y + h, k);
    c.arcTo(x, y + h, x, y, k);
    c.arcTo(x, y, x + w, y, k);
    c.closePath();
  }

  function toast(text) {
    G.toast = text;
    G.toastT = 2.2;
  }

  /* ----------------------------------------------------------
     音效：全部程序化（WebAudio），不加载任何文件
     ----------------------------------------------------------
     浏览器要求先有用户手势才能出声，所以第一次 pointerdown 时再建
     AudioContext。射击每秒十几次，加了 70ms 冷却，不然会糊成一片。 */

  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null;
  let muted = false;
  let lastShootSfx = 0;
  try { muted = localStorage.getItem('doudou.squad.muted') === '1'; } catch { /* 无痕模式 */ }

  function audioOn() {
    if (muted || !AC) return false;
    if (!actx) {
      try { actx = new AC(); } catch { return false; }
    }
    if (actx.state === 'suspended') actx.resume();
    return true;
  }

  function tone(freq, dur, type, gain, slideTo) {
    if (!audioOn()) return;
    const t = actx.currentTime;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(dur, gain, hz) {
    if (!audioOn()) return;
    const t = actx.currentTime;
    const n = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = hz || 1200;
    const g = actx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(actx.destination);
    src.start(t);
  }

  const SFX = {
    shoot(kind) {
      const now = performance.now();
      if (now - lastShootSfx < 70) return;
      lastShootSfx = now;
      tone(kind === 2 ? 720 : 520, 0.05, 'square', 0.022, 260);
    },
    merge(star) {
      tone(420 + star * 60, 0.16, 'triangle', 0.15, 880 + star * 90);
      setTimeout(() => tone(880 + star * 90, 0.12, 'triangle', 0.09, 1240), 70);
      noise(0.12, 0.05, 3200);
    },
    kill() {
      noise(0.07, 0.05, 900);
      tone(150, 0.08, 'sawtooth', 0.03, 70);
    },
    hurt() {
      tone(200, 0.2, 'sawtooth', 0.09, 80);
      noise(0.15, 0.06, 500);
    },
    battle() {
      tone(330, 0.1, 'square', 0.06);
      setTimeout(() => tone(440, 0.12, 'square', 0.06), 90);
    },
    clear() {
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.07), i * 90));
    },
    unitHit() {
      tone(120, 0.06, 'triangle', 0.035, 80);
    },
    unitDown() {
      tone(240, 0.22, 'sawtooth', 0.07, 70);
      noise(0.18, 0.05, 600);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.09), i * 130));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.07), i * 150));
    },
  };

  const MUTE_BTN = { x: 592, y: 12, w: 104, h: 84 };
  const PANEL_BTN = { x: 470, y: 12, w: 110, h: 84 };
  const SPEED_BTN = { x: 350, y: 12, w: 104, h: 84 };   // 战斗倍速 ×1 / ×2 / ×3

  function slotCenter(i) {
    const c = i % GRID.cols;
    const r = Math.floor(i / GRID.cols);
    return {
      x: GRID.x + c * CELL + CELL / 2,
      y: GRID.y + r * CELL + CELL / 2,
    };
  }

  /* 待命位：3 个格子，整块都是命中区（点/拖都在这里），单位按战场的 w×h 站进去。
     点一个待命位 → 再点战场格子/另一个待命位 → 移动或合成；拖拽同理。 */
  function benchRects() {
    return [0, 1, 2].map((i) => ({
      x: BENCH.x0 + i * (BENCH.cardW + BENCH.gap),
      y: BENCH.y,
      w: BENCH.cardW,
      h: BENCH.cardH,
    }));
  }

  // 待命位中心：单位和战场用同一套绘制，按占格把框的最长边适配到 BENCH_FIT
  function benchCenter(i) {
    const r = benchRects()[i];
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  function benchUnitScale(u) {
    const span = Math.max(u.w || 1, u.h || 1) * CELL * 0.95;
    return BENCH_FIT / span;
  }

  /* ----------------------------------------------------------
     单位
     ---------------------------------------------------------- */

  function unitMaxHp(kind, star) {
    const k = KINDS[kind];
    const b = G.buff[kind];
    return Math.round(k.hp * (1 + (star - 1) * TUNE.unitHpStar) * lvMul(kind) * (b ? b.hp : 1));
  }

  function makeUnit(kind, star) {
    const k = KINDS[kind];
    const maxHp = unitMaxHp(kind, star);
    return { kind, star, cd: 0, w: k.w, h: k.h, cell: -1, hp: maxHp, maxHp };
  }

  // 合成升星后回满血（新单位是新战力，不是残血续命）
  function refreshUnitHp(u) {
    u.maxHp = unitMaxHp(u.kind, u.star);
    u.hp = u.maxHp;
  }

  // 等级专精（面板要能看到）：Lv5 攻速 / Lv7 射程 / Lv9 伤害 / Lv10 弹道
  function masteryOf(kind) {
    const lv = LV[kind];
    return {
      rate: lv >= 5 ? 1.10 : 1,
      range: lv >= 7 ? 1.10 : 1,
      dmg: lv >= 9 ? 1.20 : 1,
      pellets: lv >= 10 ? 1 : 0,
    };
  }

  function unitDmg(u) {
    const b = G.buff[u.kind];
    return KINDS[u.kind].dmg * starMul(u.star) * (b ? b.dmg : 1) * lvMul(u.kind) * masteryOf(u.kind).dmg;
  }

  function unitRate(u) {
    const b = G.buff[u.kind];
    const haste = 1 + (KINDS[IDX.drum].haste || 0) * (G.aux ? G.aux.drum : 0);
    return KINDS[u.kind].rate * (1 + (u.star - 1) * 0.08) * (b ? b.rate : 1) * haste * masteryOf(u.kind).rate;
  }

  function unitRange(u) {
    const b = G.buff[u.kind];
    return (KINDS[u.kind].range + (u.star - 1) * 40) * (b ? b.range : 1) * masteryOf(u.kind).range;
  }

  function randomKind() {
    const pool = [];
    for (let i = 0; i < KINDS.length; i++) if (KINDS[i].unlock <= G.stage) pool.push(i);
    const total = pool.reduce((a, i) => a + KINDS[i].weight, 0);
    let r = Math.random() * total;
    for (const i of pool) {
      r -= KINDS[i].weight;
      if (r <= 0) return i;
    }
    return pool[pool.length - 1];
  }

  /* ----------------------------------------------------------
     占格：一个大单位同时占 w×h 个格子（每个格子都指向同一个对象）
     ---------------------------------------------------------- */

  function canPlace(cell, w, h, except) {
    const c0 = cell % GRID.cols;
    const r0 = Math.floor(cell / GRID.cols);
    if (c0 + w > GRID.cols || r0 + h > GRID.rows) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const idx = (r0 + dy) * GRID.cols + c0 + dx;
        const u = G.slots[idx];
        if (u && u !== except) return false;
      }
    }
    return true;
  }


  function occupy(cell, u) {
    u.cell = cell;
    u.w = KINDS[u.kind].w;
    u.h = KINDS[u.kind].h;
    const c0 = cell % GRID.cols;
    const r0 = Math.floor(cell / GRID.cols);
    for (let dy = 0; dy < u.h; dy++) {
      for (let dx = 0; dx < u.w; dx++) {
        G.slots[(r0 + dy) * GRID.cols + c0 + dx] = u;
      }
    }
  }

  function vacate(u) {
    for (let i = 0; i < G.slots.length; i++) if (G.slots[i] === u) G.slots[i] = null;
    u.cell = -1;
  }

  function fitsAnywhere(u) {
    for (let r = 0; r <= GRID.rows - u.h; r++) {
      for (let c = 0; c <= GRID.cols - u.w; c++) {
        if (canPlace(r * GRID.cols + c, u.w, u.h)) return true;
      }
    }
    return false;
  }

  function unitCenter(u) {
    const c0 = u.cell % GRID.cols;
    const r0 = Math.floor(u.cell / GRID.cols);
    return {
      x: GRID.x + c0 * CELL + u.w * CELL / 2,
      y: GRID.y + r0 * CELL + u.h * CELL / 2,
    };
  }

  // 单位占的矩形（敌人贴身判定的依据）
  function unitRect(u) {
    const c0 = u.cell % GRID.cols;
    const r0 = Math.floor(u.cell / GRID.cols);
    return { x: GRID.x + c0 * CELL, y: GRID.y + r0 * CELL, w: u.w * CELL, h: u.h * CELL };
  }

  /* 敌人从右侧压过来，碰到哪个单位就停下来打它（不是闷头走基地）。
     只认「正挡在面前」的：y 在单位高度内、x 已经贴到格子右边缘。
     units 由 updateEnemies 每帧算一次，别每个敌人重扫一遍格子。 */
  function blockingUnit(e, units) {
    let best = null;
    let bestD = Infinity;
    for (const u of units) {
      const r = unitRect(u);
      if (e.y < r.y - e.r * 0.6 || e.y > r.y + r.h + e.r * 0.6) continue;
      const touch = r.x + r.w + e.r - 6;                 // 敌人边缘刚碰到格子右边缘
      const deep = r.x + r.w * (1 - TUNE.enemyReach);    // 压进格子太深就不算挡
      if (e.x > touch || e.x < deep) continue;
      const d = Math.abs(e.x - touch);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  function activeUnits() {
    const out = [];
    const seen = new Set();
    for (const u of G.slots) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    return out;
  }


  /* ----------------------------------------------------------
     波次
     ---------------------------------------------------------- */

  const stageMul = (base) => Math.pow(base, G.stage - 1);

  function waveCount(n) {
    return Math.round(TUNE.countBase + n * TUNE.countPerWave);
  }

  function waveHp(n) {
    return TUNE.hpBase * Math.pow(TUNE.hpGrowth, n - 1) * stageMul(TUNE.stageHpMul);
  }

  function waveSpeed(n) {
    return (TUNE.speedBase + n * TUNE.speedPerWave) * stageMul(TUNE.stageSpeedMul);
  }

  function waveEnemyAtk(n) {
    return TUNE.enemyAtkBase * Math.pow(TUNE.enemyAtkGrowth, n - 1) * stageMul(TUNE.stageAtkMul);
  }

  function startBattle() {
    if (G.phase !== 'prep') return;
    const filled = G.slots.filter(Boolean).length;
    if (filled === 0) { toast('先拖一个队员上场'); return; }

    G.phase = 'battle';
    G.refreshCount = 0;                 // 每波刷新价格重置
    // 待命区不保留：开战就清掉（只当合成中转站用）
    G.bench.fill(null);
    G.pick = null;
    // BOSS 波：小 BOSS 5/10/15，大 BOSS 20；BOSS 最后出场，不占小兵名额
    G.bossKind = DATA.isBossWave(G.wave)
      ? (G.wave === BOSS.major.wave ? 'major' : 'minor') : null;
    G.spawnLeft = waveCount(G.wave) + (G.bossKind ? 1 : 0);
    G.spawnInterval = Math.max(0.22, TUNE.spawnBase - G.wave * TUNE.spawnDrop);
    G.spawnTimer = 0.35;
    G.battleT = 0;
    G.bullets.length = 0;
    G.enemies.length = 0;
    G.bits.length = 0;
    G.floats.length = 0;
    G.rings.length = 0;
    for (const u of G.slots) if (u) u.cd = 0;
    SFX.battle();
    toast(G.bossKind ? `第 ${G.wave} 波 · BOSS 来了` : `第 ${G.wave} 波`);
  }

  // bossKind：不传 = 普通小兵；'minor' / 'major' = BOSS
  function spawnEnemy(bossKind) {
    const boss = bossKind ? BOSS[bossKind] : null;
    const hp = waveHp(G.wave) * (boss ? boss.hpMul : 1);
    G.enemies.push({
      x: SPAWN_X - rand(0, 24),      // 从右侧街道边进来（不跑出屏幕外）
      y: boss ? ENEMY_MIN_Y + (ENEMY_MAX_Y - ENEMY_MIN_Y) * rand(0.2, 0.8)
              : rand(ENEMY_MIN_Y, ENEMY_MAX_Y),
      hp, maxHp: hp,
      speed: waveSpeed(G.wave) * rand(0.9, 1.1) * (boss ? boss.speedMul : 1),
      atk: waveEnemyAtk(G.wave) * (boss ? boss.atkMul : 1),
      atkCd: rand(0.2, 0.9),
      atkTarget: null,
      r: boss ? boss.r : 9,
      boss: bossKind || null,
      t: rand(0, 6.28),
      hitT: 0,                        // 受击闪白（割草反馈）
      dead: false,
    });
    G.spawnLeft--;
  }

  /* ----------------------------------------------------------
     每波三选一：清完一波，从池子里抽三张，选一张
     ---------------------------------------------------------- */

  function rollUpgrades() {
    const pool = [];
    for (let i = 0; i < KINDS.length; i++) {
      if (KINDS[i].unlock > G.stage) continue;      // 没解锁的英雄不会出现在三选一
      const name = KINDS[i].name;
      const combat = KINDS[i].dmg > 0;
      if (combat) {
        pool.push({ kind: i, label: name, stat: 'dmg', mul: 1.25, text: '伤害 +25%' });
        pool.push({ kind: i, label: name, stat: 'rate', mul: 1.2, text: '射速 +20%' });
        pool.push({ kind: i, label: name, stat: 'range', mul: 1.15, text: '射程 +15%' });
        if (KINDS[i].pellets === 1) {
          pool.push({ kind: i, label: name, stat: 'pellets', add: 1, text: '弹道 +1' });
        }
      }
      pool.push({ kind: i, label: name, stat: 'hp', mul: 1.2, text: '生命 +20%' });
    }
    pool.push({ label: '补给', flat: 30, text: '获得 30 金币' });
    pool.push({ label: '补给', flat: 30, text: '获得 30 金币' });

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  }

  function applyUpgrade(u) {
    if (u.flat) {
      G.coins += u.flat;
    } else {
      const b = G.buff[u.kind];
      if (u.add) b[u.stat] += u.add;
      else b[u.stat] *= u.mul;
    }
    G.flash = 0.2;
    SFX.battle();
  }

  function settleWave() {
    // 一波结束：把上一波残留的子弹 / 爆汁 / 飘字 / 冲击环 / 尸体清干净，
    // 回准备时画面不留垃圾（2026-11-20 主人反馈）。
    G.bullets.length = 0;
    G.bits.length = 0;
    G.floats.length = 0;
    G.rings.length = 0;
    G.enemies.length = 0;

    const gain = TUNE.waveBonusBase + G.wave * TUNE.waveBonusPer;
    G.coins += gain;
    if (G.wave >= TUNE.waves) {
      G.phase = 'win';
      G.flash = 0.6;
      SFX.win();
      // 通关后解锁下一关，进度落盘
      if (G.stage < TUNE.stages) {
        HIGHEST = Math.max(HIGHEST, G.stage + 1);
        saveStage();
      }
      return;
    }
    G.wave++;
    G.refreshCount = 0;                 // 每波结束免费刷一次，付费刷新从 10 重新起价
    rollBench();                        // 免费换 3 个候选：既是白送，也提醒玩家「可以刷新」
    SFX.clear();
    G.choices = rollUpgrades();
    G.phase = 'choose';
    toast(`第 ${G.wave - 1} 波清除  +${gain} 金币 · 已免费刷新`);
  }

  function lose() {
    G.phase = 'over';
    G.baseHit = 0.6;
    SFX.lose();
  }

  function restart() {
    G.phase = 'prep';
    G.wave = 1;
    G.coins = TUNE.startCoins;
    G.slots.fill(null);
    G.bench.fill(null);
    G.enemies.length = 0;
    G.bullets.length = 0;
    G.bits.length = 0;
    G.floats.length = 0;
    G.rings.length = 0;
    G.spawnLeft = 0;
    G.stats = { kills: 0, merges: 0, best: 1, deaths: 0 };
    G.buff = KINDS.map(() => ({ dmg: 1, rate: 1, range: 1, pellets: 0, hp: 1 }));
    G.choices = null;
    G.coinAcc = 0;
    G.refreshCount = 0;
    G.pick = null;
    G.panel = false;
    G.bossKind = null;
    G.shake = 0;
    G.flash = 0;
    seedBench();
    toast('点一下选中，点另一个同款合成');
  }

  // 通一关 → 下一关（重置局内，保留跨局等级和关卡进度）
  function nextStage() {
    if (G.stage < TUNE.stages) {
      G.stage++;
      HIGHEST = Math.max(HIGHEST, G.stage);
      saveStage();
    }
    restart();
    toast(`第 ${G.stage} 关`);
  }

  // 开局送 3 个：按已解锁英雄轮流给，尽量不重复（自动合成留给刷新和拖回）
  function seedBench() {
    const pool = [];
    for (let i = 0; i < KINDS.length; i++) if (KINDS[i].unlock <= G.stage) pool.push(i);
    for (let i = 0; i < BENCH_N; i++) G.bench[i] = makeUnit(pool[i % pool.length], 1);
  }

  /* ----------------------------------------------------------
     刷新（抽人）
     ---------------------------------------------------------- */

  function emptyBench() {
    return G.bench.indexOf(null);
  }

  function refreshPrice() {
    return TUNE.refreshCost + G.refreshCount * TUNE.refreshStep;
  }

  // 抽 3 个新候选：付费刷新、每波结束的免费刷新都走这里
  function rollBench() {
    for (let i = 0; i < BENCH_N; i++) {
      G.bench[i] = makeUnit(randomKind(), Math.random() < 0.12 ? 2 : 1);
    }
    autoMergeBench();
  }

  // 刷新 = 换一批候选：待命区原来的直接丢掉重抽（原版就是这样，满了也能刷）
  function refresh() {
    if (G.phase !== 'prep') { toast('开战中不能刷新'); return; }
    const price = refreshPrice();
    if (G.coins < price) { toast('金币不够'); return; }
    G.coins -= price;
    G.refreshCount++;
    rollBench();
    G.pick = null;
    SFX.battle();
    toast(`刷新 -${price} 金币`);
  }

  /* ----------------------------------------------------------
     合成
     ---------------------------------------------------------- */

  function mergeFx(u) {
    // 在场上按格子中心放特效；在待命位就按待命位中心放（不会跌到屏幕外）
    let p;
    if (u.cell >= 0) {
      p = unitCenter(u);
    } else {
      const bi = G.bench.indexOf(u);
      p = bi >= 0 ? benchCenter(bi) : { x: W / 2, y: BENCH.y + BENCH.cardH / 2 };
    }
    G.stats.merges++;
    G.stats.best = Math.max(G.stats.best, u.star);
    // 局部反馈：本体闪一下 + 扩散环 + 粒子 + 飘字；不整屏抖/闪（主人反感）
    u.fxT = 0.45;
    G.rings.push({
      x: p.x, y: p.y, r: 6, life: 0.55, maxLife: 0.55,
      color: u.star >= 4 ? '255,224,138' : '255,209,102',
    });
    for (let n = 0; n < 22; n++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(70, 260);
      G.bits.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
        life: rand(0.35, 0.75), max: 0.75,
        color: u.star >= 4 ? '#ffe08a' : '#ffd166',
        size: rand(1.5, 3.5),
      });
    }
    G.floats.push({
      x: p.x, y: p.y - 24, vy: -70, life: 1.1, max: 1.1,
      text: `${u.star} 星`, color: '#ffe08a', size: 22,
    });
    SFX.merge(u.star);
  }

  // 待命区自动合成：同兵种同星会自己往上合（原版待命区就是自动合）
  function autoMergeBench() {
    let guard = 0;
    while (guard++ < 20) {
      let merged = false;
      for (let i = 0; i < BENCH_N && !merged; i++) {
        const a = G.bench[i];
        if (!a || a.star >= maxStarOf(a.kind)) continue;
        for (let j = i + 1; j < BENCH_N; j++) {
          const b = G.bench[j];
          if (b && b.kind === a.kind && b.star === a.star) {
            G.bench[j] = null;
            a.star++;
            refreshUnitHp(a);
            mergeFx(a);
            merged = true;
            break;
          }
        }
      }
      if (!merged) break;
    }
  }

  /* ----------------------------------------------------------
     HUD 上的小提示
     ---------------------------------------------------------- */

  function addFloat(x, y, text, color, size, vy) {
    G.floats.push({ x, y, vy: vy || -60, life: 0.8, max: 0.8, text, color, size: size || 22 });
  }

  /* ----------------------------------------------------------
     输入
     ---------------------------------------------------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let rect = null;
  function measure() {
    rect = canvas.getBoundingClientRect();
  }

  function toLogic(e) {
    const r = rect || canvas.getBoundingClientRect();
    if (r.width <= 0) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  }

  const hitRect = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  function slotIndexAt(p) {
    const c = Math.floor((p.x - GRID.x) / CELL);
    const r = Math.floor((p.y - GRID.y) / CELL);
    if (c < 0 || c >= GRID.cols || r < 0 || r >= GRID.rows) return -1;
    return r * GRID.cols + c;
  }

  function benchIndexAt(p) {
    const rects = benchRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
    }
    return -1;
  }

  let dragId = null;
  let press = null;   // 按下时的落点：移动超过阈值算拖拽，否则算点击

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (dragId !== null) return;
    dragId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    measure();
    const p = toLogic(e);
    audioOn();

    if (hitRect(MUTE_BTN, p)) {
      muted = !muted;
      try { localStorage.setItem('doudou.squad.muted', muted ? '1' : '0'); } catch { /* ignore */ }
      if (!muted) audioOn();
      return;
    }

    // 战斗倍速：×1 → ×2 → ×3 → ×1（准备阶段点了也记住，开战生效）
    if (hitRect(SPEED_BTN, p)) {
      G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1;
      toast(`战斗速度 ×${G.speed}${G.phase === 'battle' ? '' : '（开战后生效）'}`);
      return;
    }

    if (G.panel) {
      if (hitRect(PANEL_BTN, p)) { G.panel = false; return; }
      const rows = panelRows();
      for (let i = 0; i < rows.length; i++) {
        if (hitRect(upBtnRect(rows[i]), p)) {
          if (KINDS[i].unlock > G.stage) return;      // 还没解锁，点了也不升级
          const cost = upgradeCost(i);
          if (LV[i] < 10 && G.coins >= cost) {
            G.coins -= cost;
            LV[i]++;
            saveLV();
            SFX.merge(3);
            G.flash = 0.18;
          }
          return;
        }
      }
      G.panel = false;
      return;
    }

    if (hitRect(PANEL_BTN, p)) {
      if (G.phase !== 'prep') { toast('战斗中不能看养成'); return; }   // 面板盖战场但不暂停，战斗中禁开
      G.panel = true;
      return;
    }

    if (G.phase === 'choose') {
      const rects = choiceRects();
      for (let i = 0; i < rects.length; i++) {
        if (hitRect(rects[i], p) && G.choices && G.choices[i]) {
          applyUpgrade(G.choices[i]);
          G.choices = null;
          G.phase = 'prep';
          return;
        }
      }
      return;
    }

    if (G.phase === 'win') { nextStage(); return; }
    if (G.phase === 'over') { restart(); return; }
    if (hitRect(BTN.refresh, p)) { refresh(); return; }
    if (hitRect(BTN.fight, p)) { startBattle(); return; }
    if (G.phase !== 'prep') return;

    const si = slotIndexAt(p);
    if (si >= 0) {
      // 点格子：有单位 → 选中/换位；空格 → 留着 press，让 tap 把手上选中的单位放进来
      press = { x: p.x, y: p.y, from: 'slot', i: si, unit: G.slots[si] || null, moved: false };
      return;
    }
    const bi = benchIndexAt(p);
    if (bi >= 0) {
      press = { x: p.x, y: p.y, from: 'bench', i: bi, unit: G.bench[bi], moved: false };
      return;
    }
    // 点到战场 / 待命区以外：取消选中
    G.pick = null;
    press = { x: p.x, y: p.y, from: 'none', i: -1, unit: null, moved: false };
  }

  function onMove(e) {
    if (e.pointerId !== dragId) return;
    const p = toLogic(e);
    if (!press) return;
    // 点击/拖拽阈值按 CSS px 算（10 CSS ≈ 手指抖动），别用逻辑 px 写死 6
    const slop = 10 * (W / ((rect && rect.width) || W));
    if (!press.moved && Math.hypot(p.x - press.x, p.y - press.y) > slop) {
      press.moved = true;
      if (press.unit) {
        G.drag = { from: press.from, i: press.i, unit: press.unit, x: p.x, y: p.y };
        G.pick = null;
      }
    }
    if (press.moved && G.drag) {
      G.drag.x = p.x;
      G.drag.y = p.y;
    }
    if (e.cancelable) e.preventDefault();
  }

  function onUp(e) {
    if (e.pointerId === dragId) {
      const p = toLogic(e);
      if (press && press.moved && G.drag) drop(G.drag, p);
      else if (press) tap(press, p);
      G.drag = null;
      press = null;
    }
    if (e.pointerId === dragId) dragId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  // 点按操作：点一个单位选中，再点同兵种同星 → 合成；点空地 → 把选中的放过去
  function tap(pr, p) {
    if (G.phase !== 'prep') return;
    const unit = pr.unit;
    const pick = G.pick;

    if (unit) {
      if (!pick) { G.pick = { unit, from: pr.from, i: pr.i }; SFX.battle(); return; }
      if (pick.unit === unit) { G.pick = null; return; }
      if (pick.unit.kind === unit.kind && pick.unit.star === unit.star && unit.star < maxStarOf(unit.kind)) {
        mergeInto(pick, pr);
        G.pick = null;
        return;
      }
      G.pick = { unit, from: pr.from, i: pr.i };
      return;
    }

    if (!pick) return;
    // 点按和拖拽走同一条落点逻辑：格子吸附、最近可放位置、合成、放回待命区全一致
    const src = pick.unit;
    const oldCell = src.cell;
    const oldBench = pick.from === 'bench' ? pick.i : -1;
    drop({ from: pick.from, i: pick.i, unit: src }, p);
    // 放不下就保留选中，别让玩家白点一次
    const moved = pick.from === 'slot' ? src.cell !== oldCell : G.bench[oldBench] !== src;
    if (moved) G.pick = null;
  }

  // 把 a 合到 b 身上（点按合成）
  function mergeInto(a, b) {
    const src = a.unit;
    const tgt = b.unit;
    if (!src || !tgt || src === tgt) return;
    if (a.from === 'slot') vacate(src); else G.bench[a.i] = null;
    tgt.star++;
    refreshUnitHp(tgt);
    mergeFx(tgt);
    autoMergeBench();
  }

  function drop(d, p) {
    const u = d.unit;
    if (!u) return;
    const c = Math.floor((p.x - GRID.x) / CELL);
    const r = Math.floor((p.y - GRID.y) / CELL);
    if (c >= 0 && c < GRID.cols && r >= 0 && r < GRID.rows) {
      const c0 = clamp(c - Math.floor((u.w - 1) / 2), 0, GRID.cols - u.w);
      const r0 = clamp(r - Math.floor((u.h - 1) / 2), 0, GRID.rows - u.h);
      const cell = r0 * GRID.cols + c0;
      const tgt = G.slots[cell];
      const canMerge = tgt && tgt !== u && tgt.kind === u.kind && tgt.star === u.star && tgt.star < MAX_STAR;
      let at = cell;
      if (!canMerge) {
        const near = findNearestPlacement(cell, u.w, u.h, u, 2);
        if (near < 0) return;          // 附近实在没地方，不动
        at = near;
      }
      dropToSlot(d, at);
      return;
    }
    const bi = benchIndexAt(p);
    if (bi >= 0) dropToBench(d, bi);
  }

  function dropToSlot(d, cell) {
    const src = d.unit;
    if (!src) return;
    if (src.cell === cell) return;

    const tgt = G.slots[cell];
    if (tgt && tgt !== src && tgt.kind === src.kind && tgt.star === src.star && tgt.star < maxStarOf(tgt.kind)) {
      // 合成：目标升一星，源整个消失
      if (d.from === 'slot') vacate(src); else G.bench[d.i] = null;
      tgt.star++;
      refreshUnitHp(tgt);
      mergeFx(tgt);
      return;
    }

    if (d.from === 'slot') {
      const old = src.cell;
      vacate(src);
      if (canPlace(cell, src.w, src.h)) { occupy(cell, src); return; }
      occupy(old, src);       // 放不下就回原位
      return;
    }

    if (!canPlace(cell, src.w, src.h)) return;
    G.bench[d.i] = null;
    occupy(cell, src);
  }

  function dropToBench(d, bi) {
    const src = d.unit;
    if (!src) return;
    if (d.from === 'bench' && d.i === bi) return;
    const tgt = G.bench[bi];

    // 同兵种同星 → 待命区里直接合成
    if (tgt && tgt !== src && tgt.kind === src.kind && tgt.star === src.star && tgt.star < maxStarOf(tgt.kind)) {
      if (d.from === 'slot') vacate(src); else G.bench[d.i] = null;
      tgt.star++;
      refreshUnitHp(tgt);
      mergeFx(tgt);
      autoMergeBench();
      return;
    }

    // 槽被占且不能合：挪到任意空槽（场上拖回来的也接）
    let dest = bi;
    if (tgt) {
      dest = emptyBench();
      if (dest < 0) { toast('待命区满了'); return; }
    }
    if (d.from === 'slot') vacate(src); else G.bench[d.i] = null;
    G.bench[dest] = src;
  }

  /* ----------------------------------------------------------
     更新
     ---------------------------------------------------------- */

  function update(dt) {
    G.time += dt;
    if (G.toastT > 0) G.toastT -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 60);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.4);
    if (G.baseHit > 0) G.baseHit = Math.max(0, G.baseHit - dt);

    countAux();

    // 金币只有三源（2026-11-20 主人定）：①战争顾问上场后每秒产 ②清一波奖励 ③三选一的补给
    // 准备阶段时间冻结，不产金币——之前「不开始也一直加钱」就是这里没 gate 住。
    if (G.phase === 'battle') {
      const perSec = (KINDS[IDX.advisor].coin || 0) * G.aux.advisor;
      if (perSec > 0) {
        G.coinAcc += dt * perSec;
        const n = Math.floor(G.coinAcc);
        if (n > 0) { G.coins += n; G.coinAcc -= n; }
      }

      // 医务兵：全队回血（医生不自奶，否则会互相回成打不死的铁王八）
      if (G.aux.medic > 0) {
        const heal = (KINDS[IDX.medic].heal || 0) * G.aux.medic * dt;
        const seen = new Set();
        for (const u of G.slots) {
          if (!u || seen.has(u)) continue;
          seen.add(u);
          if (KINDS[u.kind].id === 'medic') continue;
          if (u.hp >= u.maxHp) continue;
          u.hp = Math.min(u.maxHp, u.hp + u.maxHp * heal);
        }
      }
    }

    if (G.phase === 'battle') {
      G.battleT += dt;
      updateSpawn(dt);
      updateEnemies(dt);
      // 漏一个怪就直接结束：不再继续开火 / 结算这一波
      if (G.phase === 'battle') {
        updateUnits(dt);
        updateBullets(dt);
        if (G.spawnLeft <= 0 && !G.enemies.some((e) => !e.dead)) {
          G.battleT = 0;
          settleWave();
        } else if (G.battleT > 90) {
          // 兜底：一波超过 90 秒一定是有东西卡住了（弹道打空 / 医护回血打不死 / 单位全灭）
          G.battleT = 0;
          G.enemies.length = 0;
          G.spawnLeft = 0;
          toast('清场超时，直接结算');
          settleWave();
        }
      }
    }

    updateBits(dt);
    updateFloats(dt);
    updateRings(dt);
    // 合成闪白的局部计时
    for (const u of G.slots) if (u && u.fxT > 0) u.fxT -= dt;
    for (const u of G.bench) if (u && u.fxT > 0) u.fxT -= dt;
  }

  function updateRings(dt) {
    for (const r of G.rings) {
      r.life -= dt;
      r.r += dt * 160;
    }
    G.rings = G.rings.filter((r) => r.life > 0);
  }

  // 场上辅助英雄数量（医务兵 / 工程师 / 战争顾问 / 鼓号手）
  function countAux() {
    const c = { medic: 0, engineer: 0, advisor: 0, drum: 0 };
    const seen = new Set();
    for (const u of G.slots) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      const id = KINDS[u.kind].id;
      if (c[id] !== undefined) c[id]++;
    }
    G.aux = c;
  }

  function updateSpawn(dt) {
    if (G.spawnLeft <= 0) return;
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      // 本波最后一只 = BOSS（BOSS 压轴）
      const boss = G.bossKind && G.spawnLeft === 1 ? G.bossKind : null;
      spawnEnemy(boss);
      if (boss) G.bossKind = null;
      G.spawnTimer = G.spawnInterval;
    }
  }

  function updateEnemies(dt) {
    const units = activeUnits();
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.t += dt * 6;
      if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - dt);

      // 面前有单位：停下来打它（原版的僵尸围人）
      const blocker = blockingUnit(e, units);
      if (blocker) {
        e.atkTarget = blocker;
        e.atkCd -= dt;
        if (e.atkCd <= 0) {
          e.atkCd = TUNE.enemyAtkCd;
          damageUnit(blocker, e.atk);
        }
        continue;
      }
      e.atkTarget = null;

      e.x -= e.speed * dt;                 // 从右往左压
      if (e.x <= BASE_X + 10) {
        // 漏一个怪就输：没有基地血条，这条底线就是「家」，破了当场结束
        e.dead = true;
        G.baseHit = 0.6;                   // 基地线局部红脉冲，不抖屏不闪屏
        SFX.hurt();
        for (let n = 0; n < 10; n++) {
          const a = rand(0, Math.PI * 2);
          G.bits.push({
            x: BASE_X, y: e.y, vx: Math.cos(a) * rand(60, 220), vy: Math.sin(a) * rand(60, 220),
            life: 0.5, max: 0.5, color: '#ff6a55', size: rand(2, 5),
          });
        }
        lose();
        return;
      }
    }
    G.enemies = G.enemies.filter((e) => !e.dead);
  }

  function damageUnit(u, dmg) {
    const armor = Math.min(0.3, 0.06 * (G.aux ? G.aux.engineer : 0));   // 工程师光环
    dmg *= (1 - armor);
    u.hp -= dmg;
    const c = unitCenter(u);
    addFloat(c.x + rand(-10, 10), c.y - u.h * CELL * 0.18, `-${Math.round(dmg)}`, '#ff9a8a', 20);
    G.bits.push({
      x: c.x, y: c.y, vx: rand(-50, 50), vy: rand(-70, -10),
      life: 0.3, max: 0.3, color: '#ff6a55', size: rand(2, 4),
    });
    SFX.unitHit();
    if (u.hp <= 0) killUnit(u);
  }

  function killUnit(u) {
    const c = unitCenter(u);
    vacate(u);
    G.stats.deaths++;
    SFX.unitDown();
    for (let n = 0; n < 14; n++) {
      const a = rand(0, Math.PI * 2);
      G.bits.push({
        x: c.x, y: c.y, vx: Math.cos(a) * rand(60, 240), vy: Math.sin(a) * rand(60, 240),
        life: rand(0.3, 0.6), max: 0.6, color: n % 2 ? KINDS[u.kind].color : '#9fb4c8', size: rand(2, 5),
      });
    }
    addFloat(c.x, c.y - 30, '阵亡', '#ffb0a0', 24);
    G.toast = `${KINDS[u.kind].name} 阵亡`;
    G.toastT = 1.1;
  }

  function updateUnits(dt) {
    const seen = new Set();
    for (let i = 0; i < G.slots.length; i++) {
      const u = G.slots[i];
      if (!u || seen.has(u)) continue;      // 大单位占多格，只处理一次
      seen.add(u);
      if (unitDmg(u) <= 0) continue;        // 辅助位不开火，靠 update 里的光环
      const c = unitCenter(u);
      const range = unitRange(u);
      u.cd -= dt;
      if (u.cd > 0) continue;

      // 射程内、最靠近基地的敌人（横屏后基地在左，x 越小越近）
      let best = null;
      let bestX = Infinity;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - c.x, e.y - c.y);
        if (d > range) continue;
        if (e.x < bestX) { bestX = e.x; best = e; }
      }
      if (!best) continue;

      u.cd = 1 / unitRate(u);
      fire(u, c, best);
    }
  }

  function fire(u, c, target) {
    const k = KINDS[u.kind];
    const dmg = unitDmg(u);
    // 星级质变：3 星多一条弹道，5 星再多一条
    let n = k.pellets || 1;
    if (k.id !== 'shot') {
      if (u.star >= 3) n += 1;
      if (u.star >= 5) n += 1;
    } else if (u.star >= 5) {
      n += 1;                          // 霰弹 5 星也 +1 弹丸，别让 5 星反而掉队
    }
    n += (G.buff[u.kind] && G.buff[u.kind].pellets) || 0;
    n += masteryOf(u.kind).pellets;         // Lv10 专精：弹道 +1
    const baseSize = k.id === 'snipe' ? 5 : 4;
    const sizeScale = Math.sqrt(u.w * u.h);
    const muzzle = CELL * 0.4 * sizeScale;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * CELL * 0.18 * sizeScale;
      // 瞄准角必须从「子弹出生点」算：旧版从单位中心算，枪口一偏移就打空
      const sx = c.x + muzzle;
      const sy = c.y + off;
      // 只有霰弹兵是真扇形散射；其他兵种的多弹道都瞄准同一个目标
      const ang = Math.atan2(target.y - sy, target.x - sx) + (k.id === 'shot' ? off * 0.01 : 0);
      const sp = k.id === 'snipe' ? 1500 : 1050;
      G.bullets.push({
        x: sx,                             // 枪口在身体右侧
        y: sy,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        dmg,
        color: k.color,
        pierce: k.pierce || 0,
        splash: k.splash || 0,
        hit: [],
        life: 1.4,
        size: (baseSize + (u.star - 1) * 0.9) * (sizeScale > 1.4 ? 1.3 : 1),
        glow: u.star >= 4,
        star: u.star,
      });
    }
    SFX.shoot(u.kind);
    G.bits.push({
      x: c.x + muzzle, y: c.y + rand(-6, 6), vx: rand(60, 140), vy: rand(-40, 40),
      life: 0.18, max: 0.18, color: k.color, size: 6,
    });
  }

  function updateBullets(dt) {
    for (const b of G.bullets) {
      if (b.life <= 0) continue;
      const ox = b.x, oy = b.y;          // 上一帧位置：扫掠判定的起点
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      for (const e of G.enemies) {
        if (e.dead || b.hit.includes(e)) continue;
        // 用「上一帧 → 这一帧」的线段判定，子弹再快也不会从小怪身上穿过去
        if (distPointSeg(e.x, e.y, ox, oy, b.x, b.y) > e.r + b.size) continue;

        e.hp -= b.dmg;
        e.hitT = 0.1;              // 受击闪白：割草的手感
        b.hit.push(e);
        // 伤害数字：命中就飘一下（总数限流，别刷屏）；3 星起金色、5 星更大
        if (G.floats.length < 48) {
          addFloat(b.x + rand(-24, 24), e.y - e.r - 6 + rand(-10, 10), String(Math.round(b.dmg)),
            b.star >= 3 ? '#ffe08a' : '#fff6d0', b.star >= 5 ? 30 : b.star >= 3 ? 24 : 20,
            rand(-110, -55));
        }
        G.bits.push({
          x: b.x, y: b.y, vx: rand(-40, 40), vy: rand(-40, 40),
          life: 0.22, max: 0.22, color: b.color, size: 3,
        });
        if (b.splash) splashDamage(e, b.dmg * 0.55, b.splash);
        if (e.hp <= 0) killEnemy(e);
        if (b.pierce > 0) b.pierce--;
        else { b.life = 0; }
        break;
      }
      // 出界放在命中判定之后：一帧飞出屏幕的子弹，路上该打中的也要打中
      if (b.life > 0 && (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40)) b.life = 0;
    }
    G.bullets = G.bullets.filter((b) => b.life > 0);
  }

  function splashDamage(src, dmg, r) {
    for (const o of G.enemies) {
      if (o === src || o.dead) continue;
      if (Math.hypot(o.x - src.x, o.y - src.y) > r) continue;
      o.hp -= dmg;
      if (G.floats.length < 48) {
        addFloat(o.x + rand(-16, 16), o.y - o.r - 4, String(Math.round(dmg)), '#ffb37a', 16, rand(-95, -50));
      }
      if (o.hp <= 0) killEnemy(o);
    }
    for (let n = 0; n < 10; n++) {
      const a = rand(0, Math.PI * 2);
      G.bits.push({
        x: src.x + Math.cos(a) * r * 0.6,
        y: src.y + Math.sin(a) * r * 0.6,
        vx: Math.cos(a) * rand(40, 160),
        vy: Math.sin(a) * rand(40, 160),
        life: 0.3, max: 0.3, color: '#ffb37a', size: rand(2, 5),
      });
    }
  }

  function killEnemy(e) {
    e.dead = true;
    G.stats.kills++;
    SFX.kill();
    // 割草：爆汁多给一点，但仍是局部粒子，不整屏闪
    for (let n = 0; n < 14; n++) {
      const a = rand(0, Math.PI * 2);
      G.bits.push({
        x: e.x, y: e.y, vx: Math.cos(a) * rand(60, 260), vy: Math.sin(a) * rand(60, 260),
        life: rand(0.25, 0.55), max: 0.55, color: n % 3 ? '#ff8a70' : '#ffd0a0', size: rand(2, 5),
      });
    }
  }

  function updateBits(dt) {
    for (const p of G.bits) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.vx *= 0.98;
    }
    G.bits = G.bits.filter((p) => p.life > 0);
  }

  function updateFloats(dt) {
    for (const f of G.floats) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.96;
    }
    G.floats = G.floats.filter((f) => f.life > 0);
  }

  /* ----------------------------------------------------------
     渲染
     ---------------------------------------------------------- */

  function render() {
    if (typeof globalThis !== 'undefined' && globalThis.__SQUAD_NO_RENDER) return;   // headless 模拟提速
    const c = ctx;
    c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);

    const sh = G.shake > 0 ? G.shake : 0;
    if (sh > 0) {
      c.translate(rand(-sh, sh) * 0.5, rand(-sh, sh) * 0.5);
    }
    // 震屏时画布会偏移，先铺一层更大的底色，别露黑边
    c.fillStyle = '#05080e';
    c.fillRect(-60, -60, W + 120, H + 120);

    drawBackground(c);
    drawGrid(c);
    drawBench(c);

    for (const e of G.enemies) drawEnemy(c, e);
    const seen = new Set();
    for (let i = 0; i < G.slots.length; i++) {
      const u = G.slots[i];
      if (!u || seen.has(u)) continue;          // 大单位占多格，只画一次
      if (G.drag && G.drag.unit === u) continue;
      seen.add(u);
      const p = unitCenter(u);
      drawUnit(c, p.x, p.y, u, 1);
    }
    for (let i = 0; i < BENCH_N; i++) {
      const u = G.bench[i];
      if (!u) continue;
      if (G.drag && G.drag.from === 'bench' && G.drag.i === i) continue;
      const p = benchCenter(i);
      drawUnit(c, p.x, p.y, u, benchUnitScale(u), false);   // 和战场同一套画法（框 + 角标 + 枪管）
    }

    drawBullets(c);
    drawRings(c);
    drawBits(c);
    drawFloats(c);

    if (G.drag) {
      const pv = dragPreview();
      if (pv) {
        // 单位跟着吸附后的位置走，别画在手指上
        drawUnit(c, GRID.x + (pv.c0 + pv.w / 2) * CELL,
                    GRID.y + (pv.r0 + pv.h / 2) * CELL, G.drag.unit, 1.02);
      } else {
        drawUnit(c, G.drag.x, G.drag.y - 10, G.drag.unit, 1.06);
      }
    }

    drawHud(c);

    if (G.flash > 0) {
      c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      c.fillStyle = `rgba(${G.flashColor},${G.flash * 0.55})`;
      c.fillRect(0, 0, W, H);
    }

    if (G.panel) drawPanel(c);
    else if (G.phase === 'choose') drawChoose(c);

    if (G.phase === 'over' || G.phase === 'win') drawEnd(c);
  }

  function drawBackground(c) {
    // 整屏底色
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1220');
    g.addColorStop(0.55, '#0d1626');
    g.addColorStop(1, '#080c14');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    /* ---- 上 2/3：战场。以后贴背景图只换这一块（0..SPLIT_Y） ---- */
    const battle = c.createLinearGradient(0, 0, 0, SPLIT_Y);
    battle.addColorStop(0, '#0c1a2e');
    battle.addColorStop(0.55, '#102034');
    battle.addColorStop(1, '#0b1726');
    c.fillStyle = battle;
    c.fillRect(0, 0, W, SPLIT_Y);

    // 街道：一整条横向路面（战场中段），格子区就压在路上；上下是背景景深
    const roadTop = GRID.y - 90;
    const roadBot = GRID.bottom + 90;
    const road = c.createLinearGradient(0, roadTop, 0, roadBot);
    road.addColorStop(0, 'rgba(120,160,220,0.02)');
    road.addColorStop(0.5, 'rgba(120,160,220,0.075)');
    road.addColorStop(1, 'rgba(120,160,220,0.02)');
    c.fillStyle = road;
    c.fillRect(0, roadTop, W, roadBot - roadTop);

    // 路缘：上下两条淡线，给街道一个边界
    c.strokeStyle = 'rgba(130,170,230,0.12)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, roadTop);
    c.lineTo(W, roadTop);
    c.stroke();
    c.beginPath();
    c.moveTo(0, roadBot);
    c.lineTo(W, roadBot);
    c.stroke();

    // 车道线：只画在格子区右边（敌人走的街面），给纵深
    const roadX = GRID.x + GRID.w;
    c.strokeStyle = 'rgba(120,160,220,0.08)';
    c.lineWidth = 2;
    c.setLineDash([26, 26]);
    for (let y = roadTop + CELL; y < roadBot; y += CELL) {
      c.beginPath();
      c.moveTo(roadX + 12, y);
      c.lineTo(W - 10, y);
      c.stroke();
    }
    c.setLineDash([]);

    // 棋盘地面：格子紧挨着画，不留缝
    c.fillStyle = 'rgba(18,28,44,0.55)';
    c.fillRect(GRID.x - 8, GRID.y - 8, GRID.w + 16, GRID.h + 16);

    // 左侧基地线：漏怪就输，这条线就是「家」的边界
    const base = c.createLinearGradient(BASE_X - 26, 0, BASE_X + 12, 0);
    base.addColorStop(0, 'rgba(120,200,255,0)');
    base.addColorStop(0.55, 'rgba(120,200,255,0.32)');
    base.addColorStop(1, 'rgba(120,200,255,0.05)');
    c.fillStyle = base;
    c.fillRect(BASE_X - 26, GRID.y - 18, 38, GRID.h + 36);

    // 漏怪：基地线自己红一下（局部反馈，不整屏闪）
    if (G.baseHit > 0) {
      const a = Math.min(1, G.baseHit / 0.4);
      c.fillStyle = `rgba(255,80,60,${0.4 * a})`;
      c.fillRect(BASE_X - 26, GRID.y - 18, 38, GRID.h + 36);
    }

    // 战场底部暗角，和下半区拉开层次
    const fade = c.createLinearGradient(0, SPLIT_Y - 120, 0, SPLIT_Y);
    fade.addColorStop(0, 'rgba(4,8,14,0)');
    fade.addColorStop(1, 'rgba(4,8,14,0.55)');
    c.fillStyle = fade;
    c.fillRect(0, SPLIT_Y - 120, W, 120);

    /* ---- 下 1/3：准备区（刷新区 / 按钮 / 金币） ---- */
    const panel = c.createLinearGradient(0, SPLIT_Y, 0, H);
    panel.addColorStop(0, '#111c2e');
    panel.addColorStop(1, '#0a121e');
    c.fillStyle = panel;
    c.fillRect(0, SPLIT_Y, W, H - SPLIT_Y);

    // 2/3 分界：一条亮线，背景图和准备区从此分开
    c.fillStyle = 'rgba(120,180,255,0.35)';
    c.fillRect(0, SPLIT_Y - 1, W, 2);
    c.fillStyle = 'rgba(120,180,255,0.10)';
    c.fillRect(0, SPLIT_Y + 2, W, 10);
  }

  /* 拖大单位时手指很难正好压在允许的锚点上：
     当前锚点放不下，就在附近 2 格内找最近能放的位置，省得一直吃红框 */
  function findNearestPlacement(cell, w, h, except, maxD) {
    if (canPlace(cell, w, h, except)) return cell;
    const c0 = cell % GRID.cols;
    const r0 = Math.floor(cell / GRID.cols);
    let best = -1;
    let bestD = 1e9;
    for (let r = 0; r <= GRID.rows - h; r++) {
      for (let c = 0; c <= GRID.cols - w; c++) {
        const idx = r * GRID.cols + c;
        if (!canPlace(idx, w, h, except)) continue;
        const d = Math.abs(c - c0) + Math.abs(r - r0);
        if (d < bestD) { bestD = d; best = idx; }
      }
    }
    return bestD <= maxD ? best : -1;
  }

  function dragPreview() {
    const d = G.drag;
    if (!d) return null;
    const u = d.unit;
    const c = Math.floor((d.x - GRID.x) / CELL);
    const r = Math.floor((d.y - GRID.y) / CELL);
    if (c < 0 || c >= GRID.cols || r < 0 || r >= GRID.rows) return null;   // 手指不在格子阵里
    let c0 = c - Math.floor((u.w - 1) / 2);
    let r0 = r - Math.floor((u.h - 1) / 2);
    c0 = clamp(c0, 0, GRID.cols - u.w);
    r0 = clamp(r0, 0, GRID.rows - u.h);

    let cell = r0 * GRID.cols + c0;
    const tgt = G.slots[cell];
    const merge = !!(tgt && tgt !== u && tgt.kind === u.kind && tgt.star === u.star && tgt.star < maxStarOf(tgt.kind));
    let ok = merge || canPlace(cell, u.w, u.h, u);

    if (!ok) {
      const near = findNearestPlacement(cell, u.w, u.h, u, 2);
      if (near >= 0) {
        cell = near;
        c0 = cell % GRID.cols;
        r0 = Math.floor(cell / GRID.cols);
        ok = true;
      }
    }
    return { c0, r0, w: u.w, h: u.h, cell, merge, ok };
  }

  function drawGrid(c) {
    // 整块底板：格子紧挨着画，中间不留缝（省空间，单位也显得更大）
    rr(c, GRID.x - 3, GRID.y - 3, GRID.w + 6, GRID.h + 6, 16);
    c.fillStyle = 'rgba(112,160,230,0.045)';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(110,150,210,0.22)';
    c.stroke();

    for (let i = 0; i < G.slots.length; i++) {
      const col = i % GRID.cols;
      const row = Math.floor(i / GRID.cols);
      const x = GRID.x + col * CELL;
      const y = GRID.y + row * CELL;

      if (G.slots[i]) continue;      // 有单位的格子：底让给单位自己的稀有度框

      // 空格：棋盘格一样深浅交替，靠色差分格，不靠留缝
      c.fillStyle = (col + row) % 2 ? 'rgba(110,160,230,0.075)' : 'rgba(110,160,230,0.04)';
      c.fillRect(x, y, CELL, CELL);
    }

    // 分格线：细线压在格子上，不留空隙
    c.strokeStyle = 'rgba(110,150,210,0.10)';
    c.lineWidth = 1;
    for (let col = 1; col < GRID.cols; col++) {
      c.beginPath();
      c.moveTo(GRID.x + col * CELL, GRID.y);
      c.lineTo(GRID.x + col * CELL, GRID.y + GRID.h);
      c.stroke();
    }
    for (let row = 1; row < GRID.rows; row++) {
      c.beginPath();
      c.moveTo(GRID.x, GRID.y + row * CELL);
      c.lineTo(GRID.x + GRID.w, GRID.y + row * CELL);
      c.stroke();
    }

    // 拖拽高亮：整个 w×h 区域，绿=能放 / 金=能合 / 红=放不下
    const pv = dragPreview();
    if (pv) {
      rr(c, GRID.x + pv.c0 * CELL + 2, GRID.y + pv.r0 * CELL + 2,
         pv.w * CELL - 4, pv.h * CELL - 4, 16);
      c.lineWidth = 3;
      c.strokeStyle = pv.merge ? 'rgba(255,214,102,0.95)'
        : pv.ok ? 'rgba(120,230,160,0.8)' : 'rgba(255,110,90,0.8)';
      c.stroke();
      c.fillStyle = pv.merge ? 'rgba(255,214,102,0.12)'
        : pv.ok ? 'rgba(120,230,160,0.06)' : 'rgba(255,110,90,0.06)';
      c.fill();
    }
  }

  /* 待命区不是卡片，是 3 个「待命位」：
     底板只画一层很淡的格子（和战场同一种语言），单位由 render 用**和战场完全相同的
     drawUnit** 画进去（稀有度框 + 角标 + 枪管）。一眼就知道是什么兵种，不再用卡片包装。 */
  function drawBench(c) {
    const rects = benchRects();

    // 交战中：待命位换一条状态带
    if (G.phase === 'battle') {
      const y = BENCH.y, h = BENCH.cardH;
      rr(c, BENCH.x0, y, BENCH.w, h, 20);
      c.fillStyle = 'rgba(14,20,32,0.72)';
      c.fill();
      c.setLineDash([8, 8]);
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(110,150,210,0.16)';
      rr(c, BENCH.x0 + 1, y + 1, BENCH.w - 2, h - 2, 19);
      c.stroke();
      c.setLineDash([]);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 34px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      c.fillStyle = 'rgba(200,220,255,0.85)';
      c.fillText('交战中', BENCH.x0 + BENCH.w / 2, y + 70);
      c.font = '800 21px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = 'rgba(255,170,130,0.9)';
      c.fillText(`第 ${G.wave} 波 · 场上 ${G.enemies.length} 个敌人`, BENCH.x0 + BENCH.w / 2, y + 112);
      c.font = '600 17px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = 'rgba(160,185,225,0.55)';
      c.fillText('漏一个怪就输 · 清完这一波自动回准备', BENCH.x0 + BENCH.w / 2, y + 152);
      return;
    }

    let hot = -1;
    if (G.drag) {
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (G.drag.x >= r.x && G.drag.x <= r.x + r.w && G.drag.y >= r.y && G.drag.y <= r.y + r.h) { hot = i; break; }
      }
    }

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      // 点按选中待命位：金色高亮，不然玩家看不出「已经选上了」
      const picked = !!(G.pick && G.pick.unit && G.pick.unit === G.bench[i]);

      // 待命位底板：很淡的棋盘格 + 细虚线，只表示「可以站人」，不抢单位
      rr(c, r.x, r.y, r.w, r.h, 16);
      c.fillStyle = picked ? 'rgba(255,230,140,0.08)' : 'rgba(110,160,230,0.04)';
      c.fill();
      c.setLineDash([6, 8]);
      c.lineWidth = picked ? 2.5 : 1.5;
      c.strokeStyle = picked ? 'rgba(255,230,140,0.95)'
        : hot === i ? 'rgba(120,230,160,0.85)' : 'rgba(110,150,210,0.16)';
      rr(c, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 15);
      c.stroke();
      c.setLineDash([]);

      if (!G.bench[i]) {
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.font = '600 15px "PingFang SC",system-ui,sans-serif';
        c.fillStyle = 'rgba(140,165,205,0.28)';
        c.fillText('空位', r.x + r.w / 2, r.y + r.h / 2);
      }
    }
  }

  // 稀有度徽章：C / B / A / S / SS，颜色跟着稀有度走
  function drawRarityBadge(c, cx, cy, star, sc) {
    const rar = rarityOf(star);
    const w = (rar.tier.length > 1 ? 40 : 26) * sc;
    const h = 22 * sc;
    rr(c, cx - w / 2, cy - h / 2, w, h, h / 2);
    c.fillStyle = rar.color;
    c.fill();
    c.lineWidth = 1.2;
    c.strokeStyle = 'rgba(8,12,20,0.55)';
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${13 * sc}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`;
    c.fillStyle = '#141b26';
    c.fillText(rar.tier, cx, cy + 0.5);
  }

  // bare = 卡片里的裸单位图：不画编队框、不画角标（卡头已经有稀有度标记）
  function drawUnit(c, x, y, u, sc, bare) {
    const k = KINDS[u.kind];
    const star = u.star;
    const rar = rarityOf(star);
    const sizeScale = Math.sqrt((u.w || 1) * (u.h || 1));
    // 单位本体按格子比例长：1×1 约占格子的 70%，大单位随占格放大（原版也是本体略大于格子）
    const body = CELL * 0.34 * sizeScale * sc * (1 + (star - 1) * 0.04);
    const bob = Math.sin(G.time * 3 + x * 0.01) * 1.6;

    // 编队框：按占格画矩形（1×1 方、1×2 竖长、2×2 大方），不是一律正方形
    const fw = (u.w || 1) * CELL * 0.95 * sc;
    const fh = (u.h || 1) * CELL * 0.95 * sc;
    const bx = x - fw / 2;
    const by = y - fh / 2 + bob;

    if (!bare) {
      // 先压一圈深色外描边，再上稀有度亮描边：框和同色身体不会糊在一起
      c.save();
      if (rar.glow) { c.shadowColor = rar.color; c.shadowBlur = rar.glow * sc; }
      rr(c, bx, by, fw, fh, Math.min(fw, fh) * 0.2);
      c.fillStyle = rar.fill;
      c.fill();
      c.lineWidth = rar.w * sc + 2;
      c.strokeStyle = rar.edge;
      c.stroke();
      c.lineWidth = rar.w * sc;
      c.strokeStyle = rar.color;
      c.stroke();
      c.restore();
    }

    // 影子
    c.fillStyle = 'rgba(0,0,0,0.34)';
    c.beginPath();
    c.ellipse(x, y + body * 0.95, body * 0.9, body * 0.28, 0, 0, Math.PI * 2);
    c.fill();

    // 脚下光环：S 起金色，SS 红色更强
    if (star >= 4) {
      c.save();
      c.translate(x, y + body * 0.95);
      c.rotate(G.time * 0.9);
      c.strokeStyle = star >= 5 ? 'rgba(255,110,110,0.58)' : 'rgba(255,214,102,0.46)';
      c.lineWidth = 2.5;
      c.setLineDash([6, 5]);
      c.beginPath();
      c.ellipse(0, 0, body * 1.06, body * 0.33, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }

    // 星级光晕：3 星紫 / 4 星金 / 5 星红
    if (star >= 3) {
      const g = c.createRadialGradient(x, y + bob, body * 0.4, x, y + bob, body * 2.1);
      g.addColorStop(0, star >= 5 ? 'rgba(255,100,100,0.42)'
        : star >= 4 ? 'rgba(255,210,100,0.34)' : 'rgba(170,135,255,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y + bob, body * 2.1, 0, Math.PI * 2);
      c.fill();
    }

    // 枪管（朝右，面对敌人）
    c.save();
    c.translate(x, y + bob);
    c.fillStyle = k.deep;
    rr(c, body * 0.52, -body * 0.26, body * 1.02, body * 0.30, 4);
    c.fill();
    c.fillStyle = k.color;
    rr(c, body * 1.34, -body * 0.23, body * 0.22, body * 0.25, 3);
    c.fill();
    c.restore();

    // 身体
    const g2 = c.createLinearGradient(x, y - body + bob, x, y + body + bob);
    g2.addColorStop(0, k.color);
    g2.addColorStop(1, k.deep);
    c.fillStyle = g2;
    c.beginPath();
    c.arc(x, y + bob, body, 0, Math.PI * 2);
    c.fill();

    c.lineWidth = 2.5;
    c.strokeStyle = 'rgba(8,14,24,0.65)';
    c.stroke();

    // 眼睛
    const ex = body * 0.34;
    const ey = -body * 0.12;
    c.fillStyle = '#f7fbff';
    c.beginPath(); c.arc(x - ex, y + ey + bob, body * 0.26, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + ex, y + ey + bob, body * 0.26, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#11161f';
    c.beginPath(); c.arc(x - ex + body * 0.05, y + ey + bob + body * 0.04, body * 0.12, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + ex + body * 0.05, y + ey + bob + body * 0.04, body * 0.12, 0, Math.PI * 2); c.fill();

    // 稀有度角标（C/B/A/S/SS）：压在编队框左上角（卡片里不画，避免和卡头重复）
    if (!bare) drawRarityBadge(c, bx + 11 * sc, by + 9 * sc, star, sc * 0.8);

    // 刚合成：本体闪白（局部反馈，不整屏闪）
    if (u.fxT > 0) {
      const a = Math.min(1, u.fxT / 0.45);
      c.save();
      c.globalAlpha = 0.5 * a;
      c.fillStyle = '#fff6d0';
      c.beginPath();
      c.arc(x, y + bob, body * (1 + (1 - a) * 0.45), 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    // 血条：受了伤才显示，头顶一根短的
    if (u.hp < u.maxHp) {
      const pct = clamp(u.hp / u.maxHp, 0, 1);
      const bw2 = body * 1.9;
      const hx = x - bw2 / 2;
      const hy = by - 8 * sc;
      c.fillStyle = 'rgba(0,0,0,0.55)';
      rr(c, hx, hy, bw2, 6 * sc, 3 * sc);
      c.fill();
      c.fillStyle = pct > 0.55 ? '#7ef0a8' : pct > 0.28 ? '#ffd15c' : '#ff6a55';
      rr(c, hx, hy, Math.max(0, bw2 * pct), 6 * sc, 3 * sc);
      c.fill();
    }
  }

  function drawEnemy(c, e) {
    const r = e.r;
    const boss = e.boss ? BOSS[e.boss] : null;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(e.x, e.y + r * 0.9, r * 0.85, r * 0.26, 0, 0, Math.PI * 2);
    c.fill();

    // 正在啃人：朝目标压一下，加两道抓痕
    const biting = !!e.atkTarget;
    const lunge = biting ? Math.max(0, Math.sin(e.t * 3)) * 4 : 0;
    const wy = e.y + lunge;

    const wob = Math.sin(e.t) * 2;

    // BOSS：外圈光环 + 头顶两只角（一眼看出不是小兵）
    if (boss) {
      c.save();
      c.shadowColor = boss.color;
      c.shadowBlur = r * 0.7;
      c.strokeStyle = boss.color;
      c.globalAlpha = 0.5;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(e.x + wob, wy, r + 7, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      c.globalAlpha = 1;
      c.fillStyle = boss.color;
      for (let s = -1; s <= 1; s += 2) {
        c.beginPath();
        c.moveTo(e.x + s * r * 0.45 + wob, wy - r * 0.92);
        c.lineTo(e.x + s * r * 0.78 + wob, wy - r * 1.52);
        c.lineTo(e.x + s * r * 0.18 + wob, wy - r * 1.02);
        c.closePath();
        c.fill();
      }
    }

    const g = c.createLinearGradient(e.x, wy - r, e.x, wy + r);
    g.addColorStop(0, biting ? '#ff9a72' : (boss ? boss.color : '#ff7a62'));
    g.addColorStop(1, boss ? boss.deep : '#a92f28');
    c.fillStyle = g;
    c.beginPath();
    c.arc(e.x + wob, wy, r, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = 'rgba(20,8,8,0.6)';
    c.stroke();

    // 受击闪白：一枪没打死也要有「打中了」的反馈
    if (e.hitT > 0) {
      c.globalAlpha = Math.min(1, e.hitT / 0.1) * 0.6;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(e.x + wob, wy, r, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }

    if (biting) {
      c.strokeStyle = 'rgba(255,190,120,0.75)';
      c.lineWidth = 3;
      for (let k = -1; k <= 1; k += 2) {
        c.beginPath();
        c.arc(e.x + k * r * 0.55, wy + r * 0.75, r * 0.42, 0.25 * Math.PI, 0.75 * Math.PI);
        c.stroke();
      }
    }

    c.fillStyle = '#fff2ea';
    c.beginPath(); c.arc(e.x - r * 0.32 + wob, wy - r * 0.12, r * 0.22, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(e.x + r * 0.32 + wob, wy - r * 0.12, r * 0.22, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a0a08';
    c.beginPath(); c.arc(e.x - r * 0.32 + wob, wy - r * 0.1, r * 0.1, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(e.x + r * 0.32 + wob, wy - r * 0.1, r * 0.1, 0, Math.PI * 2); c.fill();

    // 血条：BOSS 更宽更粗
    if (e.hp < e.maxHp) {
      const w = r * (boss ? 2.4 : 1.9);
      const hh = boss ? 8 : 6;
      const hx = e.x - w / 2;
      const hy = boss ? e.y - r * 1.62 - hh : e.y - r - 12;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      rr(c, hx, hy, w, hh, hh / 2);
      c.fill();
      c.fillStyle = boss ? (boss.color === '#ff3b3b' ? '#ff8a6b' : '#d08cff') : '#6ee7a0';
      rr(c, hx, hy, Math.max(0, w * (e.hp / e.maxHp)), hh, hh / 2);
      c.fill();
    }
  }

  function drawBullets(c) {
    for (const b of G.bullets) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const nx = b.vx / sp;
      const ny = b.vy / sp;
      const len = sp * 0.013 * (1 + (b.star - 1) * 0.12);
      c.lineCap = 'round';

      // 外层光
      c.strokeStyle = b.color;
      c.globalAlpha = b.glow ? 0.34 : 0.16;
      c.lineWidth = b.size * (b.glow ? 3 : 2);
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(b.x - nx * len, b.y - ny * len);
      c.stroke();

      // 内层芯：4 星以上发白
      c.globalAlpha = 1;
      c.lineWidth = b.size;
      c.strokeStyle = b.glow ? '#fff3c4' : b.color;
      c.beginPath();
      c.moveTo(b.x, b.y);
      c.lineTo(b.x - nx * len, b.y - ny * len);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.lineCap = 'butt';
  }

  function drawRings(c) {
    for (const r of G.rings) {
      const a = Math.max(0, r.life / r.maxLife);
      c.globalAlpha = a * 0.85;
      c.strokeStyle = `rgba(${r.color},0.95)`;
      c.lineWidth = 1 + 3 * a;
      c.beginPath();
      c.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  function drawBits(c) {
    for (const p of G.bits) {
      const a = Math.max(0, p.life / p.max);
      c.globalAlpha = a;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function drawFloats(c) {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const f of G.floats) {
      const a = clamp(f.life / f.max, 0, 1);
      c.globalAlpha = a;
      c.font = `800 ${f.size}px "PingFang SC",system-ui,sans-serif`;
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(6,10,18,0.85)';
      c.strokeText(f.text, f.x, f.y);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;
  }

  // 金币总额：放在下半区（准备区），和刷新按钮同一条动线
  function drawCoinChip(c) {
    const r = COIN;
    rr(c, r.x, r.y, r.w, r.h, r.h / 2);
    c.fillStyle = 'rgba(20,28,44,0.9)';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(255,209,102,0.35)';
    c.stroke();

    const cx = r.x + 30, cy = r.y + r.h / 2;
    const g = c.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, 15);
    g.addColorStop(0, '#ffe9a3');
    g.addColorStop(1, '#d9a52b');
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, 14, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(120,80,10,0.5)';
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 15px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(120,80,10,0.8)';
    c.fillText('G', cx, cy + 1);

    const amount = String(Math.floor(G.coins));
    c.textAlign = 'left';
    c.font = '900 30px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = '#ffd166';
    c.fillText(amount, r.x + 54, cy + 1);
    const aw = c.measureText(amount).width;
    c.font = '600 16px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(190,210,240,0.6)';
    c.fillText('金币', r.x + 54 + aw + 10, cy + 3);

    // 右侧一行玩法提示，不抢戏
    c.textAlign = 'right';
    c.font = '600 16px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(150,175,215,0.55)';
    c.fillText(G.phase === 'battle' ? '金币：顾问 / 清波 / 三选一' : '点选后点格子/拖拽都可以',
      W - 26, COIN.y + COIN.h / 2 + 1);
  }

  function drawHud(c) {
    // 顶栏：关卡 / 波次 / 剩余（金币已经挪到下半区）
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.font = '900 30px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = '#e9f1ff';
    c.fillText(`第 ${G.stage} 关 · ${G.wave}/${TUNE.waves} 波`, 24, 38);

    c.font = '700 20px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = G.phase === 'battle' ? 'rgba(255,150,120,0.9)' : 'rgba(150,180,220,0.7)';
    c.fillText(G.phase === 'battle'
      ? `交战中 · 剩余 ${G.spawnLeft + G.enemies.length}`
      : G.phase === 'choose' ? '清场 · 选一张强化'
        : '准备 · 拖人进格', 24, 82);

    // 进度条
    const px = 24, py = 104, pw = W - 48, ph = 8;
    rr(c, px, py, pw, ph, 4);
    c.fillStyle = 'rgba(150,180,220,0.16)';
    c.fill();
    rr(c, px, py, (pw * Math.min(G.wave - 1, TUNE.waves)) / TUNE.waves, ph, 4);
    c.fillStyle = '#6ec8ff';
    c.fill();
    // BOSS 波在进度条上做标记：5/10/15 小 BOSS，20 大 BOSS
    for (const bw of BOSS.minor.waves) {
      const bx = px + (pw * (bw - 1)) / TUNE.waves;
      c.fillStyle = 'rgba(192,92,255,0.9)';
      c.beginPath();
      c.moveTo(bx - 5, py - 4);
      c.lineTo(bx + 5, py - 4);
      c.lineTo(bx, py + 1);
      c.closePath();
      c.fill();
    }
    const mbx = px + pw - 1;
    c.fillStyle = 'rgba(255,90,90,0.95)';
    c.beginPath();
    c.moveTo(mbx - 6, py - 5);
    c.lineTo(mbx + 1, py - 5);
    c.lineTo(mbx - 2, py + 2);
    c.closePath();
    c.fill();

    // 金币（下半区）
    drawCoinChip(c);

    // 按钮：刷新 / 开战。开战不写敌人数（主人：不用告诉玩家多少敌人）
    const price = refreshPrice();
    drawButton(c, BTN.refresh, '刷新', `${price} 金币`, G.phase === 'prep' && G.coins >= price);
    const canFight = G.phase === 'prep';
    drawButton(c, BTN.fight, canFight ? '开战' : '交战中', canFight ? '点一下开打' : '清完自动', canFight);

    // 倍速：×1 / ×2 / ×3（点一下循环；准备阶段只改设置，开战生效）
    rr(c, SPEED_BTN.x, SPEED_BTN.y, SPEED_BTN.w, SPEED_BTN.h, 12);
    c.fillStyle = G.speed > 1 ? 'rgba(255,170,80,0.18)' : 'rgba(20,26,38,0.72)';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = G.speed > 1 ? 'rgba(255,190,90,0.75)' : 'rgba(143,216,255,0.28)';
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 30px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = G.speed > 1 ? '#ffc46b' : 'rgba(200,220,255,0.8)';
    c.fillText(`×${G.speed}`, SPEED_BTN.x + SPEED_BTN.w / 2, SPEED_BTN.y + 34);
    c.font = '600 14px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(160,185,225,0.6)';
    c.fillText('倍速', SPEED_BTN.x + SPEED_BTN.w / 2, SPEED_BTN.y + 64);

    // 养成 / 音效：顶栏右侧
    rr(c, PANEL_BTN.x, PANEL_BTN.y, PANEL_BTN.w, PANEL_BTN.h, 12);
    c.fillStyle = 'rgba(20,26,38,0.72)';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(255,209,102,0.4)';
    c.stroke();
    c.textAlign = 'center';
    c.font = '700 22px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#ffd166';
    c.fillText('养成', PANEL_BTN.x + PANEL_BTN.w / 2, PANEL_BTN.y + PANEL_BTN.h / 2);

    rr(c, MUTE_BTN.x, MUTE_BTN.y, MUTE_BTN.w, MUTE_BTN.h, 12);
    c.fillStyle = 'rgba(20,26,38,0.72)';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = muted ? 'rgba(150,176,220,0.2)' : 'rgba(143,216,255,0.4)';
    c.stroke();
    c.textAlign = 'center';
    c.font = '700 22px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = muted ? 'rgba(160,180,210,0.55)' : '#8fd8ff';
    c.fillText(muted ? '静音' : '音效', MUTE_BTN.x + MUTE_BTN.w / 2, MUTE_BTN.y + MUTE_BTN.h / 2);

    // 选中单位：脚下高亮圈（点按合成）
    if (G.pick && G.pick.unit && G.pick.unit.cell >= 0) {
      const p = unitCenter(G.pick.unit);
      c.strokeStyle = 'rgba(255,230,140,0.95)';
      c.lineWidth = 3;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.arc(p.x, p.y, 20, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }

    // 提示条
    if (G.toastT > 0 && G.toast) {
      const a = Math.min(1, G.toastT / 0.4);
      c.globalAlpha = a;
      c.textAlign = 'center';
      c.font = '800 24px "PingFang SC",system-ui,sans-serif';
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(6,10,18,0.85)';
      c.strokeText(G.toast, W / 2, SPLIT_Y - 56);
      c.fillStyle = '#dbe8ff';
      c.fillText(G.toast, W / 2, SPLIT_Y - 56);
      c.globalAlpha = 1;
    }
  }

  function drawButton(c, r, label, sub, enabled) {
    rr(c, r.x, r.y, r.w, r.h, 22);
    if (enabled) {
      const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, 'rgba(90,190,120,0.95)');
      g.addColorStop(1, 'rgba(46,140,86,0.95)');
      c.fillStyle = g;
    } else {
      c.fillStyle = 'rgba(60,75,100,0.5)';
    }
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = enabled ? 'rgba(160,255,190,0.55)' : 'rgba(120,150,190,0.25)';
    c.stroke();

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 40px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = enabled ? '#ffffff' : 'rgba(200,215,240,0.5)';
    c.fillText(label, r.x + r.w / 2, r.y + r.h * 0.4);

    c.font = '700 18px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = enabled ? 'rgba(230,255,240,0.8)' : 'rgba(180,200,230,0.4)';
    c.fillText(sub, r.x + r.w / 2, r.y + r.h * 0.78);
  }

  function choiceRects() {
    const w = 200, h = 280, gap = 18;
    const total = 3 * w + 2 * gap;
    const x0 = (W - total) / 2;
    const y = 500;
    return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
  }

  function drawChoose(c) {
    c.fillStyle = 'rgba(4,8,14,0.84)';
    c.fillRect(0, 0, W, H);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 44px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#ffe08a';
    c.fillText('选择强化', W / 2, 410);
    c.font = '600 22px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(190,210,240,0.75)';
    c.fillText(`第 ${G.wave - 1} 波清除 · 三选一`, W / 2, 462);

    const rects = choiceRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const u = G.choices[i];
      if (!u) continue;
      const tint = u.kind === undefined ? '#ffd166' : KINDS[u.kind].color;

      rr(c, r.x, r.y, r.w, r.h, 18);
      c.fillStyle = 'rgba(22,32,50,0.96)';
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = tint;
      c.stroke();

      rr(c, r.x + 14, r.y + 14, r.w - 28, 6, 3);
      c.fillStyle = tint;
      c.fill();

      c.textAlign = 'center';
      c.font = '900 26px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = tint;
      c.fillText(u.label, r.x + r.w / 2, r.y + 84);

      c.font = '800 22px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = '#e8f0ff';
      c.fillText(u.text, r.x + r.w / 2, r.y + 158);

      c.font = '600 15px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = 'rgba(160,190,230,0.55)';
      c.fillText('点一下', r.x + r.w / 2, r.y + r.h - 26);
    }
  }

  /* ----------------------------------------------------------
     养成面板：花局内金币升兵种等级
     ---------------------------------------------------------- */

  function panelRows() {
    // 全宽单列：10 个兵种一人一行，名字 / 等级 / 攻击 / 特性 / 专精 / 升级按钮都放得下
    const w = W - 80, h = 108, gap = 8, x0 = 40, y0 = 132;
    return KINDS.map((_, i) => ({
      x: x0,
      y: y0 + i * (h + gap),
      w, h,
    }));
  }

  function upBtnRect(row) {
    return { x: row.x + row.w - 132, y: row.y + 16, w: 116, h: 76 };
  }

  // 兵种特性（面板里显示，不占战斗 UI）
  function kindTrait(k) {
    if (k.pellets > 1) return `散射×${k.pellets}`;
    if (k.pierce) return `穿透×${k.pierce}`;
    if (k.splash) return `溅射 ${k.splash}`;
    if (k.heal) return '回血光环';
    if (k.armor) return '减伤光环';
    if (k.coin) return '产金币';
    if (k.haste) return '攻速光环';
    return '单发';
  }

  function drawPanel(c) {
    c.fillStyle = 'rgba(5,9,16,0.995)';
    c.fillRect(0, 0, W, H);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 46px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = '#ffe08a';
    c.fillText('养成', W / 2, 50);

    c.font = '600 18px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = 'rgba(190,210,240,0.8)';
    c.fillText('等级 = 合成上限（Lv.3 只能合 3 星）· 每升 1 级基础攻击 +12%', W / 2, 86);
    c.fillStyle = 'rgba(150,180,220,0.7)';
    c.font = '600 16px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillText('专精：Lv5 攻速 +10% · Lv7 射程 +10% · Lv9 伤害 +20% · Lv10 弹道 +1', W / 2, 112);

    c.textAlign = 'right';
    c.font = '800 20px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#ffd166';
    c.fillText(`金币 ${Math.floor(G.coins)}`, W - 40, 50);

    const rows = panelRows();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const k = KINDS[i];
      const locked = k.unlock > G.stage;
      const m = masteryOf(i);

      rr(c, r.x, r.y, r.w, r.h, 14);
      c.fillStyle = locked ? 'rgba(16,22,34,0.92)' : 'rgba(22,32,50,0.94)';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = locked ? 'rgba(90,110,140,0.35)' : k.color;
      c.stroke();

      // 兵种色块
      c.fillStyle = locked ? 'rgba(90,110,140,0.4)' : k.color;
      c.beginPath();
      c.arc(r.x + 24, r.y + 30, 11, 0, Math.PI * 2);
      c.fill();

      // 第一行：名字 / 等级 / 可合星数
      c.textAlign = 'left';
      c.font = '800 22px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      c.fillStyle = locked ? 'rgba(150,170,200,0.55)' : '#eef4ff';
      c.fillText(locked ? '？？？' : k.name, r.x + 44, r.y + 28);

      if (locked) {
        c.font = '600 15px "PingFang SC",system-ui,sans-serif';
        c.fillStyle = 'rgba(160,185,220,0.7)';
        c.fillText(`第 ${k.unlock} 关解锁`, r.x + 150, r.y + 28);
      } else {
        c.font = '800 17px "PingFang SC",system-ui,sans-serif';
        c.fillStyle = k.color;
        c.fillText(`Lv.${LV[i]}`, r.x + 150, r.y + 28);
        c.font = '600 15px "PingFang SC",system-ui,sans-serif';
        c.fillStyle = 'rgba(170,195,230,0.8)';
        c.fillText(`可合 ${maxStarOf(i)} 星`, r.x + 210, r.y + 28);
      }

      // 第二行：当前攻击力 / 特性
      if (!locked) {
        const atk = k.dmg > 0 ? (k.dmg * lvMul(i) * m.dmg).toFixed(1) : '—';
        c.font = '800 18px "PingFang SC",system-ui,sans-serif';
        c.fillStyle = '#ffd166';
        c.fillText(k.dmg > 0 ? `攻击 ${atk}` : '辅助位', r.x + 44, r.y + 58);
        c.font = '600 15px "PingFang SC",system-ui,sans-serif';
        c.fillStyle = 'rgba(170,195,230,0.8)';
        c.fillText(`特性：${kindTrait(k)}`, r.x + 150, r.y + 58);
      }

      // 第三行：已解锁专精 + 下一个专精（锁定兵种不显示）
      if (!locked) {
        const got = [];
        if (m.rate > 1) got.push('攻速 +10%');
        if (m.range > 1) got.push('射程 +10%');
        if (m.dmg > 1) got.push('伤害 +20%');
        if (m.pellets) got.push('弹道 +1');
        const next = MASTERY.find((x) => x.lv > LV[i]);
        c.textAlign = 'left';
        c.font = '600 14px "PingFang SC",system-ui,sans-serif';
        c.fillStyle = got.length ? 'rgba(126,232,162,0.85)' : 'rgba(150,175,215,0.55)';
        c.fillText(`专精：${got.length ? got.join(' · ') : '无'}`, r.x + 44, r.y + 88);
        c.fillStyle = next ? 'rgba(160,190,230,0.65)' : 'rgba(126,232,162,0.85)';
        c.fillText(next ? `下一专精 Lv.${next.lv} ${next.text}` : '专精全部解锁', r.x + 290, r.y + 88);
      }

      // 升级按钮
      const b = upBtnRect(r);
      const maxed = LV[i] >= 10;
      const cost = upgradeCost(i);
      const can = !locked && !maxed && G.coins >= cost;
      rr(c, b.x, b.y, b.w, b.h, 12);
      c.fillStyle = can ? 'rgba(90,190,120,0.95)' : 'rgba(60,75,100,0.55)';
      c.fill();
      c.textAlign = 'center';
      c.font = '800 19px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      c.fillStyle = can ? '#ffffff' : 'rgba(200,215,240,0.5)';
      c.fillText(locked ? '锁定' : maxed ? '满级' : `升级 ${cost}`, b.x + b.w / 2, b.y + 28);
      c.font = '600 13px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = can ? 'rgba(230,255,240,0.75)' : 'rgba(180,200,230,0.4)';
      c.fillText(locked ? `第 ${k.unlock} 关` : maxed ? 'Lv.10 满级' : `Lv.${LV[i] + 1} 可合 ${Math.min(MAX_STAR, LV[i] + 1)} 星`,
        b.x + b.w / 2, b.y + 54);
    }

    c.textAlign = 'center';
    c.font = '600 18px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(160,190,230,0.55)';
    c.fillText('点空白处关闭', W / 2, H - 30);
  }

  function drawEnd(c) {
    c.fillStyle = 'rgba(4,8,14,0.84)';
    c.fillRect(0, 0, W, H);

    const win = G.phase === 'win';
    const last = win && G.stage >= TUNE.stages;
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    c.font = '900 84px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = win ? '#ffd166' : '#ff6a55';
    c.fillText(win ? (last ? '主线通关' : '守住了') : '失守', W / 2, 560);

    c.font = '600 26px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#dbe8ff';
    c.fillText(
      win
        ? (last ? `第 ${G.stage} 关 · ${TUNE.waves} 波全部清完` : `第 ${G.stage} 关守住 · ${TUNE.waves} 波`)
        : `第 ${G.stage} 关 · 第 ${G.wave} 波有敌人漏过去了`,
      W / 2, 640);

    c.font = '600 20px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(170,195,230,0.85)';
    c.fillText(`击杀 ${G.stats.kills}　合成 ${G.stats.merges} 次　最高 ${RARITY[clamp(G.stats.best, 1, 5) - 1].tier}`, W / 2, 700);

    c.font = '700 24px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(200,215,240,0.6)';
    c.fillText(
      win ? (last ? '点一下重打最后一关' : `点一下进入第 ${G.stage + 1} 关`) : '点一下重打本关',
      W / 2, 800);
  }

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

    // 倍速：每帧多跑几步固定步长，物理/弹道不会因为 dt 变大而穿透。
    // 只在战斗阶段生效；准备阶段永远 1 步（时间冻结）。
    const steps = G.phase === 'battle' ? (G.speed || 1) : 1;
    for (let i = 0; i < steps; i++) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    measure();
  }

  /* ----------------------------------------------------------
     事件
     ---------------------------------------------------------- */

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);
  } else {
    const touchOf = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
    canvas.addEventListener('touchstart', (e) => {
      const t = touchOf(e);
      if (!t) return;
      onDown({ pointerId: 1, pointerType: 'touch', clientX: t.clientX, clientY: t.clientY, button: 0, preventDefault() {} });
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      const t = touchOf(e);
      if (!t) return;
      onMove({ pointerId: 1, clientX: t.clientX, clientY: t.clientY, cancelable: true, preventDefault() {} });
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      const t = touchOf(e);
      if (!t) return;
      onUp({ pointerId: 1, clientX: t.clientX, clientY: t.clientY, preventDefault() {} });
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchcancel', () => { G.drag = null; dragId = null; });
  }

  window.addEventListener('resize', resize);

  /* ----------------------------------------------------------
     启动
     ---------------------------------------------------------- */

  resize();
  seedBench();
  toast('把队员拖进格子，两个一样的合成');
  requestAnimationFrame(frame);

  // 测试/调试用
  window.__squad = G;
  window.__squadApi = {
    startBattle, refresh, restart, spawnEnemy, nextStage, settleWave,
    slotIndexAt, benchIndexAt, slotCenter, benchCenter, unitCenter,
    dropToSlot, dropToBench, canPlace, occupy, vacate, fitsAnywhere,
    applyUpgrade, choiceRects, rollUpgrades,
    maxStarOf, upgradeCost, saveLV, LV, unitMaxHp, refreshUnitHp, unitRect, makeUnit,
    masteryOf, MASTERY, panelRows, upBtnRect,
    HIGHEST, saveStage,
    GRID, BENCH, BTN, SPEED_BTN, PANEL_BTN, MUTE_BTN, COIN, CELL, KINDS, TUNE, MAX_STAR, STAR: MAX_STAR,
    STAGE: { W, H }, SPAWN_X, BASE_X,
  };
})();
