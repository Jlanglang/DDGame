/**
 * 鲸鱼娘大战 Claude v2 — 玩家模块（SPEC 5.3）
 *
 * 只通过 WV.* 调用 core.js 提供的常量/碰撞/音效，不引用其它模块文件。
 * 浏览器全局 IIFE；不访问 DOM 的路径在 Node 里可直接加载。
 * 触控：左下虚拟方向盘 + 右下开火圆钮，Pointer Events + setPointerCapture，只认第一根手指。
 */
(function (root) {
  'use strict';

  const WV = root.WV = root.WV || {};

  /* ---------------- 兜底常量（core.js 未加载时也不炸） ---------------- */
  const DEF_TILE = 40;
  const DEF_MAP_W = 600;
  const DEF_MAP_H = 600;
  const DEF_W = 800; // 画布逻辑宽（600 游戏区 + 200 HUD）
  const DEF_H = 600;
  const DEF_DX = [0, 1, 0, -1]; // 0上 1右 2下 3左
  const DEF_DY = [-1, 0, 1, 0];

  /* ---------------- 玩家数值（SPEC 5.3） ---------------- */
  const PLAYER_W = 34;
  const PLAYER_H = 34;
  const BASE_SPEED = 150; // px/s
  const BASE_FIRE_RATE = 0.28; // s
  const BASE_LIVES = 5;
  const BASE_BULLET_SPEED = 300;
  const INVULN_TIME = 2.0; // 受击后无敌 2s
  const SHIELD_PER_CARD = 0.8; // 'shield' 每张 +0.8s 无敌
  const MIN_FIRE_RATE = 0.12; // 连射下限
  const MAX_SPEED_MULT = 1.6; // 轻装上限 +60%
  const MAX_BULLET_SPEED = 720;
  const MUZZLE_OFFSET = 18; // 子弹出生点：车头前方 18px
  const DOUBLE_GAP = 6; // 双发并排偏移 ±6px
  const BULLET_LIFE = 2.5; // 子弹存活秒数（game.js 递减；约 700px 射程）
  const MAX_LIVES = 5;

  /* ---------------- 触控区（画布坐标；游戏区 600x600，HUD 在右侧不占） ---------------- */
  const DPAD_SIZE = 132; // 左下 132px 虚拟方向区
  const FIRE_DIAM = 96; // 右下 96px 圆形开火键
  const FIRE_MARGIN = 14;
  const MIN_HIT_SIZE = 44; // 触控目标下限
  const DPAD_DEADZONE = 10;

  /* ---------------- 小工具 ---------------- */
  function tileSize() { return WV.TILE || DEF_TILE; }
  function mapW() { return WV.MAP_W || DEF_MAP_W; }
  function mapH() { return WV.MAP_H || DEF_MAP_H; }
  function dirDX(d) { return (WV.DX || DEF_DX)[d] || 0; }
  function dirDY(d) { return (WV.DY || DEF_DY)[d] || 0; }

  function clamp(v, min, max) {
    if (typeof WV.clamp === 'function') return WV.clamp(v, min, max);
    if (max < min) return min;
    return v < min ? min : (v > max ? max : v);
  }

  /** 玩家 34x34 包围盒是否撞墙；core 缺失时退化为角点采样 tileAt */
  function blocked(x, y, w, h) {
    if (typeof WV.blockedForTank === 'function') return !!WV.blockedForTank(x, y, w, h);
    if (typeof WV.tileAt !== 'function') return false;
    const pts = [
      [x + 1, y + 1], [x + w - 1, y + 1],
      [x + 1, y + h - 1], [x + w - 1, y + h - 1],
    ];
    for (let i = 0; i < pts.length; i++) {
      if (WV.tileAt(pts[i][0], pts[i][1]) !== 0) return true;
    }
    return false;
  }

  function blockedAt(x, y) {
    if (x < 0 || y < 0 || x + PLAYER_W > mapW() || y + PLAYER_H > mapH()) return true;
    return blocked(x, y, PLAYER_W, PLAYER_H);
  }

  /** 容错播音：audio 不存在或抛错都不影响逻辑 */
  function playAudio(name) {
    try {
      if (WV.audio && typeof WV.audio.play === 'function') WV.audio.play(name);
    } catch (e) { /* 静默降级 */ }
  }

  /* ---------------- 玩家对象 ---------------- */

  function create(G) {
    const spawn = spawnPoint(G);
    return {
      x: spawn.x,
      y: spawn.y,
      w: PLAYER_W,
      h: PLAYER_H,
      dir: 0,
      speed: BASE_SPEED,
      baseSpeed: BASE_SPEED,
      cd: 0,
      fireRate: BASE_FIRE_RATE,
      lives: BASE_LIVES,
      invuln: 0,
      isPlayer: true,
      bulletSpeed: BASE_BULLET_SPEED,
      bulletPower: 1,
      pierce: 0,
      shieldTime: 0,
      doubleShot: false,
      doubleLevel: 0,
      alive: true,
      flash: 0,
    };
  }

  /** 出生点：优先 G.playerSpawn（其次是关卡对象），坐标语义按左上角处理并做容错 */
  function spawnPoint(G) {
    const lv = G && (G.levelData || (typeof G.level === 'object' ? G.level : null));
    const sp = (G && G.playerSpawn) || (lv && lv.playerSpawn) || null;
    let x = sp && isFinite(sp.x) ? sp.x : 5 * tileSize();
    let y = sp && isFinite(sp.y) ? sp.y : 13 * tileSize();
    // 兼容关卡把 playerSpawn 写成「坦克左下角」的情况：贴到/超出地图底部时上移一个身高
    if (y > mapH() - PLAYER_H) y -= PLAYER_H;
    x = clamp(x, 0, mapW() - PLAYER_W);
    y = clamp(y, 0, mapH() - PLAYER_H);
    // 出生点若被挡（关卡墙压住），就近找一个空格，避免一开局卡在墙里
    return nearestFree(x, y);
  }

  function nearestFree(x, y) {
    if (!blockedAt(x, y)) return { x: x, y: y };
    const t = tileSize() || DEF_TILE;
    let best = { x: x, y: y };
    let bestD = Infinity;
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const tx = c * t + (t - PLAYER_W) / 2;
        const ty = r * t + (t - PLAYER_H) / 2;
        if (tx < 0 || ty < 0 || tx + PLAYER_W > mapW() || ty + PLAYER_H > mapH()) continue;
        if (blockedAt(tx, ty)) continue;
        const d = (tx - x) * (tx - x) + (ty - y) * (ty - y);
        if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
      }
    }
    return best;
  }

  function resolvePlayer(G) {
    if (!G) return null;
    if (G.player) return G.player;
    if (G.isPlayer) return G;
    if (typeof G.lives === 'number' && typeof G.x === 'number' && typeof G.y === 'number') return G;
    return null;
  }

  function ensurePlayer(G) {
    let p = resolvePlayer(G);
    if (!p && G) { p = create(G); G.player = p; }
    return p;
  }

  /* ---------------- 输入 ---------------- */

  /** 触控状态（键盘/鼠标仍由 game.js 写 WV.input，这里只叠加方向键优先的触控） */
  const touch = {
    dir: -1,
    fire: false,
    moveId: null,
    fireId: null,
    canvas: null,
    enabled: false,
  };

  function readInput() {
    const raw = WV.input || {};
    let dir = (typeof raw.dir === 'number' && raw.dir >= 0 && raw.dir <= 3) ? raw.dir : -1;
    if (touch.dir >= 0 && touch.dir <= 3) dir = touch.dir;
    const fire = !!raw.fire || !!touch.fire;
    return { dir: dir, fire: fire };
  }

  /* ---------------- 移动（逐轴防穿墙 + 单轴滑动 + 子步进防穿透） ---------------- */

  function moveBy(p, mx, my) {
    if (!mx && !my) return false;
    const dist = Math.sqrt(mx * mx + my * my);
    const steps = Math.max(1, Math.ceil(dist / 6));
    const sx = mx / steps;
    const sy = my / steps;
    let moved = false;
    for (let i = 0; i < steps; i++) {
      if (stepOnce(p, sx, sy)) moved = true;
    }
    return moved;
  }

  function stepOnce(p, mx, my) {
    const nx = clamp(p.x + mx, 0, mapW() - PLAYER_W);
    const ny = clamp(p.y + my, 0, mapH() - PLAYER_H);
    // 先整体试
    if ((nx !== p.x || ny !== p.y) && !blockedAt(nx, ny)) {
      p.x = nx;
      p.y = ny;
      return true;
    }
    // 再逐轴滑动
    let moved = false;
    if (mx) {
      const tx = clamp(p.x + mx, 0, mapW() - PLAYER_W);
      if (tx !== p.x && !blockedAt(tx, p.y)) { p.x = tx; moved = true; }
    }
    if (my) {
      const ty = clamp(p.y + my, 0, mapH() - PLAYER_H);
      if (ty !== p.y && !blockedAt(p.x, ty)) { p.y = ty; moved = true; }
    }
    return moved;
  }

  /* ---------------- 开火 ---------------- */

  function doubleOffsets(p) {
    const lv = Math.max(1, p.doubleLevel || 1);
    if (lv === 1) return [-DOUBLE_GAP, DOUBLE_GAP];
    if (lv === 2) return [-DOUBLE_GAP, 0, DOUBLE_GAP];
    return [-DOUBLE_GAP * 2, -DOUBLE_GAP, DOUBLE_GAP, DOUBLE_GAP * 2];
  }

  function shoot(G, p) {
    const list = G.bullets || (G.bullets = []);
    const d = p.dir | 0;
    const ux = dirDX(d);
    const uy = dirDY(d);
    // 车头前方 18px，bullet 的 x/y 为弹丸中心
    const cx = p.x + p.w / 2 + ux * MUZZLE_OFFSET;
    const cy = p.y + p.h / 2 + uy * MUZZLE_OFFSET;
    const offsets = p.doubleShot ? doubleOffsets(p) : [0];
    for (let i = 0; i < offsets.length; i++) {
      const o = offsets[i];
      const vertical = ux === 0; // 上下开火时并排方向是左右
      list.push({
        x: vertical ? cx + o : cx,
        y: vertical ? cy : cy + o,
        dx: ux,
        dy: uy,
        speed: p.bulletSpeed || BASE_BULLET_SPEED,
        owner: 'player',
        dmg: 1,
        power: p.bulletPower || 1,
        pierce: p.pierce || 0,
        life: BULLET_LIFE,
      });
    }
    playAudio('shoot');
  }

  /* ---------------- 每帧更新 ---------------- */

  function update(G, dt) {
    if (!G) return;
    const p = ensurePlayer(G);
    if (!p) return;
    const step = (typeof dt === 'number' && isFinite(dt) && dt > 0) ? Math.min(dt, 0.1) : 0;

    // 计时器递减：开火冷却、无敌（受击后 2s + 护盾加成）、受击闪白
    if (p.cd > 0) p.cd = Math.max(0, p.cd - step);
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - step);
    if (p.flash > 0) p.flash = Math.max(0, p.flash - step);

    if (p.alive === false) return;
    if (step <= 0) return;

    const inp = readInput();
    if (inp.dir >= 0 && inp.dir <= 3) {
      p.dir = inp.dir;
      const spd = Math.max(0, p.speed || 0);
      moveBy(p, dirDX(p.dir) * spd * step, dirDY(p.dir) * spd * step);
    }

    if (inp.fire) {
      if (p.cd <= 0) {
        shoot(G, p);
        p.cd = Math.max(MIN_FIRE_RATE, p.fireRate > 0 ? p.fireRate : BASE_FIRE_RATE);
      }
    }
  }

  /* ---------------- 受击 ---------------- */

  /**
   * 受击：无敌期直接返回 true（活着）。
   * 否则掉命 + 音效 + 无敌 2s(+护盾)，返回是否还活着；lives<=0 返回 false（game.js 判负/重生）。
   */
  function hit(G) {
    const p = resolvePlayer(G);
    if (!p) return false;
    if (p.invuln > 0) return true;
    p.lives = (typeof p.lives === 'number' ? p.lives : 1) - 1;
    p.invuln = INVULN_TIME + (p.shieldTime || 0);
    p.flash = 0.25;
    playAudio('playerHit');
    if (p.lives <= 0) {
      p.lives = 0;
      p.alive = false;
      return false;
    }
    p.alive = true;
    return true;
  }

  /* ---------------- 强化 ---------------- */

  function applyUpgrade(G, id) {
    const p = resolvePlayer(G);
    if (!p) return false;
    switch (id) {
      case 'power': // 子弹速度 +20%，射速 +15%
        p.bulletSpeed = Math.min(MAX_BULLET_SPEED, (p.bulletSpeed || BASE_BULLET_SPEED) * 1.2);
        p.fireRate = Math.max(MIN_FIRE_RATE, (p.fireRate || BASE_FIRE_RATE) * 0.85);
        return true;
      case 'pierce': // 每张多穿透一个敌人
        p.pierce = (p.pierce || 0) + 1;
        return true;
      case 'speed': // 移动 +15%，最多 +60%
        p.speed = Math.min((p.baseSpeed || BASE_SPEED) * MAX_SPEED_MULT, (p.speed || BASE_SPEED) * 1.15);
        return true;
      case 'life': // 生命 +1，上限 5
        p.lives = Math.min(MAX_LIVES, (typeof p.lives === 'number' ? p.lives : BASE_LIVES) + 1);
        return true;
      case 'shield': // 受击后无敌 +0.8s，可叠加
        p.shieldTime = (p.shieldTime || 0) + SHIELD_PER_CARD;
        return true;
      case 'rapid': // 开火间隔 -20%，下限 0.12s
        p.fireRate = Math.max(MIN_FIRE_RATE, (p.fireRate || BASE_FIRE_RATE) * 0.8);
        return true;
      case 'double': // 双发；重复拿升级为 3 发/4 发扇形并排
        p.doubleLevel = (p.doubleLevel || 0) + 1;
        p.doubleShot = true;
        return true;
      case 'bomb': // 子弹威力 +1（可破钢）
        p.bulletPower = Math.min(3, (p.bulletPower || 1) + 1);
        return true;
      default:
        return false;
    }
  }

  /* ---------------- 触控 ---------------- */

  function dpadZone() {
    const h = mapH();
    return {
      x: 0,
      y: h - DPAD_SIZE,
      w: DPAD_SIZE,
      h: DPAD_SIZE,
      cx: DPAD_SIZE / 2,
      cy: h - DPAD_SIZE / 2,
    };
  }

  function fireZone() {
    const w = mapW();
    const h = mapH();
    const r = Math.max(FIRE_DIAM / 2, MIN_HIT_SIZE / 2);
    return { cx: w - (FIRE_DIAM / 2 + FIRE_MARGIN), cy: h - (FIRE_DIAM / 2 + FIRE_MARGIN), r: r };
  }

  function inRect(pos, r) {
    return pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
  }

  function inCircle(pos, c) {
    const dx = pos.x - c.cx;
    const dy = pos.y - c.cy;
    return dx * dx + dy * dy <= c.r * c.r;
  }

  function updateDirFromDpad(pos, z) {
    if (!pos) return;
    const dx = pos.x - z.cx;
    const dy = pos.y - z.cy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < DPAD_DEADZONE) return; // 中心死区：保持原方向
    touch.dir = ax > ay ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
  }

  /** 浏览器坐标 → 画布逻辑坐标（用逻辑 800x600 换算，兼容 CSS 缩放与 DPR 放大） */
  function toCanvas(canvas, ev) {
    if (!ev || typeof ev.clientX !== 'number') return null;
    let rect = null;
    try { rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null; } catch (e) { rect = null; }
    const cw = WV.W || canvas.width || DEF_W;
    const ch = WV.H || canvas.height || DEF_H;
    const rw = (rect && rect.width) || cw;
    const rh = (rect && rect.height) || ch;
    const left = rect ? rect.left : 0;
    const top = rect ? rect.top : 0;
    return { x: (ev.clientX - left) * (cw / rw), y: (ev.clientY - top) * (ch / rh) };
  }

  function capture(canvas, id) {
    if (id === undefined || id === null) return;
    if (typeof canvas.setPointerCapture === 'function') {
      try { canvas.setPointerCapture(id); } catch (e) { /* 指针已失效，忽略 */ }
    }
  }

  function release(canvas, id) {
    if (id === undefined || id === null) return;
    if (typeof canvas.releasePointerCapture === 'function') {
      try {
        if (!canvas.hasPointerCapture || canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      } catch (e) { /* 忽略 */ }
    }
  }

  function resolveCanvas(G) {
    if (G && G.canvas && typeof G.canvas.addEventListener === 'function') return G.canvas;
    if (typeof document === 'undefined') return null;
    try {
      return document.querySelector('canvas') || document.getElementById('game') || null;
    } catch (e) {
      return null;
    }
  }

  function attachTouch(G) {
    if (typeof document === 'undefined') return false;
    const canvas = resolveCanvas(G);
    if (!canvas || typeof canvas.addEventListener !== 'function') return false;
    touch.enabled = true;
    if (touch.canvas === canvas) return true; // 只绑一次
    touch.canvas = canvas;

    const onDown = function (ev) {
      if (ev.pointerType === 'mouse' && typeof ev.button === 'number' && ev.button !== 0) return;
      const pos = toCanvas(canvas, ev);
      if (!pos) return;
      const fz = fireZone();
      if (inCircle(pos, fz)) {
        if (touch.fireId !== null) return; // 只认第一根手指
        touch.fireId = ev.pointerId;
        touch.fire = true;
        capture(canvas, ev.pointerId);
        if (ev.preventDefault) ev.preventDefault();
        return;
      }
      const dz = dpadZone();
      if (inRect(pos, dz)) {
        if (touch.moveId !== null) return; // 只认第一根手指
        touch.moveId = ev.pointerId;
        updateDirFromDpad(pos, dz);
        capture(canvas, ev.pointerId);
        if (ev.preventDefault) ev.preventDefault();
      }
      // 区域外（HUD/卡牌按钮）：不拦，交给 UI
    };

    const onMove = function (ev) {
      if (ev.pointerId === touch.moveId) {
        updateDirFromDpad(toCanvas(canvas, ev), dpadZone());
        if (ev.preventDefault) ev.preventDefault();
      } else if (ev.pointerId === touch.fireId) {
        if (ev.preventDefault) ev.preventDefault();
      }
    };

    const onUp = function (ev) {
      if (ev.pointerId === touch.moveId) {
        touch.moveId = null;
        touch.dir = -1;
        release(canvas, ev.pointerId);
      } else if (ev.pointerId === touch.fireId) {
        touch.fireId = null;
        touch.fire = false;
        release(canvas, ev.pointerId);
      }
    };

    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp, { passive: false });
    canvas.addEventListener('pointercancel', onUp, { passive: false });
    canvas.addEventListener('lostpointercapture', onUp, { passive: true });
    return true;
  }

  /* ---------------- 导出（SPEC 5.3） ---------------- */

  WV.Player = {
    create: create,
    update: update,
    hit: hit,
    applyUpgrade: applyUpgrade,
    attachTouch: attachTouch,
    touch: touch,
    // 便于测试/调试的只读辅助，不影响契约
    spawnPoint: spawnPoint,
    zones: function () { return { dpad: dpadZone(), fire: fireZone() }; },
  };

  WV.UPGRADES = [
    { id: 'power', name: '火力强化', desc: '子弹速度 +20%，射速 +15%', icon: '🔥' },
    { id: 'pierce', name: '穿甲弹', desc: '子弹可击穿一个敌人', icon: '🎯' },
    { id: 'speed', name: '轻装', desc: '移动速度 +15%', icon: '🐟' },
    { id: 'life', name: '加餐', desc: '生命 +1（上限 5）', icon: '🍚' },
    { id: 'shield', name: '护盾', desc: '受击后无敌时间 +0.8s', icon: '🛡' },
    { id: 'rapid', name: '连射', desc: '开火间隔 -20%', icon: '⚡' },
    { id: 'double', name: '双发', desc: '同向并排发射两发饭团', icon: '🍙' },
    { id: 'bomb', name: '重炮弹', desc: '子弹威力 +1，可破钢墙', icon: '💥' },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
