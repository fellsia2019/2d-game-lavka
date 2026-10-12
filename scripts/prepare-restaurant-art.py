"""Export registered built-in ImageGen plates at original resolution; no retouching."""
from pathlib import Path
import hashlib,json
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'docs/art/restaurant-rooms'
NAMES=['hall-stair-rework-v4','kitchen-balcony-rework-v4','yard-foundation-rework-v4','yard-before','yard-clear','yard-walls','yard-ready-v3','hall-rough','hall-empty','hall-tables','hall-seating','hall-furniture','hall-master-v3','hall-master','kitchen-empty','kitchen-prep','kitchen-master-v3']
rows=[]
for name in NAMES:
 original={'hall-stair-rework-v4':'hall-stair-empty-v5','yard-before':'yard-debris-registered','yard-walls':'yard-walls-rework-v4','yard-ready-v3':'yard-architecture-v5','hall-furniture':'hall-rework-v4','hall-master-v3':'hall-rework-v4','kitchen-prep':'kitchen-furniture-v6','kitchen-master-v3':'kitchen-rework-v4'}.get(name,name)
 source=SOURCE/(original+'.png');target=ROOT/'public/assets'/('restaurant-'+name+'.webp')
 with Image.open(source) as im:
  assert im.size==(1536,1024),(name,im.size)
  im.convert('RGB').save(target,'WEBP',quality=90,method=6)
 rows.append(dict(name=name,source=str(source.relative_to(ROOT)),runtime=str(target.relative_to(ROOT)),bytes=target.stat().st_size,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),operation='full1536x1024 RGB WebP q90 export; no painting or resizing'))
# Sparse registered sheets: copy exact rectangular source pixels, no painting.
for name,original,boxes in [
 ('hall-opening-view-v5','hall-stair-rework-v4',[(462,166,540,434)]),
 ('yard-context-v5','yard-architecture-v5',[(420,535,628,722),(648,548,750,716),(778,550,995,736)]),
 ('yard-details-v5','yard-rework-v5',[(1030,202,1087,294),(1217,215,1259,282),(1005,310,1109,436),(1180,266,1334,400)])
]:
 source=SOURCE/(original+'.png');target=ROOT/'public/assets'/('restaurant-'+name+'.webp')
 with Image.open(source) as im:
  sheet=Image.new('RGBA',im.size,(0,0,0,0))
  for box in boxes: sheet.paste(im.crop(box).convert('RGBA'),box[:2])
  sheet.save(target,'WEBP',quality=90,method=6)
 rows.append(dict(name=name,source=str(source.relative_to(ROOT)),runtime=str(target.relative_to(ROOT)),bytes=target.stat().st_size,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),operation=f'registered rectangular packing {boxes}; RGBA WebP q90; no painting'))
(SOURCE/'export-manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(dict(sheets=len(rows),bytes=sum(r['bytes'] for r in rows))))
