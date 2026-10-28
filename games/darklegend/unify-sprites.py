# -*- coding: utf-8 -*-
"""立牌归一：把 assets/iso/processed 的立牌按同一把尺子重采样、补描边、统一明度/饱和/色温。

    python games/darklegend/unify-sprites.py            # 体检 + 出图到 assets/iso/unified/
    python games/darklegend/unify-sprites.py --report   # 只体检，不出图

为什么要有这一步：
  同一屏里这些精灵的「缩小倍数」差 9 倍（树 1.2×、鸡 9.9×），
  于是细节密度、描边粗细、明暗对比各自不同 —— 这才是「看似统一、实则各玩各的」的技术根。
  规则：屏幕描边恒为 3px → 源图描边 = 3 × (源图高 / 屏幕高)。
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
PROC = os.path.join(ROOT, "assets", "iso", "processed")
OUT = os.path.join(ROOT, "assets", "iso", "unified")
CELL_PX = 48          # 一格 48px（与 three-pick 的 CELL_PX 一致）
SUPERSAMPLE = 2.5     # 源图高 = 屏幕高 × 2.5
OUTLINE_PX_SCREEN = 3.0
OUTLINE = np.array([0x3B, 0x2F, 0x26], np.float32) / 255.0
TARGET = {"val": 0.58, "range": 0.72, "sat": 0.52}

# 名字: 世界高度（单位 = 一格），与 render-three.js 的常量对齐
SPRITES = {
    "tree-v3": 11.7,
    "shop-v3": 4.8,
    "stall-v3": 3.0,
    "hero-dou": 2.34,
    "npc-v2": 2.05,
    "chicken-v2": 1.45,
}


def load(name):
    im = Image.open(os.path.join(PROC, name + ".png")).convert("RGBA")
    a = np.asarray(im).astype(np.float32) / 255.0
    ys, xs = np.nonzero(a[:, :, 3] > 0.2)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return im.crop(box)


def defringe(im):
    """洋红/粉边：贴边的偏品红像素直接抠掉（只动边缘 2px）。"""
    a = np.asarray(im).astype(np.float32) / 255.0
    al = a[:, :, 3] > 0.2
    inner = al.copy()
    for _ in range(2):
        nxt = inner.copy()
        nxt[1:, :] &= inner[:-1, :]
        nxt[:-1, :] &= inner[1:, :]
        nxt[:, 1:] &= inner[:, :-1]
        nxt[:, :-1] &= inner[:, 1:]
        inner = nxt
    edge = al & ~inner
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    pink = edge & (r - g > 0.08) & (b - g > 0.06)
    a[:, :, 3] = np.where(pink, 0, a[:, :, 3])
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
    return out.crop(out.getbbox())


def stats(im):
    a = np.asarray(im).astype(np.float32) / 255.0
    m = a[:, :, 3] > 0.2
    rgb = a[:, :, :3][m]
    lum = 0.299 * rgb[:, 0] + 0.587 * rgb[:, 1] + 0.114 * rgb[:, 2]
    mx, mn = rgb.max(1), rgb.min(1)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return {
        "val": float(lum.mean()),
        "p05": float(np.percentile(lum, 5)),
        "p95": float(np.percentile(lum, 95)),
        "range": float(np.percentile(lum, 95) - np.percentile(lum, 5)),
        "sat": float(sat.mean()),
        "pix": int(m.sum()),
    }


def at_display(im, disp_h):
    k = disp_h / im.height
    return im.resize((max(1, round(im.width * k)), disp_h), Image.LANCZOS)


def inner_outline(im, width):
    """内描边：轮廓内侧 width px 压成 OUTLINE 色（不改变剪影大小）。"""
    if width < 1:
        return im, 0
    a = np.asarray(im).astype(np.float32) / 255.0
    al = a[:, :, 3] > 0.25
    # 距离场：迭代腐蚀，第 i 圈 = 距边界 i..i+1 px
    cur = al.copy()
    dist = np.full(al.shape, 10 ** 4, np.int16)
    for i in range(width):
        nxt = cur.copy()
        nxt[1:, :] &= cur[:-1, :]
        nxt[:-1, :] &= cur[1:, :]
        nxt[:, 1:] &= cur[:, :-1]
        nxt[:, :-1] &= cur[:, 1:]
        ring = cur & ~nxt & al
        dist[ring] = i + 1
        cur = nxt
    stroke = (dist <= width) & al
    rgb = a[:, :, :3]
    rgb[stroke] = OUTLINE * 0.94 + rgb[stroke] * 0.06
    a[:, :, :3] = rgb
    out = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
    return out, int(stroke.sum())


def grade(im, src_stats, k_l, sat_k):
    a = np.asarray(im).astype(np.float32) / 255.0
    m = a[:, :, 3] > 0.02
    rgb = a[:, :, :3]
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    target_mean = TARGET["val"]
    # 以 p05/p95 为锚做线性拉伸，同时把均值送到 TARGET
    out = np.empty_like(rgb)
    for c in range(3):
        out[:, :, c] = (rgb[:, :, c] - lum) * sat_k + (
            (lum - src_stats["p05"]) * k_l + target_mean - (src_stats["p95"] - src_stats["p05"]) * k_l / 2)
    # 色温偏暖
    out[:, :, 0] *= 1.02
    out[:, :, 2] *= 0.97
    a[:, :, :3] = np.where(m[:, :, None], np.clip(out, 0, 1), rgb)
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")


def run(name, world_h, report_only):
    im = defringe(load(name))
    disp_h = int(round(world_h * CELL_PX))
    src_h_before = im.height
    raw_stats = stats(at_display(im, disp_h))

    stroke_w = max(1, int(round(OUTLINE_PX_SCREEN * im.height / disp_h)))
    im2, stroke_px = inner_outline(im, stroke_w)
    disp_stats = stats(at_display(im2, disp_h))

    k_l = min(1.9, max(0.75, TARGET["range"] / max(0.05, disp_stats["range"])))
    sat_k = min(1.5, max(0.7, TARGET["sat"] / max(0.05, disp_stats["sat"])))
    out = grade(im2, disp_stats, k_l, sat_k)

    # 重采样到 2.5×（不足的不放大超过 1.15×，纯放大只会更糊）
    want = int(round(disp_h * SUPERSAMPLE))
    k = want / out.height
    if k > 1.15:
        k = 1.15
    if abs(k - 1) > 0.02:
        out = out.resize((max(1, round(out.width * k)), int(round(out.height * k))), Image.LANCZOS)

    after = stats(at_display(out, disp_h))
    rec = {
        "name": name, "world_h": world_h, "disp_h": disp_h,
        "src_h": src_h_before, "out_h": out.height,
        "shrink_before": round(src_h_before / disp_h, 2),
        "shrink_after": round(out.height / disp_h, 2),
        "stroke_src_px": stroke_w, "stroke_screen_px": round(stroke_w * disp_h / im.height, 2),
        "before": {k2: round(v, 3) for k2, v in raw_stats.items()},
        "after": {k2: round(v, 3) for k2, v in after.items()},
    }
    if not report_only:
        os.makedirs(OUT, exist_ok=True)
        out.save(os.path.join(OUT, name + ".png"))
    return rec, out


def montage(rendered, path):
    """1:1 屏幕尺寸并排，垫草色 + 规格椭圆阴影，用来肉眼比。"""
    from PIL import ImageDraw
    W = 1500
    pad = 26
    ground_h = 640
    canvas = Image.new("RGBA", (W, ground_h + 70), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, W, ground_h], fill=(143, 190, 112, 255))
    x = pad
    base = ground_h - 30
    for rec, im in rendered:
        disp_h = rec["disp_h"]
        w = int(im.width * disp_h / im.height)
        small = im.resize((w, disp_h), Image.LANCZOS)
        if x + w > W - pad:
            x = pad
            base = ground_h - 30
        # 接触阴影：宽 0.8w / 高 0.35w / 0.30 alpha / 右下偏 3px
        sw, sh = int(min(w * 0.8, 240)), int(min(w * 0.8, 240) * 0.35)
        sh = max(4, sh)
        sh_img = Image.new("L", (sw, sh), 0)
        sd = ImageDraw.Draw(sh_img)
        sd.ellipse([0, 0, sw - 1, sh - 1], fill=120)
        sh_img = sh_img.resize((sw, sh), Image.LANCZOS)
        canvas.paste((59, 47, 38, 110), (x + (w - sw) // 2 + 3, base - sh // 2 + 2), sh_img)
        canvas.alpha_composite(small, (x, base - disp_h))
        d.text((x, base + 8), "%s  %dpx  src %d -> %d" % (rec["name"], disp_h, rec["src_h"], rec["out_h"]),
               fill=(30, 30, 30, 255))
        x += w + pad
    canvas.convert("RGB").save(path)


if __name__ == "__main__":
    report_only = "--report" in sys.argv
    rendered = []
    rows = []
    for name, h in SPRITES.items():
        rec, im = run(name, h, report_only)
        rows.append(rec)
        rendered.append((rec, im))
        b, a = rec["before"], rec["after"]
        print("%-11s 屏%4dpx 源%4d 缩%5.2f× → 明度 %.2f→%.2f 对比 %.2f→%.2f 饱和 %.2f→%.2f 描边%2dpx(src)/%.1fpx(屏)"
              % (name, rec["disp_h"], rec["src_h"], rec["shrink_before"], b["val"], a["val"],
                 b["range"], a["range"], b["sat"], a["sat"], rec["stroke_src_px"], rec["stroke_screen_px"]))
    os.makedirs("tmp/unify", exist_ok=True)
    montage(rendered, "tmp/unify/after.png")
    with open("tmp/unify/unify.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=1)
    print("写出 tmp/unify/after.png")
