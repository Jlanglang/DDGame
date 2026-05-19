"""
将 4x5 表情包精灵图切割到 assets/tiles/（共用图池，关卡由 manifest 生成）

用法: python scripts/slice-spritesheet.py [源图路径]
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
TILES_DIR = ASSETS / "tiles"
DEFAULT_SRC = ASSETS / "spritesheet.png"

COLS = 5
ROWS = 4
# 与棋盘格子一致，避免导出过大 PNG
TILE_MAX_SIZE = 148


def save_tile(tile: Image.Image, out: Path) -> None:
    tile = tile.convert("RGBA")
    w, h = tile.size
    if max(w, h) > TILE_MAX_SIZE:
        ratio = TILE_MAX_SIZE / max(w, h)
        tile = tile.resize(
            (max(1, int(w * ratio)), max(1, int(h * ratio))),
            Image.Resampling.LANCZOS,
        )
    tile.save(out, "PNG", optimize=True, compress_level=9)


def crop_grid(src: Path) -> list[Image.Image]:
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cell_w = w // COLS
    cell_h = h // ROWS
    tiles = []
    for row in range(ROWS):
        for col in range(COLS):
            left = col * cell_w
            top = row * cell_h
            right = left + cell_w if col < COLS - 1 else w
            bottom = top + cell_h if row < ROWS - 1 else h
            tiles.append(img.crop((left, top, right, bottom)))
    return tiles


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.is_file():
        print(f"错误: 找不到源图 {src}")
        sys.exit(1)

    TILES_DIR.mkdir(parents=True, exist_ok=True)
    for old in TILES_DIR.glob("*"):
        if old.is_file():
            old.unlink()

    print(f"切割: {src.name} ({COLS}x{ROWS}) -> assets/tiles/")
    tiles = crop_grid(src)
    for i, tile in enumerate(tiles, start=1):
        out = TILES_DIR / f"{i:02d}.png"
        save_tile(tile, out)

    print(f"  共 {len(tiles)} 张，最长边 {TILE_MAX_SIZE}px")
    print("完成。请运行: node scripts/generate-manifest.js")
    print("已有大图可再运行: python scripts/optimize-tiles.py")


if __name__ == "__main__":
    main()
