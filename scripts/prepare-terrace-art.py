"""Export registered terrace plates. No painting, cropping or rescaling."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/art/terrace-rooms'
NAMES = ['before','before-v2','tidied','level','foundation','frame','empty','tables-only-v2','furniture-bare','furniture-full','master-v2']
entries = []
for name in NAMES:
    source = SOURCE / f'{name}.png'
    target = ROOT / 'public/assets' / f'terrace-{name}.webp'
    with Image.open(source) as image:
        assert image.size == (1536,1024), (name,image.size)
        image.convert('RGB').save(target,'WEBP',quality=90,method=6)
    entries.append(dict(name=name,source=str(source.relative_to(ROOT)),runtime=str(target.relative_to(ROOT)),
        bytes=target.stat().st_size,frame=[0,0,1536,1024],
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),operation='RGB WebP export only'))
(SOURCE / 'export-manifest.json').write_text(json.dumps(entries,indent=2)+'\n')
total=sum(item['bytes'] for item in entries)
assert total < 6_500_000, total
print(json.dumps(dict(sheets=len(entries),bytes=total)))
