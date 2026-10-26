/* 小队模式 · 无渲染数值模拟器（假 DOM + 固定步长）
   用法：
     node games/doudou/squad-headless.js --runs 200
     node games/doudou/squad-headless.js --runs 200 --policy greedy
     node games/doudou/squad-headless.js --runs 200 --tune "{\"hpGrowth\":1.35}"
     node games/doudou/squad-headless.js --runs 200 --verbose

   它加载真实的 squad.js（vm + 假 DOM），用 __squadApi 摆人、开战，
   再手动驱动 requestAnimationFrame。所以模拟的不是另一份逻辑。

   策略：
     smart  —— 先把待命区用掉（同兵种同星优先合成），再刷新，刷到待命区满/没钱
     greedy —— 先刷满待命区，再用掉
     lazy   —— 只用开局送的三个，不刷新
*/

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, 'squad.js'), 'utf8');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const RUNS = Number(arg('runs', 100));
const POLICY = arg('policy', 'smart');
const MAXT = Number(arg('max', 1200));
const TUNE = arg('tune', null);
const SEED = Number(arg('seed', 1));
const VERBOSE = process.argv.includes('--verbose');
const DT = 1 / 60;

/* --tune 两种写法都认：
     hpGrowth=1.4,starGrowth=2.0        （PowerShell 里引号会被吃掉，推荐这个）
     '{"hpGrowth":1.4}'                 （bash 里方便） */
function parseTune(s) {
  if (!s) return null;
  if (s.trim().startsWith('{')) return JSON.parse(s);
  const out = {};
  for (const pair of s.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    out[pair.slice(0, eq).trim()] = Number(pair.slice(eq + 1));
  }
  return out;
}
const TUNE_JSON = parseTune(TUNE);

/* ---------------- 假 DOM ---------------- */

const RESULTS = [];
const LV_STATE = [3, 3, 3, 3];   // 跨局共享：模拟同一个玩家一直养

function makeSandbox(seed) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const M = Object.create(Math);
  M.random = rand;

  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 0 });
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });

  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 450, height: 1000 }),
    addEventListener: () => {},
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  };

  const document = {
    getElementById: () => canvas,
    addEventListener: () => {},
  };

  let frame = null;
  const window = {
    addEventListener: () => {},
    requestAnimationFrame(cb) { frame = cb; return 1; },
    devicePixelRatio: 1,
  };

  const sandbox = {
    console,
    Math: M,
    JSON, Object, Array, Number, String, Boolean, Error, Set, Map, Date,
    URLSearchParams,
    performance: { now: () => Date.now() },
    setTimeout: () => 0,
    clearTimeout: () => {},
    location: { search: '' },
    document,
    window,
    localStorage: { getItem: () => null, setItem: () => {} },
    // squad.js 用的是裸的 rAF，不是 window. 上的
    requestAnimationFrame(cb) { frame = cb; return 1; },
  };
  if (TUNE_JSON) sandbox.__SQUAD_TUNE = TUNE_JSON;
  sandbox.__SQUAD_LV = LV_STATE;

  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'squad.js' });

  return {
    g: sandbox.window.__squad,
    api: sandbox.window.__squadApi,
    takeFrame() { const f = frame; frame = null; return f; },
  };
}

/* ---------------- 玩家策略 ---------------- */

function pickSlot(g, u, api) {
  const cols = api.GRID.cols, rows = api.GRID.rows;
  // 1. 场上同兵种同星 → 合成（受养成等级限制）
  for (let i = 0; i < g.slots.length; i++) {
    const s = g.slots[i];
    if (s && s.kind === u.kind && s.star === u.star && s.star < api.maxStarOf(s.kind)) return s.cell;
  }
  // 2. 找第一个放得下 w×h 的锚点
  for (let r = 0; r <= rows - u.h; r++) {
    for (let c = 0; c <= cols - u.w; c++) {
      const cell = r * cols + c;
      if (api.canPlace(cell, u.w, u.h)) return cell;
    }
  }
  return -1;
}

function useBench(g, api) {
  let moved = true;
  while (moved) {
    moved = false;
    for (let b = 0; b < g.bench.length; b++) {
      const u = g.bench[b];
      if (!u) continue;
      const si = pickSlot(g, u, api);
      if (si >= 0) {
        api.dropToSlot({ from: 'bench', i: b, unit: u }, si);
        moved = true;
      }
    }
  }
}

function fieldMerge(g, api) {
  // 有机会就合：合成是纯正收益（同兵种同星 → 升一星，总输出涨）
  for (let i = 0; i < g.slots.length; i++) {
    const a = g.slots[i];
    if (!a || a.star >= api.maxStarOf(a.kind)) continue;
    for (let j = i + 1; j < g.slots.length; j++) {
      const b = g.slots[j];
      if (b && b !== a && b.kind === a.kind && b.star === a.star) {
        api.dropToSlot({ from: 'slot', i: j, unit: b }, a.cell);
        return true;
      }
    }
  }
  return false;
}

function aiLevelUp(g, api) {
  // 模拟会去点「养成」的玩家：金币富余就升兵种等级
  for (let k = 0; k < api.LV.length; k++) {
    const cost = api.upgradeCost(k);
    if (api.LV[k] < 5 && g.coins >= cost + 40) {
      g.coins -= cost;
      api.LV[k]++;
    }
  }
}

function aiPrepare(g, api, policy) {
  aiLevelUp(g, api);
  if (policy === 'greedy') {
    let guard = 0;
    while (g.coins >= api.TUNE.refreshCost && g.bench.includes(null) && guard++ < 60) api.refresh();
    useBench(g, api);
    return;
  }

  useBench(g, api);
  if (policy === 'lazy') return;

  // 满格 → 合成腾位置 → 再刷新填补，循环到刷不动为止
  let guard = 0;
  while (guard++ < 80) {
    fieldMerge(g, api);
    useBench(g, api);
    if (g.coins < api.TUNE.refreshCost || !g.bench.includes(null)) break;
    api.refresh();
  }
  useBench(g, api);
}

/* ---------------- 跑一局 ---------------- */

function playOne(seed, policy) {
  const box = makeSandbox(seed);
  const g = box.g;
  const api = box.api;

  const waveSecs = [];
  let t = 0;
  let waveStart = 0;
  let curWave = 1;
  let prevPhase = g.phase;
  let stuck = false;

  for (let guard = 0; guard < 400000; guard++) {
    if (g.phase === 'win' || g.phase === 'over') break;
    if (t > MAXT) { stuck = true; break; }

    // 三选一：模拟玩家拿第一张（最省事，也不影响对照）
    if (g.phase === 'choose') {
      if (!g.choices || !g.choices[0]) { stuck = true; break; }
      api.applyUpgrade(g.choices[0]);
      g.choices = null;
      g.phase = 'prep';
      continue;
    }

    if (g.phase === 'prep') {
      aiPrepare(g, api, policy);
      if (g.slots.filter(Boolean).length === 0) { stuck = true; break; }
      api.startBattle();
      waveStart = t;
      curWave = g.wave;
      prevPhase = 'battle';
    }

    const cb = box.takeFrame();
    if (!cb) break;
    t += DT;
    cb(t * 1000);

    if (prevPhase === 'battle' && g.phase !== 'battle') {
      waveSecs.push({ wave: curWave, sec: t - waveStart });
    }
    prevPhase = g.phase;
  }

  const units = [...new Set(g.slots.filter(Boolean))];
  return {
    win: g.phase === 'win',
    stuck,
    wave: g.wave,
    merges: g.stats.merges,
    kills: g.stats.kills,
    units: units.length,
    stars: units.length ? Math.max(...units.map((u) => u.star)) : 0,
    avgStar: units.length ? units.reduce((a, u) => a + u.star, 0) / units.length : 0,
    waveSecs,
    time: t,
  };
}

/* ---------------- 汇总 ---------------- */

const results = [];
for (let i = 0; i < RUNS; i++) {
  const r = playOne(SEED + i * 7919, POLICY);
  results.push(r);
  if (VERBOSE) {
    console.log(
      `#${i + 1} ${r.win ? 'WIN ' : r.stuck ? 'STUCK' : 'LOSE'} ` +
      `wave=${r.wave} t=${r.time.toFixed(0)}s units=${r.units} maxStar=${r.stars} ` +
      `avgStar=${r.avgStar.toFixed(1)} merges=${r.merges}`
    );
  }
}

function pct(n) { return ((n / RUNS) * 100).toFixed(1) + '%'; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

const wins = results.filter((r) => r.win).length;
const stuck = results.filter((r) => r.stuck).length;
const losses = results.length - wins - stuck;
const avgWave = mean(results.map((r) => (r.win ? r.wave : r.wave)));
const avgStar = mean(results.map((r) => r.stars));
const avgMerges = mean(results.map((r) => r.merges));
const avgUnits = mean(results.map((r) => r.units));

// 每波的耗时：把所有局里同一波的耗时收集起来
const byWave = new Map();
for (const r of results) {
  for (const w of r.waveSecs) {
    if (!byWave.has(w.wave)) byWave.set(w.wave, []);
    byWave.get(w.wave).push(w.sec);
  }
}

console.log('');
console.log(`runs=${RUNS}  policy=${POLICY}  seed=${SEED}${TUNE ? '  tune=' + TUNE : ''}`);
console.log(`通关 ${wins} (${pct(wins)})   失败 ${losses} (${pct(losses)})   卡住 ${stuck}`);
console.log(`平均结束波 ${avgWave.toFixed(1)}   平均最高星 ${avgStar.toFixed(1)}   平均合成 ${avgMerges.toFixed(1)} 次   平均场上 ${avgUnits.toFixed(1)} 人`);

const loseAt = new Map();
for (const r of results) {
  if (r.win || r.stuck) continue;
  loseAt.set(r.wave, (loseAt.get(r.wave) || 0) + 1);
}
if (loseAt.size) {
  const dist = [...loseAt.entries()].sort((a, b) => a[0] - b[0]).map(([w, n]) => `第${w}波×${n}`).join('  ');
  console.log(`失败分布：${dist}`);
}
console.log('');
console.log('每波耗时（均值 / 中位 / 样本）：');
const waves = [...byWave.keys()].sort((a, b) => a - b);
for (const w of waves) {
  const arr = byWave.get(w).slice().sort((a, b) => a - b);
  const mid = arr[Math.floor(arr.length / 2)];
  console.log(
    `  第 ${String(w).padStart(2)} 波  ${mean(arr).toFixed(1).padStart(6)}s  ` +
    `${mid.toFixed(1).padStart(6)}s  n=${arr.length}`
  );
}
if (!waves.length) console.log('  （没有完整打完的波）');
