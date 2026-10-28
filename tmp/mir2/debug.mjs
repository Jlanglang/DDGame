import fs from 'node:fs';
const SQL = fs.readFileSync('tmp/mir2/mir2_data.sql', 'utf8');
function colsOf(t) {
  const re = new RegExp('CREATE TABLE `' + t + '`\\s*\\(([\\s\\S]*?)\\)\\s*ENGINE');
  const b = SQL.match(re)[1];
  return [...b.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}
function splitVals(s) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "'" && s[i + 1] === "'") { cur += "'"; i++; continue; }
      if (c === "'") { q = false; continue; }
      cur += c;
    } else if (c === "'") q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function rowsOf(t) {
  const cols = colsOf(t);
  const re = new RegExp('INSERT INTO `' + t + '` VALUES \\((.*)\\);', 'g');
  const rows = [];
  let m;
  while ((m = re.exec(SQL))) {
    const v = splitVals(m[1]);
    const o = {};
    cols.forEach((c, i) => { o[c] = v[i]; });
    rows.push(o);
  }
  return rows;
}
console.log('monster cols', colsOf('monsters'));
console.log('item cols', colsOf('stditems'));
const mon = rowsOf('monsters');
const items = rowsOf('stditems');
console.log('mon', mon.length, JSON.stringify(mon[0]));
console.log('items', items.length, JSON.stringify(items[0]));
console.log('names', items.slice(0, 6).map((i) => i.Name));
console.log('find chick', mon.filter((m) => m.Name === '鸡').length);
console.log('find sword', items.filter((i) => i.Name === '木剑').length);
