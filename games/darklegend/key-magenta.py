# 洋红底 AI 图 → 透明 PNG + 裁到内容
# 用法：python key-magenta.py 输入.png 输出.png [--pad 6]
#
# 和 key-iso.py 的区别：那份是给主人给的 JPEG 素材用的（阈值是按 JPEG 压缩调的），
# 这份吃 ComfyUI 直出的 PNG：洋红更干净，所以按"洋红程度"算软 alpha，边缘不剩紫边。
from pathlib import Path
import sys
from PIL import Image

def key(path_in, path_out, pad=6, tol=110, soft=45):
    im = Image.open(path_in).convert("RGB")
    w, h = im.size
    px = im.load()
    out = Image.new("RGBA", (w, h))
    op = out.load()
    minx, miny, maxx, maxy = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = min(r, b) - g                      # 洋红程度
            if d >= tol:
                a = 0
            elif d > soft:
                a = int(255 * (tol - d) / (tol - soft))
                # 去紫边：把偏洋红的两个通道往绿通道靠
                k = (tol - d) / (tol - soft)
                r = int(r * k + min(r, g) * (1 - k) * 0.3 + g * (1 - k) * 0.7)
                b = int(b * k + min(b, g) * (1 - k) * 0.3 + g * (1 - k) * 0.7)
            else:
                a = 255
            op[x, y] = (r, g, b, a)
            if a > 40:
                minx = min(minx, x); miny = min(miny, y)
                maxx = max(maxx, x); maxy = max(maxy, y)
    if maxx > minx and maxy > miny:
        out = out.crop((max(0, minx - pad), max(0, miny - pad),
                        min(w, maxx + 1 + pad), min(h, maxy + 1 + pad)))
    Path(path_out).parent.mkdir(parents=True, exist_ok=True)
    out.save(path_out)
    print("keyed", Path(path_out).name, out.size)

if __name__ == "__main__":
    pad = 6
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for i, a in enumerate(sys.argv):
        if a == "--pad" and i + 1 < len(sys.argv):
            pad = int(sys.argv[i + 1])
    key(args[0], args[1], pad)
