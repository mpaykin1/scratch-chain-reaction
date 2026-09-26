from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageEnhance
import os,math,random
ROOT=os.environ.get('SCRATCH_ORIGINAL_ART_DIR',os.path.dirname(__file__)); OUT=os.path.join(os.path.dirname(__file__),'assets'); os.makedirs(OUT,exist_ok=True)
intro=Image.open(ROOT+'/злой_джинн_выбор_судьбы_пустоши.png').convert('RGB')
live=Image.open(ROOT+'/мир_меняется_город_лес_и_вулкан.png').convert('RGB')
genie=Image.open(ROOT+'/джинн_в_пурпурном_дыму_лист_спрайтов.png').convert('RGBA')
walk=Image.open(ROOT+'/спрайт_лист_трое_выживших_в_движении.png').convert('RGBA')
smoke=Image.open(ROOT+'/спрайт_лист_вулканических_эффектов.png').convert('RGBA')
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; bf=lambda sz:ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',sz); nf=lambda sz:ImageFont.truetype(font,sz)
def save(image,name):
 p=os.path.join(OUT,name);image.save(p,optimize=True);print(name,image.size,os.path.getsize(p));return p
# Start backdrop is cropped from unoccluded right hand of user's approved cinematic UI.
# It contains *no volcano*. UI is added in game sprites over this backdrop.
bg=intro.crop((988,107,1644,608)).resize((480,360),Image.Resampling.LANCZOS)
bg=ImageEnhance.Color(bg).enhance(.95)
save(bg,'start_world.png')
# Isolate visually unique sectors of lush world for reveal overlays with feathered boundaries.
sectors={'city':((56,165,555,490),(225,135)),
         'forest':((530,164,820,364),(232,160)),
         'energy':((833,155,1198,510),(232,161)),
         'volcano':((1278,124,1660,550),(219,175)),
         'river':((655,352,1058,642),(170,135))}
for kind,(rect,sz) in sectors.items():
 im=live.crop(rect).resize(sz,Image.Resampling.LANCZOS).convert('RGBA')
 mask=Image.new('L',sz,0); m=ImageDraw.Draw(mask);m.rounded_rectangle((10,9,sz[0]-10,sz[1]-12),radius=36,fill=255)
 mask=mask.filter(ImageFilter.GaussianBlur(16))
 im.putalpha(mask);save(im,f'{kind}_world.png')
 if kind in ['city','forest','energy','volcano']:
  # second subtle lighting/color animation frame
  flash=ImageEnhance.Brightness(im).enhance(1.12 if kind in ['energy','volcano'] else 1.055)
  save(flash,f'{kind}_world2.png')
# Four frame alpha sheets; trim each quadrant keeping consistent canvas for no sprite wobble.
for label,src,size in [('genie',genie,(175,174)),('walkers',walk,(115,107)),('steam',smoke,(130,114))]:
 for i in range(4):
  row,col=divmod(i,2);sub=src.crop((col*627,row*627,(col+1)*627,(row+1)*627))
  # remove mostly transparent outer margin to maximize usable sprite size, keep consistent quad
  a=sub.getchannel('A');bbox=a.point(lambda x:255 if x>15 else 0).getbbox()
  if bbox:sub=sub.crop(bbox)
  sub.thumbnail(size,Image.Resampling.LANCZOS)
  canvas=Image.new('RGBA',size,(0,0,0,0));canvas.alpha_composite(sub,((size[0]-sub.width)//2,(size[1]-sub.height)//2))
  save(canvas,f'{label}_{i}.png')
# Each option card is extracted from approved reference image. Draw labels crisp at game resolution.
labels=['Город','Лес','Энергия','Вулкан','Идея'];colors=['#7ce7ff','#78e59c','#ffda78','#ff867a','#d5a0ff']
for i,(label,color) in enumerate(zip(labels,colors)):
 left=[76,379,682,982,1280][i];right=[367,670,969,1272,1573][i]
 crop=intro.crop((left,704,right,849)).convert('RGB').resize((85,46),Image.Resampling.LANCZOS)
 card=Image.new('RGBA',(88,67),(8,18,30,245));card.alpha_composite(crop.convert('RGBA'),(2,2))
 d=ImageDraw.Draw(card);d.rounded_rectangle((1,1,86,65),radius=8,outline=color,width=2);d.rectangle((3,46,84,63),fill=(14,28,43,235))
 box=d.textbbox((0,0),label,font=bf(12));d.text(((88-(box[2]-box[0]))/2,47),label,font=bf(12),fill=color)
 save(card,f'card_{i}.png')
# Transparent UI panel variants on separate sprite under genie.
panels=[('intro','Злой Джинн!',['Этот мир ждёт твоего решения.','Построй город, лес, энергию или вулкан.','Или предложи собственную идею!']),
 ('city','Мир меняется!',['Построен город. Растёт население.','Но людям нужны вода, еда и энергия.']),
 ('forest','Мир меняется!',['Лес вырос, ожила экосистема.','В почву возвращается влага.']),
 ('energy','Мир меняется!',['Электростанция заработала.','Ток растёт, но природа страдает.']),
 ('volcano','Мир меняется!',['Проснулся вулкан. Лава и пепел!','Энергия растёт, экология падает.']),
 ('idea','Твоя идея!',['Твой проект изменил этот мир.','Наблюдай за последствиями.']),
 ('genie','Злой Джинн выбирает!',['Каждое решение имеет свою цену.','Выбери ответ на новый кризис.']),
 ('crisis','Новые последствия!',['Ресурсы изменились после выбора.','Продолжай: мир не заканчивается.'])]
for key,head,lines in panels:
 p=Image.new('RGBA',(348,111),(0,0,0,0));d=ImageDraw.Draw(p)
 d.rounded_rectangle((1,1,346,109),radius=12,fill=(8,17,29,222),outline=(249,202,119,235),width=2)
 d.text((98,10),head,font=bf(17),fill='#ffd88d')
 for idx,line in enumerate(lines):d.text((98,38+idx*19),line,font=nf(10),fill='#f3f4f9')
 save(p,f'panel_{key}.png')
# Six counter costumes 0-100, sprites can dynamically switch based on variable.
icons={'Население':'♟','Энергия':'ϟ','Вода':'◆','Еда':'❦','Экология':'♣','Бюджет':'●','Ход':'◴'}
colors={'Население':'#77c8ff','Энергия':'#ffcf66','Вода':'#68baff','Еда':'#77dd99','Экология':'#91ef96','Бюджет':'#ffcf69','Ход':'#efb26b'}
# Avoid 707 PNG files: use SVG costumes generated later by builder; PIL makes fallback sprite for preview only.
# Rotor is four costumes to show real spinning turbine on chosen energy.
for i in range(8):
 im=Image.new('RGBA',(84,96),(0,0,0,0));d=ImageDraw.Draw(im)
 d.line((41,39,43,91),fill=(207,226,238,255),width=7);d.ellipse((36,34,47,46),fill=(247,249,251,255))
 ang=i*math.pi/4
 for arm in range(3):
  t=ang+arm*2*math.pi/3
  x=42+34*math.cos(t);y=40+34*math.sin(t)
  d.polygon([(42,39),(45,44),(x+3,y+2),(x-2,y-2)],fill=(235,244,252,255))
 save(im,f'rotor_{i}.png')
# Ambient dust atmospheric animated thin layers.
for i in range(4):
 r=random.Random(38+i);im=Image.new('RGBA',(480,360),(0,0,0,0));d=ImageDraw.Draw(im)
 for n in range(34):
  x=r.randrange(480);y=r.randrange(45,250);s=r.randrange(3,16)
  d.ellipse((x,y,x+s*4,y+s),fill=(234,202,162,r.randrange(3,13)))
 im=im.filter(ImageFilter.GaussianBlur(12));save(im,f'dust_{i}.png')
