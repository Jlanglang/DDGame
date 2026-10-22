'use strict';

(function () {
  const stretchEl = document.getElementById('stretch');
  if (!window.THREE) {
    stretchEl.textContent = 'three.js 没加载上';
    return;
  }

  const THREE = window.THREE;
  const autowalk = new URLSearchParams(location.search).has('autowalk');

  const BASE_HIP = 0.68;
  const SOCKET_DROP = 0.2;
  const FOOT_Y = 0.06;
  const REST = 0.44;
  const SPEED = 1.8;
  const LIMIT = 9.15;
  const POINT_COUNT = 12;
  const RADIAL = 8;

  const PRESETS = [
    { name: '普通', release: 0.72, swing: 0.2, arc: 0.13 },
    { name: '黏脚', release: 1.25, swing: 0.1, arc: 0.045 },
    { name: '太黏', release: 1.95, swing: 0.14, arc: 0.03 },
  ];

  let presetIndex = 1;
  let autoDir = 1;
  let demoWalk = autowalk;
  let yaw = 0;
  let hipShown = BASE_HIP;
  let land = 0;
  let velx = 0;
  let velz = 0;
  const hop = { y: 0, vy: 0, grounded: true };
  let jumpEdge = false;
  const ctrl = new THREE.Vector3();
  const goal = new THREE.Vector3();
  let hasGoal = false;
  const keys = new Set();
  let pointerId = null;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xc6ecff);
  document.body.prepend(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc6ecff, 16, 34);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 80);
  let camReady = false;

  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x8fbf78, 1.25);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff7ee, 2.6);
  dir.position.set(5, 9, 3);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 0.4;
  dir.shadow.camera.far = 24;
  dir.shadow.camera.left = -8;
  dir.shadow.camera.right = 8;
  dir.shadow.camera.top = 8;
  dir.shadow.camera.bottom = -8;
  dir.shadow.bias = -0.0004;
  const dirTarget = new THREE.Object3D();
  scene.add(dirTarget);
  dir.target = dirTarget;
  scene.add(dir);

  const skin = new THREE.MeshLambertMaterial({ color: 0xf3c2a4 });
  const footMat = new THREE.MeshLambertMaterial({ color: 0xe7a888 });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x8fd06a });
  const patchMat = new THREE.MeshLambertMaterial({ color: 0x74c45c });
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xf3d7a4 });
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x89d0ea });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x6fbe58 });
  const barkMat = new THREE.MeshLambertMaterial({ color: 0xc4a074 });
  const blushMat = new THREE.MeshLambertMaterial({ color: 0xf2949a });
  const puffMat = new THREE.MeshBasicMaterial({
    color: 0xfff8ee,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });

  function disc(radius, mat, y) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 56), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  disc(28, waterMat, -0.03);
  const sand = new THREE.Mesh(new THREE.RingGeometry(9.45, 11.6, 56), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.005;
  sand.receiveShadow = true;
  scene.add(sand);
  disc(9.6, grassMat, 0.02);
  [[2.2, 2.6, 1.15], [-2.8, 1.1, 0.85], [1.2, -2.8, 1.3], [-1.6, -1.8, 0.7]].forEach(function (p) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(p[2], 20), patchMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p[0], 0.025, p[1]);
    mesh.receiveShadow = true;
    scene.add(mesh);
  });

  const trees = [];
  const pickList = [];
  function makeTree(x, z, scale) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.05, 8), barkMat);
    trunk.position.y = 0.52;
    trunk.castShadow = true;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.5 * scale, 16, 12), leafMat);
    top.position.y = 1.18;
    top.scale.y = 0.78;
    top.castShadow = true;
    group.add(trunk, top);
    group.position.set(x, 0, z);
    scene.add(group);
    const rec = { kind: 'tree', hp: 2, x: x, z: z, group: group, alive: true, shake: 0, fall: 0 };
    trunk.userData.ref = rec;
    top.userData.ref = rec;
    trees.push(rec);
    pickList.push(trunk, top);
  }
  makeTree(3.5, 2.4, 1.05);
  makeTree(4.8, 0.3, 1.15);
  makeTree(2.8, -1.8, 0.95);
  makeTree(-5.6, -3.2, 1.1);

  const PAD_X = -2.5;
  const PAD_Z = 1.7;
  const padRec = { kind: 'pad', x: PAD_X, z: PAD_Z };
  const padMat = new THREE.MeshLambertMaterial({ color: 0xd8b57a });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28), padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(PAD_X, 0.03, PAD_Z);
  pad.receiveShadow = true;
  pad.userData.ref = padRec;
  scene.add(pad);
  pickList.push(pad);
  const postMat = new THREE.MeshLambertMaterial({ color: 0xc4956a });
  [[-0.7, -0.45], [0.7, -0.45], [-0.7, 0.45], [0.7, 0.45]].forEach(function (p) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 8), postMat);
    post.position.set(PAD_X + p[0], 0.28, PAD_Z + p[1]);
    post.castShadow = true;
    post.userData.ref = padRec;
    scene.add(post);
    pickList.push(post);
    padRec.posts = padRec.posts || [];
    padRec.posts.push(post);
  });

  const WOOD_NEED = 6;
  const quest = { wood: 0, built: false };
  const logs = [];
  let job = null;
  let chopT = 0;
  let house = null;

  function veggie(x, z, color) {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 12),
      new THREE.MeshLambertMaterial({ color: color })
    );
    body.position.set(x, 0.16, z);
    body.scale.y = 1.25;
    body.castShadow = true;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), leafMat);
    leaf.position.set(x, 0.34, z);
    leaf.scale.set(1.1, 0.45, 0.7);
    scene.add(body, leaf);
  }
  veggie(1.7, 1.5, 0xf08a3c);
  veggie(-1.8, 0.8, 0xe85d5d);
  veggie(2.1, -1.3, 0xf2c14e);
  veggie(-1.1, -2.2, 0xef7aa8);

  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfffdf8 });
  function cloud(x, y, z, s) {
    const group = new THREE.Group();
    [[0, 0, 0.5], [0.42, 0.08, 0.34], [-0.36, 0.05, 0.3]].forEach(function (p) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(p[2] * s, 12, 8), cloudMat);
      mesh.position.set(p[0] * s, p[1] * s, 0);
      group.add(mesh);
    });
    group.position.set(x, y, z);
    scene.add(group);
  }
  cloud(-4, 4.6, -6, 1);
  cloud(5.5, 5.1, -4, 0.8);
  cloud(1, 4.4, 7, 0.7);

  const blobTex = (function () {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, 'rgba(60,80,40,0.35)');
    grd.addColorStop(1, 'rgba(60,80,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  scene.add(blob);

  const rig = new THREE.Group();
  const bob = new THREE.Group();
  rig.add(bob);
  scene.add(rig);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), skin);
  body.castShadow = true;
  bob.add(body);

  const head = new THREE.Group();
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.23, 24, 16), skin);
  headMesh.castShadow = true;
  head.add(headMesh);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a241f });
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xfffdfb });
  function eye(x) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), whiteMat);
    white.position.set(x, 0.03, 0.18);
    white.scale.set(1, 1.15, 0.6);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), eyeMat);
    pupil.position.set(x, 0.02, 0.205);
    head.add(white, pupil);
  }
  eye(-0.08);
  eye(0.08);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin);
  nose.position.set(0, -0.02, 0.21);
  nose.scale.set(1, 0.8, 0.7);
  head.add(nose);
  [-1, 1].forEach(function (side) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), blushMat);
    cheek.position.set(side * 0.14, -0.05, 0.15);
    cheek.scale.set(1, 0.65, 0.45);
    head.add(cheek);
  });
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), whiteMat);
  shine.position.set(-0.07, 0.12, 0.15);
  shine.scale.set(1.2, 0.65, 0.45);
  head.add(shine);
  bob.add(head);

  function makeArm(side) {
    const arm = new THREE.Group();
    const handMat = footMat.clone();
    arm.userData.side = side;
    arm.userData.restX = -1.05;
    function part(parent, radius, x, y, z, sx, sy, sz, mat) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 12), mat || skin);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
    }
    part(arm, 0.075, 0, 0, 0, 1, 0.85, 1);
    part(arm, 0.05, 0, -0.13, 0.02, 0.85, 1.3, 0.85);
    const hand = new THREE.Group();
    hand.position.set(0, -0.22, 0.02);
    part(hand, 0.058, 0, 0, 0.01, 0.85, 0.75, 1.05, handMat);
    part(hand, 0.026, side * 0.01, 0.02, 0.055, 0.9, 1.1, 1, handMat);
    part(hand, 0.02, side * -0.012, -0.055, 0.02, 0.85, 1.3, 0.85, handMat);
    part(hand, 0.018, side * 0.024, -0.05, 0.025, 0.85, 1.2, 0.85, handMat);
    arm.add(hand);
    arm.userData.hand = hand;
    arm.rotation.z = side * 0.18;
    arm.rotation.x = arm.userData.restX;
    bob.add(arm);
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  let held = null;
  let axeX = -1.2;
  let axeZ = 0.45;
  const axeRec = { kind: 'axe' };
  const axePickables = [];
  function makeAxeGroup() {
    const group = new THREE.Group();
    const handleMat = new THREE.MeshLambertMaterial({ color: 0x8d5a34 });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xd7dee8 });
    const edgeMat = new THREE.MeshLambertMaterial({ color: 0xfff8ef });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.48, 8), handleMat);
    handle.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.085, 0.048), headMat);
    head.position.y = 0.2;
    head.castShadow = true;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 4), edgeMat);
    blade.rotation.z = Math.PI / 2;
    blade.position.set(0.14, 0.2, 0);
    blade.castShadow = true;
    group.add(handle, head, blade);
    return group;
  }
  const axe = makeAxeGroup();
  const axeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.38, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfff1c4,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  axeRing.rotation.x = -Math.PI / 2;
  scene.add(axe);
  scene.add(axeRing);
  axe.traverse(function (obj) {
    if (!obj.isMesh) return;
    obj.userData.ref = axeRec;
    axePickables.push(obj);
  });
  axeRing.userData.ref = axeRec;
  axePickables.push(axeRing);
  function setAxePickable(on) {
    axePickables.forEach(function (mesh) {
      const index = pickList.indexOf(mesh);
      if (on && index < 0) pickList.push(mesh);
      if (!on && index >= 0) pickList.splice(index, 1);
    });
  }
  function layAxe() {
    axe.rotation.set(0.15, 0.4, Math.PI / 2);
    axe.position.set(axeX, 0.11, axeZ);
    axeRing.position.set(axeX, 0.032, axeZ);
    axeRing.visible = true;
  }
  const axeAim = new THREE.Vector3();
  const axeUp = new THREE.Vector3(0, 1, 0);
  function placeHeldAxe() {
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    axeAim.set(rx, -1.15, rz).normalize();
    axe.position.set(ctrl.x + rx * 0.46, 0.62, ctrl.z + rz * 0.02);
    axe.quaternion.setFromUnitVectors(axeUp, axeAim);
  }
  function gripAxe() {
    if (held === 'axe') return;
    held = 'axe';
    setAxePickable(false);
    axeRing.visible = false;
    if (axe.parent && axe.parent !== scene) axe.parent.remove(axe);
    scene.add(axe);
    axe.scale.setScalar(1.3);
    placeHeldAxe();
    burst(ctrl.x, ctrl.z);
  }
  function releaseAxe() {
    if (held !== 'axe') return;
    held = null;
    if (job && job.type === 'chop') {
      job = null;
      hasGoal = false;
    }
    const ahead = 0.72;
    axeX = ctrl.x + Math.sin(yaw) * ahead;
    axeZ = ctrl.z + Math.cos(yaw) * ahead;
    const rad = Math.hypot(axeX, axeZ);
    if (rad > LIMIT - 0.3) {
      const k = (LIMIT - 0.3) / rad;
      axeX *= k;
      axeZ *= k;
    }
    if (axe.parent && axe.parent !== scene) axe.parent.remove(axe);
    axe.scale.setScalar(1);
    scene.add(axe);
    layAxe();
    setAxePickable(true);
    burst(axeX, axeZ);
  }
  function updateAxe() {
    if (held === 'axe') {
      placeHeldAxe();
      return;
    }
    axe.position.x = axeX;
    axe.position.z = axeZ;
    axe.position.y = 0.11 + Math.sin(clock.elapsedTime * 2.6) * 0.035;
    axeRing.visible = true;
    axeRing.position.set(axeX, 0.032, axeZ);
  }
  function nearestTree() {
    let best = null;
    let bestD = Infinity;
    trees.forEach(function (tree) {
      if (!tree.alive) return;
      const dist = Math.hypot(ctrl.x - tree.x, ctrl.z - tree.z);
      if (dist < bestD) {
        bestD = dist;
        best = tree;
      }
    });
    return best;
  }
  function pressAct() {
    demoWalk = false;
    if (held !== 'axe') {
      job = { type: 'take' };
      return;
    }
    const tree = nearestTree();
    if (!tree) return;
    job = { type: 'chop', tree: tree };
  }
  function pressDrop() {
    if (held !== 'axe') return;
    demoWalk = false;
    releaseAxe();
  }
  layAxe();
  setAxePickable(true);

  function createRope() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(POINT_COUNT * RADIAL * 3);
    const normals = new Float32Array(POINT_COUNT * RADIAL * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const idx = [];
    for (let i = 0; i < POINT_COUNT - 1; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const j2 = (j + 1) % RADIAL;
        const a = i * RADIAL + j;
        const b = i * RADIAL + j2;
        const c = (i + 1) * RADIAL + j;
        const d = (i + 1) * RADIAL + j2;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, skin);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.radial = RADIAL;
    scene.add(mesh);
    return mesh;
  }

  function makeFoot(side) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), footMat);
    mesh.castShadow = true;
    scene.add(mesh);
    return {
      side: side,
      pos: new THREE.Vector3(),
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      sock: new THREE.Vector3(),
      planted: true,
      swing: 1,
      dur: 0.15,
      yaw: 0,
      pop: 0,
      mesh: mesh,
      rope: createRope(),
    };
  }
  const feet = [makeFoot(-1), makeFoot(1)];

  const puffs = [];
  for (let i = 0; i < 16; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), puffMat);
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh: mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }

  const ropeTan = [];
  const ropeN = [];
  const ropeB = [];
  const curvePts = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    ropeTan.push(new THREE.Vector3());
    ropeN.push(new THREE.Vector3());
    ropeB.push(new THREE.Vector3());
    curvePts.push(new THREE.Vector3());
  }
  const _up = new THREE.Vector3(0, 1, 0);
  const _alt = new THREE.Vector3(1, 0, 0);
  const knee = new THREE.Vector3();
  const ankle = new THREE.Vector3();
  const hover = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const cam = { yaw: Math.PI, pitch: 0.42, dist: 3.6 };
  const camHold = { l: 0, r: 0, up: 0, down: 0, inn: 0, out: 0 };
  let orbitDrag = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  const headLag = new THREE.Vector3();
  const clock = new THREE.Clock();

  function dampAngle(current, target, lambda, dt) {
    const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + diff * (1 - Math.exp(-lambda * dt));
  }

  function localToWorld(lx, ly, lz, out) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.x = ctrl.x + lx * c + lz * s;
    out.y = ly;
    out.z = ctrl.z - lx * s + lz * c;
    return out;
  }

  function socketAt(foot, out) {
    localToWorld(foot.side * 0.16, hipShown - SOCKET_DROP + hop.y, 0, out);
    return out;
  }

  function placeFootTarget(foot, out, ahead) {
    const lx = foot.side * 0.2;
    const lz = ahead;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.x = ctrl.x + velx * 0.1 + lx * c + lz * s;
    out.y = FOOT_Y;
    out.z = ctrl.z + velz * 0.1 - lx * s + lz * c;
    const rad = Math.hypot(out.x, out.z);
    if (rad > LIMIT) {
      out.x *= LIMIT / rad;
      out.z *= LIMIT / rad;
    }
    return out;
  }

  function beginSwing(foot, ahead, dur) {
    foot.planted = false;
    foot.swing = 0;
    foot.dur = dur;
    foot.from.copy(foot.pos);
    placeFootTarget(foot, foot.to, ahead);
  }

  function radiusAt(t, stretch01) {
    const end = THREE.MathUtils.lerp(0.072, 0.055, t);
    const pinch = Math.sin(Math.PI * t) * 0.55 * stretch01;
    const flare = Math.exp(-t * 7) * 0.028;
    return Math.max(0.032, end * (1 - pinch) + flare);
  }

  function updateRope(mesh, points, stretch01) {
    const radial = mesh.userData.radial;
    const count = points.length;
    const pos = mesh.geometry.attributes.position.array;
    const nrm = mesh.geometry.attributes.normal.array;
    for (let i = 0; i < count; i++) {
      const tan = ropeTan[i];
      if (i === 0) tan.subVectors(points[1], points[0]);
      else if (i === count - 1) tan.subVectors(points[i], points[i - 1]);
      else tan.subVectors(points[i + 1], points[i - 1]);
      if (tan.lengthSq() < 1e-8) tan.set(0, -1, 0);
      else tan.normalize();
      const ref = Math.abs(tan.dot(_up)) > 0.92 ? _alt : _up;
      const side = ropeN[i];
      side.crossVectors(ref, tan);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
      else side.normalize();
      ropeB[i].crossVectors(tan, side).normalize();
    }
    let p = 0;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const radius = radiusAt(t, stretch01);
      const side = ropeN[i];
      const bit = ropeB[i];
      const point = points[i];
      for (let j = 0; j < radial; j++) {
        const ang = (j / radial) * Math.PI * 2;
        const cx = Math.cos(ang);
        const sy = Math.sin(ang);
        const nx = side.x * cx + bit.x * sy;
        const ny = side.y * cx + bit.y * sy;
        const nz = side.z * cx + bit.z * sy;
        pos[p] = point.x + nx * radius;
        nrm[p] = nx;
        pos[p + 1] = point.y + ny * radius;
        nrm[p + 1] = ny;
        pos[p + 2] = point.z + nz * radius;
        nrm[p + 2] = nz;
        p += 3;
      }
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.normal.needsUpdate = true;
  }

  function burst(x, z) {
    let n = 0;
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      if (p.life > 0) continue;
      p.life = 0.22 + Math.random() * 0.1;
      p.mesh.visible = true;
      p.mesh.position.set(x, 0.05, z);
      const a = Math.random() * Math.PI * 2;
      const sp = 0.35 + Math.random() * 0.55;
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = 0.35 + Math.random() * 0.45;
      if (++n >= 5) break;
    }
  }

  function setPreset(index) {
    presetIndex = index;
    for (let i = 0; i < 3; i++) {
      document.getElementById('p' + i).classList.toggle('on', i === index);
    }
  }
  setPreset(1);
  document.getElementById('jumpBtn').addEventListener('pointerdown', function (event) {
    event.preventDefault();
    jumpEdge = true;
  });
  document.getElementById('actBtn').addEventListener('pointerdown', function (event) {
    event.preventDefault();
    pressAct();
  });
  document.getElementById('dropBtn').addEventListener('pointerdown', function (event) {
    event.preventDefault();
    pressDrop();
  });
  document.getElementById('buildBtn').addEventListener('pointerdown', function (event) {
    event.preventDefault();
    if (quest.built || quest.wood < WOOD_NEED) return;
    demoWalk = false;
    job = { type: 'build' };
  });
  for (let i = 0; i < 3; i++) {
    document.getElementById('p' + i).addEventListener('click', function () {
      setPreset(Number(this.id.slice(1)));
    });
  }

  if (autowalk) {
    ctrl.set(-3.1, 0, 0.4);
    yaw = Math.atan2(1, 0);
  }
  feet.forEach(function (foot) {
    placeFootTarget(foot, foot.pos, 0.02);
    foot.from.copy(foot.pos);
    foot.to.copy(foot.pos);
    foot.yaw = yaw;
  });
  if (autowalk) {
    feet[1].pos.x -= Math.sin(yaw) * 0.55;
    feet[1].pos.z -= Math.cos(yaw) * 0.55;
  }

  function pointerNDC(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }

  function interactHit() {
    if (!pickList.length) return null;
    const hits = raycaster.intersectObjects(pickList, false);
    if (!hits.length) return null;
    return hits[0].object.userData.ref || null;
  }

  function aim(event) {
    pointerNDC(event);
    job = null;
    const hit = raycaster.ray.intersectPlane(ground, hitPoint);
    if (!hit) return;
    goal.copy(hitPoint);
    hasGoal = true;
    demoWalk = false;
  }

  function clampCam() {
    cam.pitch = Math.max(0.12, Math.min(1.35, cam.pitch));
    cam.dist = Math.max(1.7, Math.min(9, cam.dist));
  }

  function nudgeCam(key) {
    if (key === 'l') cam.yaw += 0.38;
    if (key === 'r') cam.yaw -= 0.38;
    if (key === 'up') cam.pitch += 0.14;
    if (key === 'down') cam.pitch -= 0.14;
    if (key === 'inn') cam.dist -= 0.45;
    if (key === 'out') cam.dist += 0.45;
    clampCam();
  }

  function bindCamHold(id, key) {
    const el = document.getElementById(id);
    function down(event) {
      event.preventDefault();
      camHold[key] = 1;
      nudgeCam(key);
      try { el.setPointerCapture(event.pointerId); } catch (err) { /* 合成事件没有捕获 */ }
    }
    function up(event) {
      if (event && event.pointerId != null) {
        try {
          if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
        } catch (err) { /* 已经松开 */ }
      }
      camHold[key] = 0;
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }
  bindCamHold('camL', 'l');
  bindCamHold('camR', 'r');
  bindCamHold('camUp', 'up');
  bindCamHold('camDown', 'down');
  bindCamHold('camIn', 'inn');
  bindCamHold('camOut', 'out');

  canvas.addEventListener('pointerdown', function (event) {
    const orbiting = event.button === 2 || event.button === 1 || event.altKey;
    if (orbiting) {
      if (orbitDrag) return;
      orbitDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.focus();
      event.preventDefault();
      try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* 合成事件没有捕获 */ }
      return;
    }
    if (event.button !== 0 || pointerId !== null) return;
    pointerNDC(event);
    const ref = interactHit();
    if (ref && ref.kind === 'axe' && held !== 'axe') {
      demoWalk = false;
      job = { type: 'take' };
      canvas.focus();
      event.preventDefault();
      return;
    }
    if (ref && ((ref.kind === 'tree' && ref.alive) || (ref.kind === 'pad' && !quest.built))) {
      demoWalk = false;
      if (ref.kind === 'tree' && held !== 'axe') job = { type: 'take' };
      else job = ref.kind === 'tree' ? { type: 'chop', tree: ref } : { type: 'build' };
      canvas.focus();
      event.preventDefault();
      return;
    }
    pointerId = event.pointerId;
    try { canvas.setPointerCapture(event.pointerId); } catch (err) { /* 合成事件没有捕获 */ }
    canvas.focus();
    event.preventDefault();
    aim(event);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (orbitDrag && event.pointerId === orbitDrag.id) {
      const dx = event.clientX - orbitDrag.x;
      const dy = event.clientY - orbitDrag.y;
      orbitDrag.x = event.clientX;
      orbitDrag.y = event.clientY;
      cam.yaw -= dx * 0.008;
      cam.pitch += dy * 0.005;
      clampCam();
      return;
    }
    if (event.pointerId !== pointerId) return;
    aim(event);
  });
  function endPointer(event) {
    if (orbitDrag && event.pointerId === orbitDrag.id) orbitDrag = null;
    if (event.pointerId !== pointerId) return;
    pointerId = null;
  }
  canvas.addEventListener('wheel', function (event) {
    event.preventDefault();
    cam.dist += Math.sign(event.deltaY) * 0.38;
    clampCam();
  }, { passive: false });
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });

  window.addEventListener('keydown', function (event) {
    keys.add(event.code);
    if (event.code === 'Digit1' || event.code === 'Numpad1') setPreset(0);
    if (event.code === 'Digit2' || event.code === 'Numpad2') setPreset(1);
    if (event.code === 'Digit3' || event.code === 'Numpad3') setPreset(2);
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) jumpEdge = true;
    }
    if (/^(Key[WASDQERF]|Arrow|Space)/.test(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', function (event) {
    keys.delete(event.code);
  });
  window.addEventListener('blur', function () {
    keys.clear();
  });
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function keyAxis() {
    let x = 0;
    let z = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
    return { x: x, z: z, on: x !== 0 || z !== 0 };
  }

  let lastStretch = 1;
  const prev = new THREE.Vector3();
  prev.copy(ctrl);

  function approach(x, z, dist) {
    const dx = ctrl.x - x;
    const dz = ctrl.z - z;
    const len = Math.hypot(dx, dz) || 1;
    goal.set(x + (dx / len) * dist, 0, z + (dz / len) * dist);
    hasGoal = true;
  }

  function spawnLog(x, z) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.28, 8), barkMat);
    log.castShadow = true;
    const dx = ctrl.x - x;
    const dz = ctrl.z - z;
    const len = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.7;
    log.position.set(x + Math.cos(ang) * 0.2, 0.45, z + Math.sin(ang) * 0.2);
    log.userData.vx = Math.cos(ang) * 0.65;
    log.userData.vz = Math.sin(ang) * 0.65;
    log.userData.vy = 2.1;
    log.userData.settled = false;
    scene.add(log);
    logs.push(log);
  }

  function strike(tree) {
    chopT = 0.36;
    tree.hp -= 1;
    tree.shake = 0.34;
    spawnLog(tree.x, tree.z);
    if (tree.hp > 0) return;
    tree.alive = false;
    tree.group.children.forEach(function (child) {
      const index = pickList.indexOf(child);
      if (index >= 0) pickList.splice(index, 1);
    });
    if (job && job.tree === tree) {
      job = null;
      hasGoal = false;
    }
  }

  function placeHouse() {
    if (quest.built || quest.wood < WOOD_NEED) return;
    quest.wood -= WOOD_NEED;
    quest.built = true;
    const group = new THREE.Group();
    const wall = new THREE.MeshLambertMaterial({ color: 0xf4e4c4 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xd4654a });
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x8a5a3b });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.35), wall);
    body.position.y = 0.58;
    body.castShadow = true;
    body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.28, 0.72, 4), roofMat);
    roof.position.y = 1.48;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.64, 0.08), doorMat);
    door.position.set(0, 0.34, 0.68);
    group.add(body, roof, door);
    group.position.set(PAD_X, 0, PAD_Z);
    group.userData.grow = 0;
    scene.add(group);
    house = group;
    if (padRec.posts) {
      padRec.posts.forEach(function (post) {
        scene.remove(post);
        const index = pickList.indexOf(post);
        if (index >= 0) pickList.splice(index, 1);
      });
    }
    scene.remove(pad);
    const padIndex = pickList.indexOf(pad);
    if (padIndex >= 0) pickList.splice(padIndex, 1);
    burst(PAD_X, PAD_Z);
  }

  function updateJob(dt) {
    if (!job) return;
    if (job.type === 'take') {
      if (held === 'axe') {
        job = null;
        return;
      }
      const dist = Math.hypot(ctrl.x - axeX, ctrl.z - axeZ);
      if (dist > 0.95) {
        approach(axeX, axeZ, 0.5);
        return;
      }
      hasGoal = false;
      gripAxe();
      job = null;
      return;
    }
    if (job.type === 'chop') {
      if (held !== 'axe') {
        job = { type: 'take' };
        return;
      }
      const tree = job.tree;
      if (!tree.alive) {
        job = null;
        return;
      }
      const dist = Math.hypot(ctrl.x - tree.x, ctrl.z - tree.z);
      if (dist > 1.2) {
        approach(tree.x, tree.z, 0.95);
        return;
      }
      hasGoal = false;
      yaw = dampAngle(yaw, Math.atan2(tree.x - ctrl.x, tree.z - ctrl.z), 14, dt);
      if (chopT <= 0) strike(tree);
      return;
    }
    const dist = Math.hypot(ctrl.x - PAD_X, ctrl.z - PAD_Z);
    if (quest.built) {
      job = null;
      return;
    }
    if (dist > 1.35) {
      approach(PAD_X, PAD_Z, 1.05);
      return;
    }
    hasGoal = false;
    if (quest.wood >= WOOD_NEED) placeHouse();
  }

  function updateLogs(dt) {
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      const data = log.userData;
      if (!data.settled) {
        data.vy -= 9 * dt;
        log.position.y += data.vy * dt;
        log.position.x += data.vx * dt;
        log.position.z += data.vz * dt;
        log.rotation.z += dt * 5;
        if (log.position.y <= 0.1) {
          log.position.y = 0.1;
          log.rotation.z = Math.PI / 2;
          data.settled = true;
        }
      }
      const dist = Math.hypot(log.position.x - ctrl.x, log.position.z - ctrl.z);
      if (data.settled && dist < 1.15) {
        scene.remove(log);
        logs.splice(i, 1);
        quest.wood += 1;
        burst(ctrl.x, ctrl.z);
      }
    }
  }

  function updateTrees(dt) {
    trees.forEach(function (tree) {
      if (tree.shake > 0) {
        tree.shake = Math.max(0, tree.shake - dt);
        tree.group.rotation.z = Math.sin(tree.shake * 46) * tree.shake * 0.8;
      }
      if (!tree.alive) {
        tree.fall = Math.min(1.2, tree.fall + dt * 1.8);
        tree.group.rotation.z = tree.fall;
        tree.group.position.y = -Math.min(tree.fall, 0.35) * 0.2;
      }
    });
    if (house && house.userData.grow < 1) {
      house.userData.grow = Math.min(1, house.userData.grow + dt * 1.8);
      const scale = 1 - Math.pow(1 - house.userData.grow, 3);
      house.scale.setScalar(Math.max(0.02, scale));
    }
  }

  function refreshActions() {
    const drop = document.getElementById('dropBtn');
    const act = document.getElementById('actBtn');
    const has = held === 'axe';
    drop.disabled = !has;
    act.classList.toggle('take', !has);
    act.classList.toggle('chop', has);
    const label = has ? '砍' : '拿';
    act.setAttribute('aria-label', label);
    act.title = label;
  }

  function refreshQuest() {
    refreshActions();
    const step = document.getElementById('questStep');
    const button = document.getElementById('buildBtn');
    if (quest.built) {
      step.textContent = '房子盖好了';
      button.disabled = true;
      button.textContent = '已建成';
      return;
    }
    if (quest.wood >= WOOD_NEED) {
      step.textContent = '木头 ' + quest.wood + '/6，去左边木桩建房子';
      button.disabled = false;
      button.textContent = '建房子';
      return;
    }
    if (held !== 'axe') {
      step.textContent = quest.wood > 0
        ? '捡起斧子再砍 ' + quest.wood + '/6'
        : '先捡起斧子';
      button.disabled = true;
      button.textContent = '建房子';
      return;
    }
    const nearPad = Math.hypot(ctrl.x - PAD_X, ctrl.z - PAD_Z) < 1.5;
    step.textContent = nearPad
      ? '木头还不够，先去砍树 ' + quest.wood + '/6'
      : '砍树并捡起木头 ' + quest.wood + '/6';
    button.disabled = true;
    button.textContent = '建房子';
  }

  function frame() {
    const dt = Math.min(clock.getDelta() || 0.016, 0.033);
    if (chopT > 0) chopT -= dt;
    const preset = PRESETS[presetIndex];
    const key = keyAxis();
    if (key.on) job = null;
    else updateJob(dt);
    let wishx = 0;
    let wishz = 0;

    if (key.on) {
      hasGoal = false;
      demoWalk = false;
      const fx = ctrl.x - camera.position.x;
      const fz = ctrl.z - camera.position.z;
      const fl = Math.hypot(fx, fz) || 1;
      const ffx = fx / fl;
      const ffz = fz / fl;
      const rx = ffz;
      const rz = -ffx;
      wishx = ffx * key.z + rx * key.x;
      wishz = ffz * key.z + rz * key.x;
      const wl = Math.hypot(wishx, wishz) || 1;
      wishx /= wl;
      wishz /= wl;
    } else if (hasGoal) {
      wishx = goal.x - ctrl.x;
      wishz = goal.z - ctrl.z;
      const wl = Math.hypot(wishx, wishz);
      if (wl < 0.18) {
        hasGoal = false;
        wishx = 0;
        wishz = 0;
      } else {
        wishx /= wl;
        wishz /= wl;
      }
    } else if (demoWalk) {
      if (ctrl.x > 3.3) autoDir = -1;
      if (ctrl.x < -3.3) autoDir = 1;
      wishx = autoDir;
      wishz = 0;
    }

    velx = wishx * SPEED;
    velz = wishz * SPEED;
    ctrl.x += velx * dt;
    ctrl.z += velz * dt;
    const rad = Math.hypot(ctrl.x, ctrl.z);
    if (rad > LIMIT) {
      const ox = ctrl.x / rad;
      const oz = ctrl.z / rad;
      ctrl.x = ox * LIMIT;
      ctrl.z = oz * LIMIT;
      const outward = velx * ox + velz * oz;
      if (outward > 0) {
        velx -= ox * outward;
        velz -= oz * outward;
      }
    }

    const movedX = ctrl.x - prev.x;
    const movedZ = ctrl.z - prev.z;
    const moved = Math.hypot(movedX, movedZ);
    const speed = dt > 0 ? moved / dt : 0;
    const moving = speed > 0.25;
    if (moved > 0.0008) yaw = dampAngle(yaw, Math.atan2(movedX, movedZ), 10, dt);
    prev.copy(ctrl);
    velx = dt > 0 ? movedX / dt : 0;
    velz = dt > 0 ? movedZ / dt : 0;

    if (jumpEdge) {
      jumpEdge = false;
      if (hop.grounded) {
        hop.grounded = false;
        hop.vy = 5.6;
      }
    }
    if (!hop.grounded) {
      hop.vy -= 16 * dt;
      hop.y += hop.vy * dt;
      if (hop.y <= 0) {
        hop.y = 0;
        hop.vy = 0;
        hop.grounded = true;
        land = 1.35;
        burst(ctrl.x, ctrl.z);
        feet.forEach(function (foot) {
          if (foot.planted) return;
          placeFootTarget(foot, foot.pos, 0.02);
          foot.planted = true;
          foot.swing = 1;
          foot.pos.y = FOOT_Y;
          foot.pop = 1;
        });
      }
    }

    feet.forEach(function (foot, index) {
      const other = feet[1 - index];
      socketAt(foot, foot.sock);
      if (!hop.grounded) {
        const dist = foot.sock.distanceTo(foot.pos);
        if (foot.planted && dist > preset.release) foot.planted = false;
        if (foot.planted) {
          foot.pos.y = FOOT_Y;
          return;
        }
        localToWorld(foot.side * 0.14, Math.max(FOOT_Y, hop.y + 0.1), 0.04, hover);
        const k = 1 - Math.exp(-9 * dt);
        foot.pos.x += (hover.x - foot.pos.x) * k;
        foot.pos.y += (hover.y - foot.pos.y) * k;
        foot.pos.z += (hover.z - foot.pos.z) * k;
        if (foot.pos.y < FOOT_Y) foot.pos.y = FOOT_Y;
        foot.yaw = dampAngle(foot.yaw, yaw, 10, dt);
        return;
      }
      if (!foot.planted) {
        foot.swing += dt / foot.dur;
        const t = Math.min(foot.swing, 1);
        const s = 1 - Math.pow(1 - t, 3);
        foot.pos.x = foot.from.x + (foot.to.x - foot.from.x) * s;
        foot.pos.z = foot.from.z + (foot.to.z - foot.from.z) * s;
        foot.pos.y = FOOT_Y + Math.sin(Math.PI * t) * preset.arc;
        foot.yaw = dampAngle(foot.yaw, yaw, 14, dt);
        if (t >= 1) {
          foot.planted = true;
          foot.pos.x = foot.to.x;
          foot.pos.z = foot.to.z;
          foot.pos.y = FOOT_Y;
          foot.yaw = yaw;
          foot.pop = 1;
          land = 1;
          burst(foot.pos.x, foot.pos.z);
        }
        return;
      }
      foot.pos.y = FOOT_Y;
      const dist = foot.sock.distanceTo(foot.pos);
      if (moving) {
        const otherBusy = !other.planted;
        if (dist > preset.release * 1.6 || (dist > preset.release && !otherBusy)) {
          beginSwing(foot, 0.22, preset.swing);
        }
      } else {
        placeFootTarget(foot, hitPoint, 0.02);
        const hd = Math.hypot(foot.pos.x - hitPoint.x, foot.pos.z - hitPoint.z);
        if (hd > 0.22 && (other.planted || hd > 0.55)) beginSwing(foot, 0.02, preset.swing + 0.08);
      }
    });

    let maxDist = REST;
    feet.forEach(function (foot) {
      if (!foot.planted) return;
      socketAt(foot, foot.sock);
      maxDist = Math.max(maxDist, foot.sock.distanceTo(foot.pos));
    });
    lastStretch = maxDist / REST;
    const dip = hop.grounded ? THREE.MathUtils.clamp((maxDist - REST) / 1.15, 0, 1) : 0;
    const hipTarget = BASE_HIP - dip * 0.1;
    hipShown = THREE.MathUtils.damp(hipShown, hipTarget, 16, dt);
    land = Math.max(0, land - dt * 5);

    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lx = velx * c - velz * s;
    const lz = velx * s + velz * c;
    headLag.x = THREE.MathUtils.damp(headLag.x, -lx * 0.02, 6, dt);
    headLag.z = THREE.MathUtils.damp(headLag.z, -lz * 0.035, 6, dt);

    rig.position.set(ctrl.x, hop.y, ctrl.z);
    rig.rotation.set(0, yaw, 0);
    const sq = land * 0.12;
    const rise = hop.grounded ? 0 : THREE.MathUtils.clamp(hop.vy * 0.035, -0.1, 0.14);
    body.position.set(0, hipShown, 0);
    body.scale.set(
      Math.max(0.72, 1 + sq - rise),
      Math.max(0.72, 1 - sq + rise),
      Math.max(0.72, 1 + sq - rise)
    );
    head.position.set(headLag.x, hipShown + 0.4, headLag.z);
    bob.rotation.x = THREE.MathUtils.damp(bob.rotation.x, THREE.MathUtils.clamp(speed * 0.035 + dip * 0.2, 0, 0.28), 8, dt);
    armL.position.set(-0.26, hipShown + 0.08, 0.16);
    armR.position.set(0.26, hipShown + 0.08, 0.16);

    feet.forEach(function (foot) {
      socketAt(foot, foot.sock);
      const dist = foot.sock.distanceTo(foot.pos);
      const stretch01 = THREE.MathUtils.clamp((dist - REST) / Math.max(0.2, preset.release - REST), 0, 1);
      const slack = THREE.MathUtils.clamp(1 - (dist - REST) / 0.55, 0, 1);
      ankle.copy(foot.pos);
      knee.copy(foot.sock).lerp(ankle, 0.45);
      knee.y -= 0.16 * slack;
      knee.x += foot.side * c * 0.07 * slack;
      knee.z += -foot.side * s * 0.07 * slack;
      for (let i = 0; i < POINT_COUNT; i++) {
        const t = i / (POINT_COUNT - 1);
        const u = 1 - t;
        const pt = curvePts[i];
        pt.set(
          u * u * foot.sock.x + 2 * u * t * knee.x + t * t * ankle.x,
          u * u * foot.sock.y + 2 * u * t * knee.y + t * t * ankle.y,
          u * u * foot.sock.z + 2 * u * t * knee.z + t * t * ankle.z
        );
      }
      updateRope(foot.rope, curvePts, stretch01);
      foot.pop = Math.max(0, foot.pop - dt * 6);
      const pop = foot.pop * 0.18;
      foot.mesh.position.set(
        foot.pos.x + Math.sin(foot.yaw) * 0.03,
        foot.pos.y,
        foot.pos.z + Math.cos(foot.yaw) * 0.03
      );
      foot.mesh.rotation.set(0, foot.yaw, 0);
      foot.mesh.scale.set(1 + pop, 0.42 - pop * 0.1, 1.3 + pop);
      const fz = (foot.pos.x - ctrl.x) * s + (foot.pos.z - ctrl.z) * c;
      const arm = foot.side < 0 ? armL : armR;
      const lift = hop.grounded ? 0 : 0.75;
      const holding = held === 'axe' && foot.side > 0;
      const chopArc = holding && chopT > 0 ? Math.sin((1 - chopT / 0.36) * Math.PI) * 1.35 : 0;
      const swing = THREE.MathUtils.clamp(-fz * 0.35, -0.22, 0.22);
      if (holding && chopT <= 0) {
        arm.rotation.z = 0.55;
        arm.rotation.x = -0.55 + swing - lift;
      } else {
        arm.rotation.z = arm.userData.side * 0.18;
        arm.rotation.x = arm.userData.restX + swing - lift - chopArc;
      }
    });

    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= dt * 3;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      const k = Math.max(p.life, 0) / 0.3;
      p.mesh.scale.setScalar(0.4 + k);
      p.mesh.material = puffMat;
      if (p.life <= 0) p.mesh.visible = false;
    }

    updateAxe();
    updateLogs(dt);
    updateTrees(dt);
    refreshQuest();

    blob.position.set(ctrl.x, 0.03, ctrl.z);
    blob.scale.setScalar((1 + dip * 0.35) / (1 + hop.y * 1.4));

    if (camHold.l || keys.has('KeyQ')) cam.yaw += dt * 1.7;
    if (camHold.r || keys.has('KeyE')) cam.yaw -= dt * 1.7;
    if (camHold.up || keys.has('KeyR')) cam.pitch += dt * 0.7;
    if (camHold.down || keys.has('KeyF')) cam.pitch -= dt * 0.7;
    if (camHold.inn) cam.dist -= dt * 2.2;
    if (camHold.out) cam.dist += dt * 2.2;
    clampCam();

    const lookY = 0.55 + hop.y * 0.18;
    const horiz = Math.cos(cam.pitch) * cam.dist;
    camDesired.set(
      ctrl.x + Math.sin(cam.yaw) * horiz,
      lookY + Math.sin(cam.pitch) * cam.dist,
      ctrl.z + Math.cos(cam.yaw) * horiz
    );
    if (!camReady) {
      camera.position.copy(camDesired);
      camReady = true;
    } else {
      camera.position.lerp(camDesired, 1 - Math.exp(-12 * dt));
    }
    camera.lookAt(ctrl.x, lookY, ctrl.z);

    dir.position.set(ctrl.x + 4.5, 9, ctrl.z + 2.5);
    dirTarget.position.set(ctrl.x, 0.4, ctrl.z);

    const shown = lastStretch;
    stretchEl.textContent = '后腿拉到 ' + shown.toFixed(2) + ' 倍 · ' + preset.name;
    document.getElementById('barFill').style.width = Math.min(100, (shown / 3) * 100) + '%';

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  clock.getDelta();
  requestAnimationFrame(frame);

  window.__sticky = {
    setPreset: setPreset,
    ctrl: ctrl,
    feet: feet,
    cam: cam,
    quest: quest,
    trees: trees,
    logs: logs,
    goChop: function (index) {
      demoWalk = false;
      job = { type: 'chop', tree: trees[index] };
    },
    goBuild: function () {
      demoWalk = false;
      job = { type: 'build' };
    },
    held: function () { return held; },
    pressAct: pressAct,
    pressDrop: pressDrop,
    axePose: function () {
      const handPos = new THREE.Vector3();
      const axePos = new THREE.Vector3();
      armR.userData.hand.getWorldPosition(handPos);
      axe.getWorldPosition(axePos);
      return {
        hand: [handPos.x, handPos.y, handPos.z],
        axe: [axePos.x, axePos.y, axePos.z],
        armX: armR.rotation.x,
        armZ: armR.rotation.z,
      };
    },
    jump: function () {
      jumpEdge = true;
    },
    stretch: function () {
      return lastStretch;
    },
  };
})();
