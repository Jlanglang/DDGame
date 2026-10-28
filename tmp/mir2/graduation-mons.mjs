import fs from 'node:fs';
const SQL = fs.readFileSync('tmp/mir2/mir2_data.sql', 'utf8');
function splitVals(s) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "'" && s[i + 1] === "'") { cur += "'"; i++; continue; }
      if (c === "'") { q = false; continue; }
      cur += c;
    } else if (c === "'") q = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}
const rows = [];
for (const m of SQL.matchAll(/INSERT INTO `monsters` VALUES \((.*)\);/g)) {
  const v = splitVals(m[1]);
  const r = { name: v[1], lv: +v[5], exp: +v[8], hp: +v[9], ac: +v[11], mac: +v[12], dc: +v[13], dcmax: +v[14] };
  if (r.hp > 0 && r.exp > 0) rows.push(r);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const [a, b] of [[28, 32], [38, 42], [43, 47]]) {
  const band = rows.filter((r) => r.lv >= a && r.lv <= b);
  console.log(`Lv${a}-${b}: n=${band.length} HP=${med(band.map((r) => r.hp))} AC=${med(band.map((r) => r.ac))} Exp=${med(band.map((r) => r.exp))}`);
}
