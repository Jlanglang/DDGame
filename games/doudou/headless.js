/* 豆豆守护 · 无渲染数值模拟器（假 DOM + 固定步长，不参与交付）
   从 D:\DP\.tools\headless.js 搬来：游戏路径改成 __dirname。

   用法：
     node games/doudou/headless.js --runs 20 --policy feed --max 600
     node games/doudou/headless.js --runs 20 --policy feed --bal "{\"hpGrowth\":2.4}"

   注意：--bal 里的键会覆盖 game.js 里的 BAL（真实构建也认 window.__BALANCE）。 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GAME = process.env.DDGAME_GAME || path.join(__dirname, 'game.js');   // 本文件就在游戏目录里

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const RUNS = Number(arg('runs', 10));
const POLICY = arg('policy', 'feed');
const MAXT = Number(arg('max', 600));
const BAL = arg('bal', null);
const VERBOSE = process.argv.includes('--verbose');
const TRACE = process.argv.includes('--trace');
const DT = 1000 / 60;

/* ---------------- 假 DOM ---------------- */

function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {};
  return new Proxy(base, {
    get(t, k) {
      if (k === 'createLinearGradient') return () => grad;
      if (k === 'createRadialGradient') return () => grad;
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

const noop = () => {};

function makeEl() {
  return {
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    hidden: false,
    textContent: '',
    innerHTML: '',
    width: 0,
    height: 0,
    addEventListener: noop,
    setAttribute: noop,
    getAttribute: () => null,
    appendChild: noop,
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 450, height: 1000 }),
    setPointerCapture: noop,
    releasePointerCapture: noop,
    querySelectorAll: () => [],
  };
}

function makeSandbox(seed) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const M = Object.create(Math);
  M.random = rand;

  const els = new Map();
  const document = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl());
      return els.get(id);
    },
    querySelectorAll: () => [],
    addEventListener: noop,
    setAttribute: noop,
    getAttribute: () => null,
  };

  let frameCb = null;
  const window = {
    addEventListener: noop,
    setAttribute: noop,
    getAttribute: () => null,
    devicePixelRatio: 1,
    __g: null,
  };

  const sandbox = {
    console,
    Math: M,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    Set,
    Map,
    URLSearchParams,
    location: { search: '?debug=1' },
    document,
    window,
    requestAnimationFrame(cb) {
      frameCb = cb;
      return 1;
    },
    performance: { now: () => 0 },
  };
  sandbox.__BALANCE = BAL ? JSON.parse(BAL) : undefined;

  return {
    sandbox,
    getFrame: () => frameCb,
    els,
  };
}

/* ---------------- 自动玩家 ---------------- */

function makePolicy(name) {
  if (name === 'fight') {
    return (g) => {
      let best = null;
      for (const e of g.enemies) if (!e.dead && (!best || e.y > best.y)) best = e;
      if (best) moveTo(g.player, best.x);
    };
  }

  // feed：卡片是墙，一对卡同时落到身上。选"喂完收益最大"的那张站过去，并锁定目标。
  // noattack：故意不碰攻击卡，用来验证"没有攻击卡必输"。
  const avoidAtk = name === 'noattack';
  let committed = null;

  return (g) => {
    const p = g.player;
    const B = g.bal;
    const alive = g.cards.filter((c) => !c.dead);
    const above = alive.filter(
      (c) => c.y < p.y - 30 && (!avoidAtk || c.type.id !== 'dmgMul')
    );

    if (alive.length === 0) committed = null;
    if (committed && !alive.includes(committed)) committed = null;

    if (above.length) {
      const tierMul = (t) => (t >= 0 ? t + 1 : 1 / (1 - t));
      // 快落地时重新评估：如果喂不动/吃了会亏，就换另一边
      let best = committed && above.includes(committed) && (p.y - committed.y) > 180 ? committed : null;

      if (!best) {
        best = above[0];
        let bestGain = -Infinity;

        for (const c of above) {
          const travel = Math.max(0, (p.y - c.y) / c.speed);
          const hits = travel * Math.min(p.rate, 1 / (c.type.cd || 0.2));
          const proj = c.value + hits * c.step;
          let gain;

          if (c.type.id === 'dmgMul') gain = tierMul(proj);
          else if (c.type.id === 'dmgAdd') gain = 1 + Math.max(0, proj) / Math.max(1, p.damage);
          else if (c.type.id === 'rateMul') {
            gain = Math.max(
              B.rateFloor,
              B.baseRate + B.rateStep * Math.min(B.rateMaxTier, p.rateTier + proj)
            ) / Math.max(0.1, p.rate);
          } else {
            gain = Math.sqrt(Math.max(1, Math.min(B.shotsMax, p.shots + proj)) / Math.max(1, p.shots));
          }

          if (gain > bestGain) { bestGain = gain; best = c; }
        }

        committed = best;
      }

      return moveTo(p, best.side === 'left' ? 100 : 620);
    }

    let threat = null;
    for (const e of g.enemies) if (!e.dead && (!threat || e.y > threat.y)) threat = e;
    if (threat) moveTo(p, threat.x);
  };
}

function moveTo(p, x) {
  const clamped = Math.max(138, Math.min(582, x));
  p.x += Math.max(-18, Math.min(18, clamped - p.x));
}

/* ---------------- 跑一局 ---------------- */

function run(seed, policyFn) {
  const { sandbox, getFrame, els } = makeSandbox(seed);
  const src = fs
    .readFileSync(GAME, 'utf8')
    // 无头跑不需要画：把渲染调用摘掉，速度差一个数量级
    .replace('\n    syncBuffs();\n    render();', '\n    syncBuffs();');

  let err = null;
  try {
    vm.runInNewContext(src, sandbox, { filename: GAME });
  } catch (e) {
    err = e;
  }
  if (err) throw err;

  const g = sandbox.window.__g;
  if (!g) throw new Error('没有 __g（debug 没开？）');

  const frame = getFrame();
  if (!frame) throw new Error('没有 rAF 回调');

  const upgrade = { dmgMul: 0, rateMul: 0, dmgAdd: 0, shots: 0 };
  let lastDmgMul = g.player.dmgMul;
  let lastDmg = g.player.damage;
  let lastRateTier = g.player.rateTier ?? 0;
  let lastShots = g.player.shots;
  let t = 0;
  let frames = 0;
  let earlyAtk = 0;   // 前 3 波出现攻击卡的帧数（应该永远是 0）
  let waveMarks = [];  // 每波开始的时间点，用来看时间花在哪

  while (g.state === 'playing' && t < MAXT) {
    policyFn(g);
    if (waveMarks.length === 0 || g.wave !== waveMarks[waveMarks.length - 1].wave) {
      waveMarks.push({ wave: g.wave, t: +t.toFixed(1) });
    }
    frame(t * 1000);

    if (g.wave <= 3 && g.cards.some((c) => !c.dead && c.type.id === 'dmgMul')) earlyAtk += 1;

    const p = g.player;
    if (p.dmgMul !== lastDmgMul) {
      upgrade.dmgMul += 1;
      if (TRACE) console.log(`  [dmgMul] t=${t.toFixed(0)} ${lastDmgMul} -> ${p.dmgMul.toFixed(2)}`);
      lastDmgMul = p.dmgMul;
    }
    if (p.damage !== lastDmg) { upgrade.dmgAdd += 1; lastDmg = p.damage; }
    if ((p.rateTier ?? 0) !== lastRateTier) { upgrade.rateMul += 1; lastRateTier = p.rateTier ?? 0; }
    if (p.shots !== lastShots) { upgrade.shots += 1; lastShots = p.shots; }

    if (TRACE && frames % 300 === 0) {
      const hpNow = g.enemies.length ? Math.max(...g.enemies.map((e) => e.hp)) : 0;
      const dmgNow = p.damage * p.dmgMul;
      console.log(
        `  t=${t.toFixed(0)}s w${g.wave} k${g.kills} hp${p.hp} dmg=${Math.round(dmgNow)} ehp=${Math.round(hpNow)} ratio=${hpNow ? (hpNow / dmgNow).toFixed(1) : '-'} rate=${p.rate.toFixed(1)} shots=${p.shots} en=${g.enemies.length} cards=${g.cards.filter((c) => !c.dead).map((c) => c.type.id + ':' + Math.round(c.value)).join(',')}`
      );
    }

    t += DT / 1000;
    frames += 1;
    if (frames > 200000) break;
  }

  return {
    over: g.state,
    result: g.result,
    t: +t.toFixed(1),
    wave: g.wave,
    waveMarks,
    kills: g.kills,
    hp: g.player.hp,
    maxHp: g.player.maxHp,
    dmg: Math.round(g.player.damage),
    mul: +g.player.dmgMul.toFixed(3),
    rate: +g.player.rate.toFixed(2),
    rateTier: g.player.rateTier ?? 0,
    mulNow: +g.player.dmgMul.toFixed(3),
    shots: g.player.shots,
    ate: upgrade,
    boss: g.bossSpawned,
    earlyAtk,
    stuckEnemies: g.state === 'playing' ? g.enemies.map((e) => ({ k: e.kind, y: Math.round(e.y), hp: Math.round(e.hp), s: e.speed })) : null,
    stuckCards: g.state === 'playing' ? g.cards.map((c) => ({ id: c.type.id, y: Math.round(c.y), v: c.value })) : null,
  };
}

/* ---------------- main ---------------- */

const policyFn = makePolicy(POLICY);
const rows = [];

for (let i = 0; i < RUNS; i++) {
  // 同一批种子跨配置复用，方便 A/B
  const seed = 12345 + i * 7919;
  const r = run(seed, policyFn);
  rows.push(r);
  if (VERBOSE) {
    console.log(
      `#${i} ${r.over}/${r.result} t=${r.t} w=${r.wave} k=${r.kills} hp=${r.hp} dmg=${r.dmg} (总倍率 ×${r.mul}) rate=${r.rate} shots=${r.shots} ate=${JSON.stringify(r.ate)}`
    );
    console.log('  marks=' + r.waveMarks.map((m) => `${m.wave}@${m.t}`).join(' '));
  }
}

const avg = (k) => +(rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(2);
const med = (k) => {
  const a = rows.map((r) => r[k]).sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

const summary = {
  runs: RUNS,
  wins: rows.filter((r) => r.result === 'win').length,
  losses: rows.filter((r) => r.result === 'lose').length,
  noAtk: {
    runs: rows.filter((r) => r.ate.dmgMul === 0).length,
    wins: rows.filter((r) => r.ate.dmgMul === 0 && r.result === 'win').length,
  },
  withAtk: {
    runs: rows.filter((r) => r.ate.dmgMul > 0).length,
    wins: rows.filter((r) => r.ate.dmgMul > 0 && r.result === 'win').length,
  },
  timeout: rows.filter((r) => r.over === 'playing').length,
  avgT: avg('t'),
  avgWave: avg('wave'),
  avgKills: avg('kills'),
  avgHp: avg('hp'),
  hpMin: Math.min(...rows.map((r) => r.hp)),
  hurts: rows.filter((r) => r.hp < r.maxHp).length,
  avgDmg: Math.round(avg('dmg')),
  medDmg: med('dmg'),
  maxDmg: Math.max(...rows.map((r) => r.dmg)),
  avgMul: avg('mul'),
  avgRate: avg('rate'),
  avgShots: avg('shots'),
  pace: {
    dmgMul: +(rows.reduce((s, r) => s + r.ate.dmgMul, 0) / rows.length).toFixed(1),
    rateMul: +(rows.reduce((s, r) => s + r.ate.rateMul, 0) / rows.length).toFixed(1),
    dmgAdd: +(rows.reduce((s, r) => s + r.ate.dmgAdd, 0) / rows.length).toFixed(1),
    shots: +(rows.reduce((s, r) => s + r.ate.shots, 0) / rows.length).toFixed(1),
  },
};

console.log(JSON.stringify(summary, null, 2));
if (VERBOSE) console.log(JSON.stringify(rows));
