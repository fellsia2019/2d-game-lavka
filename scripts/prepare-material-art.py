"""Export generated transparent material sprites; preserve the original pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IDS = ('paint', 'boards', 'bricks', 'tiles', 'nails', 'cement', 'glass', 'gears', 'wire', 'toolbox')
records = []
for material in IDS:
    source = ROOT / f'docs/art/materials/{material}-original.png'
    image = Image.open(source).convert('RGBA')
    assert image.getchannel('A').getextrema()[0] == 0, f'Missing transparency: {material}'
    bounds = image.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    assert bounds, material
    l, t, r, b = bounds
    crop = (max(0, l-8), max(0, t-8), min(image.width, r+8), min(image.height, b+8))
    image = image.crop(crop)
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    destination = ROOT / f'public/assets/material-{material}.webp'
    image.save(destination, 'WEBP', quality=92, method=6, exact=True)
    records.append({'id': material, 'source': str(source.relative_to(ROOT)),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sourceCrop': list(crop),
        'runtime': str(destination.relative_to(ROOT)), 'runtimeSha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
        'size': list(image.size), 'alpha': True, 'bytes': destination.stat().st_size})
(ROOT / 'docs/art/material-art-manifest.json').write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'assets': len(records), 'runtimeBytes': sum(x['bytes'] for x in records)}))
