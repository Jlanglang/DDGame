# 把手绘「路网草图」转成线段数据（像素 → 网格）
# 用法: python tools/trace-map.py <图.png> docs/maps/<名>.segments.json [网格宽=48] [路宽格=6]
#
# 思路：墨迹像素 → 找出几个主方向（θ 峰）→ 每个方向上看 ρ 峰 = 一根线 →
#       沿线方向的墨迹按「空隙」切成段（同一根线上断开的两笔会被切成两条）→ 缩放到网格。
# 只认「黑线在白底上」这种干净草图；网格纸、彩色笔、铅笔淡线要调阈值。

import sys, json
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

img_path, out_path = sys.argv[1], sys.argv[2]
GW = int(sys.argv[3]) if len(sys.argv) > 3 else 48

im = Image.open(img_path).convert('L')
W, H = im.size
a = np.asarray(im, dtype=np.uint8)
ys, xs = np.nonzero(a < 160)
print(f'图 {W}x{H}，墨迹像素 {len(xs)}')
if len(xs) < 200:
    print('墨迹太少，阈值可能不对'); sys.exit(1)

thetas = np.deg2rad(np.arange(0, 180, 1.0))
diag = int(np.hypot(W, H)) + 2
rho_off = diag
acc = np.zeros((len(thetas), 2 * diag + 1), dtype=np.int32)
for i, th in enumerate(thetas):
    r = np.rint(xs * np.cos(th) + ys * np.sin(th)).astype(np.int32) + rho_off
    acc[i] = np.bincount(r, minlength=2 * diag + 1)[: 2 * diag + 1]

# ---- 主方向：θ 上取局部极大 ----
score = acc.max(axis=1)
theta_pick = []
for t in range(len(thetas)):
    v = score[t]
    lo, hi = max(0, t - 3), min(len(score), t + 4)
    if v >= 60 and v == score[lo:hi].max():
        if not theta_pick or t - theta_pick[-1] >= 4:
            theta_pick.append(t)
print('主方向(°)：', [int(np.rad2deg(thetas[t])) for t in theta_pick])

segs = []
for t in theta_pick:
    th = thetas[t]
    c, s = np.cos(th), np.sin(th)
    rho_i = np.rint(xs * c + ys * s).astype(np.int32) + rho_off
    hist = np.bincount(rho_i, minlength=2 * diag + 1)
    # ρ 上取峰，间隔至少 6px
    order = np.argsort(hist)[::-1]
    picked = []
    for ri in order:
        if hist[ri] < 50:
            break
        if all(abs(ri - p) >= 6 for p in picked):
            picked.append(ri)
    for ri in picked:
        rho = ri - rho_off
        m = np.abs(xs * c + ys * s - rho) < 2.5
        if m.sum() < 30:
            continue
        tt = np.sort(-xs[m] * s + ys[m] * c)
        # 按空隙切段
        cut = np.nonzero(np.diff(tt) > 14)[0]
        bounds = [0] + list(cut + 1) + [len(tt)]
        for k in range(len(bounds) - 1):
            t0, t1 = tt[bounds[k]], tt[bounds[k + 1] - 1]
            if t1 - t0 < 45:
                continue
            # 反解端点：沿方向 d=(-s,c)，以 (rho*c, rho*s) 为基点
            bx, by = rho * c, rho * s
            segs.append((bx - s * t0, by + c * t0, bx - s * t1, by + c * t1))

# ---- 去重：重叠且共线 ----
def dist_to_seg(px, py, s):
    x0, y0, x1, y1 = s
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy or 1e-9
    k = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / L2))
    return np.hypot(px - (x0 + k * dx), py - (y0 + k * dy))

uniq = []
for s in sorted(segs, key=lambda s: -np.hypot(s[2] - s[0], s[3] - s[1])):
    dup = False
    for u in uniq:
        if dist_to_seg(s[0], s[1], u) < 4 and dist_to_seg(s[2], s[3], u) < 4:
            dup = True; break
    if not dup:
        uniq.append(s)

sc = GW / W
GH = int(round(H * sc))
grid = [dict(x1=round(s[0] * sc, 2), y1=round(s[1] * sc, 2),
             x2=round(s[2] * sc, 2), y2=round(s[3] * sc, 2)) for s in uniq]
grid = [g for g in grid if np.hypot(g['x2'] - g['x1'], g['y2'] - g['y1']) >= 2]

json.dump(dict(source=img_path, image=dict(w=W, h=H), grid=dict(w=GW, h=GH),
               segments=grid), open(out_path, 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print(f'\n线段 {len(grid)} 条 → {out_path}   (网格 {GW}x{GH})')
for i, g in enumerate(grid, 1):
    ln = np.hypot(g['x2'] - g['x1'], g['y2'] - g['y1'])
    print(f"  L{i:<2} ({g['x1']:5.1f},{g['y1']:5.1f}) → ({g['x2']:5.1f},{g['y2']:5.1f})  长 {ln:.1f} 格")
