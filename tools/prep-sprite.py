# 立牌预处理：任何背景（白/灰/洋红/浅色底）→ 透明 PNG + 裁边 + 去描边脏色
#
#   python tools/prep-sprite.py 原图.png 输出.png [--height 512] [--pad 8] [--tol 42] [--defringe]
#
# 为什么不用固定洋红：豆包 / 即梦 / GPT 出的图底色不一定是洋红，白底最常见。
# 做法是从**四边**往里泛洪，只吃掉"和四角同色"的那一片：
#   - 内部的白（领子、眼白、鞋带）不会被吃，因为泛洪进不去
#   - 角色贴边的部分默认会少一点；出图时留点边距就行
# --defringe 会把残留在边缘的洋红/粉紫像素再挖一遍（适合洋红底的老图）
import sys
from collections import deque

import numpy as np
from PIL import Image


def flood_bg(rgb, tol):
    h, w = rgb.shape[:2]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb.astype(np.float32) - bg.astype(np.float32)) ** 2).sum(axis=2))
    near = dist < tol

    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen, bg


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    src, dst = args[0], args[1]
    height = pad = tol = None
    do_defringe = "--defringe" in sys.argv
    for i, a in enumerate(sys.argv):
        if a == "--height":
            height = int(sys.argv[i + 1])
        elif a == "--pad":
            pad = int(sys.argv[i + 1])
        elif a == "--tol":
            tol = int(sys.argv[i + 1])
    height = height or 512
    pad = 8 if pad is None else pad
    tol = 42 if tol is None else tol

    im = Image.open(src).convert("RGB")
    rgb = np.asarray(im)
    cut, bg = flood_bg(rgb, tol)

    a = np.dstack([rgb, np.where(cut, 0, 255).astype(np.uint8)])
    if do_defringe:
        r, g, b = rgb[:, :, 0].astype(np.int16), rgb[:, :, 1].astype(np.int16), rgb[:, :, 2].astype(np.int16)
        pink = (~cut) & ((r - g) > 10) & ((b - g) > 8)
        a[:, :, 3] = np.where(pink, 0, a[:, :, 3])

    out = Image.fromarray(a, "RGBA")
    ys, xs = np.nonzero(a[:, :, 3] > 40)
    if len(xs):
        out = out.crop((max(0, xs.min() - pad), max(0, ys.min() - pad),
                        min(im.width, xs.max() + 1 + pad), min(im.height, ys.max() + 1 + pad)))
    if height and out.height > height:
        k = height / out.height
        out = out.resize((max(1, round(out.width * k)), height), Image.LANCZOS)
    out.save(dst)
    print("sprite", dst, out.size, "bg", [int(v) for v in bg])


if __name__ == "__main__":
    main()
