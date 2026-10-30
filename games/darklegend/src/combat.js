/* 豆豆海岛幻想 · 战斗规则层（纯函数）
   只放"怎么算"：伤害、范围、目标选择、怪物行为判定。
   不放"算完干什么"：日志、飘字、存档、结算弹窗留在 game.js。

   约定：不读全局；敌人/玩家/地图都显式传入。
*/
import { DL } from './namespace.js';
const global = globalThis;

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
  // 旋风斩（v18.1，原名半月弯刀）：身周 8 邻 = 360°，被围时一次扫一圈。
  // 旧版只扫身前 5 格——怪从背后/侧面咬你时打不到，所以像摆设。
  // dir 参数留着兼容调用方，范围不再看朝向。
  function halfMoonCells(px, py) {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        out.push([px + dx, py + dy]);
      }
    }
    return out;
  }

  function targetsAt(enemies, cells) {
    const out = [];
    for (const [x, y] of cells) {
      const e = enemies.find((en) => en.hp > 0 && en.x === x && en.y === y);
      if (e) out.push(e);
    }
    return out;
  }

  // 贴身：切比雪夫距离 1（八邻）；先看朝向正前方，再取邻格血最少的
  function isAdjacent(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1;
  }

  function adjacentTarget(enemies, px, py, dir) {
    const [fx, fy] = dirVec(dir);
    const front = enemies.find((e) => e.hp > 0 && e.x === px + fx && e.y === py + fy);
    if (front) return front;
    return enemies.filter((e) => e.hp > 0 && isAdjacent(e.x, e.y, px, py))
      .sort((a, b) => a.hp - b.hp)[0] || null;
  }

  /* ---------- 怪物行为判定（R14.5 两档） ---------- */
  // passive 被动（鸡 / 稻草人 / BOSS）：不主动进攻；挨打才还手
  //   - 普通被动：追够 passiveChase 格就放弃
  //   - BOSS：激怒后持续追，直到 leash 脱战（挂机不打 BOSS，必须手控）
  // active  主动（野狗 / 野猪）：进入 aggro 半径就追
  // 返回：leash | idle | giveup | attack | chase
  const aiOf = (enemy) => (enemy.ai === 'passive' ? 'passive' : 'active');

  function decide(enemy, playerLv, distance) {
    const A = (DL.DATA && DL.DATA.AI) || {};
    const ai = aiOf(enemy);
    if (distance > (A.leash || 14)) return 'leash';
    if (!enemy.boss && enemy.lv < playerLv - 5 && !enemy.aggroOn) return 'idle';
    if (distance === 1) {
      // 仅 BOSS：未激怒时贴身也不砍；鸡/稻草人贴身仍会啄（鸡固定 1–3，不吃防）
      if (enemy.boss && !enemy.aggroOn) return 'idle';
      return 'attack';
    }
    if (enemy.aggroOn) {
      // BOSS 激怒后不当普通被动放弃
      if (ai === 'passive' && !enemy.boss && distance > (A.passiveChase || 3)) return 'giveup';
      return 'chase';
    }
    if (ai === 'passive') return 'idle';
    return distance <= (enemy.aggro || 0) ? 'chase' : 'idle';
  }

  // 挂机可打：普通 / 精英；稀有与 BOSS 必须手控
  function farmEligible(enemy) {
    if (!enemy || enemy.hp <= 0) return false;
    if (enemy.boss || enemy.rare) return false;
    return true;
  }

  // 朝玩家走一步（优先斜切，再正交）；blocked(nx,ny) 或 blocked(nx,ny,dx,dy)
  // 若提供 map，则用 World.canStep 防穿角
  function nextStep(ex, ey, px, py, blocked, map) {
    const dx = Math.sign(px - ex), dy = Math.sign(py - ey);
    const steps = [];
    if (dx && dy) steps.push([dx, dy]);
    if (dx) steps.push([dx, 0]);
    if (dy) steps.push([0, dy]);
    // 次选：另一轴优先
    if (dx && dy) {
      steps.push([dx, 0], [0, dy]);
    }
    const seen = new Set();
    for (const [mx, my] of steps) {
      if (!mx && !my) continue;
      const key = mx + ',' + my;
      if (seen.has(key)) continue;
      seen.add(key);
      const nx = ex + mx, ny = ey + my;
      if (map && DL.World && DL.World.canStep && !DL.World.canStep(map, ex, ey, mx, my)) continue;
      if (blocked(nx, ny, mx, my)) continue;
      return { x: nx, y: ny };
    }
    return null;
  }

  DL.Combat = {
    dirVec, playerDamage, enemyDamage,
    halfMoonCells, targetsAt, adjacentTarget, isAdjacent,
    decide, nextStep, farmEligible,
  };
