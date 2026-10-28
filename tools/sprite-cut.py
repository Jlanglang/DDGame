#!/usr/bin/env python
"""把 ComfyUI 出的「白底道具图」变成能直接塞进游戏的透明 PNG。

    python tools/sprite-cut.py in.png out.png [--size 256] [--no-trim] [--bg 白底阈值]

做的事：
  1. 从四角**洪水填充**判背景（不是全局扣白——球的白色六边形块在中间，全局扣白会打洞）
  2. 背景转 alpha，边缘做 1px 柔化
  3. 按内容裁边，补成正方形，等比缩放到 --size
  4. 存成 RGBA png

依赖 Pillow（ComfyUI 自带的 python 就有：D:\\ComfyUI\\ComfyUI_windows_portable\\python_embeded\\python.exe）
"""

from __future__ import annotations

import argparse
import sys

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    sys.exit("缺少 Pillow：用 ComfyUI 自带的 python 跑，或 pip install pillow")


KEY = (255, 0, 255)  # 洪水填充用的标记色，正常图里不会出现


def cut_background(img: Image.Image, thresh: int) -> Image.Image:
    """四角洪水填充 → 该区域透明。thresh 越大越"宽容"，会把接近背景的浅色一起吃掉。"""
    rgb = img.convert("RGB")
    w, h = rgb.size
    # 先整体加一圈 1px 的边框，保证四角连通（贴边的白底也能一次填完）
    pad = Image.new("RGB", (w + 2, h + 2), rgb.getpixel((0, 0)))
    pad.paste(rgb, (1, 1))
    draw = ImageDraw.Draw(pad)
    for xy in ((0, 0), (pad.width - 1, 0), (0, pad.height - 1), (pad.width - 1, pad.height - 1)):
        if pad.getpixel(xy) != KEY:
            ImageDraw.floodfill(pad, xy, KEY, thresh=thresh)
    pad = pad.crop((1, 1, w + 1, h + 1))

    out = img.convert("RGBA")
    px = out.load()
    bg = pad.load()
    for y in range(h):
        for x in range(w):
            if bg[x, y] == KEY:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    # 边缘柔化：alpha 轻微模糊，避免锯齿
    alpha = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.8))
    out.putalpha(alpha)
    return out


def trim_and_square(img: Image.Image, size: int | None) -> Image.Image:
    box = img.getbbox()
    if box:
        img = img.crop(box)
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    if size and canvas.width != size:
        canvas = canvas.resize((size, size), Image.LANCZOS)
    return canvas


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--size", type=int, default=0, help="输出边长，0 = 保持原尺寸")
    ap.add_argument("--no-trim", action="store_true", help="不裁边、不补正方形")
    ap.add_argument("--bg", type=int, default=48, help="背景色容差（0-255，默认 48）")
    args = ap.parse_args()

    img = Image.open(args.src)
    out = cut_background(img, args.bg)
    if not args.no_trim:
        out = trim_and_square(out, args.size or None)
    elif args.size:
        out = out.resize((args.size, args.size), Image.LANCZOS)
    out.save(args.dst)
    print(f"cut  {args.src} -> {args.dst}  {out.size[0]}x{out.size[1]}  {out.mode}")


if __name__ == "__main__":
    main()
