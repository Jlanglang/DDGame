# 洋红底抠成透明 PNG，并裁到内容。地面贴图原样拷贝。
from pathlib import Path
import shutil
from PIL import Image

SRC = Path(r"C:\Users\jlang\.cursor\projects\d-DDGame\assets")
RAW = Path(r"D:\DDGame\games\darklegend\assets\iso\raw")
OUT = Path(r"D:\DDGame\games\darklegend\assets\iso\processed")
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

SPRITES = ["shop", "tree", "hero", "stall", "npc", "chicken"]
GROUNDS = ["grass", "dirt"]


def key(src, dst):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    out = Image.new("RGBA", (w, h))
    op = out.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # JPEG 把洋红的蓝色压暗了，不能按纯 #FF00FF 距离抠。
            bg = g < 24 and r > 150 and b > 70 and (r - g) > 120
            edge = g < 42 and r > 130 and b > 55 and (r - g) > 90
            if bg:
                a = 0
            elif edge:
                a = int(min(255, (g - 18) * 10))
            else:
                a = 255
            if 0 < a < 255:
                m = min(r, g, b)
                r = int(r * 0.6 + m * 0.4)
                b = int(b * 0.6 + m * 0.4)
            op[x, y] = (r, g, b, a)
            if a > 48:
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x > maxx:
                    maxx = x
                if y > maxy:
                    maxy = y
    pad = 8
    if maxx > minx and maxy > miny:
        out = out.crop((
            max(0, minx - pad),
            max(0, miny - pad),
            min(w, maxx + 1 + pad),
            min(h, maxy + 1 + pad),
        ))
    out.save(dst)
    print("keyed", dst.name, out.size)


for name in SPRITES:
    src = SRC / ("iso-" + name + ".jpg")
    if not src.exists():
        print("skip", name)
        continue
    shutil.copy(src, RAW / src.name)
    key(src, OUT / (name + ".png"))

for name in GROUNDS:
    src = SRC / ("iso-" + name + ".jpg")
    if not src.exists():
        print("skip", name)
        continue
    shutil.copy(src, RAW / src.name)
    shutil.copy(src, OUT / (name + ".jpg"))
    print("ground", name)
