from pathlib import Path
p = Path(__file__).parent / "build_animated.py"
src = p.read_text(encoding="utf-8")
def one(old, new, count=1):
    global src
    actual = src.count(old)
    if actual != count:
        raise ValueError(f"Expected {count} occurrences, found {actual}: {old[:70]!r}")
    src = src.replace(old, new)
one("import json, zipfile, hashlib, pathlib, html", "import json, zipfile, hashlib, pathlib, html\nfrom PIL import Image")
one("    from PIL import Image\n", "")
one(" def if_(self,cond,body):", """ def rounded(self, val, step):
    n=self.block('operator_divide',inputs={'NUM1':self.ref(val),'NUM2':self.ref(step)})
    self.wire(n,val)
    r=self.block('operator_round',inputs={'NUM':self.ref(self.rep(n))})
    self.blocks[n]['parent']=r
    return self.rep(r)
 def clamp(self,name,lo=0,hi=100):
    return [self.if_(self.lt(self.var(name),lo),[self.set(name,lo)]),
            self.if_(self.gt(self.var(name),hi),[self.set(name,hi)])]
 def if_(self,cond,body):""")
one("return [hat]+[s.set(k,v) for k,v in [('Ход',0),('Население',32),('Энергия',0),('Вода',0),('Еда',0),('Экология',0),('Бюджет',50),('Последствие','Мир ждёт твоего первого решения.'),('Идея',''),('Панель','intro'),('Занято',0),('ПостроеноГород',0),('ПостроеноЛес',0),('ПостроеноЭнергия',0),('ПостроеноВулкан',0)]]", "return [hat]+[s.set(k,v) for k,v in model['initial'].items()]")
a=src.index("IMPACTS={"); b=src.index("# Scratch scripts for player actions",a)
src=src[:a]+"IMPACTS=model['impacts']\nMESSAGE=model['messages']\n"+src[b:]
a=src.index("crisis=[s.hat('tick'");b=src.index("crisis += [s.emit('render')",a)
src=src[:a]+"""crisis=[s.hat('tick',12,1030),s.change('Ход',1)]
for rule in model['crises']:
  op=getattr(s,rule['op'])
  crisis.append(s.if_(op(s.var(rule['metric']),rule['threshold']),
                      [s.change(v,n) for v,n in rule['changes'].items()]))
for v in model['boundedResources']:
  crisis.extend(s.clamp(v))
"""+src[b:]
a=src.index("for i,(delta,explain) in enumerate([");b=src.index("  response=[s.change(v,n)",a)
src=src[:a]+"""for i,option in enumerate(model['genie'],start=1):
  delta=option['changes'];explain=option['message']
"""+src[b:]
one("  for v in ['Энергия','Экология','Вода','Еда','Бюджет']:response.extend([s.if_(s.lt(s.var(v),0),[s.set(v,0)]),s.if_(s.gt(s.var(v),100),[s.set(v,100)])])", "  for v in model['boundedResources']:response.extend(s.clamp(v))")
one(" s.set('Панель','idea'),s.set('Последствие','Твоя идея воплощается. Проверь показатели ресурсов.'),s.emit('panel'),s.emit('render'),s.set('Занято',0)]",
""" s.set('Панель','idea'),s.set('Последствие','Твоя идея воплощается. Проверь показатели ресурсов.'),s.emit('panel')]
response5.extend(block for v in model['boundedResources'] for block in s.clamp(v))
response5.extend([s.emit('render'),s.set('Занято',0)])""")
a=src.index("initial={'Ход':");b=src.index("\nstage['variables']",a)
src=src[:a]+"initial=dict(model['initial'])"+src[b:]
one(" global layer", " nonlocal layer")
one("def hud_svg(name,num):", "def hud_svg(name,num,label=None):")
one('>{num}</text>\'', '>{label if label is not None else num}</text>\'')
a=src.index("for idx,name in enumerate(['Население'");b=src.index("# Dialogue panel lives",a)
src=src[:a]+"""HUD_STEP=model['hudStep']
if not isinstance(HUD_STEP,int) or HUD_STEP<1 or 100%HUD_STEP:
    raise ValueError('hudStep must be a positive divisor of 100')
for idx,name in enumerate(['Население','Энергия','Вода','Еда','Экология','Бюджет']):
    h=Script()
    select=lambda: h.plus(h.rounded(h.var(name),HUD_STEP),1)
    h.link(h.hat('flag',12,12),h.show(),h.costume(select()))
    h.link(h.hat('render',12,120),h.costume(select()))
    costumes=[svg_costume(str(i),hud_svg(name,i),75,34) for i in range(0,101,HUD_STEP)]
    put('HUD '+name,costumes,h,x=-196+idx*78,y=161,size=100)
# Turn counter shows its exact value up to 100, then 100+ rather than wrapping.
h=Script()
h.link(h.hat('flag'),h.show(),h.costume(1))
h.link(h.hat('render',12,120),
       h.if_(h.lt(h.var('Ход'),101),[h.costume(h.plus(h.var('Ход'),1))]),
       h.if_(h.gt(h.var('Ход'),100),[h.costume('100+')]))
turn_costumes=[svg_costume(str(i),hud_svg('Ход',i),75,34) for i in range(101)]
turn_costumes.append(svg_costume('100+',hud_svg('Ход',100,'100+'),75,34))
put('HUD Ход',turn_costumes,h,x=190,y=123,size=100)
"""+src[b:]
head, tail=src.split("# Stage: global resources and deterministic world consequences.",1)
src=head.rstrip()+"\n\ndef main() -> None:\n    ASSETS.clear()\n    model=json.loads((P/'world_model.json').read_text(encoding='utf-8'))\n"+ "".join("    "+line if line.strip() else line for line in ("# Stage: global resources and deterministic world consequences."+tail).splitlines(keepends=True))+"\n\nif __name__ == '__main__':\n    main()\n"
p.write_text(src,encoding="utf-8")
print("PATCHED", p, "lines", len(src.splitlines()))
