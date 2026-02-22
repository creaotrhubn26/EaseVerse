#!/usr/bin/env python3
"""Generate web-specific PNG assets with lossless optimization.

Creates `*.web.png` files next to source icons so React Native Web resolves
optimized assets automatically on web while native keeps original files.
"""

from __future__ import annotations

from pathlib import Path
import shutil
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
IMAGES_ROOT = ROOT / "assets" / "images"
SKIP_PREFIXES = {
    "assets/images/web/",
}
SKIP_EXACT = {
    "assets/images/android-icon-background.png",
    "assets/images/android-icon-foreground.png",
    "assets/images/android-icon-monochrome.png",
}


def human_size(size: int) -> str:
    units = ["B", "KB", "MB"]
    value = float(size)
    unit = units[0]
    for next_unit in units[1:]:
        if value < 1024:
            break
        value /= 1024
        unit = next_unit
    if unit == "B":
        return f"{int(value)}{unit}"
    return f"{value:.1f}{unit}"


def should_process(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if any(rel.startswith(prefix) for prefix in SKIP_PREFIXES):
        return False
    if rel in SKIP_EXACT:
        return False
    if path.name.endswith(".web.png"):
        return False
    return True


def discover_sources() -> list[Path]:
    sources = [p for p in IMAGES_ROOT.rglob("*.png") if should_process(p)]
    return sorted(sources)


def optimize(src: Path) -> tuple[Path, int, int]:
    dst = src.with_name(f"{src.stem}.web.png")
    before = src.stat().st_size
    with Image.open(src) as image:
        optimized = image.convert("RGBA") if "A" in image.getbands() else image.convert("RGB")
        optimized.save(dst, format="PNG", optimize=True, compress_level=9)

    after = dst.stat().st_size
    if after > before:
        # Keep quality identical and avoid size regressions.
        shutil.copyfile(src, dst)
        after = dst.stat().st_size

    return dst, before, after


def run(sources: Iterable[Path]) -> int:
    print("Optimizing web icon assets:")
    total_before = 0
    total_after = 0
    count = 0

    for src in sources:
        dst, before, after = optimize(src)
        total_before += before
        total_after += after
        reduction = 0.0 if before == 0 else (1 - after / before) * 100
        print(
            f"- {src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}: "
            f"{human_size(before)} -> {human_size(after)} ({reduction:.1f}% smaller)"
        )
        count += 1

    total_reduction = 0.0 if total_before == 0 else (1 - total_after / total_before) * 100
    print(
        f"Total ({count} files): {human_size(total_before)} -> {human_size(total_after)} "
        f"({total_reduction:.1f}% smaller)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(run(discover_sources()))
