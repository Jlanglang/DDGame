/* 豆豆单词塔 · 无渲染模拟器（假 DOM + 固定步长，不参与交付）
   用法：
     node games/wordtower/headless.js --runs 40
     node games/wordtower/headless.js --runs 40 --acc 0.75        # 拼词正确率
     node games/wordtower/headless.js --runs 40 --bal "{\"hpGrowth\":1.2}"
   指标：一把时长、胜率、升级次数、拿到卡数。
   从 D:\DP\.tools\headless-word.js 搬来：目录改成 __dirname，不用再猜 DDGame 在哪。 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = process.env.WT_DIR || __dirname;   // 本文件就在游戏目录里

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const RUNS = Number(arg('runs', 40));
const ACC = Number(arg('acc', 0.75));
const BAL = arg('bal', null);
const VERBOSE = process.argv.includes('--verbose');
const DT = 1000 / 60;
const MAXT = Number(arg('max', 600));

/* ---------------- 假 DOM ---------------- */

function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {};
  return new Proxy(base, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const noop = () => {};

function makeEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    hidden: false,
    textContent: '',
    innerHTML: '',
    children: [],
    width: 0,
    height: 0,
    addEventListener: noop,
    removeEventListener: noop,
    setAttribute: noop,
    getAttribute: () => null,
    appendChild(c) { this.children.push(c); return c; },
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 450, height: 1000 }),
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
      if (!els.has(id)) els.set(id, makeEl('div'));
      return els.get(id);
    },
    createElement: (tag) => makeEl(tag),
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
  };

  const sandbox = {
    console, Math: M, Date, JSON, Object, Array, Number, String, Boolean,
    Error, Set, Map, URLSearchParams, Intl,
    location: { search: '?debug=1' },
    document,
    window,
    requestAnimationFrame(cb) { frameCb = cb; return 1; },
    performance: { now: () => 0 },
    setTimeout,
  };
  sandbox.__BALANCE = BAL ? JSON.parse(BAL) : undefined;

  return { sandbox, getFrame: () => frameCb };
}

/* ---------------- 跑一局 ---------------- */

function run(seed) {
  const { sandbox, getFrame } = makeSandbox(seed);
  const src =
    'window = window || {};\n' +
    fs.readFileSync(path.join(DIR, 'words.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(DIR, 'game.js'), 'utf8');

  // 无头跑不需要画：把 render 调用摘掉
  const patched = src
    .replace('\n    render();\n    requestAnimationFrame(frame);', '\n    requestAnimationFrame(frame);');

  vm.runInNewContext(patched, sandbox, { filename: 'wordtower.js' });

  const g = sandbox.window.__g;
  const api = sandbox.window.__api;
  if (!g || !api) throw new Error('没有 __g / __api（debug 没开？）');

  const frame = getFrame();
  if (g.state === 'home' && api.startBattle) api.startBattle();

  // 玩家模型：每个单词掷一次"认不认识"；认识就挑认识的卡，不认识就瞎猜一个字母
  // 用局内种子单独起一个随机源，保证同一配置跑出来的结果可复现（方便 A/B）
  let ps = (seed ^ 0x9e3779b9) >>> 0;
  const prand = () => {
    ps = (ps * 1664525 + 1013904223) >>> 0;
    return ps / 4294967296;
  };
  const knows = new Map();
  const knowsWord = (w) => {
    if (!knows.has(w)) knows.set(w, prand() < ACC);
    return knows.get(w);
  };
  const rndPick = (a) => a[Math.floor(prand() * a.length)];

  let t = 0;
  let frames = 0;
  let maxAlive = 0;
  const marks = [];

  while (g.state === 'playing' && t < MAXT) {
    if (!marks.length || marks[marks.length - 1].wave !== g.wave) {
      marks.push({ wave: g.wave, t: +t.toFixed(1) });
    }

    if (g.cards.open) {
      if (g.cards.picked < 0) {
        const alive = g.cards.options.map((o, i) => ({ o, i })).filter((x) => !x.o.dead);
        const known = alive.filter((x) => knowsWord(x.o.word));
        const target = rndPick(known.length ? known : alive);
        if (target) api.pickCard(target.i);
      } else if (g.cards.hold <= 0) {
        const opt = g.cards.options[g.cards.picked];
        if (opt && !opt.dead) {
          api.answerLetter(knowsWord(opt.word) ? opt.correct : rndPick(opt.letters));
        } else if (opt && opt.dead) {
          // 答错了：面板等玩家点「继续」
          api.closeCards();
        }
      }
    }

    frame(t * 1000);
    t += DT / 1000;
    frames += 1;
    if (g.enemies.length > maxAlive) maxAlive = g.enemies.length;
    if (frames > 90000) break;
  }

  return {
    result: g.result,
    t: +t.toFixed(1),
    wave: g.wave,
    hp: g.hp,
    level: g.level,
    kills: g.kills,
    solved: g.cards.solved,
    lost: g.cards.lost,
    marks,
    maxAlive,
  };
}

/* ---------------- main ---------------- */

const rows = [];
for (let i = 0; i < RUNS; i++) {
  rows.push(run(20261020 + i * 7919));
}

const avg = (k) => +(rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(1);
const wins = rows.filter((r) => r.result === 'win');
const loses = rows.filter((r) => r.result === 'lose');

if (VERBOSE) {
  for (const r of rows) {
    console.log(`${r.result} t=${r.t} wave=${r.wave} Lv=${r.level} hp=${r.hp} solved=${r.solved} lost=${r.lost}`);
    console.log('  marks=' + r.marks.map((m) => `${m.wave}@${m.t}`).join(' '));
  }
}

console.log(JSON.stringify({
  runs: RUNS,
  acc: ACC,
  wins: wins.length,
  winRate: +((wins.length / rows.length) * 100).toFixed(1),
  avgT: avg('t'),
  winT: wins.length ? +((wins.reduce((s, r) => s + r.t, 0) / wins.length)).toFixed(1) : 0,
  loseT: loses.length ? +((loses.reduce((s, r) => s + r.t, 0) / loses.length)).toFixed(1) : 0,
  avgWave: avg('wave'),
  maxWave: Math.max(...rows.map((r) => r.wave)),
  medWave: rows.map((r) => r.wave).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
  avgLevel: avg('level'),
  avgSolved: avg('solved'),
  avgLost: avg('lost'),
  avgPeakAlive: avg('maxAlive'),
  peakAlive: Math.max(...rows.map((r) => r.maxAlive || 0)),
  timeout: rows.filter((r) => !r.result).length,
}, null, 2));
