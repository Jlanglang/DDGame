/* 主城 / 海岛环境 · 体积成片
   铺子、渔屋、摊井灯栅：同一套凹凸几何语言（门洞/窗框/檐口是实体，不走立牌）。
   DL.BuildHouse.make / prop / hut
*/
import { DL } from './namespace.js';

function hex(c) {
  if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const n = parseInt(String(c).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shadeHex(c, t) {
  const a = hex(c);
  return (Math.round(a[0] * (1 - t)) << 16) | (Math.round(a[1] * (1 - t)) << 8) | Math.round(a[2] * (1 - t));
}
function mixHex(c, t) {
  const a = hex(c);
  return (Math.round(a[0] + (255 - a[0]) * t) << 16) |
    (Math.round(a[1] + (255 - a[1]) * t) << 8) |
    Math.round(a[2] + (255 - a[2]) * t);
}
function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const PAL = {
  wood: 0xc89860,
  woodDk: 0x8a5a34,
  woodLt: 0xf0d2a0,
  cream: 0xfff6e8,
  stone: 0xe8dcc0,
  stoneDk: 0xc8b898,
  glass: 0xffe9b0,
  leaf: 0x8cc26a,
  leafHi: 0xb8e878,
  fire: 0xff8a50,
  iron: 0x8a8478,
  thatch: 0xf0b85a,
  thatchDk: 0xd89840,
};

const KINDS = {
  shop:  { wall: 0xfff6e8, roof: 0xf06058, trim: 0xd04840, awn: 0xf06058, awnBg: 0xfff8f0, sign: '杂货', chimney: false, crates: false, flag: false },
  book:  { wall: 0xf4f0ff, roof: 0x5a8ae0, trim: 0x4070c8, awn: 0x5a8ae0, awnBg: 0xeef2ff, sign: '技能', chimney: false, crates: false, flag: false },
  chief: { wall: 0xfff4d8, roof: 0xf0b84a, trim: 0xd09830, awn: 0, awnBg: 0, sign: '', chimney: true, crates: false, flag: true },
  stash: { wall: 0xf0e4c8, roof: 0x70b858, trim: 0x589440, awn: 0, awnBg: 0, sign: '', chimney: true, crates: true, flag: false },
};

function noiseTex(THREE, w, h, base, speck, n, seed) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const a = hex(base);
  g.fillStyle = 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')';
  g.fillRect(0, 0, w, h);
  const s = hex(speck);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.05 + hash(seed, i) * 0.1;
    g.fillStyle = 'rgb(' + s[0] + ',' + s[1] + ',' + s[2] + ')';
    g.fillRect(hash(seed + 1, i) * w, hash(seed + 2, i) * h, 1 + hash(seed + 3, i) * 3, 1 + hash(seed + 4, i) * 2);
  }
  g.globalAlpha = 1;
  // 淡横纹：木头感，但整面不会变成「一张立绘」
  g.strokeStyle = 'rgba(80,55,30,0.08)';
  g.lineWidth = 1;
  for (let y = 4; y < h; y += 6) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y + (hash(y, seed) - 0.5) * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  t.needsUpdate = true;
  return t;
}

function roofTex(THREE, col) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const a = hex(col);
  g.fillStyle = 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')';
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 10; row++) {
    const y = 6 + row * 12;
    g.strokeStyle = 'rgba(30,12,8,0.28)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y);
    g.quadraticCurveTo(64, y - 2, 128, y + 1);
    g.stroke();
    g.strokeStyle = 'rgba(255,220,180,0.1)';
    g.beginPath();
    g.moveTo(0, y + 3);
    g.lineTo(128, y + 4);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  t.needsUpdate = true;
  return t;
}

/* 抄 Cozy Isle / 暖低多边形：flatShading + 哑光 Standard，硬边才像成片 */
function matCol(THREE, color, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color: color, flatShading: true, roughness: 0.92, metalness: 0,
  }, extra || {}));
}
function matMap(THREE, map, side) {
  const m = new THREE.MeshStandardMaterial({
    map: map, flatShading: true, roughness: 0.9, metalness: 0,
  });
  if (side != null) m.side = side;
  return m;
}
function matGlow(THREE, color, emit) {
  return matCol(THREE, color, { emissive: emit || color, emissiveIntensity: 0.55 });
}

function box(THREE, root, mats, w, h, d, x, y, z, cast) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
  m.position.set(x, y, z);
  if (cast !== false) { m.castShadow = true; m.receiveShadow = true; }
  root.add(m);
  return m;
}

function addWindow(THREE, root, wood, woodDk, glass, leaf, x, y, z, faceZ) {
  const ww = 0.44, wh = 0.4;
  const out = faceZ ? 0.04 : 0.04;
  const zOut = faceZ ? z + out : z;
  const zIn = faceZ ? z - 0.03 : z;
  box(THREE, root, wood, ww + 0.1, wh + 0.1, 0.08, x, y, zOut);
  box(THREE, root, glass, ww, wh, 0.04, x, y, zIn);
  box(THREE, root, woodDk, 0.05, wh, 0.05, x, y, zOut, false);
  box(THREE, root, woodDk, ww, 0.05, 0.05, x, y, zOut, false);
  if (leaf) {
    box(THREE, root, wood, ww + 0.12, 0.1, 0.18, x, y - wh / 2 - 0.08, z + 0.12);
    box(THREE, root, matCol(THREE, PAL.leaf), 0.12, 0.12, 0.12, x - 0.12, y - wh / 2, z + 0.16, false);
    box(THREE, root, matCol(THREE, mixHex(PAL.leaf, 0.25)), 0.1, 0.14, 0.1, x + 0.05, y - wh / 2 + 0.02, z + 0.17, false);
  }
}

function makeGableEnds(THREE, root, mat, bw, bd, bh, base, rise) {
  // Low-Poly Town：山墙三角实体，屋顶才不像两片纸
  const shape = new THREE.Shape();
  shape.moveTo(-bd / 2, 0);
  shape.lineTo(bd / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  [-1, 1].forEach(function (side) {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(side * (bw / 2 - 0.06), base + bh, 0);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  });
}

function makeHouse(THREE, kind) {
  const k = (kind && KINDS[kind]) ? kind : 'shop';
  const spec = KINDS[k];
  // Coral/动森：更矮墙、更大顶、更宽檐——一眼是玩具屋不是写实房
  const bw = 2.3, bd = 1.95, bh = 1.25, base = 0.2, rise = 1.25, over = 0.42;

  const wallMat = matCol(THREE, spec.wall);
  const sideMat = matCol(THREE, shadeHex(spec.wall, 0.1));
  const roofMat = matMap(THREE, roofTex(THREE, spec.roof), THREE.DoubleSide);
  const wood = matCol(THREE, PAL.wood);
  const woodDk = matCol(THREE, PAL.woodDk);
  const stone = matCol(THREE, PAL.stone);
  const stoneDk = matCol(THREE, PAL.stoneDk);
  const glass = matCol(THREE, PAL.glass);
  const trim = matCol(THREE, spec.trim);

  const root = new THREE.Group();
  root.userData.volume = true;
  root.userData.kind = k;
  root.userData.frontPad = bd * 0.55;
  root.userData.shadowRx = bw * 0.6;
  root.userData.shadowRz = bd * 0.55;

  // ① 台基模块
  box(THREE, root, stone, bw + 0.28, base, bd + 0.28, 0, base / 2, 0);
  box(THREE, root, stoneDk, 0.85, 0.1, 0.35, 0.2, 0.05, bd / 2 + 0.18);
  box(THREE, root, stone, 0.95, 0.08, 0.28, 0.2, 0.14, bd / 2 + 0.12);

  // ② 墙块：整块实心 + 正面挖门（分片）
  const wallT = 0.14;
  const doorW = 0.55, doorH = 1.05;
  const leftW = (bw - doorW) * 0.42;
  const rightW = bw - leftW - doorW;
  box(THREE, root, sideMat, bw, bh, wallT, 0, base + bh / 2, -bd / 2 + wallT / 2);
  box(THREE, root, sideMat, wallT, bh, bd, -bw / 2 + wallT / 2, base + bh / 2, 0);
  box(THREE, root, sideMat, wallT, bh, bd, bw / 2 - wallT / 2, base + bh / 2, 0);
  box(THREE, root, wallMat, leftW, bh, wallT, -bw / 2 + leftW / 2, base + bh / 2, bd / 2 - wallT / 2);
  box(THREE, root, wallMat, rightW, bh, wallT, bw / 2 - rightW / 2, base + bh / 2, bd / 2 - wallT / 2);
  box(THREE, root, wallMat, doorW, bh - doorH, wallT, -bw / 2 + leftW + doorW / 2, base + doorH + (bh - doorH) / 2, bd / 2 - wallT / 2);

  // ③ 门框 + 退进门板
  const doorCx = -bw / 2 + leftW + doorW / 2;
  const doorZ = bd / 2 - wallT - 0.08;
  box(THREE, root, woodDk, doorW + 0.1, doorH + 0.08, 0.06, doorCx, base + doorH / 2, bd / 2 - wallT / 2);
  box(THREE, root, wood, doorW * 0.86, doorH * 0.9, 0.07, doorCx, base + doorH * 0.48, doorZ);
  box(THREE, root, woodDk, 0.04, doorH * 0.85, 0.04, doorCx, base + doorH * 0.48, doorZ + 0.02, false);
  box(THREE, root, matCol(THREE, 0xe8c478), 0.06, 0.06, 0.08, doorCx + doorW * 0.28, base + doorH * 0.48, doorZ + 0.05, false);

  // ④ 窗模块（正面花箱窗 + 右侧窗）
  addWindow(THREE, root, wood, woodDk, glass, true, -bw * 0.32, base + 0.95, bd / 2 - 0.02, true);
  box(THREE, root, wood, 0.1, 0.5, 0.52, bw / 2 + 0.04, base + 0.95, 0.05);
  box(THREE, root, glass, 0.05, 0.4, 0.42, bw / 2 + 0.02, base + 0.95, 0.05);
  box(THREE, root, woodDk, 0.06, 0.4, 0.05, bw / 2 + 0.05, base + 0.95, 0.05, false);
  box(THREE, root, woodDk, 0.06, 0.05, 0.42, bw / 2 + 0.05, base + 0.95, 0.05, false);

  // 转角木柱
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
    box(THREE, root, wood, 0.14, bh + 0.12, 0.14, s[0] * (bw / 2 - 0.02), base + (bh + 0.12) / 2, s[1] * (bd / 2 - 0.02));
  });

  // ⑤ 山墙 + 厚双坡
  makeGableEnds(THREE, root, sideMat, bw, bd, bh, base, rise);
  box(THREE, root, woodDk, bw + over * 2, 0.1, bd + over * 2, 0, base + bh + 0.04, 0);
  const slope = Math.atan2(rise, bd / 2 + over * 0.25);
  const slopeLen = Math.hypot(bd / 2 + over * 0.25, rise);
  [-1, 1].forEach(function (sgn) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(bw + over * 2.4, 0.14, slopeLen), roofMat);
    panel.rotation.x = sgn * slope;
    panel.position.set(0, base + bh + rise * 0.48, sgn * (bd / 2 + over * 0.12) * 0.52);
    panel.castShadow = true;
    panel.receiveShadow = true;
    root.add(panel);
  });
  box(THREE, root, trim, bw + over * 2.5, 0.12, 0.14, 0, base + bh + rise + 0.06, 0);

  // ⑥ 篷 / 旗 / 烟囱 / 箱
  if (spec.awn) {
    const awn = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.98, 0.07, 0.65), matCol(THREE, spec.awnBg));
    awn.rotation.x = -0.48;
    awn.position.set(0, base + bh * 0.82, bd / 2 + 0.35);
    awn.castShadow = true;
    root.add(awn);
    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.66), matCol(THREE, spec.awn));
      stripe.rotation.x = -0.48;
      stripe.position.set(-bw * 0.4 + i * 0.18, base + bh * 0.82, bd / 2 + 0.35);
      root.add(stripe);
    }
    box(THREE, root, woodDk, 0.85, 0.32, 0.08, 0, base + bh * 0.95, bd / 2 + 0.12);
  }
  if (spec.flag) {
    box(THREE, root, woodDk, 0.06, 0.55, 0.06, doorCx, base + doorH + 0.4, bd / 2 + 0.08, false);
    box(THREE, root, matCol(THREE, 0xe87050), 0.32, 0.2, 0.04, doorCx + 0.16, base + doorH + 0.55, bd / 2 + 0.08, false);
  }
  if (spec.chimney) {
    box(THREE, root, sideMat, 0.36, 0.85, 0.36, -bw * 0.3, base + bh + rise * 0.25, -bd * 0.15);
    box(THREE, root, trim, 0.44, 0.1, 0.44, -bw * 0.3, base + bh + rise * 0.25 + 0.45, -bd * 0.15);
  }
  if (spec.crates) {
    box(THREE, root, wood, 0.42, 0.38, 0.36, -bw * 0.58, base + 0.2, bd * 0.42);
    box(THREE, root, wood, 0.36, 0.3, 0.32, bw * 0.55, base + 0.16, bd * 0.4);
  }
  return root;
}

/* ---------- 城装：与房子同一套体积语言 ---------- */
function makeProp(THREE, index) {
  const i = index | 0;
  const root = new THREE.Group();
  root.userData.volume = true;
  const wood = matCol(THREE, PAL.wood);
  const woodDk = matCol(THREE, PAL.woodDk);
  const stone = matCol(THREE, PAL.stone);

  if (i === 0 || i === 1) {
    // 摊位：台面 + 四腿 + 斜篷（条纹几何）
    const cloth = matCol(THREE, i === 0 ? 0xc45a48 : 0x4a6ea4);
    const clothBg = matCol(THREE, i === 0 ? 0xf7f2e8 : 0xe8eef6);
    box(THREE, root, wood, 1.1, 0.1, 0.7, 0, 0.55, 0);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      box(THREE, root, woodDk, 0.08, 0.55, 0.08, s[0] * 0.45, 0.275, s[1] * 0.28);
    });
    // 货：三个小盒子
    box(THREE, root, matCol(THREE, i === 0 ? 0xe87050 : 0xf4efe6), 0.18, 0.16, 0.18, -0.28, 0.68, 0.05);
    box(THREE, root, matCol(THREE, i === 0 ? 0xf0c46a : 0x7a9cc4), 0.16, 0.2, 0.16, 0, 0.7, 0.08);
    box(THREE, root, matCol(THREE, i === 0 ? 0x68a848 : 0xc4a15a), 0.2, 0.14, 0.18, 0.28, 0.67, 0.02);
    // 篷
    const awn = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.04, 0.85), clothBg);
    awn.position.set(0, 1.15, 0);
    awn.rotation.x = -0.15;
    awn.castShadow = true;
    root.add(awn);
    for (let s = 0; s < 5; s++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.86), cloth);
      st.position.set(-0.48 + s * 0.24, 1.16, 0);
      st.rotation.x = -0.15;
      root.add(st);
    }
    box(THREE, root, woodDk, 0.07, 0.7, 0.07, -0.55, 0.9, -0.35);
    box(THREE, root, woodDk, 0.07, 0.7, 0.07, 0.55, 0.9, -0.35);
    box(THREE, root, woodDk, 0.07, 0.55, 0.07, -0.55, 0.82, 0.35);
    box(THREE, root, woodDk, 0.07, 0.55, 0.07, 0.55, 0.82, 0.35);
    root.userData.shadowRx = 0.7;
    root.userData.shadowRz = 0.5;
  } else if (i === 2) {
    // 篝火：石圈 + 木柴 + 火苗块
    box(THREE, root, stone, 0.7, 0.12, 0.7, 0, 0.06, 0);
    box(THREE, root, woodDk, 0.5, 0.1, 0.12, 0, 0.18, 0);
    box(THREE, root, wood, 0.12, 0.1, 0.5, 0, 0.22, 0);
    box(THREE, root, matCol(THREE, PAL.fire), 0.2, 0.35, 0.2, 0, 0.42, 0, false);
    box(THREE, root, matCol(THREE, 0xffd27a), 0.12, 0.22, 0.12, 0.05, 0.5, 0.02, false);
    root.userData.shadowRx = 0.45;
    root.userData.shadowRz = 0.45;
  } else if (i === 3) {
    // 水井：石筒 + 木架 + 小屋顶
    const well = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.55, 12), stone);
    well.position.y = 0.28;
    well.castShadow = true;
    well.receiveShadow = true;
    root.add(well);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12), matCol(THREE, 0x3e6e8e));
    water.position.y = 0.42;
    root.add(water);
    box(THREE, root, woodDk, 0.08, 0.9, 0.08, -0.4, 0.7, 0);
    box(THREE, root, woodDk, 0.08, 0.9, 0.08, 0.4, 0.7, 0);
    box(THREE, root, wood, 0.95, 0.08, 0.08, 0, 1.1, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.7), matCol(THREE, 0xc45a48));
    roof.position.set(0, 1.28, 0);
    roof.castShadow = true;
    root.add(roof);
    root.userData.shadowRx = 0.55;
    root.userData.shadowRz = 0.55;
  } else if (i === 4) {
    // 帐篷：三角篷布 + 木柱
    box(THREE, root, woodDk, 0.08, 1.4, 0.08, 0, 0.7, 0);
    const cloth = matCol(THREE, 0xd4a85a);
    const a = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.0), cloth);
    a.position.set(0, 1.05, 0);
    a.rotation.z = 0.55;
    a.castShadow = true;
    root.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.0), cloth);
    b.position.set(0, 1.05, 0);
    b.rotation.z = -0.55;
    b.castShadow = true;
    root.add(b);
    box(THREE, root, wood, 0.9, 0.08, 0.7, 0, 0.12, 0);
    root.userData.shadowRx = 0.7;
    root.userData.shadowRz = 0.55;
  } else if (i === 5) {
    box(THREE, root, woodDk, 0.1, 0.85, 0.1, -0.55, 0.42, 0);
    box(THREE, root, woodDk, 0.1, 0.85, 0.1, 0.55, 0.42, 0);
    box(THREE, root, wood, 1.2, 0.08, 0.06, 0, 0.55, 0);
    box(THREE, root, wood, 1.2, 0.08, 0.06, 0, 0.32, 0);
    root.userData.shadowRx = 0.65;
    root.userData.shadowRz = 0.2;
  } else if (i === 6) {
    box(THREE, root, wood, 0.55, 0.45, 0.45, 0, 0.22, 0);
    box(THREE, root, woodDk, 0.58, 0.06, 0.48, 0, 0.46, 0);
    root.userData.shadowRx = 0.35;
    root.userData.shadowRz = 0.3;
  } else if (i === 7) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.55, 10), wood);
    barrel.position.y = 0.28;
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    root.add(barrel);
    box(THREE, root, woodDk, 0.58, 0.06, 0.58, 0, 0.08, 0);
    root.userData.shadowRx = 0.35;
    root.userData.shadowRz = 0.35;
  } else if (i === 8) {
    box(THREE, root, woodDk, 0.12, 1.35, 0.12, 0, 0.68, 0);
    box(THREE, root, matCol(THREE, PAL.iron), 0.35, 0.08, 0.35, 0, 1.35, 0);
    box(THREE, root, matCol(THREE, 0xffe6a8), 0.28, 0.28, 0.28, 0, 1.52, 0, false);
    root.userData.shadowRx = 0.25;
    root.userData.shadowRz = 0.25;
  } else if (i === 9) {
    box(THREE, root, woodDk, 0.1, 1.1, 0.1, 0, 0.55, 0);
    box(THREE, root, wood, 0.7, 0.4, 0.06, 0.05, 1.0, 0);
    root.userData.shadowRx = 0.35;
    root.userData.shadowRz = 0.2;
  } else if (i === 10) {
    box(THREE, root, matCol(THREE, 0xc4a85a), 0.7, 0.35, 0.55, 0, 0.18, 0);
    box(THREE, root, matCol(THREE, 0xe8d090), 0.55, 0.22, 0.4, 0, 0.42, 0);
    root.userData.shadowRx = 0.4;
    root.userData.shadowRz = 0.35;
  } else if (i === 11) {
    // 花簇：三色小圆球 + 绿叶底
    box(THREE, root, matCol(THREE, PAL.leaf), 0.35, 0.12, 0.35, 0, 0.06, 0, false);
    box(THREE, root, matCol(THREE, PAL.leafHi), 0.18, 0.18, 0.18, -0.08, 0.18, 0.04, false);
    box(THREE, root, matCol(THREE, 0xf06058), 0.16, 0.16, 0.16, 0.1, 0.2, -0.02, false);
    box(THREE, root, matCol(THREE, 0xf0b84a), 0.14, 0.14, 0.14, 0.02, 0.22, 0.1, false);
    box(THREE, root, matCol(THREE, 0xff8ab8), 0.12, 0.12, 0.12, -0.12, 0.24, -0.08, false);
    root.userData.shadowRx = 0.28;
    root.userData.shadowRz = 0.28;
  } else if (i === 12) {
    // 陶罐 + 小绿植
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 8), matCol(THREE, 0xe87050));
    pot.position.y = 0.14;
    pot.castShadow = true;
    root.add(pot);
    box(THREE, root, matCol(THREE, PAL.leaf), 0.2, 0.16, 0.2, 0, 0.36, 0, false);
    box(THREE, root, matCol(THREE, 0xf06058), 0.08, 0.08, 0.08, 0.04, 0.44, 0.02, false);
    root.userData.shadowRx = 0.22;
    root.userData.shadowRz = 0.22;
  } else if (i === 15) {
    // 贝壳堆
    box(THREE, root, matCol(THREE, 0xfff6e8), 0.22, 0.08, 0.16, -0.06, 0.05, 0.04, false);
    box(THREE, root, matCol(THREE, 0xffe0c0), 0.16, 0.07, 0.14, 0.1, 0.05, -0.04, false);
    box(THREE, root, matCol(THREE, 0xf0d090), 0.12, 0.06, 0.1, 0, 0.08, 0.1, false);
    root.userData.shadowRx = 0.22;
    root.userData.shadowRz = 0.18;
  } else if (i === 16) {
    // 矮糖果路灯
    box(THREE, root, woodDk, 0.08, 0.7, 0.08, 0, 0.35, 0);
    box(THREE, root, matCol(THREE, 0xfff0c8), 0.22, 0.22, 0.22, 0, 0.78, 0, false);
    box(THREE, root, matCol(THREE, 0xf0b84a), 0.28, 0.06, 0.28, 0, 0.9, 0, false);
    root.userData.shadowRx = 0.18;
    root.userData.shadowRz = 0.18;
  } else if (i === 13) {
    box(THREE, root, wood, 1.2, 0.12, 0.55, 0, 0.45, 0);
    box(THREE, root, woodDk, 0.12, 0.4, 0.12, -0.45, 0.2, 0.18);
    box(THREE, root, woodDk, 0.12, 0.4, 0.12, 0.45, 0.2, 0.18);
    box(THREE, root, woodDk, 0.12, 0.4, 0.12, -0.45, 0.2, -0.18);
    box(THREE, root, woodDk, 0.12, 0.4, 0.12, 0.45, 0.2, -0.18);
    box(THREE, root, wood, 0.35, 0.28, 0.35, -0.2, 0.6, 0);
    root.userData.shadowRx = 0.65;
    root.userData.shadowRz = 0.35;
  } else if (i === 14) {
    box(THREE, root, wood, 1.0, 0.08, 0.35, 0, 0.42, 0);
    box(THREE, root, woodDk, 0.08, 0.42, 0.08, -0.4, 0.21, 0.12);
    box(THREE, root, woodDk, 0.08, 0.42, 0.08, 0.4, 0.21, 0.12);
    box(THREE, root, woodDk, 0.08, 0.42, 0.08, -0.4, 0.21, -0.12);
    box(THREE, root, woodDk, 0.08, 0.42, 0.08, 0.4, 0.21, -0.12);
    root.userData.shadowRx = 0.55;
    root.userData.shadowRz = 0.25;
  } else {
    box(THREE, root, wood, 0.55, 0.45, 0.45, 0, 0.22, 0);
    root.userData.shadowRx = 0.35;
    root.userData.shadowRz = 0.3;
  }
  root.userData.frontPad = 0.4;
  return root;
}

function makeHut(THREE) {
  // Q 版渔屋：矮墙 + 大茅草顶 + 圆门洞 + 暖窗（童话比例，不是写实小屋）
  const wall = matCol(THREE, PAL.cream);
  const wallSide = matCol(THREE, shadeHex(PAL.cream, 0.08));
  const wood = matCol(THREE, PAL.wood);
  const woodDk = matCol(THREE, PAL.woodDk);
  const roof = matMap(THREE, thatchTex(THREE), THREE.DoubleSide);
  const glass = new THREE.MeshStandardMaterial({
    color: PAL.glass, flatShading: true, roughness: 0.55, metalness: 0,
    emissive: 0xffc878, emissiveIntensity: 0.45,
  });
  const root = new THREE.Group();
  root.userData.volume = true;
  root.userData.frontPad = 0.8;
  root.userData.shadowRx = 1.4;
  root.userData.shadowRz = 1.15;
  const bw = 2.4, bd = 2.0, bh = 1.05, base = 0.26, rise = 1.2, over = 0.48;
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
    box(THREE, root, woodDk, 0.18, base + 0.12, 0.18, s[0] * 0.92, (base + 0.12) / 2, s[1] * 0.72);
  });
  box(THREE, root, wood, bw * 0.92, 0.1, 0.1, 0, base * 0.55, bd * 0.42);
  box(THREE, root, wood, bw * 0.92, 0.1, 0.1, 0, base * 0.55, -bd * 0.42);
  box(THREE, root, matCol(THREE, PAL.stone), bw + 0.28, 0.14, bd + 0.28, 0, base, 0);
  const t = 0.14, doorW = 0.72, doorH = 0.92;
  box(THREE, root, wallSide, bw, bh, t, 0, base + bh / 2, -bd / 2 + t / 2);
  box(THREE, root, wallSide, t, bh, bd, -bw / 2 + t / 2, base + bh / 2, 0);
  box(THREE, root, wallSide, t, bh, bd, bw / 2 - t / 2, base + bh / 2, 0);
  const side = (bw - doorW) / 2;
  box(THREE, root, wall, side, bh, t, -bw / 2 + side / 2, base + bh / 2, bd / 2 - t / 2);
  box(THREE, root, wall, side, bh, t, bw / 2 - side / 2, base + bh / 2, bd / 2 - t / 2);
  box(THREE, root, wall, doorW, bh - doorH, t, 0, base + doorH + (bh - doorH) / 2, bd / 2 - t / 2);
  // 圆拱门楣
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(doorW * 0.52, doorW * 0.52, 0.1, 12, 1, false, 0, Math.PI), wood);
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, base + doorH * 0.92, bd / 2 - t / 2);
  arch.castShadow = true;
  root.add(arch);
  box(THREE, root, woodDk, doorW + 0.1, doorH * 0.85, 0.06, 0, base + doorH * 0.42, bd / 2 - t / 2);
  box(THREE, root, wood, doorW * 0.82, doorH * 0.78, 0.08, 0, base + doorH * 0.42, bd / 2 - t - 0.06);
  box(THREE, root, matCol(THREE, 0xf2c46b), 0.08, 0.08, 0.08, doorW * 0.22, base + doorH * 0.42, bd / 2 - t - 0.02, false);
  // 圆窗 + 花箱
  box(THREE, root, wood, 0.52, 0.52, 0.08, -0.62, base + 0.72, bd / 2 + 0.03);
  const win = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), glass);
  win.rotation.x = Math.PI / 2;
  win.position.set(-0.62, base + 0.72, bd / 2 - 0.01);
  root.add(win);
  box(THREE, root, wood, 0.55, 0.1, 0.16, -0.62, base + 0.42, bd / 2 + 0.12);
  box(THREE, root, matCol(THREE, PAL.leaf), 0.12, 0.12, 0.12, -0.74, base + 0.5, bd / 2 + 0.14, false);
  box(THREE, root, matCol(THREE, 0xe87070), 0.1, 0.1, 0.1, -0.5, base + 0.5, bd / 2 + 0.15, false);
  makeGableEnds(THREE, root, wallSide, bw, bd, bh, base, rise);
  box(THREE, root, woodDk, bw + over * 2, 0.12, bd + over * 2, 0, base + bh + 0.04, 0);
  const ang = Math.atan2(rise, bd / 2 + over * 0.3);
  const len = Math.hypot(bd / 2 + over * 0.3, rise);
  [-1, 1].forEach(function (sgn) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(bw + over * 2.5, 0.22, len), roof);
    r.rotation.x = sgn * ang;
    r.position.set(0, base + bh + rise * 0.5, sgn * (bd * 0.22 + over * 0.05));
    r.castShadow = true;
    root.add(r);
  });
  // 檐口一排暖色草穗
  for (let i = 0; i < 9; i++) {
    box(THREE, root, matCol(THREE, i % 2 ? 0xe0a858 : 0xc88840), 0.08, 0.28, 0.08,
      -bw * 0.42 + i * 0.12, base + bh + 0.18, bd / 2 + over * 0.55, false);
  }
  // 门口陶罐
  box(THREE, root, matCol(THREE, 0xe07028), 0.22, 0.22, 0.22, 0.85, base + 0.22, bd / 2 + 0.2, false);
  box(THREE, root, matCol(THREE, PAL.leaf), 0.14, 0.14, 0.14, 0.85, base + 0.38, bd / 2 + 0.2, false);
  box(THREE, root, matCol(THREE, 0xffb27a), 0.18, 0.18, 0.18, 1.05, base + 0.18, bd / 2 + 0.18, false);
  return root;
}

/* ---------- 城墙 / 城门 / 传送阵 ---------- */
function makeCityWall(THREE, len, dir) {
  const n = Math.max(1, len | 0);
  // 奶油石墙：童话围栏，不是灰堡
  const stone = matMap(THREE, noiseTex(THREE, 96, 96, 0xf0e4c8, 0xc8b090, 55, 41));
  const stoneMid = matMap(THREE, noiseTex(THREE, 64, 64, 0xe8d8b0, 0xb8a078, 40, 42));
  const stoneDk = matCol(THREE, 0xd2c09a);
  const cream = matCol(THREE, 0xfff6e8);
  const wood = matCol(THREE, PAL.wood);
  const leaf = matCol(THREE, PAL.leaf);
  const root = new THREE.Group();
  root.userData.volume = true;
  const isCorner = dir === 'corner';
  const H = isCorner ? 2.2 : 1.55;
  const T = isCorner ? 0.85 : 0.52;
  const W = isCorner ? 1.0 : n;

  box(THREE, root, stoneDk, W + 0.04, 0.35, T + 0.08, 0, 0.18, 0);
  box(THREE, root, stone, W, H - 0.35, T, 0, 0.35 + (H - 0.35) / 2, 0);
  // 内侧木梁（童话木石混搭）
  box(THREE, root, wood, W * 0.92, 0.1, 0.08, 0, H * 0.55, -T * 0.35, false);
  // 顶压 + 雉堞（错落高低）
  box(THREE, root, cream, W + 0.1, 0.14, T + 0.14, 0, H + 0.05, 0);
  const merlons = isCorner ? 1 : n;
  for (let i = 0; i < merlons; i++) {
    const mx = isCorner ? 0 : (-n / 2 + 0.5 + i);
    const mh = 0.28 + (i % 2) * 0.12;
    box(THREE, root, i % 2 ? stoneMid : stoneDk, 0.38, mh, T + 0.08, mx, H + 0.12 + mh / 2, 0);
  }
  // 砖缝竖线
  if (!isCorner && n >= 2) {
    for (let i = 0; i < n - 1; i++) {
      box(THREE, root, stoneDk, 0.05, H * 0.55, T + 0.02, -n / 2 + 1 + i, H * 0.5, 0, false);
    }
  }
  // 角塔窗洞
  if (isCorner) {
    box(THREE, root, matCol(THREE, 0x3a2a18), 0.28, 0.36, 0.08, 0, 1.35, T * 0.52, false);
    box(THREE, root, matCol(THREE, 0xffe2a0), 0.2, 0.28, 0.04, 0, 1.35, T * 0.56, false);
  }
  // 零星藤蔓
  if (!isCorner && n >= 3) {
    box(THREE, root, leaf, 0.35, 0.55, 0.12, -n * 0.25, 0.7, T * 0.55, false);
    box(THREE, root, leaf, 0.28, 0.4, 0.1, n * 0.2, 0.55, T * 0.55, false);
  }

  if (dir === 'e' || dir === 'w') root.rotation.y = Math.PI / 2;

  root.userData.frontPad = 0.55;
  root.userData.shadowRx = Math.max(0.55, W * 0.55);
  root.userData.shadowRz = Math.max(0.45, T * 0.9);
  return root;
}

function makeGate(THREE, dir) {
  const stone = matMap(THREE, noiseTex(THREE, 64, 64, 0xd2c4a4, 0x8a7450, 45, 55));
  const wood = matCol(THREE, PAL.wood);
  const woodDk = matCol(THREE, PAL.woodDk);
  const root = new THREE.Group();
  root.userData.volume = true;
  // 厚柱 + 顶帽
  box(THREE, root, stone, 0.7, 2.6, 0.7, -1.15, 1.3, 0);
  box(THREE, root, stone, 0.7, 2.6, 0.7, 1.15, 1.3, 0);
  box(THREE, root, matCol(THREE, mixHex(PAL.stone, 0.18)), 0.85, 0.22, 0.85, -1.15, 2.7, 0);
  box(THREE, root, matCol(THREE, mixHex(PAL.stone, 0.18)), 0.85, 0.22, 0.85, 1.15, 2.7, 0);
  // 拱梁三层
  box(THREE, root, stone, 3.1, 0.35, 0.7, 0, 2.55, 0);
  box(THREE, root, woodDk, 3.2, 0.16, 0.78, 0, 2.78, 0);
  box(THREE, root, matCol(THREE, mixHex(PAL.stone, 0.12)), 2.4, 0.28, 0.5, 0, 2.35, 0.05);
  // 木框 + 半开掩门感（两扇短板贴边）
  box(THREE, root, woodDk, 0.14, 2.1, 0.14, -0.78, 1.05, 0.22);
  box(THREE, root, woodDk, 0.14, 2.1, 0.14, 0.78, 1.05, 0.22);
  box(THREE, root, wood, 0.45, 1.7, 0.08, -0.55, 0.95, 0.28);
  box(THREE, root, wood, 0.45, 1.7, 0.08, 0.55, 0.95, 0.28);
  box(THREE, root, wood, 1.7, 0.14, 0.12, 0, 2.15, 0.22);
  // 暖灯
  box(THREE, root, matCol(THREE, 0xffe6a8), 0.26, 0.26, 0.26, 0, 2.95, 0.4, false);
  if (dir === 'e' || dir === 'w') root.rotation.y = Math.PI / 2;
  root.userData.frontPad = 0.7;
  root.userData.shadowRx = 1.6;
  root.userData.shadowRz = 0.6;
  return root;
}

function portalRuneTex(THREE, glowHex) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const a = hex(glowHex);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',0.85)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(64, 64, 36, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(64 + Math.cos(ang) * 28, 64 + Math.sin(ang) * 28);
    g.lineTo(64 + Math.cos(ang) * 50, 64 + Math.sin(ang) * 50);
    g.stroke();
  }
  g.fillStyle = 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',0.35)';
  g.beginPath();
  g.arc(64, 64, 14, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  t.needsUpdate = true;
  return t;
}

function makePortal(THREE, kind, label) {
  const k = kind || 'door';
  const glowHex = k === 'exit' ? 0x5fe0c0 : k === 'boss' ? 0xe04a4a : 0xf0c840;
  const stone = matMap(THREE, noiseTex(THREE, 64, 64, 0xc8b898, 0x6a5840, 45, 77));
  const stoneDk = matCol(THREE, PAL.stoneDk);
  const root = new THREE.Group();
  root.userData.volume = true;

  // 阶梯台
  box(THREE, root, stoneDk, 2.0, 0.14, 2.0, 0, 0.07, 0);
  box(THREE, root, stone, 1.7, 0.16, 1.7, 0, 0.22, 0);
  box(THREE, root, matCol(THREE, mixHex(PAL.stone, 0.1)), 1.35, 0.1, 1.35, 0, 0.34, 0);

  // 门形石拱（开口朝相机 +Z）
  box(THREE, root, stone, 0.38, 1.9, 0.38, -0.72, 1.15, -0.15);
  box(THREE, root, stone, 0.38, 1.9, 0.38, 0.72, 1.15, -0.15);
  box(THREE, root, stoneDk, 1.9, 0.32, 0.4, 0, 2.2, -0.15);
  box(THREE, root, matCol(THREE, mixHex(PAL.stone, 0.18)), 2.1, 0.16, 0.5, 0, 2.42, -0.15);
  // 拱内饰条
  box(THREE, root, matCol(THREE, glowHex), 1.55, 0.06, 0.08, 0, 2.05, 0.05, false);

  // 魔光柱
  const glowMat = new THREE.MeshBasicMaterial({
    color: glowHex, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: mixHex(glowHex, 0.5), transparent: true, opacity: 0.75, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 1.85, 18, 1, true), glowMat);
  glow.position.set(0, 1.15, 0.2);
  root.add(glow);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.65, 12), coreMat);
  core.position.set(0, 1.15, 0.2);
  root.add(core);

  // 符文地环
  const ringMat = new THREE.MeshBasicMaterial({
    map: portalRuneTex(THREE, glowHex), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.78, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  root.add(ring);

  // 浮空晶石
  [[-0.85, 1.6, 0.35], [0.85, 1.7, 0.35], [0, 2.55, -0.05]].forEach(function (p) {
    box(THREE, root, matCol(THREE, mixHex(glowHex, 0.25)), 0.16, 0.22, 0.16, p[0], p[1], p[2], false);
  });

  if (label) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(48,32,18,0.92)';
    g.fillRect(6, 6, 244, 52);
    g.strokeStyle = '#e8d090';
    g.lineWidth = 3;
    g.strokeRect(8, 8, 240, 48);
    g.fillStyle = '#fff6d8';
    g.font = 'bold 22px system-ui,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(label).slice(0, 12), 128, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.38),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    board.position.set(0, 2.75, 0.15);
    root.add(board);
  }

  root.userData.frontPad = 0.65;
  root.userData.shadowRx = 1.0;
  root.userData.shadowRz = 1.0;
  return root;
}

function barkTex(THREE) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 128, 0);
  base.addColorStop(0, '#6a4828');
  base.addColorStop(0.45, '#a87850');
  base.addColorStop(1, '#7a5634');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 256; y += 11) {
    const wob = Math.sin(y * 0.18) * 3;
    g.strokeStyle = 'rgba(40,24,12,' + (0.28 + (y % 22) * 0.012) + ')';
    g.lineWidth = 2.5 + (y % 3);
    g.beginPath();
    g.moveTo(0, y + wob);
    g.quadraticCurveTo(64, y + wob + 2, 128, y + wob + 1);
    g.stroke();
    g.strokeStyle = 'rgba(230,190,130,0.14)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, y + wob + 3);
    g.lineTo(128, y + wob + 5);
    g.stroke();
  }
  for (let i = 0; i < 140; i++) {
    const x = (i * 37) % 128, y = (i * 53) % 256;
    g.fillStyle = 'rgba(30,16,8,' + (0.05 + (i % 6) * 0.025) + ')';
    g.beginPath();
    g.ellipse(x, y, 2 + (i % 3), 1 + (i % 2), (i % 5) * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  return t;
}

function frondTex(THREE, lit) {
  // 跟海水碎沫同语言：柔边渐隐 + 羽裂 + 脉络高光，别硬三角
  const c = document.createElement('canvas');
  c.width = 160; c.height = 320;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 160, 320);
  const hi = lit ? '#c4f088' : '#78c858';
  const mid = lit ? '#5aab40' : '#3e8a34';
  const lo = lit ? '#2e6e28' : '#1e4e20';
  const grd = g.createLinearGradient(80, 0, 80, 320);
  grd.addColorStop(0, hi);
  grd.addColorStop(0.4, mid);
  grd.addColorStop(0.78, lo);
  grd.addColorStop(1, 'rgba(20,50,20,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(80, 6);
  g.bezierCurveTo(148, 50, 142, 160, 128, 250);
  g.quadraticCurveTo(80, 310, 32, 250);
  g.bezierCurveTo(18, 160, 12, 50, 80, 6);
  g.fill();
  // 羽状裂：斜切挖空，再羽化边
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 11; i++) {
    const y = 36 + i * 22;
    const tip = 6 + (i % 2) * 14;
    g.fillStyle = 'rgba(0,0,0,0.92)';
    g.beginPath();
    g.moveTo(80, y);
    g.lineTo(tip, y + 10 + (i % 3));
    g.lineTo(80, y + 7);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(80, y + 3);
    g.lineTo(160 - tip, y + 12);
    g.lineTo(80, y + 9);
    g.closePath();
    g.fill();
  }
  // 叶缘碎沫感：外圈淡擦
  const edge = g.createRadialGradient(80, 140, 20, 80, 140, 110);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(0.7, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 160, 320);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(18,48,16,0.5)';
  g.lineWidth = 3.5;
  g.beginPath();
  g.moveTo(80, 10);
  g.quadraticCurveTo(82, 160, 80, 300);
  g.stroke();
  g.strokeStyle = 'rgba(210,255,160,0.28)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(78, 18);
  g.quadraticCurveTo(76, 150, 78, 280);
  g.stroke();
  // 叶面细脉
  for (let i = 0; i < 7; i++) {
    const y = 50 + i * 30;
    g.strokeStyle = 'rgba(20,60,18,' + (0.18 + (i % 3) * 0.06) + ')';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(80, y);
    g.lineTo(28 + (i % 2) * 8, y + 18);
    g.stroke();
    g.beginPath();
    g.moveTo(80, y + 4);
    g.lineTo(132 - (i % 2) * 8, y + 20);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  return t;
}

function thatchTex(THREE) {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 160;
  const g = c.getContext('2d');
  // 金茅草：童话暖黄，别用灰褐草顶
  g.fillStyle = '#f0b85a';
  g.fillRect(0, 0, 160, 160);
  for (let row = 0; row < 18; row++) {
    const y = 4 + row * 9;
    g.strokeStyle = 'rgba(160,90,30,' + (0.22 + (row % 3) * 0.08) + ')';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(0, y);
    g.quadraticCurveTo(80, y - 4 - (row % 2), 160, y + 1);
    g.stroke();
    g.strokeStyle = 'rgba(255,240,180,0.28)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(0, y + 3);
    g.lineTo(160, y + 4);
    g.stroke();
  }
  for (let i = 0; i < 220; i++) {
    const x = (i * 47) % 160, y = (i * 31) % 160;
    g.strokeStyle = 'rgba(255,248,200,' + (0.08 + (i % 5) * 0.04) + ')';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + ((i % 3) - 1), y + 5 + (i % 4));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.4, 2.4);
  t.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  return t;
}

function plankTex(THREE) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d8c098';
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 5; row++) {
    const y = row * 26;
    g.fillStyle = row % 2 ? '#c8aa78' : '#e0c8a0';
    g.fillRect(0, y, 128, 24);
    g.strokeStyle = 'rgba(70,48,24,0.35)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, y + 24);
    g.lineTo(128, y + 24);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = 'rgba(90,60,30,' + (0.08 + (i % 3) * 0.04) + ')';
      g.beginPath();
      g.moveTo(8 + i * 20, y + 3);
      g.quadraticCurveTo(18 + i * 20, y + 12, 10 + i * 20, y + 22);
      g.stroke();
    }
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(255,240,200,' + (0.04 + (i % 4) * 0.02) + ')';
    g.fillRect((i * 29) % 128, (i * 41) % 128, 2, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  return t;
}

/* Q 版椰树：矮胖干 + 饱和草绿圆锥叶（仍实心能投影，比例跟 3 头身人） */
function makePalm(THREE, variant) {
  const v = (variant | 0) % 3;
  const bark = matCol(THREE, 0xd2a06a);
  const barkDk = matCol(THREE, 0xb88850);
  const leafA = matCol(THREE, PAL.leafHi);
  const leafB = matCol(THREE, PAL.leaf);
  const nut = matCol(THREE, 0xc48a52);
  const root = new THREE.Group();
  root.userData.volume = true;
  const lean = (v - 1) * 0.08 + 0.04;
  let px = 0, py = 0;
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const rTop = 0.22 - i * 0.018;
    const rBot = 0.28 - i * 0.018;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, 0.72, 7), i % 2 ? barkDk : bark);
    const ang = lean * ((i + 0.5) / segs);
    seg.position.set(px, py + 0.36, 0);
    seg.rotation.z = ang;
    seg.castShadow = true;
    seg.receiveShadow = true;
    root.add(seg);
    px -= Math.sin(ang) * 0.7;
    py += Math.cos(ang) * 0.7;
  }
  const canopy = new THREE.Group();
  canopy.position.set(px, py + 0.1, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + v * 0.12;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 5), i % 2 ? leafB : leafA);
    leaf.scale.set(0.62, 1.0, 1.25);
    leaf.position.set(Math.cos(a) * 0.85, -0.15, Math.sin(a) * 0.85);
    leaf.rotation.order = 'YXZ';
    leaf.rotation.set(Math.sin(a) * 0.95, -a, -Math.cos(a) * 0.95 + Math.PI);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    canopy.add(leaf);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 5), leafA);
    tip.scale.set(0.7, 1, 1.1);
    tip.position.set(Math.cos(a) * 0.2, 0.4, Math.sin(a) * 0.2);
    tip.rotation.order = 'YXZ';
    tip.rotation.set(0.25, -a, Math.PI);
    tip.castShadow = true;
    canopy.add(tip);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + v;
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), nut);
    n.position.set(Math.cos(a) * 0.32, -0.12, Math.sin(a) * 0.32);
    n.castShadow = true;
    canopy.add(n);
  }
  root.add(canopy);
  root.userData.frontPad = 0.5;
  root.userData.shadowRx = 1.0;
  root.userData.shadowRz = 0.9;
  return root;
}

DL.BuildHouse = {
  make: makeHouse,
  prop: makeProp,
  hut: makeHut,
  wall: makeCityWall,
  gate: makeGate,
  portal: makePortal,
  palm: makePalm,
  KINDS: KINDS,
};
