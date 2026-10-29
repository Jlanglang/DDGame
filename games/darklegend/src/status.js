/* 豆豆海岛幻想 · 状态层（R5）
   只放"状态怎么算"：施加、叠加、回合末结算、能否行动。
   日志、飘字、UI 留在 game.js。

   单位（玩家或怪）身上挂 unit.statuses = { key: { left, stacks, dmg, appliedAt } }

   口径（对齐规则）：
   - R5.13 同名状态不叠层，除非标注可叠；重复施加只刷新持续时间
   - R5.14 回合末结算，顺序：先毒后灼烧后流血
   - 施加当回合不结算（和 R4.5 的 CD 口径一致）；下回合起每回合末先结算伤害再减 1 回合
   - 伤害取"施加者属性快照"：R5.1 毒只看道术、与目标当前血量无关
*/
import { DL } from './namespace.js';
const global = globalThis;

  /* ---------- 状态表（R5） ----------
     dot      每回合末结算
     order    R5.14 结算顺序
     stack    是否可叠层；max 层数上限
     stat/mul 伤害 = 施加者对应属性 × mul × 层数
     breaksOnHit 受击解除（R5.8 眩晕）
  */
  const DEFS = {
    poison: {
      key: 'poison', name: '中毒', sym: '☠',
      dot: true, order: 1, stack: false, max: 1, turns: 5,
      stat: 'tao', mul: 0.5,
    },
    burn: {
      key: 'burn', name: '灼烧', sym: '🔥',
      dot: true, order: 2, stack: true, max: 3, turns: 3,
      stat: 'atk', mul: 0.15,
    },
    stun: {
      key: 'stun', name: '眩晕', sym: '💫',
      dot: false, order: 0, stack: false, max: 1, turns: 1,
      breaksOnHit: true,
    },
    paralyze: {
      key: 'paralyze', name: '麻痹', sym: '⚡',
      dot: false, order: 0, stack: false, max: 1, turns: 1,
    },
  };

  // 回合末的结算顺序：只有 DoT 参与，按 order 升序（R5.14 先毒后灼烧后流血）
  const ORDER = Object.keys(DEFS)
    .filter((k) => DEFS[k].dot)
    .sort((a, b) => DEFS[a].order - DEFS[b].order);

  const bag = (unit) => (unit.statuses || (unit.statuses = {}));

  // 毒的每跳伤害只看施法者道术：打 5000 血 BOSS 和 500 血小怪掉得一样多
  function damageFrom(key, stat) {
    const d = DEFS[key];
    if (!d || !d.mul || !(stat > 0)) return 0;
    return Math.max(0, Math.round(stat * d.mul));
  }

  /* ---------- 施加 ---------- */
  function apply(unit, key, opt) {
    const d = DEFS[key];
    if (!d || !unit) return null;
    if (unit.hp !== undefined && unit.hp <= 0) return null;

    const o = opt || {};
    const turn = o.turn || 0;
    const turns = Math.max(1, Math.round(o.turns || d.turns));
    const dmg = o.dmg != null ? Math.max(0, Math.round(o.dmg)) : damageFrom(key, o.stat || 0);

    const st = bag(unit);
    const old = st[key];
    if (old) {
      // 可叠的（灼烧）加一层，不可叠的只刷新时间
      if (d.stack) old.stacks = Math.min(d.max, (old.stacks || 1) + 1);
      old.left = Math.max(old.left, turns);
      old.appliedAt = turn;
      if (dmg > 0) old.dmg = Math.max(old.dmg || 0, dmg);
      return old;
    }
    st[key] = { key, left: turns, stacks: 1, dmg, appliedAt: turn };
    return st[key];
  }

  /* ---------- 回合末结算 ---------- */
  // 返回 { hits:[{key,name,dmg,stacks}], expired:[key], dead }
  function tick(unit, turn) {
    const out = { hits: [], expired: [], dead: false };
    const st = unit && unit.statuses;
    if (!st) return out;

    // 1. 先算伤害（先毒后灼烧）
    for (const key of ORDER) {
      const s = st[key];
      if (!s || turn <= s.appliedAt) continue;   // 施加当回合不结算
      const dmg = Math.max(0, Math.round((s.dmg || 0) * (s.stacks || 1)));
      if (!dmg) continue;
      unit.hp -= dmg;
      out.hits.push({ key, name: DEFS[key].name, dmg, stacks: s.stacks || 1 });
    }

    // 2. 再统一减持续（控制类也在这里到期）
    for (const key of Object.keys(st)) {
      const s = st[key];
      if (!s || turn <= s.appliedAt) continue;
      s.left -= 1;
      if (s.left <= 0) {
        delete st[key];
        out.expired.push(key);
      }
    }

    out.dead = unit.hp !== undefined && unit.hp <= 0;
    return out;
  }

  /* ---------- 受击：解除"受击解除"类（眩晕） ---------- */
  function onHit(unit) {
    const st = unit && unit.statuses;
    if (!st) return null;
    for (const key of Object.keys(st)) {
      if (DEFS[key] && DEFS[key].breaksOnHit) {
        delete st[key];
        return key;
      }
    }
    return null;
  }

  // 眩晕 / 麻痹：这一回合不能行动
  const canAct = (unit) => {
    const st = unit && unit.statuses;
    return !st || !(st.stun || st.paralyze);
  };

  const has = (unit, key) => !!(unit && unit.statuses && unit.statuses[key]);

  /* ---------- 给 UI 用 ---------- */
  // [{ key, name, sym, left, stacks, dot, blink }]，blink = 剩余 ≤2 回合（R5.16）
  function list(unit) {
    const st = unit && unit.statuses;
    if (!st) return [];
    const keys = Object.keys(st).sort((a, b) => (DEFS[a] ? DEFS[a].order : 99) - (DEFS[b] ? DEFS[b].order : 99));
    const out = [];
    for (const k of keys) {
      const d = DEFS[k];
      const s = st[k];
      if (!d || !s) continue;
      out.push({
        key: k, name: d.name, sym: d.sym, left: s.left,
        stacks: s.stacks || 1, dot: !!d.dot, blink: s.left <= 2,
      });
    }
    return out;
  }

  // "☠3·2 🔥1"（R15.2 符号 + 数字）
  const text = (unit) =>
    list(unit).map((s) => `${s.sym}${s.left}${s.stacks > 1 ? '·' + s.stacks : ''}`).join(' ');

  function clear(unit) {
    if (unit) unit.statuses = {};
  }

  DL.Status = {
    DEFS, ORDER, damageFrom,
    apply, tick, onHit, canAct, has,
    list, text, clear,
  };
