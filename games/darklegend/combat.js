/* 豆豆暗黑传奇 · 战斗规则层（纯函数）
   只放"怎么算"：伤害、范围、目标选择、怪物行为判定。
   不放"算完干什么"：日志、飘字、存档、结算弹窗留在 game.js。

   约定：不读全局；敌人/玩家/地图都显式传入。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});

  const dirVec = (dir) => {
    if (dir === 'l') return [-1, 0];
    if (dir === 'r') return [1, 0];
    if (dir === 'u') return [0, -1];
    return [0, 1];
  };

  /* ---------- 伤害 ---------- */
  // 玩家打怪：攻击在 [min,max] 内均匀取值 × 技能倍率 − 怪防（±25%），最低 1
  function playerDamage(atkMin, atkMax, enemyDef, mult) {
    const atk = atkMin + Math.random() * Math.max(0, atkMax - atkMin);
    return Math.max(1, Math.round(atk * mult - DL.Core.roll(enemyDef)));
  }

  // 怪打玩家：怪攻（±25%）− 玩家防（区间内取值 × 0.9），并按防秒杀上限截断
  function enemyDamage(enemyAtk, defMin, defMax, maxHp, isBoss) {
    const def = defMin + Math.random() * Math.max(0, defMax - defMin);
    let dmg = Math.max(1, Math.round(DL.Core.roll(enemyAtk) - DL.Core.roll(def * 0.9)));
    const cap = Math.ceil(maxHp * (isBoss ? 0.5 : 0.35));
    return Math.min(dmg, cap);
  }

  /* ---------- 目标选择 ---------- */
  // 半月：朝向前方的九宫格半边 5 格（正前、前左、前右、正左、正右）
  function halfMoonCells(px, py, dir) {
    const [fx, fy] = dirVec(dir);
    const [sx, sy] = fx !== 0 ? [0, 1] : [1, 0];
    return [
      [px + fx, py + fy],
      [px + fx + sx, py + fy + sy],
      [px + fx - sx, py + fy - sy],
      [px + sx, py + sy],
      [px - sx, py - sy],
    ];
  }

  function targetsAt(enemies, cells) {
    const out = [];
    for (const [x, y] of cells) {
      const e = enemies.find((en) => en.hp > 0 && en.x === x && en.y === y);
      if (e) out.push(e);
    }
    return out;
  }

  // 普攻目标：先看正前方，再找四邻格里血最少的
  function adjacentTarget(enemies, px, py, dir) {
    const [fx, fy] = dirVec(dir);
    const front = enemies.find((e) => e.hp > 0 && e.x === px + fx && e.y === py + fy);
    if (front) return front;
    return enemies.filter((e) => e.hp > 0 && Math.abs(e.x - px) + Math.abs(e.y - py) === 1)
      .sort((a, b) => a.hp - b.hp)[0] || null;
  }

  /* ---------- 怪物行为判定（R14.6 两档） ---------- */
  // passive 被动（鸡 / 稻草人）：不主动进攻；挨打才还手，追够 passiveChase 格就放弃
  // active  主动（野狗 / 野猪 / BOSS）：进入 aggro 半径就追
  // 返回：leash（脱战）| idle（不动）| giveup（放你走）| attack（相邻攻击）| chase（追击）
  const aiOf = (enemy) => (enemy.ai === 'passive' ? 'passive' : 'active');

  function decide(enemy, playerLv, distance) {
    const A = (DL.DATA && DL.DATA.AI) || {};
    const ai = aiOf(enemy);
    if (distance > (A.leash || 14)) return 'leash';
    if (!enemy.boss && enemy.lv < playerLv - 5 && !enemy.aggroOn) return 'idle';
    if (distance === 1) return 'attack';
    if (enemy.aggroOn) {
      if (ai === 'passive' && distance > (A.passiveChase || 3)) return 'giveup';
      return 'chase';
    }
    if (ai === 'passive') return 'idle';                       // 被动怪绝不主动
    return distance <= (enemy.aggro || 0) ? 'chase' : 'idle';
  }

  // 朝玩家走一步（先横后竖 / 先竖后横），返回下一步坐标或 null
  function nextStep(ex, ey, px, py, blocked) {
    const dx = Math.sign(px - ex), dy = Math.sign(py - ey);
    const horizFirst = Math.abs(px - ex) >= Math.abs(py - ey);
    const steps = horizFirst ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
    for (const [mx, my] of steps) {
      if (!mx && !my) continue;
      const nx = ex + mx, ny = ey + my;
      if (!blocked(nx, ny)) return { x: nx, y: ny };
    }
    return null;
  }

  DL.Combat = {
    dirVec, playerDamage, enemyDamage,
    halfMoonCells, targetsAt, adjacentTarget,
    decide, nextStep,
  };
})(typeof window !== 'undefined' ? window : globalThis);
