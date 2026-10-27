// 正交射线：地面往返、半格内不点错。不加载 Three，不开 WebGL。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ctx = { console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'three-pick.js'), 'utf8'), ctx);
const P = ctx.DL.ThreePick;

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) pass += 1;
  else { fail += 1; console.log('FAIL', name); }
}

for (let i = 0; i < 100; i++) {
  const gx = ((i * 17) % 230) / 10 - 3.15;
  const gz = ((i * 29) % 230) / 10 - 1.27;
  const focusX = ((i * 3) % 50) / 5;
  const focusZ = ((i * 5) % 50) / 5;
  const zoom = i % 5 === 0 ? 1.4 : 1;
  const ndc = P.ndcForGround(focusX, focusZ, gx, gz, zoom);
  const hit = P.groundHit(focusX, focusZ, ndc.nx, ndc.ny, zoom);
  check('往返 ' + i, Math.abs(hit.x - gx) < 1e-6 && Math.abs(hit.z - gz) < 1e-6);
}

// 格子中心、以及偏半格以内，都落在这一格
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    const samples = [
      [0.5, 0.5],
      [0.08, 0.5],
      [0.92, 0.5],
      [0.5, 0.08],
      [0.5, 0.92],
      [0.2, 0.8],
    ];
    for (let s = 0; s < samples.length; s++) {
      const gx = x + samples[s][0];
      const gz = y + samples[s][1];
      const ndc = P.ndcForGround(12, 10, gx, gz, 1);
      const hit = P.groundHit(12, 10, ndc.nx, ndc.ny, 1);
      const cell = P.cellOf(hit.x, hit.z);
      check('格 ' + x + ',' + y + ' #' + s, cell.x === x && cell.y === y);
    }
  }
}

// 视锥尺寸就是文档写的 1280/48 × 720/48
check('视锥宽', Math.abs(P.FRUSTUM_W - 1280 / 48) < 1e-9);
check('视锥高', Math.abs(P.FRUSTUM_H - 720 / 48) < 1e-9);
check('俯角 45°', Math.abs(P.PITCH - Math.PI / 4) < 1e-9);

console.log('RESULT pass=' + pass + ' fail=' + fail);
if (fail) process.exit(1);
