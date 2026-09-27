"""Build a real Scratch 3 .sb3 (no TurboWarp-only extensions). Uses illustrated sprite assets.
Run: python3 asset_prep.py && python3 build_animated.py
"""
from __future__ import annotations
import json, zipfile, hashlib, pathlib, html
from PIL import Image
P=pathlib.Path(__file__).parent; ART=P/'assets'; OUT=P/'chain-reaction-animated.sb3'
ASSETS={}
def image_costume(name,path):
    path=ART/path; data=path.read_bytes(); ext=path.suffix.lstrip('.')
    md5=hashlib.md5(data).hexdigest(); fname=f'{md5}.{ext}';ASSETS[fname]=data
    with Image.open(path) as im: w,h=im.size
    return dict(assetId=md5,name=name,md5ext=fname,dataFormat=ext,bitmapResolution=1,rotationCenterX=w//2,rotationCenterY=h//2)
def svg_costume(name,body,w,h):
    raw=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'.encode()
    md5=hashlib.md5(raw).hexdigest();fn=md5+'.svg';ASSETS[fn]=raw
    return dict(assetId=md5,name=name,md5ext=fn,dataFormat='svg',rotationCenterX=w//2,rotationCenterY=h//2)
def target(name, costumes, blocks, *, x=0,y=0,size=100,stage=False,visible=True, layer=1):
    t=dict(isStage=stage,name=name,variables={},lists={},broadcasts={},blocks=blocks,comments={},currentCostume=0,costumes=costumes,sounds=[],volume=100,layerOrder=layer)
    if stage:t.update(tempo=60,videoTransparency=50,videoState='off',textToSpeechLanguage=None)
    else:t.update(visible=visible,x=x,y=y,size=size,direction=90,draggable=False,rotationStyle='don\'t rotate')
    return t
V={name:'v-'+name for name in ['Ход','Население','Энергия','Вода','Еда','Экология','Бюджет','Последствие','Идея','Панель','Занято','ПостроеноГород','ПостроеноЛес','ПостроеноЭнергия','ПостроеноВулкан']}
BROADCASTS=['city','forest','energy','volcano','idea','tick','genie','panel','visual_city','visual_forest','visual_energy','visual_volcano','reset','render']
class Script:
 def __init__(self):self.blocks={};self.n=0
 def block(self,opcode,fields=None,inputs=None,*,top=False,x=12,y=12):
    self.n+=1;k=f'b{self.n}';b={'opcode':opcode,'next':None,'parent':None,'inputs':inputs or {},'fields':fields or {},'shadow':False,'topLevel':top}
    if top:b.update(x=x,y=y)
    self.blocks[k]=b;return k
 def ref(self,val):
    if isinstance(val,tuple) and val[0]=='block':return [2,val[1]]
    if isinstance(val,tuple) and val[0]=='var':return [3,[12,val[1],V[val[1]]],[10,'0']]
    if isinstance(val,(int,float)):return [1,[4,str(val)]]
    return [1,[10,str(val)]]
 def rep(self,id):return ('block',id)
 def var(self,name):return ('var',name)
 def hat(self,name='flag',x=12,y=12):
    if name=='flag':return self.block('event_whenflagclicked',top=True,x=x,y=y)
    if name=='click':return self.block('event_whenthisspriteclicked',top=True,x=x,y=y)
    return self.block('event_whenbroadcastreceived',fields={'BROADCAST_OPTION':[name,name]},top=True,x=x,y=y)
 def link(self,*ids):
    ids=[x for x in ids if x]
    for a,b in zip(ids,ids[1:]):
      self.blocks[a]['next']=b;self.blocks[b]['parent']=a
    return ids[0] if ids else None
 def wire(self,container,child):
    if isinstance(child,tuple) and child[0]=='block':self.blocks[child[1]]['parent']=container
 def set(self,name,val):
    n=self.block('data_setvariableto',fields={'VARIABLE':[name,V[name]]},inputs={'VALUE':self.ref(val)});self.wire(n,val);return n
 def change(self,name,val):return self.block('data_changevariableby',fields={'VARIABLE':[name,V[name]]},inputs={'VALUE':self.ref(val)})
 def emit(self,name,wait=False):return self.block('event_broadcastandwait' if wait else 'event_broadcast',inputs={'BROADCAST_INPUT':[1,[11,name,name]]})
 def wait(self,secs):return self.block('control_wait',inputs={'DURATION':self.ref(secs)})
 def show(self):return self.block('looks_show')
 def hide(self):return self.block('looks_hide')
 def next(self):return self.block('looks_nextcostume')
 def costume(self,name):
    n=self.block('looks_switchcostumeto',inputs={'COSTUME':self.ref(name)});self.wire(n,name);return n
 def size(self,n):return self.block('looks_setsizeto',inputs={'SIZE':self.ref(n)})
 def change_size(self,n):return self.block('looks_changesizeby',inputs={'CHANGE':self.ref(n)})
 def goto(self,x,y):return self.block('motion_gotoxy',inputs={'X':self.ref(x),'Y':self.ref(y)})
 def move(self,n):return self.block('motion_movesteps',inputs={'STEPS':self.ref(n)})
 def say(self,message,seconds=3):
    n=self.block('looks_sayforsecs',inputs={'MESSAGE':self.ref(message),'SECS':self.ref(seconds)});self.wire(n,message);return n
 def ask(self,msg):return self.block('sensing_askandwait',inputs={'QUESTION':self.ref(msg)})
 def answer(self):return self.rep(self.block('sensing_answer'))
 def eq(self,a,b):
    n=self.block('operator_equals',inputs={'OPERAND1':self.ref(a),'OPERAND2':self.ref(b)});self.wire(n,a);self.wire(n,b);return self.rep(n)
 def lt(self,a,b):
    n=self.block('operator_lt',inputs={'OPERAND1':self.ref(a),'OPERAND2':self.ref(b)});self.wire(n,a);self.wire(n,b);return self.rep(n)
 def gt(self,a,b):
    n=self.block('operator_gt',inputs={'OPERAND1':self.ref(a),'OPERAND2':self.ref(b)});self.wire(n,a);self.wire(n,b);return self.rep(n)
 def contains(self,text,sub):
    n=self.block('operator_contains',inputs={'STRING1':self.ref(text),'STRING2':self.ref(sub)});self.wire(n,text);self.wire(n,sub);return self.rep(n)
 def OR(self,a,b):
    n=self.block('operator_or',inputs={'OPERAND1':self.ref(a),'OPERAND2':self.ref(b)});self.wire(n,a);self.wire(n,b);return self.rep(n)
 def plus(self,a,b):
    n=self.block('operator_add',inputs={'NUM1':self.ref(a),'NUM2':self.ref(b)});self.wire(n,a);self.wire(n,b);return self.rep(n)
 def rounded(self, val, step):
    n=self.block('operator_divide',inputs={'NUM1':self.ref(val),'NUM2':self.ref(step)})
    self.wire(n,val)
    r=self.block('operator_round',inputs={'NUM':self.ref(self.rep(n))})
    self.blocks[n]['parent']=r
    return self.rep(r)
 def clamp(self,name,lo=0,hi=100):
    return [self.if_(self.lt(self.var(name),lo),[self.set(name,lo)]),
            self.if_(self.gt(self.var(name),hi),[self.set(name,hi)])]
 def if_(self,cond,body):
    first=self.link(*body)
    n=self.block('control_if',inputs={'CONDITION':self.ref(cond),'SUBSTACK':[2,first]});self.wire(n,cond);self.blocks[first]['parent']=n;return n
 def forever(self,body):
    first=self.link(*body);n=self.block('control_forever',inputs={'SUBSTACK':[2,first]});self.blocks[first]['parent']=n;return n
 def repeat(self,n,body):
    first=self.link(*body);block=self.block('control_repeat',inputs={'TIMES':self.ref(n),'SUBSTACK':[2,first]});self.blocks[first]['parent']=block;return block

def main() -> None:
    ASSETS.clear()
    model=json.loads((P/'world_model.json').read_text(encoding='utf-8'))
    # Stage: global resources and deterministic world consequences.
    s=Script()
    def reset_script(hat):
     return [hat]+[s.set(k,v) for k,v in model['initial'].items()]+[s.emit('panel'),s.emit('render')]
    s.link(*reset_script(s.hat('flag',12,12)));s.link(*reset_script(s.hat('reset',12,340)))
    IMPACTS=model['impacts']
    MESSAGE=model['messages']
    # Scratch scripts for player actions: changes -> appearance -> deterministic simulation -> Genie.
    for i,(kind,changes) in enumerate(IMPACTS.items()):
       body=[s.hat(kind,10+230*i,500),s.if_(s.eq(s.var('Занято'),0),[s.set('Занято',1)]+[s.change(k,v) for k,v in changes.items()]+[s.set('Построено'+{'city':'Город','forest':'Лес','energy':'Энергия','volcano':'Вулкан'}[kind],1),s.set('Панель',kind),s.set('Последствие',MESSAGE[kind]),s.emit('visual_'+kind),s.emit('panel'),s.wait(.45),s.emit('tick')])]
       s.link(*body)
    # Optional free-text action button prompts, always accepts new idea. Generic action has budget cost, not AI.
    custom=[s.hat('idea',10,755),s.if_(s.eq(s.var('Занято'),0),[s.set('Занято',1),s.ask('Твой проект: город, лес, солнечная энергия, вулкан или любая идея'),s.set('Идея',s.answer()),s.change('Бюджет',-8),s.change('Экология',3),s.set('Панель','idea'),s.set('Последствие','Твой проект начал менять мир: -8 бюджет, +3 экология.'),
     s.if_(s.OR(s.contains(s.var('Идея'),'лес'),s.contains(s.var('Идея'),'дерев')),[s.change('Экология',10),s.change('Вода',9),s.set('ПостроеноЛес',1),s.emit('visual_forest'),s.set('Последствие','Идея: лес +10 экология, +9 вода.')]),
     s.if_(s.OR(s.contains(s.var('Идея'),'город'),s.contains(s.var('Идея'),'дом')),[s.change('Население',9),s.change('Вода',-5),s.set('ПостроеноГород',1),s.emit('visual_city'),s.set('Последствие','Идея: новый город +9 жителей, -5 вода.')]),
     s.if_(s.OR(s.contains(s.var('Идея'),'солн'),s.contains(s.var('Идея'),'энерг')),[s.change('Энергия',24),s.change('Бюджет',-6),s.set('ПостроеноЭнергия',1),s.emit('visual_energy'),s.set('Последствие','Идея: солнечная энергия +24, бюджет -6.')]),
     s.if_(s.OR(s.contains(s.var('Идея'),'вулкан'),s.contains(s.var('Идея'),'геотерм')),[s.change('Энергия',18),s.change('Экология',-12),s.set('ПостроеноВулкан',1),s.emit('visual_volcano'),s.set('Последствие','Идея: геотермия +18 энергия, -12 экология.')]),
     s.emit('panel'),s.wait(.3),s.emit('tick')])]
    s.link(*custom)
    # Deterministic secondary ecological and infrastructure crises. No game-over.
    crisis=[s.hat('tick',12,1030),s.change('Ход',1)]
    for rule in model['crises']:
      op=getattr(s,rule['op'])
      crisis.append(s.if_(op(s.var(rule['metric']),rule['threshold']),
                          [s.change(v,n) for v,n in rule['changes'].items()]))
    for v in model['boundedResources']:
      crisis.extend(s.clamp(v))
    crisis += [s.emit('render'),s.emit('genie')];s.link(*crisis)
    # Response to genie: four predefined trade-offs + fifth free text. Keeps a real causal loop.
    for i,option in enumerate(model['genie'],start=1):
      delta=option['changes'];explain=option['message']
      response=[s.change(v,n) for v,n in delta.items()]+[s.set('Панель','crisis'),s.set('Последствие',explain),s.emit('panel')]
      for v in model['boundedResources']:response.extend(s.clamp(v))
      response.extend([s.emit('render'),s.set('Занято',0)])
      # answer to sensing_askandwait is read on this script thread
      if i==1:genie=[s.hat('genie',12,1450),s.set('Панель','genie'),s.emit('panel'),s.wait(1),s.ask('Злой Джинн: 1 сжечь лес / 2 мегазавод / 3 импорт / 4 компромисс / 5 своя идея. Введи 1-5')]
      genie.append(s.if_(s.eq(s.answer(),str(i)),response))
    # Branch 5 opens a free-text response; all nonmatching choices simply re-enable build buttons.
    response5=[s.ask('Свой вариант: опиши действие (лес, город, энергия, вулкан)'),s.set('Идея',s.answer()),s.change('Бюджет',-5),
     s.if_(s.contains(s.var('Идея'),'лес'),[s.change('Экология',9),s.change('Вода',7),s.set('ПостроеноЛес',1),s.emit('visual_forest')]),
     s.if_(s.contains(s.var('Идея'),'город'),[s.change('Население',6),s.change('Вода',-4),s.set('ПостроеноГород',1),s.emit('visual_city')]),
     s.if_(s.OR(s.contains(s.var('Идея'),'энерг'),s.contains(s.var('Идея'),'солн')),[s.change('Энергия',16),s.set('ПостроеноЭнергия',1),s.emit('visual_energy')]),
     s.if_(s.contains(s.var('Идея'),'вулкан'),[s.change('Энергия',15),s.change('Экология',-11),s.set('ПостроеноВулкан',1),s.emit('visual_volcano')]),
     s.set('Панель','idea'),s.set('Последствие','Твоя идея воплощается. Проверь показатели ресурсов.'),s.emit('panel')]
    response5.extend(block for v in model['boundedResources'] for block in s.clamp(v))
    response5.extend([s.emit('render'),s.set('Занято',0)])
    genie.extend([s.if_(s.eq(s.answer(),'5'),response5),s.set('Занято',0)]);s.link(*genie)
    stage=target('Stage',[image_costume('Пустошь','start_world.png')],s.blocks,stage=True,layer=0)
    initial=dict(model['initial'])
    stage['variables']={V[k]:[k,val] for k,val in initial.items()}
    stage['broadcasts']={evt:evt for evt in BROADCASTS}
    targets=[stage];layer=0
    def put(name,cs,b,x=0,y=0,size=100,visible=True):
     nonlocal layer
     layer+=1;t=target(name,cs,b.blocks,x=x,y=y,size=size,visible=visible,layer=layer);targets.append(t);return t
    # World sector images fade into the barren world, interleaving and animating subtle lights.
    for kind,(x,y,scale) in {'city':(-125,-8,105),'forest':(-16,22,111),'energy':(70,-50,103),'volcano':(142,41,93)}.items():
     b=Script();b.link(b.hat('flag'),b.hide())
     appear=[b.hat('visual_'+kind,10,140),b.show(),b.size(5),b.repeat(10,[b.change_size(scale/10),b.wait(.035)])]
     b.link(*appear)
     b.link(b.hat('reset',10,280),b.hide())
     b.link(b.hat('flag',12,460),b.forever([b.next(),b.wait(.42)]))
     put('Мир '+kind,[image_costume('Свет 1',kind+'_world.png'),image_costume('Свет 2',kind+'_world2.png')],b,x,y,scale,False)
    # Waterfall and connected river appears with forest even if river cannot be built directly.
    w=Script();w.link(w.hat('flag'),w.hide());w.link(w.hat('visual_forest',12,100),w.show());w.link(w.hat('reset',12,200),w.hide())
    w.link(w.hat('flag',12,300),w.forever([w.move(2),w.wait(.25),w.move(-2),w.wait(.25)]))
    put('Река',[image_costume('Река','river_world.png')],w,x=35,y=-65,size=88,visible=False)
    # Walking survivors remain alive as buildings appear; walking costume cycle and scene traversal.
    w=Script();w.link(w.hat('flag',12,12),w.show(),w.goto(-195,21),w.size(40))
    w.link(w.hat('reset',12,85),w.goto(-195,21))
    w.link(w.hat('flag',12,120),w.forever([w.next(),w.move(3),w.if_(w.gt(w.rep(w.block('motion_xposition')),255),[w.goto(-265,20)]),w.wait(.23)]))
    put('Бредущие люди',[image_costume('Шаг '+str(i),f'walkers_{i}.png') for i in range(4)],w,x=-195,y=21,size=40)
    # Ambient dust: only on wasteland region, four real transparent frames.
    d=Script();d.link(d.hat('flag',12,12),d.show());d.link(d.hat('flag',12,100),d.forever([d.next(),d.wait(.38)]))
    put('Пыль и ветер',[image_costume('Пыль '+str(i),f'dust_{i}.png') for i in range(4)],d,x=0,y=0,size=100)
    # Rotor contains 8 distinct blade angles.
    for rotor_id,(rx,ry,sc) in enumerate([(94,0,57),(131,-25,42)],1):
     r=Script();r.link(r.hat('flag',12,12),r.hide());r.link(r.hat('visual_energy',12,110),r.show());r.link(r.hat('reset',12,190),r.hide())
     r.link(r.hat('flag',12,280),r.forever([r.next(),r.wait(.12)]))
     put('Ветряк '+str(rotor_id),[image_costume('Поворот '+str(i),f'rotor_{i}.png') for i in range(8)],r,x=rx,y=ry,size=sc,visible=False)
    # Four actual smoke/embers frames, only after volcanic action; no volcano on start.
    f=Script();f.link(f.hat('flag',12,12),f.hide());f.link(f.hat('visual_volcano',12,110),f.show());f.link(f.hat('reset',12,200),f.hide())
    f.link(f.hat('flag',12,300),f.forever([f.next(),f.wait(.25)]))
    put('Дым и лава',[image_costume('Дым '+str(i),f'steam_{i}.png') for i in range(4)],f,x=149,y=89,size=87,visible=False)
    # HUD drawn as 101 real Scratch SVG costumes per resource. Native scripts switch costume on 'render'.
    COLORS={'Население':'#7cc5ff','Энергия':'#ffcb67','Вода':'#71b8ff','Еда':'#81e69b','Экология':'#8fef9d','Бюджет':'#ffce6a','Ход':'#f2b86a'}
    ICONS={'Население':'♟','Энергия':'ϟ','Вода':'◆','Еда':'❦','Экология':'♣','Бюджет':'●','Ход':'◴'}
    def hud_svg(name,num,label=None):
        color=COLORS[name];p=min(100,max(0,num));width=51*p/100
        # escaped XML: hidden Unicode symbol font renders in Scratch SVG canvas.
        return f'<rect x="1" y="1" width="73" height="32" rx="7" fill="#111e2c" stroke="#697989" stroke-width="1"/><text x="7" y="13" font-family="Arial, sans-serif" font-size="8" fill="#fff6e0">{html.escape(name)}</text><rect x="17" y="17" width="52" height="13" rx="4" fill="#304354"/><rect x="17" y="17" width="{width:.1f}" height="13" rx="4" fill="{color}" opacity=".74"/><text x="45" y="27" font-size="11" fill="#ffffff" text-anchor="middle" font-weight="bold" font-family="Arial, sans-serif">{label if label is not None else num}</text>'
    HUD_STEP=model['hudStep']
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
    # Dialogue panel lives under Genie so the character clearly POPS OUT of the frame.
    p=Script();p.link(p.hat('flag'),p.show(),p.costume('intro'))
    p.link(p.hat('panel',12,130),p.costume(p.var('Панель')))
    put('Диалог Джинна',[image_costume(n,'panel_'+n+'.png') for n in ['intro','city','forest','energy','volcano','idea','genie','crisis']],p,x=19,y=-49)
    # Five baked art-backed cards have their own real Scratch click event.
    for i,(label,action) in enumerate([('Город','city'),('Лес','forest'),('Энергия','energy'),('Вулкан','volcano'),('Идея','idea')]):
        c=Script();c.link(c.hat('flag'),c.show(),c.size(100))
        c.link(c.hat('click',12,110),c.if_(c.eq(c.var('Занято'),0),[c.emit(action)]))
        # Subtle continuous pulse; explicit costume/size animation for interactive cards.
        c.link(c.hat('flag',12,210),c.forever([c.size(100),c.wait(.7+i*.09),c.size(104),c.wait(.26)]))
        put('Выбор '+label,[image_costume(label,f'card_{i}.png')],c,x=-192+i*96,y=-147)
    # Help button and restart are functional Scratch sprites (no inert icons).
    q=Script();q.link(q.hat('flag'),q.show());q.link(q.hat('click',12,110),q.say('Выбирай карточки. После каждого действия Джинн предложит 5 вариантов. Строй бесконечно!',5))
    help_svg='<rect x="1" y="1" width="24" height="22" rx="7" fill="#203247" stroke="#f4dfaf"/><text x="13" y="19" fill="white" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold">?</text>'
    put('Помощь',[svg_costume('Помощь',help_svg,26,24)],q,x=173,y=86)
    restart=Script();restart.link(restart.hat('flag'),restart.show());restart.link(restart.hat('click',12,110),restart.emit('reset'))
    restart_svg='<rect x="1" y="1" width="25" height="22" rx="6" fill="#203247" stroke="#f4dfaf"/><text x="13" y="17" fill="white" text-anchor="middle" font-family="Arial" font-size="15">↻</text>'
    put('Начать заново',[svg_costume('Сброс',restart_svg,27,24)],restart,x=205,y=86)
    # Genie upper body + purple smoke 4 real source-created frames; overhangs the panel boundaries.
    g=Script();g.link(g.hat('flag'),g.show(),g.size(100));g.link(g.hat('flag',12,120),g.forever([g.next(),g.wait(.3)]))
    put('Злой Джинн',[image_costume('Джинн '+str(i),f'genie_{i}.png') for i in range(4)],g,x=-177,y=-78,size=95)
    # Keep genie above his dialogue but below the choice cards, so his outstretched
    # hand cannot intercept taps on the first card. Scratch uses drawable order.
    genie=targets.pop()
    panel_i=next(i for i,t in enumerate(targets) if t['name']=='Диалог Джинна')
    targets.insert(panel_i+1,genie)
    for order,t in enumerate(targets):t['layerOrder']=order
    monitors=[]
    project={'targets':targets,'monitors':monitors,'extensions':[],'meta':{'semver':'3.0.0','vm':'11.3.0','agent':'World Server · animated Scratch native sb3'}}
    with zipfile.ZipFile(OUT,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=8) as z:
     payloads={'project.json':json.dumps(project,ensure_ascii=False,separators=(',',':')).encode('utf-8'),**ASSETS}
     for fn,blob in sorted(payloads.items()):
      entry=zipfile.ZipInfo(fn,date_time=(1980,1,1,0,0,0))
      z.writestr(entry,blob,compress_type=zipfile.ZIP_DEFLATED,compresslevel=8)
    print('OUTPUT',OUT,'bytes',OUT.stat().st_size,'targets',len(targets),'blocks',sum(len(t['blocks']) for t in targets),'costumes',sum(len(t['costumes']) for t in targets),'unique_assets',len(ASSETS))

if __name__ == '__main__':
    main()
