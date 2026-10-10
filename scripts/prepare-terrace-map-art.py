"""Export complete registered ImageGen plates; no crop, drawing or retouch."""
from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'docs/art/terrace-map'
NAMES=['before','clear','foundation','frame','roof','ready','final']
rows=[]
for name in NAMES:
    source=SRC/f'{name}.png'
    im=Image.open(source).convert('RGB')
    assert im.size==(1536,1024),(name,im.size)
    out=ROOT/'public/assets'/f'coastal-terrace-map-{name}.webp'
    im.save(out,'WEBP',quality=76,method=6)
    rows.append({'name':name,'source':str(source.relative_to(ROOT)),'asset':str(out.relative_to(ROOT)),'bytes':out.stat().st_size,'size':[1536,1024],'quality':76})
(SRC/'manifest.json').write_text(json.dumps({'generator':'built-in ImageGen','assets':rows,'totalBytes':sum(x['bytes'] for x in rows)},indent=2)+'\n')
print(json.dumps(rows,indent=2));print('total',sum(x['bytes'] for x in rows))
