"""Export registered ImageGen plates only: RGB WebP, never paint or modify geometry."""
from pathlib import Path
import hashlib
import json
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
NAMES = ['market-table-stock-v2','market-table-empty-v2','hall-left-stock-v2','hall-left-empty-v2','hall-rack-only-v2','pavilion-master','pavilion-roof','pavilion-frame','pavilion-foundation','pavilion-clear','pavilion-before','pavilion-cleared-1','pavilion-cleared-2','pavilion-cleared-3','pavilion-cleared-4',
 'market-master','market-supported','market-bare','market-structure','market-empty-v2','market-before-v2',
 'extension-master','extension-roof','extension-unlit','extension-frame','extension-walls','extension-foundation','extension-plinth','extension-clear','extension-before',
 'hall-master','hall-bare','hall-structure','hall-empty','hall-before']
entries=[]
for name in NAMES:
    source=ROOT/'docs/art/fruit-rooms'/f'{name}.png'
    im=Image.open(source)
    assert im.size==(1536,1024),(name,im.size)
    target=ROOT/'public/assets'/f'fruit-room-{name}.webp'
    im.convert('RGB').save(target,'WEBP',quality=96,method=6)
    entries.append(dict(name=name,source=str(source.relative_to(ROOT)),runtime=str(target.relative_to(ROOT)),bytes=target.stat().st_size,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),frame=[0,0,1536,1024],operation='RGB WebP export only'))
(ROOT/'docs/art/fruit-rooms/manifest.json').write_text(json.dumps(entries,indent=2)+'\n')
print(json.dumps(dict(sheets=len(entries),bytes=sum(x['bytes'] for x in entries))))
