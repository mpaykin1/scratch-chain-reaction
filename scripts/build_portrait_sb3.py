#!/usr/bin/env python3
"""Generate a genuinely portrait Scratch project from our existing animated .sb3.
Uses the *same* sprite scripts, variables and assets; only stage art and
initial layout change. No network dependencies or new game engine.
"""
from __future__ import annotations
import hashlib
import io
import json
from pathlib import Path
import zipfile
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "chain-reaction-animated.sb3"
PORTRAIT_IMAGE = ROOT / "cinematic/assets/world_portrait.webp"
OUT = ROOT / "player/chain-reaction-portrait.sb3"

def main():
    if not SRC.is_file() or not PORTRAIT_IMAGE.is_file():
        raise FileNotFoundError("Animated .sb3 or portrait world artwork missing")
    with zipfile.ZipFile(SRC) as source:
        project = json.loads(source.read("project.json"))
        assets = {n: source.read(n) for n in source.namelist() if n != "project.json"}
    targets = project["targets"]
    stage = next(t for t in targets if t["isStage"])
    # Large image deliberately extends beyond the dynamic viewport: portrait
    # resizing clips artwork rather than exposing empty strips of stage.
    with Image.open(PORTRAIT_IMAGE) as original:
        backdrop = ImageOps.fit(original.convert("RGB"), (480, 1300),
                                method=Image.Resampling.LANCZOS, centering=(.5, .5))
    buffer = io.BytesIO()
    backdrop.save(buffer, "PNG", optimize=True)
    art = buffer.getvalue()
    asset_hash = hashlib.md5(art).hexdigest()
    filename = asset_hash + ".png"
    assets[filename] = art
    stage["costumes"][0] = dict(assetId=asset_hash, name="Вертикальная пустошь",
        md5ext=filename, dataFormat="png", bitmapResolution=1,
        rotationCenterX=240, rotationCenterY=650)

    # 960 is the reference portrait canvas size. JS relocates every fixed UI
    # target after load to match the actual viewport/stage height.
    byname = {t["name"]: t for t in targets}
    cards = ["Выбор Город", "Выбор Лес", "Выбор Энергия",
             "Выбор Вулкан", "Выбор Идея"]
    for i, name in enumerate(cards):
        if name not in byname:
            raise ValueError("Missing native Scratch choice: " + name)
        byname[name].update(x=-192 + i * 96, y=-432, size=100, visible=True)
    counters = ["Население","Энергия","Вода","Еда","Экология","Бюджет"]
    for i, label in enumerate(counters):
        t = byname["HUD " + label]
        t.update(x=(-155, 0, 155)[i % 3],
                 y=446 - (i // 3) * 48, size=135, visible=True)
    byname["HUD Ход"].update(x=164, y=350, size=130)
    byname["Диалог Джинна"].update(x=36, y=-323, size=100, visible=True)
    byname["Злой Джинн"].update(x=-180, y=-333, size=88, visible=True)
    byname["Помощь"].update(x=-205, y=350, size=125)
    byname["Начать заново"].update(x=-166, y=350, size=125)
    # Leave world objects around the center so forest, city, power and volcano
    # actually appear on the rebuilt 1300px high landscape after each action.
    project["meta"]["portraitSource"] = "world-server-self-hosted-player"
    OUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as dst:
        dst.writestr("project.json", json.dumps(project, ensure_ascii=False, separators=(",",":")))
        for name, content in assets.items():
            dst.writestr(name, content)
    with zipfile.ZipFile(OUT) as check:
        assert len(check.testzip() or "") == 0
        doc = json.loads(check.read("project.json"))
        assert len(doc["targets"]) == len(targets)
        assert all(any(t["name"] == n for t in doc["targets"]) for n in cards)
        assert filename in check.namelist()
    print("PORTRAIT_PASS", str(OUT), OUT.stat().st_size,
          "targets", len(targets), "choices", len(cards), "stage", "480x1300")

if __name__ == "__main__":
    main()
