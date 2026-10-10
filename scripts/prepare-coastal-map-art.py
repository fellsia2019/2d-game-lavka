"""Export registered coastal map plates to WebP; no pixel retouching or resampling."""
from pathlib import Path
from PIL import Image
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/art/coastal-map'
NAMES = ['dormant-v1', 'tidied-v1', 'rough-v1', 'cleared-v1', 'foundation-v1',
         'structure-v1', 'roofed-v1', 'ready-v1', 'complete-v1']

entries = []
for name in NAMES:
    source = SOURCE / f'{name}.png'
    image = Image.open(source)
    assert image.size == (1536, 1024), (name, image.size)
    target = ROOT / 'public/assets' / f'coastal-map-{name}.webp'
    image.convert('RGB').save(target, 'WEBP', quality=94, method=6)
    entries.append(dict(name=name, source=str(source.relative_to(ROOT)),
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        runtime=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
        runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        frame=[0, 0, 1536, 1024], operation='RGB WebP export only'))
(SOURCE / 'manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(sheets=len(entries), bytes=sum(e['bytes'] for e in entries))))
