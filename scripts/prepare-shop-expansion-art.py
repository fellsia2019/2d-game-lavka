"""Export registered ImageGen room plates; no painting, masking or geometry edits."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NAMES = ['grocery-master', 'grocery-bare', 'grocery-structure', 'grocery-clean',
         'grocery-cleared', 'grocery-before', 'service-master', 'service-base', 'service-counter', 'grocery-supported', 'grocery-stocked-v2', 'grocery-stocked-rack-v2', 'grocery-empty-rack-v2']
entries = []
for name in NAMES:
    source = ROOT / 'docs/art/shop-expansion' / f'{name}.png'
    image = Image.open(source)
    assert image.size == (1536, 1024), (name, image.size)
    target = ROOT / 'public/assets' / f'shop-expansion-{name}.webp'
    image.convert('RGB').save(target, 'WEBP', quality=96, method=6)
    entries.append(dict(name=name, source=str(source.relative_to(ROOT)),
        runtime=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        frame=[0, 0, 1536, 1024], operation='RGB WebP export only'))
(ROOT / 'docs/art/shop-expansion/manifest.json').write_text(json.dumps(entries, indent=2)+'\n')
print(json.dumps(dict(sheets=len(entries), bytes=sum(x['bytes'] for x in entries))))
