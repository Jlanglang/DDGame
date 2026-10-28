# -*- coding: utf-8 -*-
"""3D 立牌入库：洋红底 + 烘死的投影 + 右下角水印 一起清，再按「2.5× 屏高」归尺。

    python tools/ingest-3d.py 原图.png 输出.png --world 2.34
    python tools/ingest-3d.py 原图.png 输出.png --world 4.8 --ss 2.5

--world 是这件东西的世界高度（一格 = 1 单位），和 render-three.js 的常量同一个意思：
    主角 2.34 / NPC 2.05 / 鸡 1.45 / 摊位 3.0 / 房子 4.8 / 树 11.7

为什么按色相抠，而不是「边框均值 + 容差」：
    这批 3D 图的背景和烘死的投影都是洋红（色相 300±20、饱和 >0.45），
    而皮肤（342/0.19）、鞋（332）、裙子（126）都在窗口外；按容差抠会把整张带粉调的脸削掉。
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

CELL_PX = 48
SS = 2.5


def hsv_of(a):
    mx = a.max(2)
    mn = a.min(2)
    d = mx - mn + 1e-6
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.where(mx == r, ((g - b) / d) % 6,
                   np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
    sat = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)
    return hue, sat, mx


def largest_component(mask, down):
    """最大连通块（先缩小再 BFS，纯 numpy/Python，不引 scipy）。"""
    from collections import deque

    h = max(1, mask.shape[0] // down)
    w = max(1, mask.shape[1] // down)
    small = np.asarray(
        Image.fromarray((mask * 255).astype(np.uint8)).resize((w, h), Image.BOX)) > 60
    lab = np.zeros((h, w), np.int32)
    best_id, best_n, cur = 0, 0, 0
    for y in range(h):
        for x in range(w):
            if not small[y, x] or lab[y, x]:
                continue
            cur += 1
            q = deque([(y, x)])
            lab[y, x] = cur
            n = 0
            while q:
                cy, cx = q.popleft()
                n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = cur
                        q.append((ny, nx))
            if n > best_n:
                best_id, best_n = cur, n
    if not best_id:
        return mask
    up = Image.fromarray(((lab == best_id) * 255).astype(np.uint8))
    up = up.resize((mask.shape[1], mask.shape[0]), Image.NEAREST)
    return np.asarray(up) > 0


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    src, dst = args[0], args[1]
    world, ss, wm = None, SS, True
    for i, a in enumerate(sys.argv):
        if a == "--world":
            world = float(sys.argv[i + 1])
        elif a == "--ss":
            ss = float(sys.argv[i + 1])
        elif a == "--no-watermark-cut":
            wm = False

    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255.0
    hue, sat, val = hsv_of(a)

    mag = (hue > 275) & (hue < 325) & (sat > 0.45)
    H, W = mag.shape

    # 1) 背景 = 洋红（含烘死的投影）。有的图外面还套了一圈奶油色画框/纸边，
    #    只在「离画面边缘 6% 以内」把奶白色也算成背景——这样白领子、白袜子不会被削掉
    cream = (sat < 0.45) & (val > 0.60) & (hue < 70)
    k = max(8, int(0.06 * min(H, W)))
    edge = np.zeros((H, W), bool)
    edge[:k, :] = edge[-k:, :] = True
    edge[:, :k] = edge[:, -k:] = True
    outer = mag | (cream & edge)

    # 有的图外面是一整圈「深色 + 奶油」的画框（颜色杂，抠不干净）：最外面 3% 一律当背景，
    # 前提是那一圈本来就不太像洋红（真的没框的图不会被切）
    k2 = max(6, int(0.03 * min(H, W)))
    band = np.zeros((H, W), bool)
    band[:k2, :] = band[-k2:, :] = True
    band[:, :k2] = band[:, -k2:] = True
    if mag[band].mean() < 0.5:
        outer |= band

    # 2) 右下角水印（灰字，色相抠不到）：只在那一角基本是背景时才清，免得切到人
    wm_mask = np.zeros((H, W), bool)
    if wm:
        y0, x0 = int(H * 0.90), int(W * 0.66)
        corner = outer[y0:, x0:]
        if corner.size and corner.mean() > 0.55:
            wm_mask[y0:, x0:] = True
            wm_mask &= ~outer
    touched = int(wm_mask.sum())

    # 3) 去粉边：把品红偏色往回收（只动偏红/偏蓝的通道，绿不动）
    pink = np.clip(np.minimum(a[..., 0] - a[..., 1], a[..., 2] - a[..., 1]), 0, None)
    a[..., 0] -= pink * 0.75
    a[..., 2] -= pink * 0.75

    alpha = np.where(outer | wm_mask, 0.0, 1.0)
    # 边缘 1px 羽化，别留锯齿
    soft = alpha.copy()
    soft[1:, :] = np.minimum(soft[1:, :], alpha[:-1, :])
    soft[:-1, :] = np.minimum(soft[:-1, :], alpha[1:, :])
    alpha = np.where(alpha > 0, np.maximum(0.6, soft), 0.0)

    # 4) 只留最大的那一块：画框残边、水印、飘出去的碎点都是独立的小块，直接丢掉
    solid = alpha > 0.5
    solid = largest_component(solid, 3)
    for _ in range(2):
        nxt = solid.copy()
        nxt[1:, :] |= solid[:-1, :]
        nxt[:-1, :] |= solid[1:, :]
        nxt[:, 1:] |= solid[:, :-1]
        nxt[:, :-1] |= solid[:, 1:]
        solid = nxt
    alpha = np.where(solid, alpha, 0.0)
    ys, xs = np.nonzero(solid)
    if len(ys):
        y0, y1 = max(0, ys.min() - 2), min(H, ys.max() + 3)
        x0, x1 = max(0, xs.min() - 2), min(W, xs.max() + 3)
        a, alpha = a[y0:y1, x0:x1], alpha[y0:y1, x0:x1]

    out = Image.fromarray(
        (np.dstack([np.clip(a, 0, 1), alpha]) * 255).astype(np.uint8), "RGBA")
    out = out.crop(out.getbbox())
    before = out.size

    if world:
        want = int(round(world * CELL_PX * ss))
        k = want / out.height
        out = out.resize((max(1, round(out.width * k)), want), Image.LANCZOS)

    out.save(dst)
    print("ingest %s -> %s  %sx%s -> %sx%s  world=%s ss=%s  mag=%d outer=%d wm=%d"
          % (src, dst, before[0], before[1], out.width, out.height,
             world, ss, int(mag.sum()), int(outer.sum()), touched))


if __name__ == "__main__":
    main()
