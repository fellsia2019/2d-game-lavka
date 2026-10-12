"""Export registered restaurant map donors and sparse context/detail sheets."""
from pathlib import Path
import hashlib,json
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'docs/art/restaurant-map'
rows=[]
for name,original in [('clear','clear'),('walls','walls-rework-v7'),('ready','architecture-v5')]:
 source=SOURCE/(original+'.png');target=ROOT/'public/assets'/('coastal-restaurant-map-'+name+'.webp')
 with Image.open(source) as im:
  assert im.size==(1536,1024),(name,im.size)
  im.convert('RGB').save(target,'WEBP',quality=90,method=6)
 rows.append(dict(name=name,source=str(source.relative_to(ROOT)),runtime=str(target.relative_to(ROOT)),bytes=target.stat().st_size,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),operation='full-frame1536x1024 WebP q90 export; registered SVG runtime clipping'))
# Compact registered glazing and purchased lamp/flower detail sheets.
for name,original,boxes in [
 ('context-v5','architecture-v5',[(533,272,631,357),(643,274,689,354),(704,277,809,363)]),
 ('details-v5','ready-rework-v5',[(796,99,831,150),(793,152,852,212),(860,88,921,177)])
]:
 source=SOURCE/(original+'.png');target=ROOT/'public/assets'/('coastal-restaurant-map-'+name+'.webp')
 with Image.open(source) as im:
  sheet=Image.new('RGBA',im.size,(0,0,0,0))
  for box in boxes: sheet.paste(im.crop(box).convert('RGBA'),box[:2])
  sheet.save(target,'WEBP',quality=90,method=6)
 rows.append(dict(name=name,source=str(source.relative_to(ROOT)),runtime=str(target.relative_to(ROOT)),bytes=target.stat().st_size,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),operation=f'registered rectangular packing {boxes}; RGBA WebP q90; no painting'))
(SOURCE/'export-manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(dict(sheets=len(rows),bytes=sum(r['bytes'] for r in rows))))
