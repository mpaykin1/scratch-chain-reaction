"""Golden Scratch model, generated-block parity and archive integrity gates."""
from __future__ import annotations
import importlib
import json
import random
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
MODEL = json.loads((ROOT / "world_model.json").read_text(encoding="utf-8"))
RESOURCES = MODEL["boundedResources"]


def step(state, kind):
    """Small, intentionally independent oracle for a player build + one tick."""
    state = dict(state)
    state["Ход"] += 1
    for metric, delta in MODEL["impacts"][kind].items():
        state[metric] += delta
    for rule in MODEL["crises"]:
        value = state[rule["metric"]]
        matched = value < rule["threshold"] if rule["op"] == "lt" else value > rule["threshold"]
        if matched:
            for metric, delta in rule["changes"].items():
                state[metric] += delta
    for metric in RESOURCES:
        state[metric] = max(0, min(100, state[metric]))
    return state


def actions_from_blocks(project, kind):
    stage = next(t for t in project["targets"] if t["isStage"])
    blocks = stage["blocks"]
    hats = [b for b in blocks.values()
            if b["opcode"] == "event_whenbroadcastreceived" and
            b["fields"]["BROADCAST_OPTION"][0] == kind]
    if len(hats) != 1:
        raise AssertionError(f"{kind}: expected one Scratch event hat, got {len(hats)}")
    conditional = blocks[hats[0]["next"]]
    first = conditional["inputs"]["SUBSTACK"][1]
    effects = {}
    node_id = first
    while node_id:
        node = blocks[node_id]
        if node["opcode"] == "data_changevariableby":
            metric = node["fields"]["VARIABLE"][0]
            value = node["inputs"]["VALUE"][1][1]
            effects[metric] = float(value)
        node_id = node["next"]
    return effects


class WorldModelTest(unittest.TestCase):
    def test_schema_and_bounded_resources(self):
        self.assertEqual(len(MODEL["genie"]), 4)
        self.assertEqual([x["id"] for x in MODEL["genie"]], list("1234"))
        self.assertEqual(MODEL["hudStep"], 10)
        self.assertEqual(100 % MODEL["hudStep"], 0)
        self.assertEqual(set(MODEL["impacts"]), {"city", "forest", "energy", "volcano"})
        for rule in MODEL["crises"]:
            self.assertIn(rule["metric"], RESOURCES)
            self.assertIn(rule["op"], ("lt", "gt"))
            self.assertGreater(len(rule["changes"]), 0)
        for group in [*MODEL["impacts"].values(), *(x["changes"] for x in MODEL["genie"])]:
            self.assertTrue(set(group) <= set(RESOURCES))

    def test_import_is_inert(self):
        import build_animated
        self.assertFalse(build_animated.ASSETS)
        source = ROOT / "chain-reaction-animated.sb3"
        before = source.stat().st_mtime_ns
        importlib.reload(build_animated)
        self.assertEqual(source.stat().st_mtime_ns, before)
        self.assertFalse(build_animated.ASSETS)

    def test_generated_native_hud_and_model_match(self):
        with ZipFile(ROOT / "chain-reaction-animated.sb3") as archive:
            self.assertIsNone(archive.testzip())
            project = json.loads(archive.read("project.json"))
            for kind, impact in MODEL["impacts"].items():
                self.assertEqual(actions_from_blocks(project, kind),
                                 {key: float(value) for key, value in impact.items()})
            byname = {t["name"]: t for t in project["targets"]}
            for resource in RESOURCES:
                self.assertEqual(len(byname["HUD " + resource]["costumes"]), 11)
            self.assertEqual(len(byname["HUD Ход"]["costumes"]), 102)
            self.assertEqual(byname["HUD Ход"]["costumes"][-1]["name"], "100+")
            self.assertEqual(len(project["targets"]), 27)
            for target in project["targets"]:
                for costume in target["costumes"]:
                    self.assertIn(costume["md5ext"], archive.namelist())

    def test_one_turn_golden_and_no_degenerate_forest(self):
        outcome = step(MODEL["initial"], "city")
        self.assertEqual({k: outcome[k] for k in RESOURCES},
                         {"Население": 39, "Энергия": 0, "Вода": 0,
                          "Еда": 0, "Экология": 0, "Бюджет": 27})
        state = MODEL["initial"]
        for _ in range(25):
            state = step(state, "forest")
        self.assertEqual(state["Энергия"], 0)
        self.assertEqual(state["Бюджет"], 0)
        self.assertLess(state["Население"], MODEL["initial"]["Население"])

    def test_seeded_random_sequences_are_deterministic_and_bounded(self):
        for seed in range(100):
            sequence = random.Random(seed).choices(list(MODEL["impacts"]), k=60)
            def play():
                state = MODEL["initial"]
                for action in sequence:
                    state = step(state, action)
                    self.assertTrue(all(0 <= state[name] <= 100 for name in RESOURCES))
                return state
            self.assertEqual(play(), play())
        self.assertNotEqual(step(MODEL["initial"], "forest"),
                            step(MODEL["initial"], "volcano"))

    def test_zip_verification_raises_even_in_optimized_python(self):
        from scripts.build_portrait_sb3 import verify_zip
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "invalid.sb3"
            with ZipFile(target, "w") as archive:
                archive.writestr("project.json", json.dumps({"targets": []}))
            with self.assertRaises(ValueError):
                verify_zip(target, 27, "missing.png")


if __name__ == "__main__":
    unittest.main()
