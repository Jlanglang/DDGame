/* 豆豆魔方 · 3D 渲染与交互
   零依赖：用 Canvas 2D 手写一套透视投影，把 27 个小方块按深度画出来。
   - 拖魔方上一块 → 推那一层（按抓取点在轴上的位置决定哪一层）
   - 拖空白处 → 转视角（魔方位置固定在屏幕中间，只转角度）
   - 底部按钮 / 键盘 U D L R F B（Shift 为逆时针）
*/
(function () {
  'use strict';

  const Core = window.CubeCore;
  if (!Core) { console.error('CubeCore 没加载'); return; }

  const FACES = Core.FACES;
  const FACE_UV = Core.FACE_UV;

  /* ---------- 舞台与视角参数 ---------- */

  const W = 720;
  const H = 1600;
  const CX = 360;          // 魔方在逻辑坐标里的中心
  const CY = 700;
  const CAM = 11.5;        // 相机到原点距离
  const FOCAL = 1630;      // 焦距（逻辑像素 / 单位）
  const SIZE = 0.96;       // 单个 cubie 边长（留 0.04 的缝）
  const VIEW_YAW = -0.72;
  const VIEW_PITCH = 0.48;
  const SENS = 0.0056;     // 拖视角灵敏度（弧度 / 逻辑像素）
  const TURN_SEC = 0.2;
  const SCRAMBLE_SEC = 0.09;
  const DRAG_MIN = 10;     // 超过这个距离才判定成"推层"
  const QUARTER = Math.PI / 4;
  const HALF = Math.PI / 2;
  const PER90 = 120;       // 拖动 120 逻辑像素 ≈ 转 90°
  const DRAG_SPEED = 15;   // 拖动时最多每秒转多少弧度（约 860°/s）：甩再快也要转几帧，不会一闪到位
  const SETTLE_SEC = 0.17;
  const VISIBLE_Z = 0.01;  // 视图空间法线 z 的可见门槛（太小会画出细条）
  const LOCKED_DEFAULT = true;  // 锁定 = 层被锁住，拖动就是转层；解锁 = 拖动转视角

  const LIGHT = Core.norm([0.36, 0.82, 0.5]);

  const COLORS = {};
  for (const key of Object.keys(Core.COLOR_HEX)) {
    const hex = Core.COLOR_HEX[key];
    COLORS[key] = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  /* ---------- DOM ---------- */

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const ui = {
    time: document.getElementById('time'),
    moves: document.getElementById('moves'),
    best: document.getElementById('best'),
    hint: document.getElementById('hint'),
    win: document.getElementById('win'),
    winSub: document.getElementById('winSub'),
  };

  const DEBUG = new URLSearchParams(location.search).has('debug');
  const BEST_KEY = 'doudou-cube-best';

  /* ---------- 视角 ---------- */

  let yaw = VIEW_YAW;
  let pitch = VIEW_PITCH;
  let cosY = 1, sinY = 0, cosP = 1, sinP = 0;

  function updateTrig() {
    cosY = Math.cos(yaw);
    sinY = Math.sin(yaw);
    cosP = Math.cos(pitch);
    sinP = Math.sin(pitch);
  }

  function setView(y, p) {
    yaw = y;
    /* ±77°：再往上就翻到背后了，手感会乱 */
    pitch = Math.max(-1.35, Math.min(1.35, p));
    updateTrig();
  }

  /* 世界 → 视图：先绕 Y 转 yaw，再绕 X 转 pitch */
  function toView(v) {
    const x = v[0] * cosY + v[2] * sinY;
    const z0 = -v[0] * sinY + v[2] * cosY;
    const y = v[1] * cosP - z0 * sinP;
    const z = v[1] * sinP + z0 * cosP;
    return [x, y, z];
  }

  /* 世界 → 屏幕逻辑坐标（返回 [x, y, 视图深度]） */
  function project(v) {
    const p = toView(v);
    const d = CAM - p[2];
    const k = FOCAL / (d < 0.6 ? 0.6 : d);
    return [CX + p[0] * k, CY - p[1] * k, p[2]];
  }

  /* 任意角度旋转（只用于转动动画的中间帧） */
  function rotAxis(axis, rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    if (axis === 'x') return [[1, 0, 0], [0, c, -s], [0, s, c]];
    if (axis === 'y') return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }

  /* ---------- 画布尺寸 ---------- */

  let sx = 1;
  let sy = 1;
  /* 缓存画布位置：pointermove 里每帧 getBoundingClientRect 会强制同步布局，
     手机上就是这个让拖动发涩。按下时刷新一次就够。 */
  const rect = { left: 0, top: 0, width: 1, height: 1 };

  function refreshRect() {
    const r = canvas.getBoundingClientRect();
    rect.left = r.left;
    rect.top = r.top;
    rect.width = r.width || 1;
    rect.height = r.height || 1;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    refreshRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    sx = canvas.width / W;
    sy = canvas.height / H;
  }

  /* ---------- 游戏状态 ---------- */

  let cube = Core.createCube();
  let phase = 'ready';      // ready | scramble | play | win
  let elapsed = 0;
  let moves = 0;
  let history = [];
  let queue = [];
  let spin = null;   // { axis, layer, dir, angle, from, to, t, dur, kind }
  let scrambleLeft = 0;
  let playStart = 0;
  let lastNow = 0;
  /* 从当前状态到复原的步骤队列：开头是下一步。打乱时用"打乱逆序"填好，
     玩家每走一步就把对应逆操作压到前面，走对了就消掉——所以提示永远有效。 */
  let solutionStack = [];

  let best = loadBest();
  let lastTimeText = '';
  let lastMovesText = '';
  let lastBestText = '';

  /* 锁定：拖动魔方 = 转层（层锁住了，只能转）
     解锁：拖动 = 转视角（层是自由的，拖动只动镜头） */
  let locked = LOCKED_DEFAULT;
  let lockBtn = null;

  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      if (v && typeof v.t === 'number' && v.t > 0) return { t: v.t, m: v.m | 0 };
    } catch (err) { /* 隐私模式 / 无 localStorage */ }
    return null;
  }

  function saveBest(value) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(value)); } catch (err) { /* 同上 */ }
  }

  function timeText(t) {
    if (t < 60) return t.toFixed(1);
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function setHint(text) {
    if (ui.hint.textContent !== text) ui.hint.textContent = text;
  }

  function refreshHint() {
    if (phase === 'scramble') setHint('打乱中…');
    else if (phase === 'win') setHint('拼回来了');
    else if (phase === 'ready') setHint('点「打乱」开始');
    else if (locked) setHint('拖动魔方转一层 · 解锁后才转视角');
    else setHint('拖动转视角 · 点「锁定」回来拖层');
  }

  function syncLockBtn() {
    if (!lockBtn) return;
    lockBtn.textContent = locked ? '🔒 锁定' : '🔓 解锁';
    lockBtn.classList.toggle('on', locked);
  }

  function setLocked(v) {
    locked = !!v;
    syncLockBtn();
    refreshHint();
  }

  function updateHud(force) {
    const t = timeText(elapsed);
    if (force || t !== lastTimeText) { ui.time.textContent = t; lastTimeText = t; }
    const mv = String(moves);
    if (force || mv !== lastMovesText) { ui.moves.textContent = mv; lastMovesText = mv; }
    const b = best ? timeText(best.t) : '--';
    if (force || b !== lastBestText) { ui.best.textContent = b; lastBestText = b; }
  }

  /* ---------- 转动 ----------
     spin 同时承担三种活：按钮/打乱的固定 90°、拖动时跟手的任意角度、松手后的吸附/回弹。 */

  function startTurn(mv) {
    spin = {
      axis: mv.axis,
      layer: mv.layer,
      dir: mv.dir,
      angle: 0,
      from: 0,
      to: mv.dir * HALF,
      start: performance.now(),
      dur: mv.scramble ? SCRAMBLE_SEC : TURN_SEC,
      kind: mv.scramble ? 'scramble' : 'turn',
      scramble: !!mv.scramble,
      undo: !!mv.undo,
    };
  }

  function finishSpin(s) {
    if (Math.abs(s.to) < 1e-6) return;   // 回弹，不算转
    const dir = s.to > 0 ? 1 : -1;
    const mv = { axis: s.axis, layer: s.layer, dir, scramble: s.scramble, undo: s.undo };
    Core.turn(cube, mv);
    afterTurn(mv);
  }

  function afterTurn(mv) {
    if (mv.scramble) {
      scrambleLeft -= 1;
      if (scrambleLeft <= 0) {
        phase = 'play';
        elapsed = 0;
        playStart = performance.now();
        refreshHint();
      }
      return;
    }
    if (mv.undo) {
      /* 步数在按下撤销时已经减掉了 */
    } else {
      moves += 1;
      history.push({ axis: mv.axis, layer: mv.layer, dir: mv.dir });
    }
    recordSolutionMove(mv);
    refreshHint();
    if (phase === 'play' && Core.isSolved(cube)) winGame();
  }

  /* 玩家走一步：如果正好是提示的第一步就消掉，否则把它的逆压到前面 */
  function recordSolutionMove(mv) {
    const head = solutionStack[0];
    if (head && head.axis === mv.axis && head.layer === mv.layer && head.dir === mv.dir) {
      solutionStack.shift();
    } else {
      solutionStack.unshift({ axis: mv.axis, layer: mv.layer, dir: -mv.dir });
    }
  }

  const MOVE_NAME = { 'y1': 'U', 'y-1': 'D', 'x1': 'R', 'x-1': 'L', 'z1': 'F', 'z-1': 'B' };
  const FACE_CN = { U: '上层', D: '下层', R: '右层', L: '左层', F: '前面', B: '后面' };

  function moveName(mv) {
    const base = MOVE_NAME[mv.axis + mv.layer];
    if (!base) return '';
    return base + (mv.dir === Core.MOVES[base].dir ? '' : "'");
  }

  function moveText(mv) {
    const name = moveName(mv);
    if (!name) return '';
    return name + '（' + FACE_CN[name[0]] + (name.endsWith("'") ? '逆时针' : '顺时针') + '）';
  }

  function showHint() {
    if (phase !== 'play') { setHint('先点「打乱」开始'); return; }
    if (!solutionStack.length) { setHint('已经复原了 · 点「打乱」再来一局'); return; }
    setHint('💡 下一步：' + moveText(solutionStack[0]));
  }

  function enqueueTurn(mv) {
    if (phase !== 'play') return;
    if (spin && spin.kind === 'drag') return;   // 正在跟手拖，不插队
    if (spin && spin.scramble) return;
    queue.push({ axis: mv.axis, layer: mv.layer, dir: mv.dir });
    if (queue.length > 12) queue.splice(0, queue.length - 12);
  }

  function shuffle() {
    spin = null;
    queue = [];
    history = [];
    cube = Core.createCube();
    moves = 0;
    elapsed = 0;
    scrambleLeft = 0;
    phase = 'scramble';
    hideWin();
    const seq = Core.scramble(20);
    scrambleLeft = seq.length;
    /* 打乱逆序就是一条现成的解法，提示从这里出发 */
    solutionStack = seq.slice().reverse().map((m) => ({ axis: m.axis, layer: m.layer, dir: -m.dir }));
    for (const mv of seq) queue.push({ axis: mv.axis, layer: mv.layer, dir: mv.dir, scramble: true });
    refreshHint();
    updateHud(true);
  }

  function undo() {
    if (phase !== 'play' || spin || queue.length || !history.length) return;
    const last = history.pop();
    moves = Math.max(0, moves - 1);
    queue.push({ axis: last.axis, layer: last.layer, dir: -last.dir, undo: true });
  }

  function resetAll() {
    spin = null;
    queue = [];
    history = [];
    solutionStack = [];
    cube = Core.createCube();
    phase = 'ready';
    elapsed = 0;
    moves = 0;
    scrambleLeft = 0;
    hideWin();
    refreshHint();
    updateHud(true);
  }

  function winGame() {
    phase = 'win';
    const t = elapsed;
    let record = false;
    if (!best || t < best.t) {
      best = { t, m: moves };
      saveBest(best);
      record = true;
    }
    ui.winSub.innerHTML = '用时 <b>' + timeText(t) + '</b> 秒 · <b>' + moves + '</b> 步' +
      (record ? '<br>新纪录，尾巴都翘起来了' : '');
    ui.win.hidden = false;
    refreshHint();
    updateHud(true);
  }

  function hideWin() {
    ui.win.hidden = true;
  }

  /* ---------- 绘制 ---------- */

  let hitFaces = [];
  const SHADE_CACHE = new Map();

  /* 三渲二：亮度只取三档，色块平涂，不搞连续明暗 */
  function shadeOf(key, n) {
    const lambert = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    let b = 0.74;
    if (lambert > 0.62) b = 1;
    else if (lambert > 0.22) b = 0.87;
    if (key === 'W') b = Math.max(b, 0.92);
    const cacheKey = key + '|' + b;
    let v = SHADE_CACHE.get(cacheKey);
    if (v) return v;
    const c = COLORS[key];
    const r = Math.min(255, Math.round(c[0] * b));
    const g = Math.min(255, Math.round(c[1] * b));
    const bl = Math.min(255, Math.round(c[2] * b));
    v = 'rgb(' + r + ',' + g + ',' + bl + ')';
    SHADE_CACHE.set(cacheKey, v);
    return v;
  }

  function quadPath(p) {
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    ctx.lineTo(p[1][0], p[1][1]);
    ctx.lineTo(p[2][0], p[2][1]);
    ctx.lineTo(p[3][0], p[3][1]);
    ctx.closePath();
  }

  /* 高光用的竖向渐变，预渲染一次。每帧现场 createLinearGradient 几十次会很卡 */
  const HILIGHT = (function () {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 64);
    return c;
  })();

  /* 贴纸：平涂色块 + 上缘一条高光 + 深色描边，标准赛璐璐画法。
     描边用深色线条（不是同色扩边），这样块感清楚、极扁的面也不会拧成月牙。 */
  function fillSticker(p, color) {
    quadPath(p);
    ctx.fillStyle = color;
    ctx.fill();

    let minEdge = Infinity;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 4; i++) {
      const q = p[i];
      if (q[0] < minX) minX = q[0];
      if (q[0] > maxX) maxX = q[0];
      if (q[1] < minY) minY = q[1];
      if (q[1] > maxY) maxY = q[1];
      const e = Math.hypot(p[(i + 1) % 4][0] - q[0], p[(i + 1) % 4][1] - q[1]);
      if (e < minEdge) minEdge = e;
    }

    if (minEdge > 14) {
      /* 高光：从顶边往下淡出的一条柔光，clip 在贴纸里，用预渲染的渐变图拉伸 */
      const h = (maxY - minY) * 0.38;
      ctx.save();
      quadPath(p);
      ctx.clip();
      ctx.drawImage(HILIGHT, minX, minY, maxX - minX, h);
      ctx.restore();
    }

    if (minEdge > 2) {
      ctx.strokeStyle = '#0b1018';
      ctx.lineWidth = Math.min(1.8, minEdge * 0.07);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /* 地面阴影：预渲染到离屏画布。每帧现场建径向渐变太费，手机上会拖慢拖动 */
  const GROUND_X = 40;
  const GROUND_Y = 930;
  const GROUND_W = 640;
  const GROUND_H = 330;
  let groundLayer = null;

  function buildGround() {
    const c = document.createElement('canvas');
    c.width = GROUND_W;
    c.height = GROUND_H;
    const g = c.getContext('2d');
    g.save();
    g.translate(CX - GROUND_X, CY + 372 - GROUND_Y);
    g.scale(1, 0.22);
    const grad = g.createRadialGradient(0, 0, 10, 0, 0, 300);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = grad;
    g.fillRect(-320, -320, 640, 640);
    g.restore();
    groundLayer = c;
  }

  function drawGround() {
    if (groundLayer) ctx.drawImage(groundLayer, GROUND_X, GROUND_Y);
  }

  /* 内芯：略小于魔方的深色立方体。转动时从缝里看进去是实心塑料，
     不然会直接透出背景，看着像"洞"。 */
  const CORE_HALF = 1.47;
  const CORE_HEX = '#151b26';

  function drawCore() {
    for (let fi = 0; fi < 6; fi++) {
      const n = FACES[fi].n;
      if (toView(n)[2] <= VISIBLE_Z) continue;
      const basis = FACE_UV[fi];
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const su = (k === 0 || k === 3) ? -1 : 1;
        const sv = (k < 2) ? -1 : 1;
        const s = project([
          (n[0] + basis[0][0] * su + basis[1][0] * sv) * CORE_HALF,
          (n[1] + basis[0][1] * su + basis[1][1] * sv) * CORE_HALF,
          (n[2] + basis[0][2] * su + basis[1][2] * sv) * CORE_HALF,
        ]);
        pts.push([s[0], s[1]]);
      }
      quadPath(pts);
      ctx.fillStyle = CORE_HEX;
      ctx.fill();
    }
  }

  function drawCube() {
    drawCore();

    const faces = [];
    const spinMat = spin ? rotAxis(spin.axis, spin.angle) : null;
    const activeIdx = spin ? Core.AXIS_IDX[spin.axis] : -1;
    const activeLayer = spin ? spin.layer : 0;
    const cubies = cube.cubies;

    for (let ci = 0; ci < cubies.length; ci++) {
      const c = cubies[ci];
      const moving = spin && Math.abs(spin.angle) > 0.0001 && c.pos[activeIdx] === activeLayer;
      for (let fi = 0; fi < 6; fi++) {
        /* 只画外表面的贴纸。内侧面本来就被挡住，画出来只会在转动时抢排序、露黑块 */
        const color = c.stickers[fi];
        if (!color) continue;

        const nL = FACES[fi].n;
        let n = Core.applyMat(c.rot, nL);
        /* 转动中的层，法线也要跟着转，不然背面剔除会漏面 */
        if (moving) n = Core.applyMat(spinMat, n);
        const vn = toView(n);
        if (vn[2] <= VISIBLE_Z) continue;   // 背面剔除

        const basis = FACE_UV[fi];
        const pts = [];
        let zsum = 0;
        for (let k = 0; k < 4; k++) {
          const su = (k === 0 || k === 3) ? -1 : 1;
          const sv = (k < 2) ? -1 : 1;
          const lx = (nL[0] + basis[0][0] * su + basis[1][0] * sv) * 0.5 * SIZE;
          const ly = (nL[1] + basis[0][1] * su + basis[1][1] * sv) * 0.5 * SIZE;
          const lz = (nL[2] + basis[0][2] * su + basis[1][2] * sv) * 0.5 * SIZE;
          const off = Core.applyMat(c.rot, [lx, ly, lz]);
          let wp = [c.pos[0] + off[0], c.pos[1] + off[1], c.pos[2] + off[2]];
          if (moving) wp = Core.applyMat(spinMat, wp);
          const sp = project(wp);
          pts.push([sp[0], sp[1]]);
          zsum += sp[2];
        }

        /* 侧对相机时投影成一条线，画出来就是"贴纸碎片"，直接跳过 */
        const area = Math.abs(
          (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) -
          (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1])
        ) / 2 + Math.abs(
          (pts[2][0] - pts[0][0]) * (pts[3][1] - pts[0][1]) -
          (pts[3][0] - pts[0][0]) * (pts[2][1] - pts[0][1])
        ) / 2;
        if (area < 2500) continue;

        const co = Core.applyMat(c.rot, [nL[0] * 0.5 * SIZE, nL[1] * 0.5 * SIZE, nL[2] * 0.5 * SIZE]);
        let center = [c.pos[0] + co[0], c.pos[1] + co[1], c.pos[2] + co[2]];
        if (moving) center = Core.applyMat(spinMat, center);

        faces.push({ pts, z: zsum / 4, color, n, center, cubie: c, fi, area });
      }
    }

    faces.sort((a, b) => a.z - b.z);

    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const p = f.pts;
      quadPath(p);
      ctx.fillStyle = '#131a26';
      ctx.fill();

      const cx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4;
      const cy = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
      /* 几乎侧对相机的面会缩成细条，这时候别再往里缩，不然贴纸之间会裂成碎片 */
      const thin = Math.max(0, Math.min(1, (1500 - f.area) / 1200));
      const inset = 0.91 + 0.08 * thin;
      fillSticker([
        [cx + (p[0][0] - cx) * inset, cy + (p[0][1] - cy) * inset],
        [cx + (p[1][0] - cx) * inset, cy + (p[1][1] - cy) * inset],
        [cx + (p[2][0] - cx) * inset, cy + (p[2][1] - cy) * inset],
        [cx + (p[3][0] - cx) * inset, cy + (p[3][1] - cy) * inset],
      ], shadeOf(f.color, f.n));
    }

    hitFaces = faces;
  }

  function draw() {
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawGround();
    drawCube();
  }

  /* ---------- 命中测试 ---------- */

  function pointInQuad(p, x, y) {
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const xi = p[i][0];
      const yi = p[i][1];
      const xj = p[j][0];
      const yj = p[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function hitTest(x, y) {
    for (let i = hitFaces.length - 1; i >= 0; i--) {
      if (pointInQuad(hitFaces[i].pts, x, y)) return hitFaces[i];
    }
    return null;
  }

  /* 抓在某个面上往哪个方向推：返回 {axis, layer, dir} */
  function pickLayer(hit, dx, dy) {
    const n = hit.n;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;

    const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const base = project(hit.center);
    let best = null;

    for (const a of axes) {
      if (Math.abs(Core.dot(a, n)) > 0.5) continue;   // 只能沿面内方向推
      const tip = project([
        hit.center[0] + a[0] * 0.45,
        hit.center[1] + a[1] * 0.45,
        hit.center[2] + a[2] * 0.45,
      ]);
      const sdx = tip[0] - base[0];
      const sdy = tip[1] - base[1];
      const sl = Math.hypot(sdx, sdy);
      if (sl < 0.5) continue;
      const align = (sdx * dx + sdy * dy) / (sl * len);
      if (!best || align > best.align) best = { a, align, sx: sdx, sy: sdy, sl };
    }

    if (!best || best.align < 0.35) return null;

    const a = best.a;
    const k = Core.cross(a, n);   // 旋转轴（± 世界轴）
    let axisIdx = 0;
    for (let i = 0; i < 3; i++) if (Math.abs(k[i]) > 0.5) axisIdx = i;

    /* 让抓取点朝 a 方向移动：k × p 在 a 上的符号 */
    const slide = Core.dot(Core.cross(k, hit.center), a);
    const dir = (k[axisIdx] > 0 ? 1 : -1) * (slide > 0 ? 1 : -1);

    return {
      axis: Core.AXES[axisIdx],
      layer: hit.cubie.pos[axisIdx],
      dir,
      tangent: [best.sx / best.sl, best.sy / best.sl],
    };
  }

  /* ---------- 输入：Pointer Events（鼠标 + 触摸一套） ---------- */

  let dragId = null;
  let drag = null;

  function toLogic(clientX, clientY) {
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  /* 拖动中的层跟着手指转：把位移投到屏幕切向上，换算成目标角度。
     显示角度在 frame 里按最大角速度追它——甩得再快也要转几帧，不会"一闪到位"。 */
  function setDragAngle(dx, dy) {
    if (!spin || spin.kind !== 'drag' || !drag || !drag.tangent) return;
    const s = dx * drag.tangent[0] + dy * drag.tangent[1];
    const ratio = Math.max(-1, Math.min(1, s / PER90));
    spin.targetAngle = spin.dir * ratio * HALF;
  }

  function beginDragTurn(mv) {
    spin = {
      axis: mv.axis,
      layer: mv.layer,
      dir: mv.dir,
      angle: 0,
      targetAngle: 0,
      from: 0,
      to: 0,
      start: 0,
      dur: 0,
      kind: 'drag',
      scramble: false,
      undo: false,
    };
  }

  /* 松手：转过 45° 就吸附到 90°，没转够就弹回去 */
  function settleDrag() {
    if (!spin || spin.kind !== 'drag') return;
    /* 判定看手指最后拖到的角度（显示角度可能还在限速追赶） */
    const judge = Math.abs(spin.targetAngle) > Math.abs(spin.angle) ? spin.targetAngle : spin.angle;
    const target = Math.abs(judge) >= QUARTER ? (judge > 0 ? HALF : -HALF) : 0;
    spin.kind = 'settle';
    spin.from = spin.angle;
    spin.to = target;
    spin.start = performance.now();
    spin.dur = SETTLE_SEC;
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (dragId !== null) return;

    refreshRect();   // 窗口可能刚变过（地址栏、旋转），按下时对一次
    dragId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 某些环境不支持 */ }

    const p = toLogic(e.clientX, e.clientY);
    const hit = hitTest(p.x, p.y);
    let mode = 'none';
    if (locked) {
      /* 锁定时视角锁死：只有按在魔方上、且能玩的时候才转层 */
      if (hit && phase === 'play' && !spin && !queue.length) mode = 'layer';
    } else {
      /* 解锁后整块画布都归视角 */
      mode = 'view';
    }
    drag = {
      mode,
      hit,
      x0: p.x,
      y0: p.y,
      lx: p.x,
      ly: p.y,
      decided: false,
      tangent: null,
    };
    e.preventDefault();
  }

  function onMove(e) {
    if (dragId === null || e.pointerId !== dragId) return;
    const p = toLogic(e.clientX, e.clientY);

    if (drag.mode === 'view') {
      setView(yaw + (p.x - drag.lx) * SENS, pitch + (p.y - drag.ly) * SENS);
      drag.lx = p.x;
      drag.ly = p.y;
    } else if (drag.mode === 'layer' && !drag.decided) {
      const dx = p.x - drag.x0;
      const dy = p.y - drag.y0;
      if (dx * dx + dy * dy >= DRAG_MIN * DRAG_MIN) {
        const mv = pickLayer(drag.hit, dx, dy);
        if (mv) {
          drag.decided = true;
          drag.tangent = mv.tangent;
          beginDragTurn(mv);
          setDragAngle(dx, dy);   // 判定这一次的位移也要立刻算进去
        }
        /* 方向还不明确：等下一次 move 再试，锁定时绝不偷偷转视角 */
      }
    } else if (drag.mode === 'layer') {
      setDragAngle(p.x - drag.x0, p.y - drag.y0);
    }
    e.preventDefault();
  }

  function onUp(e) {
    if (e.pointerId !== dragId) return;
    if (drag && drag.mode === 'layer') settleDrag();
    dragId = null;
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 同上 */ }
  }

  if (window.PointerEvent) {
    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);
  } else {
    /* 老浏览器兜底：只认第一根手指 */
    let touching = false;
    const touchOf = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;

    canvas.addEventListener('touchstart', (e) => {
      const t = touchOf(e);
      if (!t || touching) return;
      touching = true;
      refreshRect();
      const p = toLogic(t.clientX, t.clientY);
      const hit = hitTest(p.x, p.y);
      let mode = 'none';
      if (locked) {
        if (hit && phase === 'play' && !spin && !queue.length) mode = 'layer';
      } else {
        mode = 'view';
      }
      drag = { mode, hit, x0: p.x, y0: p.y, lx: p.x, ly: p.y, decided: false, tangent: null };
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      const t = touchOf(e);
      if (!t || !drag) return;
      const p = toLogic(t.clientX, t.clientY);
      if (drag.mode === 'view') {
        setView(yaw + (p.x - drag.lx) * SENS, pitch + (p.y - drag.ly) * SENS);
        drag.lx = p.x;
        drag.ly = p.y;
      } else if (drag.mode === 'layer' && !drag.decided) {
        const dx = p.x - drag.x0;
        const dy = p.y - drag.y0;
        if (dx * dx + dy * dy >= DRAG_MIN * DRAG_MIN) {
          const mv = pickLayer(drag.hit, dx, dy);
          if (mv) {
            drag.decided = true;
            drag.tangent = mv.tangent;
            beginDragTurn(mv);
            setDragAngle(dx, dy);
          }
        }
      } else if (drag.mode === 'layer') {
        setDragAngle(p.x - drag.x0, p.y - drag.y0);
      }
      e.preventDefault();
    }, { passive: false });

    const endTouch = () => {
      if (drag && drag.mode === 'layer') settleDrag();
      touching = false;
      drag = null;
    };
    canvas.addEventListener('touchend', endTouch, { passive: false });
    canvas.addEventListener('touchcancel', endTouch, { passive: false });
  }

  // 手机上长按会弹菜单，影响拖动
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- 按钮 ---------- */

  const pad = document.getElementById('pad');
  if (pad) {
    pad.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest ? e.target.closest('.face') : null;
      if (!btn) return;
      e.preventDefault();
      if (phase !== 'play') return;
      const br = btn.getBoundingClientRect();
      const rel = (e.clientX - br.left) / Math.max(br.width, 1);
      const base = Core.MOVES[btn.dataset.move];
      if (!base) return;
      enqueueTurn({ axis: base.axis, layer: base.layer, dir: base.dir * (rel < 0.42 ? -1 : 1) });
    });
  }

  const tools = document.querySelector('.tools');
  if (tools) {
    tools.addEventListener('click', (e) => {
      const btn = e.target.closest ? e.target.closest('.tool') : null;
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'shuffle') shuffle();
      else if (act === 'undo') undo();
      else if (act === 'reset') resetAll();
      else if (act === 'view') setView(VIEW_YAW, VIEW_PITCH);
      else if (act === 'lock') setLocked(!locked);
      else if (act === 'hint') showHint();
    });
  }

  const winAgain = document.getElementById('winAgain');
  if (winAgain) winAgain.addEventListener('click', () => { hideWin(); shuffle(); });

  /* ---------- 键盘 ---------- */

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const key = e.key.toLowerCase();
    const map = { u: 'U', d: 'D', l: 'L', r: 'R', f: 'F', b: 'B' };
    if (map[key]) {
      e.preventDefault();
      if (phase !== 'play') return;
      const base = Core.MOVES[map[key]];
      enqueueTurn({ axis: base.axis, layer: base.layer, dir: base.dir * (e.shiftKey ? -1 : 1) });
    } else if (key === 'z') {
      undo();
    } else if (key === 'escape') {
      resetAll();
    }
  });

  /* ---------- 主循环 ---------- */

  function frame(now) {
    const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0;
    lastNow = now;

    if (phase === 'play') elapsed = (now - playStart) / 1000;

    if (spin && spin.kind === 'drag') {
      /* 拖动角度按角速度上限追目标：甩得再快也要转几帧，不会一帧闪到 90° */
      const maxStep = DRAG_SPEED * (dt || 0.016);
      const d = spin.targetAngle - spin.angle;
      if (Math.abs(d) <= maxStep) spin.angle = spin.targetAngle;
      else spin.angle += (d > 0 ? 1 : -1) * maxStep;
    } else if (spin) {
      /* 用开始时间算进度，掉帧也不会把动画拖长 */
      const p = spin.dur > 0 ? Math.min(1, (now - spin.start) / 1000 / spin.dur) : 1;
      /* 单步/吸附用 easeOutCubic（松手后顺势滑到位、收尾才减速，像有阻尼）；
         打乱用 easeInOutCubic，连续多步时起收都柔和，不会每步都"咔"一下 */
      const e = spin.kind === 'scramble'
        ? (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
        : 1 - Math.pow(1 - p, 3);
      spin.angle = spin.from + (spin.to - spin.from) * e;
      if (p >= 1) {
        const s = spin;
        spin = null;
        finishSpin(s);
      }
    }
    if (!spin && queue.length) startTurn(queue.shift());

    updateHud();
    updateTrig();
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- 启动 ---------- */

  lockBtn = document.getElementById('lockBtn');
  syncLockBtn();
  buildGround();
  resize();
  window.addEventListener('resize', resize);
  updateTrig();
  updateHud(true);
  refreshHint();

  if (!DEBUG) {
    setTimeout(() => { if (phase === 'ready') shuffle(); }, 420);
  }

  /* 调试 / 测试接口（只在 ?debug 下暴露） */
  if (DEBUG) {
    window.__cube = {
      state() {
        return {
          phase,
          solved: Core.isSolved(cube),
          moves,
          elapsed,
          busy: !!spin || queue.length > 0,
          queued: queue.length,
          scrambleLeft,
          yaw,
          pitch,
          locked,
          best: best ? { t: best.t, m: best.m } : null,
        };
      },
      setView(y, p) { setView(y, p); return this.state(); },
      setLocked(v) { setLocked(v); return this.state(); },
      hintMove() { return solutionStack.length ? moveName(solutionStack[0]) : null; },
      stackLen() { return solutionStack.length; },
      reset() { resetAll(); return this.state(); },
      /* 复原状态直接进入可玩（测试用，不打乱） */
      play() {
        phase = 'play';
        elapsed = 0;
        moves = 0;
        history = [];
        solutionStack = [];
        spin = null;
        queue = [];
        playStart = performance.now();
        refreshHint();
        updateHud(true);
        return this.state();
      },
      shuffle() { shuffle(); return this.state(); },
      /* 立即打乱、直接进入可玩状态（测试用，不跑动画） */
      scramble(n) {
        spin = null;
        queue = [];
        history = [];
        cube = Core.createCube();
        const seq = Core.scramble(n || 20);
        for (const mv of seq) Core.turn(cube, mv);
        solutionStack = seq.slice().reverse().map((m) => ({ axis: m.axis, layer: m.layer, dir: -m.dir }));
        phase = 'play';
        elapsed = 0;
        moves = 0;
        scrambleLeft = 0;
        playStart = performance.now();
        hideWin();
        refreshHint();
        updateHud(true);
        return seq;
      },
      /* 立即执行一步标准记法，返回是否已复原 */
      apply(name) {
        Core.turn(cube, Core.parseMove(name));
        return Core.isSolved(cube);
      },
      applyTurn(mv) {
        Core.turn(cube, mv);
        return Core.isSolved(cube);
      },
      cubies() {
        return cube.cubies.map((c) => ({
          pos: c.pos.slice(),
          rot: c.rot.map((r) => r.slice()),
          stickers: c.stickers.slice(),
        }));
      },
      /* 某个 cubie 某个面的中心在页面里的 CSS 坐标 */
      screenOf(pos, fi) {
        const c = Core.findCubie(cube, pos);
        if (!c) return null;
        const nL = FACES[fi].n;
        const off = Core.applyMat(c.rot, [nL[0] * 0.5 * SIZE, nL[1] * 0.5 * SIZE, nL[2] * 0.5 * SIZE]);
        const s = project([c.pos[0] + off[0], c.pos[1] + off[1], c.pos[2] + off[2]]);
        refreshRect();
        return {
          x: rect.left + (s[0] / W) * rect.width,
          y: rect.top + (s[1] / H) * rect.height,
          lx: s[0],
          ly: s[1],
        };
      },
      hitTest(x, y) {
        const f = hitTest(x, y);
        if (!f) return null;
        return { pos: f.cubie.pos.slice(), fi: f.fi, n: f.n.slice() };
      },
      stickers() { return Core.stickerLayout(cube); },
      /* 当前这一帧画出来的面（调试渲染用） */
      faces() {
        return hitFaces.map((f) => ({
          pos: f.cubie.pos.slice(),
          fi: f.fi,
          color: f.color,
          n: f.n.map((v) => Math.round(v * 100) / 100),
          z: Math.round(f.z * 1000) / 1000,
          pts: f.pts.map((p) => [Math.round(p[0]), Math.round(p[1])]),
        }));
      },
      animInfo() {
        return spin ? {
          axis: spin.axis,
          layer: spin.layer,
          dir: spin.dir,
          angle: Math.round(spin.angle * 1000) / 1000,
          kind: spin.kind,
        } : null;
      },
      stage() {
        refreshRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      },
    };
  }

  requestAnimationFrame(frame);
})();
