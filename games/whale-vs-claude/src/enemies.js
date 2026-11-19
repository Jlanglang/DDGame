/* =============================================================
 * 鲸鱼娘大战 Claude v2 — src/enemies.js
 * 敌人类型数据 + 刷怪 / 移动 / 开火 / BOSS。契约见 SPEC-v2.md 5.2。
 * 浏览器全局脚本（IIFE），不 import/export，不依赖 DOM，Node 可直接加载。
 * 只通过 WV.* 调用 core 的碰撞/地形工具，不重复实现核心逻辑。
 * ============================================================= */
(function (root) {
  'use strict';

  const WV = root.WV = root.WV || {};

  const ENEMY_W = 34;
  const ENEMY_H = 34;
  const DECIDE_MIN = 0.5;   // 方向决策间隔（秒）
  const DECIDE_MAX = 1.5;
  const BULLET_LIFE = 2.4;  // 敌弹存活秒数（game.js 递减）
  const FLASH_SEC = 0.15;   // 受击闪白时长（game.js 用 flash*4 算透明度）
  const BOSS_SUMMON_CD = 8; // BOSS 阶段 2 召唤间隔
  const MAX_FIELD_ENEMIES = 6; // BOSS 召唤上限（含 BOSS 自身）

  // 与 core.js 一致的地形值；仅用于“子弹弹道上有没有墙”的射线采样
  const T_BRICK = 1;
  const T_STEEL = 2;

  /* ---------------- 敌人类型（SPEC 5.2 硬契约，勿改数值） ---------------- */
  const EnemyTypes = {
    grunt:  { hp: 1,  speed: 70,  fireMin: 2.1, fireMax: 3.6, bulletSpeed: 240, dmg: 1, score: 100,  radius: 17 },
    scout:  { hp: 1,  speed: 100, fireMin: 3.0, fireMax: 4.2, bulletSpeed: 260, dmg: 1, score: 120,  radius: 15 },
    heavy:  { hp: 3,  speed: 48,  fireMin: 2.5, fireMax: 4.0, bulletSpeed: 220, dmg: 2, score: 200,  radius: 18 },
    sniper: { hp: 2,  speed: 62,  fireMin: 3.4, fireMax: 4.6, bulletSpeed: 310, dmg: 1, score: 180,  radius: 16 },
    boss:   { hp: 20, speed: 46,  fireMin: 2.2, fireMax: 2.8, bulletSpeed: 210, dmg: 2, score: 1500, radius: 24 }
  };
  WV.EnemyTypes = EnemyTypes;

  /* ---------------- 局部小工具 ---------------- */
  function rand() {
    return typeof WV.rand === 'function' ? WV.rand() : Math.random();
  }
  function num(v, fallback) {
    return (typeof v === 'number' && isFinite(v)) ? v : fallback;
  }
  function mapW() { return num(WV.MAP_W, num(WV.COLS, 15) * num(WV.TILE, 40)); }
  function mapH() { return num(WV.MAP_H, num(WV.ROWS, 15) * num(WV.TILE, 40)); }
  function clamp(v, lo, hi) {
    if (hi < lo) return lo;
    if (typeof WV.clamp === 'function') return WV.clamp(v, lo, hi);
    return v < lo ? lo : (v > hi ? hi : v);
  }
  function clampX(x) { return clamp(x, 0, mapW() - ENEMY_W); }
  function clampY(y) { return clamp(y, 0, mapH() - ENEMY_H); }
  function dirDX(d) { return (WV.DX && WV.DX[d]) || 0; }
  function dirDY(d) { return (WV.DY && WV.DY[d]) || 0; }
  function tankFits(x, y) {
    return !WV.blockedForTank(x, y, ENEMY_W, ENEMY_H);
  }
  function typeOf(e) {
    return EnemyTypes[e.kind] || EnemyTypes.grunt;
  }
  function isBrickOrSteel(t) {
    return t === T_BRICK || t === T_STEEL;
  }
  function dinnerCenter(G) {
    if (G && G.dinner) {
      return { x: G.dinner.x + G.dinner.w / 2, y: G.dinner.y + G.dinner.h / 2 };
    }
    return { x: mapW() / 2, y: mapH() - 60 };
  }
  function playerCenter(G) {
    const p = G && G.player;
    if (p && p.alive !== false) {
      return { x: p.x + (p.w || ENEMY_W) / 2, y: p.y + (p.h || ENEMY_H) / 2 };
    }
    return null;
  }

  /* ---------------- 方向选择 ---------------- */

  // 朝目标点的四方向（主轴为目标差值大的那根轴，平局随机）
  function dirToward(e, tx, ty) {
    const dx = tx - (e.x + e.w / 2);
    const dy = ty - (e.y + e.h / 2);
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return e.dir;
    let horizontal;
    if (Math.abs(dx) > Math.abs(dy)) horizontal = true;
    else if (Math.abs(dy) > Math.abs(dx)) horizontal = false;
    else horizontal = rand() < 0.5;
    if (horizontal) return dx >= 0 ? 1 : 3;
    return dy >= 0 ? 2 : 0;
  }

  // 候选方向顺序：首选 → 两个垂直方向 → 反向
  function dirCandidates(want) {
    const perp = (want % 2 === 0) ? [1, 3] : [0, 2];
    if (rand() < 0.5) { const t = perp[0]; perp[0] = perp[1]; perp[1] = t; }
    return [want, perp[0], perp[1], (want + 2) % 4];
  }

  // 按当前方向能否走 dist 像素（逐轴碰撞检测，含出界）
  function canWalk(e, d, dist) {
    if (!(dist > 0)) return false;
    const nx = e.x + dirDX(d) * dist;
    const ny = e.y + dirDY(d) * dist;
    if (nx < 0 || ny < 0 || nx + e.w > mapW() || ny + e.h > mapH()) return false;
    return !WV.blockedForTank(nx, ny, e.w, e.h);
  }

  function advance(e, d, dist) {
    e.x = clampX(e.x + dirDX(d) * dist);
    e.y = clampY(e.y + dirDY(d) * dist);
  }

  // 从“不走 avoidDir”的方向里随机挑一个当前走得通的；都不行就试 2px 微距
  function pickFreeDir(e, dist, avoidDir) {
    const primary = [];
    for (let d = 0; d < 4; d++) {
      if (d === avoidDir) continue;
      if (canWalk(e, d, dist)) primary.push(d);
    }
    if (!primary.length) {
      for (let d = 0; d < 4; d++) {
        if (d === avoidDir) continue;
        if (canWalk(e, d, 2)) primary.push(d);
      }
    }
    if (!primary.length) return -1;
    const back = (avoidDir + 2) % 4;
    const forward = primary.filter(function (d) { return d !== back; });
    const pool = forward.length ? forward : primary;
    const idx = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    return pool[idx];
  }

  // 每 0.5–1.5s 决策：35% 朝老巢 / 65% 朝玩家，并挑一个眼前不撞墙的方向
  function decideMovement(G, e) {
    const useDinner = rand() < 0.25;
    const target = useDinner ? dinnerCenter(G) : (playerCenter(G) || dinnerCenter(G));
    const want = dirToward(e, target.x, target.y);
    const order = dirCandidates(want);
    const probe = Math.max(8, Math.min(26, e.speed * 0.2));
    for (let i = 0; i < order.length; i++) {
      if (canWalk(e, order[i], probe)) {
        e.dir = order[i];
        return;
      }
    }
    // 四面都堵：保留当前方向，由 moveEnemy 的撞墙换向兜底
  }

  /* ---------------- 移动 ---------------- */

  function moveEnemy(e, dt) {
    const dist = e.speed * dt;
    if (!(dist > 0)) return false;

    // 主轴能走就走
    if (canWalk(e, e.dir, dist)) {
      advance(e, e.dir, dist);
      return true;
    }

    // 撞墙立即换向：挑一个真的走得通的方向，并保持至少 0.4s 防止贴墙抖动
    const turn = pickFreeDir(e, Math.max(6, Math.min(20, dist * 6)), e.dir);
    if (turn !== -1) {
      e.dir = turn;
      e._decisionT = Math.max(e._decisionT, 0.4);
      if (canWalk(e, e.dir, dist)) {
        advance(e, e.dir, dist);
        return true;
      }
    } else {
      // 完全困住（极端地形）：尽快重新决策，别原地死等
      e._decisionT = Math.min(e._decisionT, 0.25);
    }
    return false;
  }

  /* ---------------- 开火 ---------------- */

  function muzzleOf(e) {
    const off = e.w / 2 + 6; // 车头前方，避免子弹生在车体里
    return {
      x: e.x + e.w / 2 + dirDX(e.dir) * off,
      y: e.y + e.h / 2 + dirDY(e.dir) * off
    };
  }

  // 弹道上是否有砖/钢（老巢不挡：敌人就是要打老巢）
  function wallAhead(mx, my, d) {
    if (isBrickOrSteel(WV.tileAt(mx, my))) return true;
    for (let dist = 12; dist <= 156; dist += 12) {
      const px = mx + dirDX(d) * dist;
      const py = my + dirDY(d) * dist;
      if (px < 0 || py < 0 || px > mapW() || py > mapH()) return false;
      if (isBrickOrSteel(WV.tileAt(px, py))) return true;
    }
    return false;
  }

  // 前方 120px 内是否有其它活着的敌人（避免互相堵枪口）
  function friendlyAhead(G, e, mx, my, d) {
    const list = G.enemies || [];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o || o === e || o.hp <= 0 || o.dead) continue;
      const left = o.x - 4, right = o.x + o.w + 4;
      const top = o.y - 4, bottom = o.y + o.h + 4;
      for (let dist = 8; dist <= 120; dist += 12) {
        const px = mx + dirDX(d) * dist;
        const py = my + dirDY(d) * dist;
        if (px > left && px < right && py > top && py < bottom) return true;
      }
    }
    return false;
  }

  function pushBullet(G, e, x, y, dx, dy, noDinner) {
    if (!Array.isArray(G.bullets)) G.bullets = [];
    const t = typeOf(e);
    // 只有 heavy/boss 能破钢：老巢钢墙只对重火力有威胁，玩家优先杀 heavy 就能守住
    const power = (e.kind === 'heavy' || e.kind === 'boss') ? 2 : 1;
    G.bullets.push({
      x: x,
      y: y,
      dx: dx,
      dy: dy,
      speed: t.bulletSpeed,
      owner: 'enemy',
      dmg: t.dmg,
      power: power,
      life: BULLET_LIFE,
      noDinner: !!noDinner
    });
  }

  // 朝向上 260px 内有没有玩家或老巢：没有就不开枪，避免隔着半张地图拆墙
  function aheadHasTarget(G, e) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const p = G.player;
    for (let dist = 16; dist <= 260; dist += 16) {
      const px = cx + dirDX(e.dir) * dist;
      const py = cy + dirDY(e.dir) * dist;
      if (p && p.lives > 0 &&
          px > p.x - 6 && px < p.x + p.w + 6 &&
          py > p.y - 6 && py < p.y + p.h + 6) return true;
      if (G.dinner &&
          px > G.dinner.x - 4 && px < G.dinner.x + G.dinner.w + 4 &&
          py > G.dinner.y - 4 && py < G.dinner.y + G.dinner.h + 4) return true;
    }
    return false;
  }

  function tryFire(G, e) {
    const t = typeOf(e);
    const m = muzzleOf(e);
    if (!aheadHasTarget(G, e)) { e.fireCd = 0.5 + rand() * 0.5; return false; }
    if (wallAhead(m.x, m.y, e.dir) || friendlyAhead(G, e, m.x, m.y, e.dir)) {
      // 被挡：短延迟后重试，不重置整段冷却
      e.fireCd = 0.18 + rand() * 0.24;
      return false;
    }
    pushBullet(G, e, m.x, m.y, dirDX(e.dir), dirDY(e.dir));
    e.fireCd = t.fireMin + rand() * (t.fireMax - t.fireMin);
    return true;
  }

  /* ---------------- BOSS ---------------- */

  function bossPickDir(G, e) {
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (!canWalk(e, d, 24)) continue;
      // 靠近边界时降低继续朝墙走的权重，让 BOSS 在场地中缓慢换位
      const look = 90;
      const nx = e.x + dirDX(d) * look;
      const ny = e.y + dirDY(d) * look;
      const risky = nx < 50 || ny < 50 || nx + e.w > mapW() - 50 || ny + e.h > mapH() - 50;
      opts.push({ d: d, w: risky ? 0.25 : 1 });
    }
    if (!opts.length) return;
    let total = 0;
    for (let i = 0; i < opts.length; i++) total += opts[i].w;
    let r = rand() * total;
    for (let i = 0; i < opts.length; i++) {
      r -= opts[i].w;
      if (r <= 0) { e.dir = opts[i].d; return; }
    }
    e.dir = opts[opts.length - 1].d;
  }

  function aliveEnemyCount(G) {
    let n = 0;
    const list = G.enemies || [];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o && o.hp > 0 && !o.dead) n++;
    }
    return n;
  }

  // BOSS 阶段 1：三向扇形（中间 + 左右各偏 20°）；阶段 2 额外每 8s 召唤
  function bossPattern(G, e) {
    if (!G || !e || e.hp <= 0 || e.dead) return;

    // 弹幕基准方向：瞄玩家（移动上依旧不追玩家）；没有玩家就按面朝方向
    const pc = playerCenter(G);
    let base;
    if (pc) {
      base = Math.atan2(pc.y - (e.y + e.h / 2), pc.x - (e.x + e.w / 2));
    } else {
      base = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][e.dir & 3];
    }

    // 阶段 1 单发瞄玩家，阶段 2 才三向扇形：前半段给玩家喘口气
    const spread = 20 * Math.PI / 180;
    const phase2 = e.hp <= e.maxHp * 0.5;
    const angles = phase2 ? [base - spread, base + spread] : [base];
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const off = e.w / 2 + 8;
    const mx = cx + Math.cos(base) * off;
    const my = cy + Math.sin(base) * off;
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      // BOSS 弹幕不拆家：追着玩家打，但别把大白饭顺手端走
      pushBullet(G, e, mx, my, Math.cos(a), Math.sin(a), true);
    }

    // 阶段 2：血量 <= 50% 后每 8s 召唤 2 个 grunt；场上 <6 才召，且最多召 2 次（不无限堆）
    if (e.hp <= e.maxHp * 0.5 && e._summonT <= 0 && (e._summons || 0) < 2) {
      e._summonT = BOSS_SUMMON_CD;
      e._summons = (e._summons || 0) + 1;
      summonGrunts(G, e);
    }
  }

  function summonGrunts(G, e) {
    const slots = Math.min(2, Math.max(0, MAX_FIELD_ENEMIES - aliveEnemyCount(G)));
    for (let i = 0; i < slots; i++) {
      const spot = findSpotNear(G, e.x + e.w / 2, e.y + e.h / 2, 46, 170, 6);
      if (!spot) continue;
      const g = spawn(G, 'grunt', spot.x, spot.y);
      if (g) g.summoned = true;   // 召唤物不计入剩余敌人
    }
  }

  function updateBoss(G, e, dt) {
    e._decisionT -= dt;
    if (e._decisionT <= 0) {
      bossPickDir(G, e);
      e._decisionT = 2.4 + rand() * 1.6;
    }
    moveEnemy(e, dt);

    const phase2 = e.hp <= e.maxHp * 0.5;
    if (phase2 && e._summonT > 0) e._summonT -= dt;

    if (e.fireCd <= 0) {
      bossPattern(G, e);
      e.fireCd = EnemyTypes.boss.fireMin +
        rand() * (EnemyTypes.boss.fireMax - EnemyTypes.boss.fireMin);
    }
  }

  /* ---------------- 出生点 ---------------- */

  function isSpotFree(G, x, y, pad) {
    if (!tankFits(x, y)) return false;
    const p = G && G.player;
    if (p && p.alive !== false) {
      if (WV.aabb(x - pad, y - pad, ENEMY_W + pad * 2, ENEMY_H + pad * 2,
        p.x, p.y, p.w || ENEMY_W, p.h || ENEMY_H)) return false;
    }
    const list = (G && G.enemies) || [];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o || o.hp <= 0 || o.dead) continue;
      if (WV.aabb(x - pad, y - pad, ENEMY_W + pad * 2, ENEMY_H + pad * 2,
        o.x, o.y, o.w, o.h)) return false;
    }
    return true;
  }

  // 在 (cx,cy) 附近找一个不撞墙、不压坦克的点
  function findSpotNear(G, cx, cy, minR, maxR, pad) {
    for (let i = 0; i < 32; i++) {
      const a = rand() * Math.PI * 2;
      const r = minR + rand() * Math.max(1, maxR - minR);
      const x = clampX(cx + Math.cos(a) * r - ENEMY_W / 2);
      const y = clampY(cy + Math.sin(a) * r - ENEMY_H / 2);
      if (isSpotFree(G, x, y, pad)) return { x: x, y: y };
    }
    // 环形兜底：按 40px 网格试探，保证墙边也有落点
    const offs = [0, 40, -40, 80, -80, 120, -120, 160, -160];
    for (let oy = 0; oy < offs.length; oy++) {
      for (let ox = 0; ox < offs.length; ox++) {
        const x = clampX(cx + offs[ox] - ENEMY_W / 2);
        const y = clampY(cy + offs[oy] - ENEMY_H / 2);
        if (isSpotFree(G, x, y, pad)) return { x: x, y: y };
      }
    }
    return null;
  }

  function findAnyFreeSpot(G, pad) {
    for (let y = 0; y + ENEMY_H <= mapH(); y += 10) {
      for (let x = 0; x + ENEMY_W <= mapW(); x += 10) {
        if (isSpotFree(G, x, y, pad)) return { x: x, y: y };
      }
    }
    return null;
  }

  const DEFAULT_SPAWNERS = [
    { x: 3, y: 3 },
    { x: 283, y: 3 },
    { x: 523, y: 3 }
  ];

  function pickSpawn(G) {
    const spawners = (G && Array.isArray(G.spawners) && G.spawners.length)
      ? G.spawners : DEFAULT_SPAWNERS;
    const order = spawners.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }

    for (let i = 0; i < order.length; i++) {
      const s = order[i] || {};
      const x = clampX(num(s.x, 0));
      const y = clampY(num(s.y, 0));
      if (isSpotFree(G, x, y, 4)) return { x: x, y: y };
      const near = findSpotNear(G, x + ENEMY_W / 2, y + ENEMY_H / 2, 12, 150, 4);
      if (near) return near;
    }

    // 三个出生点附近都挤满时，全图找一个空位；实在没有才退回原点
    const any = findAnyFreeSpot(G, 4);
    if (any) return any;
    const s = spawners[0] || { x: 0, y: 0 };
    return { x: clampX(num(s.x, 0)), y: clampY(num(s.y, 0)) };
  }

  /* ---------------- 创建 / 更新 / 受击 ---------------- */

  function spawn(G, kind, px, py) {
    if (!G) return null;
    if (!Array.isArray(G.enemies)) G.enemies = [];
    const k = EnemyTypes[kind] ? kind : 'grunt';
    const t = EnemyTypes[k];
    const x = clampX(num(px, 0));
    const y = clampY(num(py, 0));
    const e = {
      kind: k,
      x: x,
      y: y,
      w: ENEMY_W,
      h: ENEMY_H,
      dir: 2,
      speed: t.speed,
      hp: t.hp,
      maxHp: t.hp,
      fireCd: 0.4 + rand() * 0.8,
      flash: 0,
      isBoss: k === 'boss',
      score: t.score,
      radius: t.radius,
      power: (k === 'heavy' || k === 'boss') ? 2 : 1,
      dead: false,
      _decisionT: 0.3 + rand() * 0.7,
      _summonT: BOSS_SUMMON_CD
    };

    if (e.isBoss) {
      e.fireCd = 0.7 + rand() * 0.5;
      e._decisionT = 1.6 + rand() * 1.2;
      bossPickDir(G, e);
    } else {
      const target = dinnerCenter(G);
      e.dir = dirToward(e, target.x, target.y);
      if (!canWalk(e, e.dir, 8)) {
        const d = pickFreeDir(e, 8, e.dir);
        if (d !== -1) e.dir = d;
      }
    }

    G.enemies.push(e);
    if (e.isBoss) {
      G.boss = e;
      G.bossMaxHp = t.hp;
      G.bossHp = t.hp;
    }
    return e;
  }

  function update(G, dt) {
    if (!G || !Array.isArray(G.enemies)) return;
    const step = (typeof dt === 'number' && isFinite(dt) && dt > 0)
      ? Math.min(dt, 0.1) : 0;
    if (!(step > 0)) return;

    // 快照遍历：BOSS 召唤会向 G.enemies push 新敌人，本帧不重复驱动它们
    const list = G.enemies.slice();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.hp <= 0 || e.dead) continue;

      if (e.flash > 0) e.flash = Math.max(0, e.flash - step);
      if (e.fireCd > 0) e.fireCd = Math.max(0, e.fireCd - step);

      if (e.isBoss) {
        updateBoss(G, e, step);
        continue;
      }

      e._decisionT -= step;
      if (e._decisionT <= 0) {
        decideMovement(G, e);
        e._decisionT = DECIDE_MIN + rand() * (DECIDE_MAX - DECIDE_MIN);
      }
      moveEnemy(e, step);

      // 卡住保护：连续 1.5s 没挪动就换到附近空地，避免堵死在钢墙缝里
      if (e._stuckX === undefined) { e._stuckX = e.x; e._stuckY = e.y; e._stuckT = 0; }
      e._stuckT += step;
      if (e._stuckT >= 1.5) {
        if (Math.abs(e.x - e._stuckX) + Math.abs(e.y - e._stuckY) < 2) {
          const ox = e.x, oy = e.y;
          e.x = -999; e.y = -999;   // 找空位时先把自己挪开，免得 isSpotFree 避开自己
          const spot = findSpotNear(G, ox + ENEMY_W / 2, oy + ENEMY_H / 2, 24, 220, 5);
          e.x = ox; e.y = oy;
          if (spot) {
            e.x = spot.x;
            e.y = spot.y;
            e.dir = (e.dir + 1 + Math.floor(rand() * 3)) % 4;
            e._decisionT = 0;
          }
        }
        e._stuckX = e.x; e._stuckY = e.y; e._stuckT = 0;
      }

      if (e.fireCd <= 0) tryFire(G, e);
    }

    // 同步 BOSS 血量（game.js 也读 G.bossHp 画血条）
    if (G.boss) G.bossHp = Math.max(0, G.boss.hp);
  }

  function damage(G, e, dmg) {
    if (!e || e.hp <= 0 || e.dead) return false;
    const amount = (typeof dmg === 'number' && isFinite(dmg) && dmg > 0) ? dmg : 1;
    e.hp -= amount;
    e.flash = FLASH_SEC;
    if (e.isBoss && G) G.bossHp = Math.max(0, e.hp);
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      if (e.isBoss && G) G.bossHp = 0;
      return true;
    }
    return false;
  }

  WV.Enemies = {
    spawn: spawn,
    update: update,
    damage: damage,
    pickSpawn: pickSpawn,
    bossPattern: bossPattern
  };

})(typeof window !== 'undefined' ? window : globalThis);
