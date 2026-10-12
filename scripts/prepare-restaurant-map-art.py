"""Export registered restaurant map donors; windows donor is sampled only within two openings."""
from pathlib import Path
import hashlib,json
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'docs/art/restaurant-map'
rows=[]
for name,original in [('clear','clear'),('walls','walls'),('ready','final-v2'),('windows','final-v5')]:
 source=SOURCE/(original+'.png');target=ROOT/'public/assets'/('coastal-restaurant-map-'+name+'.webp')
 with Image.open(source) as im:
  assert im.size==(1536,1024),(name,im.size)
  im.convert('RGB').save(target,'WEBP',quality=90,method=6)
 rows.append(dict(name=name,source=str(source.relative_to(ROOT)),runtime=str(target.relative_to(ROOT)),bytes=target.stat().st_size,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),operation='full-frame1536x1024 WebP q90 export; registered SVG runtime clipping'))
(SOURCE/'export-manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(dict(sheets=len(rows),bytes=sum(r['bytes'] for r in rows))))
