const Sim = require('./sim.js');
const D = require('./data.js');
const L = D.LAYOUT;

let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error('FAIL', name);
  }
}

function quiet(partial) {
  return Object.assign({
    startSun: 500,
    sunValue: 25,
    sunFallEvery: 9999,
    firstSun: 9999,
    waves: [{ delay: 9999, spawns: [{ kind: 'normal', row: 0, after: 0 }] }],
  }, partial || {});
}

function match(partial) {
  return Sim.createMatch({ level: quiet(partial), rng: function () { return 0.4; } });
}

function pump(state, sec) {
  const n = Math.round(sec / 0.1);
  for (let i = 0; i < n; i++) Sim.step(state, 0.1);
}

check('宽度对齐', L.LAWN_X + L.COLS * L.COL_W + L.SIDE_W === L.W);
check('高度对齐', L.ROWS * L.ROW_H === L.H);
const shovel = D.shovelRect();
check('铲子在画面内', shovel.y >= 0 && shovel.y + shovel.h <= L.H - 2);
let overlap = false;
for (let i = 0; i < D.CARDS.length; i++) {
  const a = D.packetRect(i);
  if (a.y + a.h > shovel.y) overlap = true;
  if (a.x < 0 || a.x + a.w > L.PANEL_W) overlap = true;
}
check('卡片和铲子分开，且在卡槽里', !overlap);

const s0 = match();
const none = Sim.useAt(s0, 1, 1);
check('没选卡种不下去', !none.ok && none.reason === '先点一张卡片');

const poor = match({ startSun: 40 });
const poorPick = Sim.pickCard(poor, 'pea');
check('阳光不够不能拿起', !poorPick.ok && poorPick.reason === '阳光不够' && poor.selected == null);

const hold = match();
Sim.pickCard(hold, 'wall');
hold.sun = 10;
const stay = Sim.pickCard(hold, 'pea');
check('钱不够时不换掉手里的卡', !stay.ok && hold.selected === 'wall');

const place = match();
const sunBefore = place.sun;
const picked = Sim.pickCard(place, 'pea');
const put = Sim.useAt(place, 2, 1);
check('选中豌豆豆', picked.ok && put.ok);
check('种下后扣阳光并放下卡', place.sun === sunBefore - 100 && place.selected == null && place.grid[2][1].kind === 'pea');

const again = Sim.pickCard(place, 'pea');
check('冷却中不能再选', !again.ok && again.reason === '还在冷却');
pump(place, 6.2);
const ready = Sim.pickCard(place, 'pea');
check('冷却结束可以再选', ready.ok && place.selected === 'pea');

Sim.pickCard(place, 'pea');
check('再点一次放下', place.selected == null);

const occ = match();
Sim.pickCard(occ, 'pea');
Sim.useAt(occ, 0, 1);
const sunOcc = occ.sun;
Sim.pickCard(occ, 'wall');
const blocked = Sim.useAt(occ, 0, 1);
check('格子上有豆豆就放不下去', !blocked.ok && blocked.reason === '这里已经有豆豆了');
check('放失败不扣阳光，卡还拿着', occ.sun === sunOcc && occ.selected === 'wall' && occ.grid[0][1].kind === 'pea');

const dig = match();
Sim.pickCard(dig, 'pea');
Sim.useAt(dig, 0, 1);
const sunDig = dig.sun;
Sim.pickShovel(dig);
const dug = Sim.useAt(dig, 0, 1);
check('铲子挖掉，不退阳光', dug.ok && !dig.grid[0][1] && dig.sun === sunDig && dig.selected == null);
Sim.pickShovel(dig);
const emptyDig = Sim.useAt(dig, 0, 2);
check('空地铲不动，铲子还拿着', !emptyDig.ok && emptyDig.reason === '这里没有豆豆' && dig.selected === 'shovel');

const lane = match();
Sim.pickCard(lane, 'pea');
Sim.useAt(lane, 2, 0);
Sim.spawnZombie(lane, 'normal', 2, D.cellCenterX(0) + 280);
Sim.spawnZombie(lane, 'normal', 1, D.cellCenterX(0) + 280);
const hpSame = lane.zombies.find(function (z) { return z.row === 2; }).hp;
const hpOther = lane.zombies.find(function (z) { return z.row === 1; }).hp;
pump(lane, 3);
check('豌豆只打同一行', lane.zombies.find(function (z) { return z.row === 2; }).hp < hpSame);
check('邻行不受豌豆影响', lane.zombies.find(function (z) { return z.row === 1; }).hp === hpOther);

const eat = match();
Sim.pickCard(eat, 'wall');
Sim.useAt(eat, 1, 4);
const wall = eat.grid[1][4];
const cx = D.cellCenterX(4);
Sim.spawnZombie(eat, 'normal', 1, cx + 26);
const x0 = eat.zombies[0].x;
pump(eat, 1.2);
check('走到嘴边就啃', wall.hp < wall.maxHp);
check('啃的时候停住', eat.zombies[0].hp > 0 && eat.zombies[0].x > x0 - 40);

const mow = match();
Sim.spawnZombie(mow, 'normal', 0, L.LAWN_X + 2);
Sim.step(mow, 0.05);
check('进门先推割草机', mow.mowers[0].launched && mow.result !== 'lose');
pump(mow, 0.4);
check('割草机清掉这一行', mow.zombies.every(function (z) { return z.row !== 0 || z.hp <= 0; }));
Sim.spawnZombie(mow, 'normal', 0, L.LAWN_X + 2);
pump(mow, 0.4);
check('同一行割草机用过再进门就输', mow.result === 'lose');

const sunDrop = match({ firstSun: 0.15, sunFallEvery: 9999, startSun: 10 });
pump(sunDrop, 0.3);
check('天上会掉阳光', sunDrop.suns.length >= 1);
const sunId = sunDrop.suns[0].id;
const got = Sim.collectSun(sunDrop, sunId);
check('点到阳光才入账', got.ok && sunDrop.sun === 35 && sunDrop.suns.length === 0);

const flower = match();
Sim.pickCard(flower, 'sun');
Sim.useAt(flower, 3, 0);
pump(flower, 10.3);
check('阳光豆会结阳光', flower.suns.some(function (sun) { return sun.kind === 'flower'; }));

const early = match();
Sim.pickCard(early, 'mine');
Sim.useAt(early, 3, 5);
Sim.spawnZombie(early, 'normal', 3, D.cellCenterX(5) + 8);
const zHp = early.zombies[0].hp;
pump(early, 0.8);
check('土豆雷没埋好不会炸', early.zombies[0] && early.zombies[0].hp === zHp && early.grid[3][5] && early.grid[3][5].hp < 300);

const armed = match();
Sim.pickCard(armed, 'mine');
Sim.useAt(armed, 3, 5);
pump(armed, 14.2);
check('土豆雷会埋好', armed.grid[3][5] && armed.grid[3][5].armed);
Sim.spawnZombie(armed, 'normal', 3, D.cellCenterX(5) + 8);
Sim.step(armed, 0.2);
check('埋好后踩上就炸', armed.zombies.every(function (z) { return z.hp <= 0; }) && !armed.grid[3][5]);

const boom = match();
Sim.pickCard(boom, 'cherry');
Sim.useAt(boom, 2, 4);
Sim.spawnZombie(boom, 'normal', 1, D.cellCenterX(4));
Sim.spawnZombie(boom, 'normal', 4, D.cellCenterX(4));
Sim.spawnZombie(boom, 'normal', 2, D.cellCenterX(8));
pump(boom, 1.1);
const near = boom.zombies.find(function (z) { return z.row === 1; });
const farRow = boom.zombies.find(function (z) { return z.row === 4; });
const farCol = boom.zombies.find(function (z) { return z.row === 2; });
check('樱桃炸到邻行', near && near.hp < near.maxHp);
check('樱桃炸不到隔一行', farRow && farRow.hp === farRow.maxHp);
check('樱桃炸不到远处的列', farCol && farCol.hp === farCol.maxHp);

const ice = match();
Sim.pickCard(ice, 'ice');
Sim.useAt(ice, 2, 0);
Sim.spawnZombie(ice, 'normal', 2, D.cellCenterX(0) + 240);
pump(ice, 2.4);
const iced = ice.zombies.find(function (z) { return z.row === 2; });
check('冰豆打中会变慢', iced && iced.hp < iced.maxHp && iced.slow > 0);

const winLevel = {
  startSun: 0,
  sunValue: 25,
  sunFallEvery: 9999,
  firstSun: 9999,
  waves: [{ delay: 0.15, flag: true, spawns: [{ kind: 'normal', row: 2, after: 0.15 }] }],
};
const win = Sim.createMatch({ level: winLevel, rng: function () { return 0; } });
pump(win, 0.5);
check('僵尸出场后还没赢', win.result == null && win.zombies.some(function (z) { return z.hp > 0; }));
win.zombies.forEach(function (z) { z.hp = 0; });
pump(win, 0.3);
check('最后一波清完才赢', win.result === 'win');

function has(state, kind, row) {
  return state.plants.some(function (p) { return p.kind === kind && p.row === row && p.hp > 0; });
}

function tryPlace(state, id, row, col) {
  if (state.grid[row][col]) return false;
  const pick = Sim.pickCard(state, id);
  if (!pick.ok) return false;
  const put = Sim.useAt(state, row, col);
  return !!put.ok;
}

function botAct(state) {
  for (let i = state.suns.length - 1; i >= 0; i--) Sim.collectSun(state, state.suns[i].id);
  const threats = {};
  state.zombies.forEach(function (z) {
    if (z.hp <= 0) return;
    if (!threats[z.row] || z.x < threats[z.row].x) threats[z.row] = z;
  });
  const rows = Object.keys(threats).map(Number);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!has(state, 'pea', row) && !has(state, 'ice', row)) {
      if (tryPlace(state, 'pea', row, 1)) return;
    }
  }
  const shooters = state.plants.filter(function (p) { return p.kind === 'pea' || p.kind === 'ice'; }).length;
  const flowers = state.plants.filter(function (p) { return p.kind === 'sun'; }).length;
  const threatsCovered = rows.every(function (row) { return has(state, 'pea', row) || has(state, 'ice', row); });
  if (flowers < 2 && (threatsCovered || rows.length === 0) && state.sun >= (rows.length ? 150 : 50)) {
    for (let r = 0; r < L.ROWS; r++) {
      if (threats[r] && threats[r].x < D.cellCenterX(2)) continue;
      if (tryPlace(state, 'sun', r, 0)) return;
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const z = threats[row];
    const tough = z.hp > 500;
    if (tough && !has(state, 'ice', row) && has(state, 'pea', row)) {
      if (tryPlace(state, 'ice', row, 2)) return;
    }
    if ((has(state, 'pea', row) || has(state, 'ice', row)) && !has(state, 'wall', row) && z.x > D.cellCenterX(3)) {
      for (let c = 6; c >= 3; c--) {
        if (z.x > D.cellCenterX(c) + 28 && tryPlace(state, 'wall', row, c)) return;
      }
    }
    if (tough && shooters >= 1 && state.sun >= 100) {
      if (!state.grid[row][2] && has(state, 'pea', row) && tryPlace(state, 'pea', row, 2)) return;
    }
  }
  if (flowers >= 1 && state.sun >= 100) {
    for (let r = 0; r < L.ROWS; r++) {
      if (!has(state, 'pea', r) && !has(state, 'ice', r) && tryPlace(state, 'pea', r, 1)) return;
    }
  }
}

const bot = Sim.createMatch({ rng: function () { return 0.37; } });
let botT = 0;
while (botT < 280 && !bot.result) {
  botAct(bot);
  Sim.step(bot, 0.2);
  botT += 0.2;
}
if (bot.result !== 'win') {
  console.error('bot', bot.result, 't', bot.time.toFixed(1), 'sun', bot.sun, 'phase', bot.phase, 'wave', bot.waveIndex);
  console.error('plants', bot.plants.map(function (p) { return p.kind + '@' + p.row + ',' + p.col; }).join(' '));
  console.error('zombies', bot.zombies.map(function (z) { return z.kind + ' r' + z.row + ' x' + Math.round(z.x) + ' hp' + Math.round(z.hp); }).join(' '));
}
check('按摆放规则种，前院三波守得住', bot.result === 'win');

console.log('RESULT pass=' + pass + ' fail=' + fail + (bot.result === 'win' ? ' bot=' + bot.time.toFixed(1) + 's' : ''));
if (fail) process.exit(1);
