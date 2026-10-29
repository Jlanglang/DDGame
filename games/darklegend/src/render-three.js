/* 豆豆海岛幻想 · Three.js 2.5D 视图（接真游戏状态）
   只读 DL.ThreeBridge 的状态，点击交给游戏自己的 handleCellClick。
   地面是 2:1 菱形瓦片。立地物体脚下有同一方向的椭圆接触阴影。
   相机固定 45° 正交，不旋转。
*/
import { DL } from './namespace.js';
import * as THREE from 'three';
import './three-pick.js';
const global = globalThis;
global.THREE = THREE;
  const Pick = DL.ThreePick;
  if (!Pick) throw new Error('three-pick.js 未加载');

  const CELL = Pick.CELL_PX;          // 48 px / 格

  let B = null;                       // 游戏桥
  let on = false;
  let renderer = null;
  let scene = null;
  let sun = null;
  let camera = null;
  let canvas = null;
  let low = false;
  // mir 定稿（2026-10-29 主人拍板）：一屏竖向 ≈20 格 → zoom 1.70（实测 midV≈19.95 / midH≈27.9）
  let zoom = 1.70;
  let look = { x: 12, z: 12 };
  let fpsLastT = 0;
  let fpsFrames = 0;
  let fpsEma = 60;
  let roomKey = '';
  let ground = null;
  let outerSea = null;                // 地图外兜底的一圈深海（不是地图内的海面着色器）
  let group = null;                   // 当前房间的所有立牌
  let hero = null;
  let heroTex = null;
  let portalGroup = null;
  let lastStrike = 0;
  let spritesReady = false;
  let groundPainted = '';

  /* ---------- 地面分块（流式） ----------
     整张生成的账（真机估）：24×24 ≈ 60ms、53×53 ≈ 290ms、野外 128×128 降到 32px/格
     还是要 4096²（实测 headless 5.0s）。大图进场就是这一下冻住的。
     所以 >30 格的图不整张画了：只同步画脚下那一块（约 25~45ms），
     需要的块按**视野四角射线**算（斜角 45° 下视野是斜的，固定"周围 3×3"盖不住屏幕角），
     其余 requestIdleCallback 一次补一块，视野外的释放显存。
     块边界靠 groundSheet 的 1 格出血对齐（验收台 ⑥ 实测：缝带差 2.25 vs 块内 2.46）。 */
  // 块大小 = 走路手感的直接开关（实测，硬件 WebGL，1280×720，走 26 格）：
  //   16 格 → 单块 30~42ms，掉帧 68ms，能明显感到顿；12 格 → 20~25ms，仍掉 3~5 帧；
  //    8 格 → 2~15ms，整段 0 次 >25ms（默认视角常驻 22 块 ≈ 20MB 贴图）。
  // 想改大块省 draw call，先回头量这两组数：块越大单次卡顿越明显。
  const CHUNK_CELLS = 8;       // 每块 8 格：48px 下 384px（含 1 格出血 10 格 / 480px）；再小到 6 格不掉帧也不涨，块多了反而费 draw call
  const NO_CHUNK = /(?:^|[?&])chunk=0(?:&|$)/.test((global.location && global.location.search) || '');
  let gCtx = null;             // { map, terrain, theme, px, cols, rows }
  let gChunks = null;          // Map<'x,y', { mesh, tex }>
  let gSea = null;             // 整图岸距场 { tex, W, H }：海面着色器共用，别按块重算
  let gQueue = [];             // 待生成 [{x0,y0,x1,y1}]
  let gIdle = 0;               // requestIdleCallback / setTimeout 句柄
  let gRangeKey = '';          // 视野覆盖的块范围（变了才重算 need / 释放）
  let gNeed = [];              // 当前需要的块
  let gQueued = {};            // 已排队/已失败，别重复加

  let tags = null;
  let tagVec = null;
  let mini = null;
  let miniBase = null;
  let miniKey = '';
  let statsEl = null;
  let fpsEl = null;
  let glLost = false;
  let showStats = false;

  /* 石板板块地面：默认开（一块砖 = 一格 = 一个人站的位置）。
     2026-10-30：地砖保留，砖色改成沙地色（见 iso-art 的 paintSlabFace / slabSheet）。
     想看旧平面：?tiles=flat */
  const TILES_PLATE = (function () {
    const q = (global.location && global.location.search) || '';
    if (/(?:^|[?&])tiles=flat(?:&|$)/.test(q)) return false;
    return true;
  })();

  // 只剩 3D：不再有 2D Canvas 回退。file:// 也能跑（2026-10-29 起所有贴图都是程序化画布，
  // 不再从本地 PNG 上传纹理，WebGL 不会被 CORS 拦）。
  function wanted() {
    if (typeof THREE === 'undefined' || !THREE.WebGLRenderer) return false;
    return true;
  }

  function active() { return on; }

  function fail(msg) {
    if (fpsEl) fpsEl.hidden = true;    // 3D 起不来就没有帧率可报
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

  // 地面贴图：必须开 mipmap + 各向异性。之前地面走的是 sprite 那条（关 mipmap），
  // 斜看就糊、远处还闪——"画面糊了"的主因之一。
  function groundTex(c) {
    const t = texOfCanvas(c, false);
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    if (renderer && renderer.capabilities) {
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    return t;
  }

  // 海面比地面低一截，沙滩贴图压在上面。不要和底衬（y=-0.02）贴在同一高度。
  const SEA_Y = -0.012;
  const seaMats = [];

  // 岸距是数据，不是颜色。走 sRGB 的话 R 通道会被伽马拉开，岸会漂。
  function distTex(c) {
    const t = new THREE.CanvasTexture(c);
    if ('colorSpace' in t && THREE.NoColorSpace) t.colorSpace = THREE.NoColorSpace;
    else if ('colorSpace' in t && THREE.LinearSRGBColorSpace) t.colorSpace = THREE.LinearSRGBColorSpace;
    t.flipY = false;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.premultiplyAlpha = false;
    t.needsUpdate = true;
    return t;
  }

  function releaseSeaMat(mat) {
    if (!mat) return;
    const i = seaMats.indexOf(mat);
    if (i >= 0) seaMats.splice(i, 1);
    const tex = mat.uniforms && mat.uniforms.uDist && mat.uniforms.uDist.value;
    // 整图共用的岸距贴图由 gSea 统一管，别跟着单块释放
    if (tex && tex.dispose && !(mat.userData && mat.userData.sharedDist)) tex.dispose();
    if (mat.uniforms && mat.uniforms.uDist) mat.uniforms.uDist.value = null;
    mat.dispose();
  }

  // 自写 ShaderMaterial 不会走材质的颜色空间转换，这里的数就是屏幕上的颜色。
  const SEA_VERT = [
    'varying vec2 vUv;',
    'varying vec2 vXZ;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 w = modelMatrix * vec4(position, 1.0);',
    '  vXZ = w.xz;',
    '  gl_Position = projectionMatrix * viewMatrix * w;',
    '}',
  ].join('\n');
  // 岸距场编码半宽 + 浅水带宽：和 iso-art 共用同一套数（那边是唯一真身），改宽度只动 iso-art。
  const COAST_REACH = (DL.IsoArt && DL.IsoArt.COAST_REACH) || 8;
  const SHALLOW_TILES = (DL.IsoArt && DL.IsoArt.SHALLOW_TILES) || 3.8;
  /* 海水的颜色/亮度全在这儿调（着色器里的数直接就是屏幕颜色）。 */
  const SEA_SHALLOW = [0.20, 0.56, 0.64];   // 岸边浅水（原 0.30/0.78/0.74：整条海岸亮得像发光的薄荷带）
  const SEA_DEEP = [0.16, 0.46, 0.52];      // 深水
  const SEA_FOAM_C = [0.94, 0.97, 0.94];    // 碎沫
  const SEA_CAUSTIC_SHORE = 0.34;           // 岸纹强度（岸边，原 0.55）
  const SEA_CAUSTIC_DEEP = 0.10;            // 岸纹强度（深处，原 0.12）
  const SEA_FOAM_ALPHA = 0.72;              // 碎沫最大不透明度（原 0.85）
  const SEA_SHORE_ALPHA = 0.74;             // 岸边水的不透明度（原 0.62）：越小越透出沙子，浅水越亮
  const v3 = (c) => 'vec3(' + c.map(function (n) { return n.toFixed(2); }).join(', ') + ')';
  const SEA_FRAG = [
    'uniform sampler2D uDist;',
    'uniform float uTime;',
    'varying vec2 vUv;',
    'varying vec2 vXZ;',
    'float hash2(vec2 p) {',
    '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
    '}',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  float a = hash2(i);',
    '  float b = hash2(i + vec2(1.0, 0.0));',
    '  float c = hash2(i + vec2(0.0, 1.0));',
    '  float d = hash2(i + vec2(1.0, 1.0));',
    '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
    '}',
    'float caustic(vec2 p) {',
    '  float n = noise(p);',
    '  return pow(1.0 - abs(n * 2.0 - 1.0), 6.0);',
    '}',
    'void main() {',
    '  float d = texture2D(uDist, vUv).r * ' + (COAST_REACH * 2).toFixed(1) + ' - ' + COAST_REACH.toFixed(1) + ';',
    '  vec3 aqua = ' + v3(SEA_SHALLOW) + ';',
    '  vec3 deep = ' + v3(SEA_DEEP) + ';',
    '  vec3 foamC = ' + v3(SEA_FOAM_C) + ';',
    '  float abyss = smoothstep(0.35, ' + SHALLOW_TILES.toFixed(2) + ', d);',
    '  vec3 col = mix(aqua, deep, abyss);',
    // ① 慢涌：一层大尺度噪声往东南漂，海面底色不再是一块死色
    '  float swell = noise(vXZ * vec2(0.55, 0.85) + vec2(uTime * 0.16, -uTime * 0.10));',
    '  col *= 0.93 + swell * 0.14;',
    // ② 浪脊：沿岸距走的缓波，一层层往沙滩推（越靠岸越亮；去深水会刻意压淡，免得像等高线）
    '  float crest = smoothstep(0.88, 0.995, sin((d + (swell - 0.5) * 2.0) * 2.0 + uTime * 0.9));',
    '  col += vec3(0.16, 0.21, 0.18) * crest * (1.0 - abyss * 0.75) * smoothstep(-0.10, 0.80, d);',
    // ③ 碎沫：岸线那圈跟着涌浪一起舔沙。只让 foam 的亮暗在动、alpha 的空间判据还是 d，
    //    所以岸线不会"涨潮"露出底衬的纯色。
    '  float fn = noise(vXZ * 6.0 + vec2(uTime * 0.42, -uTime * 0.26));',
    '  float fd = abs(d + (swell - 0.5) * 0.55);',
    '  float foam = smoothstep(0.40, 0.02, fd) * smoothstep(0.34, 0.74, fn);',
    '  col = mix(col, foamC, foam);',
    // ④ 岸纹两层反向漂：原来是 uTime*0.07（一秒走 0.03 格），看着就是一张静态图
    '  float c1 = caustic(vXZ * 2.6 + vec2(uTime * 0.55, uTime * 0.30));',
    '  float c2 = caustic(vXZ * 4.8 + vec2(-uTime * 0.40, uTime * 0.46) + vec2(4.2, 1.7));',
    '  float cau = c1 * 0.62 + c2 * 0.38;',
    '  col += vec3(0.85, 0.95, 0.80) * cau * mix(' + SEA_CAUSTIC_SHORE.toFixed(2) + ', ' + SEA_CAUSTIC_DEEP.toFixed(2) + ', abyss);',
    // ⑤ 浪尖反光：只在浪脊上闪一下，让"往岸边推"这件事有方向感
    '  col += vec3(0.09, 0.13, 0.11) * crest * cau;',
    '  float wet = smoothstep(-0.45, 0.08, d);',
    '  float alpha = max(foam * ' + SEA_FOAM_ALPHA.toFixed(2) + ', mix(wet * ' + SEA_SHORE_ALPHA.toFixed(2) + ', 1.0, abyss));',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);',
    '}',
  ].join('\n');

  function groundMat(tex, holes) {
    if (holes) tex.premultiplyAlpha = false;
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      transparent: !!holes,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    if (holes) mat.premultipliedAlpha = false;
    return mat;
  }

  // 和 iso-art.groundSheet 同一条钳制，岸距像素才和挖洞对得上。
  function shorePx(map, px) {
    const side = Math.max(map[0].length, map.length);
    return Math.max(12, Math.min(px || 48, Math.floor(4096 / side)));
  }

  // 这块里有没有会露出来的水（海格，或弯曲岸距探进沙滩）。没有就别建网格。
  function fieldWet(cv) {
    const g = cv.getContext('2d');
    if (!g || !g.getImageData) return true;
    let data = null;
    try { data = g.getImageData(0, 0, cv.width, cv.height).data; } catch (e) { return true; }
    if (!data || data.length < 4) return true;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 1] > 127) return true;
      if (data[i] / 255 * (COAST_REACH * 2) - COAST_REACH > -0.55) return true;
    }
    return false;
  }

  // 一块水面。不透明着色器铺在地面底下，陆地贴图挖洞才看得见。
  // 浅处是沙色，远处变深，两层亮纹按世界坐标滚动，碎沫只留在岸距 0 附近。
  function addSeaMesh(parent, map, terrain, theme, rect, px, shared) {
    if (!DL.IsoArt || !DL.IsoArt.coastField || !map || !map[0]) return null;
    const x0 = rect ? rect.x0 : 0;
    const y0 = rect ? rect.y0 : 0;
    const x1 = rect ? rect.x1 : map[0].length;
    const y1 = rect ? rect.y1 : map.length;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return null;
    // 内陆块没有水：先扫一格出血，没海/沙就连网格都别建。
    if (rect && terrain) {
      let wet = false;
      const ty0 = Math.max(0, y0 - 1), ty1 = Math.min(map.length, y1 + 1);
      const tx0 = Math.max(0, x0 - 1), tx1 = Math.min(map[0].length, x1 + 1);
      for (let y = ty0; y < ty1 && !wet; y++) {
        for (let x = tx0; x < tx1; x++) {
          const t = terrain[y][x];
          if (map[y][x] === 1 || t === 2 || t === 3 || t === 4) { wet = true; break; }
        }
      }
      if (!wet) return null;
    }
    // 岸距场：整张图算一次（gSea），各块共用同一张贴图、UV 走地图比例。
    // 以前每块各算一遍（chamfer + 逐像素噪声），海边的块一块 15~30ms，一进海岸就掉帧。
    let cv = null, tex = null, uW = w, uH = h;
    if (shared && shared.tex) {
      tex = shared.tex; uW = shared.W; uH = shared.H;
    } else {
      cv = DL.IsoArt.coastField(terrain, map[0].length, map.length, x0, y0, x1, y1, shorePx(map, px));
      if (!cv || !fieldWet(cv)) return null;
      tex = distTex(cv);
    }
    const geo = new THREE.PlaneGeometry(w, h, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(x0 + w / 2, SEA_Y, y0 + h / 2);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // 共用整图岸距场时 UV 用地图比例，各块纹理才能严丝合缝
      uv.setXY(i, pos.getX(i) / uW, pos.getZ(i) / uH);
    }
    uv.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uDist: { value: tex },
        uTime: { value: 0 },
      },
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      transparent: true,
      premultipliedAlpha: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    mat.userData.sharedDist = !!(shared && shared.tex);   // 共用贴图不能跟着块一起 dispose
    seaMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -9;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return { mesh: mesh, tex: mat.userData.sharedDist ? null : tex };
  }

  function dropSea(rec) {
    if (!rec) return;
    if (ground && rec.mesh) {
      ground.remove(rec.mesh);
      if (rec.mesh.geometry) rec.mesh.geometry.dispose();
    }
    if (rec.mesh && rec.mesh.material && rec.mesh.material.uniforms) releaseSeaMat(rec.mesh.material);
    else if (rec.tex) rec.tex.dispose();
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

  /* 立牌倾斜（默认开，2026-10-30）
     主人反馈：从上方走下来时，立牌像"一张纸片立起来"。
     根因是几何上的：板面永远竖直，而相机以 55° 俯视，竖直面被投影压掉 cos55≈0.57，
     地面却按 sin55≈0.82 显示——于是人和房子在屏幕上比脚下格子矮胖，而且永远看不到顶面，
     怎么调大小都拧巴（现在的 H 常量全在替这个压扁做补偿）。
     打开后板面绕**底边**后仰 (90°−pitch)=35°，被压扁的程度从 cos55 抬到 cos20≈0.94。
     代价：脚底只靠接触阴影/剪影锚定，树这种高物体会有一点"往后躺"的观感。 */
  const TILT = (function () {
    const q = (global.location && global.location.search) || '';
    const m = /[?&]tilt=([\d.]+)/.exec(q);
    if (m) return Math.min(1, Math.max(0, Number(m[1])));
    return 0.6;   // 2026-10-30 主人拍板：0.6（后仰 21°）。`?tilt=0` 旧观感、`?tilt=1` 最"正"
  })();

  /* 后仰带来的"人变大"补偿（2026-10-30 第二轮，主人：tilt=1 时人看起来大不少）
     后仰后板面几乎正对相机，投影从 cos55≈0.574 变成 cos20≈0.940，屏幕上就是高了 1.63 倍。
     这里按两个投影系数的商把板面整体缩回去，**开关前后屏幕尺寸一致**；
     缩放是等比的（宽高一起缩），所以不再是"压扁"，只是个小一点、瘦一点的人。
     `?pscale=1.1` 可以在补偿后再放大一点，方便微调。 */
  const PSCALE = (function () {
    const q = (global.location && global.location.search) || '';
    const m = /[?&]pscale=([\d.]+)/.exec(q);
    return m ? Math.max(0.3, Math.min(2.5, Number(m[1]))) : 1;
  })();

  function tiltScale() {
    if (!TILT) return 1;
    const p = CAM.pitch * Math.PI / 180;
    const th = (90 - CAM.pitch) * TILT * Math.PI / 180;
    return Math.cos(p) / Math.cos(p - th) * PSCALE;
  }

  function billboard(tex, w, hRaw, order) {
    // 后仰补偿：等比缩到和"竖直立牌"一样的屏幕尺寸（宽高一起缩，不压扁）
    const k = tiltScale();
    w *= k;
    const h = hRaw * k;
    const geo = new THREE.PlaneGeometry(w, h);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    // 立牌必须正对相机。相机一转偏航（斜角 45°），固定朝 +Z 的板子会被斜看成
    // cos45 = 0.707，人物和房子横向压扁 29%——这是改相机最容易踩的坑。
    m.rotation.y = CAM.yaw * Math.PI / 180;
    if (TILT) {
      // 原点从"中心"挪到"底边"，绕底边后仰；底边始终钉在地面 y=0.02
      geo.translate(0, h / 2, 0);
      m.rotation.order = 'YXZ';
      m.rotation.x = -(90 - CAM.pitch) * Math.PI / 180 * TILT;
      m.position.y = 0.02;
    } else {
      m.position.y = h / 2;
    }
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
    for (let i = seaMats.length - 1; i >= 0; i--) releaseSeaMat(seaMats[i]);
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
  function fitSun(W, H) {    if (!sun) return;
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

  /* ---------- 板块地面（?tiles=flat 退回整张平铺） ----------
     几何在 tile-plate.js（游戏和验收台共用同一份）。这里只负责取样每格色调。 */
  // mir：浅槽 + 窄缝（粗黑 V 槽会盖住贴图）。砖仍 1 格一块——放大砖会让一屏显得空。
  const PLATE_H = 0.014;
  const PLATE_GAP = 0.012;
  const PLATE_CELL = 1;
  function buildPlateGround(srcCanvas, W, H, bx0, by0, bx1, by1) {
    // 每格一个平均色，给斜面染色：整张地面缩到 W×H，一格一像素，只用一次
    const small = document.createElement('canvas');
    small.width = W;
    small.height = H;
    const sg = small.getContext('2d');
    sg.drawImage(srcCanvas, 0, 0, W, H);
    let px = null;
    try { px = sg.getImageData(0, 0, W, H).data; } catch (e) { px = null; }
    const colorAt = px
      ? (x, z) => {
        const p = (z * W + x) * 4;
        return [px[p] / 255, px[p + 1] / 255, px[p + 2] / 255];
      }
      : null;

    const cols = bx1 - bx0 + 1;
    const rows = by1 - by0 + 1;
    return DL.TilePlate.build({
      cols: cols,
      rows: rows,
      tex: texOfCanvas(srcCanvas, true),
      uPerCell: 1 / W,
      vPerCell: 1 / H,
      u0: bx0 / W,
      vBase: 1 - (by0 + 1) / H,
      originX: bx0,
      originZ: by0,
      h: PLATE_H,
      gap: PLATE_GAP,
      baseColor: '#3b3025',
      colorAt: colorAt,
    });
  }

  /* ---------- 石板区（城内广场 / 路） ----------
     mir：平面贴图（夯土缝 + 不规则石块）。不用 TilePlate 方格 V 槽——那套读成瓷砖勾缝。
     实测 41×41 很快，不分块；安全区缩到 31×31 后更轻（贴图 1984²，几毫秒）。 */
  function addPlate(map, terrain, theme, W, H, parent) {
    if (!(DL.IsoArt && DL.IsoArt.slabSheet)) return false;
    let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
    for (let y = 0; y < H; y++) {
      if (!terrain[y]) continue;
      for (let x = 0; x < W; x++) {
        if (terrain[y][x] === 1 && map[y][x] !== 1) {
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
    }
    if (!(bx1 >= bx0 && by1 >= by0)) return false;
    const cols = bx1 - bx0 + 1, rows = by1 - by0 + 1;
    // 贴图最长边封顶 ~2688px：31 格时 64px/格（1984²）；以后城放大自动降像素，
    // 免得一块广场变成 3520² / 49MB 一张贴图，手机扛不住
    const px = Math.max(32, Math.min(64, Math.floor(2688 / Math.max(cols, rows))));
    const sheet = DL.IsoArt.slabSheet(cols, rows, { tile: 1, px: px, theme: theme, seed: 7 });
    const tex = groundTex(sheet);
    const geo = new THREE.PlaneGeometry(cols, rows, 1, 1);
    geo.rotateX(-Math.PI / 2);
    // Basic：贴图色就是画的色，不被天光冲成「白瓷砖」。深度关，压在底材平面之上。
    const mat = new THREE.MeshBasicMaterial({
      map: tex, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(bx0 + cols / 2, 0.004, by0 + rows / 2);
    mesh.renderOrder = -9;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return true;
  }

  function chunkKey(x0, y0) { return x0 + ',' + y0; }

  function makeChunk(r) {
    const c = gCtx;
    if (!c || !ground) return;
    let cv = null;
    try {
      cv = DL.IsoArt.groundSheet(c.map, c.terrain, c.theme, {
        px: c.px, seed: 7, style: { path: 'slab' }, big: true, cutSea: true,
        rect: { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }, margin: 1,
        coast: gSea ? gSea.canvas : null, coastPx: gSea ? gSea.px : 0,
        sandMask: gSea ? gSea.sand : null,
      });
    } catch (e) {
      console.warn('[3D] 地面块生成失败', e);
      return;
    }
    const tex = groundTex(cv);
    const w = r.x1 - r.x0, h = r.y1 - r.y0;
    const sea = addSeaMesh(ground, c.map, c.terrain, c.theme, {
      x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1,
    }, c.px, gSea);
    // 一块 = 一个平面，世界尺寸按格数；四面和邻块共边（整数格坐标，不会裂）
    const geo = new THREE.PlaneGeometry(w, h, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(r.x0 + w / 2, 0, r.y0 + h / 2);
    // 地面保持不透明。水面是盖在上面的半透明层，浅处能看见沙。
    // 挖洞进透明队列会让岸边的 mip 变成一格一格的方块。
    const mesh = new THREE.Mesh(geo, groundMat(tex, false));
    mesh.renderOrder = -10;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    ground.add(mesh);
    gChunks.set(chunkKey(r.x0, r.y0), { mesh: mesh, tex: tex, sea: sea });
  }

  function freeChunk(key) {
    const c = gChunks && gChunks.get(key);
    if (!c) return;
    dropSea(c.sea);
    if (ground && c.mesh) {
      ground.remove(c.mesh);
      if (c.mesh.geometry) c.mesh.geometry.dispose();
      if (c.mesh.material) c.mesh.material.dispose();
    }
    if (c.tex) c.tex.dispose();
    gChunks.delete(key);
  }

  function clearChunks() {
    if (gIdle) {
      if (global.cancelIdleCallback) global.cancelIdleCallback(gIdle);
      else global.clearTimeout(gIdle);
      gIdle = 0;
    }
    if (gChunks) {
      const keys = Array.from(gChunks.keys());
      for (let i = 0; i < keys.length; i++) freeChunk(keys[i]);
    }
    gChunks = null;
    gQueue = [];
    gCtx = null;
    gRangeKey = '';
    gNeed = [];
    gQueued = {};
  }

  function pumpChunks() {
    gIdle = 0;
    if (!gCtx || !gQueue.length) return;
    const r = gQueue.shift();
    try {
      if (!gChunks.has(chunkKey(r.x0, r.y0))) makeChunk(r);
    } catch (e) {
      console.warn('[3D] 地面块生成失败（跳过）', e);
    }
    schedulePump();
  }

  function schedulePump() {
    if (gIdle || !gQueue.length) return;
    if (global.requestIdleCallback) gIdle = global.requestIdleCallback(pumpChunks, { timeout: 250 });
    else gIdle = global.setTimeout(pumpChunks, 100);
  }

  // 屏幕四角打到地面 = 真正可见的四边形。
  // 只按它的包围盒取块会多要一倍（斜着看时 bbox 比四边形大很多），所以还要做"点在四边形内"判断。
  function viewQuad() {
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const q = [];
    for (let i = 0; i < 4; i++) {
      const p = rayToGround(cs[i][0], cs[i][1]);
      if (!p) return null;
      q.push(p);
    }
    // 以中心为准放大 1.15 倍（≈2 格）：兜住相机 1 帧滞后和立牌底部
    let mx = 0, mz = 0;
    for (let i = 0; i < 4; i++) { mx += q[i].x; mz += q[i].z; }
    mx /= 4; mz /= 4;
    for (let i = 0; i < 4; i++) {
      q[i] = { x: mx + (q[i].x - mx) * 1.15, z: mz + (q[i].z - mz) * 1.15 };
    }
    return q;
  }

  function quadBounds(q) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < 4; i++) {
      if (q[i].x < x0) x0 = q[i].x;
      if (q[i].x > x1) x1 = q[i].x;
      if (q[i].z < z0) z0 = q[i].z;
      if (q[i].z > z1) z1 = q[i].z;
    }
    return { x0: x0, z0: z0, x1: x1, z1: z1 };
  }

  // 点在凸四边形内（顶点顺序无所谓）
  function inQuad(q, x, z) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) & 3];
      const cr = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
      if (cr > 1e-9) { if (sign < 0) return false; sign = 1; }
      else if (cr < -1e-9) { if (sign > 0) return false; sign = -1; }
    }
    return true;
  }

  // 块的矩形只要有一个角/中心落在视野四边形里，就算需要
  function rectTouchesQuad(q, r) {
    return inQuad(q, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) ||
      inQuad(q, r.x0, r.y0) || inQuad(q, r.x1, r.y0) ||
      inQuad(q, r.x0, r.y1) || inQuad(q, r.x1, r.y1);
  }

  function syncChunks() {
    if (!gCtx || !B) return;
    const P = B.P();
    const cx = Math.floor(P.x / CHUNK_CELLS), cy = Math.floor(P.y / CHUNK_CELLS);
    const cols = gCtx.cols, rows = gCtx.rows;
    const atAbs = function (gx, gy) {
      if (gx < 0 || gy < 0) return null;
      const x0 = gx * CHUNK_CELLS, y0 = gy * CHUNK_CELLS;
      if (x0 >= cols || y0 >= rows) return null;
      return { x0: x0, y0: y0, x1: Math.min(cols, x0 + CHUNK_CELLS), y1: Math.min(rows, y0 + CHUNK_CELLS) };
    };
    const addBox = function (into, ax0, ay0, ax1, ay1) {
      for (let gy = ay0; gy <= ay1; gy++) {
        for (let gx = ax0; gx <= ax1; gx++) {
          const r = atAbs(gx, gy);
          if (r) into[chunkKey(r.x0, r.y0)] = r;
        }
      }
    };

    // ① 视野范围变了才重算"需要哪些块" + 释放远处的块
    const quad = viewQuad();
    const vb = quad ? quadBounds(quad) : null;
    // 4 格为一档：小步移动不重算，跨过一档再算
    const rk = vb
      ? [Math.floor(vb.x0 / 4), Math.floor(vb.z0 / 4),
         Math.floor(vb.x1 / 4), Math.floor(vb.z1 / 4)].join(',')
      : '';
    if (rk !== gRangeKey) {
      gRangeKey = rk;
      const need = {};
      if (vb) {
        const gx0 = Math.floor(vb.x0 / CHUNK_CELLS), gx1 = Math.floor(vb.x1 / CHUNK_CELLS);
        const gy0 = Math.floor(vb.z0 / CHUNK_CELLS), gy1 = Math.floor(vb.z1 / CHUNK_CELLS);
        for (let gy = gy0; gy <= gy1; gy++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            const r = atAbs(gx, gy);
            // 包围盒里大部分是屏幕四角外的死区，用四边形筛一遍，块数能省一半
            if (r && rectTouchesQuad(quad, r)) need[chunkKey(r.x0, r.y0)] = r;
          }
        }
      }
      addBox(need, cx, cy, cx, cy);
      gNeed = Object.keys(need).map(function (k) { return need[k]; });
      // 缓冲一圈，避免在边界上来回走反复重建
      const keep = {};
      for (let i = 0; i < gNeed.length; i++) {
        const r = gNeed[i];
        addBox(keep,
          Math.floor(r.x0 / CHUNK_CELLS) - 1, Math.floor(r.y0 / CHUNK_CELLS) - 1,
          Math.floor(r.x0 / CHUNK_CELLS) + 1, Math.floor(r.y0 / CHUNK_CELLS) + 1);
      }
      Array.from(gChunks.keys()).forEach(function (k) {
        if (!keep[k]) { delete gQueued[k]; freeChunk(k); }
      });
      // 队列整个重建（下面 ② 会按 gNeed 重新排），别在这里 filter——
      // 那会和 ② 重复入队，队列里一半是重复项
      gQueue = [];
      gQueued = {};
      gQueue.sort(function (a, b) {
        const da = Math.abs(a.x0 / CHUNK_CELLS - cx) + Math.abs(a.y0 / CHUNK_CELLS - cy);
        const db = Math.abs(b.x0 / CHUNK_CELLS - cx) + Math.abs(b.y0 / CHUNK_CELLS - cy);
        return da - db;
      });
    }

    // ② 每帧补缺（幂等）：缺了就排上，绝不因为"玩家没换块"漏掉
    const mine = chunkKey(cx * CHUNK_CELLS, cy * CHUNK_CELLS);
    for (let i = 0; i < gNeed.length; i++) {
      const r = gNeed[i], k = chunkKey(r.x0, r.y0);
      if (gChunks.has(k) || gQueued[k]) continue;
      gQueued[k] = 1;
      if (k === mine) {
        // 脚下这块当场画（25~45ms），出错也不能把整个 3D 带崩
        try { makeChunk(r); } catch (e) { console.warn('[3D] 脚下地面块失败', e); }
      } else {
        gQueue.push(r);
      }
    }
    if (gQueue.length) schedulePump();
  }

  // 地图外的一圈海。128×128 的图里陆地只占 96，`?shot=map` 会同时看到图内和图外：
  // 图内是海面着色器（有亮纹），图外要是纯色，边界就是一条硬边。
  // 所以外面用**同一个着色器**铺四条：UV 走地图比例，超出部分被 clamp 到图边的深水，
  // 亮纹按世界坐标走，接缝看不出来。
  let outerSeaMat = null;
  function updateOuterSea(W, H, field) {
    if (!field || !field.tex) {
      if (outerSea) outerSea.visible = false;
      return;
    }
    if (!outerSea) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uDist: { value: field.tex }, uTime: { value: 0 } },
        vertexShader: SEA_VERT,
        fragmentShader: SEA_FRAG,
        transparent: true,
        premultipliedAlpha: false,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      mat.userData.sharedDist = true;     // 贴图是整图共用的，别跟着这条释放
      seaMats.push(mat);
      outerSeaMat = mat;
      outerSea = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), mat);
        mesh.renderOrder = -13;          // 一切地面之前
        mesh.frustumCulled = false;
        outerSea.add(mesh);
      }
      scene.add(outerSea);
    }
    outerSea.visible = true;
    outerSeaMat.uniforms.uDist.value = field.tex;
    const D = Math.max(W, H) * 2;
    // 北 / 南 / 西 / 东：东南西含四角，北含左右两条
    const quads = [
      [W / 2, -D / 2, W + 2 * D, D],
      [W / 2, H + D / 2, W + 2 * D, D],
      [-D / 2, H / 2, D, H],
      [W + D / 2, H / 2, D, H],
    ];
    for (let i = 0; i < 4; i++) {
      const q = quads[i];
      const mesh = outerSea.children[i];
      const g = new THREE.PlaneGeometry(q[2], q[3], 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(q[0], SEA_Y, q[1]);
      const uv = g.attributes.uv;
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        uv.setXY(k, pos.getX(k) / W, pos.getZ(k) / H);
      }
      uv.needsUpdate = true;
      if (mesh.geometry) mesh.geometry.dispose();
      mesh.geometry = g;
    }
  }

  function buildGround() {
    clearChunks();                 // 先放掉旧块（要 ground 还在才能摘网格）
    dropGround();
    const map = B && B.map && B.map();
    const terrain = B && B.terrain && B.terrain();
    if (!map || !map.length || !map[0]) return;
    const theme = DL.IsoGround && DL.IsoGround.themeOf ? DL.IsoGround.themeOf(groundSheet()) : 'field';

    // 地面贴图：iso-art（48px/格）。城内一格一块石板砖，砖色是沙色（2026-10-30）
    let srcCanvas = null;
    let W = map[0].length;
    let H = map.length;
    const A = DL.IsoArt;
    // 地图外那圈海在下面按整图岸距场铺（要等 gSea 出来），这里先关掉旧的，别露上一张图的
    if (outerSea) outerSea.visible = false;

    // 大图（>30 格）：不整张画，只同步画脚下那一块。
    // ?chunk=0 关掉分块（退回整张一次画完），用来对比"冻一下"和"补块"哪个更舒服
    if (A && A.groundSheet && !NO_CHUNK && (W > 30 || H > 30)) {
      ground = new THREE.Group();
      scene.add(ground);
      // 底衬：还没补上的块露这个纯色（不露天空蓝），进场时屏幕边缘不会闪
      const pal = (A.PALETTES && A.PALETTES[theme]) || null;
      if (pal && pal.base) {
        const g0 = new THREE.PlaneGeometry(W, H, 1, 1);
        g0.rotateX(-Math.PI / 2);
        g0.translate(W / 2, -0.02, H / 2);
        // 用 Lambert 而不是 Basic：底衬要跟块一样受光照，否则补块时那块明显更亮（一眼看出方块）
        const m0 = new THREE.Mesh(g0, new THREE.MeshLambertMaterial({ color: pal.base }));
        m0.renderOrder = -12;
        m0.frustumCulled = false;
        ground.add(m0);
      }
      // 石板板块（城内一格一块，砖色是沙色）
      if (TILES_PLATE) addPlate(map, terrain, theme, W, H, ground);
      // px：小图（房间 24 格）保持 48px 清晰；大图按 4096 封顶降档（128×128 → 32px）。
      const chunkPx = Math.min(48, Math.max(24, Math.floor(4096 / Math.max(W, H))));
      // 岸距场按整张图算一次，各块共用 + UV 走地图比例（以前每块重算，海边一块 15~30ms）。
      // 分辨率另算：128×128 在 32px 下要 1.5s，用 12px/格 只要 ~0.2s；距离场是平滑的，够用。
      if (gSea && gSea.tex && gSea.tex.dispose) gSea.tex.dispose();
      gSea = null;
      try {
        const fieldPx = Math.max(8, Math.min(chunkPx, Math.floor(1536 / Math.max(W, H))));
        const seaCv = A.coastField(terrain, W, H, 0, 0, W, H, fieldPx);
        if (seaCv && fieldWet(seaCv)) {
          // 沙带遮罩也整图建一次：块里只裁一块，别再逐像素覆盖（那是走路顿的主因）
          const sand = A.sandMask ? A.sandMask(seaCv) : null;
          gSea = { tex: distTex(seaCv), W: W, H: H, canvas: seaCv, px: fieldPx, sand: sand };
        }
      } catch (e) {
        console.warn('[3D] 整图岸距场生成失败，退回逐块算', e);
      }
      updateOuterSea(W, H, gSea);
      gCtx = { map: map, terrain: terrain, theme: theme, px: chunkPx, cols: W, rows: H };
      gChunks = new Map();
      gRangeKey = '';
    gNeed = [];
    gQueued = {};
      syncChunks();
      groundPainted = theme;
      fitSun(W, H);
      return;
    }
    if (A && A.groundSheet) {
      try {
        srcCanvas = A.groundSheet(map, terrain, theme, {
          px: 48,
          seed: 7,
          style: { path: 'slab' },
          big: true,
          cutSea: true,
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

    // 石板区（城内）：一块块抬起来的砖 + 城外一张平铺底材。砖色是沙色（2026-10-30）。
    // UV 从 0 开始铺，不做整图偏移——偏移那套算错过，砖面会采到海，整片发暗。
    if (TILES_PLATE && DL.IsoArt && DL.IsoArt.slabSheet) {
      ground = new THREE.Group();
      if (addPlate(map, terrain, theme, W, H, ground)) {
        // 城外（草地 / 海）还是整张平铺贴图，只是不铺砖。海在更低的一层。
        const sea = addSeaMesh(ground, map, terrain, theme, null, 48);
        const tex2 = groundTex(srcCanvas);
        tex2.wrapS = THREE.ClampToEdgeWrapping;
        tex2.wrapT = THREE.ClampToEdgeWrapping;
        const geo2 = new THREE.PlaneGeometry(W, H, 1, 1);
        geo2.rotateX(-Math.PI / 2);
        geo2.translate(W / 2, 0, H / 2);
        const plane = new THREE.Mesh(geo2, groundMat(tex2, false));
        plane.renderOrder = -10;
        plane.receiveShadow = true;
        plane.frustumCulled = false;
        ground.add(plane);

        scene.add(ground);
        groundPainted = theme;
        fitSun(W, H);
        return;
      }
      ground = null;
    }

    // 非板块模式 / 没有石板区：整张平铺。海在地面下面。
    ground = new THREE.Group();
    const sea = addSeaMesh(ground, map, terrain, theme, null, 48);
    const tex = groundTex(srcCanvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = groundMat(tex, false);
    // 一张铺满地图的平面：世界 xz ∈ [0,W]×[0,H]，UV 同步。
    const geo = new THREE.PlaneGeometry(W, H, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(W / 2, 0, H / 2);
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
  const HUT_H = 4.1;     // ≈1.9 人：门洞 57.8% 全高 ≈ 2.4 格，比人(2.15)高一头
  const PALM_H = 7.3;    // ≈3.4 人：椰子树该比屋脊还高一倍，压到 4.9 像竹子
  // 城里其余小物件：按 hd-draw townProp 的 index 顺序（0/1 摊位、2 篝火、3 水井、4 帐篷、5 栅栏…）
  const TOWN_H = [STALL_H, STALL_H, 1.3, 1.6, 3.2, 0.9, 1.2, 1.0, 2.6, 1.4];

  function addProp(p) {
    const town = p.sheet === 'town';
    const idx = p.index || 0;
    const Hd = DL.HdDraw;
    if (!Hd) return;
    let tex;
    let h;
    if (p.sheet === 'beachHut' || p.sheet === 'palm') {
      // 海岛地标：渔屋 + 椰子树。落点由 overworld.js 定（findBeachHut / placeBeachPalms），
      // 这里只管立起来。两种都纯装饰、不碰撞。
      const isHut = p.sheet === 'beachHut';
      h = isHut ? HUT_H : PALM_H;
      tex = paintTex(p.sheet + ':' + idx, function () {
        return isHut ? Hd.beachHut(idx) : Hd.palm(idx);
      });
      if (!tex) return;
      const m = billboard(tex, h * (tex.image.width / tex.image.height), h, 1);
      m.position.x = p.x + 0.5;
      m.position.z = p.y + 0.5;
      // 底座比脚点宽，遮挡按脚底再往前推一点；椰子树细，少推
      m.userData.frontPad = isHut ? 0.7 : 0.35;
      own(m);
      return;
    }
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
    // 2026-10-29：立牌全去掉。城里只留 NPC，房子/摊位/石头/树都不生成。
    return;
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
    // buildCliffs()  // 2026-10-29：山谷先去掉，岛的边界交给海和草地
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
    // 透视下可见地面是一个梯形：越远越宽。用四个屏幕角打射线，量出真实的地面范围，
    // 别再拿正交那半屏宽去夹（夹少了地图边会露出底色）。
    placeCamera();
    let minX = -Infinity, maxX = Infinity, minZ = -Infinity, maxZ = Infinity;
    const corners = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
    for (let i = 0; i < corners.length; i++) {
      const hit = rayToGround(corners[i][0], corners[i][1]);
      if (!hit) continue;
      minX = Math.max(minX, look.x - hit.x);
      maxX = Math.min(maxX, hit.x - look.x);
      minZ = Math.max(minZ, look.z - hit.z);
      maxZ = Math.min(maxZ, hit.z - look.z);
    }
    if (!isFinite(minX)) return;
    // minX = −(向左伸出去多少) = 下界；maxX = 向右伸出去多少 = 上界要扣掉的量
    if (W <= maxX - minX) look.x = W / 2;
    else look.x = Math.max(minX, Math.min(W - maxX, look.x));
    if (H <= maxZ - minZ) look.z = H / 2;
    else look.z = Math.max(minZ, Math.min(H - maxZ, look.z));
  }

  /* 相机
     默认 = mir 定稿：yaw0 / pitch55 / fov32 / zoom1.70（竖向≈20 格）。
     iso 等旧预设用 ?cam= 保留对比；iso 才是菱形 2:1（偏航 45° + 俯角 30° + 正交）。
     开关 ?cam=…：
       mir       正下俯视 + 中焦透视（默认，已定稿）
       iso       斜角 45° + 俯角 30° + 正交（旧默认，菱形 2:1）
       diag45    斜角 45° + 俯角 45° + 正交（更陡，菱形 1.41:1）
       diag45p   斜角 45° + 俯角 45° + 透视
       up45      正下 45° + 正交
       now       正下 45° + 长焦透视
     只换相机，玩法/拾取不动：点地走的是 rayToGround 射线，换投影自动跟着变。 */
  const CAM = (function () {
    const q = (global.location && global.location.search) || '';
    const m = q.match(/(?:^|[?&])cam=([^&]+)/);
    const k = m ? decodeURIComponent(m[1]) : 'mir';
    if (k === 'now') return { k: k, yaw: 0, pitch: 45, ortho: false, fov: 22 };
    if (k === 'iso') return { k: k, yaw: 45, pitch: 30, ortho: true };
    if (k === 'up45') return { k: k, yaw: 0, pitch: 45, ortho: true };
    if (k === 'diag45') return { k: k, yaw: 45, pitch: 45, ortho: true };
    if (k === 'diag45p') return { k: k, yaw: 45, pitch: 45, ortho: false, fov: 22 };
    return { k: 'mir', yaw: 0, pitch: 55, ortho: false, fov: 32 };
  })();
  const FOV = CAM.fov || 22;
  const BASE_DIST = (Pick.FRUSTUM_W / 2) / Math.tan(FOV * Math.PI / 360);
  // 正交时距离只决定"看多远"，不影响大小；取个够大、near/far 够宽的就行
  const CAM_DIST = CAM.ortho ? 140 : BASE_DIST;

  function placeCamera() {
    const yaw = CAM.yaw * Math.PI / 180;
    const pit = CAM.pitch * Math.PI / 180;
    const dist = CAM_DIST / (zoom || 1);
    camera.position.set(
      look.x + dist * Math.sin(yaw) * Math.cos(pit),
      dist * Math.sin(pit),
      look.z + dist * Math.cos(yaw) * Math.cos(pit)
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(look.x, 0, look.z);
    if (CAM.ortho) {
      // 画幅和透视版在焦点平面上对齐：竖向 = FRUSTUM_W 格 / zoom（透视的 fov 是竖向的！）
      const halfH = (Pick.FRUSTUM_W / 2) / (zoom || 1);
      const halfW = halfH * (Pick.VIEW_W / Pick.VIEW_H);
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.near = 0.1;
      camera.far = 600;
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  // 屏幕 NDC → 地面格（透视投影必须用真射线，不能再用正交那套比例换算）
  const _ndc = new THREE.Vector2();
  const _ray = new THREE.Raycaster();
  function rayToGround(nx, ny) {
    _ndc.set(nx, ny);
    _ray.setFromCamera(_ndc, camera);
    const o = _ray.ray.origin;
    const d = _ray.ray.direction;
    if (!d || Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    if (t <= 0) return null;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
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

  // 小地图改成"等距缩略图"：格子按 45° 菱形画，和主画面一个视角。
  // 尺寸缩到 150，挪到右下角（原来 180 在右上，太占地方）。
  // 小地图跟主视角同向：上方 = 北（世界 −z），不做 45° 旋转。
  // 纵向压扁 0.7 只是暗示"俯视角度"，不再歪成菱形。
  function miniLayout(map) {
    const w = mini.width;
    const h = mini.height;
    const mw = map[0].length;
    const mh = map.length;
    const k = 0.7;
    const s = Math.min((w - 8) / mw, (h - 8) / (mh * k));
    return { mw: mw, mh: mh, s: s, k: k, ox: (w - mw * s) / 2, oy: (h - mh * s * k) / 2 };
  }

  // 格坐标 → 小地图像素（等距：x−y 走横轴，x+y 走竖轴）
  function miniXY(lay, x, y) {
    return { x: lay.ox + x * lay.s, y: lay.oy + y * lay.s * lay.k };
  }

  function miniColor(map, terrain, x, y) {
    const m = map[y][x];
    const t = terrain && terrain[y] ? terrain[y][x] : 0;
    if (m === 2) return '#f0c840';
    if (t === 3) return '#3F6E92';       // 海
    if (t === 4) return '#E8D6A8';       // 沙滩
    if (m === 1) return '#8A7F6C';       // 城墙
    if (t === 1) return '#C9BEA8';       // 城内石板
    return '#6FA24E';                    // 草地
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
    const cw = Math.ceil(lay.s) + 1;
    const ch = Math.ceil(lay.s * lay.k) + 1;
    for (let y = 0; y < lay.mh; y++) {
      for (let x = 0; x < lay.mw; x++) {
        const p = miniXY(lay, x, y);
        g.fillStyle = miniColor(map, terrain, x, y);
        g.fillRect(p.x, p.y, cw, ch);
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
      const p = miniXY(lay, e.x, e.y);
      g.fillStyle = e.boss ? '#ff5a5a' : '#ffd166';
      g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    const pp = miniXY(lay, P.x, P.y);
    g.fillStyle = '#ffffff';
    g.fillRect(pp.x - 2, pp.y - 2, 4, 4);
  }

  function tick() {
    if (!B || glLost) return;
    const t0 = performance.now();
    const P = B.P();
    const now = t0;
    const seaT = now * 0.001;
    for (let si = 0; si < seaMats.length; si++) seaMats[si].uniforms.uTime.value = seaT;

    // A5：人与镜头都硬跟步插值。软跟会和匀速滑步打架，看起来像掉帧
    const vis = (B.step && B.step()) || { x: P.x + 0.5, y: P.y + 0.5, t: 1, moving: false };
    const room = B.room() + '|' + B.map()[0].length + 'x' + B.map().length;
    if (room !== roomKey) {
      roomKey = room;
      spritesReady = false;
      rebuildRoom();
    }
    if (!spritesReady && assetsReady()) {
      spritesReady = true;
      rebuildRoom();
    }
    look.x = vis.x;
    look.z = vis.y;
    // 地面分块：玩家换块了才干活（脚下那块同步补，四周排队）
    if (gCtx) syncChunks();
    clampLook();
    placeCamera();
    if (renderer) renderer.setClearColor(groundSheet() === 'terrain-cave' ? '#1a2430' : '#7eb6e6', 1);

    // 主角位置/朝向
    if (hero) {
      hero.position.x = vis.x;
      hero.position.z = vis.y;
      const moving = !!vis.moving;
      const strike = now - (B.strikeAt ? B.strikeAt() : 0) < 260;
      const bob = moving ? Math.sin(now / 1000 * 8) * (2 / 48) : Math.sin(now / 1000 * 2) * (1 / 48);
      hero.position.y = (hero.userData.foot || 0) + bob;
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
        else if (moving) {
          const stepMs = (DL.DATA && DL.DATA.WALK_STEP_MS) || 180;
          col = 1 + (Math.floor(now / stepMs) % 2);
        }
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
    // 帧率常驻（左上角 HUD #fps）：1 秒窗口统计一次。
    // 别用瞬时值——高刷屏上 rAF 会 165→276 乱跳，看不出真实手感；也别逐帧写 DOM。
    fpsFrames += 1;
    if (!fpsLastT) fpsLastT = now;
    if (now - fpsLastT >= 1000) {
      fpsEma = fpsFrames * 1000 / (now - fpsLastT);
      fpsFrames = 0;
      fpsLastT = now;
      if (fpsEl) {
        const v = Math.round(fpsEma);
        fpsEl.textContent = v + ' fps';
        fpsEl.dataset.level = v >= 50 ? 'ok' : (v >= 30 ? 'warn' : 'bad');
      }
    }
    if (showStats && statsEl) {
      const info = renderer.info.render;
      const frameMs = performance.now() - t0;
      statsEl.textContent = 'fps ' + fpsEma.toFixed(0)
        + '  frame ' + frameMs.toFixed(2) + ' ms'
        + '  draws ' + info.calls
        + '  tris ' + info.triangles;
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
    const hit = rayToGround(nx, ny);
    if (!hit) return;
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
    if (shot === 'map') zoom = 0.3;      // 整座岛（128×128 图里看陆地 96×96）

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
    camera = CAM.ortho
      ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600)
      : new THREE.PerspectiveCamera(FOV, Pick.VIEW_W / Pick.VIEW_H, 0.1, 400);
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
    mini.width = 140;
    mini.height = 140;
    mini.style.cssText = 'position:fixed;right:12px;top:60px;width:140px;height:140px;z-index:6;border:1px solid rgba(150,176,220,.35);background:#101623;pointer-events:none;';
    document.body.appendChild(mini);
    showStats = /(?:^|[?&])stats=1(?:&|$)/.test(q);
    if (showStats) {
      statsEl = document.createElement('div');
      statsEl.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:6;color:#eef2fa;background:rgba(8,12,20,.72);padding:6px 8px;font:12px ui-monospace,monospace;pointer-events:none;';
      document.body.appendChild(statsEl);
    }
    on = true;
    fpsEl = document.getElementById('fps');
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
    // 调试用：现在驻留了哪些块、还排着几块、块多大
    chunks: function () { return gChunks ? Array.from(gChunks.keys()) : []; },
    // 视野四边形 / 需要哪些块（调试用：块数不对时先看这两个）
    viewQuad: function () { return viewQuad(); },
    ray: function (nx, ny) { return rayToGround(nx, ny); },
    chunkNeed: function () { return gNeed.map(function (r) { return r.x0 + ',' + r.y0; }); },
    pendingChunks: function () { return gQueue.length; },
    chunkCell: CHUNK_CELLS,
    // 格子 → 屏幕 NDC。透视下这个反算只有相机自己算得准，测试脚本也走这里，
    // 免得测试用一套公式、游戏用另一套（以前就是这么漂的）。
    cellToNdc: function (gx, gz) {
      const v = new THREE.Vector3(gx, 0, gz).project(camera);
      return { nx: v.x, ny: v.y };
    },
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
