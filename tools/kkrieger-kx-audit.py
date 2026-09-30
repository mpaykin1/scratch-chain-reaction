#!/usr/bin/env python3
"""Reproducible archaeology report for the real .kkrieger KX operator graphs.

Usage:
  python tools/kkrieger-kx-audit.py --upstream-root /path/to/kkrieger-wasm/werkkzeug3_kkrieger
  python tools/kkrieger-kx-audit.py --upstream-root ... --json report.json

The script deliberately uses upstream wasm/tools/kxread.py so parsing semantics
stay anchored to the pinned Krieger implementation rather than a second parser.
"""

from __future__ import annotations
import argparse
import collections
import importlib.util
import json
from pathlib import Path
from typing import Any

NAMES = {
    0x10: "KKriegerPara", 0x11: "KKriegerMonster", 0x12: "KKriegerEvents",
    0x13: "Respawn", 0x14: "SplashDamage", 0x15: "MonsterFlags",
    0x21: "BitmapFlat", 0x22: "BitmapPerlin", 0x23: "BitmapColor",
    0x24: "BitmapMerge", 0x25: "BitmapFormat", 0x26: "BitmapRenderTarget",
    0x27: "BitmapGlowRectOld", 0x28: "BitmapDots", 0x29: "BitmapBlur",
    0x2A: "BitmapMask", 0x2B: "BitmapHSCB", 0x2C: "BitmapRotate",
    0x2D: "BitmapDistort", 0x2E: "BitmapNormals", 0x2F: "BitmapLight",
    0x30: "BitmapBump", 0x31: "BitmapText", 0x32: "BitmapCell",
    0x34: "BitmapGradient", 0x35: "BitmapRange", 0x36: "BitmapRotateMul",
    0x37: "BitmapTwirl", 0x38: "BitmapSharpen", 0x39: "BitmapGlowRect",
    0x3B: "BitmapColorBalance",
    0x61: "EffectPrint", 0x63: "PartEmitter", 0x64: "PartSystem",
    0x81: "MeshCube", 0x82: "MeshCylinder", 0x86: "MeshSelectCube",
    0x87: "MeshSubdivide", 0x88: "MeshTransform", 0x89: "MeshTransformEx",
    0x8A: "MeshCrease", 0x8C: "MeshTriangulate", 0x8F: "MeshDisplace",
    0x90: "MeshBevel", 0x91: "MeshPerlin", 0x92: "MeshAdd",
    0x93: "MeshDeleteFaces", 0x95: "MeshMultiply", 0x96: "MeshMatLink",
    0x9A: "MeshExtrude", 0x9C: "MeshCollisionCube", 0x9D: "MeshGrid",
    0xA0: "MeshBend", 0xA5: "MeshUVProjection", 0xA6: "MeshCenter",
    0xA7: "MeshAutoCollision", 0xA8: "MeshSelectSphere", 0xAB: "MeshBend2",
    0xAD: "MeshColor", 0xAF: "MeshLightSlot", 0xB0: "MeshShadowEnable",
    0xB3: "MeshSingleVert",
    0xC0: "Scene", 0xC1: "SceneAdd", 0xC2: "SceneMultiply",
    0xC3: "SceneTransform", 0xC4: "SceneLight", 0xC5: "SceneParticles",
    0xC6: "SceneCamera", 0xC7: "SceneLimb", 0xC8: "SceneWalk",
    0xC9: "SceneRotate", 0xCB: "SceneSector", 0xCD: "ScenePortal",
    0xCE: "ScenePhysic",
    0xD0: "Material", 0xD1: "MaterialAdd", 0xD2: "SceneMatHack",
    0xE2: "IPPCopy", 0xE3: "IPPBlur", 0xE6: "IPPColor",
    0xE7: "IPPMerge", 0xE8: "IPPMask", 0xEA: "IPPSelect",
    0xEB: "IPPRenderTarget", 0xF0: "IPPViewport",
}

CATEGORY_RANGES = {
    "bitmap": range(0x21, 0x3C),
    "mesh": range(0x81, 0xB4),
    "scene": range(0xC0, 0xCF),
    "ipp": range(0xE0, 0xF1),
}
CATEGORY_SETS = {
    "material": {0xD0, 0xD1, 0xD2},
    "effect": {0x61, 0x63, 0x64},
    "game": set(range(0x10, 0x16)),
    "misc": set(range(0x01, 0x0F)),
}

def category(cid: int) -> str:
    for name, values in CATEGORY_RANGES.items():
        if cid in values:
            return name
    for name, values in CATEGORY_SETS.items():
        if cid in values:
            return name
    return "other"

def load_kxread(upstream: Path):
    parser = upstream / "wasm" / "tools" / "kxread.py"
    spec = importlib.util.spec_from_file_location("krieger_kxread", parser)
    if not spec or not spec.loader:
        raise RuntimeError(f"cannot load {parser}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def deps(ops: list[dict[str, Any]], index: int) -> list[int]:
    op = ops[index]
    values = list(op.get("inputs", [])) + list(op.get("links", []))
    return [x for x in values if isinstance(x, int) and 0 <= x < len(ops)]

def closure(ops: list[dict[str, Any]], start: int) -> set[int]:
    seen: set[int] = set()
    stack = [start]
    while stack:
        index = stack.pop()
        if index in seen:
            continue
        seen.add(index)
        stack.extend(deps(ops, index))
    return seen

def histogram(ops: list[dict[str, Any]], indices) -> dict[str, int]:
    counter = collections.Counter(NAMES.get(ops[i]["cid"], hex(ops[i]["cid"])) for i in indices)
    return dict(counter.most_common())

def summarize_subgraph(ops: list[dict[str, Any]], root: int) -> dict[str, Any]:
    nodes = closure(ops, root)
    cats = collections.Counter(category(ops[i]["cid"]) for i in nodes)
    return {
        "root": root,
        "root_type": NAMES.get(ops[root]["cid"], hex(ops[root]["cid"])),
        "reachable_operators": len(nodes),
        "categories": dict(cats),
        "top_operators": list(histogram(ops, nodes).items())[:20],
    }

def analyze(kxread, path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    parsed = kxread.read(raw)
    ops = parsed["ops"]
    categories = collections.Counter(category(op["cid"]) for op in ops)
    op_counts = collections.Counter(NAMES.get(op["cid"], hex(op["cid"])) for op in ops)

    events = []
    for index, op in enumerate(ops):
        if op["cid"] != 0x12:
            continue
        mode = op["par"][0] if op.get("par") else None
        slots = []
        for slot, root in enumerate(op.get("links", [])):
            if isinstance(root, int) and 0 <= root < len(ops):
                slots.append({"slot": slot, **summarize_subgraph(ops, root)})
        events.append({"operator": index, "mode": mode, "slots": slots})

    materials = []
    for index, op in enumerate(ops):
        if op["cid"] != 0xD0:
            continue
        nodes = closure(ops, index)
        bitmaps = [i for i in nodes if category(ops[i]["cid"]) == "bitmap"]
        materials.append({
            "operator": index,
            "reachable_operators": len(nodes),
            "bitmap_operators": len(bitmaps),
            "bitmap_histogram": histogram(ops, bitmaps),
        })
    materials.sort(key=lambda x: (x["bitmap_operators"], x["reachable_operators"]), reverse=True)

    sectors = []
    for index, op in enumerate(ops):
        if op["cid"] == 0xCB:
            sectors.append(summarize_subgraph(ops, index))
    sectors.sort(key=lambda x: x["reachable_operators"], reverse=True)

    mesh_roots = []
    for index, op in enumerate(ops):
        if category(op["cid"]) != "mesh":
            continue
        nodes = closure(ops, index)
        mesh_nodes = [i for i in nodes if category(ops[i]["cid"]) == "mesh"]
        material_nodes = [i for i in nodes if ops[i]["cid"] == 0xD0]
        mesh_roots.append({
            "operator": index,
            "type": NAMES.get(op["cid"], hex(op["cid"])),
            "reachable_operators": len(nodes),
            "mesh_operators": len(mesh_nodes),
            "materials": len(material_nodes),
            "mesh_histogram": histogram(ops, mesh_nodes),
        })
    mesh_roots.sort(key=lambda x: (x["mesh_operators"], x["reachable_operators"]), reverse=True)

    ipp = [{
        "operator": i,
        "type": NAMES.get(op["cid"], hex(op["cid"])),
        "inputs": op.get("inputs", []),
        "parameters": op.get("par", []),
    } for i, op in enumerate(ops) if category(op["cid"]) == "ipp"]

    monsters = [{
        "operator": i,
        "parameters": op.get("par", []),
        "splines": op.get("spl", []),
    } for i, op in enumerate(ops) if op["cid"] == 0x11]

    return {
        "file": path.name,
        "bytes": len(raw),
        "operators": len(ops),
        "classes": len(parsed["classes"]),
        "events": len(parsed["events"]),
        "splines": len(parsed["splines"]),
        "roots": parsed["roots"],
        "category_counts": dict(categories),
        "operator_counts": dict(op_counts.most_common()),
        "krieger_event_bindings": events,
        "richest_materials": materials[:20],
        "richest_mesh_roots": mesh_roots[:20],
        "richest_sectors": sectors[:20],
        "ipp_graph": ipp,
        "monsters": monsters,
    }

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream-root", required=True, type=Path,
                        help="Path to werkkzeug3_kkrieger in MasonDye/kkrieger-wasm")
    parser.add_argument("--json", type=Path, help="Optional output JSON file")
    parser.add_argument("--files", nargs="*", default=["kkrieger_beta_conv.kx", "kkrieger3383.kx"])
    args = parser.parse_args()

    kxread = load_kxread(args.upstream_root)
    reports = [analyze(kxread, args.upstream_root / "data" / name) for name in args.files]
    payload = {
        "schema": "kkrieger-kx-audit-v1",
        "upstream_root": str(args.upstream_root),
        "reports": reports,
    }
    rendered = json.dumps(payload, indent=2, ensure_ascii=False)
    if args.json:
        args.json.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)

if __name__ == "__main__":
    main()
