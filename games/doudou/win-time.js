/* 分胜负看时长：node win-time.js [runs] [policy] ["bal json"] */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const RUNS = Number(process.argv[2] || 30);
const POLICY = process.argv[3] || 'feed';
const BAL = process.argv[4] || '{}';
const HEADLESS = path.join(__dirname, 'headless.js');

const out = execFileSync(
  process.execPath,
  [HEADLESS, '--runs', String(RUNS), '--policy', POLICY, '--bal', BAL, '--verbose'],
  { encoding: 'utf8' }
);

const rows = [];
for (const line of out.split('\n')) {
  const m = line.match(/^#\d+ \w+\/(\w+) t=([\d.]+) w=(\d+)/);
  if (m) rows.push({ result: m[1], t: Number(m[2]), wave: Number(m[3]) });
}

const pick = (r) => rows.filter((x) => x.result === r);
const avg = (a, k) => (a.length ? +(a.reduce((s, v) => s + v[k], 0) / a.length).toFixed(1) : 0);
const med = (a, k) => {
  const s = a.map((v) => v[k]).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const w = pick('win');
const l = pick('lose');
console.log(`${BAL}`);
console.log(`  胜利 ${w.length}/${rows.length}：「一把」平均 ${avg(w, 't')}s 中位 ${med(w, 't')}s  到第 ${avg(w, 'wave')} 波`);
console.log(`  失败 ${l.length}/${rows.length}：平均 ${avg(l, 't')}s 中位 ${med(l, 't')}s  到第 ${avg(l, 'wave')} 波`);
console.log(`  全部平均 ${avg(rows, 't')}s`);
