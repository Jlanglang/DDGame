/* 每波用时统计：node wave-time.js [runs] [policy] ["bal json"]
   解析 headless 的 marks，输出每波平均耗时（波次间隔，含休息）。 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const RUNS = Number(process.argv[2] || 8);
const POLICY = process.argv[3] || 'feed';
const BAL = process.argv[4] || '{}';
const HEADLESS = path.join(__dirname, 'headless.js');

const out = execFileSync(
  process.execPath,
  [HEADLESS, '--runs', String(RUNS), '--policy', POLICY, '--bal', BAL, '--verbose'],
  { encoding: 'utf8' }
);

const runs = [];
let cur = null;
for (const line of out.split('\n')) {
  if (line.startsWith('#')) {
    const m = line.match(/t=([\d.]+)/);
    cur = { t: m ? Number(m[1]) : 0, marks: [] };
    runs.push(cur);
  } else if (line.trim().startsWith('marks=') && cur) {
    cur.marks = line.trim().slice(6).split(/\s+/).filter(Boolean).map((p) => {
      const [w, t] = p.split('@');
      return { wave: Number(w), t: Number(t) };
    });
  }
}

const sums = new Map();
for (const r of runs) {
  for (let i = 0; i < r.marks.length; i++) {
    const a = r.marks[i];
    const b = r.marks[i + 1];
    const dur = (b ? b.t : r.t) - a.t;
    if (!sums.has(a.wave)) sums.set(a.wave, []);
    sums.get(a.wave).push(dur);
  }
}

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const keys = [...sums.keys()].sort((x, y) => x - y);
const total = avgsafe(runs.map((r) => r.t));
function avgsafe(a) { return +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1); }

console.log(`runs=${RUNS} policy=${POLICY} bal=${BAL}`);
let acc = 0;
for (const k of keys) {
  const a = sums.get(k);
  const m = avg(a);
  acc += m;
  console.log(`  ${String(k === 11 ? 'BOSS' : 'w' + k).padEnd(5)} 平均 ${m.toFixed(1)}s  (样本 ${a.length})`);
}
console.log(`  合计 ≈ ${acc.toFixed(1)}s   平均一把 ${total}s`);
