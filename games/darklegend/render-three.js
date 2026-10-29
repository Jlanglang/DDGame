/* 豆豆暗黑传奇 · Three.js 2.5D 视图（接真游戏状态）
   只读 DL.ThreeBridge 的状态，点击交给游戏自己的 handleCellClick。
   地面是 2:1 菱形瓦片。立地物体脚下有同一方向的椭圆接触阴影。
   相机固定 45° 正交，不旋转。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const Pick = DL.ThreePick;
  if (!Pick) return;

  const CELL = Pick.CELL_PX;          // 48 px / 格

  let B = null;                       // 游戏桥
  let on = false;
  let renderer = null;
  let scene = null;
  let sun = null;
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
  let groundPainted = '';
  let tags = null;
  let tagVec = null;
  let mini = null;
  let miniBase = null;
  let miniKey = '';
  let statsEl = null;
  let glLost = false;
  let showStats = false;

  // 只剩 3D：不再有 2D Canvas 回退。file:// 也能跑（2026-10-29 起所有贴图都是程序化画布，
  // 不再从本地 PNG 上传纹理，WebGL 不会被 CORS 拦）。
  function wanted() {
    if (typeof THREE === 'undefined' || !THREE.WebGLRenderer) return false;
    return true;
  }

  function active() { return on; }

  function fail(msg) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);background:#101623;color:#eef2fa;padding:16px 18px;z-index:8;border-radius:10px;max-width:320px;text-align:center;line-height:1.5;';
    const p = document.createElement('div');
    p.textContent = msg;
    d.appendChild(p);
    document.body.appendChild(d);
  }

  function texOfCanvas(c, sprite) {
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    if (sprite) {
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    } else {
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1;
    }
    t.needsUpdate = true;
    return t;
  }

  const paintedTex = {};
  function paintTex(key, make) {
    if (paintedTex[key]) return paintedTex[key];
    paintedTex[key] = texOfCanvas(make(), true);
    return paintedTex[key];
  }

  let heroSheetTex = null;
  const heroFrames = {};
  function heroFrame(col, row) {
    const Hd = DL.HdDraw;
    // 素材库已清空：主角只走 hd-draw 的程序化图，PNG 图集等重建后再接
    if (!Hd || !Hd.heroSheet) return null;
    const ck = col + ':' + row;
    if (heroFrames[ck]) return heroFrames[ck];
    if (!heroSheetTex) {
      heroSheetTex = new THREE.Texture(Hd.heroSheet());
      if ('colorSpace' in heroSheetTex && THREE.SRGBColorSpace) heroSheetTex.colorSpace = THREE.SRGBColorSpace;
      heroSheetTex.magFilter = THREE.LinearFilter;
      heroSheetTex.minFilter = THREE.LinearFilter;
      heroSheetTex.generateMipmaps = false;
      heroSheetTex.needsUpdate = true;
    }
    const t = heroSheetTex.clone();
    t.needsUpdate = true;
    t.repeat.set(1 / 4, 1 / 5);
    t.offset.set(col / 4, 1 - (row + 1) / 5);
    heroFrames[ck] = t;
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

  // 接触阴影：深棕软边椭圆。屏幕上高 ≈ 宽 × 0.35，统一向右下偏 3px（光源在左上）。
  // 全部影子合成一次绘制，避免每只脚下一张网格把帧时间顶过 4ms。
  // 贴地做法同 cinematic.js 的 decal()：Plane 绕 X 转 -90° 躺在地面上。
  const SHADOW_OX = 3 / CELL;
  const SHADOW_OZ = 3 / (CELL * Math.sin(Math.PI / 4));
  const SHADOW_MAX = 256;
  const shadowDummy = new THREE.Object3D();
  let shadowLayer = null;
  let shadowGeo = null;
  let shadowMat = null;
  let shadowMesh = null;

  function ensureShadow() {
    if (shadowMesh && shadowMesh.parent) return;
    if (!shadowLayer) return;
    if (!shadowMat) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
      grd.addColorStop(0, 'rgba(59,47,38,1)');
      grd.addColorStop(0.4, 'rgba(59,47,38,0.7)');
      grd.addColorStop(0.72, 'rgba(59,47,38,0.22)');
      grd.addColorStop(1, 'rgba(59,47,38,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      shadowGeo = new THREE.PlaneGeometry(1, 1);
      shadowMat = new THREE.MeshBasicMaterial({
        map: texOfCanvas(c, true),
        color: 0xffffff,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      if ('toneMapped' in shadowMat) shadowMat.toneMapped = false;
    }
    shadowMesh = new THREE.InstancedMesh(shadowGeo, shadowMat, SHADOW_MAX);
    shadowMesh.count = 0;
    shadowMesh.frustumCulled = false;
    // 地面 -10，影子 15，立牌 20+：影子压在地上、被角色脚挡住，偏出的一圈仍看得见。
    shadowMesh.renderOrder = 15;
    if (THREE.DynamicDrawUsage) shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadowLayer.add(shadowMesh);
  }

  /* ---------- 人物/道具阴影：贴图剪影按光向倒在地上 ----------
     不是脚下椭圆。椭圆是"接触阴影"，看得出是块贴纸；剪影能带出武器、裙摆的形状。
     参考图（传奇女英雄）的阴影就是这种：贴着脚、往光反方向倒、能看出人形。
     做法：拿立牌自己的贴图，几何顶点 x' = x + t·kx、z' = t·kz（t = 离脚底的高度），
     再染成深褐、压到 y=0.02。地图/贴图共用，不额外占显存。 */

  const SHADOW_KX = 0.42;    // 光从玩家左手 → 影子往 +x 倒
  const SHADOW_KZ = -0.17;

  function makeShadowMesh(tex, w, h) {
    const geo = new THREE.PlaneGeometry(w, h);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const t = y + h / 2;                       // 0 = 脚下
      pos.setXYZ(i, x + t * SHADOW_KX, 0, t * SHADOW_KZ);
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: 0x2a1f16,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    if ('toneMapped' in mat) mat.toneMapped = false;
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 15;
    m.userData.isShadow = true;
    return m;
  }

  function attachShadow(mesh) {
    if (!mesh || !mesh.userData || mesh.userData.shadowMesh) return;
    const p = (mesh.geometry && mesh.geometry.parameters) || {};
    const tex = mesh.material && mesh.material.map;
    if (!tex || !p.width || !p.height) return;
    const sh = makeShadowMesh(tex, p.width, p.height);
    mesh.userData.shadowMesh = sh;
    if (shadowLayer) shadowLayer.add(sh);
    else if (scene) scene.add(sh);
  }

  function detachShadow(mesh) {
    if (!mesh || !mesh.userData) return;
    const sh = mesh.userData.shadowMesh;
    if (!sh) return;
    if (sh.parent) sh.parent.remove(sh);
    if (sh.geometry) sh.geometry.dispose();
    if (sh.material) sh.material.dispose();   // map 是借用立牌的，不 dispose
    mesh.userData.shadowMesh = null;
  }

  function syncOneShadow(mesh) {
    if (!mesh || !mesh.userData || mesh.userData.isShadow) return;
    const sh = mesh.userData.shadowMesh;
    if (!sh) return;
    sh.position.set(mesh.position.x, 0.02, mesh.position.z);
    const k = mesh.userData.shadowK || 1;   // 主角的剪影阴影收一点，不然走路像拖影
    sh.scale.set(mesh.scale.x * k, mesh.scale.y * k, 1);
    sh.visible = mesh.visible !== false && mesh.scale.x > 0.08;
  }

  function syncAllShadows() {
    if (shadowMesh) shadowMesh.count = 0;       // 旧的椭圆实例层停用
    syncOneShadow(hero);
    if (group) {
      const kids = group.children;
      for (let i = 0; i < kids.length; i++) syncOneShadow(kids[i]);
    }
  }

  function clearShadows() {
    if (shadowMesh) shadowMesh.count = 0;
    if (!shadowLayer) return;
    for (let i = shadowLayer.children.length - 1; i >= 0; i--) {
      const m = shadowLayer.children[i];
      if (!m.userData || !m.userData.isShadow) continue;
      shadowLayer.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    }
  }

  function own(mesh) {
    attachShadow(mesh);
    group.add(mesh);
    return mesh;
  }

  // ---------- 地面 ----------

  function groundSheet() {
    const room = B && B.room ? B.room() : 'hub';
    if (room === 'cave1' || room === 'cave2' || room === 'cave3' || room === 'field3b' || room === 'field4' || room === 'field6') return 'terrain-cave';
    if (room === 'field4b' || room === 'field5' || room === 'field6b' || room === 'field7') return 'terrain-waste';
    return 'terrain-field';
  }

  // 素材库已清空（2026-10-29）：assets/ 只留 tiles + terrain。
  // 3D 立牌（树/房/摊/人/怪/主角/袋子）全部改走 hd-draw.js 程序化画布 + paintTex 缓存；
  // 新素材出好后按 key 逐个换回来（见 docs/立牌统一规格.md）。

  const tileCanvasCache = {};

  function resetTileCache() {
    const keys = Object.keys(tileCanvasCache);
    for (let i = 0; i < keys.length; i++) delete tileCanvasCache[keys[i]];
  }

  function tileCanvas(theme, key) {
    const id = theme + ':' + key;
    if (!tileCanvasCache[id]) tileCanvasCache[id] = DL.IsoGround.paint(theme, key);
    return tileCanvasCache[id];
  }

  function dropGround() {
    if (!ground) return;
    const seen = new Set();
    ground.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) {
        if (seen.has(mats[i])) continue;
        seen.add(mats[i]);
        if (mats[i].map) mats[i].map.dispose();
        mats[i].dispose();
      }
    });
    scene.remove(ground);
    ground = null;
  }

  // 方向光的阴影范围要罩住整张地图（房间尺寸会变，所以每次建地面都重算一次）
  function fitSun(W, H) {
    if (!sun) return;
    const cx = W / 2, cz = H / 2;
    sun.target.position.set(cx, 0, cz);
    // 光从玩家左手：世界 (-x, +z) 方向；仰角压低，影子才拉得出来
    sun.position.set(cx - 10, 15, cz + 10);
    const r = Math.max(W, H) * 0.8 + 8;
    const sc = sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 0.5;
    sc.far = 80;
    sc.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  function buildGround() {
    dropGround();
    const map = B && B.map && B.map();
    const terrain = B && B.terrain && B.terrain();
    if (!map || !map.length || !map[0]) return;
    const theme = DL.IsoGround && DL.IsoGround.themeOf ? DL.IsoGround.themeOf(groundSheet()) : 'field';

    // 地面贴图：优先用 iso-art（48px/格 的手绘石板），缺它再退回旧的色块插值。
    let srcCanvas = null;
    let W = map[0].length;
    let H = map.length;
    const A = DL.IsoArt;
    if (A && A.groundSheet) {
      try {
        srcCanvas = A.groundSheet(map, terrain, theme, {
          px: 48,
          seed: 7,
          style: { path: 'slab' },      // 地面统一石板（红砖撤出地面）
        });
      } catch (e) {
        console.warn('[3D] iso-art 地面生成失败，退回旧地面', e);
      }
    }
    if (!srcCanvas) {
      const Gnd = DL.IsoGround;
      if (!Gnd || !Gnd.paintField) return;
      const field = Gnd.paintField(map, terrain, theme);
      srcCanvas = field.canvas;
      W = field.W;
      H = field.H;
    }

    const tex = texOfCanvas(srcCanvas, true);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // 地面必须吃光：Basic 材质是"平涂"，Lambert 才会被方向光照出明暗。
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    // 一张铺满地图的平面：世界 xz ∈ [0,W]×[0,H]，UV 同步。无无菱形网格缝。
    const geo = new THREE.PlaneGeometry(W, H, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(W / 2, 0, H / 2);
    ground = new THREE.Group();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -10;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    ground.add(mesh);
    scene.add(ground);
    groundPainted = theme;
    fitSun(W, H);
  }

  function addSeamDecals(parent, seams) {
    if (!seams || seams.length < 3 || !DL.IsoGround.decalSheet) return;
    const tex = texOfCanvas(DL.IsoGround.decalSheet(), true);
    const n = seams.length / 3;
    const pos = new Float32Array(n * 12);
    const uv = new Float32Array(n * 8);
    const index = n > 16000 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
    const hw = 0.28;
    const hd = 0.18;
    let v = 0;
    for (let i = 0; i < n; i++) {
      const x = seams[i * 3];
      const z = seams[i * 3 + 1];
      const kind = seams[i * 3 + 2] | 0;
      const y = 0.03;
      const b = v * 3;
      pos[b] = x - hw; pos[b + 1] = y; pos[b + 2] = z - hd;
      pos[b + 3] = x + hw; pos[b + 4] = y; pos[b + 5] = z - hd;
      pos[b + 6] = x + hw; pos[b + 7] = y; pos[b + 8] = z + hd;
      pos[b + 9] = x - hw; pos[b + 10] = y; pos[b + 11] = z + hd;
      const u0 = kind / 3;
      const u1 = (kind + 1) / 3;
      const ub = v * 2;
      uv[ub] = u0; uv[ub + 1] = 1;
      uv[ub + 2] = u1; uv[ub + 3] = 1;
      uv[ub + 4] = u1; uv[ub + 5] = 0;
      uv[ub + 6] = u0; uv[ub + 7] = 0;
      const ib = i * 6;
      index[ib] = v; index[ib + 1] = v + 1; index[ib + 2] = v + 2;
      index[ib + 3] = v; index[ib + 4] = v + 2; index[ib + 5] = v + 3;
      v += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -8;
    mesh.frustumCulled = false;
    parent.add(mesh);
  }

  function depthOrder(mesh) {
    if (!mesh) return;
    // 屏幕脚底 y ≈ 世界 z（相机从 +Z 俯视）；z 大的后画，盖住后面的。
    const base = 20 + (mesh.position.z + (mesh.userData.frontPad || 0)) * 4;
    mesh.renderOrder = base;
  }

  function sortStanding() {
    depthOrder(hero);
    if (group) {
      const kids = group.children;
      for (let i = 0; i < kids.length; i++) depthOrder(kids[i]);
    }
    if (portalGroup) {
      const kids = portalGroup.children;
      for (let i = 0; i < kids.length; i++) depthOrder(kids[i]);
    }
  }

  // ---------- 道具 / NPC / 怪 ----------

  function clearGroup() {
    clearShadows();
    if (!group) return;
    const seen = new Set();
    while (group.children.length) {
      const m = group.children.pop();
      detachShadow(m);
      if (m.geometry && m.geometry !== shadowGeo) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : (m.material ? [m.material] : []);
      for (let i = 0; i < mats.length; i++) {
        if (seen.has(mats[i])) continue;
        seen.add(mats[i]);
        mats[i].dispose();
      }
    }
    scene.remove(group);
    group = null;
  }

  // 立牌身高（世界单位），一把尺子量到底：豆豆 2.15 ≈ 1 个人。
  // 数字按 hd-draw 程序化画布重新校准（画布是满幅的，没有 AI 图那种大块透明边）。
  const HERO_H = 2.15;   // 1 个人
  const TREE_H = 5.6;    // ≈2.6 人
  const BORDER_TREE_H = 3.6;  // 边界树墙矮一档，不然树冠会把入口埋掉
  const HOUSE_H = 4.8;   // ≈2.2 人，门洞才不会像狗屋
  const STALL_H = 3.0;   // ≈1.4 人，摊子比人高半头
  // 城里其余小物件：按 hd-draw townProp 的 index 顺序（0/1 摊位、2 篝火、3 水井、4 帐篷、5 栅栏…）
  const TOWN_H = [STALL_H, STALL_H, 1.3, 1.6, 3.2, 0.9, 1.2, 1.0, 2.6, 1.4];

  function addProp(p) {
    const town = p.sheet === 'town';
    const idx = p.index || 0;
    const Hd = DL.HdDraw;
    if (!Hd) return;
    let tex;
    let h;
    if (town) {
      h = TOWN_H[idx] != null ? TOWN_H[idx] : 2.0;
      tex = paintTex('town:' + idx, function () { return Hd.townProp(idx); });
    } else {
      // 站在墙上（地图外圈）的是边界树墙：矮一档，不然树冠会把可玩区域和入口全盖住
      const m0 = B && B.map && B.map();
      const onWall = !!(m0 && m0[p.y] && m0[p.y][p.x] === 1);
      h = onWall ? BORDER_TREE_H : TREE_H;
      tex = paintTex('flora:' + idx, function () { return Hd.flora(idx); });
    }
    if (!tex) return;
    const m = billboard(tex, h * (tex.image.width / tex.image.height), h, 1);
    m.position.x = p.x + 0.5 + (p.ox || 0) / CELL;
    m.position.z = p.y + 0.5 + (p.oy || 0) / CELL;
    own(m);
  }

  function addPerson(key, col, row, gx, gy, order) {
    const Hd = DL.HdDraw;
    if (key !== 'npc' || !Hd || !Hd.npc) return null;
    const tex = paintTex('npc:' + col, function () { return Hd.npc(col); });
    if (!tex) return null;
    const m = billboard(tex, HERO_H * (tex.image.width / tex.image.height), HERO_H, order);
    m.position.x = gx + 0.5;
    m.position.z = gy + 0.5;
    own(m);
    return m;
  }

  const MOB_H = { chicken: 1.35, scarecrow: 2.15, dog: 1.55, boar: 1.75 };
  const MOB_GLYPH = {};
  ((DL.DATA && DL.DATA.MON) || []).forEach(function (m) { MOB_GLYPH[m.id] = m.glyph; });

  // 新素材还没出：hd-draw 没画过的怪先用 emoji 立牌占位，保证看得见、点得到。
  function glyphCanvas(glyph) {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(30,20,12,0.28)';
    g.beginPath();
    g.ellipse(80, 148, 34, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '92px system-ui';
    g.fillText(glyph, 80, 82);
    return c;
  }

  function addEnemy(e) {
    const isBoss = !!e.boss;
    const Hd = DL.HdDraw;
    const known = !isBoss && Hd && Hd.mob && Hd.mob(e.id, 0);
    const tex = known
      ? paintTex('mob:' + e.id + ':0', function () { return Hd.mob(e.id, 0); })
      : paintTex('mob-glyph:' + (isBoss ? 'boss' : e.id), function () {
        const glyph = isBoss
          ? ((DL.DATA && DL.DATA.BOSS && DL.DATA.BOSS.glyph) || '👹')
          : (MOB_GLYPH[e.id] || '❓');
        return glyphCanvas(glyph);
      });
    if (!tex) return;
    const h = isBoss ? 3.3 : (MOB_H[e.id] || 1.7);
    const m = billboard(tex, h * (tex.image.width / tex.image.height), h, 3);
    m.position.y -= isBoss ? 0.35 : 0.12;
    m.position.x = e.x + 0.5;
    m.position.z = e.y + 0.5;
    m.userData.enemy = e;
    if (known) m.userData.smooth = e.id;
    own(m);
  }

  // 地上的装备袋：程序化小布包，颜色按袋里最好那件稀有度（紫 = 遗物）
  const BAG_COLOR = { white: '#cfd8e6', blue: '#4a9eff', yellow: '#ffd54a', orange: '#ff8a3d', relic: '#c060ff' };

  function bagCanvas(color) {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(30,20,12,0.3)';
    g.beginPath();
    g.ellipse(48, 86, 20, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(30, 44);
    g.quadraticCurveTo(26, 82, 48, 84);
    g.quadraticCurveTo(70, 82, 66, 44);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.moveTo(48, 50);
    g.lineTo(66, 46);
    g.quadraticCurveTo(66, 76, 48, 84);
    g.closePath();
    g.fill();
    g.strokeStyle = '#6a4c30';
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(36, 46);
    g.lineTo(60, 40);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.ellipse(40, 60, 5, 9, -0.3, 0, Math.PI * 2);
    g.fill();
    return c;
  }

  function addBag(b) {
    const order = ['white', 'blue', 'yellow', 'orange'];
    let best = 0;
    for (const eq of b.items || []) {
      const i = order.indexOf(eq.rarity);
      if (i > best) best = i;
    }
    const colorKey = b.relic ? 'relic' : order[best];
    const tex = paintTex('bag:' + colorKey, function () { return bagCanvas(BAG_COLOR[colorKey] || '#cfd8e6'); });
    if (!tex) return;
    const m = billboard(tex, 0.72, 0.72, 2);
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
    // 立牌全部程序化：只要 hd-draw 在，场景就能建（等新 PNG 素材回来再逐个接）
    return !!(DL.HdDraw && DL.HdDraw.heroSheet);
  }

  function dropMesh(m) {
    detachShadow(m);
    if (m.geometry && m.geometry !== shadowGeo) m.geometry.dispose();
    if (m.material && m.material !== shadowMat) m.material.dispose();
  }

  function dropHero() {
    if (!hero) return;
    scene.remove(hero);
    dropMesh(hero);
    hero = null;
  }

  function edgeWall(map, x, y) {
    if (map[y][x] !== 1) return false;
    const H = map.length;
    const W = map[0].length;
    const open = (nx, ny) => nx < 0 || ny < 0 || nx >= W || ny >= H || map[ny][nx] !== 1;
    return open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1);
  }

  function buildSolids() {
    if (!group || !B || !DL.HdDraw) return;
    const W = B.map()[0].length;
    if (B.room() !== 'hub' || W < 64) return;
    addHouse(60.2, 62.0);
    addHouse(70.4, 57.2);
    addHouse(54.2, 66.4);
    addRock(49.5, 59.0, 0);
    addRock(66.5, 70.8, 1);
    addRock(58.8, 56.2, 2);
    addRock(51.2, 70.5, 0);
  }

  function addRock(x, y, variant) {
    const v = variant | 0;
    const tex = paintTex('rock:' + v, function () { return DL.HdDraw.rock(v); });
    const img = tex.image;
    const h = 0.78;
    const m = billboard(tex, h * (img.width / img.height), h, 1);
    m.position.x = x;
    m.position.z = y;
    own(m);
  }

  function addHouse(x, z) {
    const tex = paintTex('house:shop', function () { return DL.HdDraw.house('shop'); });
    const m = billboard(tex, HOUSE_H * (tex.image.width / tex.image.height), HOUSE_H, 1);
    m.position.set(x, HOUSE_H / 2, z);
    // 占地朝相机最下一行：相机在 +Z，脚底取更靠前的 z。
    m.userData.frontPad = 0.9;
    own(m);
  }

  function addCaveMouth(x, y) {
    if (!(DL.HdDraw && DL.HdDraw.caveMouth)) return;
    const tex = paintTex('cave-mouth', function () { return DL.HdDraw.caveMouth(); });
    const m = billboard(tex, 2.2, 2.4, 2);
    m.position.set(x + 0.5, 2.4 / 2, y + 0.5);
    own(m);
  }

  /* ---------- 崖壁（山） ----------
     两处用：① 地图边缘一圈，把地平线关住；② 野外那些"孤零零一块墙"的格子，
     原来是 0.78 高的小石头，现在立一座崖——走过去才看得出是山，不是贴纸。
     只往 map=1 的格子上立，所以不会出现"人从山里穿过去"。 */

  function cliffTheme() {
    return (DL.IsoGround && DL.IsoGround.themeOf) ? DL.IsoGround.themeOf(groundSheet()) : 'field';
  }

  function addCliffSprite(x, z, variant, hs, base, span) {
    const A = DL.IsoArt;
    if (!A || !A.cliff) return;
    const theme = cliffTheme();
    // 高度系数只留 3 档、尺寸只由档位决定：崖壁贴图按 key 缓存，
    // 每多一档就多一张 450×350 的 canvas，随便连续取值会上百张、几十 MB。
    const q = Math.round((hs == null ? 0.6 : hs) * 3) / 3;
    const height = base + q * span;
    const key = 'cliff:' + theme + ':' + (variant | 0) + ':' + q.toFixed(2) + ':' + base;
    const tex = paintTex(key, function () { return A.cliff(variant, theme, q); });
    const img = tex.image;
    const m = billboard(tex, height * (img.width / img.height), height, 1);
    m.position.set(x, height / 2, z);
    m.userData.frontPad = 1.1;                        // 底座宽，遮挡按脚底算
    own(m);
  }

  function buildCliffs() {
    if (!group || !B || B.room() !== 'hub') return;
    const map = B.map();
    const W = map[0].length, H = map.length;
    const ch = (DL.IsoArt && DL.IsoArt.cliffHeight) ? DL.IsoArt.cliffHeight : function () { return 0.5; };

    // ① 边缘一圈：崖壁约 5~7 格宽，步长 5 连成山脊（太稀就成了一排小土包）
    for (let x = 4; x < W - 4; x += 5) {
      [2, H - 3].forEach(function (z, i) {
        addCliffSprite(x + 0.5, z + 0.5, (x + z + i) % 3, ch(x, z, 3), 4.6, 1.4);
      });
    }
    for (let z = 4; z < H - 4; z += 5) {
      [2, W - 3].forEach(function (x, i) {
        addCliffSprite(x + 0.5, z + 0.5, (x + z + i) % 3, ch(x, z, 5), 4.6, 1.4);
      });
    }

    // ② 野外孤立的墙格（四面都是空地）→ 立一座小崖，别再用 0.78 高的小石头
    const lone = [];
    for (let y = 6; y < H - 6; y += 2) {
      for (let x = 6; x < W - 6; x += 2) {
        if (map[y][x] !== 1) continue;
        if (map[y + 1][x] || map[y - 1][x] || map[y][x + 1] || map[y][x - 1]) continue;
        lone.push(x, y);
      }
    }
    const step = Math.max(1, Math.ceil(lone.length / 2 / 18));
    for (let i = 0; i < lone.length; i += 2 * step) {
      const x = lone[i], y = lone[i + 1];
      addCliffSprite(x + 0.5, y + 0.5, (x * 7 + y) % 3, ch(x, y, 9), 2.9, 0.9);
    }
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
    buildSolids();
    buildCliffs();
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

    // 主角立牌：hd-draw 的 4×5 图集（4 向 × 4 帧 + 倒地帧），按方向/走路切帧
    heroTex = heroFrame(0, 0);
    if (heroTex) {
      hero = billboard(heroTex, HERO_H, HERO_H, 4);
      hero.userData.iso = false;
      hero.userData.foot = hero.position.y;
      scene.add(hero);
      attachShadow(hero);
      // 主角的剪影阴影：缩短 + 压淡（0.6 的整幅剪影跟在脚后像残影）
      if (hero.userData.shadowMesh) {
        hero.userData.shadowK = 0.55;
        hero.userData.shadowMesh.material.opacity = 0.3;
      }
    }
    spritesReady = true;
  }

  // ---------- 相机 ----------

  function clampLook() {
    const map = B && B.map && B.map();
    if (!map || !map[0]) return;
    const W = map[0].length;
    const H = map.length;
    const halfX = (Pick.FRUSTUM_W / 2) / (zoom || 1);
    const halfZ = ((Pick.FRUSTUM_H / 2) / (zoom || 1)) / Math.sin(Pick.PITCH);
    if (W <= halfX * 2) look.x = W / 2;
    else look.x = Math.max(halfX, Math.min(W - halfX, look.x));
    if (H <= halfZ * 2) look.z = H / 2;
    else look.z = Math.max(halfZ, Math.min(H - halfZ, look.z));
  }

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
    // 桌面上 2× 超采样，低配模式退回 1（1560 跑 2560×1440 没压力）
    renderer.setPixelRatio(low ? 1 : 2);
    renderer.setSize(Pick.VIEW_W, Pick.VIEW_H, false);
  }

  // ---------- 每帧 ----------

  function miniLayout(map) {
    const w = mini.width;
    const h = mini.height;
    const mw = map[0].length;
    const mh = map.length;
    const s = Math.min((w - 8) / mw, (h - 8) / mh);
    return { mw: mw, mh: mh, s: s, ox: (w - mw * s) / 2, oy: (h - mh * s) / 2 };
  }

  function paintMiniBase() {
    const map = B.map();
    const key = B.room() + '|' + map[0].length + 'x' + map.length;
    if (miniKey === key && miniBase) return;
    miniKey = key;
    if (!miniBase) miniBase = document.createElement('canvas');
    miniBase.width = mini.width;
    miniBase.height = mini.height;
    const g = miniBase.getContext('2d');
    const lay = miniLayout(map);
    g.fillStyle = '#101623';
    g.fillRect(0, 0, miniBase.width, miniBase.height);
    const terrain = B.terrain && B.terrain();
    for (let y = 0; y < lay.mh; y++) {
      for (let x = 0; x < lay.mw; x++) {
        if (map[y][x] === 1) g.fillStyle = '#7a766c';
        else if (map[y][x] === 2) g.fillStyle = '#f0c840';
        else if (terrain && terrain[y] && terrain[y][x] === 1) g.fillStyle = '#c6a15c';
        else g.fillStyle = '#3e7a32';
        g.fillRect(lay.ox + x * lay.s, lay.oy + y * lay.s, Math.ceil(lay.s), Math.ceil(lay.s));
      }
    }
  }

  function drawMini() {
    if (!mini || !B) return;
    paintMiniBase();
    const map = B.map();
    const g = mini.getContext('2d');
    g.drawImage(miniBase, 0, 0);
    const lay = miniLayout(map);
    const P = B.P();
    const enemies = B.enemies ? B.enemies() : [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || e.hp <= 0) continue;
      g.fillStyle = e.boss ? '#ff5a5a' : '#ffd166';
      g.fillRect(lay.ox + e.x * lay.s, lay.oy + e.y * lay.s, Math.max(2, lay.s), Math.max(2, lay.s));
    }
    g.fillStyle = '#ffffff';
    g.fillRect(lay.ox + P.x * lay.s, lay.oy + P.y * lay.s, Math.max(2, lay.s), Math.max(2, lay.s));
  }

  function tick() {
    if (!B || glLost) return;
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
    clampLook();
    placeCamera();
    if (renderer) renderer.setClearColor(groundSheet() === 'terrain-cave' ? '#1a2430' : '#7eb6e6', 1);

    // 主角位置/朝向
    if (hero) {
      // 走路插值：逻辑是 70ms 跳一格，画面追过去；瞬移（换房/传送）超过 3 格就直接落位
      const tx = P.x + 0.5, tz = P.y + 0.5;
      const dt = Math.max(4, Math.min(64, now - (hero.userData.lastT || now - 16)));
      hero.userData.lastT = now;
      if (Math.abs(tx - hero.position.x) > 3 || Math.abs(tz - hero.position.z) > 3) {
        hero.position.x = tx;
        hero.position.z = tz;
      } else {
        const a = 1 - Math.exp(-dt / 22);
        hero.position.x += (tx - hero.position.x) * a;
        hero.position.z += (tz - hero.position.z) * a;
      }
      const moving = B.walking && B.walking();
      const strike = now - (B.strikeAt ? B.strikeAt() : 0) < 260;
      const bob = moving ? Math.sin(now / 1000 * 8) * (2 / 48) : Math.sin(now / 1000 * 2) * (1 / 48);
      hero.position.y = (hero.userData.foot || hero.position.y) + bob;
      hero.rotation.z = strike || !moving ? 0 : (P.dir === 'l' ? 0.035 : P.dir === 'r' ? -0.035 : P.dir === 'u' ? -0.02 : 0.02);
      const dead = B.over && B.over() && P.hp <= 0;
      if (dead) {
        if (!hero.userData.dieAt) hero.userData.dieAt = now;
        const t = Math.min(1, (now - hero.userData.dieAt) / 400);
        hero.scale.set(1 - t * 0.7, 1 - t * 0.7, 1);
        hero.material.opacity = 1 - t;
        hero.material.transparent = true;
      } else {
        hero.userData.dieAt = 0;
        hero.scale.set(1, 1, 1);
        hero.material.opacity = 1;
      }
      if (!hero.userData.iso) {
        const row = { d: 0, l: 1, r: 2, u: 3 }[P.dir] || 0;
        let col;
        if (now - (B.strikeAt ? B.strikeAt() : 0) < 260) col = 3;
        else if (B.walking && B.walking()) col = 1 + (Math.floor(now / 160) % 2);
        else col = 0;
        const next = heroFrame(col, row);
        if (next && hero.material.map !== next) {
          hero.material.map = next;
          hero.material.needsUpdate = true;
        }
      }
    }

    // 怪物：位置/帧/死亡清理
    if (group) {
      for (let i = group.children.length - 1; i >= 0; i--) {
        const m = group.children[i];
        const e = m.userData.enemy;
        if (!e) continue;
        if (e.hp <= 0) {
          detachShadow(m);
          group.remove(m);
          if (m.geometry && m.geometry !== shadowGeo) m.geometry.dispose();
          if (m.material && m.material !== shadowMat) m.material.dispose();
          continue;
        }
        m.position.x = e.x + 0.5;
        m.position.z = e.y + 0.5;
        if (m.userData.hp == null) m.userData.hp = e.hp;
        if (e.hp < m.userData.hp) {
          m.userData.hp = e.hp;
          m.userData.flash = now + 140;
        }
        if (m.material && m.material.color) {
          m.material.color.set(m.userData.flash > now ? 0xfff1c2 : 0xffffff);
        }
        if (m.userData.smooth) {
          const fr = Math.floor(now / 420) % 2;
          const id = m.userData.smooth;
          const tex = paintTex('mob:' + id + ':' + fr, function () { return DL.HdDraw.mob(id, fr); });
          if (tex && m.material.map !== tex) {
            m.material.map = tex;
            m.material.needsUpdate = true;
          }
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
          detachShadow(m);
          group.remove(m);
          if (m.geometry && m.geometry !== shadowGeo) m.geometry.dispose();
          if (m.material && m.material !== shadowMat) m.material.dispose();
        }
      }
      for (const b of bags) {
        let found = false;
        for (const m of group.children) {
          if (m.userData.bag === b) { found = true; break; }
        }
        if (!found) addBag(b);
      }
      for (const m of group.children) {
        if (!m.userData.bag) continue;
        if (m.userData.baseY == null) m.userData.baseY = m.position.y;
        m.position.y = m.userData.baseY + Math.sin(now / 380 + m.position.x) * 0.06;
      }
    }

    sortStanding();
    syncAllShadows();
    drawMini();
    renderer.render(scene, camera);
    drawTags();
    if (showStats && statsEl) {
      const info = renderer.info.render;
      statsEl.textContent = 'frame ' + (performance.now() - t0).toFixed(2) + ' ms  draws ' + info.calls + '  tris ' + info.triangles;
    }
  }

  function drawTags() {
    if (!canvas || !camera || !B) return;
    if (!tags) {
      tags = document.createElement('canvas');
      tags.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;pointer-events:none;';
      document.body.appendChild(tags);
    }
    if (!tagVec) tagVec = new THREE.Vector3();
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (tags.width !== w || tags.height !== h) {
      tags.width = w;
      tags.height = h;
    }
    tags.style.width = canvas.style.width;
    tags.style.height = canvas.style.height;
    const g = tags.getContext('2d');
    g.clearRect(0, 0, w, h);
    const P = B.P();
    const list = B.enemies() || [];
    g.textAlign = 'center';
    g.font = 'bold 12px sans-serif';
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e.hp <= 0) continue;
      if (Math.abs(e.x - P.x) > 9 || Math.abs(e.y - P.y) > 7) continue;
      tagVec.set(e.x + 0.5, e.boss ? 3.2 : 1.8, e.y + 0.5);
      tagVec.project(camera);
      if (tagVec.z < -1 || tagVec.z > 1) continue;
      const sx = (tagVec.x * 0.5 + 0.5) * w;
      const sy = (-tagVec.y * 0.5 + 0.5) * h;
      const name = 'Lv.' + e.lv + ' ' + String(e.name || '').split('·')[0];
      const tw = g.measureText(name).width;
      g.fillStyle = 'rgba(6,10,18,0.75)';
      g.fillRect(sx - tw / 2 - 4, sy - 16, tw + 8, 16);
      g.fillStyle = e.boss ? '#ff6b6b' : e.rare ? '#ffb74d' : e.elite ? '#7ee0a0' : '#f2f6ff';
      g.fillText(name, sx, sy - 4);
      const bw = 32;
      const hp = Math.max(0, Math.min(1, e.hp / (e.maxHp || 1)));
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(sx - bw / 2, sy + 2, bw, 4);
      g.fillStyle = '#e05a5a';
      g.fillRect(sx - bw / 2, sy + 2, bw * hp, 4);
    }
    const floats = B.floaters ? B.floaters() : [];
    g.font = 'bold 16px sans-serif';
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= 0.02;
      f.y -= 0.015;
      if (f.life <= 0) { floats.splice(i, 1); continue; }
      tagVec.set(f.x + 0.5, 1.4, f.y + 0.5);
      tagVec.project(camera);
      if (tagVec.z < -1 || tagVec.z > 1) continue;
      const sx = (tagVec.x * 0.5 + 0.5) * w;
      const sy = (-tagVec.y * 0.5 + 0.5) * h;
      g.globalAlpha = Math.min(1, f.life * 2);
      g.fillStyle = f.color || '#ffd166';
      g.fillText(f.text, sx, sy);
      g.globalAlpha = 1;
    }
  }

  // ---------- 输入 ----------

  function pointer(e) {
    if (!on || !canvas || !B) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // 右上角是 3D 小地图（pointer-events:none，会穿透到这里）：点它不移动
    if (mini) {
      const mr = mini.getBoundingClientRect();
      if (e.clientX >= mr.left && e.clientX <= mr.right && e.clientY >= mr.top && e.clientY <= mr.bottom) return;
    }
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
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !low, alpha: false, powerPreference: 'high-performance' });
    } catch (err) {
      fail('这个浏览器开不了 WebGL。3D 是唯一画面，没有 2D 回退了——换 Chrome / 开硬件加速再试。');
      return;
    }
    renderer.setClearColor('#7eb6e6', 1);
    // 2.5D 的关键：有光、有影子。不然后面所有贴图都是"平涂"，看起来像 2D。
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    camera = new THREE.OrthographicCamera(
      -Pick.FRUSTUM_W / 2, Pick.FRUSTUM_W / 2,
      Pick.FRUSTUM_H / 2, -Pick.FRUSTUM_H / 2,
      0.1, 240
    );
    scene = new THREE.Scene();
    // 环境光压到"能看清暗部"就够；主光是左上方向光。
    // 注意：这一版 three 的光强是物理单位，数值比老教程大（真实值 ≈ 老值 × π）。
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    sun = new THREE.DirectionalLight(0xfff3dc, 2.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.05;
    scene.add(sun);
    scene.add(sun.target);
    shadowLayer = new THREE.Group();
    scene.add(shadowLayer);

    canvas.addEventListener('pointerdown', (e) => {
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      pointer(e);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      glLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      glLost = false;
      groundPainted = '';
      roomKey = '';
      spritesReady = false;
      resetTileCache();
      shadowMat = null;
      shadowGeo = null;
      fit();
    });
    global.addEventListener('resize', fit);

    const P = B.P();
    look = { x: P.x + 0.5, z: P.y + 0.5 };
    mini = document.createElement('canvas');
    mini.id = 'mini3d';
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
    debug: function () {
      return {
        on: on,
        shadows: shadowMesh ? shadowMesh.count : -1,
        ground: !!ground,
        group: group ? group.children.length : 0,
        hero: !!hero,
        heroShadow: !!(hero && hero.userData && hero.userData.shadowMesh),
        look: { x: look.x, z: look.z },
        zoom: zoom,
      };
    },
  };

  if (wanted() && global.document) {
    const start = () => { if (B) boot(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
