// core.js — 常量 / 工具 / 地形碰撞 / 贴图 / 地形渲染
(function (root) {
  'use strict';
  const WV = root.WV = root.WV || {};

  // ---------- 尺寸 ----------
  WV.TILE = 40;
  WV.COLS = 15;
  WV.ROWS = 15;
  WV.MAP_W = WV.TILE * WV.COLS;   // 600
  WV.MAP_H = WV.TILE * WV.ROWS;   // 600
  WV.HUD_W = 200;
  WV.W = WV.MAP_W + WV.HUD_W;     // 800
  WV.H = WV.MAP_H;                // 600

  // ---------- 地形 ----------
  WV.EMPTY = 0;
  WV.BRICK = 1;
  WV.STEEL = 2;
  WV.DINNER = 3;
  WV.WATER = 4;

  // 0 上 / 1 右 / 2 下 / 3 左
  WV.DX = [0, 1, 0, -1];
  WV.DY = [-1, 0, 1, 0];

  WV.rand = Math.random;
  WV.grid = null;              // game.js 每关同步
  WV.input = { dir: -1, fire: false, firePressed: false };

  // ---------- 工具 ----------
  WV.clamp = function (v, min, max) { return v < min ? min : v > max ? max : v; };

  WV.aabb = function (ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  };

  WV.tileAt = function (px, py) {
    if (!WV.grid) return -1;
    const c = Math.floor(px / WV.TILE), r = Math.floor(py / WV.TILE);
    if (c < 0 || r < 0 || c >= WV.COLS || r >= WV.ROWS) return -1;
    return WV.grid[r][c];
  };

  // 坦克能不能站在这个矩形：砖/钢/老巢/水/出界都挡
  WV.blockedForTank = function (x, y, w, h) {
    const c0 = Math.floor(x / WV.TILE), c1 = Math.floor((x + w - 1) / WV.TILE);
    const r0 = Math.floor(y / WV.TILE), r1 = Math.floor((y + h - 1) / WV.TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || r < 0 || c >= WV.COLS || r >= WV.ROWS) return true;
        const t = WV.grid[r][c];
        if (t !== WV.EMPTY) return true;
      }
    }
    return false;
  };

  // 子弹打在地形上：砖 power>=1 破，钢 power>=2 破
  WV.damageTileAt = function (px, py, power) {
    if (!WV.grid) return { type: -1, destroyed: false };
    const c = Math.floor(px / WV.TILE), r = Math.floor(py / WV.TILE);
    if (c < 0 || r < 0 || c >= WV.COLS || r >= WV.ROWS) return { type: -1, destroyed: false };
    const t = WV.grid[r][c];
    if (t === WV.BRICK && power >= 1) { WV.grid[r][c] = WV.EMPTY; return { type: t, destroyed: true }; }
    if (t === WV.STEEL && power >= 2) { WV.grid[r][c] = WV.EMPTY; return { type: t, destroyed: true }; }
    return { type: t, destroyed: false };
  };

  // ---------- 角色贴图 ----------
  const SPRITE_S = 36, SPRITE_PX = 2;   // 比碰撞盒(34)略大一点，但不再 40px 叠脸
  WV.SPRITE_FILES = {
    player: ['whale-girl-up.png', 'whale-girl-side-r.png', 'whale-girl.png', 'whale-girl-side.png'],
    claude: ['claude-buddy-up.png', 'claude-buddy-side.png', 'claude-buddy.png', 'claude-buddy-side-l.png'],
  };
  WV.assets = { player: [], claude: [] };
  const fallbackSprites = {};

  function pixelTank(kind) {
    const c = document.createElement('canvas');
    c.width = 34; c.height = 34;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const rect = (x, y, w, h, color) => {
      g.fillStyle = color;
      g.fillRect(x * SPRITE_PX, y * SPRITE_PX, w * SPRITE_PX, h * SPRITE_PX);
    };
    const C = kind === 'player'
      ? { track: '#1b3f5c', trackDark: '#0e2438', body: '#2f8fd8', bodyDark: '#1b5f9e', belly: '#d9f1ff', barrel: '#e9f8ff', turret: '#9fd8ff', eye: '#08283f' }
      : { track: '#7a3b1f', trackDark: '#4d2412', body: '#d97742', bodyDark: '#a5522a', belly: '#f7ddc2', barrel: '#f2b78e', turret: '#f7ddc2', eye: '#7a2f12' };

    rect(2, 3, 3, 11, C.track);
    rect(12, 3, 3, 11, C.track);
    for (let y = 3; y < 14; y += 2) {
      rect(2, y, 3, 1, C.trackDark);
      rect(12, y, 3, 1, C.trackDark);
    }
    rect(5, 3, 7, 11, C.body);
    rect(5, 3, 7, 1, C.bodyDark);
    rect(8, 0, 1, 4, C.barrel);
    rect(8, 0, 1, 1, '#ffffff');
    rect(7, 6, 3, 4, C.turret);
    if (kind === 'player') {
      rect(7, 7, 1, 1, C.eye);
      rect(9, 7, 1, 1, C.eye);
      rect(6, 14, 2, 2, C.bodyDark);
      rect(9, 14, 2, 2, C.bodyDark);
      rect(7, 15, 3, 1, C.belly);
    } else {
      rect(8, 7, 1, 3, '#c2572a');
      rect(7, 8, 3, 1, '#c2572a');
    }
    return c;
  }

  // 预渲染成 40×40 离屏 canvas；Node 下不执行
  WV.loadSprites = function () {
    if (typeof document === 'undefined') return;
    for (const kind in WV.SPRITE_FILES) {
      fallbackSprites[kind] = pixelTank(kind);
      WV.assets[kind] = [];
      WV.SPRITE_FILES[kind].forEach((file, dir) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = SPRITE_S; c.height = SPRITE_S;
          const g = c.getContext('2d');
          g.imageSmoothingEnabled = true;
          g.drawImage(img, 0, 0, SPRITE_S, SPRITE_S);
          WV.assets[kind][dir] = c;
        };
        img.onerror = () => { /* 用后备像素图 */ };
        img.src = file;
      });
    }
  };

  WV.drawCharacter = function (kind, cx, cy, dir, alpha, ctx) {
    const c = ctx || (typeof document !== 'undefined' ? root.document.getElementById('c').getContext('2d') : null);
    if (!c) return;
    const img = (WV.assets[kind] && WV.assets[kind][dir]) || fallbackSprites[kind] || (WV.assets[kind] && WV.assets[kind][2]);
    if (!img) return;
    c.save();
    if (alpha !== undefined && alpha < 1) c.globalAlpha = alpha;
    c.drawImage(img, Math.round(cx - SPRITE_S / 2), Math.round(cy - SPRITE_S / 2), SPRITE_S, SPRITE_S);
    c.restore();
  };

  // 主题色兜底：关卡只给部分字段也能画
  WV.applyTheme = function (theme) {
    const t = theme || {};
    const bg = t.bg || '#0a1a26';
    return {
      bg0: t.bg0 || bg,
      bg1: t.bg1 || '#050d15',
      brick: t.brick || '#c97b4a',
      brickDark: t.brickDark || '#8a4f2c',
      steel: t.steel || '#9fb3c8',
      steelDark: t.steelDark || '#5d7186',
      water: t.water || '#1e5f8a',
      waterHi: t.waterHi || '#4da3d1',
      accent: t.accent || '#7fd6ff',
      accent2: t.accent2 || '#ffd166',
    };
  };

  // ---------- 地形渲染 ----------
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  WV.roundRect = roundRect;

  function drawBrick(ctx, x, y, th) {
    ctx.fillStyle = th.brickDark;
    ctx.fillRect(x, y, WV.TILE, WV.TILE);
    ctx.fillStyle = th.brick;
    const bw = 19, bh = 9;
    for (let row = 0; row < 4; row++) {
      const off = (row % 2) * 10;
      for (let col = -1; col < 2; col++) {
        ctx.fillRect(x + col * 20 + off + 1, y + row * 10 + 1, bw - 2, bh - 2);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(x, y, WV.TILE, 1);
  }

  function drawSteel(ctx, x, y, th) {
    ctx.fillStyle = th.steel;
    ctx.fillRect(x, y, WV.TILE, WV.TILE);
    ctx.fillStyle = th.steelDark;
    ctx.fillRect(x + 2, y + 2, WV.TILE - 4, WV.TILE - 4);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(x + 2, y + 2, WV.TILE - 4, 2);
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    const r = 2;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.beginPath();
        ctx.arc(x + 9 + i * 22, y + 9 + j * 22, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawWater(ctx, x, y, th, time) {
    ctx.fillStyle = th.water;
    ctx.fillRect(x, y, WV.TILE, WV.TILE);
    ctx.strokeStyle = th.waterHi;
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const yy = y + 12 + i * 16 + Math.sin(time * 2 + (x + y) * 0.02 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, yy);
      ctx.quadraticCurveTo(x + 20, yy + 4, x + 36, yy);
      ctx.stroke();
    }
  }

  function drawDinnerTile(ctx, x, y, th) {
    // 单独一格的大白饭块，四格拼成 2×2 老巢
    ctx.fillStyle = '#e8f4ff';
    roundRect(ctx, x + 1, y + 1, WV.TILE - 2, WV.TILE - 2, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + WV.TILE / 2, y + WV.TILE / 2 - 2, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.06)';
    ctx.beginPath();
    ctx.arc(x + WV.TILE / 2, y + WV.TILE / 2 + 2, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 整张地图：背景 + 地形 + 老巢蒸汽
  WV.drawTiles = function (G, ctx, time) {
    const th = G.theme;
    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, WV.MAP_H);
    bg.addColorStop(0, th.bg0);
    bg.addColorStop(1, th.bg1);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WV.MAP_W, WV.MAP_H);

    // 细网格（很淡）
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= WV.COLS; i++) {
      ctx.beginPath(); ctx.moveTo(i * WV.TILE, 0); ctx.lineTo(i * WV.TILE, WV.MAP_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * WV.TILE); ctx.lineTo(WV.MAP_W, i * WV.TILE); ctx.stroke();
    }

    for (let r = 0; r < WV.ROWS; r++) {
      for (let c = 0; c < WV.COLS; c++) {
        const t = G.grid[r][c];
        const x = c * WV.TILE, y = r * WV.TILE;
        if (t === WV.BRICK) drawBrick(ctx, x, y, th);
        else if (t === WV.STEEL) drawSteel(ctx, x, y, th);
        else if (t === WV.WATER) drawWater(ctx, x, y, th, time);
        else if (t === WV.DINNER) drawDinnerTile(ctx, x, y, th);
      }
    }

    // 老巢蒸汽：从 2×2 中心往上
    if (G.dinner) {
      const cx = G.dinner.x + G.dinner.w / 2;
      const cy = G.dinner.y + G.dinner.h / 2;
      ctx.save();
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 3; i++) {
        const p = (time * 0.55 + i / 3) % 1;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx + Math.sin((time + i) * 2) * 4, cy - 26 - p * 34, 5 + p * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // 老巢轮廓
      ctx.strokeStyle = th.accent;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      roundRect(ctx, G.dinner.x - 2, G.dinner.y - 2, G.dinner.w + 4, G.dinner.h + 4, 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };

  // 饭团子弹（旋转指向飞行方向）
  WV.drawRiceBall = function (ctx, b, color) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.dy, b.dx) + Math.PI / 2);   // 尖端朝飞行方向（形状默认朝上）
    ctx.fillStyle = color || '#fffdf5';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(7, 2, 5, 7);
    ctx.lineTo(-5, 7);
    ctx.quadraticCurveTo(-7, 2, 0, -7);
    ctx.fill();
    ctx.fillStyle = '#22303a';
    ctx.fillRect(-4, 2, 8, 4);
    ctx.restore();
  };

})(typeof window !== 'undefined' ? window : globalThis);
