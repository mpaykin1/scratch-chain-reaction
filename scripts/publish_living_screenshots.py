"""Publish review-sized, locally captured Living Actions screenshots (Pillow).

Run AFTER test/living-browser.cjs; does not synthesize screenshots.
"""
from pathlib import Path
from PIL import Image
import hashlib

root = Path(__file__).resolve().parents[1]
source = root / "work" / "living-browser"
destination = root / "docs" / "qa" / "living-actions"
destination.mkdir(parents=True, exist_ok=True)
for name, max_width in (
    ("desktop-before", 1000),
    ("desktop-after", 1000),
    ("mobile-emulation-before", 390),
    ("mobile-emulation-after", 390),
):
    filename = source / f"{name}.png"
    if not filename.exists():
        raise SystemExit(f"First run: node test/living-browser.cjs; missing {filename}")
    with Image.open(filename) as image:
        image = image.convert("RGB")
        if image.width > max_width:
            height = round(image.height * max_width / image.width)
            image = image.resize((max_width, height), Image.Resampling.LANCZOS)
        output = destination / f"{name}.webp"
        image.save(output, "WEBP", quality=82, method=6)
        data = output.read_bytes()
        print(f"{output.relative_to(root)}: {len(data)} bytes sha256={hashlib.sha256(data).hexdigest()}")
