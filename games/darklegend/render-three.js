/* 豆豆暗黑传奇 · Three.js HD-2D 视图（接真游戏状态）
   只读 DL.ThreeBridge 的状态，点击交给游戏自己的 handleCellClick。
   不做阴影、不做遮挡：房子/道具/树永远在角色后面，玩家永远可见。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const Pick = DL.ThreePick;
  if (!Pick) return;

  const CELL = Pick.CELL_PX;          // 48 px / 格
  const MOB_ROW = {
    chicken: 0, scarecrow: 1, dog: 2, boar: 3, wolf: 4, spider: 5,
    stone: 6, bandit: 7, ghoul: 8, mummy: 9, bat: 10, demon: 11, wraith: 12,
  };

  let B = null;                       // 游戏桥
  let on = false;
  let renderer = null;
  let scene = null;
  let camera = null;
  let canvas = null;
  let low = false;
  let zoom = 1;
  let look = { x: 12, z: 12 };
  let roomKey = '';
  let ground = null;
  let group = null;                   // 当前房间的所有立牌
  let hero = null;
  let heroTex = null;
  let portalGroup = null;
  let lastStrike = 0;
  let spritesReady = false;
  let mini = null;
  let statsEl = null;
  let showStats = false;
  const textures = {};
  const frameCache = {};

  function wanted() {
    const q = (global.location && global.location.search) || '';
    if (/(?:^|[?&])engine=canvas(?:&|$)/.test(q)) return false;
    return /(?:^|[?&])engine=three(?:&|$)/.test(q);
  }

  function active() { return on; }

  function fail(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);background:#101623;color:#eef2fa;padding:16px 18px;z-index:8;border-radius:10px;max-width:320px;text-align:center;line-height:1.5;';
    document.body.appendChild(d);
  }

  function texOfCanvas(c) {
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    return t;
  }

  // 从图集切一张帧纹理（每张 sprite 自己克隆，offset 互不影响）
  function frameTex(key, cols, rows, col, row) {
    const ck = key + ':' + cols + ':' + rows + ':' + col + ':' + row;
    if (frameCache[ck]) return frameCache[ck];
    const im = DL.Assets && DL.Assets.image(key);
    if (!im) return null;
    if (!textures[key]) {
      const t = new THREE.Texture(im);
      if ('colorSpace' in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      textures[key] = t;
    }
    const t = textures[key].clone();
    t.needsUpdate = true;
    t.repeat.set(1 / cols, 1 / rows);
    t.offset.set(col / cols, 1 - (row + 1) / rows);
    frameCache[ck] = t;
    return t;
  }

  function billboard(tex, w, h, order) {
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    m.position.y = h / 2;
    return m;
  }

  // ---------- 地面 ----------

  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function shade(hex, d) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + d));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + d));
    const b = Math.max(0, Math.min(255, (n & 255) + d));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function paintGround() {
    const map = B.map();
    const terrain = B.terrain && B.terrain();
    const W = map[0].length;
    const H = map.length;
    const px = (W > 48 || H > 48) ? 4 : CELL;
    const c = document.createElement('canvas');
    c.width = W * px;
    c.height = H * px;
    const g = c.getContext('2d');
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let base = '#6fb446';
        if (terrain && terrain[y] && terrain[y][x] === 1) base = '#c6a15c';
        if (map[y][x] === 1) base = '#7a766c';
        if (map[y][x] === 2) base = '#d0a040';
        const d = (hash(x, y) % 9) - 4;
        g.fillStyle = shade(base, d * 2);
        g.fillRect(x * px, y * px, px, px);
        if (map[y][x] === 1) {
          g.strokeStyle = 'rgba(0,0,0,0.28)';
          g.strokeRect(x * px + 1, y * px + 1, px - 2, px - 2);
        }
      }
    }
    // 地图外圈压暗一点，别直接切到天空色
    g.strokeStyle = 'rgba(20,40,16,0.55)';
    g.lineWidth = 8;
    g.strokeRect(0, 0, c.width, c.height);
    return c;
  }

  function buildGround() {
    if (ground) {
      scene.remove(ground);
      ground.geometry.dispose();
      ground.material.map.dispose();
      ground.material.dispose();
    }
    const map = B.map();
    const W = map[0].length;
    const H = map.length;
    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ map: texOfCanvas(paintGround()), depthTest: false, depthWrite: false, side: THREE.DoubleSide })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, 0, H / 2);
    ground.renderOrder = -10;
    scene.add(ground);
  }

  // ---------- 道具 / NPC / 怪 ----------

  function clearGroup() {
    if (!group) return;
    while (group.children.length) {
      const m = group.children.pop();
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        m.material.dispose();
      }
    }
    scene.remove(group);
    group = null;
  }

  function addProp(p) {
    const sheet = p.sheet === 'town' ? 'town' : 'flora';
    const cols = 4;
    const rows = 4;
    const col = (p.index || 0) % cols;
    const row = ((p.index || 0) / cols) | 0;
    const tex = frameTex(sheet, cols, rows, col, row);
    if (!tex) return;
    const w = (p.w || 128) / CELL;
    const h = (p.h || 128) / CELL;
    const m = billboard(tex, w, h, 1);
    m.position.y -= 0.2;
    m.position.x = p.x + 0.5 + (p.ox || 0) / CELL;
    m.position.z = p.y + 0.5 + (p.oy || 0) / CELL;
    group.add(m);
  }

  function addPerson(key, col, row, gx, gy, order) {
    const tex = frameTex(key, 4, key === 'npc' ? 2 : 5, col, row);
    if (!tex) return null;
    const m = billboard(tex, 96 / CELL, 96 / CELL, order);
    m.position.y -= 0.2;
    m.position.x = gx + 0.5;
    m.position.z = gy + 0.5;
    m.userData.frame = { key: key, cols: 4, rows: key === 'npc' ? 2 : 5 };
    group.add(m);
    return m;
  }

  function addEnemy(e) {
    const isBoss = !!e.boss;
    let key, cols, rows, row, col;
    if (isBoss) {
      key = 'bosses';
      cols = 4; rows = 4;
      const room = B.room();
      row = room === 'cave3' ? 1 : room === 'cave2' ? 2 : room === 'field7' ? 3 : 0;
      col = 0;
    } else {
      key = 'mobs';
      cols = 8; rows = 7;
      row = MOB_ROW[e.id] != null ? MOB_ROW[e.id] : 0;
      col = 0;
    }
    const tex = frameTex(key, cols, rows, col, row);
    if (!tex) return;
    const px = isBoss ? 192 : 96;
    const m = billboard(tex, px / CELL, px / CELL, 3);
    m.position.y -= isBoss ? 0.4 : 0.2;
    m.position.x = e.x + 0.5;
    m.position.z = e.y + 0.5;
    m.userData.enemy = e;
    m.userData.sheet = { key: key, cols: cols, rows: rows, row: row, boss: isBoss };
    group.add(m);
  }

  function addBag(b) {
    const order = ['white', 'blue', 'yellow', 'orange'];
    let best = 0;
    for (const eq of b.items || []) {
      const i = order.indexOf(eq.rarity);
      if (i > best) best = i;
    }
    const tex = frameTex('pickups', 5, 1, b.relic ? 4 : best, 0);
    if (!tex) return;
    const m = billboard(tex, 64 / CELL, 64 / CELL, 2);
    m.position.x = b.x + 0.5;
    m.position.z = b.y + 0.5;
    m.userData.bag = b;
    group.add(m);
  }

  function addPortal(p) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 160;
    const g = c.getContext('2d');
    const color = p.kind === 'exit' ? '#5fe0c0' : p.kind === 'boss' ? '#e04a4a' : '#f0c840';
    const grd = g.createRadialGradient(64, 96, 4, 64, 96, 62);
    grd.addColorStop(0, color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(64, 96, 62, 0, Math.PI * 2);
    g.fill();
    g.font = 'bold 20px system-ui';
    g.textAlign = 'center';
    g.fillStyle = color;
    g.fillText(p.label || (p.kind === 'exit' || p.kind === 'boss' ? '出口' : '传送门'), 64, 30);
    const tex = texOfCanvas(c);
    const m = billboard(tex, 128 / CELL, 160 / CELL, 2);
    m.position.x = p.x + 0.5;
    m.position.z = p.y + 0.5;
    portalGroup.add(m);
  }

  function assetsReady() {
    const A = DL.Assets;
    if (!A || !A.ready) return false;
    return ['player', 'mobs', 'bosses', 'npc', 'pickups', 'flora', 'town'].every((k) => A.ready(k));
  }

  function dropMesh(m) {
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }

  function dropHero() {
    if (!hero) return;
    scene.remove(hero);
    dropMesh(hero);
    hero = null;
  }

  function rebuildRoom() {
    clearGroup();
    dropHero();
    if (portalGroup) { scene.remove(portalGroup); portalGroup = null; }
    portalGroup = new THREE.Group();
    scene.add(portalGroup);
    group = new THREE.Group();
    scene.add(group);
    if (!B) return;

    buildGround();
    if (!assetsReady()) {
      spritesReady = false;
      return;
    }

    (B.props() || []).forEach(addProp);

    const npcs = [
      [B.npc && B.npc(), 0],
      [B.trialNpc && B.trialNpc(), 1],
      [B.bookNpc && B.bookNpc(), 2],
      [B.stashNpc && B.stashNpc(), 3],
    ];
    npcs.forEach(([n, col]) => {
      if (n) addPerson('npc', col, 0, n.x, n.y, 3);
    });

    (B.enemies() || []).filter((e) => e.hp > 0).forEach(addEnemy);
    (B.bags() || []).forEach(addBag);

    if (B.room() === 'hub') {
      (B.doors() || []).forEach((d) => addPortal({ x: d.x, y: d.y, kind: 'door', label: d.name || '传送门' }));
    } else if (B.back()) {
      const boss = (B.enemies() || []).some((e) => e.boss && e.hp > 0);
      addPortal({ x: B.back().x, y: B.back().y, kind: boss ? 'boss' : 'exit', label: '出口' });
    }

    heroTex = frameTex('player', 4, 5, 0, 0);
    if (heroTex) {
      hero = billboard(heroTex, 128 / CELL, 128 / CELL, 4);
      hero.position.y -= 0.25;
      scene.add(hero);
    }
    spritesReady = true;
  }

  // ---------- 相机 ----------

  function placeCamera() {
    const s = Math.sin(Pick.PITCH);
    const c = Math.cos(Pick.PITCH);
    const dist = 24;
    camera.position.set(look.x, dist * s, look.z + dist * c);
    camera.up.set(0, 1, 0);
    camera.lookAt(look.x, 0, look.z);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }

  function fit() {
    const vw = global.innerWidth || Pick.VIEW_W;
    const vh = global.innerHeight || Pick.VIEW_H;
    const target = Pick.VIEW_W / Pick.VIEW_H;
    let w, h;
    if (vw / vh > target) { h = vh; w = h * target; } else { w = vw; h = w / target; }
    canvas.style.width = Math.round(w) + 'px';
    canvas.style.height = Math.round(h) + 'px';
    const hint = document.getElementById('turnHint');
    if (hint) hint.hidden = !(vh > vw + 40);
    renderer.setPixelRatio(low ? 1 : Math.min(global.devicePixelRatio || 1, 2));
    renderer.setSize(Pick.VIEW_W, Pick.VIEW_H, false);
  }

  // ---------- 每帧 ----------

  function syncFrame(m, key, cols, rows, col, row) {
    const tex = frameTex(key, cols, rows, col, row);
    if (!tex || m.material.map === tex) return;
    m.material.map = tex;
    m.material.needsUpdate = true;
  }

  function drawMini() {
    if (!mini || !B) return;
    const map = B.map();
    const g = mini.getContext('2d');
    const w = mini.width;
    const h = mini.height;
    g.fillStyle = '#101623';
    g.fillRect(0, 0, w, h);
    const mw = map[0].length;
    const mh = map.length;
    const s = Math.min((w - 8) / mw, (h - 8) / mh);
    const ox = (w - mw * s) / 2;
    const oy = (h - mh * s) / 2;
    const terrain = B.terrain && B.terrain();
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (map[y][x] === 1) g.fillStyle = '#7a766c';
        else if (map[y][x] === 2) g.fillStyle = '#f0c840';
        else if (terrain && terrain[y] && terrain[y][x] === 1) g.fillStyle = '#c6a15c';
        else g.fillStyle = '#3e7a32';
        g.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s));
      }
    }
    const P = B.P();
    g.fillStyle = '#ffffff';
    g.fillRect(ox + P.x * s, oy + P.y * s, Math.max(2, s), Math.max(2, s));
  }

  function tick() {
    if (!B) return;
    const t0 = performance.now();
    const P = B.P();
    const now = t0;

    const room = B.room() + '|' + B.map()[0].length + 'x' + B.map().length;
    if (room !== roomKey) {
      roomKey = room;
      spritesReady = false;
      rebuildRoom();
      look.x = P.x + 0.5;
      look.z = P.y + 0.5;
    }
    if (!spritesReady && assetsReady()) {
      spritesReady = true;
      rebuildRoom();
    }

    // 相机平滑
    look.x += (P.x + 0.5 - look.x) * 0.2;
    look.z += (P.y + 0.5 - look.z) * 0.2;
    placeCamera();

    // 主角位置/朝向
    if (hero) {
      hero.position.x = P.x + 0.5;
      hero.position.z = P.y + 0.5;
      const row = { d: 0, l: 1, r: 2, u: 3 }[P.dir] || 0;
      let col;
      if (now - (B.strikeAt ? B.strikeAt() : 0) < 260) col = 3;
      else if (B.walking && B.walking()) col = 1 + (Math.floor(now / 160) % 2);
      else col = 0;
      syncFrame(hero, 'player', 4, 5, col, row);
    }

    // 怪物：位置/帧/死亡清理
    if (group) {
      for (let i = group.children.length - 1; i >= 0; i--) {
        const m = group.children[i];
        const e = m.userData.enemy;
        if (!e) continue;
        if (e.hp <= 0) {
          group.remove(m);
          if (m.geometry) m.geometry.dispose();
          if (m.material) m.material.dispose();
          continue;
        }
        m.position.x = e.x + 0.5;
        m.position.z = e.y + 0.5;
        const s = m.userData.sheet;
        if (!s.boss) {
          const col = Math.floor(now / 420) % 2;
          syncFrame(m, s.key, s.cols, s.rows, col, s.row);
        }
      }

      // 新刷的怪补立牌
      const enemies = B.enemies() || [];
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        let found = false;
        for (const m of group.children) {
          if (m.userData.enemy === e) { found = true; break; }
        }
        if (!found) addEnemy(e);
      }

      // 袋子：新增补立牌，捡走的移除
      const bags = B.bags() || [];
      const bagSet = new Set(bags);
      for (let i = group.children.length - 1; i >= 0; i--) {
        const m = group.children[i];
        if (m.userData.bag && !bagSet.has(m.userData.bag)) {
          group.remove(m);
          if (m.geometry) m.geometry.dispose();
          if (m.material) m.material.dispose();
        }
      }
      for (const b of bags) {
        let found = false;
        for (const m of group.children) {
          if (m.userData.bag === b) { found = true; break; }
        }
        if (!found) addBag(b);
      }
    }

    drawMini();
    renderer.render(scene, camera);
    if (showStats && statsEl) {
      const info = renderer.info.render;
      statsEl.textContent = 'frame ' + (performance.now() - t0).toFixed(2) + ' ms  draws ' + info.calls + '  tris ' + info.triangles;
    }
  }

  // ---------- 输入 ----------

  function pointer(e) {
    if (!on || !canvas || !B) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const hit = Pick.groundHit(look.x, look.z, nx, ny, zoom);
    const cell = Pick.cellOf(hit.x, hit.z);
    B.clickCell(cell.x, cell.y);
  }

  // ---------- 启动 ----------

  function boot() {
    if (on || !wanted() || !B) return;
    canvas = document.getElementById('view3d');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'view3d';
      document.body.appendChild(canvas);
    }
    canvas.hidden = false;
    const gameCanvas = document.getElementById('game');
    if (gameCanvas) gameCanvas.hidden = true;
    document.body.classList.add('engine-three');
    const intro = document.getElementById('intro');
    if (intro) intro.hidden = true;
    const gate = document.getElementById('sfxGate');
    if (gate) gate.hidden = true;

    const q = (global.location && global.location.search) || '';
    low = /(?:^|[?&])quality=low(?:&|$)/.test(q);
    const m = q.match(/(?:^|[?&])shot=([^&]+)/);
    const shot = m ? decodeURIComponent(m[1]) : '';
    if (shot === 'wide' || shot === '3') zoom = 0.55;

    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !low, alpha: false });
    } catch (err) {
      fail('这个浏览器开不了 3D。地址加上 ?engine=canvas 能回到原来的画面。');
      return;
    }
    renderer.setClearColor('#7eb6e6', 1);
    renderer.shadowMap.enabled = false;
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    camera = new THREE.OrthographicCamera(
      -Pick.FRUSTUM_W / 2, Pick.FRUSTUM_W / 2,
      Pick.FRUSTUM_H / 2, -Pick.FRUSTUM_H / 2,
      0.1, 240
    );
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    canvas.addEventListener('pointerdown', (e) => {
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      pointer(e);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      fail('3D 中断了。刷新，或加上 ?engine=canvas 回到原来的画面。');
    });
    global.addEventListener('resize', fit);

    const P = B.P();
    look = { x: P.x + 0.5, z: P.y + 0.5 };
    mini = document.createElement('canvas');
    mini.width = 180;
    mini.height = 180;
    mini.style.cssText = 'position:fixed;right:12px;top:60px;width:180px;height:180px;z-index:6;border:1px solid rgba(150,176,220,.35);background:#101623;pointer-events:none;';
    document.body.appendChild(mini);
    showStats = /(?:^|[?&])stats=1(?:&|$)/.test(q);
    if (showStats) {
      statsEl = document.createElement('div');
      statsEl.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:6;color:#eef2fa;background:rgba(8,12,20,.72);padding:6px 8px;font:12px ui-monospace,monospace;pointer-events:none;';
      document.body.appendChild(statsEl);
    }
    on = true;
    fit();
    placeCamera();
    roomKey = '';
    const loop = () => {
      if (!on) return;
      try {
        tick();
      } catch (err) {
        on = false;
        console.error(err);
        fail('3D 渲染出错：' + (err && err.message ? err.message : err));
        return;
      }
      global.requestAnimationFrame(loop);
    };
    loop();
  }

  DL.ThreeView = {
    active: active,
    bind: function (bridge) {
      B = bridge;
      if (wanted() && !on) {
        try { boot(); } catch (err) { console.error(err); fail('3D 启动失败：' + (err && err.message ? err.message : err)); }
      }
    },
    boot: boot,
    pointer: pointer,
  };

  if (wanted() && global.document) {
    const start = () => { if (B) boot(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
