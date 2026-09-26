"""Extract editable visual sources for build_animated.py from the committed SB3.
Run from project directory: python extract_assets.py
"""
from pathlib import Path
import zipfile,json
ROOT=Path(__file__).parent; SB3=ROOT/'chain-reaction.sb3'; ART=ROOT/'assets'
ART.mkdir(exist_ok=True)
MAP={
 'Stage':['start_world.png'],
 'Мир city':['city_world.png','city_world2.png'],
 'Мир forest':['forest_world.png','forest_world2.png'],
 'Мир energy':['energy_world.png','energy_world2.png'],
 'Мир volcano':['volcano_world.png','volcano_world2.png'],
 'Река':['river_world.png'],
 'Бредущие люди':[f'walkers_{i}.png' for i in range(4)],
 'Пыль и ветер':[f'dust_{i}.png' for i in range(4)],
 'Ветряк 1':[f'rotor_{i}.png' for i in range(8)],
 'Дым и лава':[f'steam_{i}.png' for i in range(4)],
 'Диалог Джинна':[f'panel_{n}.png' for n in ['intro','city','forest','energy','volcano','idea','genie','crisis']],
 'Злой Джинн':[f'genie_{i}.png' for i in range(4)],
}
for i,n in enumerate(['Город','Лес','Энергия','Вулкан','Идея']):MAP['Выбор '+n]=[f'card_{i}.png']
with zipfile.ZipFile(SB3) as z:
 project=json.loads(z.read('project.json'))
 targets={t['name']:t for t in project['targets']}
 count=0
 for target,files in MAP.items():
  src=targets[target]['costumes']
  assert len(src)==len(files),(target,len(src),len(files))
  for c,path in zip(src,files):
   data=z.read(c['md5ext']); (ART/path).write_bytes(data);count+=1
 # Second rotor uses the same animation as first rotor.
 print('ASSETS_EXTRACTED',count,ART)
