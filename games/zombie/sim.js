/**
 * 豆豆大战僵尸 · 放置策略
 *
 * 放置是点选，不是拖拽，也不是卡牌养成那一档：
 * 1. 点一张冷却好、阳光够的卡，拿起来；再点一次同一张，放下。
 * 2. 再点草坪上的空格子，才种下去。种一次就放下，并进入冷却。
 * 3. 格子里已经有豆豆、越界、阳光不够、还在冷却：种失败，阳光不扣，卡还拿在手里。
 * 4. 铲子同理：拿起后点一株豆豆铲掉，不退阳光。点空地铲不动。
 * 5. 点天上或花上的阳光才入账。
 * 僵尸只走自己那一行，先啃到嘴边的豆豆；每行门口有一台割草机，用过再进门就输。
 */
(function (root, factory) {
  const data = (typeof module === 'object' && module.exports) ? require('./data.js') : root.ZombieData;
  const api = factory(data);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZombieSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  const L = D.LAYOUT;

  function createMatch(opts) {
    const o = opts || {};
    const level = o.level || D.LEVEL;
    const rng = o.rng || Math.random;
    const mowers = [];
    for (let r = 0; r < L.ROWS; r++) {
      mowers.push({ row: r, x: L.LAWN_X - 34, launched: false });
    }
    return {
      level,
      rng,
      time: 0,
      sun: level.startSun,
      sunT: level.firstSun,
      result: null,
      selected: null,
      grid: Array.from({ length: L.ROWS }, function () { return Array(L.COLS).fill(null); }),
      plants: [],
      zombies: [],
      peas: [],
      suns: [],
      mowers,
      cards: D.CARDS.map(function (c) { return { id: c.id, cd: 0 }; }),
      waveIndex: -1,
      phase: 'prelude',
      phaseT: level.waves[0].delay,
      queue: [],
      nextId: 1,
      events: [],
    };
  }

  function fail(reason) {
    return { ok: false, reason: reason };
  }

  function pickCard(state, id) {
    if (state.result) return fail('已经结束');
    const def = D.cardById(id);
    if (!def) return fail('没有这张卡');
    if (state.selected === id) {
      state.selected = null;
      return { ok: true, cleared: true };
    }
    const card = state.cards.find(function (c) { return c.id === id; });
    if (card.cd > 0) return fail('还在冷却');
    if (state.sun < def.cost) return fail('阳光不够');
    state.selected = id;
    return { ok: true };
  }

  function pickShovel(state) {
    if (state.result) return fail('已经结束');
    state.selected = state.selected === 'shovel' ? null : 'shovel';
    return { ok: true };
  }

  function removePlant(state, p) {
    if (state.grid[p.row][p.col] === p) state.grid[p.row][p.col] = null;
    const i = state.plants.indexOf(p);
    if (i >= 0) state.plants.splice(i, 1);
  }

  function plant(state, row, col) {
    if (state.result) return fail('已经结束');
    const id = state.selected;
    if (!id || id === 'shovel') return fail('先点一张卡片');
    if (row < 0 || col < 0 || row >= L.ROWS || col >= L.COLS) return fail('放不到这里');
    const def = D.cardById(id);
    const card = state.cards.find(function (c) { return c.id === id; });
    if (!def || !card) return fail('没有这张卡');
    if (card.cd > 0) return fail('还在冷却');
    if (state.sun < def.cost) return fail('阳光不够');
    if (state.grid[row][col]) return fail('这里已经有豆豆了');

    state.sun -= def.cost;
    card.cd = def.cd;
    const p = {
      id: state.nextId++,
      kind: id,
      row: row,
      col: col,
      hp: def.hp,
      maxHp: def.hp,
      fire: 0.3,
      prod: def.sunEvery || 0,
      fuse: def.fuse || 0,
      arm: def.arm || 0,
      armed: false,
    };
    state.grid[row][col] = p;
    state.plants.push(p);
    state.selected = null;
    state.events.push({ t: 'place', id: id, row: row, col: col });
    return { ok: true };
  }

  function dig(state, row, col) {
    if (state.result) return fail('已经结束');
    if (row < 0 || col < 0 || row >= L.ROWS || col >= L.COLS) return fail('铲不到这里');
    const p = state.grid[row][col];
    if (!p) return fail('这里没有豆豆');
    removePlant(state, p);
    state.selected = null;
    state.events.push({ t: 'dig', row: row, col: col });
    return { ok: true };
  }

  function useAt(state, row, col) {
    if (state.selected === 'shovel') return dig(state, row, col);
    return plant(state, row, col);
  }

  function preview(state, row, col) {
    if (!state.selected) return null;
    if (row < 0 || col < 0 || row >= L.ROWS || col >= L.COLS) return { ok: false };
    if (state.selected === 'shovel') {
      return { ok: !!state.grid[row][col], mode: 'shovel' };
    }
    if (state.grid[row][col]) return { ok: false, mode: 'plant', kind: state.selected };
    return { ok: true, mode: 'plant', kind: state.selected };
  }

  function spawnSun(state, x, y, restY, kind) {
    state.suns.push({
      id: state.nextId++,
      x: x,
      y: y,
      restY: restY,
      vy: kind === 'flower' ? -70 : 0,
      value: state.level.sunValue,
      life: kind === 'flower' ? 14 : 16,
      kind: kind,
      born: state.time,
    });
  }

  function sunAt(state, x, y) {
    for (let i = state.suns.length - 1; i >= 0; i--) {
      const s = state.suns[i];
      const dx = s.x - x;
      const dy = s.y - y;
      if (dx * dx + dy * dy <= 44 * 44) return s;
    }
    return null;
  }

  function collectSun(state, id) {
    const i = state.suns.findIndex(function (s) { return s.id === id; });
    if (i < 0) return { ok: false };
    const s = state.suns[i];
    state.suns.splice(i, 1);
    state.sun += s.value;
    state.events.push({ t: 'collect', value: s.value, x: s.x, y: s.y });
    return { ok: true, value: s.value };
  }

  function spawnZombie(state, kind, row, x) {
    const def = D.ZOMBIES[kind];
    if (!def) return null;
    const z = {
      id: state.nextId++,
      kind: kind,
      row: row,
      x: x == null ? L.W + 28 : x,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed,
      biteDmg: def.bite,
      biteEvery: def.biteEvery,
      bite: 0.25,
      slow: 0,
      dying: 0,
      w: 52,
    };
    state.zombies.push(z);
    return z;
  }

  function hurtZombie(state, z, dmg, opt) {
    if (!z || z.hp <= 0) return;
    z.hp -= dmg;
    if (opt && opt.slow) z.slow = Math.max(z.slow, opt.slow);
    if (!opt || !opt.silent) {
      state.events.push({
        t: 'hit',
        x: z.x + 18,
        y: D.feetY(z.row) - 86,
        dmg: dmg,
        ice: !!(opt && opt.slow),
      });
    }
    if (z.hp <= 0) {
      z.hp = 0;
      z.dying = 0.55;
      state.events.push({ t: 'dead', kind: 'zombie', x: z.x, y: D.feetY(z.row) - 50, row: z.row });
    }
  }

  function hurtPlant(state, p, dmg) {
    if (!p || p.hp <= 0) return;
    p.hp -= dmg;
    if (p.hp <= 0) {
      p.hp = 0;
      state.events.push({ t: 'dead', kind: 'plant', row: p.row, col: p.col, x: D.cellCenterX(p.col), y: D.feetY(p.row) - 40 });
      removePlant(state, p);
    }
  }

  /** 嘴已经凑到这株豆豆上。只认嘴边这一株，身后的不算。 */
  function findBlocker(state, z) {
    const reach = 28;
    const behind = 34;
    let best = null;
    for (let i = 0; i < state.plants.length; i++) {
      const p = state.plants[i];
      if (p.row !== z.row || p.hp <= 0) continue;
      const cx = D.cellCenterX(p.col);
      if (z.x <= cx + reach && z.x >= cx - behind) {
        if (!best || p.col > best.col) best = p;
      }
    }
    return best;
  }

  function zombieAhead(state, p) {
    const x = D.cellCenterX(p.col) - 8;
    for (let i = 0; i < state.zombies.length; i++) {
      const z = state.zombies[i];
      if (z.row === p.row && z.hp > 0 && z.x + 16 >= x) return true;
    }
    return false;
  }

  function blast(state, row, col, dmg) {
    const left = D.cellCenterX(Math.max(0, col - 1)) - L.COL_W * 0.5;
    const right = D.cellCenterX(Math.min(L.COLS - 1, col + 1)) + L.COL_W * 0.5;
    for (let i = 0; i < state.zombies.length; i++) {
      const z = state.zombies[i];
      if (z.hp <= 0) continue;
      if (Math.abs(z.row - row) > 1) continue;
      const zx = z.x + 20;
      if (zx >= left && zx <= right) hurtZombie(state, z, dmg);
    }
    state.events.push({
      t: 'boom',
      x: D.cellCenterX(col),
      y: D.feetY(row) - 36,
      r: L.COL_W * 1.35,
    });
  }

  function finish(state, result) {
    if (state.result) return;
    state.result = result;
    state.selected = null;
    state.events.push({ t: result });
  }

  function beginWave(state) {
    state.waveIndex += 1;
    const wave = state.level.waves[state.waveIndex];
    state.phase = 'spawning';
    state.queue = wave.spawns.map(function (sp) {
      return { kind: sp.kind, row: sp.row, t: sp.after };
    });
    state.events.push({
      t: 'wave',
      n: state.waveIndex + 1,
      total: state.level.waves.length,
      flag: !!wave.flag,
    });
  }

  function stepPlants(state, dt) {
    for (let i = state.plants.length - 1; i >= 0; i--) {
      const p = state.plants[i];
      const def = D.cardById(p.kind);
      if (!def) continue;
      if (def.sunEvery) {
        p.prod -= dt;
        if (p.prod <= 0) {
          p.prod += def.sunEvery;
          spawnSun(state, D.cellCenterX(p.col) + 46, D.feetY(p.row) - 52, D.feetY(p.row) - 124, 'flower');
        }
      }
      if (def.fuse) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          blast(state, p.row, p.col, def.boom);
          removePlant(state, p);
          continue;
        }
      }
      if (def.arm && !p.armed) {
        p.arm -= dt;
        if (p.arm <= 0) p.armed = true;
      }
      if (def.shot) {
        p.fire -= dt;
        if (p.fire <= 0 && zombieAhead(state, p)) {
          p.fire += def.shot.interval;
          if (p.fire < 0) p.fire = def.shot.interval;
          state.peas.push({
            x: D.cellCenterX(p.col) + 26,
            row: p.row,
            dmg: def.shot.dmg,
            slow: def.shot.slow || 0,
            speed: def.shot.speed,
          });
        }
      }
    }
  }

  function stepPeas(state, dt) {
    for (let i = state.peas.length - 1; i >= 0; i--) {
      const pea = state.peas[i];
      const prev = pea.x;
      pea.x += pea.speed * dt;
      let hit = null;
      for (let k = 0; k < state.zombies.length; k++) {
        const z = state.zombies[k];
        if (z.row !== pea.row || z.hp <= 0) continue;
        const left = z.x - 4;
        const right = z.x + z.w;
        if (pea.x >= left && prev <= right) {
          if (!hit || z.x < hit.x) hit = z;
        }
      }
      if (hit) {
        hurtZombie(state, hit, pea.dmg, pea.slow ? { slow: pea.slow } : null);
        state.peas.splice(i, 1);
      } else if (pea.x > L.W + 60) {
        state.peas.splice(i, 1);
      }
    }
  }

  function stepSuns(state, dt) {
    for (let i = 0; i < state.suns.length; i++) {
      const s = state.suns[i];
      s.life -= dt;
      if (s.kind === 'sky') {
        if (s.y < s.restY) s.y = Math.min(s.restY, s.y + 46 * dt);
      } else if (s.vy !== 0 || s.y < s.restY - 1) {
        s.vy += 220 * dt;
        s.y += s.vy * dt;
        if (s.y >= s.restY && s.vy > 0) {
          s.y = s.restY;
          s.vy = 0;
        }
      }
      if (s.vy === 0 && s.y >= s.restY - 1) {
        s.y = s.restY + Math.sin(state.time * 3 + s.id) * 3;
      }
    }
    state.suns = state.suns.filter(function (s) { return s.life > 0; });
  }

  function stepZombies(state, dt) {
    for (let i = 0; i < state.zombies.length; i++) {
      const z = state.zombies[i];
      if (z.hp <= 0) {
        z.dying -= dt;
        continue;
      }
      if (z.slow > 0) z.slow -= dt;
      const blocker = findBlocker(state, z);
      if (blocker && blocker.kind === 'mine' && blocker.armed) {
        const def = D.cardById('mine');
        const bx = D.cellCenterX(blocker.col);
        const by = D.feetY(blocker.row) - 28;
        hurtZombie(state, z, def.boom);
        removePlant(state, blocker);
        state.events.push({ t: 'boom', x: bx, y: by, r: 78 });
        continue;
      }
      if (blocker) {
        z.bite -= dt;
        if (z.bite <= 0) {
          z.bite = z.biteEvery;
          hurtPlant(state, blocker, z.biteDmg);
        }
      } else {
        z.x -= z.speed * (z.slow > 0 ? 0.5 : 1) * dt;
      }
      if (z.hp > 0 && z.x <= L.LAWN_X + 4) {
        const m = state.mowers[z.row];
        if (m && !m.launched) {
          m.launched = true;
          z.x = L.LAWN_X + 10;
          state.events.push({ t: 'mower', row: z.row });
        }
      }
    }
  }

function stepMowers(state, dt) {
  for (let i = 0; i < state.mowers.length; i++) {
    const m = state.mowers[i];
    if (!m.launched) continue;
    const prev = m.x;
    m.x += 560 * dt;
    for (let k = 0; k < state.zombies.length; k++) {
      const z = state.zombies[k];
      if (z.row !== m.row || z.hp <= 0) continue;
      // 只割机器扫过的那段，开出门口以后才进门的不算
      if (z.x >= prev - 24 && z.x <= m.x + 36) hurtZombie(state, z, z.maxHp, { silent: true });
    }
  }
}

  function checkDoors(state) {
    if (state.result) return;
    for (let i = 0; i < state.zombies.length; i++) {
      const z = state.zombies[i];
      if (z.hp <= 0 || z.x > L.LAWN_X + 4) continue;
      const m = state.mowers[z.row];
      if (m && m.launched && m.x <= z.x + 80) {
        z.x = L.LAWN_X + 8;
        continue;
      }
      finish(state, 'lose');
      return;
    }
  }

  function stepWaves(state, dt) {
    if (state.phase === 'prelude' || state.phase === 'between') {
      state.phaseT -= dt;
      if (state.phaseT <= 0) beginWave(state);
    }
    if (state.phase !== 'spawning' || state.result) return;
    const ready = [];
    const wait = [];
    for (let i = 0; i < state.queue.length; i++) {
      const sp = state.queue[i];
      sp.t -= dt;
      if (sp.t <= 0) ready.push(sp);
      else wait.push(sp);
    }
    state.queue = wait;
    for (let i = 0; i < ready.length; i++) spawnZombie(state, ready[i].kind, ready[i].row);
    const alive = state.zombies.some(function (z) { return z.hp > 0; });
    if (!state.queue.length && !alive) {
      if (state.waveIndex >= state.level.waves.length - 1) finish(state, 'win');
      else {
        state.phase = 'between';
        state.phaseT = state.level.waves[state.waveIndex + 1].delay;
      }
    }
  }

  function stepOnce(state, dt) {
    if (state.result || dt <= 0) return;
    state.time += dt;
    for (let i = 0; i < state.cards.length; i++) {
      const c = state.cards[i];
      if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
    }
    state.sunT -= dt;
    if (state.sunT <= 0) {
      state.sunT += state.level.sunFallEvery;
      if (state.sunT <= 0) state.sunT = state.level.sunFallEvery;
      const span = L.COLS * L.COL_W - 80;
      const x = L.LAWN_X + 40 + state.rng() * span;
      const rest = 56 + state.rng() * (L.H - 130);
      spawnSun(state, x, -24, rest, 'sky');
    }
    stepPlants(state, dt);
    stepPeas(state, dt);
    stepSuns(state, dt);
    stepZombies(state, dt);
    stepMowers(state, dt);
    checkDoors(state);
    state.zombies = state.zombies.filter(function (z) { return !(z.hp <= 0 && z.dying <= 0); });
    if (!state.result) stepWaves(state, dt);
  }

  function step(state, dt) {
    if (!dt || dt <= 0 || state.result) return;
    const n = Math.ceil(dt / 0.05);
    const h = dt / n;
    for (let i = 0; i < n; i++) stepOnce(state, h);
  }

  return {
    createMatch,
    step,
    pickCard,
    pickShovel,
    useAt,
    preview,
    collectSun,
    sunAt,
    spawnZombie,
  };
});
