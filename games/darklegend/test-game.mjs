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
const dataCode = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
const coreCode = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
const worldCode = fs.readFileSync(path.join(ROOT, 'world.js'), 'utf8');
const combatCode = fs.readFileSync(path.join(ROOT, 'combat.js'), 'utf8');
const statusCode = fs.readFileSync(path.join(ROOT, 'status.js'), 'utf8');
vm.createContext(sandbox);
try {
  vm.runInContext(dataCode, sandbox, { filename: 'data.js' });
  vm.runInContext(coreCode, sandbox, { filename: 'core.js' });
  vm.runInContext(worldCode, sandbox, { filename: 'world.js' });
  vm.runInContext(combatCode, sandbox, { filename: 'combat.js' });
  vm.runInContext(statusCode, sandbox, { filename: 'status.js' });
  vm.runInContext(code, sandbox, { filename: 'game.js' });
} catch (err) {
  console.error('加载游戏脚本失败：', err && err.stack ? err.stack : err);
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
  ok('买药扣 25 金', dl.state().gold === goldBefore - 25, [goldBefore, dl.state().gold]);
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

  /* 10. 主城固定 + 房间按种子 */
  dl.setSeed(12345);
  dl.genHub();
  const h1 = JSON.stringify(dl.map());
  dl.setSeed(99999);
  dl.genHub();
  const h2 = JSON.stringify(dl.map());
  ok('主城布局固定（不随种子变）', h1 === h2);

  dl.setSeed(12345);
  dl.enterRoom('field1');
  const r1 = JSON.stringify(dl.map());
  dl.enterRoom('field1');
  const r2 = JSON.stringify(dl.map());
  ok('同种子同一房间布局一致', r1 === r2);

  dl.enterRoom('field2');
  const r3 = JSON.stringify(dl.map());
  ok('不同房间布局不同', r1 !== r3);
  ok('进房间后 currentRoom 正确', dl.state().room === 'field2', dl.state().room);

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

  /* 12. 技能 MP 与 CD（先学会半月） */
  dl.P.skills.half = true;
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

  /* 14. 新手兜底：鸡啄不动你（无伤），稻草人打得动 */
  const MONs = sandbox.window.DL.DATA.MON;
  dl.genHub();
  dl.P.lv = 1;
  dl.rest();
  const es0 = dl.enemies();
  es0.length = 0;
  const chick0 = dl.makeEnemy(MONs.find((m) => m.id === 'chicken'), 'normal');
  chick0.x = dl.P.x + 1;
  chick0.y = dl.P.y;
  es0.push(chick0);
  const hpChick0 = dl.state().hp;
  for (let i = 0; i < 10; i++) dl.after();
  ok('鸡打玩家 0 伤害（新手兜底）', dl.state().hp === hpChick0, [hpChick0, dl.state().hp]);

  es0.length = 0;
  dl.rest();
  const scare0 = dl.makeEnemy(MONs.find((m) => m.id === 'scarecrow'), 'normal');
  scare0.x = dl.P.x + 1;
  scare0.y = dl.P.y;
  es0.push(scare0);
  const hpScare0 = dl.state().hp;
  for (let i = 0; i < 2; i++) dl.after();
  ok('稻草人打得动 1 级玩家', dl.state().hp < hpScare0, [hpScare0, dl.state().hp]);
  es0.length = 0;
  dl.rest();

  /* 15. 数值体检：Lv.8 白护甲底材应 ≥ 6 防 */
  let minDef8 = Infinity;
  for (let i = 0; i < 50; i++) {
    const a = dl.makeEquip('armor', 8, 'white');
    minDef8 = Math.min(minDef8, a.defMax);
  }
  ok('Lv.8 白护甲上限 ≥ 6 防', minDef8 >= 6, minDef8);

  /* 16. 战斗规则纯函数 */
  const C = sandbox.window.DL.Combat;
  ok('半月覆盖 5 格', C.halfMoonCells(5, 5, 'r').length === 5, C.halfMoonCells(5, 5, 'r').length);
  ok('普攻伤害最低 1', C.playerDamage(1, 1, 9999, 1) >= 1, C.playerDamage(1, 1, 9999, 1));
  ok('防秒杀上限：普通 ≤35% maxHP', C.enemyDamage(9999, 0, 0, 100, false) <= 35, C.enemyDamage(9999, 0, 0, 100, false));
  ok('防秒杀上限：Boss ≤50% maxHP', C.enemyDamage(9999, 0, 0, 100, true) <= 50, C.enemyDamage(9999, 0, 0, 100, true));
  ok('低 5 级怪不主动', C.decide({ lv: 1, boss: false, aggroOn: false, aggro: 5 }, 10, 3) === 'idle');
  ok('Boss 相邻必攻击', C.decide({ lv: 1, boss: true, aggroOn: false, aggro: 5 }, 10, 1) === 'attack');

  /* 17. 相机夹取：地图大时贴边、地图小时让视野溢出去 */
  ok('相机：地图大于视野时夹到边界', dl.camTarget(-100, 768, 720) === 0, dl.camTarget(-100, 768, 720));
  ok('相机：地图小于视野时允许负值', dl.camTarget(-200, 640, 720) === -80, dl.camTarget(-200, 640, 720));
  ok('相机：视野内原样返回', dl.camTarget(24, 768, 720) === 24, dl.camTarget(24, 768, 720));

  /* 18. 自动回合：pauseAuto 后必须能 resumeAuto，否则自动攻击永久停摆 */
  dl.pauseAuto();
  ok('pauseAuto 后自动战斗关闭', dl.autoEnabled() === false, dl.autoEnabled());
  dl.resumeAuto();
  ok('resumeAuto 后自动战斗恢复', dl.autoEnabled() === true, dl.autoEnabled());

  /* 19. 技能书：初始只有普攻，半月/烈火要靠技能书 */
  dl.genHub();
  dl.P.skills.half = false;
  dl.P.skills.fire = false;
  ok('初始未学半月', dl.state().skills.half === false, dl.state().skills);
  ok('初始未学烈火', dl.state().skills.fire === false, dl.state().skills);
  dl.rest();
  const mpBefore = dl.state().mp;
  ok('未学半月不可释放', dl.halfMoon() === false);
  ok('未学半月不耗 MP', dl.state().mp === mpBefore, [mpBefore, dl.state().mp]);

  dl.P.skills.half = true;
  dl.P.cd.half = 0;
  dl.rest();
  ok('学会后可释放半月', dl.halfMoon() === true);

  /* 20. 怪物：1 级鸡 / 2 级鸡(精英) / 3 级鸡(稀有) */
  const DATA = sandbox.window.DL.DATA;
  const chicken = DATA.MON.find((m) => m.id === 'chicken');
  const n = dl.makeEnemy(chicken, 'normal');
  const e = dl.makeEnemy(chicken, 'elite');
  const r = dl.makeEnemy(chicken, 'rare');
  ok('鸡普通 Lv1', n.lv === 1 && n.name === '鸡', [n.lv, n.name]);
  ok('鸡精英 Lv2', e.lv === 2 && e.name.includes('精英'), [e.lv, e.name]);
  ok('鸡稀有 Lv3', r.lv === 3 && r.name.includes('稀有'), [r.lv, r.name]);
  ok('稀有血量 > 精英 > 普通', r.hp > e.hp && e.hp > n.hp, [n.hp, e.hp, r.hp]);
  ok('图 1 共 4 种怪 + BOSS Lv10', DATA.MON.length === 4 && DATA.BOSS.lv === 10, [DATA.MON.length, DATA.BOSS.lv]);

  let rareHit = 0;
  for (let i = 0; i < 4000; i++) if (dl.rollGrade() === 'rare') rareHit++;
  ok('稀有空率约 1%', rareHit > 15 && rareHit < 85, rareHit);

  /* 21. 碾压：只对普通怪；精英/稀有/BOSS 不吃碾压 */
  ok('前期差 10 级碾压普通怪', dl.isCrush(11, 1, false) === true);
  ok('前期差 9 级不碾压', dl.isCrush(10, 1, false) === false);
  ok('30 级后差 5 级碾压普通怪', dl.isCrush(35, 30, false) === true);
  ok('30 级后差 4 级不碾压', dl.isCrush(34, 30, false) === false);
  ok('BOSS 不吃碾压', dl.isCrush(60, 10, true) === false);
  ok('精英/稀有不吃碾压', dl.isCrush(60, 10, true) === false && dl.isCrush(60, 5, true) === false);

  /* 22. 主城缓慢回血；房间里不回 */
  dl.genHub();
  dl.setHp(10);
  ok('主城回血生效', dl.hubRegen() === true && dl.state().hp > 10, dl.state().hp);
  dl.enterRoom('field1');
  dl.setHp(10);
  ok('房间里不回血', dl.hubRegen() === false && dl.state().hp === 10, dl.state().hp);

  /* 20. 装备品级：生成时就定好、界面直接显示（没有"未鉴定"这回事） */
  dl.P.bag = [];
  dl.P.weapon = null;
  const eqO = dl.makeEquip('weapon', 5, 'orange');
  ok('装备带着品级', eqO.rarity === 'orange', eqO.rarity);
  ok('装备没有未鉴定标记', eqO.identified === undefined, eqO.identified);
  dl.addToBag(eqO);
  ok('好装备直接穿上', dl.state().weapon === eqO || dl.P.bag.includes(eqO));

  /* ============ M1.18：状态系统（R5） ============ */
  const SS = sandbox.window.DL.Status;
  ok('毒：道术 100 → 每跳 50', SS.damageFrom('poison', 100) === 50, SS.damageFrom('poison', 100));
  ok('灼烧：攻击 200 → 每跳 30', SS.damageFrom('burn', 200) === 30, SS.damageFrom('burn', 200));

  const d1 = { hp: 500, maxHp: 500, statuses: {} };
  const ps1 = SS.apply(d1, 'poison', { turn: 1, turns: 5, stat: 100 });
  ok('中毒持续 5 回合', ps1.left === 5 && SS.has(d1, 'poison'), ps1.left);
  const tp1 = SS.tick(d1, 1);
  ok('施加当回合不结算', tp1.hits.length === 0 && d1.hp === 500, [tp1.hits.length, d1.hp]);
  const tp2 = SS.tick(d1, 2);
  ok('下回合毒跳 50', tp2.hits.length === 1 && tp2.hits[0].dmg === 50 && d1.hp === 450, [tp2.hits[0] && tp2.hits[0].dmg, d1.hp]);
  ok('毒剩 4 回合', d1.statuses.poison.left === 4, d1.statuses.poison.left);
  SS.apply(d1, 'poison', { turn: 3, turns: 5, stat: 100 });
  ok('毒不叠层，只刷新时间', d1.statuses.poison.stacks === 1 && d1.statuses.poison.left === 5,
    [d1.statuses.poison.stacks, d1.statuses.poison.left]);

  const d2 = { hp: 900, maxHp: 900, statuses: {} };
  SS.apply(d2, 'burn', { turn: 1, dmg: 30 });
  SS.apply(d2, 'burn', { turn: 2, dmg: 30 });
  ok('灼烧可叠 2 层', d2.statuses.burn.stacks === 2, d2.statuses.burn.stacks);
  const tb1 = SS.tick(d2, 3);
  ok('灼烧 2 层 = 60', tb1.hits[0].dmg === 60 && d2.hp === 840, [tb1.hits[0].dmg, d2.hp]);
  SS.apply(d2, 'burn', { turn: 4, dmg: 30 });
  SS.apply(d2, 'burn', { turn: 4, dmg: 30 });
  ok('灼烧层数上限 3', d2.statuses.burn.stacks === 3, d2.statuses.burn.stacks);

  const d3 = { hp: 500, maxHp: 500, statuses: {} };
  SS.apply(d3, 'burn', { turn: 0, dmg: 30 });
  SS.apply(d3, 'poison', { turn: 0, dmg: 50 });
  const t3 = SS.tick(d3, 1);
  ok('结算顺序先毒后灼烧', t3.hits[0].key === 'poison' && t3.hits[1].key === 'burn', t3.hits.map((h) => h.key));

  const d4 = { hp: 500, maxHp: 500, statuses: {} };
  SS.apply(d4, 'burn', { turn: 0, turns: 1, dmg: 10 });
  SS.tick(d4, 1);
  ok('到期那次照常结算', d4.hp === 490, d4.hp);
  ok('到期后自动移除', !SS.has(d4, 'burn'), Object.keys(d4.statuses));

  const d5 = { hp: 100, maxHp: 100, statuses: {} };
  ok('无状态可行动', SS.canAct(d5) === true);
  SS.apply(d5, 'stun', { turn: 1, turns: 1 });
  ok('眩晕不能行动', SS.canAct(d5) === false);
  SS.tick(d5, 2);
  ok('眩晕 1 回合后解除', SS.canAct(d5) === true, d5.statuses);
  SS.apply(d5, 'paralyze', { turn: 3, turns: 2 });
  SS.tick(d5, 4);
  ok('麻痹第 1 回合后仍在', SS.canAct(d5) === false && SS.has(d5, 'paralyze'), d5.statuses);
  SS.tick(d5, 5);
  ok('麻痹第 2 回合后解除', SS.canAct(d5) === true, d5.statuses);

  const d6 = { hp: 100, maxHp: 100, statuses: {} };
  SS.apply(d6, 'stun', { turn: 1, turns: 1 });
  ok('眩晕受击解除', SS.onHit(d6) === 'stun' && SS.canAct(d6) === true);

  const d7 = { hp: 100, maxHp: 100, statuses: {} };
  SS.apply(d7, 'poison', { turn: 1, turns: 5, dmg: 10 });
  SS.apply(d7, 'burn', { turn: 1, turns: 1, dmg: 10 });
  const lst = SS.list(d7);
  ok('状态列表带符号', lst.length === 2 && lst[0].sym === '☠', lst.map((s) => s.sym));
  ok('剩余 ≤2 回合闪烁', lst.find((s) => s.key === 'burn').blink === true);
  ok('状态文本 ☠5 🔥1', SS.text(d7) === '☠5 🔥1', SS.text(d7));
  SS.clear(d7);
  ok('clear 清空状态', SS.list(d7).length === 0);

  /* ============ 烈火点燃 → 回合末掉血 ============ */
  dl.genHub();
  dl.P.skills.fire = true;
  dl.P.cd.fire = 0;
  dl.rest();
  const esB = dl.enemies();
  esB.length = 0;
  const burnTarget = dl.makeEnemy(DATA.MON.find((m) => m.id === 'chicken'), 'normal');
  burnTarget.hp = 5000;
  burnTarget.maxHp = 5000;
  burnTarget.x = dl.P.x + 1;
  burnTarget.y = dl.P.y;
  esB.push(burnTarget);
  ok('烈火命中', dl.fireSword() === true);
  ok('怪被点燃', SS.has(burnTarget, 'burn'), Object.keys(burnTarget.statuses));
  const hpB0 = burnTarget.hp;
  dl.after();
  ok('施加当回合不烧', burnTarget.hp === hpB0, [hpB0, burnTarget.hp]);
  dl.after();
  ok('下一回合灼烧掉血', burnTarget.hp < hpB0, [hpB0, burnTarget.hp]);
  ok('灼烧剩 2 回合', (burnTarget.statuses.burn || {}).left === 2, burnTarget.statuses);

  /* ============ BOSS 出招：眩晕 / 麻痹 ============ */
  dl.genHub();
  const esC = dl.enemies();
  esC.length = 0;
  const bigBoss = dl.makeEnemy(DATA.BOSS, 'boss');
  bigBoss.x = dl.P.x + 1;
  bigBoss.y = dl.P.y;
  esC.push(bigBoss);
  let sawStun = false, sawPara = false;
  for (let i = 0; i < 500 && !(sawStun && sawPara); i++) {
    SS.clear(dl.P);
    dl.setHp(dl.maxHp());
    dl.enemiesTurn();
    if (SS.has(dl.P, 'stun')) sawStun = true;
    if (SS.has(dl.P, 'paralyze')) sawPara = true;
  }
  ok('BOSS 能眩晕玩家', sawStun);
  ok('BOSS 能麻痹玩家', sawPara);
  SS.clear(dl.P);

  /* ============ 玩家被控时走不动，但照样推进一回合 ============ */
  dl.genHub();
  dl.enemies().length = 0;
  SS.apply(dl.P, 'paralyze', { turn: dl.state().turn, turns: 2 });
  const turnP = dl.state().turn;
  const px0 = dl.P.x, py0 = dl.P.y;
  const movedP = dl.move(0, 1);
  ok('麻痹时走不动', movedP === false && dl.P.x === px0 && dl.P.y === py0, [movedP, dl.P.x, dl.P.y]);
  ok('麻痹时仍推进回合', dl.state().turn > turnP, [turnP, dl.state().turn]);
  SS.clear(dl.P);

  /* ============ 怪物 AI 两档（R14.6） ============ */
  const C2 = sandbox.window.DL.Combat;
  const monOf = (id) => DATA.MON.find((m) => m.id === id);
  ok('鸡是被动怪', monOf('chicken').ai === 'passive', monOf('chicken').ai);
  ok('稻草人被动、野狗野猪主动',
    monOf('scarecrow').ai === 'passive' && monOf('dog').ai === 'active' && monOf('boar').ai === 'active');
  ok('BOSS 是主动怪', DATA.BOSS.ai === 'active', DATA.BOSS.ai);
  ok('被动怪不主动追', C2.decide({ lv: 5, boss: false, aggroOn: false, aggro: 0, ai: 'passive' }, 10, 3) === 'idle',
    C2.decide({ lv: 5, boss: false, aggroOn: false, aggro: 0, ai: 'passive' }, 10, 3));
  ok('主动怪进半径就追', C2.decide({ lv: 5, boss: false, aggroOn: false, aggro: 5, ai: 'active' }, 10, 4) === 'chase');
  ok('被动怪挨打后会还手', C2.decide({ lv: 5, boss: false, aggroOn: true, aggro: 0, ai: 'passive' }, 10, 2) === 'chase');
  ok('被动怪追 3 格就放弃', C2.decide({ lv: 5, boss: false, aggroOn: true, aggro: 0, ai: 'passive' }, 10, 4) === 'giveup');
  const madeChicken = dl.makeEnemy(monOf('chicken'), 'normal');
  ok('makeEnemy 带上 ai 和 statuses',
    madeChicken.ai === 'passive' && !!madeChicken.statuses, [madeChicken.ai, !!madeChicken.statuses]);

  /* ============ 门与怪池：一道门一种怪 ============ */
  const ROOMS = DATA.ROOMS;
  const poolIds = (r) => (r.pool || []).slice().sort().join(',');
  ok('门 1：鸡 + 稻草人', poolIds(ROOMS[0]) === 'chicken,scarecrow', poolIds(ROOMS[0]));
  ok('门 2：稻草人 + 野狗', poolIds(ROOMS[1]) === 'dog,scarecrow', poolIds(ROOMS[1]));
  ok('门 3：野猪 + 首领', poolIds(ROOMS[2]) === 'boar' && ROOMS[2].boss === true, [poolIds(ROOMS[2]), ROOMS[2].boss]);

  dl.setSeed(2468);
  dl.enterRoom('field1');
  const f1 = dl.enemies();
  ok('门 1 只刷鸡/稻草人', f1.length > 0 && f1.every((e) => e.id === 'chicken' || e.id === 'scarecrow'),
    f1.map((e) => e.id).join(','));
  dl.enterRoom('field2');
  const f2 = dl.enemies();
  ok('门 2 只刷稻草人/野狗', f2.length > 0 && f2.every((e) => e.id === 'scarecrow' || e.id === 'dog'),
    f2.map((e) => e.id).join(','));
  ok('门 2 有野狗', f2.some((e) => e.id === 'dog'), f2.map((e) => e.id).join(','));
  dl.enterRoom('cave1');
  const f3 = dl.enemies();
  ok('门 3 是野猪 + 首领', f3.some((e) => e.id === 'boar') && f3.some((e) => e.boss),
    f3.map((e) => e.id).join(','));

  /* ============ 等级差经验（R2.2c）：能刷鸡到 5 级，之后白打 ============ */
  const Core = sandbox.window.DL.Core;
  const chickMon = DATA.MON.find((m) => m.id === 'chicken');
  ok('高 3 级内经验全额', Core.expMulByGap(3) === 1, Core.expMulByGap(3));
  ok('高 4 级起 0 经验', Core.expMulByGap(4) === 0 && Core.expMulByGap(9) === 0,
    [Core.expMulByGap(4), Core.expMulByGap(9)]);
  ok('越级打怪不给额外经验', Core.expMulByGap(-10) === 1, Core.expMulByGap(-10));

  const killChickenAt = (lv) => {
    dl.genHub();
    dl.P.lv = lv;
    dl.P.exp = 0;
    const es = dl.enemies();
    es.length = 0;
    const c = dl.makeEnemy(chickMon, 'normal');
    c.hp = 1;
    c.x = dl.P.x + 1;
    c.y = dl.P.y;
    es.push(c);
    dl.attack(1, '普攻');
    return dl.state().exp;
  };
  ok('1 级打鸡 10 经验', killChickenAt(1) === 10, killChickenAt(1));
  ok('4 级打鸡还是 10 经验', killChickenAt(4) === 10, killChickenAt(4));
  ok('5 级打鸡 0 经验（刷鸡到头）', killChickenAt(5) === 0, killChickenAt(5));
  ok('8 级打鸡 0 经验', killChickenAt(8) === 0, killChickenAt(8));

  /* ============ 鸡的金币：不超 5、不是必掉 ============ */
  let gMax = 0, gMin = 999;
  for (let i = 0; i < 300; i++) {
    const c = dl.makeEnemy(chickMon, 'normal');
    gMax = Math.max(gMax, c.gold);
    gMin = Math.min(gMin, c.gold);
  }
  ok('鸡的金币 1–5', gMin >= 1 && gMax <= 5, [gMin, gMax]);
  ok('鸡的金币不是必掉', chickMon.goldP < 1 && chickMon.goldP > 0, chickMon.goldP);
  ok('别的怪金币照旧必掉', dl.makeEnemy(DATA.MON.find((m) => m.id === 'scarecrow'), 'normal').goldP === 1);

  let gotGold = 0;
  for (let i = 0; i < 40; i++) {
    dl.genHub();
    dl.P.lv = 1;
    dl.P.gold = 0;
    const es = dl.enemies();
    es.length = 0;
    const c = dl.makeEnemy(chickMon, 'normal');
    c.hp = 1;
    c.x = dl.P.x + 1;
    c.y = dl.P.y;
    es.push(c);
    dl.attack(1, '普攻');
    if (dl.P.gold > 0) gotGold++;
  }
  ok('40 只鸡里有空手的时候', gotGold > 8 && gotGold < 40, gotGold);

  /* ============ 品级可见：C/B/A/S 字母 + 怪物品级颜色 ============ */
  ok('稀有度带字母 C/B/A/S',
    ['white', 'blue', 'yellow', 'orange'].map((k) => DATA.RARITY[k].letter).join('') === 'CBAS');
  ok('精英/稀有/首领各有颜色',
    DATA.GRADE.elite.color !== DATA.GRADE.normal.color &&
    DATA.GRADE.rare.color !== DATA.GRADE.normal.color &&
    DATA.GRADE.boss.color !== DATA.GRADE.normal.color,
    [DATA.GRADE.elite.color, DATA.GRADE.rare.color, DATA.GRADE.boss.color]);
  ok('S 掉率收紧', DATA.DROP.normal.s === 0.0002 && DATA.DROP.elite.s === 0.002 &&
    DATA.DROP.rare.s === 0.03 && DATA.DROP.boss.s === 0.06, DATA.DROP);

  /* ============ 地面掉落袋：击杀不再直接进包 ============ */
  dl.genHub();
  dl.enterRoom('field1');
  dl.bags().length = 0;
  dl.P.bag = [];
  dl.P.weapon = null;
  dl.P.armor = null;
  const esL = dl.enemies();
  esL.length = 0;
  const eliteL = dl.makeEnemy(DATA.MON.find((m) => m.id === 'boar'), 'elite');
  eliteL.x = dl.P.x + 1;
  eliteL.y = dl.P.y;
  eliteL.hp = 1;
  esL.push(eliteL);
  dl.attack(1, '普攻');
  ok('击杀后地上出现袋子', dl.bags().length === 1, dl.bags().length);
  ok('击杀后装备不直接进包', dl.P.bag.length === 0 && !dl.P.weapon && !dl.P.armor,
    [dl.P.bag.length, !!dl.P.weapon, !!dl.P.armor]);
  const groundBag = dl.bags()[0];
  ok('精英保底 B 进了袋子', groundBag.items.length >= 1 && groundBag.items[0].rarity === 'blue',
    groundBag.items.map((e) => e.rarity));

  /* ============ 拾取清单：逐件拿、剩下的留在地上 ============ */
  dl.enterRoom('field1');
  dl.bags().length = 0;
  dl.P.bag = [];
  const bagX = dl.P.x + 1;
  const bagY = dl.P.y;
  dl.dropBag(bagX, bagY, [dl.makeEquip('weapon', 8, 'orange'), dl.makeEquip('armor', 8, 'white')]);
  ok('地上有袋子', dl.bags().length === 1 && !!dl.bagAt(bagX, bagY));
  dl.pickupBag(dl.bagAt(bagX, bagY));
  ok('拾取弹出清单', dl.pickOpen() === true && dl.pickItems().length === 2, dl.pickItems().length);
  dl.takeFromBag(0);
  ok('拿走一件', dl.pickItems().length === 1 && (dl.P.weapon || dl.P.bag.length === 1),
    [dl.pickItems().length, !!dl.P.weapon, dl.P.bag.length]);
  dl.closePick();
  ok('没拿完 → 袋子留在地上', dl.bags().length === 1 && dl.bagAt(bagX, bagY).items.length === 1,
    dl.bags().length);
  dl.pickupBag(dl.bagAt(bagX, bagY));
  dl.takeAllFromBag();
  ok('捡完 → 袋子消失', dl.bags().length === 0, dl.bags().length);

  /* ============ 死亡掉装备（R3.19） ============ */
  let lostTimes = 0;
  for (let i = 0; i < 200; i++) {
    dl.enterRoom('field1');
    dl.P.weapon = dl.makeEquip('weapon', 9, 'yellow');
    dl.P.armor = dl.makeEquip('armor', 9, 'yellow');
    dl.P.hp = 1;
    dl.die();
    if (!dl.P.weapon || !dl.P.armor) lostTimes++;
    dl.revive();
  }
  ok('死亡约 50% 掉一件装备', lostTimes > 60 && lostTimes < 140, lostTimes);
  ok('遗物袋留在那个房间', (dl.groundBags().field1 || []).some((b) => b.relic),
    Object.keys(dl.groundBags()));

  /* ============ 品级直接显示、词缀位留"未鉴定" ============ */
  const eqA = dl.makeEquip('armor', 8, 'yellow', {
    atkMin: 0, atkMax: 0, defMin: 4, defMax: 7, hp: 39,
  });
  eqA.affix = { id: 'tough', name: '坚韧', pct: 0.2 };
  ok('属性把词缀算进去（防御 4-7 → 5-8）', dl.eqText(eqA) === '防御 5-8 · HP +39', dl.eqText(eqA));
  ok('品级字母直接可读', DATA.RARITY[eqA.rarity].letter === 'A', DATA.RARITY[eqA.rarity].letter);
  ok('装箱时不用鉴定就能显示品级', eqA.identified === undefined);

  /* ============ 浮动只加在本项上：武器不长防御、护甲不长攻击 ============ */
  let weaponHasDef = false, armorHasAtk = false;
  for (let i = 0; i < 200; i++) {
    const w = dl.makeEquip('weapon', 10, 'orange');
    if (w.defMax > 0) weaponHasDef = true;
    const a = dl.makeEquip('armor', 10, 'orange');
    if (a.atkMax > 0) armorHasAtk = true;
  }
  ok('武器不会凭空长防御', weaponHasDef === false);
  ok('护甲不会凭空长攻击', armorHasAtk === false);
} catch (err) {
  fail++;
  lines.push('  FAIL 异常：' + (err && err.stack ? err.stack.split('\n')[0] : err));
}

console.log(lines.join('\n'));
console.log('');
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
