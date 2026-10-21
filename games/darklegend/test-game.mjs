// 豆豆暗黑传奇 · 回归测试（Node + DOM 桩）
// 用法：node test-game.mjs
// 覆盖：初始化 / 回合 / 寻路 / 区域 / 时钟 / 装备 / 商店 / 死亡复活 / 存档 / 固定种子 / 战斗
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const noop = () => {};

/* ---------------- DOM 桩 ---------------- */
const gradStub = { addColorStop: noop };
const ctxStub = new Proxy({}, {
  get: (t, k) => {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradStub;
    if (k === 'createPattern') return () => gradStub;
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'getImageData') return () => ({ data: [] });
    if (k === 'canvas') return { width: 720, height: 1120 };
    if (k in t) return t[k];
    return noop;
  },
  set: (t, k, v) => { t[k] = v; return true; },
});

function makeEl() {
  const el = {
    style: {}, dataset: {}, children: [], hidden: false,
    textContent: '', innerHTML: '', value: '', disabled: false,
    width: 720, height: 1120, offsetWidth: 720, offsetHeight: 1120,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild(c) { this.children.push(c); return c; },
    removeChild: noop, addEventListener: noop, removeEventListener: noop,
    setAttribute: noop, getAttribute: () => null,
    querySelector: () => makeEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 720, height: 1120, right: 720, bottom: 1120 }),
    getContext: () => ctxStub,
    focus: noop, blur: noop, scrollIntoView: noop,
  };
  return el;
}

const elements = new Map();
const documentStub = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeEl());
    return elements.get(id);
  },
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  addEventListener: noop, removeEventListener: noop,
  hidden: false,
  body: makeEl(), documentElement: makeEl(),
};

const storage = new Map();
const localStorageStub = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => { storage.set(k, String(v)); },
  removeItem: (k) => { storage.delete(k); },
  clear: () => storage.clear(),
};

const sandbox = {
  console, document: documentStub, localStorage: localStorageStub,
  location: { search: '?debug', href: 'file:///darklegend/index.html' },
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
  setInterval: () => 0, clearInterval: noop,
  setTimeout: () => 0, clearTimeout: noop,
  addEventListener: noop, removeEventListener: noop,
  innerWidth: 720, innerHeight: 1120, devicePixelRatio: 1,
  Math, Date, JSON, Object, Array, String, Number, Boolean,
  Map, Set, Proxy, Promise, Error, RegExp,
  parseInt, parseFloat, isNaN, isFinite,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

/* ---------------- 加载游戏 ---------------- */
const code = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: 'game.js' });
} catch (err) {
  console.error('加载 game.js 失败：', err && err.stack ? err.stack : err);
  process.exit(1);
}
const dl = sandbox.window.__dl;
if (!dl) { console.error('FAIL: window.__dl 未暴露（location.search 需要 ?debug）'); process.exit(1); }

/* ---------------- 断言 ---------------- */
let pass = 0, fail = 0;
const lines = [];
function ok(name, cond, extra) {
  if (cond) { pass++; lines.push('  PASS ' + name); }
  else { fail++; lines.push('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

try {
  /* 1. 初始化 */
  const s0 = dl.state();
  ok('初始化 1 级', s0.lv === 1, s0.lv);
  ok('初始 HP 60', s0.hp === 60, s0.hp);
  ok('初始 MP 15', s0.mp === 15, s0.mp);
  ok('maxHp 与初始一致', dl.maxHp() === 60, dl.maxHp());

  /* 2. 移动推进回合 */
  const t0 = dl.state().turn;
  dl.move(1, 0);
  ok('移动推进回合', dl.state().turn > t0, [t0, dl.state().turn]);

  /* 3. 寻路 */
  const p = dl.bfs(dl.P.x, dl.P.y, dl.P.x + 2, dl.P.y);
  ok('BFS 返回数组或 null', p === null || Array.isArray(p), typeof p);

  /* 4. 区域等级 */
  ok('zoneLevel(2) = 1', dl.zoneLevel(2) === 1, dl.zoneLevel(2));
  ok('zoneLevel(46) = 10', dl.zoneLevel(46) === 10, dl.zoneLevel(46));

  /* 5. 时钟格式 */
  ok('clockText 形如 HH:MM', /^\d{2}:\d{2}$/.test(dl.clockText()), dl.clockText());

  /* 6. 装备生成与评分 */
  const eq = dl.makeEquip('weapon', 5, 'blue');
  ok('装备有 ilvl', eq && eq.ilvl === 5, eq && eq.ilvl);
  ok('装备可估价（评分派生）', eq && dl.sellPrice(eq) > 0, eq && dl.sellPrice(eq));

  /* 7. 商店 */
  dl.setGold(300);
  const goldBefore = dl.state().gold;
  const potBefore = dl.state().potions;
  dl.buy('potion');
  ok('买药扣 50 金', dl.state().gold === goldBefore - 50, [goldBefore, dl.state().gold]);
  ok('买药 +1', dl.state().potions === potBefore + 1, [potBefore, dl.state().potions]);

  /* 8. 死亡复活 */
  const lvBefore = dl.state().lv;
  dl.die();
  dl.revive();
  ok('复活保留等级', dl.state().lv === lvBefore, [lvBefore, dl.state().lv]);
  ok('复活后 HP > 0', dl.state().hp > 0, dl.state().hp);

  /* 9. 存档 */
  dl.save();
  const raw = sandbox.localStorage.getItem('darklegend-save-v2');
  ok('存档写入 v2 键', !!raw, raw ? raw.length : null);

  /* 10. 固定种子 */
  dl.setSeed(12345);
  dl.genOverworld();
  const m1 = JSON.stringify(dl.map());
  dl.genOverworld();
  const m2 = JSON.stringify(dl.map());
  ok('同种子地图一致', m1 === m2);

  dl.setSeed(99999);
  dl.genOverworld();
  const m3 = JSON.stringify(dl.map());
  ok('不同种子地图不同', m1 !== m3);

  /* 11. 战斗：造一只怪贴着玩家，攻击应扣血 */
  const enemies = dl.enemies();
  enemies.length = 0;
  const mon = {
    id: 'chicken', name: '鸡', glyph: '🐔', x: dl.P.x + 1, y: dl.P.y,
    hp: 200, maxHp: 200, atk: 5, def: 0, mdef: 0, lv: 1, aggro: 0,
    exp: 10, gold: 3, boss: false, elite: false,
  };
  enemies.push(mon);
  dl.setPos(dl.P.x, dl.P.y);
  dl.attack(1, '普攻');
  ok('攻击使怪物掉血', mon.hp < 200, mon.hp);

  /* 12. 技能 MP 与 CD */
  dl.rest();
  const mp0 = dl.state().mp;
  const cd0 = dl.state().cd;
  dl.halfMoon();
  ok('半月消耗 MP', dl.state().mp < mp0, [mp0, dl.state().mp]);
  ok('半月进入 CD', (dl.state().cd.half || 0) > 0, dl.state().cd);

  /* 13. 自动回合可暂停 */
  dl.pauseAuto();
  const turnA = dl.state().turn;
  dl.tick();
  ok('暂停后 tick 不推进', dl.state().turn === turnA, [turnA, dl.state().turn]);
} catch (err) {
  fail++;
  lines.push('  FAIL 异常：' + (err && err.stack ? err.stack.split('\n')[0] : err));
}

console.log(lines.join('\n'));
console.log('');
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
