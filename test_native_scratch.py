"""Verify native Scratch compatibility before site publication."""
from pathlib import Path
import json,zipfile,collections
root=Path(__file__).resolve().parent
path=root/"cinematic"/"Chain_Reaction_Cinematic_Scratch.sb3"
with zipfile.ZipFile(path) as z:
    project=json.loads(z.read("project.json"))
    targets=project["targets"]
    assert targets[0]["isStage"] is True
    assert len(targets)>=28
    names={t["name"] for t in targets}
    assert all(("Выбор "+k) in names for k in ("city","forest","energy","volcano","idea"))
    for target in targets:
        for costume in target["costumes"]:
            assert costume["md5ext"] in z.namelist(),(target["name"],costume["md5ext"])
    stage=targets[0]
    broadcasts={v for v in stage["broadcasts"].values()}
    assert set(["city","forest","energy","volcano","changed","genie_ask"]).issubset(broadcasts)
    hats={b.get("fields",{}).get("BROADCAST_OPTION",[None])[0]
          for b in stage["blocks"].values() if b["opcode"]=="event_whenbroadcastreceived"}
    assert all(x in hats for x in ("city","forest","energy","volcano"))
    state={v[0]:v[1] for v in stage["variables"].values()}
    assert state["Городов"]==state["Лесов"]==state["Станций"]==state["Вулканов"]==0
    assert len(z.namelist())>=700
    print("NATIVE_SCRATCH_PASS","targets",len(targets),"assets",len(z.namelist())-1,"size",path.stat().st_size)

