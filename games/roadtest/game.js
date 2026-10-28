// 路网原型：手绘图落成的格子地图，用来试「6 格宽的路 + 岔口」走起来什么感觉
// 零依赖、零构建；双击 index.html 就能走。
// 地图数据在 map.js（由 tools/map-net.mjs --js 生成，别手改）。

const CELL = 44;              // 一格 44 逻辑像素
const VIEW_W = 720, VIEW_H = 1280;
const SPEED = 250;            // 玩家速度 px/s（≈5.7 格/秒）
const PLAYER_R = 17;
const MON_R = 14;

// ---------- 纯逻辑（不碰 DOM，测试会用） ----------
const RT = {};
RT.CELL = CELL;
RT.VIEW_W = VIEW_W;
RT.VIEW_H = VIEW_H;

RT.at = (cx, cy) => {
  const M = globalThis.MAP;
  if (!M || cx < 0 || cy < 0 || cx >= M.w || cy >= M.h) return '#';
  return M.rows[cy][cx];
};

RT.blocked = (x, y) => RT.at(Math.floor(x / CELL), Math.floor(y / CELL)) === '#';

// 圆能不能站在这儿：中心 + 八个方向采样
RT.canStand = (x, y, r) => {
  const d = r * 0.72;
  const pts = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [d, d], [d, -d], [-d, d], [-d, -d]];
  for (const [ox, oy] of pts) if (RT.blocked(x + ox, y + oy)) return false;
  return true;
};

// 分轴推进，撞墙就停在那条轴上（斜着蹭墙能滑过去）
RT.tryMove = (p, dx, dy, r) => {
  let moved = 0;
  if (dx && RT.canStand(p.x + dx, p.y, r)) { p.x += dx; moved += Math.abs(dx); }
  if (dy && RT.canStand(p.x, p.y + dy, r)) { p.y += dy; moved += Math.abs(dy); }
  return moved;
};

RT.spawn = () => {
  const M = globalThis.MAP;
  const [cx, cy] = M.spawn;
  return { x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL, r: PLAYER_R };
};

// 在离入口够远的路面上撒怪
RT.makeMonsters = (n, seed = 1) => {
  const M = globalThis.MAP;
  const roads = [];
  for (let y = 0; y < M.h; y++)
    for (let x = 0; x < M.w; x++)
      if (M.rows[y][x] !== '#') roads.push([x, y]);
  const s = RT.spawn();
  let rnd = seed;
  const next = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 4000) {
    const c = roads[Math.floor(next() * roads.length)];
    const x = (c[0] + 0.5) * CELL, y = (c[1] + 0.5) * CELL;
    if (Math.hypot(x - s.x, y - s.y) < CELL * 10) continue;
    out.push({ x, y, r: MON_R, dir: next() * Math.PI * 2, turn: 0.6 + next() * 1.6, spd: 52 + next() * 26 });
  }
  return out;
};

if (typeof globalThis !== 'undefined') globalThis.RT = RT;

// ---------- 下面是画面和输入 ----------
function boot() {
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = VIEW_W * dpr;
  cv.height = VIEW_H * dpr;
  ctx.scale(dpr, dpr);

  const M = globalThis.MAP;
  if (!M) { ctx.fillStyle = '#fff'; ctx.fillText('map.js 没加载', 40, 40); return; }
  const WORLD_W = M.w * CELL, WORLD_H = M.h * CELL;

  const G = {
    p: RT.spawn(),
    mon: RT.makeMonsters(16, 7),
    cam: { x: 0, y: 0 },
    hp: 100,
    hurtAt: -9,
    steps: 0,
    walked: 0,
    deaths: 0,
    showMap: false,
    joy: { on: false, id: -1, sx: 0, sy: 0, x: 0, y: 0 },
    keys: Object.create(null),
    t: 0,
  };
  // ?at=cx,cy 换出生点；?map=1 直接开全图（调试/截图用）
  const qs = new URLSearchParams(location.search);
  if (qs.get('at')) {
    const [ax, ay] = qs.get('at').split(',').map(Number);
    if (RT.at(ax, ay) !== '#') { G.p.x = (ax + 0.5) * CELL; G.p.y = (ay + 0.5) * CELL; }
  }
  if (qs.get('map') === '1') G.showMap = true;
  G.cam.x = G.p.x - VIEW_W / 2;
  G.cam.y = G.p.y - VIEW_H / 2;

  // ---- 输入：键盘 ----
  addEventListener('keydown', e => {
    G.keys[e.key.toLowerCase()] = true;
    if (e.key === 'm' || e.key === 'M') G.showMap = !G.showMap;
    if (e.key === 'r' || e.key === 'R') { G.p = RT.spawn(); G.hp = 100; }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  });
  addEventListener('keyup', e => { G.keys[e.key.toLowerCase()] = false; });

  // ---- 输入：触摸 / 鼠标（只认第一根手指，按住拖动 = 摇杆）----
  const rect = () => cv.getBoundingClientRect();
  const toLocal = (e) => {
    const r = rect();
    return { x: (e.clientX - r.left) / r.width * VIEW_W, y: (e.clientY - r.top) / r.height * VIEW_H };
  };
  cv.addEventListener('pointerdown', e => {
    if (G.joy.on) return;                 // 只认第一根
    const p = toLocal(e);
    G.joy = { on: true, id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y };
    cv.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (!G.joy.on || e.pointerId !== G.joy.id) return;
    const p = toLocal(e);
    G.joy.x = p.x; G.joy.y = p.y;
    e.preventDefault();
  });
  const endPointer = e => {
    if (e.pointerId === G.joy.id) G.joy = { on: false, id: -1, sx: 0, sy: 0, x: 0, y: 0 };
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('lostpointercapture', endPointer);
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // ---- 每帧 ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.t += dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function moveVec() {
    let dx = 0, dy = 0;
    if (G.keys['a'] || G.keys['arrowleft']) dx -= 1;
    if (G.keys['d'] || G.keys['arrowright']) dx += 1;
    if (G.keys['w'] || G.keys['arrowup']) dy -= 1;
    if (G.keys['s'] || G.keys['arrowdown']) dy += 1;
    if (dx || dy) {
      const L = Math.hypot(dx, dy);
      return [dx / L, dy / L];
    }
    if (G.joy.on) {
      const jx = G.joy.x - G.joy.sx, jy = G.joy.y - G.joy.sy;
      const L = Math.hypot(jx, jy);
      if (L > 12) { const k = Math.min(1, L / 70); return [jx / L * k, jy / L * k]; }
    }
    return [0, 0];
  }

  function update(dt) {
    const [vx, vy] = moveVec();
    if (vx || vy) {
      const moved = RT.tryMove(G.p, vx * SPEED * dt, vy * SPEED * dt, PLAYER_R);
      G.walked += moved;
      G.steps = Math.floor(G.walked / CELL);
    }
    // 怪：顺着路瞎逛，撞墙就换方向
    for (const m of G.mon) {
      m.turn -= dt;
      if (m.turn <= 0) { m.dir += (Math.random() - 0.5) * 2.2; m.turn = 0.7 + Math.random() * 1.8; }
      const nx = Math.cos(m.dir) * m.spd * dt, ny = Math.sin(m.dir) * m.spd * dt;
      let hit = false;
      if (RT.canStand(m.x + nx, m.y, MON_R)) m.x += nx; else hit = true;
      if (RT.canStand(m.x, m.y + ny, MON_R)) m.y += ny; else hit = true;
      if (hit) { m.dir += Math.PI * (0.6 + Math.random() * 0.8); m.turn = 0.5 + Math.random(); }

      // 碰到玩家：掉血 + 弹开
      const d = Math.hypot(m.x - G.p.x, m.y - G.p.y);
      if (d < MON_R + PLAYER_R && G.t - G.hurtAt > 0.8) {
        G.hurtAt = G.t;
        G.hp -= 14;
        const ux = (G.p.x - m.x) / (d || 1), uy = (G.p.y - m.y) / (d || 1);
        RT.tryMove(G.p, ux * 26, uy * 26, PLAYER_R);
        if (G.hp <= 0) {
          G.hp = 100; G.deaths++; G.p = RT.spawn(); G.walked = 0; G.steps = 0;
        }
      }
    }
    if (G.t - G.hurtAt > 2.5 && G.hp < 100) G.hp = Math.min(100, G.hp + 3 * dt);

    // 相机跟手（留一点软）
    const tx = G.p.x - VIEW_W / 2, ty = G.p.y - VIEW_H / 2;
    G.cam.x += (tx - G.cam.x) * Math.min(1, dt * 9);
    G.cam.y += (ty - G.cam.y) * Math.min(1, dt * 9);
    G.cam.x = Math.max(0, Math.min(WORLD_W - VIEW_W, G.cam.x));
    G.cam.y = Math.max(0, Math.min(WORLD_H - VIEW_H, G.cam.y));
  }

  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  };

  // 整张地图先画进一张 8px/格 的小图，再放大贴到屏幕上。
  // 台阶边长只有 5~6px，插值一糊就看不出格子了。
  const S = 8;
  const mapLayer = (() => {
    const c = document.createElement('canvas');
    c.width = M.w * S; c.height = M.h * S;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0f16';
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < M.h; y++) {
      for (let x = 0; x < M.w; x++) {
        const n = hash(x, y);
        if (M.rows[y][x] === '#') {
          // 山体：深蓝黑，带一点块状纹理，别和地图外面的虚空一个颜色
          g.fillStyle = n > 0.66 ? '#111a26' : n > 0.33 ? '#0f1722' : '#0d141d';
        } else {
          g.fillStyle = n > 0.72 ? '#7d6c52' : n > 0.36 ? '#76654c' : '#6f5e46';
        }
        g.fillRect(x * S, y * S, S, S);
      }
    }
    return c;
  })();

  function render() {
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mapLayer, -G.cam.x, -G.cam.y, M.w * CELL, M.h * CELL);

    // 怪
    for (const m of G.mon) {
      const x = m.x - G.cam.x, y = m.y - G.cam.y;
      if (x < -40 || y < -40 || x > VIEW_W + 40 || y > VIEW_H + 40) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + 12, MON_R * 1.1, MON_R * 0.45, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#8f6bd8';
      ctx.beginPath(); ctx.arc(x, y, MON_R, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 4.5, y - 3, 2.6, 0, 7); ctx.arc(x + 4.5, y - 3, 2.6, 0, 7); ctx.fill();
    }

    // 玩家
    const px = G.p.x - G.cam.x, py = G.p.y - G.cam.y;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(px, py + 14, PLAYER_R * 1.15, PLAYER_R * 0.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f3ecd8';
    ctx.beginPath(); ctx.arc(px, py, PLAYER_R, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#2a2118';
    ctx.beginPath(); ctx.arc(px - 5.5, py - 3, 2.6, 0, 7); ctx.arc(px + 5.5, py - 3, 2.6, 0, 7); ctx.fill();

    drawHud(px, py);
    if (G.showMap) drawMinimap();
  }

  function drawHud(px, py) {
    // 摇杆
    if (G.joy.on) {
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(G.joy.sx, G.joy.sy, 62, 0, 7); ctx.stroke();
      const dx = G.joy.x - G.joy.sx, dy = G.joy.y - G.joy.sy;
      const L = Math.hypot(dx, dy) || 1, k = Math.min(62, L) / L;
      ctx.fillStyle = 'rgba(255,220,150,0.55)';
      ctx.beginPath(); ctx.arc(G.joy.sx + dx * k, G.joy.sy + dy * k, 26, 0, 7); ctx.fill();
    }

    // 血条
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(20, 20, 260, 30);
    ctx.fillStyle = G.hp > 40 ? '#5fd18a' : '#e2604f';
    ctx.fillRect(22, 22, 256 * Math.max(0, G.hp) / 100, 26);

    ctx.font = '600 20px system-ui, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#eef2fa';
    ctx.textAlign = 'left';
    ctx.fillText(`走得 ${G.steps} 格`, 20, 82);
    ctx.fillText(`死 ${G.deaths} 次`, 20, 110);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(238,242,250,0.75)';
    ctx.fillText(`路宽 6 格`, VIEW_W - 20, 42);
    ctx.fillText(`格 ${Math.floor(G.p.x / CELL)},${Math.floor(G.p.y / CELL)}`, VIEW_W - 20, 70);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(238,242,250,0.55)';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText('按住屏幕拖动 = 摇杆 · WASD / 方向键 · M 看全图 · R 回入口', VIEW_W / 2, VIEW_H - 24);
  }

  function drawMinimap() {
    const s = Math.min((VIEW_W - 40) / M.w, (VIEW_H - 160) / M.h);
    const ox = (VIEW_W - M.w * s) / 2, oy = (VIEW_H - M.h * s) / 2;
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let y = 0; y < M.h; y++)
      for (let x = 0; x < M.w; x++)
        if (M.rows[y][x] !== '#') {
          ctx.fillStyle = '#7a6950';
          ctx.fillRect(ox + x * s, oy + y * s, s + 0.6, s + 0.6);
        }
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, M.w * s, M.h * s);
    ctx.fillStyle = '#f3ecd8';
    ctx.beginPath(); ctx.arc(ox + G.p.x / CELL * s, oy + G.p.y / CELL * s, Math.max(4, s), 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(238,242,250,0.8)';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('全图 · 再按 M 回去', VIEW_W / 2, VIEW_H - 60);
  }

  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') boot();
