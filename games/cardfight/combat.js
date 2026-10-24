/**
 * 卡牌养成策略的战斗架子：按 1–6 号位自动出手，怒气技能手动。
 * 不是草坪放置。草坪在 games/zombie/。
 * 普通单体先打前排；前排清空才打后排。
 * 写明打后排的技能可以在前排还活着时打后排，后排没人则落空。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CardFight = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ROWS = ['back', 'front'];
  const COLS = [0, 1, 2];

  function alive(u) {
    return !!(u && u.alive && u.hp > 0);
  }

  function foes(units, side) {
    return units.filter((u) => u.side !== side && alive(u));
  }

  function sortUnits(list) {
    return list.slice().sort((a, b) => a.col - b.col || (a.id < b.id ? -1 : 1));
  }

  function frontAlive(units, side) {
    return units.some((u) => u.side === side && alive(u) && u.row === 'front');
  }

  /** 普通单体能打到的人。前排还有人时只有前排。 */
  function basicTargets(units, attacker) {
    const list = foes(units, attacker.side);
    const front = list.filter((u) => u.row === 'front');
    if (front.length) return sortUnits(front);
    return sortUnits(list.filter((u) => u.row === 'back'));
  }

  function chooseBasicTarget(units, attacker, rng) {
    const list = basicTargets(units, attacker);
    if (!list.length) return null;
    const roll = rng ? rng() : Math.random();
    const i = Math.min(list.length - 1, Math.floor(roll * list.length));
    return list[i];
  }

  var GUARD_DEF = 18;
  var HEAL_RATIO = 0.25;

  function effectiveDef(target) {
    return (target.def || 0) + (target.guard || 0);
  }

  function hurt(target, amount) {
    const damage = Math.max(1, amount);
    const hpBefore = target.hp;
    target.hp -= damage;
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
    }
    return {
      id: target.id,
      name: target.name,
      damage: damage,
      hp: target.hp,
      hpBefore: hpBefore,
      killed: !alive(target),
    };
  }

  /**
   * action:
   *   { type: 'auto' }
   *   { type: 'pick', targetId }
   *   { type: 'back' }  随机后排，没有后排则落空
   *   { type: 'row', row }  打一整排，前排还在也能打后排
   */
  function strike(units, attackerId, action, rng) {
    const attacker = units.find((u) => u.id === attackerId);
    if (!alive(attacker)) return { ok: false, reason: '无法行动', hits: [] };
    if (attacker.acted && !(action && action.asRage)) return { ok: false, reason: '本回合已攻击', hits: [] };
    const kind = action && action.type;
    const rand = rng || Math.random;

    // 磐石架势：只给自己加防，直到自己再完成一次普攻
    if (kind === 'guard') {
      attacker.guard = GUARD_DEF;
      return { ok: true, reason: '', hits: [], heals: [], guard: GUARD_DEF };
    }

    // 月华治愈：只治疗自己所在那一排，含自己
    if (kind === 'heal-row') {
      const list = sortUnits(units.filter((u) => (
        u.side === attacker.side && alive(u) && u.row === attacker.row
      )));
      const heals = [];
      list.forEach((target) => {
        const room = Math.max(0, target.maxHp - target.hp);
        if (!room) return;
        const amount = Math.min(room, Math.max(1, Math.round(target.maxHp * HEAL_RATIO)));
        target.hp += amount;
        heals.push({
          id: target.id,
          name: target.name,
          heal: amount,
          hp: target.hp,
          hpBefore: target.hp - amount,
        });
      });
      return { ok: true, reason: '', hits: [], heals };
    }

    // 长虹：横扫一整排；前排还有人打前排，前排空了打后排
    if (kind === 'row-sweep') {
      const front = foes(units, attacker.side).filter((u) => u.row === 'front');
      const row = front.length ? 'front' : 'back';
      const list = sortUnits(foes(units, attacker.side).filter((u) => u.row === row));
      if (!list.length) return { ok: true, reason: '落空', hits: [] };
      return {
        ok: true,
        reason: '',
        hits: list.map((target) => hurt(target, attacker.atk - effectiveDef(target))),
      };
    }

    // 阔刃：只扫敌方第一排，前排没人就落空，不改扫后排
    if (kind === 'front-sweep') {
      const list = sortUnits(foes(units, attacker.side).filter((u) => u.row === 'front'));
      if (!list.length) return { ok: true, reason: '落空', hits: [] };
      return {
        ok: true,
        reason: '',
        hits: list.map((target) => hurt(target, attacker.atk - effectiveDef(target))),
      };
    }

    // 余烬：按普通单体打一下；这一下收掉人，再打剩下血最低的一下
    if (kind === 'execute') {
      const legal = basicTargets(units, attacker);
      if (!legal.length) return { ok: false, reason: '没有目标', hits: [] };
      const first = action.targetId
        ? legal.find((u) => u.id === action.targetId) || null
        : chooseBasicTarget(units, attacker, rand);
      if (!first) return { ok: false, reason: '前排还在', hits: [] };
      const hits = [hurt(first, attacker.atk - effectiveDef(first))];
      if (hits[0].killed) {
        const rest = foes(units, attacker.side)
          .filter((u) => alive(u) && u.id !== first.id)
          .sort((a, b) => a.hp - b.hp || a.col - b.col);
        if (rest.length) hits.push(hurt(rest[0], attacker.atk - effectiveDef(rest[0])));
      }
      return { ok: true, reason: '', hits };
    }

    if (kind === 'auto' || kind === 'pick') {
      const legal = basicTargets(units, attacker);
      if (!legal.length) return { ok: false, reason: '没有目标', hits: [] };
      let target = null;
      if (kind === 'auto') target = chooseBasicTarget(units, attacker, rand);
      else target = legal.find((u) => u.id === action.targetId) || null;
      if (!target) return { ok: false, reason: '前排还在', hits: [] };
      return {
        ok: true,
        reason: '',
        hits: [hurt(target, attacker.atk - effectiveDef(target))],
      };
    }

    if (kind === 'back') {
      const backs = sortUnits(foes(units, attacker.side).filter((u) => u.row === 'back'));
      if (!backs.length) return { ok: true, reason: '落空', hits: [] };
      const i = Math.min(backs.length - 1, Math.floor(rand() * backs.length));
      const target = backs[i];
      return {
        ok: true,
        reason: '',
        hits: [hurt(target, attacker.atk * 3 - effectiveDef(target))],
      };
    }

    if (kind === 'row') {
      const row = action.row === 'back' ? 'back' : 'front';
      const list = sortUnits(foes(units, attacker.side).filter((u) => u.row === row));
      if (!list.length) return { ok: false, reason: '没有目标', hits: [] };
      return {
        ok: true,
        reason: '',
        hits: list.map((target) => hurt(target, attacker.atk - effectiveDef(target))),
      };
    }

    return { ok: false, reason: '无法行动', hits: [] };
  }

  function livingSide(units, side) {
    return units.filter((u) => u.side === side && alive(u));
  }

  /** 第一排（前排）1 2 3，第二排（后排）4 5 6。出手从 1 开始。 */
  function slotOf(unit) {
    if (!unit) return 0;
    return (unit.row === 'front' ? 1 : 4) + unit.col;
  }

  /** 同一号位先我方、再敌方。空位跳过。本回合已攻击的跳过。 */
  function nextActor(units) {
    let slot;
    let si;
    const sides = ['player', 'enemy'];
    for (slot = 1; slot <= 6; slot += 1) {
      for (si = 0; si < sides.length; si += 1) {
        const side = sides[si];
        const found = units.find((u) => alive(u) && !u.acted && u.side === side && slotOf(u) === slot);
        if (found) return found;
      }
    }
    return null;
  }

  var RAGE_MAX = 1000;
  var RAGE_ON_ATTACK = 150;
  var RAGE_ON_KILL = 300;

  /** 按这次实际掉的血占最大生命的比例。掉四成就是 400。 */
  function rageOnHurt(maxHp, hpBefore, hpAfter) {
    const lost = Math.max(0, (hpBefore || 0) - (hpAfter || 0));
    const cap = maxHp || hpBefore || 0;
    if (!cap || !lost) return 0;
    return Math.round(lost / cap * RAGE_MAX);
  }

  function rageReady(unit) {
    return alive(unit) && !!unit.rageSkill && (unit.rage || 0) >= RAGE_MAX;
  }

  function enqueueRage(queue, unit, seq) {
    const list = queue || [];
    const now = seq || 0;
    if (!alive(unit)) return { queue: list, seq: now, ok: false, reason: '无法行动' };
    if (!unit.rageSkill || (unit.rage || 0) < RAGE_MAX) {
      return { queue: list, seq: now, ok: false, reason: '怒气不足' };
    }
    if (list.some((item) => item.id === unit.id)) {
      return { queue: list, seq: now, ok: false, reason: '已经在排队' };
    }
    const next = now + 1;
    return {
      queue: list.concat([{ id: unit.id, seq: next }]),
      seq: next,
      ok: true,
      reason: '',
    };
  }

  /** 自动施放：敌方怒气满了就排队。我方只在开了自动时排。同一时刻按号位，同号先我后敌。 */
  function enqueueReady(queue, units, seq, opts) {
    const playerAuto = !!(opts && opts.playerAuto);
    let state = { queue: (queue || []).slice(), seq: seq || 0, ok: true, reason: '' };
    let slot;
    let si;
    const sides = ['player', 'enemy'];
    for (slot = 1; slot <= 6; slot += 1) {
      for (si = 0; si < sides.length; si += 1) {
        const side = sides[si];
        if (side === 'player' && !playerAuto) continue;
        const found = units.find((u) => u.side === side && slotOf(u) === slot);
        if (!found) continue;
        const added = enqueueRage(state.queue, found, state.seq);
        if (added.ok) state = added;
      }
    }
    return state;
  }

  /** 队首若已倒下或怒气不够，跳过。后面的人继续等。 */
  function takeRage(queue, units) {
    const rest = (queue || []).slice();
    while (rest.length) {
      const head = rest.shift();
      const unit = units.find((u) => u.id === head.id);
      if (rageReady(unit)) return { queue: rest, unit: unit };
    }
    return { queue: rest, unit: null };
  }

  return {
    ROWS: ROWS,
    COLS: COLS,
    GUARD_DEF: GUARD_DEF,
    HEAL_RATIO: HEAL_RATIO,
    effectiveDef: effectiveDef,
    alive: alive,
    frontAlive: frontAlive,
    basicTargets: basicTargets,
    chooseBasicTarget: chooseBasicTarget,
    strike: strike,
    livingSide: livingSide,
    slotOf: slotOf,
    nextActor: nextActor,
    RAGE_MAX: RAGE_MAX,
    RAGE_ON_ATTACK: RAGE_ON_ATTACK,
    RAGE_ON_KILL: RAGE_ON_KILL,
    rageOnHurt: rageOnHurt,
    rageReady: rageReady,
    enqueueRage: enqueueRage,
    enqueueReady: enqueueReady,
    takeRage: takeRage,
  };
});
