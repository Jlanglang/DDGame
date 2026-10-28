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
from PIL import Image

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
    H, W = a.shape[:2]
    hue, sat, val = hsv_of(a)

    # 1) 洋红：背景 + 烘死的投影
    bg = (hue > 275) & (hue < 325) & (sat > 0.45)

    # 2) 右下角水印（灰字，色相抠不到）——按区域清，清之前先看会不会切到人
    wm_mask = np.zeros((H, W), bool)
    if wm:
        y0, x0 = int(H * 0.90), int(W * 0.66)
        wm_mask[y0:, x0:] = True
        wm_mask &= ~bg
    touched = int(wm_mask.sum())

    # 3) 去粉边：把品红偏色往回收（只动偏红/偏蓝的通道，绿不动）
    pink = np.clip(np.minimum(a[..., 0] - a[..., 1], a[..., 2] - a[..., 1]), 0, None)
    a[..., 0] -= pink * 0.75
    a[..., 2] -= pink * 0.75

    alpha = np.where(bg | wm_mask, 0.0, 1.0)
    # 边缘 1px 羽化，别留锯齿
    soft = alpha.copy()
    soft[1:, :] = np.minimum(soft[1:, :], alpha[:-1, :])
    soft[:-1, :] = np.minimum(soft[:-1, :], alpha[1:, :])
    alpha = np.where(alpha > 0, np.maximum(0.6, soft), 0.0)

    out = Image.fromarray(
        (np.dstack([np.clip(a, 0, 1), alpha]) * 255).astype(np.uint8), "RGBA")
    out = out.crop(out.getbbox())
    before = out.size

    if world:
        want = int(round(world * CELL_PX * ss))
        k = want / out.height
        out = out.resize((max(1, round(out.width * k)), want), Image.LANCZOS)

    out.save(dst)
    print("ingest %s -> %s  %sx%s -> %sx%s  world=%s ss=%s  bg=%d wm=%d"
          % (src, dst, before[0], before[1], out.width, out.height,
             world, ss, int(bg.sum()), touched))


if __name__ == "__main__":
    main()
