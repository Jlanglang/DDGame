/* 豆豆海岛幻想 · 板块地面（共享几何）
   游戏 `render-three.js` 和验收台 `bench-scene.html` 用的是同一份，避免两边各画一套。

   为什么要有它：一张平面的厚度是 0。贴图再细，斜看过去也只是一张画——没有侧面、
   没有凹缝、接不住投影。这里把每格做成一块"枕头砖"：
     · 顶面留在 y=0（人物和接触阴影都不用抬，坐标不用改）
     · 四条边向下斜切到 y=-h
     · 相邻两块的两个斜面拼成一条 V 槽，槽底压暗
   光从左上打过来时，南/西两条斜面亮、东/北两条暗 —— 这就是"视角"和"斜率"。

   用法：
     DL.TilePlate.build({
       cols, rows,            // 多少格
       tex,                   // THREE.Texture（顶面贴图）
       uPerCell, vPerCell,    // 每格在贴图里占多少 UV（默认 1/cols、1/rows）
       h, gap,                // 下沉深度、单边内缩（两者都要小，1 格 = 1 世界单位）
       colorAt(x, z),         // 可选：>0.5 取斜面颜色，返回 [r,g,b] 0..1
       baseColor              // 可选：槽底颜色
     })
   返回 THREE.Group（底板 + 斜面 + 顶面）。
*/
import { DL } from './namespace.js';
const global = globalThis;

  function build(o) {
    const T = global.THREE;
    if (!T) throw new Error('TilePlate 需要 THREE');
    const cols = Math.max(1, o.cols | 0);
    const rows = Math.max(1, o.rows | 0);
    const cell = o.cellSize != null ? o.cellSize : 1; // 一块板占几格（mir 主城用 2）
    const h = o.h != null ? o.h : 0.032;
    const c = o.gap != null ? o.gap : 0.05;
    const uPer = o.uPerCell != null ? o.uPerCell : 1 / cols;
    const vPer = o.vPerCell != null ? o.vPerCell : 1 / rows;
    const uStart = o.u0 != null ? o.u0 : 0;
    const vBase = o.vBase != null ? o.vBase : 1 - vPer;
    const ox = o.originX || 0, oz = o.originZ || 0;
    const flipV = o.flipV !== false;
    const colorAt = o.colorAt || null;
    // 槽面压暗倍率：mir 下 0.30 太黑会整片棋盘格；主城可传 rimDark
    const rimDark = o.rimDark != null ? o.rimDark : 0.30;

    const n = cols * rows;
    const topPos = new Float32Array(n * 12);
    const topUv = new Float32Array(n * 8);
    const topIdx = new Uint32Array(n * 6);
    const rimPos = new Float32Array(n * 48);
    const rimCol = new Float32Array(n * 48);
    const rimIdx = new Uint32Array(n * 24);
    let tv = 0, ti = 0, rv = 0, ri = 0;

    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        const wx0 = ox + x * cell, wx1 = ox + (x + 1) * cell;
        const wz0 = oz + z * cell, wz1 = oz + (z + 1) * cell;
        const x0 = wx0 + c, x1 = wx1 - c, z0 = wz0 + c, z1 = wz1 - c;
        const u0 = uStart + x * uPer, u1 = uStart + (x + 1) * uPer;
        const v0 = flipV ? vBase - z * vPer : z * vPer;
        const v1 = flipV ? v0 + vPer : (z + 1) * vPer;

        // 顶面
        const tb = tv / 3;
        topPos[tv++] = x0; topPos[tv++] = 0; topPos[tv++] = z0;
        topPos[tv++] = x1; topPos[tv++] = 0; topPos[tv++] = z0;
        topPos[tv++] = x1; topPos[tv++] = 0; topPos[tv++] = z1;
        topPos[tv++] = x0; topPos[tv++] = 0; topPos[tv++] = z1;
        topUv[tb * 2] = u0; topUv[tb * 2 + 1] = v0;
        topUv[(tb + 1) * 2] = u1; topUv[(tb + 1) * 2 + 1] = v0;
        topUv[(tb + 2) * 2] = u1; topUv[(tb + 2) * 2 + 1] = v1;
        topUv[(tb + 3) * 2] = u0; topUv[(tb + 3) * 2 + 1] = v1;
        topIdx[ti++] = tb; topIdx[ti++] = tb + 2; topIdx[ti++] = tb + 1;
        topIdx[ti++] = tb; topIdx[ti++] = tb + 3; topIdx[ti++] = tb + 2;

        // 斜面（顶边内缩 → 格边下沉）
        let col = colorAt ? colorAt(x, z) : null;
        if (!col) col = [0.55, 0.55, 0.55];
        // 斜面压暗：斜面是"槽"，不是"砖面"。让它吃光的话，朝光那条会亮过板面，
        // 整片就读成凸起的格线（试过，确实会）。这里直接烘死成暗面，材质用不受光的 Basic。
        const cr = col[0] * rimDark, cg = col[1] * rimDark, cb = col[2] * rimDark;
        // 四个朝向再分一点档：南/西稍亮（离光近），东/北更暗，槽里才有层次
        const edgeMul = [1.0, 0.82, 0.88, 0.96];
        const edgeDef = [
          // 顶边两点（内缩，y=0）                          底边两点（外沿，y=-h）
          [x0, z1, x1, z1, wx0, wz1, wx1, wz1],          // 南
          [x1, z1, x1, z0, wx1, wz1, wx1, wz0],          // 东
          [x1, z0, x0, z0, wx1, wz0, wx0, wz0],          // 北
          [x0, z0, x0, z1, wx0, wz0, wx0, wz1],          // 西
        ];
        for (let k = 0; k < 4; k++) {
          const q = edgeDef[k];
          const sb = rv / 3;
          rimPos[rv++] = q[0]; rimPos[rv++] = 0; rimPos[rv++] = q[1];
          rimPos[rv++] = q[2]; rimPos[rv++] = 0; rimPos[rv++] = q[3];
          rimPos[rv++] = q[6]; rimPos[rv++] = -h; rimPos[rv++] = q[7];
          rimPos[rv++] = q[4]; rimPos[rv++] = -h; rimPos[rv++] = q[5];
          for (let v = 0; v < 4; v++) {
            const m = edgeMul[k];
            // 顶点色在 three 里是线性值，直接塞 sRGB 的暗色会被输出端抬亮（试过，槽会变灰）
            rimCol[(sb + v) * 3] = Math.pow(cr * m, 2.2);
            rimCol[(sb + v) * 3 + 1] = Math.pow(cg * m, 2.2);
            rimCol[(sb + v) * 3 + 2] = Math.pow(cb * m, 2.2);
          }
          rimIdx[ri++] = sb; rimIdx[ri++] = sb + 1; rimIdx[ri++] = sb + 2;
          rimIdx[ri++] = sb; rimIdx[ri++] = sb + 2; rimIdx[ri++] = sb + 3;
        }
      }
    }

    const topGeo = new T.BufferGeometry();
    topGeo.setAttribute('position', new T.BufferAttribute(topPos, 3));
    topGeo.setAttribute('uv', new T.BufferAttribute(topUv, 2));
    topGeo.setIndex(new T.BufferAttribute(topIdx, 1));
    topGeo.computeVertexNormals();
    const topMesh = new T.Mesh(topGeo, new T.MeshLambertMaterial({
      map: o.tex,
      side: T.DoubleSide,
    }));
    topMesh.receiveShadow = true;

    const rimGeo = new T.BufferGeometry();
    rimGeo.setAttribute('position', new T.BufferAttribute(rimPos, 3));
    rimGeo.setAttribute('color', new T.BufferAttribute(rimCol, 3));
    rimGeo.setIndex(new T.BufferAttribute(rimIdx, 1));
    rimGeo.computeVertexNormals();
    const rimMesh = new T.Mesh(rimGeo, new T.MeshBasicMaterial({
      vertexColors: true,
      side: T.DoubleSide,
    }));
    rimMesh.receiveShadow = true;

    // 槽底：不铺的话 V 槽底下会透出天蓝色
    const worldW = cols * cell, worldH = rows * cell;
    const bg = new T.PlaneGeometry(worldW, worldH);
    bg.rotateX(-Math.PI / 2);
    bg.translate(ox + worldW / 2, -h - 0.001, oz + worldH / 2);
    const baseMesh = new T.Mesh(bg, new T.MeshBasicMaterial({
      color: o.baseColor || '#3b3025',
    }));

    const grp = new T.Group();
    grp.add(baseMesh, rimMesh, topMesh);
    return grp;
  }

  DL.TilePlate = { build: build };
