# 暗黑传奇 · 地形 v2 + 场景道具（草/土/石/树/摊位/篝火/水井…）
# 输出：
#   assets/terrain/terrain-<theme>.png   512×512，32px 格（区域 ID 与 tiles.js 一致）
#   assets/props/flora.png               512×512，128px 格（树/灌木/石头）
#   assets/props/town.png                512×512，128px 格（摊位/帐篷/篝火/水井…）
#   assets/preview/terrain-v2-<theme>.png 拼接预览
from pathlib import Path
import math
import random

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent / "assets"
T = 32

OUTLINE = (0x2A, 0x21, 0x18, 255)
SHADOW = (0x1A, 0x14, 0x10, 90)
WOOD = (0x8A, 0x5A, 0x32, 255)
WOOD_DK = (0x5E, 0x3C, 0x22, 255)
WOOD_HI = (0xB0, 0x7C, 0x4A, 255)
CLOTH_R = (0xB8, 0x3A, 0x30, 255)
CLOTH_C = (0xE2, 0xD6, 0xB8, 255)
CLOTH_B = (0x3E, 0x62, 0x8E, 255)
STONE = (0xB9, 0xAE, 0x98, 255)
STONE_DK = (0x86, 0x7C, 0x69, 255)
STONE_HI = (0xE2, 0xD8, 0xC2, 255)
LEAF = (0x5A, 0x9A, 0x34, 255)
LEAF_DK = (0x3C, 0x72, 0x24, 255)
LEAF_HI = (0x86, 0xC7, 0x57, 255)
FIRE = (0xE8, 0x7A, 0x2E, 255)
FIRE_HI = (0xFF, 0xD5, 0x4A, 255)
METAL = (0xC2, 0xC9, 0xD2, 255)


def clamp(v, a=0, b=255):
    return max(a, min(b, int(v)))


def shade(c, d):
    return (clamp(c[0] + d), clamp(c[1] + d), clamp(c[2] + d), 255)


def mix(a, b, t):
    return (clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t),
            clamp(a[2] + (b[2] - a[2]) * t), 255)


def hx(x, y, n):
    v = (x * 374761393) ^ (y * 668265263) ^ (n * 1274126177)
    v &= 0xFFFFFFFF
    v ^= v >> 13
    v = (v * 1274126177) & 0xFFFFFFFF
    return v & 0xFFFFFFFF


def rnd(x, y, n):
    return hx(x, y, n) / 4294967295.0


# ---------- 可平铺噪声 ----------

def value_noise(seed, period):
    r = random.Random(seed)
    grid = [[r.random() for _ in range(period)] for _ in range(period)]
    step = T / period

    def n(x, y):
        fx, fy = x / step, y / step
        x0, y0 = int(fx) % period, int(fy) % period
        x1, y1 = (x0 + 1) % period, (y0 + 1) % period
        tx, ty = fx - int(fx), fy - int(fy)
        tx = tx * tx * (3 - 2 * tx)
        ty = ty * ty * (3 - 2 * ty)
        a = grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx
        b = grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx
        return a * (1 - ty) + b * ty

    return n


def blank(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def put(im, x, y, c):
    if 0 <= x < im.size[0] and 0 <= y < im.size[1]:
        im.putpixel((int(x), int(y)), c)


def fill_cell(im, col, row, cell, painter):
    ox, oy = col * cell, row * cell
    for y in range(cell):
        for x in range(cell):
            c = painter(x, y)
            if c is not None:
                im.putpixel((ox + x, oy + y), c)


# ---------- 主题色板 ----------

THEMES = {
    "field": {
        "grass": (0x6F, 0xB4, 0x46, 255),
        "grass_d": (0x5C, 0x9A, 0x39, 255),
        "grass_h": (0x88, 0xC9, 0x5C, 255),
        "dirt": (0xC2, 0x9C, 0x58, 255),
        "dirt_d": (0xA2, 0x7C, 0x40, 255),
        "dirt_h": (0xDC, 0xBE, 0x84, 255),
        "stone": STONE, "stone_d": STONE_DK, "stone_h": STONE_HI,
        "flower": (0xF2, 0xE2, 0x58, 255),
        "flower2": (0xE8, 0x8A, 0xB6, 255),
        "tuft": (0x4C, 0x86, 0x2C, 255),
        "tuft_h": (0x8E, 0xD0, 0x60, 255),
        "pebble": (0x8E, 0x7A, 0x5A, 255),
    },
    "cave": {
        "grass": (0x67, 0x74, 0x70, 255),
        "grass_d": (0x53, 0x5F, 0x5C, 255),
        "grass_h": (0x7F, 0x8E, 0x88, 255),
        "dirt": (0x7E, 0x74, 0x66, 255),
        "dirt_d": (0x62, 0x58, 0x4C, 255),
        "dirt_h": (0x98, 0x8E, 0x7E, 255),
        "stone": (0x8A, 0x84, 0x78, 255), "stone_d": (0x60, 0x5A, 0x50, 255),
        "stone_h": (0xB0, 0xA8, 0x98, 255),
        "flower": (0x7A, 0xA8, 0x88, 255),
        "flower2": (0x5E, 0x8E, 0x9A, 255),
        "tuft": (0x4A, 0x5A, 0x4C, 255),
        "tuft_h": (0x7A, 0x8E, 0x78, 255),
        "pebble": (0x5C, 0x54, 0x48, 255),
    },
    "waste": {
        "grass": (0x9A, 0x8E, 0x50, 255),
        "grass_d": (0x7E, 0x72, 0x3E, 255),
        "grass_h": (0xB4, 0xA8, 0x68, 255),
        "dirt": (0xA8, 0x84, 0x50, 255),
        "dirt_d": (0x86, 0x64, 0x38, 255),
        "dirt_h": (0xC2, 0xA0, 0x6C, 255),
        "stone": (0xA8, 0xA0, 0x90, 255), "stone_d": (0x76, 0x70, 0x62, 255),
        "stone_h": (0xCC, 0xC4, 0xB2, 255),
        "flower": (0xC0, 0x4A, 0x3E, 255),
        "flower2": (0xD8, 0xB8, 0x70, 255),
        "tuft": (0x6E, 0x62, 0x36, 255),
        "tuft_h": (0xA8, 0x9A, 0x5E, 255),
        "pebble": (0x6A, 0x5C, 0x44, 255),
    },
}


# ---------- 地面 ----------

def grass_tile(th, variant):
    n1 = value_noise(variant * 97 + 11, 8)
    n2 = value_noise(variant * 53 + 71, 16)
    blades = []
    r = random.Random(variant * 977 + 5)
    for _ in range(14):
        bx, by = r.randrange(1, T - 1), r.randrange(2, T - 2)
        blades.append((bx, by, r.choice([th["grass_d"], th["tuft"], th["grass_h"]])))

    def pix(x, y):
        v = (n1(x, y) - 0.5) * 11 + (n2(x, y) - 0.5) * 6
        d = (rnd(x, y, variant + 3) % 7) - 3
        c = shade(th["grass"], v + d)
        return c

    im = blank(T, T)
    for y in range(T):
        for x in range(T):
            put(im, x, y, pix(x, y))
    for bx, by, c in blades:
        put(im, bx, by, c)
        put(im, bx, by + 1, mix(c, th["grass_d"], 0.4))
        if rnd(bx, by, 9) < 0.25:
            put(im, bx, by - 1, th["tuft_h"])
    return im


def dirt_tile(th, variant):
    n1 = value_noise(variant * 131 + 23, 8)
    n2 = value_noise(variant * 41 + 87, 16)
    r = random.Random(variant * 313 + 17)

    im = blank(T, T)
    for y in range(T):
        for x in range(T):
            v = (n1(x, y) - 0.5) * 14 + (n2(x, y) - 0.5) * 8
            d = (rnd(x, y, variant + 13) % 5) - 2
            put(im, x, y, shade(th["dirt"], v + d))
    for _ in range(10):
        x, y = r.randrange(1, T - 1), r.randrange(1, T - 1)
        c = r.choice([th["pebble"], th["dirt_d"], th["dirt_h"]])
        put(im, x, y, c)
        if rnd(x, y, 2) < 0.4:
            put(im, x + 1, y, mix(c, th["dirt"], 0.4))
    return im


def path_tile(th, mask):
    """土路：开口方向按列/行抖动收边，边缘撒草。"""
    def edge(i, salt):
        return 2 + int(rnd(i, salt, mask + 7) * 4)

    im = blank(T, T)
    for y in range(T):
        for x in range(T):
            open_y = y < edge(x, 1) if not (mask & 1) else False
            open_b = y >= T - edge(x, 4) if not (mask & 4) else False
            open_l = x < edge(y, 8) if not (mask & 8) else False
            open_r = x >= T - edge(y, 2) if not (mask & 2) else False
            if open_y or open_b or open_l or open_r:
                continue
            n = value_noise(mask * 17 + 3, 8)
            v = (n(x, y) - 0.5) * 12 + (rnd(x, y, mask + 31) % 5) - 2
            c = shade(th["dirt"], v)
            put(im, x, y, c)
    # 碎石 + 车辙
    r = random.Random(mask * 191 + 7)
    for _ in range(12):
        x, y = r.randrange(1, T - 1), r.randrange(1, T - 1)
        if im.getpixel((x, y))[3] == 0:
            continue
        c = r.choice([th["pebble"], th["dirt_d"], th["dirt_h"]])
        put(im, x, y, c)
    # 边缘草：开口一侧伸进来 1-2px 的草
    for y in range(T):
        for x in range(T):
            if im.getpixel((x, y))[3] != 0:
                continue
            near = (not (mask & 1) and y < edge(x, 1) + 2) or \
                   (not (mask & 4) and y > T - edge(x, 4) - 3) or \
                   (not (mask & 8) and x < edge(y, 8) + 2) or \
                   (not (mask & 2) and x > T - edge(y, 2) - 3)
            if near and rnd(x, y, mask + 77) < 0.55:
                put(im, x, y, shade(th["grass_d"], (rnd(x, y, 5) % 9) - 4))
    return im


def inner_tile(th, corner, th_fill):
    im = blank(T, T)
    rnd_c = 7
    for y in range(T):
        for x in range(T):
            if corner == 0:
                d = x + y
            elif corner == 1:
                d = (T - 1 - x) + y
            elif corner == 2:
                d = (T - 1 - x) + (T - 1 - y)
            else:
                d = x + (T - 1 - y)
            if d < rnd_c + rnd(x, y, corner + 4) * 4:
                put(im, x, y, th_fill)
    return im


def stone_tile(th, mask):
    """石墙：顶面亮、底部有立面，砖缝错开。mask 位=同墙邻居。"""
    im = blank(T, T)
    for y in range(T):
        for x in range(T):
            row = y >> 3
            stag = (row & 1) << 2
            xx = (x + stag) & 15
            c = th["stone"]
            if (y & 7) == 7 or xx == 15:
                c = th["stone_d"]
            else:
                v = (rnd(x >> 3, row, 2) % 9) - 4
                c = shade(th["stone"], v)
                if (y & 7) <= 1:
                    c = mix(c, th["stone_h"], 0.35)
            put(im, x, y, c)
    # 立面：下方开口 → 阴影面；上方开口 → 亮边
    if not (mask & 4):
        for x in range(T):
            for y in range(T - 6, T):
                put(im, x, y, mix(im.getpixel((x, y)), (0, 0, 0, 255), 0.18))
        for x in range(T):
            put(im, x, T - 1, (0x4A, 0x42, 0x36, 255))
    if not (mask & 1):
        for x in range(T):
            put(im, x, 0, th["stone_h"])
            put(im, x, 1, mix(th["stone_h"], th["stone"], 0.4))
    return im


# ---------- 装饰 ----------

def decal(kind, th):
    im = blank(T, T)
    d = ImageDraw.Draw(im)
    r = random.Random(hash(kind) & 0xFFFF)
    if kind == "tuft" or kind == "tuft2":
        for i in range(3):
            x0, y0 = 12 + i * 4, 22 - i
            d.line((x0, y0, x0 - 2, y0 - 7), fill=th["tuft"], width=1)
            d.line((x0 + 1, y0, x0 + 3, y0 - 6), fill=th["tuft_h"], width=1)
    elif kind == "flower":
        d.line((16, 24, 16, 17), fill=th["tuft"], width=1)
        d.ellipse((13, 12, 19, 17), fill=th["flower"])
        d.point((16, 14), fill=(0xFF, 0xFF, 0xF0, 255))
    elif kind == "flower2":
        for dx, dy in ((0, 0), (5, 3), (-4, 4)):
            d.line((16 + dx, 24 + dy - 4, 16 + dx, 24 + dy), fill=th["tuft"], width=1)
            d.ellipse((14 + dx, 16 + dy, 18 + dx, 20 + dy), fill=th["flower2"])
    elif kind == "pebble":
        d.ellipse((11, 19, 19, 25), fill=th["pebble"])
        d.ellipse((12, 18, 17, 21), fill=shade(th["pebble"], 20))
    elif kind == "rock":
        d.polygon([(9, 24), (12, 16), (20, 14), (24, 21), (21, 25)], fill=th["stone"])
        d.polygon([(12, 16), (20, 14), (21, 18), (13, 20)], fill=th["stone_h"])
    elif kind == "bone":
        d.line((10, 22, 21, 18), fill=(0xE6, 0xDC, 0xC4, 255), width=2)
        d.ellipse((9, 19, 13, 23), fill=(0xE6, 0xDC, 0xC4, 255))
        d.ellipse((19, 16, 23, 20), fill=(0xE6, 0xDC, 0xC4, 255))
    elif kind == "leaf":
        d.polygon([(10, 22), (16, 15), (23, 21), (16, 23)], fill=(0xC0, 0x78, 0x30, 255))
    elif kind == "shroom":
        d.line((16, 24, 16, 20), fill=(0xE6, 0xDC, 0xC4, 255), width=2)
        d.ellipse((11, 14, 21, 20), fill=th["flower"])
        d.ellipse((13, 15, 16, 17), fill=(0xFF, 0xFF, 0xF0, 255))
    elif kind == "twig":
        d.line((9, 23, 22, 17), fill=WOOD_DK, width=1)
        d.line((15, 20, 18, 15), fill=WOOD_DK, width=1)
    elif kind == "moss":
        d.ellipse((9, 18, 22, 24), fill=th["grass_d"])
        d.ellipse((11, 19, 16, 22), fill=th["grass_h"])
    else:
        d.ellipse((13, 20, 18, 24), fill=th["dirt_d"])
    return im


DECAL_KINDS = ["tuft", "tuft2", "flower", "flower2", "pebble", "rock", "bone",
               "leaf", "shroom", "twig", "moss", "dirtspot"]


def paint_terrain(theme):
    th = THEMES[theme]
    im = blank(512, 512)
    variants = [grass_tile(th, i) for i in range(16)]
    for i in range(16):
        im.alpha_composite(variants[i], (i * T, 0))
    # 0x10–0x27 装饰：12 种 × 2 变体
    for i in range(24):
        kind = DECAL_KINDS[i % len(DECAL_KINDS)]
        cell = decal(kind, th)
        col, row = (0x10 + i) & 0x0F, (0x10 + i) >> 4
        im.alpha_composite(cell, (col * T, row * T))
    for mask in range(16):
        col, row = (0x28 + mask) & 0x0F, (0x28 + mask) >> 4
        im.alpha_composite(stone_tile(th, mask), (col * T, row * T))
    for corner in range(4):
        col, row = (0x38 + corner) & 0x0F, (0x38 + corner) >> 4
        im.alpha_composite(inner_tile(th, corner, th["stone"]), (col * T, row * T))
    # 门
    door = blank(T, T)
    dd = ImageDraw.Draw(door)
    dd.rectangle((0, 0, T - 1, T - 1), fill=th["stone_d"])
    for i in range(3):
        y = 5 + i * 8
        dd.rectangle((4, y, T - 5, y + 4), fill=th["stone"])
        dd.line((4, y, T - 5, y), fill=th["stone_h"])
    im.alpha_composite(door, ((0x3C & 0x0F) * T, (0x3C >> 4) * T))
    for mask in range(16):
        col, row = (0x40 + mask) & 0x0F, (0x40 + mask) >> 4
        im.alpha_composite(path_tile(th, mask), (col * T, row * T))
    for corner in range(4):
        col, row = (0x50 + corner) & 0x0F, (0x50 + corner) >> 4
        im.alpha_composite(inner_tile(th, corner, th["dirt"]), (col * T, row * T))
    return im


def preview(theme, im):
    p = Image.new("RGB", (T * 12, T * 12), th_color(theme))
    for y in range(12):
        for x in range(12):
            v = 0x00 + int(rnd(x, y, 99) * 16)
            p.paste(im.crop((v * T, 0, v * T + T, T)), (x * T, y * T))
    return p


def th_color(theme):
    return THEMES[theme]["grass"][:3]


# ---------- 树 / 灌木 / 石头 ----------

TREE_D = (0x2C, 0x55, 0x1A, 255)
TREE = (0x3E, 0x72, 0x26, 255)
TREE_H = (0x55, 0x92, 0x33, 255)


def tree(kind, th, seed):
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    r = random.Random(seed)
    base_y = 118
    if kind == "dead":
        d.polygon([(60, base_y), (57, 68), (71, 68), (68, base_y)], fill=WOOD_DK)
        d.polygon([(60, base_y), (57, 68), (63, 68), (62, base_y)], fill=WOOD)
        for a in (-1, 1):
            d.line((64, 88, 64 + a * 27, 56), fill=WOOD_DK, width=4)
            d.line((64, 74, 64 + a * 17, 42), fill=WOOD_DK, width=3)
            d.line((64, 100, 64 + a * 10, 82), fill=WOOD_DK, width=2)
        return im
    trunk_w = 12 if kind != "pine" else 9
    d.rectangle((64 - trunk_w // 2 - 1, 70, 64 + trunk_w // 2 + 1, base_y), fill=OUTLINE)
    d.rectangle((64 - trunk_w // 2, 72, 64 + trunk_w // 2, base_y), fill=WOOD)
    d.rectangle((64 - trunk_w // 2, 74, 64 - trunk_w // 2 + 2, base_y), fill=WOOD_DK)
    d.rectangle((64 + 1, 78, 64 + trunk_w // 2, base_y), fill=WOOD_HI)

    def crown(cx, cy, rad):
        d.ellipse((cx - rad - 3, cy - rad - 3, cx + rad + 3, cy + rad + 3), fill=TREE_D)
        d.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=TREE)
        # 左上受光：沿弧撒几块小叶簇，别在正中画大高光（会像眼睛）
        for k in range(5):
            a = -2.5 + k * 0.32
            hx_ = cx + math.cos(a) * rad * 0.72
            hy_ = cy + math.sin(a) * rad * 0.72
            rr = 3 + (k % 3)
            d.ellipse((hx_ - rr, hy_ - rr, hx_ + rr, hy_ + rr), fill=TREE_H)
        # 底部压暗
        d.arc((cx - rad, cy - rad, cx + rad, cy + rad), 20, 160, fill=TREE_D, width=4)

    if kind == "pine":
        for i, (y, w) in enumerate(((78, 42), (60, 34), (42, 24), (28, 14))):
            d.polygon([(64 - w - 2, y + 2), (64 + w + 2, y + 2), (64, y - 38)], fill=TREE_D)
            d.polygon([(64 - w, y), (64 + w, y), (64, y - 34)], fill=TREE)
            for k in range(3):
                x0 = 64 - w + 8 + k * (w // 2)
                d.line((x0, y - 4, x0 - 4, y + 2), fill=TREE_H, width=2)
    elif kind == "tall":
        for (cx, cy, rad) in ((64, 34, 26), (46, 52, 22), (82, 52, 22),
                              (54, 72, 18), (76, 72, 18), (64, 58, 24)):
            crown(cx, cy, rad)
    elif kind == "clump":
        for cx in (44, 84):
            for (dx, dy, rad) in ((0, 0, 26), (-16, 8, 18), (16, 6, 18)):
                crown(cx + dx, 62 + dy, rad)
    else:
        for (cx, cy, rad) in ((64, 48, 34), (42, 62, 24), (86, 62, 24),
                              (50, 38, 22), (78, 38, 22), (64, 66, 26)):
            crown(cx, cy, rad)
    return im


def bush(th, size, seed):
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    r = random.Random(seed)
    n = 3 if size == "big" else 2
    for i in range(n):
        cx = 64 + (i - (n - 1) / 2) * (24 if size == "big" else 15)
        cy = 104 - (10 if i % 2 else 0)
        rad = (24 if size == "big" else 14)
        d.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=LEAF_DK)
        d.ellipse((cx - rad + 3, cy - rad + 3, cx + rad - 3, cy + rad - 3), fill=LEAF)
        d.ellipse((cx - rad + 7, cy - rad + 6, cx + rad - 10, cy + rad - 12), fill=LEAF_HI)
    return im


def rock(th, size, seed):
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    if size == "big":
        pts = [(28, 108), (34, 76), (54, 54), (82, 56), (100, 80), (98, 108)]
        hi = [(54, 54), (82, 56), (84, 72), (56, 70)]
    else:
        pts = [(44, 106), (50, 88), (68, 80), (82, 92), (80, 106)]
        hi = [(50, 88), (68, 80), (70, 90)]
    d.polygon(pts, fill=th["stone_d"])
    d.polygon(hi, fill=th["stone"])
    d.line((pts[1], pts[2]), fill=th["stone_h"], width=2)
    return im


# ---------- 场景道具 ----------

def stall(kind):
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    # 遮阳棚
    cloth = CLOTH_R if kind == "shop" else CLOTH_B
    d.polygon([(16, 54), (112, 54), (104, 34), (24, 34)], fill=cloth)
    for i in range(6):
        x = 24 + i * 14
        d.polygon([(x, 54), (x + 8, 54), (x + 6, 34), (x - 2, 34)], fill=CLOTH_C)
    d.line((24, 34, 104, 34), fill=(0x7A, 0x6E, 0x58, 255), width=2)
    # 柱子
    for x in (22, 100):
        d.rectangle((x, 54, x + 4, 116), fill=WOOD)
        d.line((x, 54, x, 116), fill=WOOD_DK)
    # 柜台
    d.rectangle((20, 84, 104, 112), fill=WOOD)
    d.rectangle((20, 84, 104, 90), fill=WOOD_HI)
    d.rectangle((20, 106, 104, 112), fill=WOOD_DK)
    if kind == "book":
        for i in range(4):
            d.rectangle((30 + i * 15, 74, 41 + i * 15, 84), fill=CLOTH_B if i % 2 else CLOTH_R)
            d.line((30 + i * 15, 74, 41 + i * 15, 74), fill=CLOTH_C)
    else:
        for i in range(3):
            d.ellipse((34 + i * 20, 76, 48 + i * 20, 86), fill=(0xD8, 0x7A, 0x3A, 255))
    return im


def tent():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.polygon([(20, 112), (64, 26), (108, 112)], fill=CLOTH_C)
    d.polygon([(20, 112), (64, 26), (64, 112)], fill=(0xCF, 0xC3, 0xA6, 255))
    d.polygon([(46, 112), (64, 70), (82, 112)], fill=(0x4A, 0x3A, 0x2A, 255))
    d.line((64, 26, 64, 20), fill=WOOD_DK, width=2)
    d.line((20, 112, 108, 112), fill=WOOD_DK, width=2)
    return im


def campfire():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    for i in range(7):
        a = math.pi * i / 3
        cx = 64 + math.cos(a) * 26
        cy = 104 + math.sin(a) * 12
        d.ellipse((cx - 7, cy - 6, cx + 7, cy + 6), fill=STONE_DK)
        d.ellipse((cx - 6, cy - 7, cx + 5, cy + 4), fill=STONE)
    d.line((42, 110, 86, 96), fill=WOOD, width=6)
    d.line((42, 96, 86, 110), fill=WOOD_DK, width=6)
    d.polygon([(64, 60), (76, 92), (64, 100), (52, 92)], fill=FIRE)
    d.polygon([(64, 72), (71, 92), (64, 96), (57, 92)], fill=FIRE_HI)
    return im


def well():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.ellipse((28, 78, 100, 116), fill=STONE_DK)
    d.ellipse((34, 82, 94, 110), fill=STONE)
    d.ellipse((44, 88, 84, 104), fill=(0x2A, 0x3A, 0x44, 255))
    d.ellipse((48, 90, 80, 100), fill=(0x3E, 0x5A, 0x6A, 255))
    for x in (36, 92):
        d.rectangle((x - 3, 40, x + 3, 92), fill=WOOD)
    d.polygon([(22, 44), (106, 44), (64, 22)], fill=CLOTH_R)
    d.line((22, 44, 106, 44), fill=WOOD_DK, width=2)
    return im


def fence():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    for x in (18, 62, 106):
        d.rectangle((x - 4, 66, x + 4, 112), fill=WOOD)
        d.line((x - 4, 66, x - 4, 112), fill=WOOD_DK)
    d.rectangle((8, 76, 120, 82), fill=WOOD_HI)
    d.rectangle((8, 94, 120, 100), fill=WOOD)
    return im


def crate():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.rectangle((34, 70, 94, 112), fill=WOOD)
    d.rectangle((34, 70, 94, 78), fill=WOOD_HI)
    d.line((34, 70, 94, 112), fill=WOOD_DK, width=3)
    d.line((94, 70, 34, 112), fill=WOOD_DK, width=3)
    d.rectangle((34, 106, 94, 112), fill=WOOD_DK)
    return im


def barrel():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((44, 64, 84, 112), radius=8, fill=WOOD)
    d.rectangle((44, 72, 84, 76), fill=METAL)
    d.rectangle((44, 98, 84, 102), fill=METAL)
    d.ellipse((44, 58, 84, 70), fill=WOOD_HI)
    return im


def lamp():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.rectangle((60, 60, 66, 112), fill=WOOD_DK)
    d.rectangle((52, 34, 74, 60), fill=(0x3A, 0x2E, 0x22, 255))
    d.rectangle((56, 38, 70, 56), fill=(0xFF, 0xE2, 0x8A, 255))
    d.polygon([(50, 34), (76, 34), (63, 24)], fill=WOOD_DK)
    return im


def sign():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.rectangle((60, 62, 66, 112), fill=WOOD_DK)
    d.rectangle((30, 44, 98, 70), fill=WOOD)
    d.rectangle((30, 44, 98, 48), fill=WOOD_HI)
    d.line((36, 58, 92, 58), fill=WOOD_DK, width=2)
    d.line((36, 64, 80, 64), fill=WOOD_DK, width=2)
    return im


def hay():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.ellipse((28, 66, 100, 112), fill=(0xC8, 0xA0, 0x48, 255))
    d.ellipse((34, 70, 94, 104), fill=(0xDC, 0xB8, 0x5E, 255))
    for i in range(6):
        d.line((38 + i * 9, 72, 34 + i * 9, 104), fill=(0xB0, 0x8A, 0x38, 255))
    return im


def stump():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.rectangle((46, 82, 82, 112), fill=WOOD_DK)
    d.rectangle((48, 82, 80, 106), fill=WOOD)
    d.ellipse((44, 74, 84, 94), fill=WOOD_HI)
    d.ellipse((52, 80, 76, 90), fill=WOOD_DK)
    d.ellipse((58, 83, 70, 87), fill=WOOD)
    for x in (40, 86):
        d.line((64, 96, x, 108), fill=WOOD_DK, width=4)
    return im


def flowers():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    r = random.Random(3)
    for i in range(9):
        x, y = 30 + r.randrange(0, 68), 82 + r.randrange(0, 28)
        c = (0xF2, 0xE2, 0x58, 255) if i % 2 else (0xE8, 0x8A, 0xB6, 255)
        d.line((x, y, x, y - 8), fill=(0x4C, 0x86, 0x2C, 255))
        d.ellipse((x - 3, y - 12, x + 3, y - 6), fill=c)
        d.point((x, y - 9), fill=(0xFF, 0xFF, 0xF0, 255))
    return im


def grass_patch():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    r = random.Random(4)
    for i in range(16):
        x, y = 24 + r.randrange(0, 80), 96 + r.randrange(0, 16)
        h = 8 + r.randrange(0, 10)
        d.line((x, y, x - 2, y - h), fill=(0x4C, 0x86, 0x2C, 255), width=2)
        d.line((x + 2, y, x + 3, y - h + 3), fill=(0x8E, 0xD0, 0x60, 255), width=1)
    return im


def mushrooms():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    for (x, y, rad) in ((48, 100, 12), (68, 104, 9), (84, 98, 7)):
        d.rectangle((x - 2, y, x + 2, y + 10), fill=(0xE6, 0xDC, 0xC4, 255))
        d.ellipse((x - rad, y - rad, x + rad, y + 4), fill=(0xC0, 0x4A, 0x3E, 255))
        d.ellipse((x - rad + 3, y - rad + 2, x - 2, y - 2), fill=(0xFF, 0xF0, 0xD0, 255))
    return im


def log():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.ellipse((28, 86, 100, 112), fill=WOOD_DK)
    d.rectangle((28, 92, 100, 106), fill=WOOD)
    d.ellipse((92, 86, 108, 112), fill=WOOD_HI)
    d.ellipse((96, 92, 104, 106), fill=WOOD_DK)
    d.line((34, 96, 90, 96), fill=WOOD_HI, width=2)
    return im


def make_flora():
    th = THEMES["field"]
    im = blank(512, 512)
    cells = [
        tree("broad", th, 1), tree("broad", th, 2), tree("pine", th, 3), tree("dead", th, 4),
        bush(th, "big", 5), bush(th, "small", 6), rock(th, "big", 7), rock(th, "small", 8),
        tree("clump", th, 9), tree("tall", th, 10), stump(), flowers(),
        grass_patch(), mushrooms(), log(), blank(128, 128),
    ]
    for i, c in enumerate(cells):
        im.alpha_composite(c, ((i % 4) * 128, (i // 4) * 128))
    return im


def pond():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.ellipse((16, 76, 112, 120), fill=(0x4A, 0x3E, 0x2A, 255))
    d.ellipse((20, 78, 108, 116), fill=(0x3E, 0x6A, 0x86, 255))
    d.ellipse((26, 82, 102, 110), fill=(0x4E, 0x86, 0xA6, 255))
    d.ellipse((34, 86, 78, 102), fill=(0x6A, 0xA6, 0xC2, 255))
    for x, y in ((22, 84), (96, 88), (40, 112), (82, 114), (100, 108)):
        d.ellipse((x - 6, y - 4, x + 6, y + 4), fill=STONE_DK)
        d.ellipse((x - 5, y - 5, x + 5, y + 3), fill=STONE)
    for x in (28, 34, 94, 100):
        d.line((x, 78, x + 2, 66), fill=(0x3E, 0x72, 0x26, 255), width=2)
        d.line((x + 2, 70, x + 6, 62), fill=(0x55, 0x92, 0x33, 255), width=1)
    return im


def cart():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.rectangle((30, 76, 96, 104), fill=WOOD)
    d.rectangle((30, 76, 96, 82), fill=WOOD_HI)
    d.rectangle((30, 98, 96, 104), fill=WOOD_DK)
    for x in (40, 86):
        d.ellipse((x - 12, 96, x + 12, 120), fill=OUTLINE)
        d.ellipse((x - 9, 99, x + 9, 117), fill=WOOD_DK)
        d.ellipse((x - 3, 105, x + 3, 111), fill=WOOD)
    d.line((96, 84, 112, 76), fill=WOOD_DK, width=4)
    return im


def bench():
    im = blank(128, 128)
    d = ImageDraw.Draw(im)
    d.rectangle((28, 86, 100, 96), fill=WOOD_HI)
    d.rectangle((28, 96, 100, 102), fill=WOOD)
    for x in (34, 90):
        d.rectangle((x, 100, x + 6, 116), fill=WOOD_DK)
    return im


def make_town():
    im = blank(512, 512)
    cells = [
        stall("shop"), stall("book"), campfire(), well(),
        tent(), fence(), crate(), barrel(),
        lamp(), sign(), hay(), tree("dead", THEMES["field"], 9),
        pond(), cart(), bench(), blank(128, 128),
    ]
    for i, c in enumerate(cells):
        im.alpha_composite(c, ((i % 4) * 128, (i // 4) * 128))
    return im


def main():
    (ROOT / "terrain").mkdir(parents=True, exist_ok=True)
    (ROOT / "props").mkdir(parents=True, exist_ok=True)
    (ROOT / "preview").mkdir(parents=True, exist_ok=True)
    for theme in ("field", "cave", "waste"):
        im = paint_terrain(theme)
        im.save(ROOT / "terrain" / ("terrain-%s.png" % theme))
        preview(theme, im).save(ROOT / "preview" / ("terrain-v2-%s.png" % theme))
        print("terrain", theme, "ok")
    make_flora().save(ROOT / "props" / "flora.png")
    make_town().save(ROOT / "props" / "town.png")
    print("props ok")


if __name__ == "__main__":
    main()
