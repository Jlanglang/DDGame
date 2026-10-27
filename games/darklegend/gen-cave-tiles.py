# 生成白天瓦片图集 tiles-cave.png（512×512，32px 格子，顶视、不透明地面/墙/门）
# 色调对齐热血传奇比奇城：亮草地、石灰城墙、暖金台阶。不是夜色洞窟。
# 坐标：列 = id & 0x0F，行 = id >> 4。与 tiles.js 的 ATLAS 一致。
from pathlib import Path

from PIL import Image

T = 32
W = 512
OUT = Path(__file__).resolve().parent / "assets" / "tiles" / "tiles-cave.png"

FLOOR = (0x6F, 0xB4, 0x46, 255)
FLOOR_HI = (0x92, 0xD0, 0x62, 255)
FLOOR_LO = (0x4F, 0x90, 0x32, 255)
MOSS = (0x3E, 0x86, 0x38, 255)
PEBBLE = (0xE4, 0xDE, 0xC8, 255)
CRACK = (0xC6, 0xA0, 0x58, 255)
FLOWER = (0xF2, 0xE2, 0x58, 255)

WALL = (0xD2, 0xC6, 0xB0, 255)
WALL_HI = (0xF0, 0xE6, 0xD0, 255)
WALL_LO = (0xB0, 0xA2, 0x88, 255)
MORTAR = (0x8C, 0x7C, 0x64, 255)
RIM = (0xFF, 0xF6, 0xE4, 255)
SHADOW = (0x7A, 0x6A, 0x52, 255)

GOLD = (0xF0, 0xC8, 0x40, 255)
GOLD_LO = (0xC0, 0x8A, 0x28, 255)
STEP = (0xA8, 0x78, 0x38, 255)


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


def h(x, y, n):
    v = (x * 374761393) ^ (y * 668265263) ^ (n * 1274126177)
    v &= 0xFFFFFFFF
    v ^= v >> 13
    v = (v * 1274126177) & 0xFFFFFFFF
    return v & 255


def floor_color(x, y):
    return FLOOR


def paint_floor(im, col, variant):
    ox, oy = col * T, 0
    buf = [[FLOOR for _ in range(T)] for _ in range(T)]
    # 细节离边 3px，四种地面的接缝是同一底色
    if variant == 1:
        blobs = ((8, 10, 4), (18, 20, 3), (22, 8, 3))
        for cx, cy, r in blobs:
            for y in range(cy, cy + r):
                for x in range(cx, cx + r):
                    buf[y][x] = PEBBLE if (x + y) % 2 == 0 else FLOOR_HI
    elif variant == 2:
        for y in range(12, 22):
            for x in range(8, 20):
                if (x + y) % 3 != 0:
                    buf[y][x] = MOSS
        for x, y in ((10, 14), (16, 16), (18, 13), (13, 20)):
            buf[y][x] = FLOWER
            buf[y][x + 1] = FLOWER
    elif variant == 3:
        for i in range(6, 26):
            buf[i][i] = CRACK
            buf[i][i - 1] = CRACK
            if i < 25:
                buf[i + 1][14] = FLOOR_LO
    else:
        for y in range(6, 26, 9):
            for x in range(6, 26, 8):
                buf[y][x] = FLOOR_HI
                buf[y][x + 1] = FLOOR_LO
    for y in range(T):
        for x in range(T):
            im.putpixel((ox + x, oy + y), buf[y][x])


def wall_color(x, y):
    # 2px 砖缝，32px 周期，相邻实心墙能接上。缩到手机上仍能看出砖。
    if y % 16 >= 14:
        return MORTAR
    band = y // 16
    seam = 14 if band % 2 == 0 else 6
    if seam <= x % 16 <= seam + 1:
        return MORTAR
    return WALL_HI if (x // 4 + y // 4) % 5 == 0 else WALL


def paint_wall(im, mask):
    col = mask & 0x0F
    row = 1 + (mask >> 4)
    ox, oy = col * T, row * T
    buf = [[wall_color(x, y) for x in range(T)] for y in range(T)]
    # 独立石柱：中心略亮，仍是顶视石面
    if mask == 0:
        for y in range(8, 24):
            for x in range(8, 24):
                if buf[y][x] != MORTAR:
                    buf[y][x] = mix(buf[y][x], WALL_HI, 0.65)
    opens = (
        (0x01, "up"),
        (0x02, "right"),
        (0x04, "down"),
        (0x08, "left"),
    )
    for bit, side in opens:
        if mask & bit:
            continue
        for i in range(T):
            if side == "up":
                buf[1][i] = SHADOW
                buf[2][i] = SHADOW
            elif side == "down":
                buf[T - 2][i] = SHADOW
                buf[T - 3][i] = SHADOW
            elif side == "left":
                buf[i][1] = SHADOW
                buf[i][2] = SHADOW
            else:
                buf[i][T - 2] = SHADOW
                buf[i][T - 3] = SHADOW
    for bit, side in opens:
        if mask & bit:
            continue
        for i in range(T):
            if side == "up":
                buf[0][i] = RIM
            elif side == "down":
                buf[T - 1][i] = RIM
            elif side == "left":
                buf[i][0] = RIM
            else:
                buf[i][T - 1] = RIM
    for y in range(T):
        for x in range(T):
            im.putpixel((ox + x, oy + y), buf[y][x])


def paint_door(im):
    # 0x20：第 2 行第 0 列
    ox, oy = 0, 2 * T
    for y in range(T):
        for x in range(T):
            im.putpixel((ox + x, oy + y), floor_color(x, y))
    for top, bot, shade in ((5, 10, 0.0), (14, 19, 0.15), (23, 28, 0.3)):
        for y in range(top, bot):
            for x in range(4, 28):
                c = GOLD_LO if y == bot - 1 else mix(GOLD, STEP, shade)
                if y == top:
                    c = GOLD
                im.putpixel((ox + x, oy + y), c)


def blob(im, ox, oy, pts, color):
    for x, y in pts:
        if 0 <= x < T and 0 <= y < T:
            im.putpixel((ox + x, oy + y), color)


def paint_decor(im):
    # 第 3 行：门已占第 0 列。装饰透明底，游戏这轮还不画。
    sprites = {
        1: ([(14, 18), (15, 17), (16, 18), (17, 16), (18, 18), (15, 19), (17, 19)], MOSS),
        2: ([(12, 14), (13, 13), (14, 12), (15, 12), (16, 13), (17, 14), (18, 15),
             (13, 15), (14, 16), (15, 16), (16, 16), (17, 15), (14, 14), (15, 14)], PEBBLE),
        3: ([(10, 18), (11, 17), (12, 18), (18, 16), (19, 15), (20, 16), (21, 16), (14, 20), (15, 21)], (0xC8, 0xC2, 0xB0, 255)),
        4: ([(10, 14), (12, 13), (14, 12), (16, 13), (18, 14), (20, 16), (18, 18), (14, 19), (11, 17), (13, 16), (16, 16)], (0x2A, 0x40, 0x58, 255)),
        5: ([(16, 12), (15, 13), (17, 13), (16, 14), (16, 15), (16, 16), (15, 17), (17, 17), (14, 18), (18, 18)], (0x8A, 0x3A, 0x3A, 255)),
        6: ([(8, 8), (16, 10), (24, 8), (12, 16), (20, 16), (16, 22), (10, 14), (22, 14)], (0xD0, 0xD4, 0xDC, 180)),
        7: ([(8, 10), (10, 12), (12, 13), (14, 16), (16, 18), (18, 20), (20, 22), (22, 24)], CRACK),
        8: ([(12, 14), (14, 12), (16, 14), (18, 13), (15, 16), (17, 17), (13, 18)], (0x6A, 0x42, 0x28, 255)),
    }
    row = 2
    for col, (pts, color) in sprites.items():
        blob(im, col * T, row * T, pts, color)
    # 墙面装饰 0x29–0x2C：火把、苔藓、裂缝、铁钉。底用墙色，方便以后叠到墙上。
    fx = [
        (9, [(16, 8), (15, 9), (17, 9), (16, 10), (16, 14), (16, 18), (15, 22), (17, 22)], (0xE0, 0x90, 0x30, 255)),
        (10, [(6, 8), (8, 10), (10, 14), (8, 18), (12, 20), (18, 8), (22, 16)], MOSS),
        (11, [(8, 6), (12, 10), (16, 14), (20, 18), (24, 22)], CRACK),
        (12, [(10, 10), (16, 10), (22, 10), (10, 18), (16, 18), (22, 18)], (0x8A, 0x90, 0x98, 255)),
    ]
    for col, pts, color in fx:
        ox, oy = col * T, row * T
        for y in range(T):
            for x in range(T):
                im.putpixel((ox + x, oy + y), wall_color(x, y))
        blob(im, ox, oy, pts, color)


def main():
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    for i in range(4):
        paint_floor(im, i, i)
    for mask in range(16):
        paint_wall(im, mask)
    paint_door(im)
    paint_decor(im)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "PNG", optimize=True)
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()
