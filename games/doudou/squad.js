/* ============================================================
   守护豆豆 · 小队模式（架子 v0.1）
   ------------------------------------------------------------
   准备（时间冻结）→ 拖人进格 / 两个一样的合成 → 开战 →
   清场 → 回准备。15 波，基地血 20。

   这个文件是独立的，不碰 game.js。经典玩法一行没改。
   架子阶段的取舍：
     - 数值是拍的，没有跑过模拟
     - 只有 3 种兵、1 种怪、没有局外养成
     - 但「准备 / 开战」的节奏、合成、拖放已经能跑
   ============================================================ */

(() => {
  'use strict';

  const W = 720;
  const H = 1600;

  /* ----------------------------------------------------------
     布局
     ---------------------------------------------------------- */

  // 最终 7×5=35 格，开局只开中间 3×3，清波逐格解锁
  const CELL = 96;
  const GRID = { cols: 7, rows: 5, cell: CELL };
  GRID.w = GRID.cols * CELL;
  GRID.x = (W - GRID.w) / 2;
  GRID.y = 700;
  GRID.h = GRID.rows * CELL;
  GRID.bottom = GRID.y + GRID.h;       // 敌人越过这条线扣血
  GRID.cx = 3;                          // 解锁扩散的中心
  GRID.cy = 2;
  const START_CELLS = 9;                // 开局的 3×3

  // 待命区按真实 w×h 排：每格 72，2 格高的竖排单位就真的是竖的
  const BENCH_N = 3;
  const BENCH_UNIT = 80;
  const BENCH_GAP = 14;
  const BENCH = {
    n: BENCH_N, unit: BENCH_UNIT, gap: BENCH_GAP,
    h: BENCH_UNIT * 2, y: 1220,
  };

  const BTN = {
    refresh: { x: 64, y: 1392, w: 250, h: 112 },
    fight: { x: 406, y: 1392, w: 250, h: 112 },
  };

  const SPAWN_Y = 250;
  const BASE_Y = GRID.bottom;

  /* ----------------------------------------------------------
     数值
     ---------------------------------------------------------- */

  // 每个兵种占的格子不一样：格子从「容量」变成「拼图」，布阵才有取舍
  // 每格的输出大致拉平，大单位靠射程 / 穿透 / 溅射赚回占地
  const KINDS = [
    { id: 'rifle', name: '步枪兵', color: '#5ec8f0', deep: '#1d6c92', dmg: 5, rate: 1.4, range: 520, pellets: 1, w: 1, h: 1, weight: 1 },
    { id: 'shot', name: '霰弹兵', color: '#ffb066', deep: '#a9642a', dmg: 3.2, rate: 1.7, range: 300, pellets: 3, w: 1, h: 2, weight: 0.4 },
    { id: 'snipe', name: '狙击手', color: '#c79bff', deep: '#6b4a9e', dmg: 36, rate: 0.55, range: 950, pellets: 1, pierce: 1, w: 2, h: 1, weight: 0.26 },
    { id: 'cannon', name: '重炮手', color: '#ff8f6b', deep: '#a34a2c', dmg: 95, rate: 0.38, range: 780, pellets: 1, splash: 90, w: 2, h: 2, weight: 0.11 },
  ];

  const MAX_STAR = 5;

  // 可覆盖的数值：headless 里用 --tune '{"hpGrowth":1.35}' 改，不改文件
  const TUNE = Object.assign({
    waves: 15,
    baseHp: 18,
    startCoins: 40,
    refreshCost: 10,
    countBase: 3,
    countPerWave: 1.5,
    hpBase: 12,
    hpGrowth: 1.52,
    speedBase: 52,
    speedPerWave: 3,
    spawnBase: 0.82,
    spawnDrop: 0.032,
    starGrowth: 2.2,
    coinPerSec: 1,
    waveBonusBase: 15,
    waveBonusPer: 3,
  }, (typeof globalThis !== 'undefined' && globalThis.__SQUAD_TUNE) || {});

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
     状态
     ---------------------------------------------------------- */

  const G = {
    phase: 'prep',        // prep | battle | win | over
    wave: 1,              // 当前（或即将开始的）波数，1..TUNE.waves
    coins: TUNE.startCoins,
    hp: TUNE.baseHp, hpMax: TUNE.baseHp,
    slots: new Array(GRID.cols * GRID.rows).fill(null),
    bench: new Array(BENCH_N).fill(null),
    open: new Array(GRID.cols * GRID.rows).fill(false),   // 这一格解锁了没有
    openOrder: [],                                         // 从中心向外的解锁顺序
    openCount: 0,
    buff: KINDS.map(() => ({ dmg: 1, rate: 1, range: 1, pellets: 0 })),  // 每波三选一攒下来的加成
    choices: null,                                         // 当前这三张卡
    coinAcc: 0,
    panel: false,                                          // 养成面板开着没有
    enemies: [], bullets: [], bits: [], floats: [],
    spawnLeft: 0,
    spawnTimer: 0,
    spawnInterval: 0.6,
    drag: null,
    shake: 0,
    flash: 0,
    flashColor: '255,255,255',
    time: 0,
    toast: '',
    toastT: 0,
    stats: { kills: 0, merges: 0, best: 1 },
  };

  /* ----------------------------------------------------------
     工具
     ---------------------------------------------------------- */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));

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
    win() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.09), i * 130));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.07), i * 150));
    },
  };

  const MUTE_BTN = { x: W - 100, y: 164, w: 70, h: 36 };
  const PANEL_BTN = { x: W - 186, y: 164, w: 76, h: 36 };

  function slotCenter(i) {
    const c = i % GRID.cols;
    const r = Math.floor(i / GRID.cols);
    return {
      x: GRID.x + c * CELL + CELL / 2,
      y: GRID.y + r * CELL + CELL / 2,
    };
  }

  /* 待命区：每个槽按单位真实的 w×h 占小块，底部对齐。
     1×1 是 72×72，1×2 是 72×144（竖的），2×1 是 144×72（横的），2×2 是 144×144。 */
  function benchRects() {
    const U = BENCH.unit;
    const sizes = [];
    let total = 0;
    for (let i = 0; i < BENCH_N; i++) {
      const u = G.bench[i];
      const w = u ? u.w : 1;
      const h = u ? u.h : 1;
      sizes.push({ w: U * w, h: U * h });
      total += U * w;
    }
    total += BENCH.gap * (BENCH_N - 1);
    const scale = total > W - 30 ? (W - 30) / total : 1;
    const rects = [];
    let x = (W - total * scale) / 2;
    for (let i = 0; i < BENCH_N; i++) {
      const sz = sizes[i];
      const bw = sz.w * scale;
      const bh = sz.h * scale;
      rects.push({ x, y: BENCH.y + BENCH.h - bh, w: bw, h: bh });
      x += bw + BENCH.gap * scale;
    }
    return rects;
  }

  function benchCenter(i) {
    const r = benchRects()[i];
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  /* ----------------------------------------------------------
     单位
     ---------------------------------------------------------- */

  function makeUnit(kind, star) {
    const k = KINDS[kind];
    return { kind, star, cd: 0, w: k.w, h: k.h, cell: -1 };
  }

  function unitDmg(u) {
    const b = G.buff[u.kind];
    return KINDS[u.kind].dmg * starMul(u.star) * (b ? b.dmg : 1) * lvMul(u.kind);
  }

  function unitRate(u) {
    const b = G.buff[u.kind];
    return KINDS[u.kind].rate * (1 + (u.star - 1) * 0.08) * (b ? b.rate : 1);
  }

  function unitRange(u) {
    const b = G.buff[u.kind];
    return (KINDS[u.kind].range + (u.star - 1) * 40) * (b ? b.range : 1);
  }

  function randomKind() {
    const total = KINDS.reduce((a, k) => a + k.weight, 0);
    let r = Math.random() * total;
    for (let i = 0; i < KINDS.length; i++) {
      r -= KINDS[i].weight;
      if (r <= 0) return i;
    }
    return 0;
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
        if (!G.open[idx]) return false;          // 没解锁的格子不能放
        const u = G.slots[idx];
        if (u && u !== except) return false;
      }
    }
    return true;
  }

  /* 解锁：从中心 3×3 向外扩散 */
  function initOpen() {
    const order = [];
    for (let r = 0; r < GRID.rows; r++) {
      for (let c = 0; c < GRID.cols; c++) {
        const d = Math.max(Math.abs(c - GRID.cx), Math.abs(r - GRID.cy));
        order.push({ i: r * GRID.cols + c, d, r, c });
      }
    }
    order.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
    G.openOrder = order.map((o) => o.i);
    G.open.fill(false);
    for (let k = 0; k < START_CELLS && k < G.openOrder.length; k++) G.open[G.openOrder[k]] = true;
    G.openCount = Math.min(START_CELLS, G.openOrder.length);
  }

  function unlockNext(n) {
    let k = 0;
    for (const i of G.openOrder) {
      if (k >= n) break;
      if (!G.open[i]) { G.open[i] = true; G.openCount++; k++; }
    }
    if (k) G.flash = 0.18;
    return k;
  }

  function openCellAt(p) {
    const c = Math.floor((p.x - GRID.x) / CELL);
    const r = Math.floor((p.y - GRID.y) / CELL);
    if (c < 0 || c >= GRID.cols || r < 0 || r >= GRID.rows) return -1;
    const i = r * GRID.cols + c;
    return G.open[i] ? -1 : i;
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

  /* ----------------------------------------------------------
     波次
     ---------------------------------------------------------- */

  function waveCount(n) {
    return Math.round(TUNE.countBase + n * TUNE.countPerWave);
  }

  function waveHp(n) {
    return TUNE.hpBase * Math.pow(TUNE.hpGrowth, n - 1);
  }

  function waveSpeed(n) {
    return TUNE.speedBase + n * TUNE.speedPerWave;
  }

  function startBattle() {
    if (G.phase !== 'prep') return;
    const filled = G.slots.filter(Boolean).length;
    if (filled === 0) { toast('先拖一个队员上场'); return; }

    G.phase = 'battle';
    G.spawnLeft = waveCount(G.wave);
    G.spawnInterval = Math.max(0.22, TUNE.spawnBase - G.wave * TUNE.spawnDrop);
    G.spawnTimer = 0.35;
    G.bullets.length = 0;
    G.enemies.length = 0;
    for (const u of G.slots) if (u) u.cd = 0;
    SFX.battle();
    toast(`第 ${G.wave} 波`);
  }

  function spawnEnemy() {
    const hp = waveHp(G.wave);
    G.enemies.push({
      x: rand(110, W - 110),
      y: SPAWN_Y - 20,
      hp, maxHp: hp,
      speed: waveSpeed(G.wave) * rand(0.9, 1.1),
      r: 26,
      t: rand(0, 6.28),
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
      const name = KINDS[i].name;
      pool.push({ kind: i, label: name, stat: 'dmg', mul: 1.25, text: '伤害 +25%' });
      pool.push({ kind: i, label: name, stat: 'rate', mul: 1.2, text: '射速 +20%' });
      pool.push({ kind: i, label: name, stat: 'range', mul: 1.15, text: '射程 +15%' });
      if (KINDS[i].pellets === 1) {
        pool.push({ kind: i, label: name, stat: 'pellets', add: 1, text: '弹道 +1' });
      }
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
    G.shake = 4;
    SFX.battle();
  }

  function settleWave() {
    const gain = TUNE.waveBonusBase + G.wave * TUNE.waveBonusPer;
    G.coins += gain;
    if (G.wave >= TUNE.waves) {
      G.phase = 'win';
      G.flash = 0.6;
      SFX.win();
      return;
    }
    G.wave++;
    const opened = unlockNext(2);
    SFX.clear();
    G.choices = rollUpgrades();
    G.phase = 'choose';
    toast(`第 ${G.wave - 1} 波清除  +${gain} 金币${opened ? `　解锁 ${opened} 格` : ''}`);
  }

  function lose() {
    G.phase = 'over';
    G.hp = 0;
    G.shake = 18;
    G.flash = 0.5;
    G.flashColor = '255,80,60';
    SFX.lose();
  }

  function restart() {
    G.phase = 'prep';
    G.wave = 1;
    G.coins = TUNE.startCoins;
    G.hp = TUNE.baseHp;
    G.slots.fill(null);
    G.bench.fill(null);
    initOpen();
    G.enemies.length = 0;
    G.bullets.length = 0;
    G.bits.length = 0;
    G.floats.length = 0;
    G.spawnLeft = 0;
    G.stats = { kills: 0, merges: 0, best: 1 };
    G.buff = KINDS.map(() => ({ dmg: 1, rate: 1, range: 1, pellets: 0 }));
    G.choices = null;
    G.coinAcc = 0;
    G.panel = false;
    G.shake = 0;
    G.flash = 0;
    seedBench();
    toast('把队员拖进格子，两个一样的合成');
  }

  function seedBench() {
    G.bench[0] = makeUnit(0, 1);
    G.bench[1] = makeUnit(1, 1);
    G.bench[2] = makeUnit(2, 1);
  }

  /* ----------------------------------------------------------
     刷新（抽人）
     ---------------------------------------------------------- */

  function emptyBench() {
    return G.bench.indexOf(null);
  }

  function refresh() {
    if (G.phase !== 'prep') { toast('开战中不能刷新'); return; }
    const idx = emptyBench();
    if (idx < 0) { toast('待命区满了，先拖上去'); return; }
    if (G.coins < TUNE.refreshCost) { toast('金币不够'); return; }
    G.coins -= TUNE.refreshCost;
    const star = Math.random() < 0.12 ? 2 : 1;
    G.bench[idx] = makeUnit(randomKind(), star);
    G.flash = 0.12;
    G.flashColor = '120,200,255';
  }

  /* ----------------------------------------------------------
     合成
     ---------------------------------------------------------- */

  function mergeFx(u) {
    const p = unitCenter(u);
    G.stats.merges++;
    G.stats.best = Math.max(G.stats.best, u.star);
    G.shake = 10;
    G.flash = 0.28;
    G.flashColor = '255,220,120';
    for (let n = 0; n < 22; n++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(90, 340);
      G.bits.push({
        x: p.x, y: p.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: rand(0.35, 0.75), max: 0.75,
        color: u.star >= 4 ? '#ffe08a' : '#ffd166',
        size: rand(2, 5),
      });
    }
    G.floats.push({
      x: p.x, y: p.y - 30, vy: -70, life: 1.1, max: 1.1,
      text: `${u.star} 星`, color: '#ffe08a', size: 34,
    });
    SFX.merge(u.star);
  }

  /* ----------------------------------------------------------
     HUD 上的小提示
     ---------------------------------------------------------- */

  function addFloat(x, y, text, color, size) {
    G.floats.push({ x, y, vy: -60, life: 0.8, max: 0.8, text, color, size: size || 22 });
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

    if (G.panel) {
      if (hitRect(PANEL_BTN, p)) { G.panel = false; return; }
      const rows = panelRows();
      for (let i = 0; i < rows.length; i++) {
        if (hitRect(upBtnRect(rows[i]), p)) {
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

    if (hitRect(PANEL_BTN, p)) { G.panel = true; return; }

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

    if (G.phase === 'over' || G.phase === 'win') { restart(); return; }
    if (hitRect(BTN.refresh, p)) { refresh(); return; }
    if (hitRect(BTN.fight, p)) { startBattle(); return; }
    if (G.phase !== 'prep') return;

    const si = slotIndexAt(p);
    if (si >= 0 && G.slots[si]) {
      G.drag = { from: 'slot', i: si, unit: G.slots[si], x: p.x, y: p.y };
      return;
    }
    const bi = benchIndexAt(p);
    if (bi >= 0 && G.bench[bi]) {
      G.drag = { from: 'bench', i: bi, unit: G.bench[bi], x: p.x, y: p.y };
    }
  }

  function onMove(e) {
    if (!G.drag || e.pointerId !== dragId) return;
    const p = toLogic(e);
    G.drag.x = p.x;
    G.drag.y = p.y;
    if (e.cancelable) e.preventDefault();
  }

  function onUp(e) {
    if (G.drag && e.pointerId === dragId) {
      const p = toLogic(e);
      drop(G.drag, p);
      G.drag = null;
    }
    if (e.pointerId === dragId) dragId = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
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
    if (G.bench[bi]) return;             // 待命区满了就不换
    if (d.from === 'slot') vacate(src); else G.bench[d.i] = null;
    G.bench[bi] = src;
  }

  /* ----------------------------------------------------------
     更新
     ---------------------------------------------------------- */

  function update(dt) {
    G.time += dt;
    if (G.toastT > 0) G.toastT -= dt;
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 60);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.4);

    // 金币每秒 +1（原版也是这么给的，不是打怪掉）
    if (G.phase !== 'over' && G.phase !== 'win') {
      G.coinAcc += dt * TUNE.coinPerSec;
      const n = Math.floor(G.coinAcc);
      if (n > 0) { G.coins += n; G.coinAcc -= n; }
    }

    if (G.phase === 'battle') {
      updateSpawn(dt);
      updateEnemies(dt);
      updateUnits(dt);
      updateBullets(dt);
      if (G.spawnLeft <= 0 && !G.enemies.some((e) => !e.dead) && G.phase === 'battle') {
        settleWave();
      }
    }

    updateBits(dt);
    updateFloats(dt);
  }

  function updateSpawn(dt) {
    if (G.spawnLeft <= 0) return;
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      spawnEnemy();
      G.spawnTimer = G.spawnInterval;
    }
  }

  function updateEnemies(dt) {
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.t += dt * 6;
      e.y += e.speed * dt;
      if (e.y >= BASE_Y - 10) {
        e.dead = true;
        G.hp -= 1;
        G.shake = 12;
        SFX.hurt();
        G.flash = 0.35;
        G.flashColor = '255,90,70';
        for (let n = 0; n < 10; n++) {
          const a = rand(0, Math.PI * 2);
          G.bits.push({
            x: e.x, y: BASE_Y, vx: Math.cos(a) * rand(60, 220), vy: Math.sin(a) * rand(60, 220),
            life: 0.5, max: 0.5, color: '#ff6a55', size: rand(2, 5),
          });
        }
        if (G.hp <= 0) { lose(); return; }
      }
    }
    G.enemies = G.enemies.filter((e) => !e.dead);
  }

  function updateUnits(dt) {
    const seen = new Set();
    for (let i = 0; i < G.slots.length; i++) {
      const u = G.slots[i];
      if (!u || seen.has(u)) continue;      // 大单位占多格，只处理一次
      seen.add(u);
      const c = unitCenter(u);
      const range = unitRange(u);
      u.cd -= dt;
      if (u.cd > 0) continue;

      // 射程内、最靠近基地的敌人
      let best = null;
      let bestY = -1;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - c.x, e.y - c.y);
        if (d > range) continue;
        if (e.y > bestY) { bestY = e.y; best = e; }
      }
      if (!best) continue;

      u.cd = 1 / unitRate(u);
      fire(u, c, best);
    }
  }

  function fire(u, c, target) {
    const k = KINDS[u.kind];
    const dmg = unitDmg(u);
    // 星级质变：3 星多一条弹道，5 星再多一条（霰弹本来就是散射，不加）
    let n = k.pellets || 1;
    if (k.id !== 'shot') {
      if (u.star >= 3) n += 1;
      if (u.star >= 5) n += 1;
    }
    n += (G.buff[u.kind] && G.buff[u.kind].pellets) || 0;
    const baseSize = k.id === 'snipe' ? 5 : 4;
    const sizeScale = Math.sqrt(u.w * u.h);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 16 * sizeScale;
      const ang = Math.atan2(target.y - c.y, target.x - c.x) + (n > 1 ? off * 0.012 : 0);
      const sp = k.id === 'snipe' ? 1500 : 1050;
      G.bullets.push({
        x: c.x + off,
        y: c.y - 26 * sizeScale,
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
      x: c.x, y: c.y - 26, vx: rand(-30, 30), vy: rand(-90, -30),
      life: 0.18, max: 0.18, color: k.color, size: 6,
    });
  }

  function updateBullets(dt) {
    for (const b of G.bullets) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -40 || b.x > W + 40 || b.y < 190 || b.y > H + 40) { b.life = 0; continue; }

      for (const e of G.enemies) {
        if (e.dead || b.hit.includes(e)) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) > e.r + b.size) continue;

        e.hp -= b.dmg;
        b.hit.push(e);
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
    }
    G.bullets = G.bullets.filter((b) => b.life > 0);
  }

  function splashDamage(src, dmg, r) {
    for (const o of G.enemies) {
      if (o === src || o.dead) continue;
      if (Math.hypot(o.x - src.x, o.y - src.y) > r) continue;
      o.hp -= dmg;
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
    G.shake = Math.max(G.shake, 4);
    SFX.kill();
    for (let n = 0; n < 8; n++) {
      const a = rand(0, Math.PI * 2);
      G.bits.push({
        x: e.x, y: e.y, vx: Math.cos(a) * rand(60, 220), vy: Math.sin(a) * rand(60, 220),
        life: rand(0.25, 0.5), max: 0.5, color: '#ff8a70', size: rand(2, 5),
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
      drawUnit(c, p.x, p.y, u, 1);
    }

    drawBullets(c);
    drawBits(c);
    drawFloats(c);

    if (G.drag) {
      const pv = dragPreview();
      if (pv) {
        // 单位跟着吸附后的位置走，别画在手指上
        drawUnit(c, GRID.x + (pv.c0 + pv.w / 2) * CELL,
                    GRID.y + (pv.r0 + pv.h / 2) * CELL, G.drag.unit, 1.02);
      } else {
        drawUnit(c, G.drag.x, G.drag.y - 20, G.drag.unit, 1.06);
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
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1220');
    g.addColorStop(0.45, '#0d1626');
    g.addColorStop(1, '#080c14');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // 战场底部的地平线
    const hz = c.createLinearGradient(0, GRID.y - 260, 0, GRID.y);
    hz.addColorStop(0, 'rgba(80,120,180,0)');
    hz.addColorStop(1, 'rgba(80,120,180,0.10)');
    c.fillStyle = hz;
    c.fillRect(0, GRID.y - 260, W, 260);

    // 远处几根柱子，给一点纵深
    c.fillStyle = 'rgba(120,160,220,0.032)';
    for (let i = 0; i < 6; i++) {
      const x = 40 + i * 130;
      c.fillRect(x, 260, 46, GRID.y - 300);
    }
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
    for (let i = 0; i < G.slots.length; i++) {
      const col = i % GRID.cols;
      const row = Math.floor(i / GRID.cols);
      const x = GRID.x + col * CELL + 4;
      const y = GRID.y + row * CELL + 4;
      const s = CELL - 8;

      rr(c, x, y, s, s, 12);
      if (!G.open[i]) {
        c.fillStyle = 'rgba(10,14,22,0.55)';
        c.fill();
        c.setLineDash([4, 6]);
        c.lineWidth = 1.5;
        c.strokeStyle = 'rgba(90,110,140,0.2)';
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = 'rgba(110,140,180,0.2)';
        c.beginPath();
        c.arc(x + s / 2, y + s / 2, 4, 0, Math.PI * 2);
        c.fill();
        continue;
      }
      if (G.slots[i]) continue;      // 有单位的格子整个交给下面那圈实线框

      rr(c, x, y, s, s, 12);
      c.fillStyle = 'rgba(110,160,230,0.035)';
      c.fill();
      c.setLineDash([7, 7]);
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(110,150,210,0.16)';
      c.stroke();
      c.setLineDash([]);
    }

    // 场上的单位：一个整体框圈住它占的 w×h（不逐格分割）
    const held = new Set();
    for (let i = 0; i < G.slots.length; i++) {
      const u = G.slots[i];
      if (!u || held.has(u)) continue;
      held.add(u);
      if (G.drag && G.drag.unit === u) continue;
      const c0 = u.cell % GRID.cols;
      const r0 = Math.floor(u.cell / GRID.cols);
      rr(c, GRID.x + c0 * CELL + 3, GRID.y + r0 * CELL + 3,
         u.w * CELL - 6, u.h * CELL - 6, 16);
      c.fillStyle = 'rgba(255,214,102,0.05)';
      c.fill();
      c.setLineDash([]);
      c.lineWidth = 2.5;
      c.strokeStyle = 'rgba(255,214,102,0.55)';
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

  function drawBench(c) {
    const rects = benchRects();
    c.fillStyle = 'rgba(150,180,220,0.45)';
    c.font = '600 16px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('待命区', rects[0].x, BENCH.y - 10);

    let hot = -1;
    if (G.drag) {
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (G.drag.x >= r.x && G.drag.x <= r.x + r.w && G.drag.y >= r.y && G.drag.y <= r.y + r.h) { hot = i; break; }
      }
    }

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const u = G.bench[i];
      rr(c, r.x, r.y, r.w, r.h, 14);
      c.fillStyle = u ? 'rgba(110,160,230,0.10)' : 'rgba(110,160,230,0.035)';
      c.fill();
      if (u) {
        // 有角色的框：实线（角色占位是实物，不是虚的格子）
        c.setLineDash([]);
        c.lineWidth = 2.5;
        c.strokeStyle = hot === i ? 'rgba(120,230,160,0.9)' : 'rgba(255,214,102,0.55)';
      } else {
        // 空槽：虚线，和格子一个语言
        c.setLineDash([6, 6]);
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(110,150,210,0.18)';
      }
      c.stroke();
      c.setLineDash([]);
    }
  }

  function drawUnit(c, x, y, u, sc) {
    const k = KINDS[u.kind];
    const star = u.star;
    const sizeScale = Math.sqrt((u.w || 1) * (u.h || 1));
    const body = 23 * sizeScale * sc * (1 + (star - 1) * 0.05);
    const bob = Math.sin(G.time * 3 + x * 0.01) * 2;

    // 影子
    c.fillStyle = 'rgba(0,0,0,0.34)';
    c.beginPath();
    c.ellipse(x, y + body * 0.95, body * 0.9, body * 0.28, 0, 0, Math.PI * 2);
    c.fill();

    // 4 星以上：脚下一圈会转的光环
    if (star >= 4) {
      c.save();
      c.translate(x, y + body * 0.95);
      c.rotate(G.time * 0.9);
      c.strokeStyle = 'rgba(255,214,102,0.42)';
      c.lineWidth = 3;
      c.setLineDash([10, 9]);
      c.beginPath();
      c.ellipse(0, 0, body * 0.98, body * 0.31, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }

    // 星级光晕
    if (star >= 3) {
      const g = c.createRadialGradient(x, y + bob, body * 0.4, x, y + bob, body * 2.1);
      g.addColorStop(0, star >= 5 ? 'rgba(255,220,120,0.5)' : 'rgba(140,200,255,0.34)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y + bob, body * 2.1, 0, Math.PI * 2);
      c.fill();
    }

    // 枪管（朝上）
    c.save();
    c.translate(x, y + bob);
    c.fillStyle = k.deep;
    rr(c, body * 0.30, -body * 1.28, body * 0.30, body * 1.05, 4);
    c.fill();
    c.fillStyle = k.color;
    rr(c, body * 0.33, -body * 1.32, body * 0.24, body * 0.22, 3);
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

    // 星级角标
    const bx = x + body * 0.78;
    const by = y + body * 0.78 + bob;
    c.fillStyle = star >= 4 ? '#ffd15c' : '#16202f';
    c.beginPath(); c.arc(bx, by, 15 * sc, 0, Math.PI * 2); c.fill();
    c.lineWidth = 2;
    c.strokeStyle = star >= 4 ? '#fff1b8' : 'rgba(150,190,240,0.55)';
    c.stroke();
    c.fillStyle = star >= 4 ? '#2a1d02' : '#dce9ff';
    c.font = `800 ${17 * sc}px "PingFang SC",system-ui,sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(star), bx, by + 1);
  }

  function drawEnemy(c, e) {
    const r = e.r;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(e.x, e.y + r * 0.9, r * 0.85, r * 0.26, 0, 0, Math.PI * 2);
    c.fill();

    const wob = Math.sin(e.t) * 2;
    const g = c.createLinearGradient(e.x, e.y - r, e.x, e.y + r);
    g.addColorStop(0, '#ff7a62');
    g.addColorStop(1, '#a92f28');
    c.fillStyle = g;
    c.beginPath();
    c.arc(e.x + wob, e.y, r, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = 'rgba(20,8,8,0.6)';
    c.stroke();

    c.fillStyle = '#fff2ea';
    c.beginPath(); c.arc(e.x - r * 0.32 + wob, e.y - r * 0.12, r * 0.22, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(e.x + r * 0.32 + wob, e.y - r * 0.12, r * 0.22, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a0a08';
    c.beginPath(); c.arc(e.x - r * 0.32 + wob, e.y - r * 0.1, r * 0.1, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(e.x + r * 0.32 + wob, e.y - r * 0.1, r * 0.1, 0, Math.PI * 2); c.fill();

    // 血条
    if (e.hp < e.maxHp) {
      const w = r * 1.9;
      const hx = e.x - w / 2;
      const hy = e.y - r - 12;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      rr(c, hx, hy, w, 6, 3);
      c.fill();
      c.fillStyle = '#6ee7a0';
      rr(c, hx, hy, Math.max(0, w * (e.hp / e.maxHp)), 6, 3);
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

  function drawHud(c) {
    c.textBaseline = 'middle';

    // 顶栏：波次
    c.textAlign = 'left';
    c.font = '800 30px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = '#e9f1ff';
    c.fillText(`第 ${G.wave} 波 / ${TUNE.waves}`, 30, 106);

    // 金币
    c.textAlign = 'right';
    c.font = '800 30px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#ffd166';
    c.fillText(`${G.coins}`, W - 30, 104);
    c.font = '500 18px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(160,185,220,0.75)';
    c.fillText('金币', W - 30, 134);

    // 进度条
    const px = 30, py = 144, pw = W - 60, ph = 8;
    rr(c, px, py, pw, ph, 4);
    c.fillStyle = 'rgba(150,180,220,0.16)';
    c.fill();
    rr(c, px, py, (pw * Math.min(G.wave - 1, TUNE.waves)) / TUNE.waves, ph, 4);
    c.fillStyle = '#6ec8ff';
    c.fill();

    // 剩余敌人
    if (G.phase === 'battle') {
      c.textAlign = 'center';
      c.font = '600 18px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = 'rgba(200,215,240,0.7)';
      c.fillText(`剩余 ${G.spawnLeft + G.enemies.length}`, W / 2, 182);
    }

    // 基地血
    const hpW = W - 180;
    const hx = 90, hy = 1182;
    rr(c, hx, hy, hpW, 24, 12);
    c.fillStyle = 'rgba(8,12,20,0.8)';
    c.fill();
    const ratio = Math.max(0, G.hp / G.hpMax);
    if (ratio > 0) {
      rr(c, hx + 3, hy + 3, (hpW - 6) * ratio, 18, 9);
      const hg = c.createLinearGradient(hx, 0, hx + hpW, 0);
      hg.addColorStop(0, ratio < 0.35 ? '#e2574c' : '#34d17a');
      hg.addColorStop(1, ratio < 0.35 ? '#ff8a6b' : '#6ee7a0');
      c.fillStyle = hg;
      c.fill();
    }
    c.textAlign = 'center';
    c.font = '800 19px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#ffffff';
    c.fillText(`${G.hp} / ${G.hpMax}`, W / 2, hy + 12);

    // 按钮
    drawButton(c, BTN.refresh, '刷新', `${TUNE.refreshCost} 金币`, G.phase === 'prep' && G.coins >= TUNE.refreshCost);
    const canFight = G.phase === 'prep';
    drawButton(c, BTN.fight, canFight ? '开战' : '交战中', canFight ? `${waveCount(G.wave)} 个敌人` : '清完自动结算', canFight);

    // 养成按钮
    rr(c, PANEL_BTN.x, PANEL_BTN.y, PANEL_BTN.w, PANEL_BTN.h, 10);
    c.fillStyle = 'rgba(20,26,38,0.72)';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(255,209,102,0.4)';
    c.stroke();
    c.textAlign = 'center';
    c.font = '600 15px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#ffd166';
    c.fillText('养成', PANEL_BTN.x + PANEL_BTN.w / 2, PANEL_BTN.y + PANEL_BTN.h / 2);

    // 静音开关
    rr(c, MUTE_BTN.x, MUTE_BTN.y, MUTE_BTN.w, MUTE_BTN.h, 10);
    c.fillStyle = 'rgba(20,26,38,0.72)';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = muted ? 'rgba(150,176,220,0.2)' : 'rgba(143,216,255,0.4)';
    c.stroke();
    c.textAlign = 'center';
    c.font = '600 15px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = muted ? 'rgba(160,180,210,0.55)' : '#8fd8ff';
    c.fillText(muted ? '静音' : '音效', MUTE_BTN.x + MUTE_BTN.w / 2, MUTE_BTN.y + MUTE_BTN.h / 2);

    // 提示条
    if (G.toastT > 0 && G.toast) {
      const a = Math.min(1, G.toastT / 0.4);
      c.globalAlpha = a;
      c.textAlign = 'center';
      c.font = '700 24px "PingFang SC",system-ui,sans-serif';
      c.lineWidth = 6;
      c.strokeStyle = 'rgba(6,10,18,0.85)';
      c.strokeText(G.toast, W / 2, 640);
      c.fillStyle = '#dbe8ff';
      c.fillText(G.toast, W / 2, 640);
      c.globalAlpha = 1;
    }
  }

  function drawButton(c, r, label, sub, enabled) {
    rr(c, r.x, r.y, r.w, r.h, 20);
    if (enabled) {
      const g = c.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, 'rgba(90,190,120,0.95)');
      g.addColorStop(1, 'rgba(46,140,86,0.95)');
      c.fillStyle = g;
    } else {
      c.fillStyle = 'rgba(60,75,100,0.5)';
    }
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = enabled ? 'rgba(160,255,190,0.55)' : 'rgba(120,150,190,0.25)';
    c.stroke();

    c.textAlign = 'center';
    c.font = '800 38px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = enabled ? '#ffffff' : 'rgba(200,215,240,0.5)';
    c.fillText(label, r.x + r.w / 2, r.y + r.h * 0.42);

    c.font = '600 18px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = enabled ? 'rgba(230,255,240,0.75)' : 'rgba(180,200,230,0.4)';
    c.fillText(sub, r.x + r.w / 2, r.y + r.h * 0.75);
  }

  function choiceRects() {
    const w = 200, h = 280, gap = 20;
    const total = 3 * w + 2 * gap;
    const x0 = (W - total) / 2;
    const y = 520;
    return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
  }

  function drawChoose(c) {
    c.fillStyle = 'rgba(4,8,14,0.82)';
    c.fillRect(0, 0, W, H);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '800 42px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#ffe08a';
    c.fillText('选择强化', W / 2, 392);
    c.font = '500 22px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(190,210,240,0.75)';
    c.fillText(`第 ${G.wave - 1} 波清除 · 三选一`, W / 2, 444);

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

      rr(c, r.x + 12, r.y + 12, r.w - 24, 6, 3);
      c.fillStyle = tint;
      c.fill();

      c.textAlign = 'center';
      c.font = '800 30px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = tint;
      c.fillText(u.label, r.x + r.w / 2, r.y + 88);

      c.font = '700 23px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = '#e8f0ff';
      c.fillText(u.text, r.x + r.w / 2, r.y + 158);

      c.font = '600 18px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = 'rgba(160,190,230,0.55)';
      c.fillText('点一下', r.x + r.w / 2, r.y + r.h - 42);
    }
  }

  /* ----------------------------------------------------------
     养成面板：花局内金币升兵种等级
     ---------------------------------------------------------- */

  function panelRows() {
    const w = 600, h = 112, gap = 16;
    const x = (W - w) / 2;
    const y0 = 380;
    return KINDS.map((_, i) => ({ x, y: y0 + i * (h + gap), w, h }));
  }

  function upBtnRect(row) {
    return { x: row.x + row.w - 150, y: row.y + 26, w: 126, h: 60 };
  }

  function drawPanel(c) {
    c.fillStyle = 'rgba(4,8,14,0.86)';
    c.fillRect(0, 0, W, H);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '800 42px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#ffe08a';
    c.fillText('养成', W / 2, 296);
    c.font = '500 20px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(190,210,240,0.72)';
    c.fillText('等级决定合成上限：3 级只能合到 3 星', W / 2, 342);

    const rows = panelRows();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const k = KINDS[i];
      rr(c, r.x, r.y, r.w, r.h, 16);
      c.fillStyle = 'rgba(22,32,50,0.94)';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = k.color;
      c.stroke();

      c.fillStyle = k.color;
      c.beginPath();
      c.arc(r.x + 58, r.y + r.h / 2, 22, 0, Math.PI * 2);
      c.fill();

      c.textAlign = 'left';
      c.font = '800 26px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = '#eef4ff';
      c.fillText(k.name, r.x + 98, r.y + 42);
      c.font = '600 18px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = 'rgba(170,195,230,0.82)';
      c.fillText(`等级 ${LV[i]}　可合 ${maxStarOf(i)} 星`, r.x + 98, r.y + 76);

      const b = upBtnRect(r);
      const maxed = LV[i] >= 10;
      const cost = upgradeCost(i);
      const can = !maxed && G.coins >= cost;
      rr(c, b.x, b.y, b.w, b.h, 12);
      c.fillStyle = can ? 'rgba(90,190,120,0.95)' : 'rgba(60,75,100,0.55)';
      c.fill();
      c.textAlign = 'center';
      c.font = '800 20px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = can ? '#ffffff' : 'rgba(200,215,240,0.5)';
      c.fillText(maxed ? '满级' : `升级 ${cost}`, b.x + b.w / 2, b.y + 24);
      c.font = '600 14px "PingFang SC",system-ui,sans-serif';
      c.fillStyle = can ? 'rgba(230,255,240,0.75)' : 'rgba(180,200,230,0.4)';
      c.fillText(`金币 ${G.coins}`, b.x + b.w / 2, b.y + 46);
    }

    c.textAlign = 'center';
    c.font = '600 20px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(160,190,230,0.55)';
    c.fillText('点空白处关闭', W / 2, H - 130);
  }

  function drawEnd(c) {
    c.fillStyle = 'rgba(4,8,14,0.82)';
    c.fillRect(0, 0, W, H);

    const win = G.phase === 'win';
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    c.font = '900 84px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    c.fillStyle = win ? '#ffd166' : '#ff6a55';
    c.fillText(win ? '守住了' : '失守', W / 2, 620);

    c.font = '600 30px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = '#dbe8ff';
    c.fillText(win ? `${TUNE.waves} 波全部清完` : `撑到第 ${G.wave} 波`, W / 2, 730);

    c.font = '500 24px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(170,195,230,0.85)';
    c.fillText(`击杀 ${G.stats.kills}　合成 ${G.stats.merges} 次　最高 ${G.stats.best} 星`, W / 2, 790);

    c.font = '700 26px "PingFang SC",system-ui,sans-serif';
    c.fillStyle = 'rgba(200,215,240,0.6)';
    c.fillText('点一下重来', W / 2, 900);
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

    update(dt);
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
  initOpen();
  seedBench();
  toast('把队员拖进格子，两个一样的合成');
  requestAnimationFrame(frame);

  // 测试/调试用
  window.__squad = G;
  window.__squadApi = {
    startBattle, refresh, restart,
    slotIndexAt, benchIndexAt, slotCenter, benchCenter, unitCenter,
    dropToSlot, dropToBench, canPlace, occupy, vacate, fitsAnywhere,
    applyUpgrade, choiceRects, rollUpgrades,
    maxStarOf, upgradeCost, saveLV, LV,
    GRID, BENCH, BTN, CELL, KINDS, TUNE, MAX_STAR, STAR: MAX_STAR,
  };
})();
