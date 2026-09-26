import json, zipfile, hashlib, pathlib
from xml.sax.saxutils import escape

ROOT = pathlib.Path.home() / "scratch-chain-reaction"
ROOT.mkdir(exist_ok=True)
out = ROOT / "chain-reaction.sb3"
assets = {}
def svg(name, markup, w, h):
    data = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{markup}</svg>'.encode()
    md = hashlib.md5(data).hexdigest()
    assets[md+".svg"] = data
    return {"assetId":md,"name":name,"md5ext":md+".svg","dataFormat":"svg","rotationCenterX":w//2,"rotationCenterY":h//2}
scene = """<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#122b51"/><stop offset="1" stop-color="#7aaed5"/></linearGradient><linearGradient id="land" x2="0" y2="1"><stop stop-color="#65b98c"/><stop offset="1" stop-color="#295a51"/></linearGradient></defs>
<rect width="480" height="360" fill="url(#sky)"/><circle cx="410" cy="44" r="27" fill="#ffe8a8" opacity=".9"/>
<path d="M0 164 L66 98 110 145 179 85 245 155 326 96 405 146 480 91V270H0Z" fill="#294967"/>
<path d="M0 181L68 119 111 157 180 110 245 180 326 123 405 163 480 114V260H0Z" fill="#4c7e80"/>
<path d="M0 196Q140 171 242 197T480 178V305H0Z" fill="url(#land)"/>
<path d="M-20 242Q112 198 212 234T510 211V320H0Z" fill="#396d57"/>
<path d="M-12 226Q100 197 206 229T488 211" fill="none" stroke="#b7e8ee" stroke-width="25" opacity=".87"/>
<path d="M-12 226Q100 197 206 229T488 211" fill="none" stroke="#e1fbff" stroke-width="5" opacity=".68"/>
<path d="M-10 282L240 198 497 279" fill="none" stroke="#d3c29d" stroke-width="9" stroke-dasharray="8 5" opacity=".7"/>
<rect x="10" y="9" width="279" height="50" rx="11" fill="#12263c" opacity=".85"/>
<text x="21" y="29" fill="#ffdc91" font-family="Arial,sans-serif" font-size="16" font-weight="bold">ЦЕПНАЯ РЕАКЦИЯ</text>
<text x="21" y="45" fill="#cbecf0" font-family="Arial,sans-serif" font-size="10">Каждое решение меняет живой мир</text>
<rect x="0" y="302" width="480" height="58" fill="#102333" opacity=".93"/>
<rect x="0" y="258" width="480" height="28" fill="#102333" opacity=".84"/><text x="240" y="276" font-family="Arial" text-anchor="middle" font-size="10" fill="#d3edeb">Нажми на объект, чтобы построить • ответь Джинну 1–5</text>
<path d="M0 302H480" stroke="#f7cb83" opacity=".65"/>"""
button_style = '<rect x="2" y="2" width="92" height="46" rx="12" fill="#142e42" stroke="#fbd48d" stroke-width="2"/><rect x="5" y="5" width="86" height="40" rx="9" fill="#214757"/>'
buttons = [
("Город","city", -164, '<rect x="21" y="15" width="18" height="19" fill="#ffe3aa"/><rect x="40" y="8" width="19" height="26" fill="#eac38a"/><rect x="61" y="18" width="14" height="16" fill="#f5d29d"/><g fill="#426a7a"><rect x="25" y="19" width="4" height="4"/><rect x="32" y="19" width="4" height="4"/><rect x="44" y="13" width="4" height="4"/><rect x="52" y="13" width="4" height="4"/><rect x="44" y="21" width="4" height="4"/><rect x="52" y="21" width="4" height="4"/></g>'),
("Лес","forest", -55, '<path d="M47 9L27 34H68Z" fill="#7adc96"/><path d="M27 23L16 36H40Z" fill="#4bbd83"/><path d="M66 19L54 36H83Z" fill="#46ad7e"/><rect x="44" y="32" width="5" height="7" fill="#e8bd88"/>'),
("Энергия","energy", 55, '<circle cx="48" cy="22" r="11" fill="#ffcf65"/><path d="M50 9L39 23H47L44 37 59 19H50Z" fill="#fff7cc"/><path d="M18 36L33 19M74 36L62 19" stroke="#88dcdd" stroke-width="4"/>'),
("Вулкан","volcano",164, '<path d="M15 38L37 14 47 22 57 12 80 38Z" fill="#9c8b7a"/><path d="M39 15L47 23 56 13 61 20 51 31 45 28Z" fill="#ff9568"/><path d="M49 11Q42 4 47 0M55 11Q66 5 61 0" stroke="#f7bd9a" stroke-width="3" fill="none"/>')
]
def make_target(name, costumes, blocks, x=0,y=0, size=100, stage=False, visible=True):
    base = {"isStage":stage,"name":name,"variables":{},"lists":{},"broadcasts":{},"blocks":blocks,"comments":{},
            "currentCostume":0,"costumes":costumes,"sounds":[],"volume":100,"layerOrder":0}
    if stage: base.update({"tempo":60,"videoTransparency":50,"videoState":"on","textToSpeechLanguage":None})
    else: base.update({"visible":visible,"x":x,"y":y,"size":size,"direction":90,"draggable":False,"rotationStyle":"don't rotate"})
    return base
class Blocks:
    def __init__(self): self.blocks={}; self.n=0
    def add(self,op,fields=None,inputs=None,top=False,x=10,y=10,shadow=False):
        self.n+=1; k=f"b{self.n}"
        b={"opcode":op,"next":None,"parent":None,"inputs":inputs or {},"fields":fields or {},"shadow":shadow,"topLevel":top}
        if top: b.update({"x":x,"y":y})
        self.blocks[k]=b
        return k
    def link(self,*ids):
        for a,b in zip(ids,ids[1:]): self.blocks[a]["next"]=b;self.blocks[b]["parent"]=a
    def hat(self,event,x,y):
        if event=="flag": return self.add("event_whenflagclicked",top=True,x=x,y=y)
        return self.add("event_whenbroadcastreceived",fields={"BROADCAST_OPTION":[event,event]},top=True,x=x,y=y)
    def inp(self,num):return [1,[4,str(num)]]
    def txt(self,msg):return [1,[10,str(msg)]]
    def variable(self,var):return [3,[12,var,var],[10,"0"]]
    def set(self,var,val):return self.add("data_setvariableto",fields={"VARIABLE":[var,var]},inputs={"VALUE":self.txt(val) if isinstance(val,str) else self.inp(val)})
    def change(self,var,num):return self.add("data_changevariableby",fields={"VARIABLE":[var,var]},inputs={"VALUE":self.inp(num)})
    def emit(self,name):return self.add("event_broadcast",inputs={"BROADCAST_INPUT":[1,[11,name,name]]})
    def say(self,msg,secs=3):return self.add("looks_sayforsecs",inputs={"MESSAGE":self.txt(msg),"SECS":self.inp(secs)})
    def show(self):return self.add("looks_show")
    def hide(self):return self.add("looks_hide")
    def wait(self,s):return self.add("control_wait",inputs={"DURATION":self.inp(s)})
    def gt(self,var,amount,less=False):
        r=self.add("operator_lt" if less else "operator_gt",inputs={"OPERAND1":self.variable(var),"OPERAND2":self.inp(amount)})
        return r
    def ifvar(self,var,threshold,body,less=True):
        c=self.gt(var,threshold,less)
        i=self.add("control_if",inputs={"CONDITION":[2,c],"SUBSTACK":[2,body[0]]})
        self.blocks[c]["parent"]=i;self.blocks[body[0]]["parent"]=i;self.link(*body)
        return i
    def eqanswer(self,val,body):
        a=self.add("sensing_answer")
        c=self.add("operator_equals",inputs={"OPERAND1":[2,a],"OPERAND2":self.txt(val)})
        self.blocks[a]["parent"]=c
        i=self.add("control_if",inputs={"CONDITION":[2,c],"SUBSTACK":[2,body[0]]})
        self.blocks[c]["parent"]=i;self.blocks[body[0]]["parent"]=i;self.link(*body)
        return i
    def ask(self,msg):return self.add("sensing_askandwait",inputs={"QUESTION":self.txt(msg)})

backdrop=svg("Живой мир",scene,480,360)
S=Blocks()
start=[S.hat("flag",12,12)]
for k,v in [("Энергия",65),("Вода",70),("Еда",70),("Экология",68),("Население",20),("Бюджет",100),("Ход",0)]:
    start.append(S.set(k,v))
start.extend([S.set("Последствие","Мир ждёт твоего первого решения"),S.set("Идея",""),S.emit("render")])
S.link(*start)
changes={
"city":{"Население":12,"Энергия":-13,"Вода":-11,"Еда":-5,"Экология":-10,"Бюджет":-25},
"forest":{"Экология":17,"Вода":12,"Еда":8,"Бюджет":-12},
"energy":{"Энергия":28,"Экология":-6,"Вода":-4,"Бюджет":-19},
"volcano":{"Энергия":19,"Экология":-22,"Вода":-8,"Население":-3,"Бюджет":-11}
}
messages={
"city":"Город вырос! Новые жители требуют воду, пищу и электричество.",
"forest":"Лес вырос! Возвращаются животные, восстанавливаются вода и почва.",
"energy":"Электростанция построена! Тока больше, но бюджет и природа страдают.",
"volcano":"Вулкан проснулся! Геотермальная энергия выросла, но природа под ударом."
}
for idx,(event,impact) in enumerate(changes.items()):
    seq=[S.hat(event,10+idx*280,190)]
    seq += [S.change(k,v) for k,v in impact.items()]
    seq += [S.set("Последствие",messages[event]),S.emit("changed")]
    S.link(*seq)
tick=[S.hat("changed",12,390),S.change("Ход",1)]
tick.append(S.ifvar("Энергия",20,[S.change("Население",-3),S.change("Еда",-6),S.set("Последствие","Энергетический кризис! Люди уезжают, еда портится.")]))
tick.append(S.ifvar("Вода",18,[S.change("Еда",-12),S.change("Экология",-4),S.set("Последствие","Засуха! Урожай гибнет, экосистема слабеет.")]))
tick.append(S.ifvar("Экология",18,[S.change("Еда",-7),S.set("Последствие","Экологический кризис! Урожай и пищевые цепочки нарушены.")]))
for var in ["Энергия","Вода","Еда","Экология","Население","Бюджет"]:
    tick.append(S.ifvar(var,0,[S.set(var,0)]))
    tick.append(S.ifvar(var,100,[S.set(var,100)],less=False))
tick.append(S.emit("genie"))
S.link(*tick)
stage=make_target("Stage",[backdrop],S.blocks,stage=True)
stage["variables"]={name:[name,{"Ход":0,"Население":20,"Энергия":65,"Вода":70,"Еда":70,"Экология":68,"Бюджет":100,"Последствие":"","Идея":""}.get(name,0)] for name in ["Ход","Население","Энергия","Вода","Еда","Экология","Бюджет","Последствие","Идея"]}
stage["broadcasts"]={name:name for name in ["city","forest","energy","volcano","changed","genie","render","visual_city","visual_forest","visual_energy","visual_volcano","visual_project"]}
targets=[stage]
for title,key,x,art in buttons:
    icon=svg(title,button_style+art+f'<text x="47" y="47" text-anchor="middle" font-family="Arial" font-size="11" fill="#f9e4aa" font-weight="bold">{title}</text>',96,54)
    b=Blocks();b.link(b.hat("click",8,12),b.emit(key));b.blocks["b1"]["opcode"]="event_whenthisspriteclicked";b.blocks["b1"]["fields"]={}
    targets.append(make_target("Кнопка "+title,[icon],b.blocks,x=x,y=-139))
world={
"city": ("Город", -116,-11,'<ellipse cx="66" cy="94" rx="61" ry="13" fill="#172d3e" opacity=".35"/><path d="M6 90L66 58 131 85 70 118Z" fill="#728d81"/><path d="M18 79V35L47 25V76L66 86V15L103 4V70L121 81V90L69 113Z" fill="#e2bd84"/><path d="M18 35L47 25 65 32 39 43Z" fill="#ffdda3"/><path d="M66 15L103 4 119 13 82 27Z" fill="#ffe6b3"/><g fill="#456e80"><rect x="25" y="45" width="8" height="10"/><rect x="39" y="41" width="6" height="10"/><rect x="77" y="32" width="10" height="13"/><rect x="94" y="27" width="9" height="13"/><rect x="77" y="52" width="10" height="13"/><rect x="94" y="47" width="9" height="13"/></g>'),
"forest": ("Лес", 93,25, '<ellipse cx="65" cy="111" rx="62" ry="14" fill="#1b4536" opacity=".4"/><g fill="#6b4c39"><rect x="17" y="57" width="12" height="42"/><rect x="64" y="47" width="15" height="57"/><rect x="103" y="63" width="12" height="37"/></g><path d="M22 6L0 73H47Z" fill="#24825e"/><path d="M70 0L40 75H100Z" fill="#3ea46f"/><path d="M110 19L80 79H137Z" fill="#267d60"/><path d="M70 10L53 51H90Z" fill="#79d89a"/><path d="M21 20L8 55H37Z" fill="#52b77c"/>'),
"energy":("Электростанция",68,-61,'<ellipse cx="74" cy="95" rx="68" ry="11" fill="#193343" opacity=".5"/><path d="M5 84L50 64 144 80 98 106Z" fill="#567e89"/><rect x="31" y="42" width="73" height="47" fill="#d5b988"/><path d="M31 42L60 28 132 41 104 51Z" fill="#fff1bf"/><rect x="76" y="8" width="19" height="46" fill="#a9b1ad"/><path d="M76 8L86 3 99 8 95 15Z" fill="#e7d6bd"/><path d="M88 0Q76 -11 82 -19M99 3Q117 -8 108 -17" stroke="#edf7e8" stroke-width="8" opacity=".6" fill="none"/><path d="M13 75L36 46H61L40 75Z" fill="#3a7085" stroke="#b3e0dd" stroke-width="3"/><path d="M45 75L68 46H93L72 75Z" fill="#396d83" stroke="#b3e0dd" stroke-width="3"/>'),
"volcano":("Вулкан",0,78,'<ellipse cx="74" cy="111" rx="73" ry="14" fill="#29444a" opacity=".3"/><path d="M1 104L48 35 69 49 89 25 149 104Z" fill="#715d61"/><path d="M29 91L48 35 69 49 89 25 124 89 84 67 72 87 58 60Z" fill="#9e8281"/><path d="M79 39L89 25 106 55 101 75 87 66 82 48Z" fill="#fb8a55"/><path d="M86 25Q71 10 83 1Q68 -15 91 -21Q116 -11 101 3Q118 13 89 25" fill="#ced0d0" opacity=".75"/><path d="M89 25L106 54" stroke="#ffd38b" stroke-width="5"/>')
}
for idx,(key,(title,x,y,art)) in enumerate(world.items()):
    costume=svg(title,art,150,122)
    b=Blocks();b.link(b.hat("flag",15,15),b.hide())
    show=[b.hat(key,15,105),b.show(),b.add("looks_setsizeto",inputs={"SIZE":b.inp(65)})]
    for _ in range(5):
        show.append(b.add("looks_changesizeby",inputs={"CHANGE":b.inp(7)}))
        show.append(b.wait(.05))
    b.link(*show)
    b.link(b.hat("visual_"+key,600,15),b.show())
    targets.append(make_target(title,[costume],b.blocks,x=x,y=y,visible=False,size=90))
idea_art='<rect x="8" y="8" width="83" height="61" rx="13" fill="#3a5774" stroke="#ffda91" stroke-width="3"/><path d="M30 21L74 21 68 60 38 60Z" fill="#ffdc8b"/><path d="M43 31Q47 19 58 28Q68 34 56 45V52H46V43Q39 39 43 31Z" fill="#f9a951"/><path d="M47 56H56" stroke="#654d54" stroke-width="3"/><text x="50" y="17" font-family="Arial" font-size="9" fill="#ffeaad" text-anchor="middle">НОВЫЙ ПРОЕКТ</text>'
idea_block=Blocks();idea_block.link(idea_block.hat("flag",10,10),idea_block.hide())
idea_block.link(idea_block.hat("visual_project",10,110),idea_block.show())
targets.append(make_target("Новый проект",[svg("Идея",idea_art,100,76)],idea_block.blocks,x=-35,y=-82,size=78,visible=False))
genie_art="""<ellipse cx="47" cy="92" rx="38" ry="8" fill="#143345" opacity=".4"/>
<path d="M25 58Q15 25 47 18Q84 18 77 59L65 81H34Z" fill="#6c58bd"/>
<path d="M21 53Q34 71 36 87H59Q54 66 77 53Q67 63 56 54L42 51Z" fill="#9c8cfc"/>
<circle cx="48" cy="29" r="20" fill="#e7ba8e"/><path d="M26 22Q26 -2 47 3Q70 -4 69 24Q59 15 48 16Q34 12 26 22" fill="#29304e"/>
<circle cx="40" cy="30" r="3" fill="#283a54"/><circle cx="56" cy="30" r="3" fill="#283a54"/>
<path d="M43 40Q49 45 56 38" fill="none" stroke="#b65f55" stroke-width="2"/>
<path d="M20 63L6 47M75 62L89 47" stroke="#e7ba8e" stroke-width="9" stroke-linecap="round"/>
<path d="M46 0L39 -10 48 -23 57 -10Z" fill="#fbd17e"/>"""
g=Blocks()
hello=g.hat("flag",20,20);g.link(hello,g.say("Я — Злой Джинн! Нажми Город, Лес, Энергию или Вулкан.",2))
seq=[g.hat("genie",20,170),g.add("looks_sayforsecs",inputs={"MESSAGE":g.variable("Последствие"),"SECS":g.inp(3)}),
     g.ask("Джинн: 1 Сжечь лес  2 Мегазавод  3 Импорт  4 Компромисс  5 Свой вариант. Введи 1-5")]
def clamp(g):
    return [g.ifvar(v,limit,[g.set(v,limit)],less=(limit==0))
            for v in ["Энергия","Вода","Еда","Экология","Население","Бюджет"]
            for limit in [0,100]]
def append_effect(msg):
    join=g.add("operator_join",inputs={"STRING1":g.variable("Последствие"),"STRING2":g.txt(msg)})
    node=g.add("data_setvariableto",fields={"VARIABLE":["Последствие","Последствие"]},inputs={"VALUE":[2,join]})
    g.blocks[join]["parent"]=node
    return node
def if_idea(words,body):
    checks=[g.add("operator_contains",inputs={"STRING1":g.variable("Идея"),"STRING2":g.txt(w)}) for w in words]
    cond=checks[0]
    if len(checks)>1:
        cond=g.add("operator_or",inputs={"OPERAND1":[2,checks[0]],"OPERAND2":[2,checks[1]]})
        for item in checks:g.blocks[item]["parent"]=cond
    node=g.add("control_if",inputs={"CONDITION":[2,cond],"SUBSTACK":[2,body[0]]})
    g.blocks[cond]["parent"]=node;g.blocks[body[0]]["parent"]=node
    g.link(*body)
    return node
for val,changeset,comment in [
    ("1",{"Энергия":14,"Экология":-18,"Вода":-7},"Лес сожжён ради энергии. Вода и экология падают."),
    ("2",{"Энергия":10,"Экология":-14,"Еда":-8},"Мегазавод заработал. Загрязнение и нехватка еды."),
    ("3",{"Энергия":10,"Бюджет":-20,"Вода":-3},"Импорт спас сеть, но бюджет тает, растёт зависимость."),
    ("4",{"Энергия":5,"Экология":6,"Бюджет":-11},"Компромисс: модернизация + восстановление леса.")
]:
    body=[g.change(k,v) for k,v in changeset.items()]+[g.set("Последствие",comment)]+clamp(g)+[g.add("looks_sayforsecs",inputs={"MESSAGE":g.variable("Последствие"),"SECS":g.inp(3)})]
    seq.append(g.eqanswer(val,body))
own=[g.ask("Опиши свой проект: лес / город / солнечная энергия / вулкан или любая идея"),
     g.add("data_setvariableto",fields={"VARIABLE":["Идея","Идея"]},inputs={"VALUE":[2,g.add("sensing_answer")]}),
     g.change("Бюджет",-8),g.change("Экология",3),
     g.set("Последствие","Твой проект начался. Базовый эффект: -8 бюджет, +3 экология. "),
     g.emit("visual_project"),
     if_idea(["лес","дерев"],[g.change("Экология",10),g.change("Вода",7),g.emit("visual_forest"),append_effect("Посажен новый лес: +10 экология, +7 вода. ")]),
     if_idea(["город","дом"],[g.change("Население",8),g.change("Вода",-5),g.emit("visual_city"),append_effect("Построены дома: +8 жителей, -5 вода. ")]),
     if_idea(["солн","энерг"],[g.change("Энергия",18),g.change("Бюджет",-8),g.emit("visual_energy"),append_effect("Запущена энергия: +18 ток, -8 бюджет. ")]),
     if_idea(["вулкан","геотерм"],[g.change("Энергия",17),g.change("Экология",-12),g.emit("visual_volcano"),append_effect("Запущена геотермия: +17 ток, -12 экология. ")])
] + clamp(g) + [g.add("looks_sayforsecs",inputs={"MESSAGE":g.variable("Последствие"),"SECS":g.inp(4)})]
# connect answer reporter parent to set-variable block
g.blocks[own[1]]["inputs"]["VALUE"][1] and g.blocks[g.blocks[own[1]]["inputs"]["VALUE"][1]] .update({"parent":own[1]})
seq.append(g.eqanswer("5",own))
g.link(*seq)
targets.append(make_target("Злой Джинн",[svg("Джинн",genie_art,96,104)],g.blocks,x=200,y=83,size=76))
monitors=[]
for i,key in enumerate(["Ход","Население","Энергия","Вода","Еда","Экология","Бюджет"]):
    monitors.append({"id":key,"mode":"default","opcode":"data_variable","params":{"VARIABLE":key},"spriteName":None,
        "value":stage["variables"][key][1],"width":0,"height":0,"x":5+(i%4)*117,"y":62+(i//4)*28,"visible":True,"sliderMin":0,"sliderMax":100,"isDiscrete":True})
project={"targets":targets,"monitors":monitors,"extensions":[],"meta":{"semver":"3.0.0","vm":"11.3.0","agent":"World Server Scratch Chain Reaction"}}
with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
    z.writestr("project.json",json.dumps(project,ensure_ascii=False,separators=(",",":")))
    for name,data in assets.items():z.writestr(name,data)
print("CREATED",out,"BYTES",out.stat().st_size,"TARGETS",len(targets),"BLOCKS",sum(len(t["blocks"]) for t in targets),"ASSETS",len(assets))

