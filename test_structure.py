import json,zipfile,pathlib,sys
z=zipfile.ZipFile(pathlib.Path.home()/"scratch-chain-reaction"/"chain-reaction.sb3")
p=json.loads(z.read("project.json"))
blocks=sum(len(t["blocks"]) for t in p["targets"])
broken=[]
for t in p["targets"]:
  for key,b in t["blocks"].items():
    for attr in ("next","parent"):
      val=b.get(attr)
      if val and val not in t["blocks"]:broken.append((t["name"],key,attr,val))
    for attr,data in b["inputs"].items():
      if len(data)>1 and isinstance(data[1],str) and data[1] not in t["blocks"]:broken.append((t["name"],key,attr,data[1]))
  for costume in t["costumes"]:
    if costume["md5ext"] not in z.namelist():broken.append((t["name"],"missing asset",costume["md5ext"]))
hats={}
for t in p["targets"]:
  for b in t["blocks"].values():
    if b["opcode"]=="event_whenbroadcastreceived":hats[(t["name"],b["fields"]["BROADCAST_OPTION"][0])]=1
assert all((name,evt) in hats for name,evt in [("Stage",v) for v in ["city","forest","energy","volcano"]])
assert all((name,evt) in hats for name,evt in [("Город","visual_city"),("Лес","visual_forest"),("Электростанция","visual_energy"),("Вулкан","visual_volcano"),("Новый проект","visual_project")])
assert not broken,broken[:10]
assert len(p["targets"])==11 and blocks>400
print("STRUCTURE_PASS",len(p["targets"]),"targets",blocks,"blocks",len(z.namelist())-1,"assets",len(hats),"broadcast receivers")
