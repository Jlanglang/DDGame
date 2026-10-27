# P0 出图：三套地形地基 + 豆豆 / 怪 / 首领 / NPC / 掉落 / 头像
# 规格见 docs/豆豆暗黑传奇-素材贴图清单.md §3.1a–§3.5、§3.7、§3.19
# 只出 PNG 和预览，不改游戏逻辑。
from pathlib import Path
import math

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent / "assets"
T = 32
OUTLINE = (0x2A, 0x21, 0x18, 255)
SKIN = (0xF6, 0xE6, 0xB8, 255)
BLUSH = (0xF5, 0xA3, 0xB7, 255)
HI = (0xFF, 0xF6, 0xDC, 255)
LEATHER = (0xB0, 0x6A, 0x3A, 255)
CAPE = (0xC0, 0x39, 0x2B, 255)
IRON = (0xD6, 0xDE, 0xE8, 255)
GRASS = (0x6F, 0xB4, 0x46, 255)
GRASS_DK = (0x4E, 0x8A, 0x2F, 255)
DIRT = (0xC6, 0xA0, 0x58, 255)
DIRT_DK = (0xA0, 0x78, 0x38, 255)
STONE = (0xD2, 0xC6, 0xB0, 255)
GOLD = (0xF0, 0xC8, 0x40, 255)


def hx(x, y, n):
    v = (x * 374761393) ^ (y * 668265263) ^ (n * 1274126177)
    v &= 0xFFFFFFFF
    v ^= v >> 13
    v = (v * 1274126177) & 0xFFFFFFFF
    return v & 255


def blank(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def patch(th, x, y, n, salt=0):
    """把格子切成 8×8 小块，按哈希返回这块的明暗：0 亮 1 平 2 暗。"""
    return hx(x >> 3, y >> 3, n * 31 + salt) % 3


def mix(a, b, t):
    return (int(a[0] + (b[0] - a[0]) * t), int(a[1] + (b[1] - a[1]) * t),
            int(a[2] + (b[2] - a[2]) * t), 255)


def put(im, x, y, c):
    if 0 <= x < im.size[0] and 0 <= y < im.size[1]:
        im.putpixel((x, y), c)


def fill_cell(im, col, row, cell, painter):
    ox, oy = col * cell, row * cell
    for y in range(cell):
        for x in range(cell):
            c = painter(x, y)
            if c is not None:
                im.putpixel((ox + x, oy + y), c)


def blit_id(dst, sheet, id_, cell, dx, dy):
    col, row = id_ & 0x0F, id_ >> 4
    if sheet.size[0] // cell != 16:
        col = id_ % (sheet.size[0] // cell)
        row = id_ // (sheet.size[0] // cell)
    src = sheet.crop((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell))
    dst.alpha_composite(src, (dx, dy))


# ---------- 地形 ----------

THEMES = {
    "field": {
        "base": (0x6F, 0xB4, 0x46, 255),
        "base_dk": (0x4E, 0x8A, 0x2F, 255),
        "base_hi": (0x8E, 0xC8, 0x5C, 255),
        "speck": (0xC8, 0xB8, 0x60, 255),
        "tuft": (0x3E, 0x7A, 0x2E, 255),
        "tuft_hi": (0x9E, 0xD8, 0x6E, 255),
        "mole": (0xB0, 0x96, 0x52, 255),
        "soil": (0x9E, 0x88, 0x46, 255),
        "path": (0xC6, 0xA0, 0x58, 255),
        "path_dk": (0x8E, 0x68, 0x30, 255),
        "wall": (0xD2, 0xC6, 0xB0, 255),
        "wall_dk": (0x8C, 0x7C, 0x64, 255),
        "wall_hi": (0xF4, 0xEC, 0xD8, 255),
        "grout": (0x9C, 0x8E, 0x76, 255),
        "decal": (0x3E, 0x86, 0x38, 255),
        "flower": (0xF2, 0xE2, 0x58, 255),
    },
    "cave": {
        "base": (0x5A, 0x68, 0x74, 255),
        "base_dk": (0x3E, 0x4A, 0x56, 255),
        "base_hi": (0x78, 0x88, 0x96, 255),
        "speck": (0x3E, 0x6A, 0x48, 255),
        "tuft": (0x46, 0x56, 0x64, 255),
        "tuft_hi": (0x88, 0x98, 0xA8, 255),
        "mole": (0x7A, 0x72, 0x66, 255),
        "soil": (0x66, 0x5E, 0x54, 255),
        "grout": (0x4C, 0x46, 0x40, 255),
        "path": (0x8A, 0x80, 0x72, 255),
        "path_dk": (0x5C, 0x54, 0x4A, 255),
        "wall": (0x6A, 0x62, 0x58, 255),
        "wall_dk": (0x3A, 0x34, 0x30, 255),
        "wall_hi": (0xA0, 0x96, 0x88, 255),
        "decal": (0x2E, 0x6A, 0x48, 255),
        "flower": (0xC4, 0x5A, 0x4A, 255),
    },
    "waste": {
        "base": (0x8A, 0x84, 0x52, 255),
        "base_dk": (0x5E, 0x58, 0x34, 255),
        "base_hi": (0xA8, 0xA0, 0x68, 255),
        "speck": (0x6A, 0x5A, 0x40, 255),
        "tuft": (0x74, 0x6A, 0x3E, 255),
        "tuft_hi": (0xB8, 0xAE, 0x7A, 255),
        "mole": (0x96, 0x78, 0x4E, 255),
        "soil": (0x7E, 0x64, 0x3E, 255),
        "grout": (0x8A, 0x80, 0x6E, 255),
        "path": (0xA0, 0x78, 0x48, 255),
        "path_dk": (0x6E, 0x50, 0x30, 255),
        "wall": (0xC8, 0xC0, 0xB0, 255),
        "wall_dk": (0x6A, 0x60, 0x58, 255),
        "wall_hi": (0xE8, 0xE0, 0xD0, 255),
        "decal": (0x6A, 0x62, 0x38, 255),
        "flower": (0xE0, 0x4A, 0x4A, 255),
    },
}


def tuft_at(th, x, y, seed):
    """一棵小草丛：中间两格竖草，两侧斜草。命中返回颜色，没命中 None。"""
    t = hx(x, y, seed) % 256
    if t >= 30:
        return None
    r = hx(x, y, seed + 1) % 256
    if t % 4 == 0:
        return th["tuft_hi"] if r < 70 else th["tuft"]
    if t % 4 == 1:
        return th["tuft"] if r < 200 else th["tuft_hi"]
    return th["tuft"] if r < 120 else th["base_dk"]


def base_pixel(th, variant, x, y):
    # 地面 = 小块明暗 + 大片泥土/草坨 + 小草丛。4 个变体错开，接起来不是棋盘。
    k = patch(th, x, y, variant)
    c = th["base"]
    if k == 0:
        c = th["base_hi"]
    elif k == 2:
        c = th["base_dk"]
    big = hx(x >> 2, y >> 2, variant * 13 + 5) % 16
    if big == 0:
        c = th["mole"]
    elif big == 1:
        c = mix(c, th["soil"], 0.5)
    elif big == 2 and th.get("soil"):
        c = mix(c, th["mole"], 0.4)
    edge = x < 1 or y < 1 or x >= T - 1 or y >= T - 1
    if not edge:
        g = tuft_at(th, x, y, variant * 7 + 17)
        if g:
            return g
    return c


def covered(x, y, mask):
    """开口的一侧只吃掉 2–3px，边缘按列抖动，不要切成小方块。"""
    def band(i, salt):
        return 2 + (hx(i, salt, mask) % 2)

    if not (mask & 1) and y < band(x, 1):
        return False
    if not (mask & 4) and y >= T - band(x, 4):
        return False
    if not (mask & 8) and x < band(y, 8):
        return False
    if not (mask & 2) and x >= T - band(y, 2):
        return False
    return True


def path_pixel(th, mask, x, y):
    if not covered(x, y, mask):
        return None
    c = th["path"]
    k = patch(th, x, y, 21 + mask, 3)
    if k == 0:
        c = mix(c, (0xFF, 0xFF, 0xFF, 255), 0.08)
    elif k == 2:
        c = th["path_dk"]
    r = hx(x, y, mask + 3) % 256
    if r < 30:
        c = th["path_dk"]
    elif r > 236:
        c = mix(c, th["wall_hi"], 0.5)
    return c


def wall_pixel(th, mask, x, y):
    if not covered(x, y, mask):
        return None
    # 砖缝：横 8px 一道，竖缝上下错开
    row = y >> 3
    stagger = (row & 1) << 3
    xx = (x + stagger) & 15
    c = th["wall_hi"] if hx(x, y, 6) < 12 else th["wall"]
    if (y & 7) == 7 or xx == 15:
        c = th["grout"]
    if not (mask & 4) and y >= T - 3:
        c = th["wall_dk"]
    if not (mask & 1) and y <= 1:
        c = th["wall_hi"]
    return c


def inner_pixel(th, corner, x, y, fill):
    # 0 左上 1 右上 2 右下 3 左下：凹角盖一块底色，把直角补圆
    if corner == 0 and x + y < 7:
        return fill
    if corner == 1 and (T - 1 - x) + y < 7:
        return fill
    if corner == 2 and (T - 1 - x) + (T - 1 - y) < 7:
        return fill
    if corner == 3 and x + (T - 1 - y) < 7:
        return fill
    return None


def door_pixel(th, x, y):
    if not covered(x, y, 0):
        # 门是一整块台阶，不挖边
        pass
    c = th["base"]
    for top, bot in ((6, 11), (14, 19), (22, 27)):
        if top <= y < bot and 4 <= x < 28:
            c = GOLD if y == top else (0xC0, 0x8A, 0x28, 255)
    return c


DECALS = (
    "tuft", "tuft2", "tuft3", "weed",
    "flower", "flower2", "pebble", "pebbles",
    "bone", "bones", "leaf", "leaf2",
    "rut", "moss", "shroom", "shroom2",
    "flower3", "speck", "rock", "crack",
    "clover", "stick", "pebble2", "sprout",
)


def decal_pixel(th, kind, x, y):
    if x < 4 or y < 4 or x >= T - 4 or y >= T - 4:
        return None
    cx, cy = x - 16, y - 18
    if kind.startswith("tuft") or kind in ("weed", "sprout"):
        if abs(cx) < 6 and -8 < cy < 6 and (x + y) % 2 == 0:
            return th["decal"]
    elif kind.startswith("flower"):
        if abs(cx) <= 2 and abs(cy) <= 2:
            return th["flower"]
        if abs(cx) < 1 and 2 < cy < 8:
            return th["decal"]
    elif kind.startswith("pebble") or kind == "rock":
        if cx * cx + cy * cy < (18 if kind == "rock" else 10):
            return th["wall"]
    elif kind.startswith("bone"):
        if abs(cy) < 2 and abs(cx) < 8:
            return HI
    elif kind.startswith("leaf"):
        if abs(cx) < 5 and abs(cy) < 3:
            return (0xC0, 0x78, 0x30, 255)
    elif kind == "rut":
        if abs(cy) < 2 and abs(cx) < 10:
            return th["path_dk"]
    elif kind == "moss":
        if cx * cx + cy * cy < 20:
            return th["decal"]
    elif kind.startswith("shroom"):
        if cy < 0 and cx * cx + cy * cy < 16:
            return th["flower"]
        if abs(cx) <= 1 and 0 <= cy < 6:
            return HI
    elif kind == "speck":
        if abs(cx) + abs(cy) < 3:
            return th["path_dk"]
    elif kind == "crack":
        if abs(cx - cy) < 2 and abs(cx) < 8:
            return th["base_dk"]
    elif kind == "clover":
        if abs(cx) + abs(cy) < 5:
            return th["decal"]
    elif kind == "stick":
        if abs(cy) <= 1 and abs(cx) < 8:
            return (0x6A, 0x42, 0x28, 255)
    return None


def paint_terrain(theme):
    th = THEMES[theme]
    im = blank(512, 512)
    for i in range(16):
        fill_cell(im, i, 0, T, lambda x, y, i=i: base_pixel(th, i, x, y))
    for i, kind in enumerate(DECALS):
        col, row = (0x10 + i) & 0x0F, (0x10 + i) >> 4
        fill_cell(im, col, row, T, lambda x, y, kind=kind: decal_pixel(th, kind, x, y))
    for mask in range(16):
        col, row = (0x28 + mask) & 0x0F, (0x28 + mask) >> 4
        fill_cell(im, col, row, T, lambda x, y, mask=mask: wall_pixel(th, mask, x, y))
    for corner in range(4):
        col, row = (0x38 + corner) & 0x0F, (0x38 + corner) >> 4
        fill_cell(im, col, row, T, lambda x, y, corner=corner: inner_pixel(th, corner, x, y, th["base"]))
    col, row = 0x3C & 0x0F, 0x3C >> 4
    fill_cell(im, col, row, T, lambda x, y: door_pixel(th, x, y))
    for mask in range(16):
        col, row = (0x40 + mask) & 0x0F, (0x40 + mask) >> 4
        fill_cell(im, col, row, T, lambda x, y, mask=mask: path_pixel(th, mask, x, y))
    for corner in range(4):
        col, row = (0x50 + corner) & 0x0F, (0x50 + corner) >> 4
        fill_cell(im, col, row, T, lambda x, y, corner=corner: inner_pixel(th, corner, x, y, th["base"]))
    return im


# ---------- 豆豆 ----------

def draw_bean(im, ox, oy, cell, facing, pose, ow, cape=True, sword=True, tint=None):
    d = ImageDraw.Draw(im)
    body = tint or SKIN
    s = cell / 128
    cx = ox + cell * 0.5
    foot = oy + cell * (116 / 128)
    bob = 0
    lean = 0
    if pose == "walk1":
        lean = -4 * s
        bob = -2 * s
    elif pose == "walk2":
        lean = 4 * s
        bob = 2 * s
    elif pose == "hit":
        lean = 6 * s
        bob = -4 * s
    elif pose in ("dead1", "dead2", "fade"):
        bob = 10 * s
    alpha = 255 if pose != "fade" else 90
    def C(col):
        if len(col) == 3:
            col = col + (255,)
        return col[:3] + (alpha if col[3] == 255 else min(col[3], alpha),)

    top = foot - cell * 0.62 + bob
    bw, bh = cell * 0.34, cell * 0.42
    if pose in ("dead1", "dead2", "fade"):
        bw, bh = cell * 0.46, cell * 0.22
        top = foot - bh
    box = [cx - bw + lean, top, cx + bw + lean, top + bh]
    if cape and facing != "d":
        d.polygon([
            (cx - bw * 0.2, top + bh * 0.25),
            (cx - bw * 1.15, foot),
            (cx + bw * 0.2, foot - 4 * s),
        ], fill=C(CAPE))
    d.ellipse(box, fill=C(body), outline=C(OUTLINE), width=max(2, int(ow)))
    # 肚皮高光
    d.ellipse([box[0] + bw * 0.35, box[1] + bh * 0.18, box[0] + bw * 0.85, box[1] + bh * 0.48], fill=C(HI))
    if pose not in ("dead2", "fade") and facing != "u":
        eye_y = box[1] + bh * (0.38 if facing == "d" else 0.42)
        span = bw * 0.38
        for sgn in (-1, 1):
            ex = cx + lean + sgn * span
            d.ellipse([ex - 3.2 * s, eye_y - 3.2 * s, ex + 3.2 * s, eye_y + 3.2 * s], fill=C(OUTLINE))
        if facing == "d":
            d.ellipse([cx - 5 * s, eye_y + 6 * s, cx + 5 * s, eye_y + 10 * s], fill=C(BLUSH))
            d.ellipse([cx + 8 * s, eye_y + 6 * s, cx + 16 * s, eye_y + 10 * s], fill=C(BLUSH))
    # 短手
    hy = box[1] + bh * 0.55
    d.ellipse([box[0] - 8 * s, hy, box[0] + 4 * s, hy + 10 * s], fill=C(body), outline=C(OUTLINE), width=max(2, int(ow * 0.6)))
    d.ellipse([box[2] - 4 * s, hy, box[2] + 8 * s, hy + 10 * s], fill=C(body), outline=C(OUTLINE), width=max(2, int(ow * 0.6)))
    # 皮甲
    d.rounded_rectangle(
        [cx - bw * 0.55 + lean, box[1] + bh * 0.42, cx + bw * 0.55 + lean, box[3] - bh * 0.08],
        radius=4, fill=C(LEATHER), outline=C(OUTLINE), width=max(2, int(ow * 0.7)),
    )
    if pose not in ("dead1", "dead2", "fade"):
        fy = foot - 4 * s
        shift = 5 * s if pose == "walk1" else (-5 * s if pose == "walk2" else 0)
        d.ellipse([cx - 14 * s + shift, fy, cx - 2 * s + shift, fy + 8 * s], fill=C(OUTLINE))
        d.ellipse([cx + 2 * s - shift, fy, cx + 14 * s - shift, fy + 8 * s], fill=C(OUTLINE))
    if sword and pose == "atk":
        if facing == "l":
            x0, y0, x1, y1 = cx - cell * 0.46, hy, cx + bw * 0.2, box[1] + bh * 0.35
        elif facing == "r":
            x0, y0, x1, y1 = cx + bw * 0.2, box[1] + bh * 0.35, cx + cell * 0.46, hy
        elif facing == "u":
            x0, y0, x1, y1 = cx - 2 * s, box[1] + bh * 0.3, cx + 3 * s, box[1] - cell * 0.28
        else:
            x0, y0, x1, y1 = cx + bw * 0.3, box[1] + bh * 0.45, cx + cell * 0.42, box[3] + cell * 0.12
        d.line([(x0, y0), (x1, y1)], fill=C(IRON), width=max(4, int(6 * s)))
        d.ellipse([x0 - 3 * s, y0 - 3 * s, x0 + 3 * s, y0 + 3 * s], fill=C(LEATHER))


def paint_player():
    im = blank(512, 640)
    rows = {0: "d", 1: "l", 3: "u"}
    poses = ("idle", "walk1", "walk2", "atk")
    for r, facing in rows.items():
        for c, pose in enumerate(poses):
            draw_bean(im, c * 128, r * 128, 128, facing, pose, 5)
    left = im.crop((0, 128, 512, 256)).transpose(Image.FLIP_LEFT_RIGHT)
    im.alpha_composite(left, (0, 256))
    death = ("hit", "dead1", "dead2", "fade")
    for c, pose in enumerate(death):
        draw_bean(im, c * 128, 4 * 128, 128, "d", pose, 5, sword=False)
    return im


def paint_avatar():
    im = blank(256, 256)
    draw_bean(im, 16, 20, 224, "d", "idle", 8, sword=False)
    return im


# ---------- 怪物 ----------

def _body(d, box, fill, ow, alpha=255):
    def C(col):
        a = alpha if len(col) < 4 or col[3] == 255 else col[3]
        return col[:3] + (a,)
    d.ellipse(box, fill=C(fill), outline=C(OUTLINE), width=ow)
    return C


def paint_mob_frame(im, ox, oy, kind, frame):
    d = ImageDraw.Draw(im)
    cell = 96
    ow = 4
    cx, foot = ox + 48, oy + 86
    bob = -2 if frame == 1 else 0
    dead = frame == 3
    atk = frame == 2
    alpha = 255

    def C(col, a=None):
        aa = alpha if a is None else a
        return (col[0], col[1], col[2], aa)

    if kind == "chicken":
        box = [cx - 22, foot - 36 + bob, cx + 22, foot - 4] if not dead else [cx - 26, foot - 16, cx + 26, foot]
        _body(d, box, (0xF5, 0xEF, 0xE0), ow)
        d.polygon([(cx - 6, box[1] + 2), (cx, box[1] - 12), (cx + 6, box[1] + 2)], fill=C((0xD8, 0x40, 0x40)))
        d.polygon([(cx + 16, (box[1] + box[3]) // 2), (cx + 28, (box[1] + box[3]) // 2 + (6 if atk else 0)), (cx + 16, (box[1] + box[3]) // 2 + 6)], fill=C(GOLD))
        d.ellipse([cx - 8, box[1] + 12, cx - 2, box[1] + 18], fill=C(OUTLINE))
        d.ellipse([cx + 4, box[1] + 12, cx + 10, box[1] + 18], fill=C(OUTLINE))
    elif kind == "scarecrow":
        col = (0xD9, 0xB4, 0x5A)
        arm_y = foot - 40 + bob + (8 if atk else 0)
        d.line([(cx, foot - 8), (cx, foot - 58 + bob)], fill=C((0x6A, 0x42, 0x28)), width=5)
        d.line([(cx - 26, arm_y), (cx + 26, arm_y)], fill=C(col), width=6)
        d.ellipse([cx - 16, foot - 72 + bob, cx + 16, foot - 44 + bob], fill=C((0xE0, 0x7A, 0x2E)), outline=C(OUTLINE), width=ow)
        d.polygon([(cx - 18, foot - 70 + bob), (cx, foot - 84 + bob), (cx + 18, foot - 70 + bob)], fill=C((0xC4, 0xA0, 0x40)))
    elif kind in ("dog", "wolf", "boar"):
        pal = {"dog": (0xB0, 0x8A, 0x5A), "wolf": (0x6E, 0x7F, 0x94), "boar": (0x6B, 0x4A, 0x32)}[kind]
        lunge = 8 if atk else 0
        box = [cx - 30 + lunge, foot - 28 + bob, cx + 22 + lunge, foot - 6]
        if dead:
            box = [cx - 32, foot - 14, cx + 28, foot]
        _body(d, box, pal, ow)
        d.ellipse([box[2] - 16, box[1] - 8, box[2] + 8, box[1] + 14], fill=C(pal), outline=C(OUTLINE), width=ow)
        if kind == "dog":
            d.rectangle([box[2] - 10, box[1] + 4, box[2] + 2, box[1] + 9], fill=C(CAPE))
        if kind == "boar":
            d.polygon([(box[2] - 2, box[1] + 10), (box[2] + 10, box[1] + 14), (box[2] - 2, box[1] + 16)], fill=C(HI))
        if kind == "wolf":
            d.ellipse([box[2] - 4, box[1] + 2, box[2] + 2, box[1] + 8], fill=C(GOLD))
    elif kind == "spider":
        for i, ang in enumerate(range(-50, 50, 14)):
            reach = 26 + (6 if atk and i % 2 == 0 else 0)
            d.line([(cx, foot - 18), (cx + ang // 2, foot - 18 + reach // 3), (cx + ang, foot - 4)], fill=C(OUTLINE), width=3)
        d.ellipse([cx - 16, foot - 32 + bob, cx + 16, foot - 8], fill=C((0x4A, 0x3A, 0x5E)), outline=C(OUTLINE), width=ow)
        d.arc([cx - 8, foot - 26, cx + 8, foot - 14], 200, 340, fill=C((0xD8, 0x40, 0x40)), width=3)
    elif kind == "stone":
        d.rounded_rectangle([cx - 22, foot - 48 + bob, cx + 22, foot - 4], radius=6, fill=C((0x8C, 0x8C, 0x8C)), outline=C(OUTLINE), width=ow)
        d.ellipse([cx - 8, foot - 30, cx + 8, foot - 16], fill=C((0x7F, 0xD4, 0xFF)))
        if atk:
            d.ellipse([cx + 10, foot - 58, cx + 28, foot - 40], fill=C((0x8C, 0x8C, 0x8C)), outline=C(OUTLINE), width=ow)
    elif kind == "bandit":
        draw_bean(im, ox, oy - 6 + bob, 96, "d", "atk" if atk else "idle", 4, tint=(0xE8, 0xD8, 0xB0))
        d.rectangle([cx - 16, foot - 58 + bob, cx + 16, foot - 50 + bob], fill=C((0x3E, 0x5C, 0x8A)))
    elif kind == "ghoul":
        draw_bean(im, ox, oy + bob, 96, "d", "dead1" if dead else "idle", 4, cape=False, sword=False, tint=(0x7E, 0x9A, 0x5E))
        if atk:
            d.line([(cx + 18, foot - 30), (cx + 32, foot - 18)], fill=C(OUTLINE), width=3)
    elif kind == "mummy":
        d.rounded_rectangle([cx - 16, foot - 52 + bob, cx + 16, foot - 4], radius=8, fill=C((0xE8, 0xDC, 0xC0)), outline=C(OUTLINE), width=ow)
        for i in range(4):
            yy = foot - 44 + i * 8 + bob
            d.line([(cx - 14, yy), (cx + 14, yy + 2)], fill=C((0xC8, 0xB8, 0x90)), width=2)
        d.rectangle([cx - 12, foot - 48 + bob, cx + 12, foot - 38 + bob], fill=C(GOLD))
        d.ellipse([cx - 4, foot - 46 + bob, cx - 1, foot - 43 + bob], fill=C((0x4A, 0x9E, 0xFF)))
    elif kind == "bat":
        wing = 30 + (8 if frame == 1 or atk else 0)
        d.polygon([(cx, foot - 24), (cx - wing, foot - 36 + bob), (cx - 8, foot - 16)], fill=C((0x5E, 0x1F, 0x2A)))
        d.polygon([(cx, foot - 24), (cx + wing, foot - 36 + bob), (cx + 8, foot - 16)], fill=C((0x5E, 0x1F, 0x2A)))
        d.ellipse([cx - 10, foot - 30 + bob, cx + 10, foot - 12], fill=C((0x8A, 0x2E, 0x3A)), outline=C(OUTLINE), width=ow)
    elif kind == "demon":
        draw_bean(im, ox, oy + bob, 96, "d", "atk" if atk else "idle", 4, cape=False, sword=False, tint=(0xC0, 0x39, 0x2B))
        d.polygon([(cx - 14, foot - 62 + bob), (cx - 8, foot - 48 + bob), (cx - 20, foot - 50 + bob)], fill=C(OUTLINE))
        d.polygon([(cx + 14, foot - 62 + bob), (cx + 8, foot - 48 + bob), (cx + 20, foot - 50 + bob)], fill=C(OUTLINE))
    elif kind == "wraith":
        a = 150 if not dead else 60
        d.polygon([(cx, foot - 58 + bob), (cx - 22, foot - 6), (cx + 22, foot - 6)], fill=(0x9E, 0xC8, 0xE8, a))
        d.ellipse([cx - 6, foot - 46 + bob, cx - 1, foot - 41 + bob], fill=(0xFF, 0x5A, 0x5A, 255))
        d.ellipse([cx + 3, foot - 46 + bob, cx + 8, foot - 41 + bob], fill=(0xFF, 0x5A, 0x5A, 255))


MOB_KINDS = (
    "chicken", "scarecrow", "dog", "boar", "wolf", "spider",
    "stone", "bandit", "ghoul", "mummy", "bat", "demon", "wraith",
)


def paint_mobs():
    im = blank(768, 672)
    for i, kind in enumerate(MOB_KINDS):
        base = i * 4
        for f in range(4):
            idx = base + f
            col, row = idx % 8, idx // 8
            paint_mob_frame(im, col * 96, row * 96, kind, f)
    return im


def paint_bosses():
    im = blank(768, 768)
    # 放大版特征：稻草人 / 山贼 / 尸王 / 怨主
    specs = (
        ("scarecrow", (0xE0, 0x7A, 0x2E)),
        ("bandit", (0xC0, 0x8A, 0x40)),
        ("mummy", (0xE8, 0xDC, 0xC0)),
        ("wraith", (0xE0, 0x4A, 0x4A)),
    )
    d = ImageDraw.Draw(im)
    for r, (kind, colr) in enumerate(specs):
        for f in range(4):
            ox, oy = f * 192, r * 192
            # 画在 96 的临时图上再放大，轮廓跟着变粗
            tmp = blank(96, 96)
            paint_mob_frame(tmp, 0, 0, kind, f)
            big = tmp.resize((180, 180), Image.NEAREST)
            im.alpha_composite(big, (ox + 6, oy + 6))
            if f == 2:
                d.line([(ox + 30, oy + 150), (ox + 160, oy + 40)], fill=GOLD, width=8)
    return im


def paint_npc():
    im = blank(384, 192)
    tints = (SKIN, SKIN, SKIN, None)
    for col in range(3):
        for row, pose in enumerate(("idle", "walk1")):
            draw_bean(im, col * 96, row * 96 - 4, 96, "d", pose, 4, sword=False, tint=tints[col])
    d = ImageDraw.Draw(im)
    # 商人围裙、村长胡子、书商眼镜在豆豆上补一笔
    d.rectangle([18, 52, 78, 78], fill=LEATHER)
    d.arc([96 + 28, 28, 96 + 68, 52], 20, 160, fill=HI, width=3)
    d.ellipse([192 + 30, 36, 192 + 42, 46], outline=OUTLINE, width=2)
    d.ellipse([192 + 50, 36, 192 + 62, 46], outline=OUTLINE, width=2)
    # 仓库：木箱，不写字
    for row, shade in enumerate(((0xA0, 0x68, 0x30), (0xC0, 0x84, 0x40))):
        ox, oy = 3 * 96, row * 96
        d.rounded_rectangle([ox + 22, oy + 28, ox + 74, oy + 78], radius=4, fill=shade + (255,), outline=OUTLINE, width=4)
        d.rectangle([ox + 44, oy + 28, ox + 52, oy + 78], fill=OUTLINE)
        d.ellipse([ox + 40, oy + 48, ox + 56, oy + 60], outline=IRON, width=3)
    return im


def paint_pickups():
    im = blank(320, 64)
    colors = (
        (0xC5, 0xCC, 0xD8),
        (0x4A, 0x9E, 0xFF),
        (0xFF, 0xD5, 0x4A),
        (0xFF, 0x8A, 0x3D),
        (0xF0, 0xC8, 0x40),
    )
    d = ImageDraw.Draw(im)
    for i, col in enumerate(colors):
        ox = i * 64
        d.polygon([(ox + 20, 18), (ox + 44, 18), (ox + 50, 28), (ox + 46, 52), (ox + 18, 52), (ox + 14, 28)], fill=col + (255,), outline=OUTLINE, width=3)
        d.arc([ox + 22, 12, ox + 42, 26], 200, 340, fill=OUTLINE, width=3)
        if i == 4:
            d.polygon([(ox + 32, 30), (ox + 36, 38), (ox + 44, 38), (ox + 38, 44), (ox + 40, 52), (ox + 32, 47), (ox + 24, 52), (ox + 26, 44), (ox + 20, 38), (ox + 28, 38)], fill=HI)
    return im


# ---------- 预览 ----------

GRASS_M, DIRT_M, WALL_M = 0, 1, 2


def mask_of(grid, x, y, mat):
    h, w = len(grid), len(grid[0])

    def same(nx, ny):
        if nx < 0 or ny < 0 or nx >= w or ny >= h:
            return False
        return grid[ny][nx] == mat

    return (1 if same(x, y - 1) else 0) | (2 if same(x + 1, y) else 0) | (4 if same(x, y + 1) else 0) | (8 if same(x - 1, y) else 0)


def inner_corners(grid, x, y, mat):
    h, w = len(grid), len(grid[0])

    def at(nx, ny):
        if nx < 0 or ny < 0 or nx >= w or ny >= h:
            return None
        return grid[ny][nx]

    out = []
    checks = (
        (0, (0, -1), (-1, 0), (-1, -1)),
        (1, (0, -1), (1, 0), (1, -1)),
        (2, (0, 1), (1, 0), (1, 1)),
        (3, (0, 1), (-1, 0), (-1, 1)),
    )
    for idx, a, b, diag in checks:
        if at(x + a[0], y + a[1]) == mat and at(x + b[0], y + b[1]) == mat and at(x + diag[0], y + diag[1]) != mat:
            out.append(idx)
    return out


def build_grid(mode, tw, th):
    g = [[GRASS_M for _ in range(tw)] for _ in range(th)]
    if mode == "wall":
        for y in range(th):
            for x in range(tw):
                if x == 0 or y == 0 or x == tw - 1 or y == th - 1:
                    g[y][x] = WALL_M
    if mode in ("path", "wall"):
        cy = th // 2
        for x in range(1, tw - 1):
            shift = int(round(math.sin(x / 7.0) * 1.2))
            for dy in (-1, 0, 1):
                yy = cy + shift + dy
                if 0 <= yy < th and g[yy][x] != WALL_M:
                    g[yy][x] = DIRT_M
        for y in range(1, cy):
            for dx in (-1, 0, 1):
                xx = tw // 2 + dx
                if 0 <= xx < tw and g[y][xx] != WALL_M:
                    g[y][xx] = DIRT_M
    return g


def variant_at(x, y):
    fam = hx(x // 6, y // 6, 3) % 4
    return fam * 4 + ((x * 3 + y * 5) % 4)


def render_preview(sheet, mode):
    tw, th = 22, 35
    img = Image.new("RGBA", (720, 1120), THEMES["field"]["base_dk"])
    grid = build_grid(mode, tw, th)
    ox0 = (720 - tw * T) // 2
    for y in range(th):
        for x in range(tw):
            dx, dy = ox0 + x * T, y * T
            blit_id(img, sheet, variant_at(x, y), T, dx, dy)
            mat = grid[y][x]
            if mat == DIRT_M:
                m = mask_of(grid, x, y, DIRT_M)
                blit_id(img, sheet, 0x40 + m, T, dx, dy)
                for c in inner_corners(grid, x, y, DIRT_M):
                    blit_id(img, sheet, 0x50 + c, T, dx, dy)
            elif mat == WALL_M:
                m = mask_of(grid, x, y, WALL_M)
                blit_id(img, sheet, 0x28 + m, T, dx, dy)
                for c in inner_corners(grid, x, y, WALL_M):
                    blit_id(img, sheet, 0x38 + c, T, dx, dy)
            else:
                if hx(x, y, 9) < 28 and grid[y][x] == GRASS_M:
                    blit_id(img, sheet, 0x10 + (hx(x, y, 4) % 24), T, dx, dy)
    if mode == "wall":
        blit_id(img, sheet, 0x3C, T, ox0 + (tw // 2) * T, 0)
    # 同一张瓦片不要连成 3×3
    seen = {}
    bad = 0
    for y in range(th - 2):
        for x in range(tw - 2):
            ids = [variant_at(x + dx, y + dy) for dy in range(3) for dx in range(3)]
            if len(set(ids)) == 1 and grid[y + 1][x + 1] == GRASS_M:
                bad += 1
    return img, bad


def save(im, rel):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print(f"{rel} {im.size[0]}x{im.size[1]} {path.stat().st_size}")
    return path


def main():
    field = paint_terrain("field")
    save(field, "terrain/terrain-field.png")
    save(paint_terrain("cave"), "terrain/terrain-cave.png")
    save(paint_terrain("waste"), "terrain/terrain-waste.png")
    save(paint_player(), "chars/player-bean.png")
    save(paint_mobs(), "chars/mobs.png")
    save(paint_bosses(), "chars/bosses.png")
    save(paint_npc(), "chars/npc.png")
    save(paint_pickups(), "items/pickups.png")
    save(paint_avatar(), "ui/avatar-bean.png")
    for mode, name in (("grass", "preview/preview-grass.png"), ("path", "preview/preview-path.png"), ("wall", "preview/preview-wall.png")):
        img, bad = render_preview(field, mode)
        save(img.convert("RGBA"), name)
        print(f"  {mode} identical-3x3 {bad}")


if __name__ == "__main__":
    main()
