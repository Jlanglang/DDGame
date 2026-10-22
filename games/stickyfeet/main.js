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
  let yaw = 0;
  let hipShown = BASE_HIP;
  let land = 0;
  let velx = 0;
  let velz = 0;
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

  function tree(x, z, scale) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.48, 8), barkMat);
    trunk.position.set(x, 0.24, z);
    trunk.castShadow = true;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.42 * scale, 16, 12), leafMat);
    top.position.set(x, 0.62 + scale * 0.15, z);
    top.scale.y = 0.82;
    top.castShadow = true;
    scene.add(trunk, top);
  }
  tree(6.2, 2.1, 1.1);
  tree(-5.4, 3.6, 1.25);
  tree(3.4, -6.1, 1);
  tree(-6.3, -2.6, 1.15);
  tree(6.8, -2.4, 0.9);
  tree(-1.8, 6.6, 1.05);

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
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), skin);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), skin);
    lower.position.y = -0.14;
    arm.add(upper, lower);
    arm.rotation.z = side * -0.55;
    bob.add(arm);
    return arm;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

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
  const camDesired = new THREE.Vector3();
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

  function aim(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(ground, hitPoint);
    if (!hit) return;
    goal.copy(hitPoint);
    hasGoal = true;
  }

  canvas.addEventListener('pointerdown', function (event) {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus();
    event.preventDefault();
    aim(event);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (event.pointerId !== pointerId) return;
    aim(event);
  });
  function endPointer(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
  }
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
    if (/^(Key[WASD]|Arrow)/.test(event.code)) event.preventDefault();
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

  function frame() {
    const dt = Math.min(clock.getDelta() || 0.016, 0.033);
    const preset = PRESETS[presetIndex];
    const key = keyAxis();
    let wishx = 0;
    let wishz = 0;

    if (key.on) {
      hasGoal = false;
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
    } else if (autowalk) {
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

    feet.forEach(function (foot, index) {
      const other = feet[1 - index];
      localToWorld(foot.side * 0.16, hipShown - SOCKET_DROP, 0, foot.sock);
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
      localToWorld(foot.side * 0.16, hipShown - SOCKET_DROP, 0, foot.sock);
      maxDist = Math.max(maxDist, foot.sock.distanceTo(foot.pos));
    });
    lastStretch = maxDist / REST;
    const dip = THREE.MathUtils.clamp((maxDist - REST) / 1.15, 0, 1);
    const hipTarget = BASE_HIP - dip * 0.1;
    hipShown = THREE.MathUtils.damp(hipShown, hipTarget, 16, dt);
    land = Math.max(0, land - dt * 5);

    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const lx = velx * c - velz * s;
    const lz = velx * s + velz * c;
    headLag.x = THREE.MathUtils.damp(headLag.x, -lx * 0.02, 6, dt);
    headLag.z = THREE.MathUtils.damp(headLag.z, -lz * 0.035, 6, dt);

    rig.position.set(ctrl.x, 0, ctrl.z);
    rig.rotation.set(0, yaw, 0);
    const sq = land * 0.12;
    body.position.set(0, hipShown, 0);
    body.scale.set(1 + sq, 1 - sq, 1 + sq);
    head.position.set(headLag.x, hipShown + 0.4, headLag.z);
    bob.rotation.x = THREE.MathUtils.damp(bob.rotation.x, THREE.MathUtils.clamp(speed * 0.035 + dip * 0.2, 0, 0.28), 8, dt);
    armL.position.set(-0.3, hipShown + 0.02, 0.02);
    armR.position.set(0.3, hipShown + 0.02, 0.02);

    feet.forEach(function (foot) {
      localToWorld(foot.side * 0.16, hipShown - SOCKET_DROP, 0, foot.sock);
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
      arm.rotation.x = THREE.MathUtils.clamp(-fz * 1.1, -0.9, 0.9);
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

    blob.position.set(ctrl.x, 0.03, ctrl.z);
    blob.scale.setScalar(1 + dip * 0.35);

    const back = 1.15;
    const side = 2.85;
    camDesired.set(
      ctrl.x - Math.sin(yaw) * back + Math.cos(yaw) * side,
      0.95,
      ctrl.z - Math.cos(yaw) * back - Math.sin(yaw) * side
    );
    if (!camReady) {
      camera.position.copy(camDesired);
      camReady = true;
    } else {
      camera.position.lerp(camDesired, 1 - Math.exp(-4 * dt));
    }
    camera.lookAt(ctrl.x, 0.5, ctrl.z);

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
    stretch: function () {
      return lastStretch;
    },
  };
})();
