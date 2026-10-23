/**
 * 豆豆捉外星人 · 生成与判定
 *
 * 楼层从 0 起，0 是最底下的 1 楼。单元从 0 起，0 是最左边的 1 单元。
 * 话术只是同一条事实的不同说法。求解只用事实。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CatchAlien = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PATTERN = ['warm', 'warm', 'normal', 'warm', 'normal', 'hard'];

  const BANDS = {
    warm: {
      label: '暖',
      sizes: [[3, 3], [3, 4], [4, 3]],
      aliens: [2, 2, 2],
      kinds: ['around', 'diag', 'floor', 'unit', 'same', 'rows', 'cols', 'pair', 'meal', 'role'],
      roles: ['classmate', 'classmate', 'classmate', 'passer'],
    },
    normal: {
      label: '普通',
      sizes: [[4, 4], [4, 5], [3, 5]],
      aliens: [2, 2, 3],
      kinds: ['around', 'diag', 'floor', 'unit', 'same', 'rows', 'cols', 'pair', 'meal', 'role'],
      roles: ['classmate', 'classmate', 'classmate', 'passer'],
    },
    hard: {
      label: '难',
      sizes: [[4, 5], [4, 6]],
      aliens: [3, 4],
      kinds: ['around', 'diag', 'floor', 'unit', 'same', 'rows', 'cols', 'pair', 'meal', 'role'],
      roles: ['classmate', 'classmate', 'classmate', 'classmate', 'passer'],
    },
  };

  const NAMES = ['小海', '阿青', '林子', '周周', '陈一', '苏苏', '老周', '阿宁', '小北', '江江', '许安', '罗罗', '宋晚', '何何', '小马', '顾清', '唐糖', '沈一', '韩韩', '叶叶', '方知', '程程', '曹曹', '丁一', '潘潘', '任清', '姚姚', '魏薇', '乔乔', '冯晚', '然然', '坨坨'];
  const FRIEND_NAMES = ['然然', '坨坨'];
  /* 小朋友（"同学"尽量用这一批，成年人留给"路人"） */
  const KID_NAMES = ['周周', '唐糖', '小海', '小北', '罗罗', '阿宁', '叶叶', '潘潘', '乔乔', '姚姚', '小马', '然然', '坨坨'];

  const DIR = {
    up: [0, 1],
    down: [0, -1],
    left: [-1, 0],
    right: [1, 0],
  };

  const DIR_WORD = { up: '楼上', down: '楼下', left: '左边', right: '右边' };

  const ROLE_LABEL = {
    doudou: '豆豆',
    classmate: '同学',
    passer: '路人',
    friend: '朋友',
    alien: '外星人',
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function key(unit, floor) {
    return unit + ':' + floor;
  }

  function bandFor(levelIndex) {
    const i = Math.max(1, levelIndex | 0);
    return PATTERN[(i - 1) % PATTERN.length];
  }

  function dest(unit, floor, dir, units, floors) {
    const step = DIR[dir];
    if (!step) return null;
    const u = unit + step[0];
    const f = floor + step[1];
    if (u < 0 || f < 0 || u >= units || f >= floors) return null;
    return key(u, f);
  }

  function cellsOnFloor(units, floor) {
    const out = [];
    for (let u = 0; u < units; u++) out.push(key(u, floor));
    return out;
  }

  function cellsOnUnit(floors, unit) {
    const out = [];
    for (let f = 0; f < floors; f++) out.push(key(unit, f));
    return out;
  }

  /* 四角：去重（单元或楼层为 1 的时候会重合） */
  function cornerKeys(units, floors) {
    const list = [key(0, 0), key(units - 1, 0), key(0, floors - 1), key(units - 1, floors - 1)];
    const out = [];
    for (let i = 0; i < list.length; i++) if (out.indexOf(list[i]) < 0) out.push(list[i]);
    return out;
  }

  function allKeys(units, floors) {
    const out = [];
    for (let f = 0; f < floors; f++) {
      for (let u = 0; u < units; u++) out.push(key(u, f));
    }
    return out;
  }

  function setCell(status, id, value) {
    const prev = status.get(id);
    if (prev && prev !== value) return 'contradiction';
    if (!prev) {
      status.set(id, value);
      return 'set';
    }
    return 'same';
  }

  function applyCount(status, keys, n) {
    let alienN = 0;
    const unknown = [];
    for (let i = 0; i < keys.length; i++) {
      const s = status.get(keys[i]);
      if (s === 'alien') alienN++;
      else if (s !== 'good') unknown.push(keys[i]);
    }
    if (alienN > n || alienN + unknown.length < n) return 'contradiction';
    if (unknown.length === 0) return 'same';
    const fill = alienN === n ? 'good' : (alienN + unknown.length === n ? 'alien' : null);
    if (!fill) return 'same';
    let changed = false;
    for (let i = 0; i < unknown.length; i++) {
      const r = setCell(status, unknown[i], fill);
      if (r === 'contradiction') return 'contradiction';
      if (r === 'set') changed = true;
    }
    return changed ? 'set' : 'same';
  }

  function applyAtom(status, atom, units, floors) {
    if (atom.kind === 'dir') {
      const id = dest(atom.unit, atom.floor, atom.dir, units, floors);
      if (!id) return 'contradiction';
      return setCell(status, id, atom.alien ? 'alien' : 'good');
    }
    if (atom.kind === 'door') {
      return setCell(status, key(atom.unit, atom.floor), atom.alien ? 'alien' : 'good');
    }
    if (atom.kind === 'floor') return applyCount(status, cellsOnFloor(units, atom.floor), atom.n);
    if (atom.kind === 'unit') return applyCount(status, cellsOnUnit(floors, atom.unit), atom.n);
    return 'contradiction';
  }

  /**
   * 只根据已上门的好人、已抓住的外星人、以及听到的事实来推。
   * 推不出的格子保持未知。
   */
  function bitCount(n) {
    let x = n >>> 0;
    let c = 0;
    while (x) {
      x &= x - 1;
      c++;
    }
    return c;
  }

  function idBit(level, id) {
    const cut = id.indexOf(':');
    const unit = +id.slice(0, cut);
    const floor = +id.slice(cut + 1);
    return floor * level.units + unit;
  }

  function bitId(level, bit) {
    const unit = bit % level.units;
    const floor = (bit - unit) / level.units;
    return key(unit, floor);
  }

  function lineMask(level, kind, index) {
    let mask = 0;
    if (kind === 'floor') {
      for (let u = 0; u < level.units; u++) mask |= (1 << (index * level.units + u));
    } else {
      for (let f = 0; f < level.floors; f++) mask |= (1 << (f * level.units + index));
    }
    return mask >>> 0;
  }

  function nearMask(level, unit, floor, diagOnly) {
    let mask = 0;
    for (let df = -1; df <= 1; df++) {
      for (let du = -1; du <= 1; du++) {
        if (du === 0 && df === 0) continue;
        if (diagOnly && (du === 0 || df === 0)) continue;
        const u = unit + du;
        const f = floor + df;
        if (u < 0 || f < 0 || u >= level.units || f >= level.floors) continue;
        mask |= (1 << (f * level.units + u));
      }
    }
    return mask >>> 0;
  }

  function groupMask(level, line, indexes) {
    let mask = 0;
    for (let i = 0; i < indexes.length; i++) mask |= lineMask(level, line, indexes[i]);
    return mask >>> 0;
  }

  /* 把一个线索编译成 (alienMask) => bool，mask 只算一次，枚举时全是位运算 */
  function compileAtom(level, atom) {
    if (atom.kind === 'around' || atom.kind === 'diag') {
      const mask = nearMask(level, atom.unit, atom.floor, atom.kind === 'diag');
      return function (a) { return bitCount(a & mask) === atom.n; };
    }
    if (atom.kind === 'floor' || atom.kind === 'unit') {
      const mask = lineMask(level, atom.kind, atom.kind === 'floor' ? atom.floor : atom.unit);
      return function (a) { return bitCount(a & mask) === atom.n; };
    }
    if (atom.kind === 'same') {
      const fMask = lineMask(level, 'floor', atom.floor);
      const uMask = lineMask(level, 'unit', atom.unit);
      return function (a) {
        const af = bitCount(a & fMask);
        const au = bitCount(a & uMask);
        return atom.good ? (level.units - af) === (level.floors - au) : af === au;
      };
    }
    if (atom.kind === 'rows' || atom.kind === 'cols') {
      const line = atom.kind === 'rows' ? 'floor' : 'unit';
      const aMask = groupMask(level, line, atom.a);
      const bMask = groupMask(level, line, atom.b);
      return function (a) { return bitCount(a & aMask) === bitCount(a & bMask); };
    }
    if (atom.kind === 'pair') {
      const bits = (1 << idBit(level, atom.who[0])) | (1 << idBit(level, atom.who[1]));
      return function (a) { return (a & bits) === 0; };
    }
    if (atom.kind === 'meal') {
      const bit = 1 << idBit(level, atom.who);
      return function (a) { return (a & bit) === 0; };
    }
    if (atom.kind === 'role') {
      let mask = 0;
      for (let i = 0; i < level.cells.length; i++) {
        if (level.cells[i].role === atom.role) mask |= 1 << idBit(level, level.cells[i].key);
      }
      return function (a) { return bitCount(a & mask) === atom.n; };
    }
    if (atom.kind === 'half') {
      const mask = atom.scope === 'floor'
        ? lineMask(level, 'floor', atom.index)
        : lineMask(level, 'unit', atom.index);
      const target = atom.total / 2;
      return function (a) { return bitCount(a & mask) === target; };
    }
    if (atom.kind === 'edge') {
      const bits = (1 << idBit(level, key(0, atom.floor))) |
        (1 << idBit(level, key(level.units - 1, atom.floor)));
      return function (a) { return (a & bits) === 0; };
    }
    if (atom.kind === 'nonadj') {
      const cells = atom.scope === 'floor'
        ? cellsOnFloor(level.units, atom.index)
        : cellsOnUnit(level.floors, atom.index);
      const bits = [];
      for (let i = 0; i < cells.length; i++) bits.push(1 << idBit(level, cells[i]));
      return function (a) {
        for (let i = 0; i + 1 < bits.length; i++) {
          if ((a & bits[i]) && (a & bits[i + 1])) return false;
        }
        return true;
      };
    }
    if (atom.kind === 'corners') {
      const corners = cornerKeys(level.units, level.floors);
      let mask = 0;
      for (let i = 0; i < corners.length; i++) mask |= 1 << idBit(level, corners[i]);
      const mode = atom.mode;
      const want = atom.n;
      return function (a) {
        const n = bitCount(a & mask);
        if (mode === 'none') return n === 0;
        if (mode === 'all') return n === corners.length;
        return n === want;
      };
    }
    return function (a) { return holdsMask(level, atom, a); };
  }

  function holdsMask(level, atom, alienMask) {
    const aliens = alienMask >>> 0;
    if (atom.kind === 'around' || atom.kind === 'diag') {
      const mask = nearMask(level, atom.unit, atom.floor, atom.kind === 'diag');
      return bitCount(aliens & mask) === atom.n;
    }
    if (atom.kind === 'floor' || atom.kind === 'unit') {
      const mask = lineMask(level, atom.kind, atom.kind === 'floor' ? atom.floor : atom.unit);
      return bitCount(aliens & mask) === atom.n;
    }
    if (atom.kind === 'same') {
      const af = bitCount(aliens & lineMask(level, 'floor', atom.floor));
      const au = bitCount(aliens & lineMask(level, 'unit', atom.unit));
      if (atom.good) return (level.units - af) === (level.floors - au);
      return af === au;
    }
    if (atom.kind === 'rows' || atom.kind === 'cols') {
      const line = atom.kind === 'rows' ? 'floor' : 'unit';
      return bitCount(aliens & groupMask(level, line, atom.a)) === bitCount(aliens & groupMask(level, line, atom.b));
    }
    if (atom.kind === 'pair') {
      return (aliens & (1 << idBit(level, atom.who[0]))) === 0 && (aliens & (1 << idBit(level, atom.who[1]))) === 0;
    }
    if (atom.kind === 'meal') {
      return (aliens & (1 << idBit(level, atom.who))) === 0;
    }
    if (atom.kind === 'role') {
      let n = 0;
      for (let i = 0; i < level.cells.length; i++) {
        const cell = level.cells[i];
        if (cell.role !== atom.role) continue;
        if ((aliens & (1 << idBit(level, cell.key))) !== 0) n++;
      }
      return n === atom.n;
    }
    if (atom.kind === 'dir') {
      const id = dest(atom.unit, atom.floor, atom.dir, level.units, level.floors);
      if (!id) return false;
      const on = (aliens & (1 << idBit(level, id))) !== 0;
      return on === !!atom.alien;
    }
    if (atom.kind === 'door') {
      const on = (aliens & (1 << idBit(level, key(atom.unit, atom.floor)))) !== 0;
      return on === !!atom.alien;
    }
    if (atom.kind === 'half') {
      const mask = atom.scope === 'floor'
        ? lineMask(level, 'floor', atom.index)
        : lineMask(level, 'unit', atom.index);
      return bitCount(aliens & mask) === atom.total / 2;
    }
    if (atom.kind === 'edge') {
      const bits = (1 << idBit(level, key(0, atom.floor))) |
        (1 << idBit(level, key(level.units - 1, atom.floor)));
      return (aliens & bits) === 0;
    }
    if (atom.kind === 'nonadj') {
      const cells = atom.scope === 'floor'
        ? cellsOnFloor(level.units, atom.index)
        : cellsOnUnit(level.floors, atom.index);
      for (let i = 0; i + 1 < cells.length; i++) {
        const a = aliens & (1 << idBit(level, cells[i]));
        const b = aliens & (1 << idBit(level, cells[i + 1]));
        if (a && b) return false;
      }
      return true;
    }
    if (atom.kind === 'corners') {
      const corners = cornerKeys(level.units, level.floors);
      let n = 0;
      for (let i = 0; i < corners.length; i++) {
        if (aliens & (1 << idBit(level, corners[i]))) n++;
      }
      if (atom.mode === 'none') return n === 0;
      if (atom.mode === 'all') return n === corners.length;
      return n === atom.n;
    }
    return false;
  }

  function deduce(level, opened, killed, speeches) {
    const status = new Map();
    const total = level.units * level.floors;
    let fixedAlien = 0;
    let fixedGood = 0;
    let bad = false;
    function lock(id, alien) {
      const bit = 1 << idBit(level, id);
      if (alien) {
        if (fixedGood & bit) bad = true;
        fixedAlien |= bit;
      } else {
        if (fixedAlien & bit) bad = true;
        fixedGood |= bit;
      }
    }
    opened.forEach(function (id) { lock(id, false); });
    killed.forEach(function (id) { lock(id, true); });
    if (bad) return { contradiction: true, status: status };
    fixedAlien >>>= 0;
    fixedGood >>>= 0;
    const knownAliens = bitCount(fixedAlien);
    if (knownAliens > level.alienCount) return { contradiction: true, status: status };
    const need = level.alienCount - knownAliens;
    const pool = [];
    for (let bit = 0; bit < total; bit++) {
      const flag = 1 << bit;
      if ((fixedAlien & flag) || (fixedGood & flag)) continue;
      pool.push(bit);
    }
    if (need > pool.length) return { contradiction: true, status: status };
    const atoms = [];
    const list = speeches || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].atom) atoms.push(list[i].atom);
    }
    let models = 0;
    const votes = [];
    for (let i = 0; i < total; i++) votes.push(0);
    /* 把每个线索编译成纯位运算的判定函数，避免在枚举里反复构造 mask（大户型提速几十倍） */
    const atomFns = [];
    for (let i = 0; i < atoms.length; i++) atomFns.push(compileAtom(level, atoms[i]));
    function consider(mask) {
      const aliens = (mask | fixedAlien) >>> 0;
      for (let i = 0; i < atomFns.length; i++) {
        if (!atomFns[i](aliens)) return;
      }
      models++;
      let rest = aliens;
      while (rest) {
        const lsb = rest & -rest;
        votes[31 - Math.clz32(lsb >>> 0)]++;
        rest = (rest ^ lsb) >>> 0;
      }
    }
    function choose(start, left, mask) {
      if (left === 0) {
        consider(mask);
        return;
      }
      for (let i = start; i <= pool.length - left; i++) {
        choose(i + 1, left - 1, (mask | (1 << pool[i])) >>> 0);
      }
    }
    choose(0, need, 0);
    if (!models) return { contradiction: true, status: status };
    for (let bit = 0; bit < total; bit++) {
      const id = bitId(level, bit);
      if (votes[bit] === models) status.set(id, 'alien');
      else if (votes[bit] === 0) status.set(id, 'good');
    }
    return { contradiction: false, status: status };
  }

  function tally(status) {
    let aliens = 0;
    let goods = 0;
    status.forEach(function (v) {
      if (v === 'alien') aliens++;
      else goods++;
    });
    return { aliens: aliens, goods: goods };
  }

  function gain(beforeStatus, afterStatus, personKey) {
    const before = tally(beforeStatus);
    const after = tally(afterStatus);
    const alienGain = after.aliens - before.aliens;
    let goodGain = after.goods - before.goods;
    if (!beforeStatus.has(personKey)) goodGain -= 1;
    if (alienGain < 0 || goodGain < 0) return -1;
    if (alienGain === 0 && goodGain === 0) return 0;
    return alienGain * 100 + goodGain;
  }

  function consistent(alienSet, status) {
    let ok = true;
    status.forEach(function (v, id) {
      const alien = alienSet.has(id);
      if (v === 'alien' && !alien) ok = false;
      if (v === 'good' && alien) ok = false;
    });
    return ok;
  }

  function aliensFound(alienKeys, status) {
    for (let i = 0; i < alienKeys.length; i++) {
      if (status.get(alienKeys[i]) !== 'alien') return false;
    }
    return true;
  }

  function countLine(alienSet, keys) {
    let n = 0;
    for (let i = 0; i < keys.length; i++) if (alienSet.has(keys[i])) n++;
    return n;
  }

  function allowedAtoms(draft, cell) {
    const atoms = [];
    const role = cell.role;
    if (role === 'doudou') {
      const dirs = ['up', 'down', 'left', 'right'];
      for (let i = 0; i < dirs.length; i++) {
        const id = dest(cell.unit, cell.floor, dirs[i], draft.units, draft.floors);
        if (!id) continue;
        atoms.push({
          kind: 'dir',
          unit: cell.unit,
          floor: cell.floor,
          dir: dirs[i],
          alien: draft.alienSet.has(id),
        });
      }
      atoms.push({
        kind: 'floor',
        floor: cell.floor,
        n: countLine(draft.alienSet, cellsOnFloor(draft.units, cell.floor)),
      });
      atoms.push({
        kind: 'unit',
        unit: cell.unit,
        n: countLine(draft.alienSet, cellsOnUnit(draft.floors, cell.unit)),
      });
    } else if (role === 'classmate') {
      const dirs = ['left', 'right'];
      for (let i = 0; i < dirs.length; i++) {
        const id = dest(cell.unit, cell.floor, dirs[i], draft.units, draft.floors);
        if (!id) continue;
        atoms.push({
          kind: 'dir',
          unit: cell.unit,
          floor: cell.floor,
          dir: dirs[i],
          alien: draft.alienSet.has(id),
        });
      }
    } else if (role === 'passer') {
      for (let i = 0; i < draft.cells.length; i++) {
        const other = draft.cells[i];
        if (other.key === cell.key) continue;
        atoms.push({
          kind: 'door',
          unit: other.unit,
          floor: other.floor,
          alien: other.alien,
        });
      }
    }
    return atoms;
  }

  function atomTrue(draft, atom) {
    if (atom.kind === 'dir') {
      const id = dest(atom.unit, atom.floor, atom.dir, draft.units, draft.floors);
      if (!id) return false;
      return draft.alienSet.has(id) === atom.alien;
    }
    if (atom.kind === 'door') {
      return draft.alienSet.has(key(atom.unit, atom.floor)) === atom.alien;
    }
    if (atom.kind === 'floor') {
      return countLine(draft.alienSet, cellsOnFloor(draft.units, atom.floor)) === atom.n;
    }
    if (atom.kind === 'unit') {
      return countLine(draft.alienSet, cellsOnUnit(draft.floors, atom.unit)) === atom.n;
    }
    if (atom.kind === 'around' || atom.kind === 'diag' || atom.kind === 'same' ||
        atom.kind === 'rows' || atom.kind === 'cols' || atom.kind === 'pair' ||
        atom.kind === 'meal' || atom.kind === 'role' || atom.kind === 'half' ||
        atom.kind === 'edge' || atom.kind === 'nonadj' || atom.kind === 'corners') {
      let mask = 0;
      draft.alienSet.forEach(function (id) { mask |= (1 << idBit(draft, id)); });
      return holdsMask(draft, atom, mask >>> 0);
    }
    return false;
  }

  function clueLines(atom) {
    if (atom.kind === 'around' || atom.kind === 'diag') {
      const where = atom.kind === 'around' ? '我周围' : '我的斜角';
      if (atom.n === 0) return [where + '没有外星人。', where + '都是好人。'];
      if (atom.len != null && atom.n === atom.len) return [where + '全是外星人。', where + '没有好人。'];
      const goods = atom.len != null ? atom.len - atom.n : 0;
      const lines = [where + '有 ' + atom.n + ' 个外星人。'];
      if (goods > 0) lines.push(where + '有 ' + goods + ' 个好人。');
      return lines;
    }
    if (atom.kind === 'same') {
      const pair = (atom.unit + 1) + '单元和' + (atom.floor + 1) + '楼';
      if (atom.good) return [pair + '的好人数一样。', pair + '好人一样多。'];
      return [pair + '的外星人数一样。', pair + '坏人一样多。'];
    }
    if (atom.kind === 'rows' || atom.kind === 'cols') {
      const word = atom.kind === 'rows' ? '楼' : '单元';
      const left = groupWord(atom.a, word);
      const right = groupWord(atom.b, word);
      return [left + '的外星人和' + right + '一样多。', left + '和' + right + '的外星人数一样。'];
    }
    if (atom.kind === 'pair') {
      const a = atom.names[0];
      const b = atom.names[1];
      if (atom.style === 'play') return [a + '和' + b + '昨天一起玩，都是好人。'];
      return [a + '和' + b + '是好朋友，都是好人。'];
    }
    if (atom.kind === 'meal') {
      return ['我和' + atom.name + '昨天一起去吃了好吃的。', '我和' + atom.name + '昨天一起去吃了好吃的，' + atom.name + '是好人。'];
    }
    if (atom.kind === 'role') {
      if (atom.n === 0) return ['同学里面没有外星人。', '同学都是好人。'];
      return ['同学里面有 ' + atom.n + ' 个外星人。', '同学里有 ' + atom.n + ' 个是假扮的。'];
    }
    if (atom.kind === 'dir') {
      const who = DIR_WORD[atom.dir] + '那户';
      if (atom.alien) {
        return [who + '是外星人。', who + '是假扮的，别上门。', '小心' + who + '，不是好人。'];
      }
      return [who + '是好人。', who + '我认识，可以上门。', who + '不是外星人。'];
    }
    if (atom.kind === 'door') {
      const where = (atom.unit + 1) + '单元' + (atom.floor + 1) + '楼';
      if (atom.alien) {
        return [where + '那户是外星人。', where + '我看见了，是假扮的。', '别去' + where + '，那户不是好人。'];
      }
      return [where + '那户是好人。', where + '那户可以上门。', where + '我看见了，不是外星人。'];
    }
    if (atom.kind === 'half') {
      const where = atom.scope === 'floor' ? (atom.index + 1) + '楼' : (atom.index + 1) + '单元';
      return [
        where + '有一半是外星人。',
        where + '里一半是假扮的。',
        where + '好人坏人正好各一半。',
      ];
    }
    if (atom.kind === 'edge') {
      return [
        (atom.floor + 1) + '楼两边不是外星人。',
        (atom.floor + 1) + '楼两头都是好人。',
        (atom.floor + 1) + '楼最左最右那两户可以放心。',
      ];
    }
    if (atom.kind === 'nonadj') {
      const where = atom.scope === 'floor' ? (atom.index + 1) + '楼' : (atom.index + 1) + '单元';
      return [
        where + '的外星人不相邻。',
        where + '里没有挨着的两户外星人。',
        where + '就算有坏人，也不会是连着的两户。',
      ];
    }
    if (atom.kind === 'corners') {
      if (atom.mode === 'none') {
        return ['四个角落都是好人。', '四个角落没有外星人。', '楼角那几户都可以放心。'];
      }
      if (atom.mode === 'all') {
        return ['四个角落都是外星人。', '四个角落全是假扮的。', '楼角的几户一个都别去。'];
      }
      return [
        '四个角落有 ' + atom.n + ' 个外星人。',
        '四个角落只有 ' + atom.n + ' 个外星人。',
        '楼角里一共 ' + atom.n + ' 户不对劲。',
      ];
    }
    const label = atom.kind === 'floor'
      ? (atom.floor + 1) + '楼'
      : (atom.unit + 1) + '单元';
    if (atom.n === 0) {
      return [label + '没有外星人。', label + '是干净的，坏的一个都没有。', label + '我都对过，没有假扮的。'];
    }
    if (atom.n === 1) {
      return [label + '就 1 个外星人。', label + '只有 1 户不对劲。', label + '坏的就 1 户。'];
    }
    return [label + '有 ' + atom.n + ' 个外星人。', label + '不对劲的有 ' + atom.n + ' 户。', label + '坏的有 ' + atom.n + ' 户。'];
  }

  function groupWord(indexes, suffix) {
    const nums = [];
    for (let i = 0; i < indexes.length; i++) nums.push(indexes[i] + 1);
    return nums.join('、') + suffix;
  }

  function sceneLines(kind) {
    if (kind === 'around' || kind === 'diag') return ['往四周看了看', '压低声音', '指了指旁边的门'];
    if (kind === 'same' || kind === 'rows' || kind === 'cols') return ['想了想两边的人数', '掰着手指对过', '把两处放在一起说'];
    if (kind === 'pair' || kind === 'meal') return ['笑着想起谁', '把声音放轻', '像在说家里人'];
    if (kind === 'role') return ['在心里数了数', '看了看这一类人', '压低声音'];
    if (kind === 'dir') return ['在楼道里停下', '手里还拎着垃圾袋', '门开了一条缝'];
    if (kind === 'floor') return ['楼层群里发来一句', '在楼梯转角说', '把声音放轻'];
    if (kind === 'unit') return ['电梯里顿了顿', '在单元门口说', '进门前补了一句'];
    return ['在楼下站了一会', '快递刚送完', '路过这栋楼'];
  }

  const CHATTER = {
    classmate: ['作业还没写完。', '书包太重了。', '明天有测验，我在看书。', '笔没带，你有多余的吗。', '我先回屋写作业。'],
    passer: ['我就是来送个东西。', '这地方有点难找。', '我马上走，不打扰。', '手机快没电了。', '路上下雨，鞋湿了。'],
    friend: ['我跟豆豆很熟。', '豆豆让我来串门。', '我是来找豆豆的。', '豆豆的零食还在我这。'],
    doudou: ['你来啦，先喝口水。', '我在找袜子。', '冰箱里还有饭。'],
  };

  function renderChatter(role, rng, used) {
    const lines = CHATTER[role] || CHATTER.passer;
    const choices = shuffle(rng, lines);
    let clue = choices[0];
    for (let i = 0; i < choices.length; i++) {
      if (!used.has('chat:' + choices[i])) {
        clue = choices[i];
        break;
      }
    }
    used.add('chat:' + clue);
    const scenes = shuffle(rng, ['看了你一眼', '在门口停住', '手里还拿着东西', '声音懒懒的']);
    let scene = scenes[0];
    for (let i = 0; i < scenes.length; i++) {
      if (!used.has('scene:' + scenes[i])) {
        scene = scenes[i];
        break;
      }
    }
    used.add('scene:' + scene);
    const beat = {
      doudou: '豆豆拉住你',
      classmate: '同学把书包往上托了托',
      passer: '路人停了一下',
      friend: '朋友挥了挥手',
    }[role] || '门开了';
    return { scene: beat + '，' + scene, clue: clue, atom: null };
  }

  function renderSpeech(atom, role, rng, used) {
    const clues = shuffle(rng, clueLines(atom));
    let clue = clues[0];
    for (let i = 0; i < clues.length; i++) {
      if (!used.has(clues[i])) {
        clue = clues[i];
        break;
      }
    }
    used.add(clue);
    const scenes = shuffle(rng, sceneLines(atom.kind));
    let scene = scenes[0];
    for (let i = 0; i < scenes.length; i++) {
      if (!used.has('scene:' + scenes[i])) {
        scene = scenes[i];
        break;
      }
    }
    used.add('scene:' + scene);
    const beat = {
      doudou: '豆豆拉住你',
      classmate: '同学把书包往上托了托',
      passer: '路人停了一下',
      friend: '朋友挥了挥手',
    }[role] || '门开了';
    return { scene: beat + '，' + scene, clue: clue, atom: atom };
  }

  function openable(draft, opened, status) {
    const list = [];
    for (let i = 0; i < draft.cells.length; i++) {
      const cell = draft.cells[i];
      if (cell.alien || opened.has(cell.key)) continue;
      if (cell.role === 'doudou' || status.get(cell.key) === 'good') list.push(cell);
    }
    return list;
  }

  function speechesOf(draft, opened) {
    const list = [];
    opened.forEach(function (id) {
      const cell = draft.byKey[id];
      if (cell && cell.speech && cell.speech.atom) list.push(cell.speech);
    });
    return list;
  }

  function place(band, rng) {
    const spec = BANDS[band];
    const size = pick(rng, spec.sizes);
    const units = size[0];
    const floors = size[1];
    const total = units * floors;
    /* 外星人：最少 2 个，最多占一半（四舍五入） */
    const alienCount = Math.max(2, Math.min(Math.floor(total / 2), pick(rng, spec.aliens)));
    const coords = [];
    for (let f = 0; f < floors; f++) {
      for (let u = 0; u < units; u++) coords.push({ unit: u, floor: f, key: key(u, f) });
    }
    const order = shuffle(rng, coords);
    const alienSet = new Set();
    for (let i = 0; i < alienCount; i++) alienSet.add(order[i].key);

    /* 让「有一半是外星人」这类线索真的出现：随机把某条偶数长度的楼层/单元调成正好一半 */
    if (rng() < 0.5) {
      const lines = [];
      if (units % 2 === 0) for (let f = 0; f < floors; f++) lines.push(cellsOnFloor(units, f));
      if (floors % 2 === 0) for (let u = 0; u < units; u++) lines.push(cellsOnUnit(floors, u));
      if (lines.length) {
        const line = lines[Math.floor(rng() * lines.length)];
        const half = line.length / 2;
        const inLine = function (k) { return line.indexOf(k) >= 0; };
        const insideAliens = line.filter(function (k) { return alienSet.has(k); });
        const insideGood = line.filter(function (k) { return !alienSet.has(k); });
        const outsideAliens = coords.filter(function (c) { return !inLine(c.key) && alienSet.has(c.key); })
          .map(function (c) { return c.key; });
        const outsideGood = coords.filter(function (c) { return !inLine(c.key) && !alienSet.has(c.key); })
          .map(function (c) { return c.key; });
        while (insideAliens.length > half && outsideGood.length) {
          alienSet.delete(insideAliens.pop());
          alienSet.add(outsideGood.pop());
        }
        while (insideAliens.length < half && outsideAliens.length && insideGood.length) {
          alienSet.delete(outsideAliens.pop());
          const into = insideGood.pop();
          alienSet.add(into);
          insideAliens.push(into);
        }
      }
    }

    const doudouCoord = coords.filter(function (c) { return !alienSet.has(c.key); })[0] || coords[0];
    const doudou = doudouCoord;
    const cells = [];
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      const alien = alienSet.has(c.key);
      let role = null;
      if (c.key === doudou.key) role = 'doudou';
      else role = pick(rng, spec.roles);
      cells.push({
        key: c.key,
        unit: c.unit,
        floor: c.floor,
        alien: alien,
        role: role,
        name: '',
        speech: null,
      });
    }
    const byKey = {};
    for (let i = 0; i < cells.length; i++) byKey[cells[i].key] = cells[i];
    return {
      units: units,
      floors: floors,
      alienCount: alienCount,
      alienSet: alienSet,
      alienKeys: coords.filter(function (c) { return alienSet.has(c.key); })
        .map(function (c) { return c.key; }),
      doudouKey: doudou.key,
      cells: cells,
      byKey: byKey,
    };
  }

  function openLimit(units, floors, aliens) {
    const n = units * floors;
    const half = Math.floor(n / 2) + 1;
    if (!aliens) return half;
    /* 开门数下限跟着外星人数走：外星人越多，需要的线索越多，
       但不再固定要求"半栋楼"，否则大户型 + 少外星人几乎抽不出合法局面 */
    return Math.min(half, Math.max(3, aliens + 3));
  }

  function nearKeys(draft, unit, floor, diagOnly) {
    const out = [];
    for (let df = -1; df <= 1; df++) {
      for (let du = -1; du <= 1; du++) {
        if (du === 0 && df === 0) continue;
        if (diagOnly && (du === 0 || df === 0)) continue;
        const u = unit + du;
        const f = floor + df;
        if (u < 0 || f < 0 || u >= draft.units || f >= draft.floors) continue;
        out.push(key(u, f));
      }
    }
    return out;
  }

  function blocksOf(n) {
    const out = [];
    for (let start = 0; start < n; start++) {
      for (let end = start + 1; end < n; end++) {
        const block = [];
        for (let i = start; i <= end; i++) block.push(i);
        out.push(block);
      }
    }
    return out;
  }

  function blocksOverlap(a, b) {
    for (let i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) return true;
    return false;
  }

  function countAtoms(draft, cell, rng) {
    const atoms = [];
    const around = nearKeys(draft, cell.unit, cell.floor, false);
    if (around.length) {
      atoms.push({
        kind: 'around',
        unit: cell.unit,
        floor: cell.floor,
        n: countLine(draft.alienSet, around),
        len: around.length,
      });
    }
    const diag = nearKeys(draft, cell.unit, cell.floor, true);
    if (diag.length) {
      atoms.push({
        kind: 'diag',
        unit: cell.unit,
        floor: cell.floor,
        n: countLine(draft.alienSet, diag),
        len: diag.length,
      });
    }
    for (let f = 0; f < draft.floors; f++) {
      atoms.push({
        kind: 'floor',
        floor: f,
        n: countLine(draft.alienSet, cellsOnFloor(draft.units, f)),
      });
    }
    for (let u = 0; u < draft.units; u++) {
      atoms.push({
        kind: 'unit',
        unit: u,
        n: countLine(draft.alienSet, cellsOnUnit(draft.floors, u)),
      });
    }
    const ownFloorN = countLine(draft.alienSet, cellsOnFloor(draft.units, cell.floor));
    const ownUnitN = countLine(draft.alienSet, cellsOnUnit(draft.floors, cell.unit));
    for (let u = 0; u < draft.units; u++) {
      const unitN = u === cell.unit
        ? ownUnitN
        : countLine(draft.alienSet, cellsOnUnit(draft.floors, u));
      if (ownFloorN === unitN) atoms.push({ kind: 'same', floor: cell.floor, unit: u, good: false });
      if ((draft.units - ownFloorN) === (draft.floors - unitN)) {
        atoms.push({ kind: 'same', floor: cell.floor, unit: u, good: true });
      }
    }
    for (let f = 0; f < draft.floors; f++) {
      if (f === cell.floor) continue;
      const floorN = countLine(draft.alienSet, cellsOnFloor(draft.units, f));
      if (floorN === ownUnitN) atoms.push({ kind: 'same', floor: f, unit: cell.unit, good: false });
      if ((draft.units - floorN) === (draft.floors - ownUnitN)) {
        atoms.push({ kind: 'same', floor: f, unit: cell.unit, good: true });
      }
    }
    const floorBlocks = blocksOf(draft.floors);
    for (let i = 0; i < floorBlocks.length; i++) {
      for (let j = i + 1; j < floorBlocks.length; j++) {
        if (blocksOverlap(floorBlocks[i], floorBlocks[j])) continue;
        const left = floorBlocks[i];
        const right = floorBlocks[j];
        let ln = 0;
        let rn = 0;
        for (let k = 0; k < left.length; k++) ln += countLine(draft.alienSet, cellsOnFloor(draft.units, left[k]));
        for (let k = 0; k < right.length; k++) rn += countLine(draft.alienSet, cellsOnFloor(draft.units, right[k]));
        if (ln === rn) atoms.push({ kind: 'rows', a: left.slice(), b: right.slice() });
      }
    }
    const unitBlocks = blocksOf(draft.units);
    for (let i = 0; i < unitBlocks.length; i++) {
      for (let j = i + 1; j < unitBlocks.length; j++) {
        if (blocksOverlap(unitBlocks[i], unitBlocks[j])) continue;
        const left = unitBlocks[i];
        const right = unitBlocks[j];
        let ln = 0;
        let rn = 0;
        for (let k = 0; k < left.length; k++) ln += countLine(draft.alienSet, cellsOnUnit(draft.floors, left[k]));
        for (let k = 0; k < right.length; k++) rn += countLine(draft.alienSet, cellsOnUnit(draft.floors, right[k]));
        if (ln === rn) atoms.push({ kind: 'cols', a: left.slice(), b: right.slice() });
      }
    }
    const goods = [];
    for (let i = 0; i < draft.cells.length; i++) {
      const other = draft.cells[i];
      if (other.alien || other.key === cell.key || !other.name) continue;
      goods.push(other);
    }
    const picked = shuffle(rng, goods).slice(0, 3);
    for (let i = 0; i < picked.length; i++) {
      atoms.push({ kind: 'meal', who: picked[i].key, name: picked[i].name });
    }
    const pool = shuffle(rng, goods);
    let pairs = 0;
    for (let i = 0; i < pool.length && pairs < 3; i++) {
      for (let j = i + 1; j < pool.length && pairs < 3; j++) {
        atoms.push({
          kind: 'pair',
          style: pairs % 2 === 0 ? 'friend' : 'play',
          who: [pool[i].key, pool[j].key],
          names: [pool[i].name, pool[j].name],
        });
        pairs++;
      }
    }
    const roles = ['classmate'];
    for (let r = 0; r < roles.length; r++) {
      const role = roles[r];
      let len = 0;
      let n = 0;
      for (let i = 0; i < draft.cells.length; i++) {
        if (draft.cells[i].role !== role) continue;
        len++;
        if (draft.cells[i].alien) n++;
      }
      if (len >= 2) atoms.push({ kind: 'role', role: role, n: n, len: len });
    }
    addLandmarkAtoms(draft, atoms);
    return atoms;
  }

  /* 一半 / 两边 / 不相邻 / 四角：这些是"整栋楼的形状"线索，任何一户都可能提起 */
  function addLandmarkAtoms(draft, atoms) {
    if (draft.units % 2 === 0) {
      for (let f = 0; f < draft.floors; f++) {
        const n = countLine(draft.alienSet, cellsOnFloor(draft.units, f));
        if (n === draft.units / 2) {
          atoms.push({ kind: 'half', scope: 'floor', index: f, total: draft.units });
        }
      }
    }
    if (draft.floors % 2 === 0) {
      for (let u = 0; u < draft.units; u++) {
        const n = countLine(draft.alienSet, cellsOnUnit(draft.floors, u));
        if (n === draft.floors / 2) {
          atoms.push({ kind: 'half', scope: 'unit', index: u, total: draft.floors });
        }
      }
    }
    for (let f = 0; f < draft.floors; f++) {
      const left = key(0, f);
      const right = key(draft.units - 1, f);
      if (!draft.alienSet.has(left) && !draft.alienSet.has(right)) {
        atoms.push({ kind: 'edge', floor: f });
      }
    }
    for (let f = 0; f < draft.floors; f++) {
      let ok = true;
      for (let u = 0; u + 1 < draft.units; u++) {
        if (draft.alienSet.has(key(u, f)) && draft.alienSet.has(key(u + 1, f))) { ok = false; break; }
      }
      if (ok) atoms.push({ kind: 'nonadj', scope: 'floor', index: f });
    }
    for (let u = 0; u < draft.units; u++) {
      let ok = true;
      for (let f = 0; f + 1 < draft.floors; f++) {
        if (draft.alienSet.has(key(u, f)) && draft.alienSet.has(key(u, f + 1))) { ok = false; break; }
      }
      if (ok) atoms.push({ kind: 'nonadj', scope: 'unit', index: u });
    }
    let cornerN = 0;
    const corners = cornerKeys(draft.units, draft.floors);
    for (let i = 0; i < corners.length; i++) {
      if (draft.alienSet.has(corners[i])) cornerN++;
    }
    if (cornerN === 0) atoms.push({ kind: 'corners', mode: 'none' });
    else if (cornerN === corners.length) atoms.push({ kind: 'corners', mode: 'all' });
    else atoms.push({ kind: 'corners', mode: 'count', n: cornerN });
  }

  /* 然然 / 坨坨 是豆豆的朋友，不能是外星人：抽到了就把身份和普通住户换一下 */
  function protectFriends(draft) {
    const friends = [];
    const others = [];
    for (let i = 0; i < draft.cells.length; i++) {
      const cell = draft.cells[i];
      if (cell.role === 'doudou') continue;
      if (FRIEND_NAMES.indexOf(cell.name) >= 0) friends.push(cell);
      else others.push(cell);
    }
    let changed = false;
    for (let i = 0; i < friends.length; i++) {
      const f = friends[i];
      if (!f.alien) continue;
      let target = null;
      for (let k = 0; k < others.length; k++) {
        if (!others[k].alien) { target = others[k]; break; }
      }
      if (!target) continue;
      f.alien = false;
      target.alien = true;
      draft.alienSet.delete(f.key);
      draft.alienSet.add(target.key);
      changed = true;
    }
    if (changed) {
      draft.alienKeys = draft.cells.filter(function (c) { return c.alien; })
        .map(function (c) { return c.key; });
    }
  }

  function finishChatter(draft, rng, usedLines) {
    for (let i = 0; i < draft.cells.length; i++) {
      const cell = draft.cells[i];
      if (cell.alien || cell.speech) continue;
      cell.speech = renderChatter(cell.role, rng, usedLines);
    }
  }

  function fewestOpens(level) {
    const order = level.chainKeys || [];
    const opened = [];
    for (let i = 0; i < order.length; i++) {
      const now = deduce(level, new Set(opened), new Set(), speechesOf(level, new Set(opened)));
      if (now.contradiction) return 0;
      if (aliensFound(level.alienKeys, now.status)) return opened.length;
      const id = order[i];
      if (id !== level.doudouKey && now.status.get(id) !== 'good') return 0;
      const cell = level.byKey[id];
      if (!cell || !cell.speech || !cell.speech.atom) return 0;
      opened.push(id);
    }
    const end = deduce(level, new Set(opened), new Set(), speechesOf(level, new Set(opened)));
    if (end.contradiction || !aliensFound(level.alienKeys, end.status)) return 0;
    return opened.length;
  }

  function generateOnce(band, rng) {
    const draft = place(band, rng);
    assignNames(draft, rng);
    protectFriends(draft);
    const limit = openLimit(draft.units, draft.floors, draft.alienCount);
    const opened = new Set();
    const chainKeys = [];
    const chainKinds = [];
    const usedLines = new Set();
    for (let step = 0; step < draft.units * draft.floors + 2; step++) {
      const heardNow = speechesOf(draft, opened);
      const now = deduce(draft, opened, new Set(), heardNow);
      if (now.contradiction || !consistent(draft.alienSet, now.status)) return null;
      if (aliensFound(draft.alienKeys, now.status)) {
        if (chainKeys.length < limit) return null;
        finishChatter(draft, rng, usedLines);
        draft.chainKeys = chainKeys;
        draft.chainKinds = chainKinds;
        return draft;
      }
      const candidates = shuffle(rng, openable(draft, opened, now.status).filter(function (cell) {
        return !cell.speech;
      }));
      if (!candidates.length) return null;
      let best = null;
      for (let i = 0; i < candidates.length; i++) {
        const cell = candidates[i];
        const atoms = shuffle(rng, countAtoms(draft, cell, rng));
        for (let j = 0; j < atoms.length; j++) {
          const atom = atoms[j];
          const trialOpen = new Set(opened);
          trialOpen.add(cell.key);
          const next = deduce(draft, trialOpen, new Set(), heardNow.concat([{ atom: atom }]));
          if (next.contradiction || !consistent(draft.alienSet, next.status)) continue;
          const g = gain(now.status, next.status, cell.key);
          if (g <= 0) continue;
          const finishes = aliensFound(draft.alienKeys, next.status);
          const early = chainKeys.length + 1 < limit;
          if (finishes && early) continue;
          const soloBefore = deduce(draft, new Set([cell.key]), new Set(), []);
          const soloAfter = deduce(draft, new Set([cell.key]), new Set(), [{ atom: atom }]);
          if (soloBefore.contradiction || soloAfter.contradiction) continue;
          const solo = gain(soloBefore.status, soloAfter.status, cell.key);
          if (solo < 0) continue;
          const isSocial = atom.kind === 'pair' || atom.kind === 'meal';
          const socialSoFar = chainKinds.filter(function (k) { return k === 'pair' || k === 'meal'; }).length;
          if (isSocial && socialSoFar >= 2) continue;
          let nudge = atom.kind === 'rows' || atom.kind === 'cols' || atom.kind === 'role' ? 0 : 1;
          let bucket = solo === 0 ? 0 : 1;
          if (isSocial) bucket = 2;
          if (atom.kind === 'diag') bucket = 3;
          if (isSocial && socialSoFar < 2 && chainKeys.length % 4 === 3) {
            bucket = 0;
            nudge = -1;
          }
          const rank = early
            ? bucket * 10000 + g * 10 + nudge
            : (finishes ? 0 : 1) * 10000 + (atom.kind === 'diag' ? 5000 : 0) - g * 10 + nudge;
          if (!best || rank < best.rank) best = { cell: cell, atom: atom, rank: rank };
        }
      }
      if (!best) return null;
      best.cell.speech = renderSpeech(best.atom, best.cell.role, rng, usedLines);
      opened.add(best.cell.key);
      chainKeys.push(best.cell.key);
      chainKinds.push(best.atom.kind);
    }
    return null;
  }

  function assignNames(draft, rng) {
    const pool = shuffle(rng, NAMES);
    let n = 0;
    for (let i = 0; i < draft.cells.length; i++) {
      const cell = draft.cells[i];
      if (cell.role === 'doudou') {
        cell.name = '豆豆';
        continue;
      }
      /* 同学优先小朋友、路人优先大人：在剩下的池子里把最近的替换到当前位置 */
      if (cell.role === 'classmate' || cell.role === 'passer') {
        const wantKid = cell.role === 'classmate';
        let idx = -1;
        for (let k = n; k < pool.length; k++) {
          const isKid = KID_NAMES.indexOf(pool[k]) >= 0;
          if (isKid === wantKid) { idx = k; break; }
        }
        if (idx > n) {
          const tmp = pool[n];
          pool[n] = pool[idx];
          pool[idx] = tmp;
        }
      }
      cell.name = pool[n++];
      if (FRIEND_NAMES.indexOf(cell.name) >= 0) cell.role = 'friend';
    }
  }

  function strip(draft, band, seed, tries, relaxed) {
    const cells = draft.cells.map(function (cell) {
      return {
        key: cell.key,
        unit: cell.unit,
        floor: cell.floor,
        alien: cell.alien,
        role: cell.role,
        name: cell.name,
        speech: cell.speech,
      };
    });
    const byKey = {};
    for (let i = 0; i < cells.length; i++) byKey[cells[i].key] = cells[i];
    return {
      band: band,
      label: BANDS[band].label,
      seed: seed >>> 0,
      tries: tries,
      relaxed: !!relaxed,
      units: draft.units,
      floors: draft.floors,
      alienCount: draft.alienCount,
      alienKeys: draft.alienKeys.slice(),
      doudouKey: draft.doudouKey,
      chainKeys: (draft.chainKeys || []).slice(),
      chainKinds: draft.chainKinds.slice(),
      cells: cells,
      byKey: byKey,
    };
  }

  function generateLevel(band, seed) {
    const rng = mulberry32(seed >>> 0);
    const useBand = BANDS[band] ? band : 'warm';
    for (let i = 1; i <= 45; i++) {
      const draft = generateOnce(useBand, rng);
      if (!draft) continue;
      if (fewestOpens(draft) < openLimit(draft.units, draft.floors, draft.alienCount)) continue;
      return strip(draft, useBand, seed, i, false);
    }
    for (let i = 0; i < 40; i++) {
      const draft = generateOnce(useBand, mulberry32((seed + 1 + i * 997) >>> 0));
      if (!draft) continue;
      const level = strip(draft, useBand, seed, 180 + i, true);
      return level;
    }
    throw new Error('生成失败');
  }

  function heard(level, opened) {
    const list = [];
    for (let i = 0; i < opened.length; i++) {
      const cell = level.byKey[opened[i]];
      if (cell && cell.speech && cell.speech.atom) list.push(cell.speech);
    }
    return list;
  }

  function assess(level, state, action) {
    const opened = state.opened || [];
    const killed = state.killed || [];
    const id = action.key;
    if (!level.byKey[id]) return { ok: false, message: '没有这扇门。' };
    if (opened.indexOf(id) >= 0 || killed.indexOf(id) >= 0) {
      return { ok: false, message: '这扇门已经处理过了。' };
    }
    if (action.type === 'kill' && id === level.doudouKey) {
      return { ok: false, message: '豆豆不会被外星人假扮。' };
    }
    const deduced = deduce(level, new Set(opened), new Set(killed), heard(level, opened));
    if (deduced.contradiction) {
      return { ok: false, message: '已经听到的话对不上，这栋楼的生成有问题。' };
    }
    const mark = deduced.status.get(id);
    if (action.type === 'visit') {
      if (level.byKey[id].alien) return { ok: false, lose: true, message: '这户是外星人。' };
      return { ok: true };
    }
    if (action.type === 'kill') {
      if (mark === 'alien') return { ok: true };
      if (mark === 'good' || id === level.doudouKey) return { ok: false, lose: true, wrong: true, message: '这户是好人。' };
      return { ok: false, message: '还没有听到能证明这户是外星人的话。' };
    }
    return { ok: false, message: '没有这个动作。' };
  }

  function atomHolds(level, atom) {
    const alienSet = new Set(level.alienKeys);
    const draft = {
      units: level.units,
      floors: level.floors,
      cells: level.cells,
      alienSet: alienSet,
    };
    return atomTrue(draft, atom);
  }

  return {
    PATTERN: PATTERN,
    BANDS: BANDS,
    ROLE_LABEL: ROLE_LABEL,
    FRIEND_NAMES: FRIEND_NAMES,
    DIR_WORD: DIR_WORD,
    bandFor: bandFor,
    generateLevel: generateLevel,
    fewestOpens: fewestOpens,
    openLimit: openLimit,
    assess: assess,
    deduce: deduce,
    atomHolds: atomHolds,
    mulberry32: mulberry32,
  };
});




