const C = require('./combat.js');

let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error('FAIL', name);
  }
}

function unit(partial) {
  return Object.assign({
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 0,
    alive: true,
    row: 'front',
    col: 0,
  }, partial);
}

function field() {
  return [
    unit({ id: 'tank', name: '大剑士', side: 'player', row: 'front', col: 1, atk: 20, hp: 200, maxHp: 200 }),
    unit({ id: 'aurora', name: '极光', side: 'player', row: 'back', col: 0, atk: 30 }),
    unit({ id: 'moon', name: '月光', side: 'player', row: 'back', col: 2, atk: 8 }),
    unit({ id: 'ef0', name: '前排甲', side: 'enemy', row: 'front', col: 0, hp: 50, maxHp: 50 }),
    unit({ id: 'ef2', name: '前排乙', side: 'enemy', row: 'front', col: 2, hp: 50, maxHp: 50 }),
    unit({ id: 'eb1', name: '后排', side: 'enemy', row: 'back', col: 1, hp: 40, maxHp: 40, atk: 15 }),
  ];
}

const zero = function () { return 0; };

const units = field();
const auto = C.strike(units, 'tank', { type: 'auto' }, zero);
check('自动攻击打前排第一格', auto.ok && auto.hits.length === 1 && auto.hits[0].id === 'ef0');

const denied = C.strike(units, 'tank', { type: 'pick', targetId: 'eb1' }, zero);
check('前排还在时选取后排失败', !denied.ok && denied.reason === '前排还在' && units.find((u) => u.id === 'eb1').hp === 40);

const picked = C.strike(units, 'aurora', { type: 'pick', targetId: 'ef2' }, zero);
check('选取前排可以打中', picked.ok && picked.hits[0].id === 'ef2' && picked.hits[0].damage === 30);

units.forEach((u) => {
  if (u.side === 'enemy' && u.row === 'front') u.alive = false;
});
const ontoBack = C.strike(units, 'tank', { type: 'auto' }, zero);
check('前排清空后自动攻击打后排', ontoBack.ok && ontoBack.hits[0].id === 'eb1');

const again = field();
const backHit = C.strike(again, 'aurora', { type: 'back' }, zero);
check('后排技能在前排还活着时打得到后排', backHit.ok && backHit.hits[0].id === 'eb1' && backHit.hits[0].damage === 90);
check('前排没被后排技能误伤', again.find((u) => u.id === 'ef0').hp === 50);

again.forEach((u) => {
  if (u.row === 'back' && u.side === 'enemy') {
    u.alive = false;
    u.hp = 0;
  }
});
const whiff = C.strike(again, 'aurora', { type: 'back' }, zero);
check('后排没人则落空且不改打前排', whiff.ok && whiff.reason === '落空' && whiff.hits.length === 0);
check('落空不扣前排血', again.find((u) => u.id === 'ef0').hp === 50);

const rowUnits = field();
const rowHit = C.strike(rowUnits, 'moon', { type: 'row', row: 'back' }, zero);
check('群攻可以在前排还活着时打后排', rowHit.ok && rowHit.hits.length === 1 && rowHit.hits[0].id === 'eb1');

const dead = C.strike(rowUnits, 'ef0', { type: 'auto' }, zero);
rowUnits.find((u) => u.id === 'tank').hp = 0;
rowUnits.find((u) => u.id === 'tank').alive = false;
const deadStrike = C.strike(rowUnits, 'tank', { type: 'auto' }, zero);
check('倒下的人不能攻击', !deadStrike.ok && deadStrike.reason === '无法行动');
check('敌方自动攻击函数有返回', dead.ok);

const once = field();
once.find(function (u) { return u.id === 'tank'; }).acted = true;
const second = C.strike(once, 'tank', { type: 'auto' }, zero);
check('本回合已经攻击过就不能再打', !second.ok && second.reason === '本回合已攻击');

const orderUnits = field();
check('前排左是 1 号', C.slotOf(orderUnits.find(function (u) { return u.id === 'ef0'; })) === 1);
check('前排中是 2 号', C.slotOf(orderUnits.find(function (u) { return u.id === 'tank'; })) === 2);
check('后排左是 4 号', C.slotOf(orderUnits.find(function (u) { return u.id === 'aurora'; })) === 4);
check('敌方后排中是 5 号', C.slotOf(orderUnits.find(function (u) { return u.id === 'eb1'; })) === 5);
check('第一手是第一排的前排甲', C.nextActor(orderUnits).id === 'ef0');
orderUnits.find(function (u) { return u.id === 'ef0'; }).acted = true;
check('前排甲出手后轮到 2 号大剑士', C.nextActor(orderUnits).id === 'tank');

const actedRage = field();
const aurora = actedRage.find(function (u) { return u.id === 'aurora'; });
aurora.acted = true;
aurora.rage = 100;
aurora.rageSkill = 'back';
const rageHit = C.strike(actedRage, 'aurora', { type: 'back', asRage: true }, zero);
check('怒气不占本回合那次普攻', rageHit.ok && rageHit.hits[0].id === 'eb1');

function ragePair() {
  return [
    unit({ id: 'aurora', name: '极光', side: 'player', row: 'back', col: 0, rage: 1000, rageSkill: 'back' }),
    unit({ id: 'ef0', name: '前排甲', side: 'enemy', row: 'front', col: 0, rage: 1000, rageSkill: 'back' }),
  ];
}

const manualFirst = ragePair();
const pressed = C.enqueueRage([], manualFirst[0], 0);
const enemyAfter = C.enqueueReady(pressed.queue, manualFirst, pressed.seq, { playerAuto: false });
check('先按的极光排在敌方前面', enemyAfter.queue.map(function (item) { return item.id; }).join(',') === 'aurora,ef0');
const firstCast = C.takeRage(enemyAfter.queue, manualFirst);
check('队列先放极光', firstCast.unit.id === 'aurora' && firstCast.queue[0].id === 'ef0');

const enemyFirst = ragePair();
const enemyQueued = C.enqueueReady([], enemyFirst, 0, { playerAuto: false });
const playerLate = C.enqueueRage(enemyQueued.queue, enemyFirst[0], enemyQueued.seq);
check('敌方先排，我方要等', playerLate.queue.map(function (item) { return item.id; }).join(',') === 'ef0,aurora');
const doomed = ragePair();
const doomedMe = C.enqueueRage([], doomed[0], 0);
const doomedThem = C.enqueueReady(doomedMe.queue, doomed, doomedMe.seq, { playerAuto: false });
doomed[0].hp = 0;
doomed[0].alive = false;
const skipDead = C.takeRage(doomedThem.queue, doomed);
check('排队的人倒下就跳过，改放后面的敌方', skipDead.unit.id === 'ef0' && skipDead.queue.length === 0);

const notFull = unit({ id: 'moon', name: '月光', side: 'player', rage: 50, rageSkill: 'back' });
check('怒气没满不能排', !C.enqueueRage([], notFull, 0).ok);
const twice = C.enqueueRage([], manualFirst[0], 0);
check('同一个人不能排两遍', !C.enqueueRage(twice.queue, manualFirst[0], twice.seq).ok);

const autoBoth = C.enqueueReady([], ragePair(), 0, { playerAuto: true });
check('开自动时同一时刻按号位，第一排的前排甲先于后排极光', autoBoth.queue.map(function (item) { return item.id; }).join(',') === 'ef0,aurora');
const manualOnlyEnemy = C.enqueueReady([], ragePair(), 0, { playerAuto: false });
check('没开自动时不会替我方排队', manualOnlyEnemy.queue.length === 1 && manualOnlyEnemy.queue[0].id === 'ef0');

check('掉四成血加 400 怒', C.rageOnHurt(100, 100, 60) === 400);
check('普攻 150，击杀 300，满 1000', C.RAGE_ON_ATTACK === 150 && C.RAGE_ON_KILL === 300 && C.RAGE_MAX === 1000);
const killed = field();
const finisher = C.strike(killed, 'aurora', { type: 'back', asRage: true }, zero);
check('击杀记在这一下上', finisher.hits[0].killed && finisher.hits[0].hpBefore === 40);
check('整条血打光加满 1000 怒', C.rageOnHurt(40, finisher.hits[0].hpBefore, finisher.hits[0].hp) === 1000);

// 紫垣：磐石架势
const guardField = [
  unit({ id: 'zhiyuan', name: '紫垣', side: 'player', row: 'front', col: 1, atk: 20, hp: 100, def: 0 }),
  unit({ id: 'ef', name: '敌人', side: 'enemy', row: 'front', col: 1, atk: 20 }),
];
const guardCast = C.strike(guardField, 'zhiyuan', { type: 'guard', asRage: true }, zero);
check('磐石架势不造成伤害', guardCast.ok && guardCast.hits.length === 0);
check('磐石架势给自己加防', guardField[0].guard === C.GUARD_DEF && C.effectiveDef(guardField[0]) === C.GUARD_DEF);
const guardedHit = C.strike(guardField, 'ef', { type: 'auto' }, zero);
check('护盾按加防后的防御结算', guardedHit.hits[0].damage === 20 - C.GUARD_DEF && guardField[0].hp === 100 - (20 - C.GUARD_DEF));

// 月光：月华治愈
const healField = [
  unit({ id: 'moon', name: '月光', side: 'player', row: 'back', col: 1, atk: 8, hp: 40 }),
  unit({ id: 'ally-back', name: '后排友', side: 'player', row: 'back', col: 0, hp: 40 }),
  unit({ id: 'ally-front', name: '前排友', side: 'player', row: 'front', col: 0, hp: 40 }),
  unit({ id: 'ef', name: '敌人', side: 'enemy', row: 'front', col: 1 }),
];
const healCast = C.strike(healField, 'moon', { type: 'heal-row', asRage: true }, zero);
check('月华治愈只治疗自己这一排', healCast.heals.length === 2 && !healCast.heals.some(function (h) { return h.id === 'ally-front'; }));
check('月华治愈含自己', healCast.heals.some(function (h) { return h.id === 'moon'; }));
check('治疗量按最大生命 25%', healCast.heals[0].heal === Math.round(100 * C.HEAL_RATIO));
check('治疗不超过满血', healField[0].hp === 65 && healField[1].hp === 65 && healField[2].hp === 40);

// 长虹：横扫一排
const sweepField = field();
const sweep = C.strike(sweepField, 'aurora', { type: 'row-sweep', asRage: true }, zero);
check('横扫前排时打整排前排', sweep.hits.length === 2 && sweep.hits.every(function (h) { return h.id === 'ef0' || h.id === 'ef2'; }));
check('横扫不误伤后排', sweepField.find(function (u) { return u.id === 'eb1'; }).hp === 40);
sweepField.forEach(function (u) { if (u.side === 'enemy' && u.row === 'front') { u.alive = false; u.hp = 0; } });
const sweepBack = C.strike(sweepField, 'aurora', { type: 'row-sweep', asRage: true }, zero);
check('前排清空后横扫打后排', sweepBack.hits.length === 1 && sweepBack.hits[0].id === 'eb1');

// 阔刃：只扫前排，前排没人落空
const frontSweepField = field();
frontSweepField.forEach(function (u) { if (u.side === 'enemy' && u.row === 'front') { u.alive = false; u.hp = 0; } });
const frontSweep = C.strike(frontSweepField, 'aurora', { type: 'front-sweep', asRage: true }, zero);
check('阔刃前排没人就落空', frontSweep.ok && frontSweep.reason === '落空' && frontSweep.hits.length === 0);
check('阔刃落空不打后排', frontSweepField.find(function (u) { return u.id === 'eb1'; }).hp === 40);

// 余烬：击杀后追击血最低
const execField = [
  unit({ id: 'yujin', name: '余烬', side: 'player', row: 'back', col: 1, atk: 30 }),
  unit({ id: 'ef', name: '前排', side: 'enemy', row: 'front', col: 1, hp: 5 }),
  unit({ id: 'eb-low', name: '后排残血', side: 'enemy', row: 'back', col: 0, hp: 20 }),
  unit({ id: 'eb-high', name: '后排满血', side: 'enemy', row: 'back', col: 2, hp: 80 }),
];
const exec = C.strike(execField, 'yujin', { type: 'execute', asRage: true }, zero);
check('余烬第一下击杀', exec.hits[0].killed);
check('余烬击杀后追击血最低', exec.hits.length === 2 && exec.hits[1].id === 'eb-low');
check('余烬追击不碰血高的', execField.find(function (u) { return u.id === 'eb-high'; }).hp === 80);

const execNoKill = field();
execNoKill.find(function (u) { return u.id === 'ef0'; }).hp = 999;
execNoKill.find(function (u) { return u.id === 'ef0'; }).maxHp = 999;
const execOne = C.strike(execNoKill, 'aurora', { type: 'execute', asRage: true }, zero);
check('余烬没击杀就没有第二下', execOne.hits.length === 1 && !execOne.hits[0].killed);

console.log('RESULT pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
