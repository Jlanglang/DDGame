/* 豆豆海岛幻想 · 3D 视图的斜视立牌
   画的是 45° 能看见顶面和侧面的体积，不是正视图几何块。
   平面版仍用原来的像素图。不投影、不挡人。
*/
import { DL } from './namespace.js';
const global = globalThis;

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

  /* 画内透视（2026-10-30）：立牌会绕底边后仰 21°（`render-three` 的 `TILT=0.6`），
     所以"看板子"的有效俯角是 55° − 21° = 34°，偏航跟相机一样是 0°。
     以前这里硬写 `dx = 0.62d / dy = 0.36d`，等于俯角 35° + **偏航 45°**——
     偏航差 45° 才是"纸片感"的根：玩家明明从正南看，画里却露着右侧面。
     两个系数就是世界深度向量投到屏幕的 (x, y)：`dx = d·sin(yaw)`、`dy = d·cos(yaw)·sin(pitch)`。
     `?art=old` 可切回旧画法做对照（只在 hd-draw 重画时生效，纹理有缓存）。 */
  const ART_OLD = /[?&]art=old/.test((globalThis.location && globalThis.location.search) || '');
  const ART_YAW = 0;          // 必须跟 render-three 的 CAM.yaw 一致（mir = 0）
  const ART_PITCH = 34;       // = 相机 55° − 立牌后仰 21°；改 TILT 就要跟着改
  const ART_COSY = Math.cos(ART_YAW * Math.PI / 180);
  const ART_DX = ART_OLD ? 0.62 : Math.sin(ART_YAW * Math.PI / 180);
  const ART_DY = ART_OLD ? 0.36 : ART_COSY * Math.sin(ART_PITCH * Math.PI / 180);

  function isoBox(g, x, y, w, h, d, front, side, top) {
    const dx = d * ART_DX;
    const dy = d * ART_DY;
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
    const dx = d * ART_DX;
    const dy = d * ART_DY;
    const mid = x + w * 0.5;
    if (dx < 0.5) {
      // 偏航 0：右侧面正好侧对相机、看不见。屋顶的进深改用"整块三角往上挪 dy"表现，
      // 先画深色那块、再把正面三角盖上去，边缘就自然露出一圈厚度。
      g.fillStyle = roofSide;
      g.beginPath();
      g.moveTo(x - 12, y + 4 - dy);
      g.lineTo(mid, y - rise - dy);
      g.lineTo(x + w + 8, y + 2 - dy);
      g.closePath();
      g.fill();
    } else {
      g.fillStyle = roofSide;
      g.beginPath();
      g.moveTo(x + w + 8, y + 2);
      g.lineTo(mid, y - rise);
      g.lineTo(mid + dx * 0.85, y - rise - dy * 0.45);
      g.lineTo(x + w + dx, y - dy);
      g.closePath();
      g.fill();
    }
    g.fillStyle = roof;
    g.beginPath();
    g.moveTo(x - 12, y + 4);
    g.lineTo(mid, y - rise);
    g.lineTo(x + w + 8, y + 2);
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

  /* 攻击可读：短木棍玩具剑（圆润小，不是细银线） */
  function sword(g, x, y, face, pose) {
    g.save();
    const handX = face === 'left' ? -18 : face === 'right' ? 18 : 16;
    g.translate(x + handX, y - 38);
    let ang = face === 'left' ? Math.PI + 0.35 : -0.55;
    if (pose === 'high') ang = face === 'left' ? Math.PI + 1.15 : -1.2;
    if (pose === 'out') ang = face === 'left' ? Math.PI + 0.1 : -0.25;
    g.rotate(ang);
    g.fillStyle = '#e8c878';
    g.beginPath();
    g.moveTo(2, -3.5);
    g.lineTo(26, -3.5);
    g.quadraticCurveTo(30, -3.5, 30, 0);
    g.quadraticCurveTo(30, 3.5, 26, 3.5);
    g.lineTo(2, 3.5);
    g.quadraticCurveTo(-1, 3.5, -1, 0);
    g.quadraticCurveTo(-1, -3.5, 2, -3.5);
    g.closePath();
    g.fill();
    g.fillStyle = '#c89850';
    g.fillRect(-4, -5, 8, 10);
    g.fillStyle = '#f0d090';
    g.beginPath();
    g.arc(28, 0, 4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /* 豆豆：2 头身小女孩（角色设定唯一判据），不是红披风豆子 */
  function bean(g, x, y, o) {
    y += o.bob || 0;
    const face = o.face || 'front';
    const side = face === 'left' ? -1 : face === 'right' ? 1 : 0;
    const tunic = o.tunic || '#2f6b4a';
    const hair = o.hair || '#6b4228';
    const skin = '#f3d2b0';
    // 全高约 96px，头半径 ~24 → 头身 ≈ 2
    const footY = y;
    const headR = 24;
    const headCy = footY - 72;
    const bodyCy = footY - 30;
    contact(g, x, footY + 2, 22, 6);

    // 腿 + 鞋
    g.fillStyle = shade(tunic, 0.15);
    g.beginPath();
    g.ellipse(x - 8 + side * 2, footY - 14, 7, 12, 0.1, 0, Math.PI * 2);
    g.ellipse(x + 8 + side * 2, footY - 14, 7, 12, -0.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f7f2ea';
    g.beginPath();
    g.ellipse(x - 8 + side * 2, footY - 3, 8, 4, 0, 0, Math.PI * 2);
    g.ellipse(x + 8 + side * 2, footY - 3, 8, 4, 0, 0, Math.PI * 2);
    g.fill();

    // 躯干（短袖）
    const bodyGrd = g.createLinearGradient(x - 18, bodyCy - 22, x + 18, bodyCy + 18);
    bodyGrd.addColorStop(0, mix(tunic, 0.18));
    bodyGrd.addColorStop(0.55, tunic);
    bodyGrd.addColorStop(1, shade(tunic, 0.22));
    g.fillStyle = bodyGrd;
    g.beginPath();
    g.ellipse(x + side * 2, bodyCy, 18, 20, 0, 0, Math.PI * 2);
    g.fill();

    // 白袖口
    g.fillStyle = '#fff8f0';
    g.beginPath();
    g.ellipse(x - 16 + side * 3, bodyCy - 4, 6, 5, 0, 0, Math.PI * 2);
    g.ellipse(x + 16 + side * 3, bodyCy - 4, 6, 5, 0, 0, Math.PI * 2);
    g.fill();

    // 彼得潘白领
    g.fillStyle = '#fffaf4';
    g.beginPath();
    g.moveTo(x + side * 2, bodyCy - 16);
    g.quadraticCurveTo(x - 12 + side * 2, bodyCy - 6, x - 4 + side * 2, bodyCy - 2);
    g.quadraticCurveTo(x + side * 2, bodyCy - 8, x + 4 + side * 2, bodyCy - 2);
    g.quadraticCurveTo(x + 12 + side * 2, bodyCy - 6, x + side * 2, bodyCy - 16);
    g.closePath();
    g.fill();

    if (o.prop === 'apron') {
      g.fillStyle = '#f7f1e4';
      g.beginPath();
      g.ellipse(x + side * 2, bodyCy + 4, 12, 14, 0, 0, Math.PI * 2);
      g.fill();
    }

    // 后发（背面整团；正面/侧面垫在头下）
    g.fillStyle = shade(hair, face === 'back' ? 0.05 : 0.12);
    g.beginPath();
    g.ellipse(x + side * 2, headCy + 4, headR + 6, headR + 2, 0, 0, Math.PI * 2);
    g.fill();
    // 发尾外翻两瓣
    g.beginPath();
    g.ellipse(x - 18 + side * 2, headCy + 14, 10, 12, -0.35, 0, Math.PI * 2);
    g.ellipse(x + 18 + side * 2, headCy + 14, 10, 12, 0.35, 0, Math.PI * 2);
    g.fill();

    // 头
    sphere(g, x + side * 3, headCy, headR, mix(skin, 0.35), skin, shade('#e2b88a', 0.05));

    if (face === 'back') {
      g.fillStyle = hair;
      g.beginPath();
      g.ellipse(x + side * 2, headCy - 2, headR + 2, headR + 4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = mix(hair, 0.12);
      g.beginPath();
      g.ellipse(x - 10, headCy + 10, 8, 10, -0.3, 0, Math.PI * 2);
      g.ellipse(x + 10, headCy + 10, 8, 10, 0.3, 0, Math.PI * 2);
      g.fill();
    } else {
      const ex = side * 5;
      // 八字刘海
      g.fillStyle = hair;
      g.beginPath();
      g.ellipse(x - 10 + ex, headCy - 10, 11, 10, -0.2, 0, Math.PI * 2);
      g.ellipse(x + 10 + ex, headCy - 10, 11, 10, 0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = shade(hair, 0.15);
      g.beginPath();
      g.moveTo(x + ex, headCy - 22);
      g.quadraticCurveTo(x - 2 + ex, headCy - 6, x + ex, headCy + 2);
      g.quadraticCurveTo(x + 2 + ex, headCy - 6, x + ex, headCy - 22);
      g.fill();
      // 大棕瞳 + 粗上眼线
      const eyeY = headCy - 2;
      g.fillStyle = '#3a2418';
      g.beginPath();
      g.ellipse(x - 8 + ex, eyeY, 5.5, 6.5, 0, 0, Math.PI * 2);
      g.ellipse(x + 8 + ex, eyeY, 5.5, 6.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6b3a1e';
      g.beginPath();
      g.ellipse(x - 8 + ex, eyeY, 3.2, 3.8, 0, 0, Math.PI * 2);
      g.ellipse(x + 8 + ex, eyeY, 3.2, 3.8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x - 9.5 + ex, eyeY - 2, 1.6, 0, Math.PI * 2);
      g.arc(x + 6.5 + ex, eyeY - 2, 1.6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2a1810';
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x - 13 + ex, eyeY - 5);
      g.quadraticCurveTo(x - 8 + ex, eyeY - 8, x - 3 + ex, eyeY - 5);
      g.moveTo(x + 3 + ex, eyeY - 5);
      g.quadraticCurveTo(x + 8 + ex, eyeY - 8, x + 13 + ex, eyeY - 5);
      g.stroke();
      // 腮红 + 小笑
      g.fillStyle = 'rgba(232, 120, 130, 0.45)';
      g.beginPath();
      g.ellipse(x - 14 + ex, eyeY + 10, 5, 3, 0, 0, Math.PI * 2);
      g.ellipse(x + 14 + ex, eyeY + 10, 5, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#c87870';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x + ex, eyeY + 12, 5, 0.15, Math.PI - 0.15);
      g.stroke();
    }

    if (o.hat) {
      g.fillStyle = shade(o.hat, 0.15);
      g.beginPath();
      g.ellipse(x + side * 2, headCy - headR + 4, 22, 6, 0, 0, Math.PI * 2);
      g.fill();
      sphere(g, x + side * 2, headCy - headR - 6, 11, mix(o.hat, 0.2), o.hat, shade(o.hat, 0.25));
    }
    if (o.prop === 'book') {
      g.fillStyle = '#5a8ae0';
      g.beginPath();
      g.moveTo(x + 10, bodyCy - 4);
      g.lineTo(x + 24, bodyCy);
      g.lineTo(x + 22, bodyCy + 12);
      g.lineTo(x + 8, bodyCy + 8);
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
          tunic: '#2f6b4a',
          hair: '#6b4228',
          sword: poses[col].sword,
          bob: poses[col].bob,
        });
      }
    }
    bean(g, 2 * cell + cell / 2, 4 * cell + 150, {
      face: 'front', tunic: '#2f6b4a', hair: '#6b4228', sword: 'rest', bob: 16,
    });
    return c;
  }

  const NPC = [
    { tunic: '#3d8a5c', hair: '#6b4228', prop: 'apron' },
    { tunic: '#3d5c86', hair: '#4a3428', hat: '#2c3f66' },
    { tunic: '#6a4a86', hair: '#5a3828', prop: 'book' },
    { tunic: '#c87840', hair: '#6b4228', hat: '#e8c878' },
  ];

  function npc(i) {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 220;
    const g = c.getContext('2d');
    const o = NPC[i] || NPC[0];
    bean(g, 110, 206, {
      face: 'front',
      tunic: o.tunic,
      hair: o.hair,
      hat: o.hat,
      prop: o.prop,
      sword: 'none',
    });
    return c;
  }

  function mob(id, frame) {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 220;
    const g = c.getContext('2d');
    const bob = frame ? -5 : 2;
    if (id === 'chicken') drawChicken(g, bob);
    else if (id === 'scarecrow') drawScarecrow(g, bob);
    else if (id === 'dog') drawDog(g, bob);
    else if (id === 'boar') drawBoar(g, bob);
    else return null;
    return trim(c, 20, 20, 160, 190);
  }

  function drawChicken(g, bob) {
    const y = bob;
    g.strokeStyle = '#c47838';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(78, 148 + y);
    g.lineTo(72, 178);
    g.moveTo(102, 150 + y);
    g.lineTo(110, 178);
    g.stroke();
    g.fillStyle = '#e8a048';
    g.beginPath();
    g.moveTo(68, 178); g.lineTo(78, 178); g.lineTo(72, 186); g.fill();
    g.beginPath();
    g.moveTo(106, 178); g.lineTo(116, 178); g.lineTo(112, 186); g.fill();
    sphere(g, 90, 128 + y, 32, '#fff8ec', '#f0dfc4', '#c8a888');
    sphere(g, 68, 120 + y, 14, '#ffe8c8', '#e8c89a', '#b89068');
    sphere(g, 118, 108 + y, 18, '#fffaf0', '#f4e6cc', '#d0b898');
    g.fillStyle = '#d44838';
    g.beginPath();
    g.moveTo(118, 88 + y);
    g.quadraticCurveTo(112, 78 + y, 118, 72 + y);
    g.quadraticCurveTo(124, 78 + y, 122, 88 + y);
    g.quadraticCurveTo(130, 80 + y, 128, 92 + y);
    g.closePath();
    g.fill();
    g.fillStyle = '#f0b040';
    g.beginPath();
    g.moveTo(134, 108 + y);
    g.lineTo(154, 112 + y);
    g.lineTo(134, 120 + y);
    g.closePath();
    g.fill();
    g.fillStyle = '#2a2118';
    g.beginPath();
    g.arc(124, 106 + y, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.arc(86, 116 + y, 6, 0, Math.PI * 2);
    g.fill();
  }

  function drawScarecrow(g, bob) {
    const y = bob;
    g.strokeStyle = '#6a4428';
    g.lineWidth = 10;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(100, 78 + y);
    g.lineTo(100, 186);
    g.moveTo(48, 108 + y);
    g.lineTo(152, 104 + y);
    g.stroke();
    g.strokeStyle = '#c4a050';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(52, 112 + y); g.lineTo(40, 138 + y);
    g.moveTo(58, 110 + y); g.lineTo(48, 142 + y);
    g.moveTo(148, 108 + y); g.lineTo(160, 132 + y);
    g.moveTo(142, 106 + y); g.lineTo(154, 136 + y);
    g.stroke();
    g.fillStyle = '#7a5a38';
    g.fillRect(72, 118 + y, 56, 48);
    g.fillStyle = '#9a7048';
    g.fillRect(76, 122 + y, 48, 18);
    sphere(g, 100, 68 + y, 24, '#f4e0a8', '#d8b868', '#9a7840');
    g.fillStyle = '#5c4030';
    g.beginPath();
    g.ellipse(100, 50 + y, 28, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(100, 40 + y, 14, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2118';
    g.beginPath();
    g.arc(92, 68 + y, 2.2, 0, Math.PI * 2);
    g.arc(110, 68 + y, 2.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8a5030';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(100, 76 + y, 6, 0.15, Math.PI - 0.15);
    g.stroke();
  }

  function drawDog(g, bob) {
    const y = bob;
    g.strokeStyle = '#6e4528';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(70, 150 + y); g.lineTo(62, 182);
    g.moveTo(90, 152 + y); g.lineTo(88, 184);
    g.moveTo(118, 152 + y); g.lineTo(122, 184);
    g.moveTo(136, 148 + y); g.lineTo(148, 180);
    g.stroke();
    sphere(g, 104, 128 + y, 38, '#d4a06a', '#a86c40', '#5c3a22');
    sphere(g, 148, 112 + y, 18, '#e0b078', '#b87848', '#6e4528');
    g.fillStyle = '#5c3a22';
    g.beginPath();
    g.ellipse(138, 94 + y, 7, 14, -0.35, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(156, 96 + y, 6, 12, 0.25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2118';
    g.beginPath();
    g.arc(154, 110 + y, 2.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8d5a32';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(70, 120 + y);
    g.quadraticCurveTo(40, 108, 32, 88);
    g.stroke();
    g.fillStyle = 'rgba(255,230,190,0.35)';
    g.beginPath();
    g.ellipse(92, 116 + y, 12, 10, -0.3, 0, Math.PI * 2);
    g.fill();
  }

  function drawBoar(g, bob) {
    const y = bob;
    g.strokeStyle = '#4a342c';
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(64, 148 + y); g.lineTo(56, 182);
    g.moveTo(88, 152 + y); g.lineTo(84, 184);
    g.moveTo(120, 152 + y); g.lineTo(126, 184);
    g.moveTo(142, 148 + y); g.lineTo(152, 180);
    g.stroke();
    sphere(g, 96, 126 + y, 42, '#b89078', '#7a5c4c', '#3e2e28');
    sphere(g, 148, 118 + y, 20, '#c4a088', '#8a6a58', '#4a342c');
    g.fillStyle = '#e8d4bc';
    g.beginPath();
    g.ellipse(164, 124 + y, 10, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f4efe6';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(154, 132 + y); g.quadraticCurveTo(168, 142 + y, 172, 150 + y);
    g.moveTo(156, 118 + y); g.quadraticCurveTo(170, 112 + y, 176, 104 + y);
    g.stroke();
    g.fillStyle = '#2a2118';
    g.beginPath();
    g.arc(152, 112 + y, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5c4030';
    g.beginPath();
    g.ellipse(78, 100 + y, 8, 12, -0.4, 0, Math.PI * 2);
    g.fill();
  }

  // 按内容外框裁画布：立牌高度按图像比例算，留白会直接变成「变小」
  function trim(c, x, y, w, h) {
    const t = document.createElement('canvas');
    t.width = w;
    t.height = h;
    t.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h);
    return t;
  }

  /* 主城建筑立牌成片（2026-11-11）：Q 版矮胖、左上光、无脚下影（影归引擎）。
     kind: shop 杂货 / book 技能书 / chief 村长 / stash 仓库 */
  function house(kind) {
    const c = document.createElement('canvas');
    c.width = 440;
    c.height = 500;
    const g = c.getContext('2d');
    const k = kind || 'shop';
    const wall = k === 'stash' ? '#d8c49a' : k === 'chief' ? '#f6e6c8' : '#f3e6d0';
    const roof = k === 'shop' ? '#c45a48' : k === 'book' ? '#4a6ea4' : k === 'chief' ? '#d4a85a' : '#7a5a38';
    const trimC = k === 'book' ? '#3a5680' : k === 'chief' ? '#b88840' : '#8d4a38';
    // 矮胖：墙矮、面宽、屋顶大——童话店面，不是写实楼
    const x = 88;
    const foot = 455;
    const w = 200;
    const h = 128;
    const d = 70;
    const roofRise = 92;

    // 台基：把屋身从地砖上托起来
    g.fillStyle = shade('#c4a882', 0.12);
    g.fillRect(x - 8, foot - 14, w + 16, 18);
    g.fillStyle = shade('#a88860', 0.18);
    g.fillRect(x - 8, foot - 4, w + 16, 8);

    isoBox(g, x, foot - 14, w, h, d, wall, shade(wall, 0.26), mix(wall, 0.22));

    // 墙面浅纹：横木筋，远看有材质
    g.strokeStyle = 'rgba(120, 88, 52, 0.14)';
    g.lineWidth = 2;
    for (let i = 1; i <= 4; i++) {
      const ly = foot - 14 - (h * i) / 5;
      g.beginPath();
      g.moveTo(x + 6, ly);
      g.lineTo(x + w - 6, ly);
      g.stroke();
    }

    // 门（偏右一点，留窗）
    const doorW = 44;
    const doorH = 78;
    const doorX = x + 108;
    g.fillStyle = shade('#6a4428', 0.1);
    g.fillRect(doorX - 4, foot - 14 - doorH - 4, doorW + 8, doorH + 6);
    g.fillStyle = '#5c3a22';
    g.fillRect(doorX, foot - 14 - doorH, doorW, doorH);
    g.fillStyle = 'rgba(255, 200, 120, 0.42)';
    g.fillRect(doorX + 6, foot - 14 - doorH + 8, doorW - 12, doorH - 18);
    g.fillStyle = '#e8c478';
    g.beginPath();
    g.arc(doorX + doorW - 10, foot - 14 - doorH / 2, 3.5, 0, Math.PI * 2);
    g.fill();

    // 窗：左上暖光 + 十字棂
    const wx = x + 28;
    const wy = foot - 14 - 96;
    g.fillStyle = shade('#6a4c30', 0.05);
    g.fillRect(wx - 4, wy - 4, 44, 40);
    g.fillStyle = 'rgba(255, 220, 150, 0.88)';
    g.fillRect(wx, wy, 36, 32);
    g.strokeStyle = 'rgba(70, 48, 28, 0.55)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(wx + 18, wy);
    g.lineTo(wx + 18, wy + 32);
    g.moveTo(wx, wy + 16);
    g.lineTo(wx + 36, wy + 16);
    g.stroke();

    // 花箱：窗下一点绿，破开墙面单调
    g.fillStyle = '#8d6438';
    g.fillRect(wx - 2, wy + 32, 40, 10);
    for (let i = 0; i < 5; i++) {
      sphere(g, wx + 6 + i * 7, wy + 30, 5 + (i % 2), '#9ed070', '#68a848', '#346828');
    }

    gable(g, x - 14, foot - 14 - h + 10, w + 28, roofRise, d, roof, shade(roof, 0.24));

    // 瓦垄：沿屋面几道弧线，别一整块三角板
    g.strokeStyle = 'rgba(40, 20, 12, 0.22)';
    g.lineWidth = 2;
    const mid = x + w * 0.5;
    const ridgeY = foot - 14 - h + 10 - roofRise;
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      const ly = (foot - 14 - h + 14) * (1 - t) + ridgeY * t + 6;
      const half = (w * 0.5 + 18) * (1 - t * 0.9);
      g.beginPath();
      g.moveTo(mid - half, ly);
      g.quadraticCurveTo(mid, ly - 3, mid + half * 0.85, ly + 1);
      g.stroke();
    }

    // 烟囱（村长 / 仓库更像住家）
    if (k === 'chief' || k === 'stash') {
      const cx = x + (k === 'stash' ? 28 : w - 36);
      isoBox(g, cx, ridgeY + 50, 28, 56, 18, shade(wall, 0.08), shade(wall, 0.32), mix(wall, 0.1));
      g.fillStyle = shade(roof, 0.1);
      g.fillRect(cx - 4, ridgeY - 8, 36, 12);
    }

    // 店招 / 篷布
    if (k === 'shop' || k === 'book') {
      const awn = k === 'book' ? '#e8eef6' : '#f7f0e4';
      const stripe = k === 'book' ? trimC : roof;
      g.fillStyle = awn;
      g.beginPath();
      g.moveTo(x - 10, foot - 14 - h + 28);
      g.lineTo(x + w + 14, foot - 14 - h + 32);
      g.lineTo(x + w + 6, foot - 14 - h + 78);
      g.lineTo(x + 2, foot - 14 - h + 72);
      g.closePath();
      g.fill();
      g.fillStyle = stripe;
      for (let i = 0; i < 6; i++) {
        g.fillRect(x + 6 + i * 34, foot - 14 - h + 36, 16, 34);
      }
      // 招牌木板
      g.fillStyle = '#6a4a2c';
      g.fillRect(x + 58, foot - 14 - h + 8, 78, 26);
      g.fillStyle = '#f4e6c8';
      g.font = 'bold 15px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(k === 'book' ? '技能' : '杂货', x + 97, foot - 14 - h + 21);
    }

    if (k === 'chief') {
      // 门楣小旗：认出村长屋
      g.fillStyle = '#e87050';
      g.beginPath();
      g.moveTo(doorX + 8, foot - 14 - doorH - 28);
      g.lineTo(doorX + 36, foot - 14 - doorH - 18);
      g.lineTo(doorX + 8, foot - 14 - doorH - 8);
      g.closePath();
      g.fill();
      g.strokeStyle = '#5c4030';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(doorX + 8, foot - 14 - doorH - 30);
      g.lineTo(doorX + 8, foot - 14 - doorH - 4);
      g.stroke();
    }

    if (k === 'stash') {
      isoBox(g, x - 14, foot - 10, 42, 52, 30, '#9a7044', '#5c4024', '#d2b48a');
      isoBox(g, x + w - 8, foot - 8, 36, 44, 26, '#a07848', '#6a4c30', '#e0c49a');
      g.fillStyle = '#c4a06a';
      g.fillRect(x - 6, foot - 48, 26, 6);
      g.fillRect(x + w, foot - 42, 22, 6);
    }

    // 屋檐描边，剪影更清楚
    g.strokeStyle = 'rgba(60, 36, 20, 0.28)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - 14, foot - 14 - h + 14);
    g.lineTo(mid, ridgeY);
    g.lineTo(x + w + 14, foot - 14 - h + 12);
    g.stroke();

    return trim(c, 60, 48, 320, 420);
  }

  /* 椰子树：弯干 + 放射棕榈叶 + 椰子。画布裁到内容外框；影归引擎。 */
  const PALM = {
    trunk: ['#c49a62', '#8a6238', '#5a4024'],
    ring: 'rgba(74, 52, 30, 0.4)',
    leaf: ['#b4e878', '#6cbc48', '#3a7a28', '#2a5820'],
    nut: ['#b07840', '#5c3818'],
  };

  function palm(variant) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 480;
    const g = c.getContext('2d');
    const v = (variant | 0) % 3;
    const bx = 120 + v * 10;
    const ty = 128;
    const tx = bx + 40 + (v - 1) * 10;
    const at = function (t) {
      return {
        x: bx + (tx - bx) * t + Math.sin(t * Math.PI) * (14 + v * 2),
        y: 448 - (448 - ty) * t,
      };
    };
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const p0 = at(i / 6), p1 = at((i + 1) / 6);
      g.lineWidth = 28 - 16 * (i / 6);
      g.strokeStyle = i % 2 ? PALM.trunk[1] : PALM.trunk[0];
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
      g.stroke();
    }
    g.strokeStyle = PALM.ring;
    g.lineWidth = 2.5;
    for (let i = 1; i < 8; i++) {
      const t = i / 8;
      const p = at(t);
      const half = (28 - 16 * t) * 0.48;
      g.beginPath();
      g.moveTo(p.x - half, p.y);
      g.lineTo(p.x + half, p.y + 2);
      g.stroke();
    }
    const fronds = 9;
    for (let i = 0; i < fronds; i++) {
      const a = -Math.PI * 1.02 + (i / (fronds - 1)) * Math.PI * 1.05;
      const len = 100 + (i % 3) * 14;
      const midX = tx + Math.cos(a) * len * 0.52;
      const midY = ty + Math.sin(a) * len * 0.38 - 28;
      const ex = tx + Math.cos(a) * len;
      const ey = ty + Math.sin(a) * len * 0.48 + 36;
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo(midX, midY, ex, ey);
      g.quadraticCurveTo(midX + Math.sin(a) * 18, midY + 28, tx + 4, ty + 10);
      g.closePath();
      const lit = Math.cos(a) < -0.1;
      g.fillStyle = lit ? PALM.leaf[0] : (Math.cos(a) > 0.4 ? PALM.leaf[2] : PALM.leaf[1]);
      g.fill();
      g.strokeStyle = PALM.leaf[3];
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(tx, ty + 2);
      g.quadraticCurveTo(midX, midY + 10, ex, ey);
      g.stroke();
    }
    sphere(g, tx - 10, ty + 18, 12, PALM.nut[0], '#7a4c22', PALM.nut[1]);
    sphere(g, tx + 14, ty + 24, 10, PALM.nut[0], '#7a4c22', PALM.nut[1]);
    sphere(g, tx + 2, ty + 28, 8, mix(PALM.nut[0], 0.15), '#7a4c22', PALM.nut[1]);
    return trim(c, 40, 48, 250, 420);
  }

  /* 海边渔屋（2026-10-30 v2）：沙滩上的一栋矮脚小屋。
     比例按「人」重算：人 2.15，屋脊 3.9（≈1.8 人），门洞 2.1（≈1 人高，
     正好比人高一头），屋顶占全高约三成。v1 的问题是门只有 0.8 格高、画布又留白，
     所以人站旁边像个狗屋——现在门加高、画布裁到内容外框。 */
  const HUT = {
    wall: '#e6d3aa',
    wood: '#a9784a',
    roof: '#8a6a3a',
    post: ['#8d6438', '#5c4024', '#c4a06a'],
  };

  function beachHut(variant) {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 390;
    const g = c.getContext('2d');
    const v = (variant | 0) % 3;
    // 偏航 0 之后看不见右侧面，屋身只能靠"墙 + 顶"读体积，所以墙加高、屋顶压扁：
    // 墙 240 / 屋顶 46 + 进深 29 —— 门占全高约 58%，站在门口正好比人高一点。
    const x = 70, w = 160, d = 52, foot = 356, h = 240;
    const dx = d * ART_DX, dy = d * ART_DY;
    contact(g, 170, 384, 96, 12);

    // 桩：比屋身窄、往沙里扎一截。有脚才像海边的屋，不然像直接埋在沙里
    const posts = [
      [x + 12, 384], [x + w - 26, 384],
      [x + 12 + dx, 384 - dy], [x + w - 26 + dx, 384 - dy],
    ];
    for (let i = 0; i < posts.length; i++) {
      isoBox(g, posts[i][0], posts[i][1], 14, 26, 8, HUT.post[0], HUT.post[1], HUT.post[2]);
    }

    isoBox(g, x, foot, w, h, d, HUT.wall, shade(HUT.wall, 0.30), mix(HUT.wall, 0.26));
    // 墙脚一圈深色＝潮气，把屋身和沙面分开
    g.fillStyle = 'rgba(74, 52, 30, 0.22)';
    g.fillRect(x, foot - 18, w, 18);

    gable(g, x - 6, foot - h + 4, w + 12, 46, d, HUT.roof, shade(HUT.roof, 0.26));
    // 草顶散边：沿屋檐挑几撮，别让它像一块光滑的三角板
    g.strokeStyle = shade(HUT.roof, 0.16);
    g.lineWidth = 2;
    for (let i = 0; i < 15; i++) {
      const ex = x - 4 + i * 12;
      g.beginPath();
      g.moveTo(ex, foot - h + 6);
      g.lineTo(ex + (v ? 3 : -3), foot - h + 20);
      g.stroke();
    }

    // 门：200px ≈ 2.4 格（比人 2.15 高一头），往里凹一格、透暖光
    g.fillStyle = shade(HUT.wood, 0.45);
    g.fillRect(x + 50, foot - 206, 60, 206);
    g.fillStyle = '#3a2818';
    g.fillRect(x + 54, foot - 200, 52, 200);
    g.fillStyle = 'rgba(255, 196, 110, 0.55)';
    g.fillRect(x + 60, foot - 190, 40, 150);

    // 窗：门左边一扇，暖光。小屏上就是两个亮点，够认出"屋里有人"
    g.fillStyle = '#6a4c30';
    g.fillRect(x + 12, foot - 236, 34, 30);
    g.fillStyle = 'rgba(255, 214, 140, 0.78)';
    g.fillRect(x + 16, foot - 232, 26, 22);

    // 渔网：从屋檐垂下来挂在右半边，两向斜线交叉；两颗浮标给"渔"的识别
    g.strokeStyle = 'rgba(236, 230, 208, 0.8)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(x + 118 + i * 10, foot - h + 14);
      g.lineTo(x + 106 + i * 10, foot - 10);
      g.stroke();
      g.beginPath();
      g.moveTo(x + 106 + i * 10, foot - 10);
      g.lineTo(x + 122 + i * 10, foot - 30);
      g.stroke();
    }
    sphere(g, x + 126, foot - h + 34, 9, '#ffb27a', '#e07028', '#a33a18');
    sphere(g, x + 150, foot - h + 52, 7, '#ffb27a', '#e07028', '#a33a18');

    // 偏航 0 之后屋顶往上多出 dy 一截，裁框跟着放宽（见 gable 的说明）
    return trim(c, 52, 40, 192, 346);
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
    const kind = i % 4;
    const trunk = g.createLinearGradient(128, 160, 156, 330);
    trunk.addColorStop(0, '#c49a62');
    trunk.addColorStop(1, '#5c3c22');
    g.fillStyle = trunk;
    g.beginPath();
    g.moveTo(132, 200);
    g.lineTo(156, 200);
    g.lineTo(150, 330);
    g.lineTo(128, 330);
    g.closePath();
    g.fill();
    if (kind === 3) {
      // 枯枝：几根弯杈
      g.strokeStyle = '#6b4e32';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(140, 320);
      g.quadraticCurveTo(136, 180, 128, 70);
      g.moveTo(136, 190);
      g.quadraticCurveTo(90, 140, 58, 100);
      g.moveTo(142, 160);
      g.quadraticCurveTo(190, 110, 228, 72);
      g.stroke();
      return trim(c, 40, 50, 200, 290);
    }
    if (kind === 2) {
      // 尖冠：两层三角，童话松树感
      g.fillStyle = '#2f6a34';
      g.beginPath();
      g.moveTo(140, 40);
      g.lineTo(48, 210);
      g.lineTo(232, 210);
      g.closePath();
      g.fill();
      g.fillStyle = '#4a9a48';
      g.beginPath();
      g.moveTo(140, 90);
      g.lineTo(78, 200);
      g.lineTo(202, 200);
      g.closePath();
      g.fill();
      g.fillStyle = '#8ed068';
      g.beginPath();
      g.moveTo(140, 70);
      g.lineTo(108, 140);
      g.lineTo(172, 140);
      g.closePath();
      g.fill();
      return trim(c, 40, 30, 200, 310);
    }
    const puffs = kind === 0
      ? [
        [140, 150, 72, '#9ed070', '#4c8c40', '#244820'],
        [86, 176, 48, '#7cbc58', '#3e7a34', '#1e401c'],
        [198, 168, 52, '#68a848', '#346828', '#163216'],
        [140, 96, 46, '#b4e878', '#68a848', '#2a5820'],
        [108, 120, 34, '#8ec868', '#4c8c40', '#244820'],
        [172, 124, 32, '#a6de78', '#568c48', '#2a4c24'],
      ]
      : [
        [140, 160, 64, '#8ec868', '#3e7a34', '#1e401c'],
        [96, 180, 42, '#6cbc48', '#346828', '#163216'],
        [186, 174, 44, '#7cbc58', '#3a6e30', '#1a3818'],
        [140, 110, 40, '#a6de78', '#4c8c40', '#244820'],
      ];
    for (let k = 0; k < puffs.length; k++) {
      const p = puffs[k];
      sphere(g, p[0], p[1], p[2], p[3], p[4], p[5]);
    }
    return trim(c, 40, 50, 200, 290);
  }

  function townProp(i) {
    const c = document.createElement('canvas');
    c.width = 280;
    c.height = 260;
    const g = c.getContext('2d');
    contact(g, 130, 236, 70, 12);
    if (i === 0 || i === 1) {
      // 摊位成片：木台 + 条纹篷 + 台面货（远看三个色点够认）
      isoBox(g, 40, 230, 150, 70, 54, '#9a6840', '#5c3c22', '#d4a878');
      g.fillStyle = i === 0 ? '#f7f2e8' : '#e8eef6';
      g.beginPath();
      g.moveTo(28, 168);
      g.lineTo(214, 176);
      g.lineTo(196, 118);
      g.lineTo(46, 112);
      g.closePath();
      g.fill();
      g.fillStyle = i === 0 ? '#c45a48' : '#4a6ea4';
      for (let k = 0; k < 5; k++) g.fillRect(52 + k * 30, 124, 14, 40);
      const goods = i === 0
        ? [['#e87050', 70], ['#f0c46a', 100], ['#68a848', 132]]
        : [['#f4efe6', 78], ['#7a9cc4', 110], ['#c4a15a', 140]];
      for (let k = 0; k < goods.length; k++) {
        sphere(g, goods[k][1], 198, 11, mix(goods[k][0], 0.25), goods[k][0], shade(goods[k][0], 0.35));
      }
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
    beachHut: beachHut,
    palm: palm,
  };
