import json,zipfile,os,collections,re
import pathlib
p=str(pathlib.Path(__file__).with_name('chain-reaction-animated.sb3'))
with zipfile.ZipFile(p) as z:
 project=json.loads(z.read('project.json'))
 targets=project['targets']; stage=targets[0];names=[t['name'] for t in targets]
 assert stage['name']=='Stage' and stage['isStage'] and len(targets)>20
 assert len(names)==len(set(names))
 assets=set(z.namelist());missing=[];broken=[];cycles=[]
 for t in targets:
  blocks=t['blocks']
  for costume in t['costumes']:
   if costume['md5ext'] not in assets: missing.append(costume['md5ext'])
   assert costume['rotationCenterX']>=0 and costume['rotationCenterY']>=0
  for bid,b in blocks.items():
   for key in ('next','parent'):
    link=b.get(key)
    if link and link not in blocks:broken.append((t['name'],bid,key,link))
   for attr,val in b['inputs'].items():
    if isinstance(val,list) and len(val)>1 and isinstance(val[1],str) and val[1] not in blocks:broken.append((t['name'],bid,attr,val[1]))
   if b['topLevel']:
    assert b['parent']==None,(t['name'],bid)
    assert b['opcode'].startswith('event_'),(t['name'],bid,b['opcode'])
  for bid,b in blocks.items():
   seen=set();x=bid
   while x:
    if x in seen:cycles.append((t['name'],bid,x));break
    seen.add(x);x=blocks[x]['next']
 assert not missing and not broken and not cycles,(missing,broken[:15],cycles[:15])
 buttons=[t for t in targets if t['name'].startswith('Выбор ')];assert len(buttons)==5
 for btn in buttons:
  assert any(b['opcode']=='event_whenthisspriteclicked' for b in btn['blocks'].values())
 genie=next(t for t in targets if t['name']=='Злой Джинн')
 walkers=next(t for t in targets if t['name']=='Бредущие люди')
 assert len(genie['costumes'])==4 and len(walkers['costumes'])==4
 assert all(any(t['name']==n and len(t['costumes'])==2 for t in targets) for n in ['Мир city','Мир forest','Мир energy','Мир volcano'])
 assert next(t for t in targets if t['name']=='Мир volcano')['visible'] is False
 assert next(t for t in targets if t['name']=='Дым и лава')['visible'] is False
 assert all(any(b['opcode']=='control_forever' for b in t['blocks'].values()) for t in [walkers,genie])
 all_events=collections.Counter(b['fields']['BROADCAST_OPTION'][0] for t in targets for b in t['blocks'].values() if b['opcode']=='event_whenbroadcastreceived')
 for n in ['city','forest','energy','volcano','idea','tick','genie','panel','visual_city','visual_forest','visual_energy','visual_volcano','reset','render']:
  if n not in all_events and n!='render':missing.append('listener_'+n)
 assert not missing,missing
 default=stage['variables'];assert {k:v[1] for k,v in default.items() if k in ['v-Энергия','v-Вода','v-Экология']}=={'v-Энергия':0,'v-Вода':0,'v-Экология':0}
 counts=collections.Counter(b['opcode'] for t in targets for b in t['blocks'].values())
 print('STATIC_PASS targets='+str(len(targets))+' blocks='+str(sum(counts.values()))+' costumes='+str(sum(len(t['costumes']) for t in targets))+' assets='+str(len(assets)-1))
 print('EVENTS_PASS '+str(dict(all_events)))
 print('START_PASS no volcano; five clickable choice cards; four-frame genie and walkers')
 print('ANIMATION_PASS '+str({n:len(next(t['costumes'] for t in targets if t['name']==n)) for n in ['Злой Джинн','Бредущие люди','Дым и лава','Ветряк 1','Пыль и ветер']}))
 assert 1_000_000<os.path.getsize(p)<15_000_000
 print('BUNDLE_PASS '+str(os.path.getsize(p))+' bytes zip valid and assets included')
