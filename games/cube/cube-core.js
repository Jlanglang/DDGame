/* 豆豆魔方 · 纯逻辑核心（不碰 DOM / canvas）
   浏览器里挂 window.CubeCore；Node 里直接 require('./cube-core.js') 就能测。
   坐标：魔方中心在原点，每个 cubie 的 pos 取 -1 / 0 / 1，外层贴纸在对应方向上。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CubeCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 六个世界朝向。索引顺序在渲染里也用，别乱改。 */
  const FACES = [
    { n: [1, 0, 0], color: 'R' },
    { n: [-1, 0, 0], color: 'O' },
    { n: [0, 1, 0], color: 'W' },
    { n: [0, -1, 0], color: 'Y' },
    { n: [0, 0, 1], color: 'G' },
    { n: [0, 0, -1], color: 'B' },
  ];

  /* 每个面在面内取的两个正交方向：顶点 = n/2 + u/2 + v/2 的四种符号组合 */
  const FACE_UV = [
    [[0, 1, 0], [0, 0, 1]],
    [[0, 1, 0], [0, 0, -1]],
    [[1, 0, 0], [0, 0, 1]],
    [[1, 0, 0], [0, 0, -1]],
    [[1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 1, 0]],
  ];

  const COLOR_HEX = {
    R: '#e2493d',
    O: '#f08a2e',
    W: '#ffffff',
    Y: '#f3ce3e',
    G: '#37a862',
    B: '#3272d4',
  };

  const AXES = ['x', 'y', 'z'];
  const AXIS_IDX = { x: 0, y: 1, z: 2 };

  /* 标准记法：U 顶层顺时针（从上看），以此类推。
     dir 是绕正轴右手方向的符号。 */
  const MOVES = {
    U: { axis: 'y', layer: 1, dir: 1 },
    D: { axis: 'y', layer: -1, dir: -1 },
    R: { axis: 'x', layer: 1, dir: 1 },
    L: { axis: 'x', layer: -1, dir: -1 },
    F: { axis: 'z', layer: 1, dir: -1 },
    B: { axis: 'z', layer: -1, dir: 1 },
  };

  function identity() {
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  function mulMat(a, b) {
    const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
      }
    }
    return r;
  }

  function applyMat(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function norm(a) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  /* 绕 x/y/z 正方向转 90° 的整数矩阵 */
  function stepMat(axisIdx) {
    if (axisIdx === 0) return [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
    if (axisIdx === 1) return [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
    return [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
  }

  /* deg 必须是 90 的倍数（负数也行）：复原状态里只做精确的整数旋转，
     避免浮点误差累积。 */
  function rotMat(axis, deg) {
    const idx = AXIS_IDX[axis];
    if (idx === undefined) throw new Error('未知轴：' + axis);
    const step = stepMat(idx);
    let m = identity();
    const turns = ((Math.round(deg / 90) % 4) + 4) % 4;
    for (let i = 0; i < turns; i++) m = mulMat(step, m);
    return m;
  }

  function createCube() {
    const cubies = [];
    let id = 0;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const pos = [x, y, z];
          /* 只有朝外的面才贴色，内侧面留给渲染画成塑料底 */
          const stickers = FACES.map((f) => (dot(pos, f.n) === 1 ? f.color : null));
          cubies.push({ id: id++, home: pos.slice(), pos: pos.slice(), rot: identity(), stickers });
        }
      }
    }
    return { cubies };
  }

  function findCubie(cube, pos) {
    return cube.cubies.find(
      (c) => c.pos[0] === pos[0] && c.pos[1] === pos[1] && c.pos[2] === pos[2]
    ) || null;
  }

  /* 就地转一层。mv = { axis:'x'|'y'|'z', layer:-1|0|1, dir:1|-1 } */
  function turn(cube, mv) {
    const ax = AXIS_IDX[mv.axis];
    if (ax === undefined) throw new Error('未知轴：' + mv.axis);
    const R = rotMat(mv.axis, 90 * mv.dir);
    for (const c of cube.cubies) {
      if (c.pos[ax] !== mv.layer) continue;
      const p = applyMat(R, c.pos);
      c.pos = [Math.round(p[0]) + 0, Math.round(p[1]) + 0, Math.round(p[2]) + 0];
      c.rot = mulMat(R, c.rot);
    }
    return cube;
  }

  function invert(mv) {
    return { axis: mv.axis, layer: mv.layer, dir: -mv.dir };
  }

  /* 'U' / "U'" 都认；别的交给调用方报错 */
  function parseMove(name) {
    const raw = String(name || '').trim();
    const key = raw.slice(0, 1).toUpperCase();
    const base = MOVES[key];
    if (!base) throw new Error('未知转动：' + name);
    const prime = raw.slice(1).trim() === "'" || raw.slice(1).trim() === '’';
    return { axis: base.axis, layer: base.layer, dir: base.dir * (prime ? -1 : 1), name: key + (prime ? "'" : '') };
  }

  /* 每个世界面 9 张贴纸的颜色，供复原判定和测试使用 */
  function stickerLayout(cube) {
    const out = {};
    for (const f of FACES) {
      const key = f.n.join(',');
      const cells = [];
      for (const c of cube.cubies) {
        if (dot(c.pos, f.n) !== 1) continue;
        for (let i = 0; i < 6; i++) {
          const wn = applyMat(c.rot, FACES[i].n);
          if (wn[0] === f.n[0] && wn[1] === f.n[1] && wn[2] === f.n[2]) {
            cells.push({ pos: c.pos.slice(), color: c.stickers[i] });
            break;
          }
        }
      }
      out[key] = cells;
    }
    return out;
  }

  function isSolved(cube) {
    const layout = stickerLayout(cube);
    for (const key of Object.keys(layout)) {
      const cells = layout[key];
      if (cells.length !== 9) return false;
      const first = cells[0].color;
      if (!first) return false;
      for (let i = 1; i < cells.length; i++) {
        if (cells[i].color !== first) return false;
      }
    }
    return true;
  }

  /* 20 步随机打乱；相邻两步不转同一层，避免打乱后看着像没打乱 */
  function scramble(count, rng) {
    const rand = rng || Math.random;
    const names = Object.keys(MOVES);
    const out = [];
    let lastKey = '';
    let guard = 0;
    while (out.length < count && guard++ < count * 40) {
      const name = names[(rand() * names.length) | 0];
      const base = MOVES[name];
      const key = base.axis + base.layer;
      if (key === lastKey) continue;
      const dir = rand() < 0.5 ? 1 : -1;
      out.push({ axis: base.axis, layer: base.layer, dir: base.dir * dir, name: name + (dir < 0 ? "'" : '') });
      lastKey = key;
    }
    return out;
  }

  function cloneCube(cube) {
    return {
      cubies: cube.cubies.map((c) => ({
        id: c.id,
        home: c.home.slice(),
        pos: c.pos.slice(),
        rot: c.rot.map((r) => r.slice()),
        stickers: c.stickers.slice(),
      })),
    };
  }

  function stateKey(cube) {
    return cube.cubies
      .map((c) => c.pos.join('') + '|' + c.rot.flat().join(','))
      .sort()
      .join(';');
  }

  return {
    FACES,
    FACE_UV,
    COLOR_HEX,
    AXES,
    AXIS_IDX,
    MOVES,
    identity,
    mulMat,
    applyMat,
    dot,
    cross,
    norm,
    rotMat,
    createCube,
    findCubie,
    turn,
    invert,
    parseMove,
    stickerLayout,
    isSolved,
    scramble,
    cloneCube,
    stateKey,
  };
});
