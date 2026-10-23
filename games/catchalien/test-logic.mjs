import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CA = require('./logic.js');

let pass = 0;
let fail = 0;

function check(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('FAIL', name);
  }
}

function autoplay(level) {
  const state = { opened: [], killed: [] };
  const kinds = [];
  for (let step = 0; step < level.units * level.floors + 3; step++) {
    if (level.alienKeys.every(function (id) { return state.killed.indexOf(id) >= 0; })) {
      return { ok: true, kinds: kinds };
    }
    const visits = [];
    const kills = [];
    for (let i = 0; i < level.cells.length; i++) {
      const cell = level.cells[i];
      const visit = CA.assess(level, state, { type: 'visit', key: cell.key });
      const kill = CA.assess(level, state, { type: 'kill', key: cell.key });
      if (visit.ok) visits.push(cell);
      if (kill.ok) kills.push(cell);
      if (visit.ok && cell.alien) return { ok: false, reason: 'visit alien ' + cell.key };
      if (kill.ok && !cell.alien) return { ok: false, reason: 'kill good ' + cell.key };
    }
    if (!visits.length && !kills.length) return { ok: false, reason: 'stuck' };
    if (kills.length) {
      state.killed.push(kills[0].key);
      continue;
    }
    visits.sort(function (a, b) {
      const aa = a.speech && a.speech.atom ? 1 : 0;
      const bb = b.speech && b.speech.atom ? 1 : 0;
      return bb - aa;
    });
    state.opened.push(visits[0].key);
    if (visits[0].speech && visits[0].speech.atom) kinds.push(visits[0].speech.atom.kind);
  }
  return { ok: false, reason: 'loop' };
}

const USEFUL = /外星人|好人|单元|楼上|楼下|左边|右边/;
const bands = ['warm', 'normal', 'hard'];
const chatRate = { warm: [0, 0], normal: [0, 0], hard: [0, 0] };
for (let b = 0; b < bands.length; b++) {
  const band = bands[b];
  let relaxed = 0;
  let tries = 0;
  let openSum = 0;
  let cellSum = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const level = CA.generateLevel(band, seed * 17 + b * 1000);
    if (level.relaxed) relaxed++;
    tries += level.tries;
    check(band + ' seed ' + seed + ' plays', autoplay(level).ok);
    check(band + ' seed ' + seed + ' doudou safe', level.byKey[level.doudouKey].role === 'doudou' && !level.byKey[level.doudouKey].alien);
    check(band + ' seed ' + seed + ' count', level.alienKeys.length === level.alienCount);
    const names = {};
    let nameOk = true;
    for (let i = 0; i < level.cells.length; i++) {
      const cell = level.cells[i];
      if (names[cell.name]) nameOk = false;
      names[cell.name] = true;
      if (cell.role !== 'doudou' && (cell.name === '豆豆' || cell.name === '同学' || cell.name === '邻居' || cell.name === '路人' || cell.name === '外星人')) {
        nameOk = false;
      }
      if (cell.role === 'neighbor') nameOk = false;
      if (cell.speech && ((cell.speech.clue || '').indexOf('邻居') >= 0 || (cell.speech.scene || '').indexOf('邻居') >= 0)) nameOk = false;
      if ((cell.name === '然然' || cell.name === '坨坨') && cell.role !== 'friend') nameOk = false;
      if (cell.role === 'friend' && cell.name !== '然然' && cell.name !== '坨坨') nameOk = false;
      if (cell.role === 'friend') {
        if (!globalThis.__friendLevels) globalThis.__friendLevels = {};
        globalThis.__friendLevels[band + ':' + seed] = true;
        if (cell.alien) globalThis.__friendAlien = (globalThis.__friendAlien || 0) + 1;
      }
      if (!cell.alien && cell.speech && cell.speech.atom && !CA.atomHolds(level, cell.speech.atom)) nameOk = false;
      const near = cell.speech && cell.speech.atom;
      if (near && near.kind === 'around' && near.n === 0) {
        for (let df = -1; df <= 1; df++) {
          for (let du = -1; du <= 1; du++) {
            if (du === 0 && df === 0) continue;
            const other = level.byKey[(cell.unit + du) + ':' + (cell.floor + df)];
            if (other && other.alien) nameOk = false;
          }
        }
      }
      if (cell.alien && cell.speech) nameOk = false;
      if (!cell.alien && (!cell.speech || (cell.speech.atom == null && USEFUL.test(cell.speech.clue)))) nameOk = false;
      if (!cell.alien && cell.role !== 'doudou') {
        chatRate[band][1]++;
        if (!cell.speech.atom) chatRate[band][0]++;
      }
    }
    const doudou = level.byKey[level.doudouKey];
    check(band + ' seed ' + seed + ' doudou clue', !!(doudou.speech && doudou.speech.atom));
    let named = false;
    for (let c = 0; c < level.cells.length; c++) {
      const atom = level.cells[c].speech && level.cells[c].speech.atom;
      if (atom && (atom.kind === 'dir' || atom.kind === 'door') && atom.alien) named = true;
    }
    check(band + ' seed ' + seed + ' aliens are not named', !named);
    const needOpens = CA.openLimit(level.units, level.floors);
    const gotOpens = CA.fewestOpens(level);
    check(band + ' seed ' + seed + ' needs half the doors', !level.relaxed && gotOpens >= needOpens);
    let linked = gotOpens > 0;
    const heardKinds = {};
    for (let c = 0; c < level.cells.length; c++) {
      const atom = level.cells[c].speech && level.cells[c].speech.atom;
      if (!atom) continue;
      heardKinds[atom.kind] = true;
      if (atom.kind !== 'around' && atom.kind !== 'diag' && atom.kind !== 'floor' && atom.kind !== 'unit' && atom.kind !== 'same' && atom.kind !== 'rows' && atom.kind !== 'cols' && atom.kind !== 'pair' && atom.kind !== 'meal' && atom.kind !== 'role' && atom.kind !== 'half' && atom.kind !== 'edge' && atom.kind !== 'nonadj' && atom.kind !== 'corners') linked = false;
    }
    check(band + ' seed ' + seed + ' clues stay linked', linked);
    openSum += gotOpens;
    cellSum += level.units * level.floors;
    if (!globalThis.__kinds) globalThis.__kinds = {};
    Object.keys(heardKinds).forEach(function (k) { globalThis.__kinds[k] = true; });
    if (!globalThis.__diag) globalThis.__diag = [0, 0];
    for (let k = 0; k < (level.chainKinds || []).length; k++) {
      globalThis.__diag[1]++;
      if (level.chainKinds[k] === 'diag') globalThis.__diag[0]++;
    }
    const openedChain = level.chainKeys.slice();
    const quietGood = level.cells.filter(function (c) {
      return !c.alien && c.key !== level.doudouKey && openedChain.indexOf(c.key) < 0;
    })[0];
    if (quietGood) {
      const quiet = CA.assess(level, { opened: openedChain, killed: [] }, { type: 'kill', key: quietGood.key });
      check(band + ' seed ' + seed + ' wrong catch ends the round', quiet.ok === false && quiet.lose === true && quiet.wrong === true && quiet.message === '这户是好人。');
    }
    check(band + ' seed ' + seed + ' names and truths', nameOk && names['豆豆']);
    const again = CA.generateLevel(band, seed * 17 + b * 1000);
    check(band + ' seed ' + seed + ' stable', again.doudouKey === level.doudouKey && again.alienKeys.join() === level.alienKeys.join() && again.cells.map(function (c) { return c.name; }).join() === level.cells.map(function (c) { return c.name; }).join());
  }
  const rate = chatRate[band][1] ? chatRate[band][0] / chatRate[band][1] : 0;
  console.log(band, 'relaxed', relaxed, 'avg tries', Math.round(tries / 24), 'chatter', rate.toFixed(2), 'opens', (openSum / 24).toFixed(1) + '/' + (cellSum / 24).toFixed(1));
}
const sample = CA.generateLevel('warm', 3);
const blocked = CA.assess(sample, { opened: [], killed: [] }, { type: 'kill', key: sample.doudouKey });
check('cannot kill doudou', blocked.ok === false && blocked.message.indexOf('豆豆') >= 0);
const alienDoor = sample.cells.filter(function (c) { return c.alien; })[0];
const goodDoor = sample.cells.filter(function (c) { return !c.alien && c.key !== sample.doudouKey; })[0];
const hit = CA.assess(sample, { opened: [], killed: [] }, { type: 'visit', key: alienDoor.key });
check('visit alien loses', hit.ok === false && hit.lose === true && hit.message.indexOf('击杀') < 0 && hit.message.indexOf('抓外星人') < 0);
const peek = CA.assess(sample, { opened: [], killed: [] }, { type: 'visit', key: goodDoor.key });
check('blind visit opens', peek.ok === true && !peek.lose);
const hello = CA.assess(sample, { opened: [], killed: [] }, { type: 'visit', key: sample.doudouKey });
check('doudou opens', hello.ok === true);

for (let n = 1; n <= 8; n++) {
  const expect = CA.PATTERN[(n - 1) % CA.PATTERN.length];
  check('band ' + n, CA.bandFor(n) === expect);
}

const friendBoards = Object.keys(globalThis.__friendLevels || {}).length;
check('friends are not in every building', friendBoards > 0 && friendBoards < 24 * 3);
check('friends are never aliens', (globalThis.__friendAlien || 0) === 0);

const heardKinds = globalThis.__kinds || {};
const strategic = ['rows', 'cols', 'pair', 'meal', 'role'].filter(function (k) { return heardKinds[k]; });
check('strategic clues show up', strategic.length >= 3);
const diagStat = globalThis.__diag || [0, 0];
check('diag is not the main clue', diagStat[1] === 0 || diagStat[0] / diagStat[1] < 0.22);
console.log('kinds', Object.keys(heardKinds).join(','), 'diag', diagStat[0] + '/' + diagStat[1]);
console.log('RESULT pass=' + pass + ' fail=' + fail);
if (fail) process.exit(1);


