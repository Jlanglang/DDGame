/* 豆豆暗黑传奇 · 3D 视图的斜视立牌
   画的是 45° 能看见顶面和侧面的体积，不是正视图几何块。
   平面版仍用原来的像素图。不投影、不挡人。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});

  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function hex(c) {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(c, t) {
    const a = hex(c);
    const r = Math.round(a[0] + (255 - a[0]) * t);
    const g = Math.round(a[1] + (255 - a[1]) * t);
    const b = Math.round(a[2] + (255 - a[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function shade(c, t) {
    const a = hex(c);
    return 'rgb(' + Math.round(a[0] * (1 - t)) + ',' + Math.round(a[1] * (1 - t)) + ',' + Math.round(a[2] * (1 - t)) + ')';
  }

  function sphere(g, x, y, r, light, mid, dark) {
    const grd = g.createRadialGradient(x - r * 0.34, y - r * 0.4, r * 0.08, x + r * 0.08, y + r * 0.12, r);
    grd.addColorStop(0, light);
    grd.addColorStop(0.42, mid);
    grd.addColorStop(1, dark);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  function contact(g, x, y, rx, ry) {
    g.fillStyle = 'rgba(28, 22, 14, 0.28)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }

  function isoBox(g, x, y, w, h, d, front, side, top) {
    const dx = d * 0.62;
    const dy = d * 0.36;
    g.fillStyle = side;
    g.beginPath();
    g.moveTo(x + w, y);
    g.lineTo(x + w + dx, y - dy);
    g.lineTo(x + w + dx, y - h - dy);
    g.lineTo(x + w, y - h);
    g.closePath();
    g.fill();
    g.fillStyle = top;
    g.beginPath();
    g.moveTo(x, y - h);
    g.lineTo(x + dx, y - h - dy);
    g.lineTo(x + w + dx, y - h - dy);
    g.lineTo(x + w, y - h);
    g.closePath();
    g.fill();
    const grd = g.createLinearGradient(x, y - h, x + w, y);
    grd.addColorStop(0, mix(front, 0.18));
    grd.addColorStop(1, shade(front, 0.12));
    g.fillStyle = grd;
    g.fillRect(x, y - h, w, h);
  }

  function gable(g, x, y, w, rise, d, roof, roofSide) {
    const dx = d * 0.62;
    const dy = d * 0.36;
    const mid = x + w * 0.5;
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(x - 12, y + 4);
    g.lineTo(mid, y - rise);
    g.lineTo(x + w + 8, y + 2);
    g.closePath();
    g.fill();
    g.fillStyle = roofSide;
    g.beginPath();
    g.moveTo(x + w + 8, y + 2);
    g.lineTo(mid, y - rise);
    g.lineTo(mid + dx * 0.85, y - rise - dy * 0.45);
    g.lineTo(x + w + dx, y - dy);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60, 24, 16, 0.28)';
    g.lineWidth = 1.4;
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const ly = y + 4 - (y + 4 - (y - rise)) * t;
      const half = (w * 0.5 + 10) * (1 - t * 0.92);
      g.beginPath();
      g.moveTo(mid - half, ly);
      g.lineTo(mid + half * 0.72, ly - 1);
      g.stroke();
    }
  }

  function ground(map, terrain, theme) {
    const H = map.length;
    const W = map[0].length;
    const px = W > 80 ? 20 : 28;
    const c = document.createElement('canvas');
    c.width = W * px;
    c.height = H * px;
    const g = c.getContext('2d');
    const cave = theme === 'cave';
    const waste = theme === 'waste';
    g.fillStyle = cave ? '#3c463f' : waste ? '#b08958' : '#5f9a3c';
    g.fillRect(0, 0, c.width, c.height);
    const nDab = cave ? 900 : 1400;
    for (let i = 0; i < nDab; i++) {
      const x = hash(i, 2) % c.width;
      const y = hash(i, 5) % c.height;
      const r = 6 + (hash(i, 8) % 14);
      let col;
      if (cave) col = i % 2 ? 'rgba(24,28,26,0.16)' : 'rgba(120,126,108,0.14)';
      else if (waste) col = i % 2 ? 'rgba(110,70,36,0.14)' : 'rgba(220,180,120,0.14)';
      else col = i % 3 === 0 ? 'rgba(30,88,24,0.16)' : i % 3 === 1 ? 'rgba(170,210,90,0.14)' : 'rgba(60,120,36,0.13)';
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
      g.fill();
    }
    function pathAt(x, y) {
      if (y < 0 || x < 0 || y >= H || x >= W) return false;
      if (map[y][x] === 1) return false;
      if (map[y][x] === 2) return true;
      return !!(terrain && terrain[y] && terrain[y][x] === 1);
    }
    function bandsOf(horizontal) {
      const lines = [];
      if (horizontal) {
        for (let y = 0; y < H; y++) {
          let x = 0;
          while (x < W) {
            if (!(pathAt(x, y) && !pathAt(x, y - 1))) { x += 1; continue; }
            let thick = 1;
            while (thick < 8 && pathAt(x, y + thick)) thick += 1;
            let x2 = x + 1;
            while (x2 < W && pathAt(x2, y) && !pathAt(x2, y - 1)) x2 += 1;
            if (x2 - x >= 4) {
              const cy = (y + thick / 2) * px;
              lines.push([x * px, cy, x2 * px, cy, thick * px]);
            }
            x = x2;
          }
        }
      } else {
        for (let x = 0; x < W; x++) {
          let y = 0;
          while (y < H) {
            if (!(pathAt(x, y) && !pathAt(x - 1, y))) { y += 1; continue; }
            let thick = 1;
            while (thick < 8 && pathAt(x + thick, y)) thick += 1;
            let y2 = y + 1;
            while (y2 < H && pathAt(x, y2) && !pathAt(x - 1, y2)) y2 += 1;
            if (y2 - y >= 4) {
              const cx = (x + thick / 2) * px;
              lines.push([cx, y * px, cx, y2 * px, thick * px]);
            }
            y = y2;
          }
        }
      }
      return lines;
    }
    const lines = bandsOf(true).concat(bandsOf(false));
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const layers = cave
      ? [['#2e2a26', 1.12], ['#6a6258', 0.78], ['rgba(170,160,140,0.28)', 0.24]]
      : [['#6a4a2c', 1.12], ['#c6a56e', 0.78], ['rgba(240,220,176,0.42)', 0.26]];
    for (let b = 0; b < layers.length; b++) {
      g.strokeStyle = layers[b][0];
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        g.lineWidth = ln[4] * layers[b][1];
        g.beginPath();
        g.moveTo(ln[0], ln[1]);
        g.lineTo(ln[2], ln[3]);
        g.stroke();
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (map[y][x] !== 2) continue;
        g.fillStyle = cave ? '#8a8070' : '#e6c56a';
        g.beginPath();
        g.ellipse((x + 0.5) * px, (y + 0.5) * px, px * 0.42, px * 0.32, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c;
  }

  function sword(g, x, y, face, pose) {
    g.save();
    g.translate(x + (face === 'left' ? -16 : 14), y - 34);
    let ang = face === 'left' ? Math.PI : -0.15;
    if (pose === 'high') ang = face === 'left' ? Math.PI + 0.9 : -0.95;
    if (pose === 'out') ang = face === 'left' ? Math.PI - 0.25 : -0.2;
    g.rotate(ang);
    const grd = g.createLinearGradient(0, -3, 0, 3);
    grd.addColorStop(0, '#f7f9fc');
    grd.addColorStop(0.45, '#d5dde6');
    grd.addColorStop(1, '#8b97a6');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(2, -1.2);
    g.lineTo(46, -0.4);
    g.lineTo(46, 1.1);
    g.lineTo(2, 2.2);
    g.closePath();
    g.fill();
    g.fillStyle = '#d7b25a';
    g.fillRect(-2, -5, 8, 10);
    g.restore();
  }

  function bean(g, x, y, o) {
    y += o.bob || 0;
    const face = o.face || 'front';
    const side = face === 'left' ? -1 : face === 'right' ? 1 : 0;
    contact(g, x, y + 2, 24, 7);
    const cape = o.cape || '#9a3030';
    const tunic = o.tunic || '#7a4e30';
    g.fillStyle = shade(cape, 0.15);
    g.beginPath();
    g.ellipse(x - side * 4, y - 28, 26, 22, side * 0.2, 0, Math.PI * 2);
    g.fill();
    const body = g.createLinearGradient(x - 22, y - 64, x + 24, y - 8);
    body.addColorStop(0, mix(tunic, 0.22));
    body.addColorStop(0.55, tunic);
    body.addColorStop(1, shade(tunic, 0.28));
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(x + side * 4, y - 36, 22, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c6a15a';
    g.fillRect(x - 16 + side * 4, y - 28, 32, 4);
    sphere(g, x + side * 6, y - 78, 28, mix('#f3d7b0', 0.35), '#f0d2a8', shade('#e2b88a', 0.05));
    if (face !== 'back') {
      const ex = side * 6;
      g.fillStyle = '#2a2118';
      g.beginPath();
      g.arc(x - 8 + ex, y - 80, 2.3, 0, Math.PI * 2);
      g.arc(x + 7 + ex, y - 80, 2.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(210, 96, 108, 0.55)';
      g.beginPath();
      g.ellipse(x - 14 + ex, y - 72, 4, 2.2, 0, 0, Math.PI * 2);
      g.ellipse(x + 14 + ex, y - 72, 4, 2.2, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = shade('#e2b88a', 0.18);
      g.beginPath();
      g.ellipse(x, y - 70, 16, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (o.hat) {
      g.fillStyle = shade(o.hat, 0.2);
      g.beginPath();
      g.ellipse(x + side * 4, y - 100, 24, 7, 0, 0, Math.PI * 2);
      g.fill();
      sphere(g, x + side * 4, y - 112, 12, mix(o.hat, 0.25), o.hat, shade(o.hat, 0.25));
    }
    if (o.prop === 'apron') {
      const ap = g.createLinearGradient(x - 12, y - 58, x + 12, y - 30);
      ap.addColorStop(0, '#f7f1e4');
      ap.addColorStop(1, '#d9cbb4');
      g.fillStyle = ap;
      g.beginPath();
      g.ellipse(x, y - 44, 14, 16, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (o.prop === 'book') {
      g.fillStyle = '#3d5c86';
      g.beginPath();
      g.moveTo(x + 10, y - 48);
      g.lineTo(x + 26, y - 44);
      g.lineTo(x + 24, y - 32);
      g.lineTo(x + 8, y - 36);
      g.closePath();
      g.fill();
    }
    if (o.sword && o.sword !== 'none') sword(g, x, y, face, o.sword);
  }

  function heroSheet() {
    const cell = 160;
    const c = document.createElement('canvas');
    c.width = cell * 4;
    c.height = cell * 5;
    const g = c.getContext('2d');
    const faces = ['front', 'left', 'right', 'back'];
    const poses = [
      { sword: 'rest', bob: 0 },
      { sword: 'rest', bob: -5 },
      { sword: 'rest', bob: 4 },
      { sword: 'high', bob: -2 },
    ];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        bean(g, col * cell + cell / 2, row * cell + 146, {
          face: faces[row],
          cape: '#9a3030',
          tunic: '#7a4e30',
          sword: poses[col].sword,
          bob: poses[col].bob,
        });
      }
    }
    bean(g, 2 * cell + cell / 2, 4 * cell + 150, {
      face: 'front', cape: '#9a3030', tunic: '#7a4e30', sword: 'rest', bob: 16,
    });
    return c;
  }

  const NPC = [
    { tunic: '#7a4e30', cape: '#9a3030', prop: 'apron' },
    { tunic: '#3d5c86', cape: '#243044', hat: '#2c3f66' },
    { tunic: '#6a4a86', cape: '#3a2844', prop: 'book' },
    { tunic: '#6e5434', cape: '#4a3824', hat: '#6b5030' },
  ];

  function npc(i) {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 220;
    const g = c.getContext('2d');
    const o = NPC[i] || NPC[0];
    bean(g, 110, 206, {
      face: 'front',
      cape: o.cape,
      tunic: o.tunic,
      hat: o.hat,
      prop: o.prop,
      sword: 'none',
    });
    return c;
  }

  function mob(id, frame) {
    const c = document.createElement('canvas');
    c.width = 192;
    c.height = 210;
    const g = c.getContext('2d');
    const bob = frame ? -4 : 3;
    contact(g, 96, 188, 40, 9);
    if (id === 'chicken') drawChicken(g, bob);
    else if (id === 'scarecrow') drawScarecrow(g, bob);
    else if (id === 'dog') drawDog(g, bob);
    else if (id === 'boar') drawBoar(g, bob);
    else return null;
    return c;
  }

  function drawChicken(g, bob) {
    sphere(g, 92, 128 + bob, 28, '#fff6e4', '#f0e2c4', '#c8b494');
    sphere(g, 124, 112 + bob, 16, '#fff8ea', '#f3e6cc', '#d2c0a4');
    g.fillStyle = '#c44838';
    g.beginPath();
    g.ellipse(128, 98 + bob, 5, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e0b04a';
    g.beginPath();
    g.moveTo(138, 110 + bob);
    g.lineTo(156, 114 + bob);
    g.lineTo(138, 120 + bob);
    g.closePath();
    g.fill();
    g.fillStyle = '#2a2118';
    g.beginPath();
    g.arc(130, 110 + bob, 1.8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b06830';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(80, 150 + bob);
    g.lineTo(74, 176);
    g.moveTo(104, 152 + bob);
    g.lineTo(110, 176);
    g.stroke();
  }

  function drawScarecrow(g, bob) {
    const wood = g.createLinearGradient(90, 40, 110, 180);
    wood.addColorStop(0, '#a87848');
    wood.addColorStop(1, '#5c3c22');
    g.strokeStyle = wood;
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(96, 70 + bob);
    g.lineTo(96, 184);
    g.moveTo(54, 104 + bob);
    g.lineTo(138, 100 + bob);
    g.stroke();
    sphere(g, 96, 62 + bob, 20, '#f0d48a', '#d7b25a', '#a8843a');
    g.fillStyle = '#5c4030';
    g.beginPath();
    g.ellipse(96, 48 + bob, 22, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(96, 40 + bob, 12, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2118';
    g.beginPath();
    g.arc(90, 62 + bob, 1.7, 0, Math.PI * 2);
    g.arc(104, 62 + bob, 1.7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(196, 154, 72, 0.85)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(58, 108 + bob);
    g.lineTo(44, 128 + bob);
    g.moveTo(134, 104 + bob);
    g.lineTo(150, 122 + bob);
    g.stroke();
  }

  function drawDog(g, bob) {
    sphere(g, 96, 132 + bob, 36, '#c48a56', '#8d5a32', '#5c3a22');
    sphere(g, 136, 112 + bob, 16, '#d7a06a', '#a86c40', '#6e4528');
    g.fillStyle = '#5c3a22';
    g.beginPath();
    g.ellipse(128, 96 + bob, 6, 11, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2118';
    g.beginPath();
    g.arc(142, 110 + bob, 1.8, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#6e4528';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(64, 128 + bob);
    g.quadraticCurveTo(40, 116, 34, 96);
    g.moveTo(74, 156 + bob);
    g.lineTo(70, 180);
    g.moveTo(118, 158 + bob);
    g.lineTo(124, 180);
    g.stroke();
  }

  function drawBoar(g, bob) {
    sphere(g, 90, 128 + bob, 40, '#a07a62', '#6e5244', '#3e2e28');
    sphere(g, 138, 118 + bob, 16, '#b08870', '#7a5c4c', '#4a342c');
    g.fillStyle = '#e6d0b8';
    g.beginPath();
    g.ellipse(154, 122 + bob, 7, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f4efe6';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(146, 128 + bob);
    g.lineTo(158, 140 + bob);
    g.stroke();
    g.fillStyle = '#2a2118';
    g.beginPath();
    g.arc(144, 112 + bob, 1.8, 0, Math.PI * 2);
    g.fill();
  }

  function house(kind) {
    const c = document.createElement('canvas');
    c.width = 420;
    c.height = 520;
    const g = c.getContext('2d');
    contact(g, 200, 492, 120, 16);
    const wall = kind === 'stash' ? '#c4aa78' : '#f0e2c8';
    const roof = kind === 'shop' ? '#8d342c' : kind === 'chief' ? '#c4a15a' : '#6a4c30';
    const x = 78;
    const foot = 478;
    const w = 168;
    const h = 150;
    const d = 78;
    isoBox(g, x, foot, w, h, d, wall, shade(wall, 0.28), mix(wall, 0.2));
    gable(g, x - 6, foot - h + 8, w + 16, 78, d, roof, shade(roof, 0.22));
    g.fillStyle = shade('#5c3a24', 0.15);
    g.fillRect(x + 62, foot - 92, 40, 92);
    g.fillStyle = 'rgba(255, 214, 140, 0.55)';
    g.fillRect(x + 22, foot - 118, 28, 24);
    g.fillStyle = 'rgba(40, 28, 18, 0.35)';
    g.fillRect(x + 22, foot - 118, 28, 24);
    g.fillStyle = 'rgba(255, 196, 110, 0.35)';
    g.fillRect(x + 26, foot - 114, 12, 10);
    if (kind === 'shop') {
      g.fillStyle = '#f4efe6';
      g.beginPath();
      g.moveTo(x - 8, foot - h + 36);
      g.lineTo(x + w + 16, foot - h + 40);
      g.lineTo(x + w + 4, foot - h + 78);
      g.lineTo(x + 4, foot - h + 70);
      g.closePath();
      g.fill();
      g.fillStyle = '#8d342c';
      for (let i = 0; i < 5; i++) g.fillRect(x + 8 + i * 34, foot - h + 42, 14, 28);
    }
    if (kind === 'stash') {
      isoBox(g, x - 8, foot, 36, 48, 28, '#8d6438', '#5c4024', '#c4a06a');
      isoBox(g, x + w - 10, foot - 4, 30, 40, 24, '#a07848', '#6a4c30', '#d2b48a');
    }
    return c;
  }

  function rock(variant) {
    const c = document.createElement('canvas');
    c.width = 180;
    c.height = 140;
    const g = c.getContext('2d');
    const v = variant | 0;
    const nudge = [[0, 0, 1], [6, 2, 0.88], [-4, 3, 1.06]][v % 3];
    const ox = 90 + nudge[0];
    const oy = 132;
    const s = nudge[2];
    const front = [ox, oy];
    const left = [ox - 56 * s, oy - 26 * s];
    const right = [ox + 60 * s, oy - 24 * s];
    const back = [ox + 4 * s, oy - 48 * s];
    const lift = 26 * s;
    const ft = [front[0], front[1] - lift];
    const lt = [left[0] + (v === 1 ? 8 : 0), left[1] - lift - 2];
    const rt = [right[0] - (v === 2 ? 6 : 0), right[1] - lift + 2];
    const bt = [back[0], back[1] - lift - 4];
    function poly(pts, color) {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.fillStyle = color;
      g.fill();
    }
    poly([front, right, rt, ft], '#6a645c');
    poly([front, left, lt, ft], '#9a9084');
    poly([ft, lt, bt, rt], '#d4c8b4');
    g.strokeStyle = 'rgba(42,36,28,0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ft[0] - 6, ft[1] - 4);
    g.lineTo(bt[0] + 4, bt[1] + 8);
    g.stroke();
    return c;
  }

  function caveMouth() {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 340;
    const g = c.getContext('2d');
    contact(g, 160, 310, 120, 18);
    sphere(g, 160, 200, 120, '#8a9a62', '#5c6a40', '#2e3824');
    sphere(g, 160, 214, 70, '#6a6458', '#4a453c', '#2a2622');
    g.fillStyle = '#12161a';
    g.beginPath();
    g.ellipse(160, 220, 36, 48, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5c4030';
    g.fillRect(124, 150, 72, 18);
    return c;
  }

  function flora(i) {
    const c = document.createElement('canvas');
    c.width = 280;
    c.height = 360;
    const g = c.getContext('2d');
    contact(g, 140, 336, 70, 12);
    if ((i % 4) === 3) {
      g.strokeStyle = '#6b4e32';
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(140, 330);
      g.lineTo(132, 90);
      g.moveTo(134, 180);
      g.lineTo(70, 120);
      g.moveTo(136, 150);
      g.lineTo(210, 80);
      g.stroke();
      return c;
    }
    const trunk = g.createLinearGradient(124, 160, 160, 330);
    trunk.addColorStop(0, '#a87848');
    trunk.addColorStop(1, '#5c3c22');
    g.fillStyle = trunk;
    g.fillRect(126, 200, 28, 130);
    if ((i % 4) === 2) {
      g.fillStyle = '#2f6a34';
      g.beginPath();
      g.moveTo(140, 36);
      g.lineTo(48, 230);
      g.lineTo(232, 230);
      g.closePath();
      g.fill();
      g.fillStyle = '#3e8a44';
      g.beginPath();
      g.moveTo(140, 90);
      g.lineTo(78, 180);
      g.lineTo(202, 180);
      g.closePath();
      g.fill();
      return c;
    }
    const puffs = [
      [132, 176, 70, '#7cbc58', '#3e7a34', '#1e401c'],
      [78, 198, 46, '#68a848', '#3a6e30', '#1a3818'],
      [198, 188, 52, '#5e9840', '#346828', '#163216'],
      [150, 118, 44, '#8ec868', '#4c8c40', '#244820'],
      [104, 132, 36, '#76b050', '#3e7434', '#1c3c1a'],
      [176, 140, 30, '#9ed070', '#568c48', '#2a4c24'],
    ];
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      sphere(g, p[0], p[1], p[2], p[3], p[4], p[5]);
    }
    return c;
  }

  function townProp(i) {
    const c = document.createElement('canvas');
    c.width = 280;
    c.height = 260;
    const g = c.getContext('2d');
    contact(g, 130, 236, 70, 12);
    if (i === 0 || i === 1) {
      isoBox(g, 40, 230, 150, 70, 54, '#8d5e36', '#5c3c22', '#c49464');
      g.fillStyle = i === 0 ? '#f6f1e6' : '#4a6ea4';
      g.beginPath();
      g.moveTo(28, 168);
      g.lineTo(214, 176);
      g.lineTo(196, 124);
      g.lineTo(46, 118);
      g.closePath();
      g.fill();
      g.fillStyle = i === 0 ? '#8d342c' : '#e4eef6';
      for (let k = 0; k < 5; k++) g.fillRect(52 + k * 30, 128, 12, 36);
    } else if (i === 2) {
      g.strokeStyle = '#6b4e32';
      g.lineWidth = 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(70, 210);
      g.lineTo(190, 196);
      g.moveTo(96, 214);
      g.lineTo(150, 150);
      g.stroke();
      sphere(g, 132, 150, 28, '#ffd27a', '#e07028', '#a33a18');
      sphere(g, 132, 142, 14, '#fff2c4', '#f0c46a', '#e09030');
    } else if (i === 3) {
      g.fillStyle = '#8d8474';
      g.beginPath();
      g.ellipse(130, 176, 78, 28, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3e6e8e';
      g.beginPath();
      g.ellipse(130, 170, 52, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(186, 220, 236, 0.45)';
      g.beginPath();
      g.ellipse(118, 166, 18, 6, 0, 0, Math.PI * 2);
      g.fill();
      gable(g, 70, 168, 120, 54, 40, '#8d342c', '#6a2824');
    } else if (i === 4) {
      const tent = g.createLinearGradient(40, 40, 220, 230);
      tent.addColorStop(0, '#f7f1e4');
      tent.addColorStop(1, '#c4b49a');
      g.fillStyle = tent;
      g.beginPath();
      g.moveTo(140, 36);
      g.lineTo(36, 220);
      g.lineTo(230, 214);
      g.closePath();
      g.fill();
      g.fillStyle = shade('#c4b49a', 0.15);
      g.beginPath();
      g.moveTo(140, 36);
      g.lineTo(230, 214);
      g.lineTo(168, 214);
      g.lineTo(140, 90);
      g.closePath();
      g.fill();
      g.fillStyle = '#4a3428';
      g.beginPath();
      g.moveTo(140, 120);
      g.lineTo(112, 220);
      g.lineTo(164, 216);
      g.closePath();
      g.fill();
    } else if (i === 5) {
      isoBox(g, 36, 230, 14, 90, 12, '#7a5434', '#4a321e', '#c49a68');
      isoBox(g, 196, 226, 14, 90, 12, '#7a5434', '#4a321e', '#c49a68');
      g.strokeStyle = '#8d6840';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(48, 160);
      g.lineTo(200, 156);
      g.moveTo(48, 188);
      g.lineTo(200, 184);
      g.stroke();
    } else if (i === 7) {
      isoBox(g, 78, 228, 70, 90, 48, '#a07444', '#6a4c30', '#d2b48a');
      g.fillStyle = '#d5dde4';
      g.fillRect(78, 168, 70, 8);
      g.fillRect(78, 198, 70, 8);
    } else if (i === 8) {
      isoBox(g, 118, 236, 16, 110, 12, '#5c4030', '#3a281c', '#8d6a48');
      sphere(g, 126, 108, 22, '#ffe6a8', '#f0c46a', '#c48a30');
    } else {
      isoBox(g, 70, 228, 110, 80, 50, '#a07848', '#6a4c30', '#d2b48c');
    }
    return c;
  }

  DL.HdDraw = {
    ground: ground,
    heroSheet: heroSheet,
    npc: npc,
    mob: mob,
    house: house,
    rock: rock,
    caveMouth: caveMouth,
    flora: flora,
    townProp: townProp,
  };
})(typeof window !== 'undefined' ? window : globalThis);
