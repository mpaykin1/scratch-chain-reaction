#!/usr/bin/env python3
"""Build validated portrait/wide Scratch variants from one native .sb3 source."""
from __future__ import annotations
import hashlib
import io
import json
from pathlib import Path
import zipfile
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "chain-reaction-animated.sb3"
OUT_DIR = ROOT / "player"
CARDS = ["Выбор Город", "Выбор Лес", "Выбор Энергия", "Выбор Вулкан", "Выбор Идея"]
METERS = ["Население", "Энергия", "Вода", "Еда", "Экология", "Бюджет"]


def resize_native_card_animation(project, base, pulse):
    """Prevent Scratch's native pulse loop from undoing responsive card sizing."""
    changed = 0
    for target in project["targets"]:
        if target["name"] not in CARDS:
            continue
        target["size"] = base
        for block in target["blocks"].values():
            if block["opcode"] != "looks_setsizeto":
                continue
            size = block["inputs"].get("SIZE")
            if not (isinstance(size, list) and len(size) > 1 and
                    isinstance(size[1], list) and len(size[1]) > 1):
                continue
            value = str(size[1][1])
            if value in ("100", "104"):
                size[1][1] = str(base if value == "100" else pulse)
                changed += 1
    if changed < 15:
        raise ValueError(f"Expected >=15 native card size blocks, got {changed}")
    return changed


def verify_zip(path, expected_targets, image_name):
    """Fail under python -O too; validate archive integrity and native sprites."""
    with zipfile.ZipFile(path) as archive:
        corrupt = archive.testzip()
        if corrupt:
            raise ValueError(f"Corrupt ZIP entry: {path}: {corrupt}")
        names = set(archive.namelist())
        if "project.json" not in names or image_name not in names:
            raise ValueError(f"Missing project/stage art in {path}")
        project = json.loads(archive.read("project.json"))
        targets = project["targets"]
        if len(targets) != expected_targets:
            raise ValueError(f"{path}: {len(targets)} != {expected_targets} targets")
        byname = {t["name"]: t for t in targets}
        if any(name not in byname for name in CARDS + ["Stage"]):
            raise ValueError(f"Missing native Scratch choices or stage in {path}")
        if byname["Stage"]["costumes"][0]["md5ext"] != image_name:
            raise ValueError(f"Unexpected stage art in {path}")
        for target in targets:
            if any(c["md5ext"] not in names for c in target["costumes"]):
                raise ValueError(f"Missing costume binary: {target['name']} in {path}")
    return len(targets)


def build_variant(src, image_path, canvas_size, out_path, card_base, card_pulse,
                  *, portrait=False):
    """Build one complete native Scratch project, independently of other variants."""
    if not src.is_file() or not image_path.is_file():
        raise FileNotFoundError(f"Missing source project or artwork: {src}, {image_path}")
    with zipfile.ZipFile(src) as archive:
        if archive.testzip():
            raise ValueError(f"Corrupt source archive: {src}")
        project = json.loads(archive.read("project.json"))
        assets = {name: archive.read(name) for name in archive.namelist()
                  if name != "project.json"}
    with Image.open(image_path) as original:
        backdrop = ImageOps.fit(original.convert("RGB"), canvas_size,
                                method=Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    backdrop.save(buffer, "PNG", optimize=True)
    art = buffer.getvalue()
    art_hash = hashlib.md5(art).hexdigest()
    art_name = art_hash + ".png"
    assets[art_name] = art
    stage = next(t for t in project["targets"] if t["isStage"])
    stage["costumes"][0] = {
        "assetId": art_hash, "name": "Вертикальная пустошь" if portrait else "Широкая пустошь",
        "md5ext": art_name, "dataFormat": "png", "bitmapResolution": 1,
        "rotationCenterX": canvas_size[0] // 2,
        "rotationCenterY": canvas_size[1] // 2,
    }
    byname = {t["name"]: t for t in project["targets"]}
    if portrait:
        for i, name in enumerate(CARDS):
            if name not in byname:
                raise ValueError("Missing native choice: " + name)
            byname[name].update(x=-192 + i * 96, y=-432, size=100, visible=True)
        for i, name in enumerate(METERS):
            byname["HUD " + name].update(
                x=(-155, 0, 155)[i % 3], y=446 - (i // 3) * 48,
                size=135, visible=True)
        byname["HUD Ход"].update(x=164, y=350, size=130)
        byname["Диалог Джинна"].update(x=36, y=-323, size=100, visible=True)
        byname["Злой Джинн"].update(x=-180, y=-333, size=88, visible=True)
        byname["Помощь"].update(x=-205, y=350, size=125)
        byname["Начать заново"].update(x=-166, y=350, size=125)
    count = resize_native_card_animation(project, card_base, card_pulse)
    project["meta"]["portraitSource" if portrait else "wideSource"] = "world-server-self-hosted-player"
    out_path.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
        payloads = {"project.json": json.dumps(project, ensure_ascii=False,
                    separators=(",", ":")).encode("utf-8"), **assets}
        # Fixed entry times and order ensure unchanged inputs produce identical bytes.
        for name, data in sorted(payloads.items()):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            archive.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=7)
    total = verify_zip(out_path, len(project["targets"]), art_name)
    print("VARIANT_PASS", out_path.name, out_path.stat().st_size,
          "targets", total, "card_blocks", count, "canvas", canvas_size)
    return out_path


def main():
    outputs = [
        build_variant(SRC, ROOT / "cinematic/assets/world_portrait.webp",
                      (480, 1300), OUT_DIR / "chain-reaction-portrait.sb3", 82, 86,
                      portrait=True),
        build_variant(SRC, ROOT / "cinematic/assets/world_landscape.webp",
                      (1920, 1080), OUT_DIR / "chain-reaction-wide.sb3", 175, 181),
    ]
    hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in outputs}
    version = hashlib.sha256("".join(hashes.values()).encode()).hexdigest()[:16]
    (OUT_DIR / "build-manifest.json").write_text(
        json.dumps({"version": version, "sha256": hashes}, indent=2) + "\n",
        encoding="utf-8")
    print("BUILD_MANIFEST_PASS", version)


if __name__ == "__main__":
    main()
