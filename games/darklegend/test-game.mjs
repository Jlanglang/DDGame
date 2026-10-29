// 豆豆海岛幻想 · 回归测试（Node + DOM 桩）
// 用法：node test-game.mjs
// 覆盖：初始化 / 回合 / 寻路 / 区域 / 时钟 / 装备 / 商店 / 死亡复活 / 存档 / 固定种子 / 战斗
import fs from 'node:fs';
import path from 'node:path';
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

/* ---------------- 加载游戏（动态 import，必须在桩之后） ---------------- */
globalThis.window = globalThis;
globalThis.document = documentStub;
globalThis.localStorage = localStorageStub;
globalThis.location = { search: '?debug', href: 'file:///darklegend/index.html' };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = noop;
globalThis.setInterval = (() => { let n = 0; return () => ++n; })();
globalThis.clearInterval = noop;
globalThis.setTimeout = (() => { let n = 0; return () => ++n; })();
globalThis.clearTimeout = noop;
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.innerWidth = 720;
globalThis.innerHeight = 1120;
globalThis.devicePixelRatio = 1;
globalThis.console = console;
const sandbox = globalThis;

try {
  await import('./src/game.js');
} catch (err) {
  console.error('加载游戏脚本失败：', err && err.stack ? err.stack : err);
  process.exit(1);
}
const dl = globalThis.window.__dl;
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

  /* 7. 商店 / 红蓝罐 */
  ok('红罐价=点数', dl.potPrice('red', 'low') === 50 && dl.potPrice('red', 'mid') === 300 && dl.potPrice('red', 'high') === 1000);
  ok('蓝罐价=红×2', dl.potPrice('blue', 'low') === 100 && dl.potPrice('blue', 'mid') === 600 && dl.potPrice('blue', 'high') === 2000);
  dl.setGold(5000);
  const goldBefore = dl.state().gold;
  const potBefore = dl.state().potPool.red;
  const blueBefore = dl.state().potPool.blue;
  dl.buyPotion('red', 'low');
  ok('买初级红罐扣 50', dl.state().gold === goldBefore - 50, [goldBefore, dl.state().gold]);
  ok('红罐 +50 点', dl.state().potPool.red === potBefore + 50, [potBefore, dl.state().potPool.red]);
  dl.buyPotion('blue', 'mid');
  ok('买中级蓝罐扣 600', dl.state().gold === goldBefore - 50 - 600);
  ok('蓝罐 +300 点', dl.state().potPool.blue === blueBefore + 300, [blueBefore, dl.state().potPool.blue]);
  dl.P.hp = 10;
  dl.P.potionCd.red = 0;
  const redPool0 = dl.P.potPool.red;
  const needRed = dl.maxHp() - 10;
  dl.drink('red');
  ok('红罐回满', dl.P.hp === dl.maxHp(), [dl.P.hp, dl.maxHp()]);
  ok('红罐按实际回复扣', dl.P.potPool.red === redPool0 - needRed, [redPool0, dl.P.potPool.red, needRed]);
  ok('万级余量显示能看出扣减', dl.formatAmount(100000) === '10万' && dl.formatAmount(99940) === '9.99万',
    [dl.formatAmount(100000), dl.formatAmount(99940)]);
  dl.P.mp = 0;
  dl.P.potionCd.blue = 0;
  dl.drink('blue');
  ok('蓝罐回满', dl.P.mp === dl.maxMp(), [dl.P.mp, dl.maxMp()]);
  const mig = dl.normalizePots(5);
  ok('旧药水数迁到初级红', mig.red.low === 5 && mig.blue.low === 0, mig);

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

  /* 11b. 连点普攻不抢攻：手动 act 和挂机共用 playerNextStrikeAt 这一个出手间隔 */
  dl.resetEnemyClock();
  dl.act('attack');
  const hpOneTap = mon.hp;
  const turnOneTap = dl.state().turn;
  dl.act('attack');              // 同一拍里再点一次：应该完全无效（不掉血、不推进回合）
  ok('连点普攻只算一次', mon.hp === hpOneTap && dl.state().turn === turnOneTap,
    [hpOneTap, mon.hp, turnOneTap, dl.state().turn]);
  dl.resetEnemyClock();

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

  /* 14. 鸡啄 1–3 点；稻草人走正常攻防 */
  const MONs = sandbox.window.DL.DATA.MON;
  dl.genHub();
  dl.P.lv = 1;
  dl.rest();
  const es0 = dl.enemies();
  es0.length = 0;
  const chick0 = dl.makeEnemy(MONs.find((m) => m.id === 'chicken'), 'normal');
  chick0.x = dl.P.x + 1;
  chick0.y = dl.P.y;
  chick0.aggroOn = true; // 被动怪：挨打后才还手
  es0.push(chick0);
  const hpChick0 = dl.state().hp;
  dl.resetEnemyClock();
  dl.after();
  ok('鸡打玩家 1–3 点', (() => {
    const lost = hpChick0 - dl.state().hp;
    return lost >= 1 && lost <= 3;
  })(), [hpChick0, dl.state().hp]);
  ok('鸡攻击区间 1–3', chick0.atkMin === 1 && chick0.atkMax === 3, [chick0.atkMin, chick0.atkMax]);

  es0.length = 0;
  dl.rest();
  const scare0 = dl.makeEnemy(MONs.find((m) => m.id === 'scarecrow'), 'normal');
  scare0.x = dl.P.x + 1;
  scare0.y = dl.P.y;
  es0.push(scare0);
  const hpScare0 = dl.state().hp;
  dl.resetEnemyClock();
  dl.after();
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
  ok('Boss 未激怒贴身不打', C.decide({ lv: 1, boss: true, aggroOn: false, aggro: 0, ai: 'passive' }, 10, 1) === 'idle');
  ok('Boss 激怒后贴身攻击', C.decide({ lv: 1, boss: true, aggroOn: true, aggro: 0, ai: 'passive' }, 10, 1) === 'attack');

  /* 17. 自动回合：pauseAuto 后必须能 resumeAuto，否则自动攻击永久停摆 */
  dl.pauseAuto();
  ok('pauseAuto 后自动战斗关闭', dl.autoEnabled() === false, dl.autoEnabled());
  dl.resumeAuto();
  ok('resumeAuto 后自动战斗恢复', dl.autoEnabled() === true, dl.autoEnabled());

  /* 19. 技能书：初始只有普攻；20 级 BOSS→半月、30 级 BOSS→烈火 */
  dl.genHub();
  dl.P.skills.half = false;
  dl.P.skills.fire = false;
  ok('初始未学半月', dl.state().skills.half === false, dl.state().skills);
  ok('初始未学烈火', dl.state().skills.fire === false, dl.state().skills);
  dl.rest();
  const mpBefore = dl.state().mp;
  ok('未学半月不可释放', dl.halfMoon() === false);
  ok('未学半月不耗 MP', dl.state().mp === mpBefore, [mpBefore, dl.state().mp]);
  {
    const elite = { boss: false, elite: true, lv: 12, name: '精英' };
    const b10 = { boss: true, lv: 10, name: '稻草王' };
    const b20 = { boss: true, lv: 20, name: '山大王' };
    const b25 = { boss: true, lv: 25, name: '古墓尸王' };
    const b30 = { boss: true, lv: 30, name: '血月怨主' };
    const SB = sandbox.window.DL.DATA.SKILL_BOOK;
    ok('技能书掉率 10%', SB.chance === 0.1, SB.chance);
    const bookChance = SB.chance;
    ok('精英不掉技能书', dl.rollSkillBookDrop(elite) == null);
    ok('10 级首领不掉技能书', dl.rollSkillBookDrop(b10) == null);
    ok('25 级首领不掉技能书', dl.rollSkillBookDrop(b25) == null);
    SB.chance = 0;
    ok('0% 概率不掉半月', dl.rollSkillBookDrop(b20) == null);
    SB.chance = 1;
    const halfBook = dl.rollSkillBookDrop(b20);
    ok('20 级首领掉半月书', halfBook && halfBook.skill === 'half', halfBook);
    ok('捡半月书才学会', dl.state().skills.half === false);
    ok('学习半月书', dl.learnSkillBook(halfBook) === true && dl.state().skills.half === true);
    ok('已学会不再掉半月', dl.rollSkillBookDrop(b20) == null);
    const fireBook = dl.rollSkillBookDrop(b30);
    ok('30 级首领掉烈火书', fireBook && fireBook.skill === 'fire', fireBook);
    ok('学习烈火书', dl.learnSkillBook(fireBook) === true && dl.state().skills.fire === true);
    SB.chance = bookChance;
  }
  /* 19b. 技能书商人：半月 3 万 / 烈火 10 万 */
  dl.P.skills.half = false;
  dl.P.skills.fire = false;
  dl.setGold(30000);
  ok('买半月 3 万', dl.buyBook('half') === true && dl.state().skills.half === true);
  ok('买后金币 0', dl.state().gold === 0, dl.state().gold);
  ok('已学会不再卖', dl.buyBook('half') === false);
  dl.setGold(9999);
  ok('金币不够烈火', dl.buyBook('fire') === false && dl.state().gold === 9999);
  dl.setGold(100000);
  ok('买烈火 10 万', dl.buyBook('fire') === true && dl.state().skills.fire === true);
  ok('买烈火后金币 0', dl.state().gold === 0, dl.state().gold);

  /* 19c. 试炼官：3 次 1 轮，第 3 次给经验球 */
  {
    dl.P.lv = 1;
    dl.P.exp = 0;
    dl.P.trialStage = 0;
    dl.P.trialRound = 1;
    dl.P.expOrbs = 0;
    dl.P.mats = {};
    dl.rollTrialTask();
    ok('试炼任务有目标', !!dl.P.trial && dl.P.trial.need > 0, dl.P.trial);
    dl.P.trial = { type: 'kill', target: 'chicken', need: 1, prog: 1, stage: 1, name: '鸡' };
    const gold0 = dl.P.gold;
    ok('交第 1 次给经验金币', dl.turnInTrial() === true && dl.P.trialStage === 1 && dl.P.gold > gold0);
    const bag0 = dl.P.bag.length;
    dl.P.trial = { type: 'kill', target: 'chicken', need: 1, prog: 1, stage: 2, name: '鸡' };
    dl.turnInTrial();
    dl.P.trial = { type: 'kill', target: 'chicken', need: 1, prog: 1, stage: 3, name: '鸡' };
    dl.turnInTrial();
    ok('完成 1 轮给蓝装或经验球', (dl.P.expOrbs >= 1 || dl.P.bag.length > bag0)
      && dl.P.trialRound === 2, [dl.P.expOrbs, dl.P.bag.length - bag0]);
    dl.P.lv = 10;
    dl.P.exp = 0;
    dl.P.expOrbs = 1;
    ok('经验球给 20% 经验', dl.useExpOrb() === true && dl.P.lv === 10 && dl.P.exp === 186, [dl.P.lv, dl.P.exp]);
    dl.P.lv = 30;
    dl.P.expOrbs = 1;
    ok('30 级后经验球不能再用', dl.useExpOrb() === false);
    ok('材料表有鸡肉', !!dl.MATS.meat && dl.MATS.meat.name === '鸡肉');
    dl.P.lv = 1;
    dl.P.exp = 0;
    dl.P.trial = { type: 'collect', target: 'meat', need: 3, prog: 0, stage: 1, name: '鸡肉' };
    dl.P.mats.meat = 3;
    ok('收集任务交材料', dl.turnInTrial() === true && (dl.P.mats.meat || 0) === 0);
    dl.P.trial = { type: 'kill', target: 'chicken', need: 5, prog: 1, stage: 1, name: '鸡' };
    const before = dl.P.trial;
    dl.abandonTrial();
    ok('放弃后换新任务', dl.P.trial !== before && !!dl.P.trial);
    dl.P.mats = { meat: 2 };
    dl.setGold(0);
    ok('卖材料给金币', dl.sellAllMats() === true && dl.P.gold === 4 && !dl.P.mats.meat, [dl.P.gold, dl.P.mats]);

    const MON = sandbox.window.DL.DATA.MON;
    dl.P.lv = 10;
    dl.P.exp = 0;
    dl.chooseTrialMode('gear');
    ok('装备路线怪更低', dl.P.trial && MON.find((m) => m.id === dl.P.trial.target).lv <= 9, dl.P.trial);
    dl.P.trial = { type: 'kill', target: 'chicken', need: 1, prog: 1, stage: 1, name: '鸡' };
    const exp0 = dl.P.exp;
    const bagMode0 = dl.P.bag.length;
    const goldMode0 = dl.P.gold;
    dl.turnInTrial();
    ok('装备路线前两次只给金币', dl.P.exp === exp0 && dl.P.bag.length === bagMode0 && dl.P.gold > goldMode0,
      [dl.P.exp - exp0, dl.P.bag.length - bagMode0, dl.P.gold - goldMode0]);
    ok('装备路线金币减半', dl.P.gold - goldMode0 === 150, dl.P.gold - goldMode0);
    dl.chooseTrialMode('exp');
    dl.P.trial = { type: 'kill', target: 'chicken', need: 1, prog: 1, stage: 1, name: '鸡' };
    const exp1 = dl.P.exp;
    const bagMode1 = dl.P.bag.length;
    dl.turnInTrial();
    ok('经验路线给经验不给装备', dl.P.exp > exp1 && dl.P.bag.length === bagMode1, [dl.P.exp - exp1, dl.P.bag.length - bagMode1]);
    dl.chooseTrialMode('gear');
    dl.P.trial = { type: 'kill', target: 'chicken', need: 1, prog: 1, stage: 3, name: '鸡' };
    const bagThird = dl.P.bag.length;
    dl.turnInTrial();
    const third = dl.P.bag.slice(bagThird);
    ok('装备路线第 3 次蓝/黄', third.length > 0 && third.every((e) => e.rarity === 'blue' || e.rarity === 'yellow'), third.map((e) => e.rarity));
  }

  dl.P.skills.half = true;
  dl.P.cd.half = 0;
  dl.rest();
  ok('学会后可释放半月', dl.halfMoon() === true);

  /* 被动：剑术精通（10 级自动学，攻速 ×2） */
  dl.P.lv = 9;
  dl.P.skills.swordMaster = false;
  dl.checkPassives();
  ok('9 级不学剑术精通', dl.P.skills.swordMaster === false);
  ok('默认攻速 1 秒', dl.combatMs() === 1000, dl.combatMs());
  dl.P.lv = 10;
  dl.checkPassives();
  ok('10 级自动学剑术精通', dl.P.skills.swordMaster === true);
  ok('剑术精通攻速 ×2', dl.combatMs() === 500, dl.combatMs());
  dl.P.potionCd.red = Date.now() + 3000;
  ok('药水 CD 3 秒', dl.drink('red') === false);
  dl.P.potionCd.red = 0;
  dl.openChar();
  const skillHtml = sandbox.document.getElementById('skillList').innerHTML;
  ok('技能页含剑术精通', skillHtml.includes('剑术精通'), skillHtml.slice(0, 120));
  dl.P.lv = 10;
  dl.P.skills.half = true;
  dl.P.skills.swordMaster = false;
  dl.P.cd.half = 0;
  dl.P.mp = 100;
  dl.halfMoon();
  ok('默认半月 CD 2 回合', dl.P.cd.half === 2, dl.P.cd.half);
  dl.P.cd.half = 0;
  dl.P.mp = 100;
  dl.P.skills.swordMaster = true;
  dl.halfMoon();
  ok('剑术精通层半月 CD 4 回合（实际仍 2 秒）', dl.P.cd.half === 4, dl.P.cd.half);

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
  ok('图 1 共 4 种怪 + BOSS Lv10', DATA.MON.filter((m) => m.lv <= 10).length === 4 && DATA.BOSS.lv === 10, [DATA.MON.length, DATA.BOSS.lv]);
  {
    const b = dl.makeEnemy(DATA.BOSS, 'boss');
    const n = dl.makeEnemy(DATA.MON.find((m) => m.id === 'boar') || DATA.MON[0], 'normal');
    // 同级对照：首领血约普通的 ×10（野猪 Lv7 vs 稻草人王 Lv10 不比）；用公式倍率验收
    ok('首领血量倍率 ×10', DATA.GRADE.boss.hp === 10, DATA.GRADE.boss.hp);
    ok('首领攻击倍率 ×1.35', DATA.GRADE.boss.atk === 1.35, DATA.GRADE.boss.atk);
    ok('Lv10 首领血量约 800+', b.maxHp >= 750 && b.maxHp <= 900, b.maxHp);
    void n;
  }

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

  /* 22b. 自动回城 + 回城卷（R10.12） */
  {
    dl.enterRoom('field1');
    dl.P.autoTown = 30;
    dl.P.townScrolls = 0;
    dl.setHp(Math.max(1, Math.floor(dl.maxHp() * 0.2)));
    ok('无卷不自动回城', dl.tryAutoTown() === false && !!dl.currentRoom());
    dl.P.townScrolls = 2;
    ok('有卷自动回城', dl.tryAutoTown() === true && !dl.currentRoom() && dl.P.townScrolls === 1,
      [dl.currentRoom(), dl.P.townScrolls]);
    dl.P.autoTown = 0;
    dl.enterRoom('field1');
    dl.P.townScrolls = 1;
    dl.setHp(1);
    ok('配置关不回城', dl.tryAutoTown() === false && !!dl.currentRoom());
    ok('手动用回城卷', dl.useTownScroll() === true && !dl.currentRoom() && dl.P.townScrolls === 0);
  }

  /* 20. 装备品级：生成时就定好、界面直接显示（没有"未鉴定"这回事） */
  dl.P.bag = [];
  dl.P.weapon = null;
  const eqO = dl.makeEquip('weapon', 5, 'orange');
  ok('装备带着品级', eqO.rarity === 'orange', eqO.rarity);
  ok('装备没有未鉴定标记', eqO.identified === undefined, eqO.identified);
  ok('装备有基础与浮动字段', eqO.atkBaseMax != null && eqO.atkFloatMax != null, eqO);
  {
    const t = dl.eqStatText(eqO);
    ok('属性含基础区间', /攻击 \d+-\d+/.test(t), t);
    if (eqO.atkFloatMin || eqO.atkFloatMax) {
      ok('有浮动时显示括号', t.includes('(+'), t);
    } else {
      ok('无浮动时无括号', !t.includes('(+'), t);
    }
  }
  {
    const shown = dl.makeEquip('weapon', 10, 'white');
    shown.atkBaseMin = 0; shown.atkBaseMax = 15;
    shown.atkFloatMin = 0; shown.atkFloatMax = 10;
    shown.atkMin = 0; shown.atkMax = 25;
    shown.defBaseMin = 0; shown.defBaseMax = 0;
    shown.defFloatMin = 0; shown.defFloatMax = 0;
    shown.defMin = 0; shown.defMax = 0;
    shown.hp = 0;
    ok('基础+浮动文案', dl.eqStatText(shown) === '攻击 0-15(+10)', dl.eqStatText(shown));
  }
  dl.P.lv = 5;
  dl.P.weapon = null;
  dl.P.bag = [];
  dl.addToBag(eqO);
  ok('好装备不自动穿，进背包', dl.state().weapon == null && dl.P.bag.includes(eqO), dl.P.bag.map((e) => e && e.name));
  ok('双击才穿上', dl.equipFromBag(0) === true && dl.P.weapon === eqO);
  {
    dl.P.lv = 1;
    const w = dl.makeEquip('weapon', 5, 'white');
    w.atkMin = 4; w.atkMax = 12; w.defMin = 0; w.defMax = 0; w.hp = 0;
    dl.P.weapon = w;
    for (const id of ['armor', 'glovesL', 'glovesR', 'shoes', 'helmet', 'necklace', 'earringL', 'earringR', 'ringL', 'ringR']) {
      dl.P[id] = null;
    }
    const ar = dl.atkRange();
    ok('面板攻击是区间', ar.min === 5 + 4 && ar.max === 5 + 12, ar);
    dl.openChar();
    const html = sandbox.document.getElementById('charStats').innerHTML;
    ok('角色面板显示攻击最小-最大', html.includes(`攻击 <b>${ar.min}-${ar.max}</b>`), html);
  }

  /* R15.6 音效：掉落分档 + 静音不炸 + enable API */
  {
    const S = dl.Sfx || sandbox.DL.Sfx;
    ok('Sfx 模块存在', !!(S && S.play && S.drop && S.enable));
    ok('未解锁前默认不响', S.isUnlocked() === false);
    S.enable();
    ok('enable 后已解锁', S.isUnlocked() === true);
    const was = S.isMuted();
    S.setMuted(true);
    ok('静音后 play 不抛', (() => { S.play('kill'); S.play('equip'); S.drop('orange'); return true; })());
    ok('精简音效含 kill/equip', !!(S.play && typeof S.drop === 'function'));
    S.setMuted(was);
  }

  /* 等级不够不能穿 */
  {
    const high = dl.makeEquip('weapon', 30, 'white');
    dl.P.lv = 5;
    dl.P.bag = [high];
    ok('等级不足不可穿', dl.equipFromBag(0) === false && dl.P.weapon !== high, dl.P.lv);
    ok('详情含需要等级', dl.eqDetailHtml(high).includes('需要 Lv.30'), dl.eqDetailHtml(high));
    ok('等级不足标红', dl.eqDetailHtml(high).includes('eq-need-low'), dl.eqDetailHtml(high));
    ok('canWearEq 否', dl.canWearEq(high, 5) === false);
    ok('canWearEq 够级', dl.canWearEq(high, 30) === true);
  }

  /* 背包穿戴：双击格子 = equipFromBag（弱装进背包再手穿） */
  dl.P.lv = Math.max(dl.P.lv, 5);
  const eqWeak = dl.makeEquip('weapon', 1, 'white');
  dl.P.bag = [eqWeak];
  const wornBefore = dl.P.weapon;
  ok('弱装从背包穿上', dl.equipFromBag(0) === true && dl.P.weapon === eqWeak, dl.P.weapon && dl.P.weapon.name);
  ok('原武器回背包', wornBefore && dl.P.bag.includes(wornBefore), dl.P.bag.map((e) => e && e.name));

  /* 装备对比：上下同款展示，无箭头增减文案 */
  dl.P.lv = Math.max(dl.P.lv, 8);
  const eqStrong = dl.makeEquip('weapon', 8, 'blue');
  const wornName = dl.P.weapon && dl.P.weapon.name;
  const cmpHtml = dl.eqCompareHtml(eqStrong);
  ok('对比含身上装备名', typeof cmpHtml === 'string' && !!wornName && cmpHtml.includes(wornName), cmpHtml && cmpHtml.slice(0, 100));
  ok('对比标穿中', cmpHtml.includes('eq-worn-tag') && cmpHtml.includes('穿'), cmpHtml && cmpHtml.slice(0, 120));
  ok('对比无增减箭头文案', !cmpHtml.includes('对比身上') && !cmpHtml.includes('eq-delta') && !cmpHtml.includes('→'), cmpHtml && cmpHtml.slice(0, 120));
  const bagN = dl.P.bag.length;
  const goldBeforeSell = dl.state().gold;
  ok('可卖背包件', dl.sellFromBag(0) === true && dl.P.bag.length === bagN - 1, dl.P.bag.length);
  ok('卖掉加金币', dl.state().gold > goldBeforeSell, [goldBeforeSell, dl.state().gold]);

  /* R10.7/R10.8 锁定 + 按品质回收 */
  {
    const c1 = dl.makeEquip('weapon', 1, 'white');
    const c2 = dl.makeEquip('armor', 1, 'white');
    const b1 = dl.makeEquip('weapon', 5, 'blue');
    const a1 = dl.makeEquip('weapon', 8, 'yellow');
    c2.locked = true;
    dl.P.bag = [c1, c2, b1, a1];
    const g0 = dl.state().gold;
    const n0 = dl.P.bag.length;
    ok('锁定件不可单卖', dl.sellFromBag(1) === false && dl.P.bag.length === n0);
    const r = dl.sellBagByRarity(['white', 'blue']);
    ok('回收卖 C+B 两件', r.n === 2 && r.gold > 0, r);
    ok('锁定 C 与 A 留下', dl.P.bag.length === 2
      && dl.P.bag.some((e) => e.locked) && dl.P.bag.some((e) => e.rarity === 'yellow'),
      dl.P.bag.map((e) => `${e.rarity}${e.locked ? 'L' : ''}`));
    ok('回收加金币', dl.state().gold === g0 + r.gold, [g0, dl.state().gold, r.gold]);
    ok('toggleLock 可解', dl.toggleLockEq(dl.P.bag.find((e) => e.locked)) === true
      && !dl.P.bag.find((e) => e.rarity === 'white').locked);
  }

  ok('背包上限 40', dl.BAG_MAX === 40 && DATA.BAG_MAX === 40, [dl.BAG_MAX, DATA.BAG_MAX]);

  /* 商店左右窗：货架目录 + 双击购买入口 */
  {
    const cat = dl.ensureShopCatalog();
    ok('货架含药水与装备', Array.isArray(cat) && cat.length >= 8
      && cat.some((x) => x.kind === 'pot') && cat.some((x) => x.kind === 'equip'), cat && cat.length);
    ok('货架含回城卷', cat.some((x) => x.kind === 'scroll' && x.price === 100),
      cat.filter((x) => x.kind === 'scroll').map((x) => x.price));
    const scrollIdx = cat.findIndex((x) => x.kind === 'scroll');
    const scrolls0 = dl.P.townScrolls | 0;
    dl.P.gold = Math.max(dl.state().gold, 1000);
    ok('批量买回城卷×5', dl.buyShopStock(scrollIdx, 5) === true
      && (dl.P.townScrolls | 0) === scrolls0 + 5, dl.P.townScrolls);
    const potIdxBulk = cat.findIndex((x) => x.kind === 'pot' && x.potKind === 'red' && x.tierId === 'low');
    const pool0 = dl.P.potPool.red;
    ok('批量买红罐×3', dl.buyShopStock(potIdxBulk, 3) === true
      && dl.P.potPool.red === pool0 + 150, [pool0, dl.P.potPool.red]);
    const potIdx = cat.findIndex((x) => x.kind === 'pot' && x.potKind === 'red' && x.tierId === 'low');
    const g0 = dl.state().gold;
    dl.P.gold = Math.max(g0, cat[potIdx].price + 10);
    const pots0 = dl.potTotal('red');
    ok('货架双击买药', dl.buyShopStock(potIdx) === true && dl.potTotal('red') === pots0 + 50, dl.potTotal('red'));
    const eqIdx = cat.findIndex((x) => x.kind === 'equip' && x.buyId === 'sword');
    const bag0 = dl.P.bag.length;
    dl.P.gold = Math.max(dl.state().gold, cat[eqIdx].price + 10);
    ok('货架双击买剑', dl.buyShopStock(eqIdx) === true
      && (dl.P.bag.length > bag0 || (dl.state().weapon && dl.state().weapon.ilvl === 1)),
      [dl.P.bag.length, dl.state().weapon && dl.state().weapon.name]);
    dl.refreshShop();
    const stockHtml = sandbox.document.getElementById('shopStock').innerHTML;
    const bagHtml = sandbox.document.getElementById('shopBag').innerHTML;
    ok('货架格子已渲染', typeof stockHtml === 'string' && stockHtml.includes('data-shop-stock'), stockHtml && stockHtml.slice(0, 80));
    ok('商店背包格已渲染', typeof bagHtml === 'string' && bagHtml.includes('eq-cell'), bagHtml && bagHtml.slice(0, 80));
  }

  /* 底材固定等级（M1.40）：同名只对应一个 ilvl */
  ok('8 级怪掉 5 级精铁剑', (() => {
    const e = dl.makeEquip('weapon', 8, 'blue');
    return e.ilvl === 5 && e.name === '精铁剑';
  })());
  ok('同名底材不跨级：8/9 级怪掉同一件', (() => {
    const a = dl.makeEquip('weapon', 8, 'blue');
    const b = dl.makeEquip('weapon', 9, 'blue');
    return a.ilvl === b.ilvl && a.name === b.name;
  })());
  ok('10 级怪掉 10 级底材', dl.makeEquip('weapon', 10, 'white').ilvl === 10);
  ok('30 级裁决之刃', (() => {
    const e = dl.makeEquip('weapon', 30, 'yellow');
    return e.name === '裁决之刃' && e.ilvl === 30;
  })());
  ok('40 级屠龙', (() => {
    const e = dl.makeEquip('weapon', 40, 'orange');
    return e.name === '屠龙' && e.ilvl === 40;
  })());
  ok('12 级怪掉 Lv.11 玄铁剑', (() => {
    const e = dl.makeEquip('weapon', 12, 'white');
    return e.ilvl === 11 && e.name === '玄铁剑';
  })());
  ok('20 级怪掉 Lv.20 赤血剑', (() => {
    const e = dl.makeEquip('weapon', 20, 'white');
    return e.ilvl === 20 && e.name === '赤血剑';
  })());
  ok('25 级怪掉 Lv.25 血饮', (() => {
    const e = dl.makeEquip('weapon', 25, 'white');
    return e.ilvl === 25 && e.name === '血饮';
  })());
  ok('1–30 级共 14 张单怪地图', DATA.ROOMS.length === 14, DATA.ROOMS.length);
  ok('每房只刷一种怪', DATA.ROOMS.every((r) => (r.pool || []).length === 1),
    DATA.ROOMS.filter((r) => (r.pool || []).length !== 1).map((r) => r.id));
  ok('主城 3 个等级段传送门', dl.doors().length === 3
    && dl.doors().map((d) => d.tierMin).join(',') === '1,10,20',
    dl.doors().map((d) => d.name));
  ok('1–10 门四张图', (() => {
    const ids = dl.roomsForDoor(dl.doors().find((d) => d.tierMin === 1)).map((r) => r.id);
    return ids.join(',') === 'field1,field2,field2b,cave1';
  })());
  ok('10–20 门含山大王', (() => {
    const ids = dl.roomsForDoor(dl.doors().find((d) => d.tierMin === 10)).map((r) => r.id);
    return ids.length === 5 && ids.includes('cave3');
  })(), dl.roomsForDoor(dl.doors().find((d) => d.tierMin === 10)).map((r) => r.name));
  ok('20–30 门含血月荒原', (() => {
    const ids = dl.roomsForDoor(dl.doors().find((d) => d.tierMin === 20)).map((r) => r.id);
    return ids.length === 5 && ids.includes('field7');
  })(), dl.roomsForDoor(dl.doors().find((d) => d.tierMin === 20)).map((r) => r.name));
  ok('传送门在东侧且留出名字', dl.doors().every((d) => d.x === 20),
    dl.doors().map((d) => `${d.x},${d.y}`));
  {
    const d10 = dl.doors().find((d) => d.tierMin === 10);
    dl.setHubReturnDoor({ tierMin: 10, name: d10.name });
    dl.enterRoom('field1');
    ok('进房后有当前房间', !!dl.currentRoom());
    dl.leaveRoom();
    ok('回城站进门旁', !dl.currentRoom()
      && dl.P.x === d10.x - 1 && dl.P.y === d10.y,
      [dl.P.x, dl.P.y, d10.x, d10.y]);
    dl.setHubReturnDoor(null);
    dl.genHub();
    // 2D 相机没了，传送门不再做"画面内坐标"断言；只确认都存在且在地图里
    ok('传送门坐标合法', dl.doors().every((d) => d.x >= 0 && d.y >= 0 && d.x < 24 && d.y < 24));
  }
  ok('房间等级覆盖到 30', DATA.ROOMS.some((r) => r.lvMax >= 30));
  ok('古墓首领 Lv.25', (() => {
    const r = DATA.ROOMS.find((x) => x.id === 'cave2');
    return r && r.bossLv === 25 && r.bossName === '古墓尸王';
  })());
  ok('10–20 有山大王首领', (() => {
    const r = DATA.ROOMS.find((x) => x.id === 'cave3');
    return r && r.boss === true && r.bossLv === 20 && r.bossName === '山大王';
  })());
  ok('血月荒原 30 级首领', (() => {
    const r = DATA.ROOMS.find((x) => x.id === 'field7');
    return r && r.boss === true && r.bossLv === 30 && r.bossName === '血月怨主';
  })());
  /* R11.14 进图：lvMin ≤ 自身 +10 */
  {
    const lv0 = dl.P.lv;
    dl.P.lv = 1;
    ok('1 级可进狼谷(lvMin11)', dl.canEnterRoom(DATA.ROOMS.find((r) => r.id === 'field3')) === true);
    ok('1 级不可进蛛网洞(lvMin13)', dl.canEnterRoom(DATA.ROOMS.find((r) => r.id === 'field3b')) === false);
    ok('蛛网洞需 Lv.3', dl.roomEnterNeedLv(DATA.ROOMS.find((r) => r.id === 'field3b')) === 3);
    const before = dl.currentRoom();
    ok('1 级强进蛛网洞失败', dl.enterRoom('field3b') === false);
    ok('强进失败不换图', dl.currentRoom() === before, [before, dl.currentRoom()]);
    dl.P.lv = 3;
    ok('3 级可进蛛网洞', dl.canEnterRoom(DATA.ROOMS.find((r) => r.id === 'field3b')) === true);
    dl.P.lv = lv0;
  }

  /* 槽位等级解锁 + 掉落部位（R7.1b） */
  ok('1 级可穿武器护甲', dl.slotUnlocked('weapon', 1) && dl.slotUnlocked('armor', 1));
  ok('1 级不可穿手套', dl.slotUnlocked('glovesL', 1) === false);
  ok('10 级可穿双手套', dl.slotUnlocked('glovesL', 10) && dl.slotUnlocked('glovesR', 10));
  ok('1 级不可穿鞋子', dl.slotUnlocked('shoes', 1) === false);
  ok('10 级可穿鞋子', dl.slotUnlocked('shoes', 10) === true);
  ok('20 级可穿头盔', dl.slotUnlocked('helmet', 20) === true);
  ok('30 级可穿项链耳环', dl.slotUnlocked('necklace', 30) && dl.slotUnlocked('earring', 30));
  ok('40 级可穿双戒', dl.slotUnlocked('ringL', 40) && dl.slotUnlocked('ringR', 40));
  ok('项链/耳环 25 级起掉', dl.slotMeta('necklace').dropAt === 25 && dl.slotMeta('earring').dropAt === 25);
  ok('项链 30 级才穿', dl.slotUnlocked('necklace', 29) === false && dl.slotUnlocked('necklace', 30) === true);
  ok('25 级怪可掉项链/耳环', (() => {
    const set = new Set();
    for (let i = 0; i < 400; i++) set.add(dl.rollDropSlot(25));
    return set.has('necklace') || set.has('earring');
  })());
  ok('低级怪不掉手套', (() => {
    const set = new Set();
    for (let i = 0; i < 80; i++) set.add(dl.rollDropSlot(5));
    return !set.has('glovesL') && !set.has('glovesR') && set.has('weapon') && set.has('armor');
  })());
  ok('10 级怪可掉双手套', (() => {
    const set = new Set();
    for (let i = 0; i < 160; i++) set.add(dl.rollDropSlot(10));
    return set.has('glovesL') && set.has('glovesR');
  })());
  ok('10 级怪可掉鞋子', (() => {
    const set = new Set();
    for (let i = 0; i < 120; i++) set.add(dl.rollDropSlot(10));
    return set.has('shoes');
  })());
  ok('鞋子有防御和少量 HP', (() => {
    const s = dl.makeEquip('shoes', 12, 'blue');
    return s.slot === 'shoes' && s.defMax > 0 && s.atkMax === 0 && s.hp > 0;
  })());
  ok('手套有防御无乱长武器攻', (() => {
    const g = dl.makeEquip('glovesL', 12, 'blue');
    return g.slot === 'glovesL' && g.defMax > 0 && g.atkMax === 0;
  })());
  {
    const counts = { weapon: 0, jewelry: 0, armor: 0 };
    for (let i = 0; i < 600; i++) {
      const id = dl.rollDropSlot(40);
      const g = dl.slotMeta(id).group;
      counts[g] = (counts[g] || 0) + 1;
    }
    ok('掉率武器<首饰', counts.weapon < counts.jewelry, counts);
    ok('掉率首饰<防具', counts.jewelry < counts.armor, counts);
  }
  {
    dl.P.lv = 1;
    dl.P.bag = [dl.makeEquip('glovesL', 10, 'white')];
    ok('未解锁不可手穿手套', dl.equipFromBag(0) === false && dl.P.glovesL == null);
    dl.P.lv = 10;
    ok('解锁后可穿手套', dl.equipFromBag(0) === true && !!dl.P.glovesL);
    dl.P.glovesL = null;
    dl.P.lv = 1;
  }

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
  bigBoss.aggroOn = true; // 被动 BOSS：未激怒不打人
  esC.push(bigBoss);
  let sawStun = false, sawPara = false;
  for (let i = 0; i < 2000 && !(sawStun && sawPara); i++) {
    SS.clear(dl.P);
    dl.setHp(dl.maxHp());
    bigBoss.aggroOn = true;
    bigBoss.hp = bigBoss.maxHp;
    dl.resetEnemyClock();
    dl.enemiesTurn();
    if (SS.has(dl.P, 'stun')) sawStun = true;
    if (SS.has(dl.P, 'paralyze')) sawPara = true;
  }
  ok('BOSS 能眩晕玩家', sawStun);
  ok('BOSS 能麻痹玩家', sawPara, { stunP: DATA.AI.bossStunP, paraP: DATA.AI.bossParalyzeP });
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
  ok('BOSS 是被动怪（不主动追人）', DATA.BOSS.ai === 'passive', DATA.BOSS.ai);
  ok('BOSS 激怒后追击不放弃', C2.decide({ lv: 10, boss: true, aggroOn: true, aggro: 0, ai: 'passive' }, 10, 5) === 'chase');
  ok('被动怪不主动追', C2.decide({ lv: 5, boss: false, aggroOn: false, aggro: 0, ai: 'passive' }, 10, 3) === 'idle',
    C2.decide({ lv: 5, boss: false, aggroOn: false, aggro: 0, ai: 'passive' }, 10, 3));
  ok('主动怪进半径就追', C2.decide({ lv: 5, boss: false, aggroOn: false, aggro: 5, ai: 'active' }, 10, 4) === 'chase');
  ok('被动怪挨打后会还手', C2.decide({ lv: 5, boss: false, aggroOn: true, aggro: 0, ai: 'passive' }, 10, 2) === 'chase');
  ok('被动怪追 3 格就放弃', C2.decide({ lv: 5, boss: false, aggroOn: true, aggro: 0, ai: 'passive' }, 10, 4) === 'giveup');
  const madeChicken = dl.makeEnemy(monOf('chicken'), 'normal');
  ok('makeEnemy 带上 ai 和 statuses',
    madeChicken.ai === 'passive' && !!madeChicken.statuses, [madeChicken.ai, !!madeChicken.statuses]);

  /* ============ 房间与怪池：一张地图一种怪（BOSS 房除外） ============ */
  const ROOMS = DATA.ROOMS;
  const poolIds = (r) => (r.pool || []).slice().sort().join(',');
  ok('鸡房只刷鸡', poolIds(ROOMS.find((r) => r.id === 'field1')) === 'chicken');
  ok('稻草人房只刷稻草人', poolIds(ROOMS.find((r) => r.id === 'field2')) === 'scarecrow');
  ok('野狗房只刷野狗', poolIds(ROOMS.find((r) => r.id === 'field2b')) === 'dog');
  ok('野猪洞有首领', poolIds(ROOMS.find((r) => r.id === 'cave1')) === 'boar' && ROOMS.find((r) => r.id === 'cave1').boss === true);
  ok('每张地图只有一种怪', ROOMS.every((r) => (r.pool || []).length === 1));

  dl.setSeed(2468);
  dl.enterRoom('field1');
  const f1 = dl.enemies();
  ok('鸡房实际只刷鸡', f1.length > 0 && f1.every((e) => e.id === 'chicken'),
    f1.map((e) => e.id).join(','));
  dl.enterRoom('field2b');
  const f2 = dl.enemies();
  ok('野狗房实际只刷野狗', f2.length > 0 && f2.every((e) => e.id === 'dog'),
    f2.map((e) => e.id).join(','));
  dl.enterRoom('cave1');
  const f3 = dl.enemies();
  ok('野猪洞是野猪 + 首领', f3.some((e) => e.id === 'boar') && f3.some((e) => e.boss),
    f3.map((e) => e.id).join(','));

  /* ============ 等级差经验（R2.2c）：能刷鸡到 5 级，之后白打 ============ */
  const Core = sandbox.window.DL.Core;
  const chickMon = DATA.MON.find((m) => m.id === 'chicken');
  ok('高 3 级内经验全额', Core.expMulByGap(3) === 1, Core.expMulByGap(3));
  ok('高 4 级起 0 经验（≈超普通怪到 5 级刷鸡）', Core.expMulByGap(4) === 0 && Core.expMulByGap(9) === 0,
    [Core.expMulByGap(4), Core.expMulByGap(9)]);
  ok('越级打怪不给额外经验', Core.expMulByGap(-10) === 1, Core.expMulByGap(-10));

  ok('普通怪金币：差 4 全额', Core.goldMulByGapNormal(4) === 1, Core.goldMulByGapNormal(4));
  ok('普通怪金币：差 5 减半', Core.goldMulByGapNormal(5) === 0.5, Core.goldMulByGapNormal(5));
  ok('普通怪金币：差 10 归零', Core.goldMulByGapNormal(10) === 0, Core.goldMulByGapNormal(10));

  // 普通怪：差 5 金币减半；精英不受影响
  dl.enterRoom('field1');
  dl.P.lv = 6; // 鸡 lv1 → gap 5
  dl.P.exp = 0;
  dl.P.gold = 1000;
  const esGap = dl.enemies();
  esGap.length = 0;
  const chickGap = dl.makeEnemy(DATA.MON.find((m) => m.id === 'chicken'), 'normal');
  chickGap.x = dl.P.x + 1; chickGap.y = dl.P.y; chickGap.hp = 1; chickGap.gold = 100; chickGap.goldP = 1;
  esGap.push(chickGap);
  const g0 = dl.P.gold;
  dl.setKillFromFarm(false);
  dl.attack(99, '金币半');
  ok('差 5 打鸡：金币约一半', dl.P.gold === g0 + 50, [g0, dl.P.gold]);
  dl.P.lv = 11; // gap 10
  const chickTen = dl.makeEnemy(DATA.MON.find((m) => m.id === 'chicken'), 'normal');
  chickTen.x = dl.P.x + 1; chickTen.y = dl.P.y; chickTen.hp = 1; chickTen.gold = 100; chickTen.goldP = 1;
  esGap.push(chickTen);
  const g1 = dl.P.gold;
  dl.attack(99, '金币零');
  ok('差 10 打鸡：0 金币', dl.P.gold === g1, [g1, dl.P.gold]);
  const eliteGap = dl.makeEnemy(DATA.MON.find((m) => m.id === 'chicken'), 'elite');
  eliteGap.x = dl.P.x + 1; eliteGap.y = dl.P.y; eliteGap.hp = 1; eliteGap.gold = 80; eliteGap.goldP = 1;
  esGap.push(eliteGap);
  const g2 = dl.P.gold;
  dl.attack(99, '精英金币');
  ok('差 10 打精英：仍有金币', dl.P.gold > g2, [g2, dl.P.gold]);

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
  ok('S 掉率收紧', DATA.DROP.normal.s === 0.0001 && DATA.DROP.elite.s === 0.002 &&
    DATA.DROP.rare.s === 0.03 && DATA.DROP.boss.s === 0.06, DATA.DROP);
  {
    let aFromNormal = 0, aFromElite = 0, aFromRare = 0;
    const chick = DATA.MON.find((m) => m.id === 'chicken');
    for (let i = 0; i < 800; i++) {
      const n = dl.makeEnemy(chick, 'normal');
      for (const eq of dl.rollKillEquipDrops(n, false)) {
        if (eq.kind === 'skillbook') continue;
        if (eq.rarity === 'yellow' || eq.rarity === 'orange') aFromNormal++;
      }
      const el = dl.makeEnemy(chick, 'elite');
      for (const eq of dl.rollKillEquipDrops(el, false)) {
        if (eq.kind === 'skillbook') continue;
        if (eq.rarity === 'yellow') aFromElite++;
      }
      const rr = dl.makeEnemy(chick, 'rare');
      for (const eq of dl.rollKillEquipDrops(rr, false)) {
        if (eq.kind === 'skillbook') continue;
        if (eq.rarity === 'yellow') aFromRare++;
      }
    }
    ok('1–10 普通不掉 A/S', aFromNormal === 0, aFromNormal);
    ok('1–10 精英不掉 A（仍保底 B）', aFromElite === 0, aFromElite);
    ok('1–10 稀有仍掉 A', aFromRare >= 700, aFromRare);
  }

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
  // 界面显示基础区间（词缀未鉴定）；战斗仍吃词缀
  ok('界面显示基础防御', dl.eqStatText(eqA) === '防御 4-7 · HP +39', dl.eqStatText(eqA));
  {
    const C = sandbox.DL.Core;
    ok('词缀仍计入战斗防御', C.eqDefMin(eqA) === 5 && C.eqDefMax(eqA) === 8, [C.eqDefMin(eqA), C.eqDefMax(eqA)]);
  }
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

  /* ============ M1.21 挂机 / 刷新 / BOSS 被动 / 收益刹车 ============ */
  ok('挂机常量存在（无收益折扣）', DATA.AUTO_FARM && DATA.AUTO_FARM.expMul == null && DATA.RESPAWN.eliteCap === 2,
    DATA.AUTO_FARM);
  ok('精英/稀有随机保底上限', DATA.RESPAWN.elitePityMax === 50 && DATA.RESPAWN.rarePityMax === 200,
    DATA.RESPAWN);
  ok('挂机档经验曲线', DATA.GROWTH.expBase === 180 && DATA.GROWTH.expRate === 1.20, DATA.GROWTH);
  ok('走路比打怪快', DATA.MOVE_MS < DATA.COMBAT_MS && DATA.WALK_STEP_MS <= DATA.MOVE_MS,
    [DATA.COMBAT_MS, DATA.MOVE_MS, DATA.WALK_STEP_MS]);
  ok('走路对齐规则 0.18s/格', DATA.WALK_STEP_MS === 180 && DATA.MOVE_MS === 180,
    [DATA.WALK_STEP_MS, DATA.MOVE_MS]);
  // 对冲键：保留先按，忽略后按（不定住）
  if (typeof dl.pressMoveKey === 'function' && typeof dl.heldMoveDelta === 'function') {
    dl.releaseMoveKey('a'); dl.releaseMoveKey('d');
    dl.releaseMoveKey('w'); dl.releaseMoveKey('s');
    dl.pressMoveKey('a');
    dl.pressMoveKey('d');
    let [dx] = dl.heldMoveDelta();
    ok('左右对冲保留先按', dx === -1, dx);
    dl.releaseMoveKey('a'); dl.releaseMoveKey('d');
    dl.pressMoveKey('d');
    dl.pressMoveKey('a');
    [dx] = dl.heldMoveDelta();
    ok('左右对冲后按忽略', dx === 1, dx);
    dl.releaseMoveKey('a'); dl.releaseMoveKey('d');
    dl.pressMoveKey('w');
    dl.pressMoveKey('s');
    let [, dy] = dl.heldMoveDelta();
    ok('上下对冲保留先按', dy === -1, dy);
    dl.releaseMoveKey('w'); dl.releaseMoveKey('s');
  }
  if (typeof dl.walkStepDur === 'function') {
    const card = dl.walkStepDur(1, 0);
    const diag = dl.walkStepDur(1, 1);
    ok('直斜同拍', card === diag && card === DATA.WALK_STEP_MS, [card, diag]);
    ok('直走约 5.56 格/s', Math.abs(1000 / card - 1000 / 180) < 0.05, [card, 1000 / card]);
  }
  // 步闸：本格走完前再 move 只转面，不换格（防加速/冲锋）
  {
    dl.genHub();
    const x0 = dl.P.x, y0 = dl.P.y;
    const a = dl.move(1, 0) || dl.move(0, 1) || dl.move(-1, 0) || dl.move(0, -1);
    ok('开步成功', a === true, a);
    const first = { x: dl.P.x, y: dl.P.y };
    const tdx = dl.P.x !== x0 ? 0 : 1;
    const tdy = dl.P.x !== x0 ? 1 : 0;
    const b = dl.move(tdx, tdy);
    ok('步中变向吞下输入', b === true, b);
    ok('步中不变格', dl.P.x === first.x && dl.P.y === first.y, [first, dl.P.x, dl.P.y]);
    dl.move(1, 0); dl.move(0, 1); dl.move(-1, 0); dl.move(0, -1); dl.move(1, 1);
    ok('连敲不加速', dl.P.x === first.x && dl.P.y === first.y, [first, dl.P.x, dl.P.y]);
  }
  // 移动中改路径：步忙时 walk 应挂起等待，不吞点、不瞬移
  if (typeof dl.walkPath === 'function') {
    ['intro', 'shop', 'menu', 'char', 'over', 'doorConfirm', 'lootPick',
      'stash', 'bookShop', 'trial', 'sfxGate'].forEach((id) => {
      const n = sandbox.document.getElementById(id);
      if (n) n.hidden = true;
    });
    dl.genHub();
    const ox = dl.P.x, oy = dl.P.y;
    const stepped = dl.move(1, 0) || dl.move(0, 1) || dl.move(-1, 0) || dl.move(0, -1);
    ok('改路径前先走一步', stepped === true, stepped);
    if (stepped) {
      const px = dl.P.x, py = dl.P.y;
      const sdx = Math.sign(px - ox) || 1;
      const sdy = Math.sign(py - oy);
      const n1 = { x: px + sdx, y: py + sdy };
      const n2 = { x: px + sdx * 2, y: py + sdy * 2 };
      dl.walkPath([n1, n2]);
      ok('改路径当帧不瞬移', dl.P.x === px && dl.P.y === py, [px, py, dl.P.x, dl.P.y]);
      ok('改路径时步闸仍忙', dl.walkBusy() === true, dl.walkBusy());
      ok('改路径已挂起或在走', dl.walking() === true || dl.walkBusy() === true, [dl.walking(), dl.walkBusy()]);
      // 桩里 setTimeout 不点火，收掉挂起的 walk，免得挡住后面 autoStep
      dl.stopWalk();
      dl.setPos(dl.P.x, dl.P.y);
    }
  }
  // A5：一步内画面在 from→to 之间，落点与逻辑格一致
  {
    dl.genHub();
    const x0 = dl.P.x, y0 = dl.P.y;
    const moved = dl.move(1, 0) || dl.move(0, 1) || dl.move(-1, 0) || dl.move(0, -1);
    ok('A5 能走出一步', moved === true, moved);
    if (moved && typeof dl.step === 'function') {
      const s = dl.step();
      ok('A5 step 有坐标', s && Number.isFinite(s.x) && Number.isFinite(s.y), s);
      ok('A5 逻辑已落格', Math.abs(dl.P.x - x0) + Math.abs(dl.P.y - y0) === 1, [dl.P.x, dl.P.y, x0, y0]);
      // 插值终点应是新格中心（允许仍在滑：靠近 to）
      const tx = dl.P.x + 0.5, ty = dl.P.y + 0.5;
      const fx = x0 + 0.5, fy = y0 + 0.5;
      const onSeg = Math.abs((s.x - fx) * (ty - fy) - (s.y - fy) * (tx - fx)) < 0.05
        || (Math.abs(s.x - tx) < 0.05 && Math.abs(s.y - ty) < 0.05);
      ok('A5 画面在步线段上', onSeg, s);
      dl.setPos(dl.P.x, dl.P.y);
      const snapped = dl.step();
      ok('A5 snap 后贴逻辑格', snapped && Math.abs(snapped.x - (dl.P.x + 0.5)) < 1e-6
        && Math.abs(snapped.y - (dl.P.y + 0.5)) < 1e-6, snapped);
      // 步中变向：逻辑格不动，画面继续沿本格滑（不冲锋）
      dl.genHub();
      const ax = dl.P.x, ay = dl.P.y;
      const m1 = dl.move(1, 0) || dl.move(0, 1);
      ok('A5 转向前先走一步', m1 === true, m1);
      if (m1) {
        const before = dl.step();
        const px = dl.P.x, py = dl.P.y;
        const tdx = dl.P.x !== ax ? 0 : 1;
        const tdy = dl.P.x !== ax ? 1 : 0;
        const m2 = dl.move(tdx, tdy);
        const after = dl.step();
        ok('A5 步中变向吞输入', m2 === true, m2);
        ok('A5 步中逻辑不换格', dl.P.x === px && dl.P.y === py, [px, py, dl.P.x, dl.P.y]);
        const jump = Math.hypot(after.x - before.x, after.y - before.y);
        ok('A5 步中画面不冲锋', jump < 0.2, [jump, before, after]);
      }
    } else {
      ok('A5 step 暴露', typeof dl.step === 'function');
    }
  }

  /* 八向移动 */
  const W = sandbox.window.DL.World;
  ok('切比雪夫：斜邻距离 1', Core.dist({ x: 0, y: 0 }, { x: 1, y: 1 }) === 1);
  ok('斜贴身判定', C.isAdjacent(5, 5, 6, 6) === true && C.isAdjacent(5, 5, 7, 5) === false);
  {
    // 3×3 空地，中间周围全空；从角到对角
    const m = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const path = W.bfs(m, 0, 0, 2, 2, null);
    ok('八向寻路斜切更短', path && path.length === 2, path && path.length);
    ok('对角全斜走', path && path[0].x === 1 && path[0].y === 1 && path[1].x === 2 && path[1].y === 2, path);
    ok('可斜步', W.canStep(m, 0, 0, 1, 1) === true);
    // 等长路径（切比雪夫）：应先斜再直，不能先直再斜
    const skew = W.bfs(m, 0, 0, 2, 1, null);
    ok('斜点不先直走', skew && skew.length === 2 && skew[0].x === 1 && skew[0].y === 1, skew);
    // 正右/正下方的等长路径必须成一条直线：BFS 按「朝目标」排序后，
    // 不再先斜出去两格再拐回来（点地走到一半看着像绕路）
    const open5 = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const straight = W.bfs(open5, 0, 0, 4, 0, null);
    ok('正右方走直线', straight && straight.length === 4 && straight.every((s) => s.y === 0), straight);
    const straightDown = W.bfs(open5, 0, 0, 0, 4, null);
    ok('正下方走直线', straightDown && straightDown.length === 4 && straightDown.every((s) => s.x === 0), straightDown);
    const wallCorner = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];
    ok('穿角禁止', W.canStep(wallCorner, 0, 0, 1, 1) === false);
    const chase = C.nextStep(0, 0, 2, 2, () => false, m);
    ok('怪优先斜追', chase && chase.x === 1 && chase.y === 1, chase);
  }
  ok('farmEligible：普通/精英可挂，稀有/BOSS 否',
    C.farmEligible({ hp: 1, rare: false, boss: false }) === true &&
    C.farmEligible({ hp: 1, elite: true, rare: false, boss: false }) === true &&
    C.farmEligible({ hp: 1, rare: true, boss: false }) === false &&
    C.farmEligible({ hp: 1, boss: true }) === false);

  dl.genHub();
  ok('主城默认挂机关', dl.autoFarm() === false);
  dl.setAutoFarm(true);
  ok('主城不能开挂机', dl.autoFarm() === false);

  dl.enterRoom('field1');
  ['intro', 'shop', 'menu', 'char', 'over', 'doorConfirm', 'lootPick'].forEach((id) => {
    sandbox.document.getElementById(id).hidden = true;
  });
  ok('进房挂机默认关', dl.autoFarm() === false);
  // 挂机关：靠近未开战不自动打；开战后方打；未开战不锁走位
  {
    dl.resetEnemyClock();
    const es = dl.enemies();
    es.length = 0;
    const chick = dl.makeEnemy(DATA.MON.find((m) => m.id === 'chicken'), 'normal');
    chick.x = dl.P.x + 1; chick.y = dl.P.y; chick.hp = 50;
    es.push(chick);
    const hp0 = chick.hp;
    dl.tick();
    ok('靠近未开战不自动打', chick.hp === hp0, [chick.hp, hp0]);
    ok('未开战贴身不锁战', dl.inCombat() === false);
    // 竖着走开，避免踩左侧出口门回城
    const py = dl.P.y;
    const walked = dl.move(0, -1) || (dl.setPos(chick.x - 1, chick.y), dl.move(0, 1));
    ok('未开战可走开', walked === true && dl.P.y !== py);
    dl.setPos(chick.x - 1, chick.y);
    dl.engage(chick);
    ok('交战后锁战', chick.playerEngaged === true && dl.inCombat() === true);
    ok('交战后不能朝空地走', dl.move(0, -1) === false);
    dl.setPos(chick.x - 1, chick.y);
    chick.playerEngaged = true;
    dl.tick();
    ok('开战贴身后自动打', chick.hp < hp0, [chick.hp, hp0]);
  }
  ok('怪追击间隔 1 秒', DATA.ENEMY_ACT_MS === 1000, DATA.ENEMY_ACT_MS);
  // 挂机关：远处有怪时警戒推进回合，主动怪会追
  {
    ['intro', 'shop', 'menu', 'char', 'over', 'doorConfirm', 'lootPick', 'bookShop'].forEach((id) => {
      sandbox.document.getElementById(id).hidden = true;
    });
    if (!dl.currentRoom()) dl.enterRoom('field1');
    dl.resetEnemyClock();
    const es = dl.enemies();
    es.length = 0;
    const dog = dl.makeEnemy(DATA.MON.find((m) => m.id === 'dog'), 'normal');
    dog.x = dl.P.x + 5; dog.y = dl.P.y; dog.hp = 50; dog.aggro = 8;
    es.push(dog);
    const turn0 = dl.state().turn;
    const x0 = dog.x;
    dl.tick();
    ok('挂机关有怪警戒推进', dl.state().turn > turn0, dl.state().turn - turn0);
    ok('挂机关警戒主动怪会追', Math.abs(dog.x - dl.P.x) < Math.abs(x0 - dl.P.x), [dog.x, x0]);
  }
  {
    dl.P.skills.half = true;
    dl.P.cd.half = 0;
    dl.P.mp = 100;
    const es = dl.enemies();
    es.length = 0;
    const rare = dl.makeEnemy(DATA.MON.find((m) => m.id === 'chicken'), 'rare');
    rare.x = dl.P.x + 1;
    rare.y = dl.P.y;
    rare.hp = 999;
    es.push(rare);
    dl.halfMoon();
    ok('半月不命中稀有', rare.hp === 999 && rare.playerEngaged === false, [rare.hp, rare.playerEngaged]);
  }
  // pause 后 resume 必须重启世界时钟（否则房内补刷停死）
  {
    dl.pauseAuto();
    ok('pause 停时钟', dl.clockTimerOn() === false);
    dl.resumeAuto();
    ok('resume 重启时钟', dl.clockTimerOn() === true);
  }
  dl.setAutoFarm(true);
  ok('房内可开挂机', dl.autoFarm() === true);

  // 挂机不选稀有/BOSS
  const esF = dl.enemies();
  esF.length = 0;
  const rareF = dl.makeEnemy(DATA.MON.find((m) => m.id === 'chicken'), 'rare');
  rareF.x = dl.P.x + 1; rareF.y = dl.P.y; rareF.aggro = 5;
  esF.push(rareF);
  ok('挂机时最近目标忽略稀有', dl.nearestFarmEnemy() === null);
  ok('挂机贴身目标忽略稀有', dl.adjacentFarmTarget() === null);
  const bossF = dl.makeEnemy(DATA.BOSS, 'boss');
  bossF.x = dl.P.x + 1; bossF.y = dl.P.y;
  esF.push(bossF);
  ok('挂机贴身目标忽略 BOSS', dl.adjacentFarmTarget() === null);

  // 稀有刷出/靠近都不关挂机（玩家自己关）
  ['intro', 'shop', 'menu', 'char', 'over', 'doorConfirm', 'lootPick'].forEach((id) => {
    sandbox.document.getElementById(id).hidden = true;
  });
  dl.setAutoFarm(true);
  dl.onRareSpawned(rareF);
  ok('稀有刷出不关挂机', dl.autoFarm() === true);
  rareF.x = dl.P.x + 1; rareF.y = dl.P.y;
  ok('稀有威胁仍可检测', !!dl.rareThreatNear());
  dl.tick();
  ok('稀有靠近不关挂机', dl.autoFarm() === true);

  // 挂机无收益折扣（与手打同）
  dl.enterRoom('field1');
  ['intro', 'shop', 'menu', 'char', 'over', 'doorConfirm', 'lootPick'].forEach((id) => {
    sandbox.document.getElementById(id).hidden = true;
  });
  const esKill = dl.enemies();
  esKill.length = 0;
  dl.P.lv = 1;
  dl.P.exp = 0;
  dl.rest();
  const chick = dl.makeEnemy(DATA.MON.find((m) => m.id === 'chicken'), 'normal');
  chick.x = dl.P.x + 1; chick.y = dl.P.y; chick.hp = 1; chick.exp = 100; chick.gold = 100; chick.goldP = 1;
  esKill.push(chick);
  const exp0 = dl.P.exp, gold0 = dl.P.gold;
  dl.setKillFromFarm(true);
  dl.attack(99, '挂机测');
  const expGain = dl.P.exp - exp0;
  const goldGain = dl.P.gold - gold0;
  ok('挂机击杀经验全额', expGain === 100, expGain);
  ok('挂机击杀金币全额', goldGain === 100, goldGain);

  // 自动捡袋：≤B 可捡，A/S 否
  const bagB = { items: [dl.makeEquip('weapon', 5, 'blue')], relic: false };
  const bagA = { items: [dl.makeEquip('weapon', 5, 'yellow')], relic: false };
  const bagS = { items: [dl.makeEquip('weapon', 5, 'orange')], relic: false };
  ok('B 袋可自动捡', dl.bagAutoLootable(bagB) === true);
  ok('A 袋可自动捡', dl.bagAutoLootable(bagA) === true);
  ok('S 袋不自动捡', dl.bagAutoLootable(bagS) === false);

  // 补刷：死后 5s 才补，不立刻灌密度
  ok('普通补刷延迟 5s', DATA.RESPAWN.normalDelayMs === 5000, DATA.RESPAWN.normalDelayMs);
  dl.enterRoom('field1');
  const spec1 = dl.roomSpec('field1');
  dl.enemies().length = 0;
  dl.tryRoomRespawn();
  ok('无死亡队列不灌怪', dl.enemies().filter((e) => e.hp > 0).length === 0);
  const respawnT0 = 1_000_000;
  dl.queueNormalRespawn(respawnT0 + 5000);
  ok('死后入队', dl.respawnPending() === 1, dl.respawnPending());
  dl.tryRoomRespawn(respawnT0 + 1000);
  ok('未满 5s 不刷', dl.enemies().filter((e) => e.hp > 0).length === 0 && dl.respawnPending() === 1);
  dl.tryRoomRespawn(respawnT0 + 5000);
  const afterFill = dl.enemies().filter((e) => e.hp > 0 && !e.boss && !e.elite && !e.rare).length;
  ok('满 5s 补 1 只', afterFill === 1, afterFill);
  ok('补后队列清空', dl.respawnPending() === 0);
  // 满员不再排队
  dl.enemies().length = 0;
  for (let i = 0; i < spec1.mobs; i++) dl.spawnOneInRoom('normal');
  dl.queueNormalRespawn();
  ok('满员不排队', dl.respawnPending() === 0, [dl.respawnPending(), spec1.mobs]);

  // 随机保底：阈值 ∈[1,50]/[1,200]；杀满阈值必出
  dl.enterRoom('field1');
  dl.enemies().length = 0;
  ok('精英阈值在 1～50', dl.eliteThreshold() >= 1 && dl.eliteThreshold() <= 50, dl.eliteThreshold());
  ok('稀有阈值在 1～200', dl.rareThreshold() >= 1 && dl.rareThreshold() <= 200, dl.rareThreshold());
  // 强制阈值=3，验证到数必出并重掷
  dl.rollEliteThreshold();
  // 通过反复杀死重置直到我们能测：直接推进到阈值
  const need = dl.eliteThreshold();
  ok('开局精英还差=阈值', dl.eliteLeft() === need, [dl.eliteLeft(), need]);
  for (let i = 0; i < need - 1; i++) dl.onNormalKillProgress();
  ok('差 1 只时还差 1', dl.eliteLeft() === 1, dl.eliteLeft());
  dl.onNormalKillProgress();
  ok('到阈值必出精英', dl.enemies().some((e) => e.elite && e.hp > 0), dl.enemies().map((e) => e.grade));
  ok('出精英后重掷阈值', dl.eliteThreshold() >= 1 && dl.eliteThreshold() <= 50 && dl.killsToElite() === 0,
    [dl.eliteThreshold(), dl.killsToElite()]);
  ok('出精英后还差=新阈值', dl.eliteLeft() === dl.eliteThreshold(), [dl.eliteLeft(), dl.eliteThreshold()]);
  // 稀有：杀满 rareThreshold
  dl.enemies().length = 0;
  const rNeed = dl.rareThreshold();
  for (let i = 0; i < rNeed; i++) dl.onNormalKillProgress();
  ok('到稀有阈值必出稀有', dl.enemies().some((e) => e.rare && e.hp > 0), dl.enemies().map((e) => e.grade));
  ok('出稀有后计数清零', dl.killsToRare() === 0, dl.killsToRare());
  ok('出稀有后还差=新阈值', dl.rareLeft() === dl.rareThreshold()
    || dl.enemies().some((e) => e.rare && e.hp > 0), // 稀有在场时 rareLeft 为 0
    [dl.rareLeft(), dl.rareThreshold()]);

  // BOSS CD：击杀记时，CD 内重进不刷
  dl.enterRoom('cave1');
  ok('进洞有首领', dl.enemies().some((e) => e.boss && e.hp > 0));
  const bLive = dl.enemies().find((e) => e.boss && e.hp > 0);
  bLive.hp = 1;
  bLive.x = dl.P.x + 1;
  bLive.y = dl.P.y;
  dl.setKillFromFarm(false);
  dl.P.lv = 20;
  dl.rest();
  dl.attack(999, '手砍首领');
  ok('击杀首领记 CD', Number.isFinite(dl.roomClearedAt().cave1), dl.roomClearedAt().cave1);
  dl.continueAfterWin();
  dl.enterRoom('cave1');
  ok('Boss CD 内重进无活首领', !dl.enemies().some((e) => e.boss && e.hp > 0),
    dl.enemies().filter((e) => e.boss).map((e) => e.hp));
  // 房内 try 也不该刷出来（仍在 CD）
  for (let i = 0; i < 3; i++) dl.tryRoomRespawn();
  ok('Boss CD 内补刷新不出首领', !dl.enemies().some((e) => e.boss && e.hp > 0));

  // BOSS 未激怒不主动攻击（清 CD 后刷一只再测）
  // 把清除时间拨到很久以前：重新进房前改存档里的 cleared——用 leave 空房 + 拨 clock
  dl.genHub();
  dl.enterRoom('field2'); // 无 BOSS 房，测被动用 makeEnemy
  const esP = dl.enemies();
  esP.length = 0;
  const passiveBoss = dl.makeEnemy(DATA.BOSS, 'boss');
  passiveBoss.x = dl.P.x + 1;
  passiveBoss.y = dl.P.y;
  passiveBoss.aggroOn = false;
  esP.push(passiveBoss);
  const hpBefore = dl.P.hp;
  dl.resetEnemyClock();
  dl.enemiesTurn();
  ok('BOSS 未激怒不打人', dl.P.hp === hpBefore, [hpBefore, dl.P.hp]);
  passiveBoss.aggroOn = true;
  dl.resetEnemyClock();
  dl.enemiesTurn();
  ok('BOSS 激怒后会打人', dl.P.hp < hpBefore, [hpBefore, dl.P.hp]);

  dl.setAutoFarm(false);
  dl.genHub();

  /* 仓库：主城 100 格，只存装备，房间里没有 */
  ok('没靠近打不开仓库', dl.openStash() === false);
  const keeper = dl.stashNpc();
  ok('主城有仓库', !!(keeper && Number.isFinite(keeper.x)), keeper);
  dl.setPos(keeper.x, keeper.y);
  const sword = dl.makeEquip('weapon', 1, 'white');
  dl.P.bag = [sword];
  dl.P.stash = [];
  ok('靠近仓库能打开', dl.openStash() === true);
  ok('存入背包的装备', dl.depositFromBag(0) === true && dl.P.bag.length === 0 && dl.P.stash[0] === sword);
  ok('取出回到背包', dl.withdrawFromStash(0) === true && dl.P.bag[0] === sword && dl.P.stash.length === 0);
  dl.P.stash = Array.from({ length: dl.STASH_MAX }, () => dl.makeEquip('weapon', 1, 'white'));
  dl.P.bag = [dl.makeEquip('weapon', 1, 'blue')];
  ok('仓库满了不能再存', dl.depositFromBag(0) === false && dl.P.bag.length === 1 && dl.P.stash.length === dl.STASH_MAX);
  dl.P.bag = Array.from({ length: dl.BAG_MAX }, () => dl.makeEquip('armor', 1, 'white'));
  ok('背包满了不能取出', dl.withdrawFromStash(0) === false && dl.P.bag.length === dl.BAG_MAX && dl.P.stash.length === dl.STASH_MAX);
  const locked = dl.makeEquip('weapon', 5, 'yellow');
  locked.locked = true;
  dl.P.stash = [];
  dl.P.bag = [locked];
  ok('锁定装备可以存', dl.depositFromBag(0) === true && dl.P.stash[0] && dl.P.stash[0].locked === true);
  dl.save();
  dl.P.stash = [];
  ok('读档恢复仓库', dl.load() === true && dl.P.stash.length === 1 && dl.P.stash[0].locked === true);
  dl.enterRoom('field1');
  ok('房间里没有仓库', dl.stashNpc() == null);
  ok('房间里打不开仓库', dl.openStash() === false);
  dl.genHub();
} catch (err) {
  fail++;
  lines.push('  FAIL 异常：' + (err && err.stack ? err.stack.split('\n')[0] : err));
}

console.log(lines.join('\n'));
console.log('');
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
