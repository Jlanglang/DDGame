"""
批量压缩 assets/tiles/ 下的牌面图（缩小尺寸 + PNG 压缩）

牌面显示为 148×148，源图无需过大。默认最长边 148px。

用法:
  python scripts/optimize-tiles.py
  python scripts/optimize-tiles.py --max-size 148
  python scripts/optimize-tiles.py assets/tiles --max-size 148
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = ROOT / "assets" / "tiles"
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def optimize_image(path: Path, max_size: int, dry_run: bool) -> tuple[int, int]:
    before = path.stat().st_size
    img = Image.open(path).convert("RGBA")
    w, h = img.size

    if max(w, h) > max_size:
        ratio = max_size / max(w, h)
        nw = max(1, int(w * ratio))
        nh = max(1, int(h * ratio))
        img = img.resize((nw, nh), Image.Resampling.LANCZOS)

    if dry_run:
        return before, before

    img.save(path, "PNG", optimize=True, compress_level=9)
    return before, path.stat().st_size


def main() -> None:
    parser = argparse.ArgumentParser(description="压缩牌面图片文件")
    parser.add_argument(
        "dir",
        nargs="?",
        default=str(DEFAULT_DIR),
        help="图片目录，默认 assets/tiles",
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=148,
        help="最长边像素（默认 148，与棋盘格子一致）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只统计，不写入",
    )
    args = parser.parse_args()

    tile_dir = Path(args.dir)
    if not tile_dir.is_dir():
        print(f"错误: 目录不存在 {tile_dir}")
        sys.exit(1)

    files = sorted(
        p for p in tile_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT
    )
    if not files:
        print(f"错误: {tile_dir} 下没有图片")
        sys.exit(1)

    total_before = 0
    total_after = 0
    for path in files:
        before, after = optimize_image(path, args.max_size, args.dry_run)
        total_before += before
        total_after += after
        pct = (1 - after / before) * 100 if before else 0
        print(f"  {path.name}: {before // 1024}KB -> {after // 1024}KB ({pct:.0f}%)")

    saved = total_before - total_after
    label = "预计可节省" if args.dry_run else "共节省"
    print(
        f"\n{len(files)} 张，{label} {saved // 1024}KB "
        f"({total_before // 1024}KB -> {total_after // 1024}KB)"
    )
    if args.dry_run:
        print("去掉 --dry-run 后执行写入。")
    else:
        print("完成。若改过图池请运行: node scripts/generate-manifest.js")


if __name__ == "__main__":
    main()
