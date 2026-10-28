# 去洋红描边：已经抠成透明的精灵，边缘常留一圈粉紫（原图是洋红底 JPEG）。
# 用法：python defringe.py 输入.png 输出.png [强度 0..1] [收边 0..3]
#
# 做法很朴素：把"偏洋红"的像素整片挖掉（连叶缝里透出来的洋红点一起挖，那是背景），
# 再收 1~2px 边。不往边缘补色——补色会把两片叶子之间的缝糊成一块。
# 800px 的立牌缩到 100px 显示，少 2px 看不出来；不挖的话洋红边会一直在。
import sys
import numpy as np
from PIL import Image


def defringe(src, dst, strength=1.0, erode=1):
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(np.int16)
    rgb = a[:, :, :3]
    alpha = a[:, :, 3].copy()

    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    thr_r = 6 + (1 - strength) * 30
    thr_b = 4 + (1 - strength) * 26
    pink = (alpha > 0) & ((r - g) > thr_r) & ((b - g) > thr_b)
    alpha[pink] = 0

    for _ in range(max(0, int(erode))):
        amin = alpha.copy()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                amin = np.minimum(amin, np.roll(np.roll(alpha, dy, 0), dx, 1))
        alpha = amin

    out = np.dstack([rgb.astype(np.uint8), alpha.astype(np.uint8)])
    Image.fromarray(out, "RGBA").save(dst)
    print("defringed", dst, "pink px", int(pink.sum()), "erode", erode)


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    st = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    er = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    defringe(src, dst, st, er)
