#!/usr/bin/env python3
"""Restore generated PNG build inputs from the checked-in Scratch bundle.

The original illustrated source sheets are not part of the public repository.
This fallback uses the exact already-approved PNGs embedded in the native .sb3
so the build can be reproduced without private source artwork.
"""
from __future__ import annotations
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "chain-reaction-animated.sb3"
ART = ROOT / "assets"
PLAN = {"Stage": ["start_world.png"],
        "Река": ["river_world.png"],
        "Бредущие люди": [f"walkers_{i}.png" for i in range(4)],
        "Пыль и ветер": [f"dust_{i}.png" for i in range(4)],
        "Дым и лава": [f"steam_{i}.png" for i in range(4)],
        "Злой Джинн": [f"genie_{i}.png" for i in range(4)],
        "Диалог Джинна": [f"panel_{s}.png" for s in
            ("intro", "city", "forest", "energy", "volcano", "idea", "genie", "crisis")]}
for kind in ("city", "forest", "energy", "volcano"):
    PLAN["Мир " + kind] = [f"{kind}_world.png", f"{kind}_world2.png"]
for n in (1, 2):
    PLAN[f"Ветряк {n}"] = [f"rotor_{i}.png" for i in range(8)]
for i, name in enumerate(("Город", "Лес", "Энергия", "Вулкан", "Идея")):
    PLAN["Выбор " + name] = [f"card_{i}.png"]

def main() -> None:
    ART.mkdir(exist_ok=True)
    with zipfile.ZipFile(SRC) as archive:
        if archive.testzip() is not None:
            raise ValueError("Source Scratch archive is corrupt")
        project = json.loads(archive.read("project.json"))
        by_name = {t["name"]: t for t in project["targets"]}
        for target_name, names in PLAN.items():
            costumes = by_name[target_name]["costumes"]
            if len(costumes) != len(names):
                raise ValueError(f"Unexpected asset count for {target_name}")
            for filename, costume in zip(names, costumes):
                asset_name = costume["md5ext"]
                if costume["dataFormat"] != "png":
                    raise ValueError(f"Expected PNG for {target_name}: {asset_name}")
                output = ART / filename
                contents = archive.read(asset_name)
                if not output.is_file() or output.read_bytes() != contents:
                    output.write_bytes(contents)
    print("RESTORE_BUILD_ASSETS_PASS", len({n for x in PLAN.values() for n in x}))

if __name__ == "__main__":
    main()

