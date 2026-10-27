# 玩家（豆豆战士）与 NPC 重画：128 格，4 向 × 4 帧 + 死亡 4
# 只覆盖 assets/chars/player-bean.png 和 npc.png
from pathlib import Path
import math

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent / "assets"
OUT = (0x2A, 0x21, 0x18, 255)
SKIN = (0xF6, 0xE6, 0xB8, 255)
SKIN_D = (0xE2, 0xCC, 0x94, 255)
SKIN_H = (0xFF, 0xF4, 0xD6, 255)
BLUSH = (0xF2, 0x9E, 0xB2, 255)
ARMOR = (0xB0, 0x6A, 0x3A, 255)
ARMOR_D = (0x7E, 0x46, 0x24, 255)
ARMOR_H = (0xCE, 0x8A, 0x54, 255)
CAPE = (0xB8, 0x33, 0x2A, 255)
CAPE_D = (0x8A, 0x22, 0x1C, 255)
IRON = (0xD6, 0xDE, 0xE8, 255)
IRON_D = (0x9A, 0xA4, 0xB2, 255)
WOOD = (0x6B, 0x44, 0x26, 255)
WHITE = (0xFF, 0xFF, 0xFF, 255)
GOLD = (0xF0, 0xC8, 0x40, 255)
BOOK = (0x3E, 0x62, 0x8E, 255)


def blank(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def ellipse(d, box, fill):
    x0, x1 = sorted((box[0], box[2]))
    y0, y1 = sorted((box[1], box[3]))
    d.ellipse([int(x0), int(y0), int(x1), int(y1)], fill=fill)


def poly(d, pts, fill):
    d.polygon([(int(x), int(y)) for x, y in pts], fill=fill)


def rot(px, py, cx, cy, a):
    ca, sa = math.cos(a), math.sin(a)
    return (cx + (px - cx) * ca - (py - cy) * sa,
            cy + (px - cx) * sa + (py - cy) * ca)


def sword(d, cx, cy, ang, ln=34):
    """从 (cx,cy) 朝 ang 方向画一把剑。"""
    x2, y2 = cx + math.cos(ang) * ln, cy + math.sin(ang) * ln
    d.line((cx, cy, x2, y2), fill=IRON, width=4)
    d.line((cx + 2, cy + 2, x2, y2), fill=IRON_D, width=1)
    gx1, gy1 = cx + math.cos(ang + 1.57) * 6, cy + math.sin(ang + 1.57) * 6
    gx2, gy2 = cx + math.cos(ang - 1.57) * 6, cy + math.sin(ang - 1.57) * 6
    d.line((gx1, gy1, gx2, gy2), fill=GOLD, width=3)
    d.line((cx, cy, cx - math.cos(ang) * 6, cy - math.sin(ang) * 6), fill=WOOD, width=3)


def bean(d, cx, foot, dirn, pose, gear=True, body=SKIN):
    """豆豆：竖蛋身体 + 4 向 + 待机/走/攻击。foot=脚底 y。"""
    bob = -2 if pose in ("walk1", "attack") else 0
    if pose == "walk2":
        bob = 1
    top = foot - 90 + bob
    bot = foot - 2 + bob
    w = 30
    lean = -3 if pose == "attack" else 0

    # 脚
    if pose == "walk1":
        ellipse(d, (cx - 20, bot - 6, cx - 6, bot + 2), OUT)
        ellipse(d, (cx + 8, bot - 10, cx + 22, bot - 2), OUT)
    elif pose == "walk2":
        ellipse(d, (cx - 22, bot - 10, cx - 8, bot - 2), OUT)
        ellipse(d, (cx + 6, bot - 6, cx + 20, bot + 2), OUT)
    else:
        ellipse(d, (cx - 18, bot - 8, cx - 4, bot + 2), OUT)
        ellipse(d, (cx + 4, bot - 8, cx + 18, bot + 2), OUT)

    # 披风（背面整块，正面两侧露出）
    if dirn == "u":
        poly(d, [(cx - 30, top + 26), (cx + 30, top + 26), (cx + 34, bot + 2),
                 (cx - 34, bot + 2)], CAPE_D)
        poly(d, [(cx - 26, top + 28), (cx + 26, top + 28), (cx + 28, bot),
                 (cx - 28, bot)], CAPE)
    else:
        side = -1 if dirn == "l" else 1
        poly(d, [(cx + side * 10, top + 30), (cx + side * 34, top + 40),
                 (cx + side * 40, bot + 4), (cx + side * 8, bot + 2)], CAPE_D)
        poly(d, [(cx + side * 12, top + 32), (cx + side * 30, top + 42),
                 (cx + side * 34, bot), (cx + side * 10, bot)], CAPE)

    # 身体
    ellipse(d, (cx - w - 2, top - 2 + lean, cx + w + 2, bot + 2), OUT)
    ellipse(d, (cx - w + 2, top + 2 + lean, cx + w - 2, bot - 2), body)
    ellipse(d, (cx - w + 6, top + 8 + lean, cx - w + 16, top + 36 + lean), SKIN_H)

    # 手
    hy = top + 52 + lean
    if dirn in ("d", "u"):
        ellipse(d, (cx - 38, hy, cx - 26, hy + 16), OUT)
        ellipse(d, (cx - 36, hy + 2, cx - 28, hy + 14), body)
        ellipse(d, (cx + 26, hy, cx + 38, hy + 16), OUT)
        ellipse(d, (cx + 28, hy + 2, cx + 36, hy + 14), body)
    else:
        side = -1 if dirn == "l" else 1
        ellipse(d, (cx + side * 26, hy, cx + side * 40, hy + 16), OUT)
        ellipse(d, (cx + side * 28, hy + 2, cx + side * 38, hy + 14), body)

    # 皮甲背心 + 腰带
    if gear:
        poly(d, [(cx - 24, top + 52), (cx + 24, top + 52), (cx + 22, bot - 6),
                 (cx - 22, bot - 6)], ARMOR_D)
        poly(d, [(cx - 22, top + 54), (cx + 22, top + 54), (cx + 20, bot - 8),
                 (cx - 20, bot - 8)], ARMOR)
        poly(d, [(cx - 20, top + 56), (cx - 8, top + 56), (cx - 8, bot - 10),
                 (cx - 18, bot - 10)], ARMOR_H)
        d.line((cx - 22, bot - 14, cx + 22, bot - 14), fill=WOOD, width=3)
        d.rectangle((cx - 4, bot - 17, cx + 4, bot - 11), fill=GOLD)

    # 脸
    ey = top + 36 + lean
    if dirn == "u":
        pass
    elif dirn == "d":
        for ex in (cx - 14, cx + 14):
            ellipse(d, (ex - 4, ey - 6, ex + 4, ey + 6), OUT)
            ellipse(d, (ex - 2, ey - 4, ex + 1, ey + 1), WHITE)
        d.arc((cx - 7, ey + 6, cx + 7, ey + 16), 10, 170, fill=OUT, width=2)
        ellipse(d, (cx - 26, ey + 6, cx - 16, ey + 12), BLUSH)
        ellipse(d, (cx + 16, ey + 6, cx + 26, ey + 12), BLUSH)
    else:
        side = -1 if dirn == "l" else 1
        ex = cx + side * 10
        ellipse(d, (ex - 4, ey - 6, ex + 4, ey + 6), OUT)
        ellipse(d, (ex - 2, ey - 4, ex + 1, ey + 1), WHITE)
        d.arc((ex - 4, ey + 6, ex + 6, ey + 15), 20, 150, fill=OUT, width=2)
        ellipse(d, (cx + side * 20, ey + 6, cx + side * 28, ey + 12), BLUSH)

    # 剑
    if gear:
        if dirn == "d":
            if pose == "attack":
                sword(d, cx + 30, top + 60, math.radians(-70), 40)
            else:
                sword(d, cx + 32, top + 66, math.radians(-95), 34)
        elif dirn == "l":
            if pose == "attack":
                sword(d, cx - 30, top + 58, math.radians(200), 42)
            else:
                sword(d, cx - 32, top + 70, math.radians(180), 32)
        elif dirn == "r":
            if pose == "attack":
                sword(d, cx + 30, top + 58, math.radians(-20), 42)
            else:
                sword(d, cx + 32, top + 70, math.radians(0), 32)
        else:
            sword(d, cx + 30, top + 34, math.radians(-110), 30)


def player_sheet():
    im = blank(512, 640)
    dirs = ["d", "l", "r", "u"]
    poses = ["idle", "walk1", "walk2", "attack"]
    for r, dirn in enumerate(dirs):
        for c, pose in enumerate(poses):
            cell = blank(128, 128)
            d = ImageDraw.Draw(cell)
            bean(d, 64, 116, dirn, pose)
            im.alpha_composite(cell, (c * 128, r * 128))
    # 死亡行：受击 / 倒 1 / 倒 2 / 消散
    row = blank(512, 128)
    d = ImageDraw.Draw(row)
    # 受击
    cell = blank(128, 128)
    d = ImageDraw.Draw(cell)
    bean(d, 64, 116, "d", "idle")
    for ex in (50, 78):
        d.line((ex - 5, 60, ex + 5, 70), fill=OUT, width=3)
        d.line((ex + 5, 60, ex - 5, 70), fill=OUT, width=3)
    row.alpha_composite(cell, (0, 0))
    # 倒地 1
    cell = blank(128, 128)
    d = ImageDraw.Draw(cell)
    ellipse(d, (22, 96, 106, 120), OUT)
    ellipse(d, (26, 98, 102, 116), SKIN)
    poly(d, [(30, 108), (96, 108), (92, 118), (34, 118)], CAPE)
    for ex in (46, 70):
        d.line((ex - 4, 102, ex + 4, 110), fill=OUT, width=2)
        d.line((ex + 4, 102, ex - 4, 110), fill=OUT, width=2)
    row.alpha_composite(cell, (128, 0))
    # 倒地 2
    cell = blank(128, 128)
    d = ImageDraw.Draw(cell)
    ellipse(d, (26, 104, 102, 120), OUT)
    ellipse(d, (30, 106, 98, 116), SKIN_D)
    poly(d, [(36, 110), (92, 110), (88, 118), (40, 118)], CAPE_D)
    row.alpha_composite(cell, (256, 0))
    # 消散
    cell = blank(128, 128)
    d = ImageDraw.Draw(cell)
    d.ellipse((34, 96, 94, 118), fill=(0xF6, 0xE6, 0xB8, 110))
    d.ellipse((44, 100, 84, 114), fill=(0xFF, 0xFF, 0xFF, 60))
    row.alpha_composite(cell, (384, 0))
    im.alpha_composite(row, (0, 512))
    return im


def npc_sheet():
    # 引擎按 96 格读（384×192），这里先按 128 画再缩到 96，保持比例。
    im = blank(384, 192)
    for row in range(2):
        for col in range(4):
            cell = blank(128, 128)
            d = ImageDraw.Draw(cell)
            if col == 3:
                # 仓库：木箱
                poly(d, [(30, 84), (98, 84), (104, 112), (24, 112)], OUT)
                poly(d, [(34, 86), (94, 86), (98, 108), (30, 108)], (0x8A, 0x5A, 0x32, 255))
                poly(d, [(34, 86), (94, 86), (94, 94), (34, 94)], (0xB0, 0x7C, 0x4A, 255))
                d.line((34, 96, 94, 96), fill=(0x5E, 0x3C, 0x22, 255), width=3)
                d.rectangle((58, 88, 70, 104), fill=(0xC2, 0xC9, 0xD2, 255))
                d.rectangle((61, 92, 67, 98), fill=(0x6B, 0x44, 0x26, 255))
            else:
                bean(d, 64, 116, "d", "idle", gear=False)
                if col == 0:  # 商人：围裙 + 钱袋
                    poly(d, [(44, 84), (84, 84), (88, 112), (40, 112)], (0x8A, 0x5A, 0x32, 255))
                    d.rectangle((40, 80, 88, 88), fill=(0x5E, 0x3C, 0x22, 255))
                    d.ellipse((86, 96, 104, 112), fill=(0xE8, 0xC8, 0x60, 255))
                    d.line((92, 96, 92, 88), fill=(0x8A, 0x5A, 0x32, 255), width=2)
                elif col == 1:  # 村长：白胡子 + 拐杖
                    d.ellipse((46, 66, 82, 96), fill=(0xEC, 0xEC, 0xE4, 255))
                    d.ellipse((52, 74, 76, 92), fill=(0xD8, 0xD8, 0xD0, 255))
                    d.line((98, 60, 104, 114), fill=(0x8A, 0x5A, 0x32, 255), width=4)
                    d.ellipse((96, 54, 108, 64), fill=(0xC2, 0xC9, 0xD2, 255))
                elif col == 2:  # 书商：眼镜 + 书
                    d.ellipse((44, 70, 58, 82), outline=OUT, width=2)
                    d.ellipse((70, 70, 88, 82), outline=OUT, width=2)
                    d.line((58, 76, 70, 76), fill=OUT, width=2)
                    d.rectangle((44, 92, 84, 110), fill=BOOK)
                    d.rectangle((44, 92, 50, 110), fill=(0x2A, 0x44, 0x66, 255))
                    d.line((50, 96, 82, 96), fill=(0xE2, 0xD6, 0xB8, 255), width=2)
            small = cell.resize((96, 96), Image.LANCZOS)
            im.alpha_composite(small, (col * 96, row * 96))
    return im


def main():
    (ROOT / "chars").mkdir(parents=True, exist_ok=True)
    player_sheet().save(ROOT / "chars" / "player-bean.png")
    npc_sheet().save(ROOT / "chars" / "npc.png")
    print("chars v2 ok")


if __name__ == "__main__":
    main()
