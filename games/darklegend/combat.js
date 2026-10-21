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
  // 玩家打怪：攻均值（±25%）× 技能倍率 − 怪防（±25%），最低 1
  function playerDamage(atkMean, enemyDef, mult) {
    return Math.max(1, Math.round(DL.Core.roll(atkMean) * mult - DL.Core.roll(enemyDef)));
  }

  // 怪打玩家：怪攻（±25%）− 玩家防×0.9（±25%），并按防秒杀上限截断
  function enemyDamage(enemyAtk, defMean, maxHp, isBoss) {
    let dmg = Math.max(1, Math.round(DL.Core.roll(enemyAtk) - DL.Core.roll(defMean * 0.9)));
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

  /* ---------- 怪物行为判定 ---------- */
  // 返回：leash（脱战）| idle（不动）| attack（相邻攻击）| chase（追击）
  function decide(enemy, playerLv, distance) {
    if (distance > 14) return 'leash';
    if (!enemy.boss && enemy.lv < playerLv - 5 && !enemy.aggroOn) return 'idle';
    if (distance === 1) return 'attack';
    if (enemy.aggroOn || distance <= enemy.aggro) return 'chase';
    return 'idle';
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
