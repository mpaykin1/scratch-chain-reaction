"""Deterministically remove prebuilt volcano art from the opening barren world.

Mirror only the untouched LEFT barren cliff into the right skyline. Preserve
the original sunset/center valley with a smooth luminance-agnostic blend.
No external images, paid API or GPU. Requires Pillow (already used by asset tools).
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1] / "cinematic" / "assets"


def barren(source: str, destination: str) -> None:
    src = Image.open(ROOT / source).convert("RGB")
    width, height = src.size
    mirrored = ImageOps.mirror(src)
    left = round(width * 0.53)
    right = round(width * 0.66)
    mask = Image.new("L", (width, 1))
    values = []
    for x in range(width):
        t = max(0.0, min(1.0, (x - left) / (right - left)))
        values.append(round(255 * t * t * (3 - 2 * t)))
    mask.putdata(values)
    output = Image.composite(mirrored, src, mask.resize((width, height)))
    output.save(ROOT / destination, "WEBP", quality=87, method=6)
    print(f"{destination}: {width}x{height}, {(ROOT / destination).stat().st_size} bytes")


if __name__ == "__main__":
    barren("world_landscape.webp", "world_barren_landscape.webp")
    barren("world_portrait.webp", "world_barren_portrait.webp")
