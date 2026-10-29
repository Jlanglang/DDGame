/* 豆豆暗黑传奇 · 正交相机射线
   只算「屏幕点打到 y=0 是哪一格」。不创建 WebGL。
   俯角 45°，相机在 +Z 一侧往下看。1 格 = 1 世界单位。
   屏幕：1280×720，1 格对应 48 像素，所以视锥大约 26.7×15。
*/
import { DL } from './namespace.js';
const global = globalThis;
  const PITCH = Math.PI / 4;
  const VIEW_W = 1280;
  const VIEW_H = 720;
  const CELL_PX = 48;
  const FRUSTUM_W = VIEW_W / CELL_PX;
  const FRUSTUM_H = VIEW_H / CELL_PX;

  // nx, ny 是 -1..1，ny 向上。zoom>1 看得更近。
  function groundHit(focusX, focusZ, nx, ny, zoom) {
    const z = zoom || 1;
    const sx = nx * (FRUSTUM_W / 2) / z;
    const sy = ny * (FRUSTUM_H / 2) / z;
    const s = Math.sin(PITCH);
    return {
      x: focusX + sx,
      z: focusZ - sy / s,
    };
  }

  function cellOf(x, z) {
    return { x: Math.floor(x), y: Math.floor(z) };
  }

  function ndcForGround(focusX, focusZ, gx, gz, zoom) {
    const z = zoom || 1;
    const sx = gx - focusX;
    const sy = -(gz - focusZ) * Math.sin(PITCH);
    return {
      nx: (sx / (FRUSTUM_W / 2)) * z,
      ny: (sy / (FRUSTUM_H / 2)) * z,
    };
  }

  // mobs.png 是 8 列，一行两只，每只 4 帧。和 2D 的 index = 序号*4+帧 同一套。
  function mobFrame(mobRow, frame) {
    const idx = (mobRow | 0) * 4 + (frame | 0);
    return { col: idx % 8, row: idx >> 3 };
  }

  DL.ThreePick = {
    PITCH: PITCH,
    VIEW_W: VIEW_W,
    VIEW_H: VIEW_H,
    CELL_PX: CELL_PX,
    FRUSTUM_W: FRUSTUM_W,
    FRUSTUM_H: FRUSTUM_H,
    groundHit: groundHit,
    cellOf: cellOf,
    ndcForGround: ndcForGround,
    mobFrame: mobFrame,
  };
export const ThreePick = DL.ThreePick;
