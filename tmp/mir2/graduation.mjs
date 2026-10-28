import fs from 'node:fs';
const lines = fs.readFileSync('tmp/mir2/Exps.conf', 'utf8').split(/\r?\n/);
const exp = {};
for (const l of lines) {
  const m = l.match(/^Level(\d+)=(\d+)$/);
  if (m) exp[+m[1]] = +m[2];
}
const sum = (a, b) => { let s = 0; for (let i = a; i <= b; i++) s += exp[i] || 0; return s; };
console.log('1->29', sum(1, 29));
console.log('1->39', sum(1, 39));
console.log('1->44', sum(1, 44));
console.log('1->49', sum(1, 49));

const warr = (lv) => ({
  hp: 14 + Math.round((lv / 4 + 4.5 + lv / 20) * lv),
  dcMin: Math.max(Math.floor(lv / 5) - 1, 1),
  dcMax: Math.max(1, Math.floor(lv / 5)),
  acMax: Math.floor(lv / 7),
});
for (const lv of [30, 40, 45]) console.log('mir lv', lv, warr(lv));

// Mir graduation weapon: 屠龙 5-35 (need 34)
const wMean = (5 + 35) / 2;
for (const lv of [40, 45]) {
  const b = warr(lv);
  const dcMean = (b.dcMin + b.dcMax) / 2;
  console.log(`lv${lv} gear share`, (wMean / (wMean + dcMean) * 100).toFixed(0) + '%');
}

// our hits at 1.13
const ourAtk = (lv) => 5 + 1.5 * (lv - 1) + (4 + 0.2 * lv + 8 + 0.4 * lv) / 2;
const ourDef = (lv) => 2 * Math.pow(1.075, lv);
for (const k of [1.12, 1.13, 1.14]) {
  const hp = 18 * Math.pow(k, 30);
  console.log(`our 1.${String(k).split('.')[1]} hp30`, hp.toFixed(0), 'hits', (hp / (ourAtk(30) - ourDef(30))).toFixed(1));
}
