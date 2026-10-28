  let diamondGeo = null;
  const tileTex = {};

  function resetTileCache() {
    const keys = Object.keys(tileTex);
    for (let i = 0; i < keys.length; i++) delete tileTex[keys[i]];
    diamondGeo = null;
  }

  function dropGround() {
    if (!ground) return;
    ground.traverse(function (o) {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) mats[i].dispose();
    });
    scene.remove(ground);
    ground = null;
  }

  function tileTexture(theme, key) {
    const id = theme + ':' + key;
    if (tileTex[id]) return tileTex[id];
    tileTex[id] = texOfCanvas(DL.IsoGround.paint(theme, key), false);
    return tileTex[id];
  }

  function buildGround() {
    dropGround();
    const Gnd = DL.IsoGround;
    if (!Gnd || !B) return;
    const map = B.map();
    const terrain = B.terrain && B.terrain();
    const theme = Gnd.themeOf(groundSheet());
    const buckets = Gnd.layout(map, terrain);
    if (!diamondGeo) {
      const ex = Gnd.HALF_W * 1.018;
      const ez = Gnd.HALF_H * 1.018;
      diamondGeo = new THREE.BufferGeometry();
      diamondGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, -ez, ex, 0, 0, 0, 0, ez, -ex, 0, 0,
      ], 3));
      diamondGeo.setAttribute('uv', new THREE.Float32BufferAttribute([
        0.5, 1, 1, 0.5, 0.5, 0, 0, 0.5,
      ], 2));
      diamondGeo.setIndex([0, 1, 2, 0, 2, 3]);
    }
    ground = new THREE.Group();
    buckets.forEach(function (pts, key) {
      const n = pts.length / 3;
      if (!n) return;
      const mat = new THREE.MeshBasicMaterial({
        map: tileTexture(theme, key),
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.InstancedMesh(diamondGeo, mat, n);
      mesh.frustumCulled = false;
      mesh.renderOrder = -10;
      const arr = mesh.instanceMatrix.array;
      for (let i = 0; i < n; i++) {
        const o = i * 16;
        arr[o] = 1;
        arr[o + 5] = 1;
        arr[o + 10] = 1;
        arr[o + 15] = 1;
        arr[o + 12] = pts[i * 3];
        arr[o + 13] = pts[i * 3 + 1];
        arr[o + 14] = pts[i * 3 + 2];
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (THREE.StaticDrawUsage && mesh.instanceMatrix.setUsage) {
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      }
      ground.add(mesh);
    });
    scene.add(ground);
    groundPainted = theme;
  }
