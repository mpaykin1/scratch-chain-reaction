"""Derive UI-free scenario art exclusively from approved existing game assets."""
from pathlib import Path
from PIL import Image,ImageOps
root=Path(__file__).resolve().parents[1]/"cinematic"/"assets"
src=Image.open(root/"world_developed_portrait.webp").convert("RGB")
assert src.width>=900 and src.height>=980,src.size
land=src.crop((0,240,src.width,770))
land=ImageOps.fit(land,(1600,900),Image.Resampling.LANCZOS)
land.save(root/"world_developed_clean_landscape.webp",format="WEBP",quality=83,method=5)
cards={
    "dam":(95,190,780,515),
    "import":(30,595,750,845)
}
for name,bbox in cards.items():
    crop=ImageOps.fit(src.crop(bbox),(330,149),Image.Resampling.LANCZOS)
    crop.save(root/("card_"+name+".webp"),format="WEBP",quality=82,method=5)
    print(name, (root/("card_"+name+".webp")).stat().st_size)
print("CLEAN_LANDSCAPE",(root/"world_developed_clean_landscape.webp").stat().st_size)

