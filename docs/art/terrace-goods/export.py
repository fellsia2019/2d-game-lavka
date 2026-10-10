"""Normalize the three ImageGen RGBA goods to WebP; no painted/retouched pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parents[3]
folder = root / 'docs/art/terrace-goods'
rows = []
for name in ['pie', 'bun', 'lemonade']:
    source = folder / f'{name}-v1.png'
    image = Image.open(source).convert('RGBA')
    assert image.getchannel('A').getextrema() == (0, 255)
    # Keep the complete generated frame, including its original soft alpha shadow.
    out = image.resize((320, 320), Image.Resampling.LANCZOS)
    destination = root / f'public/assets/{name}.webp'
    out.save(destination, 'WEBP', quality=96, method=6, exact=True)
    decoded = Image.open(destination)
    assert decoded.mode == 'RGBA' and decoded.size == (320, 320)
    rows.append({
        'id': name, 'source': source.relative_to(root).as_posix(),
        'prompt': f'docs/art/terrace-goods/{name}.prompt.txt',
        'sourceSize': list(image.size),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'runtime': destination.relative_to(root).as_posix(),
        'runtimeSize': list(decoded.size), 'mode': decoded.mode,
        'bytes': destination.stat().st_size,
        'runtimeSha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
        'generator': 'built-in ImageGen',
        'references': ['public/assets/bread.webp', 'public/assets/juice.webp', 'docs/art/bakery-goods/baguette-v1.png'],
        'referenceRole': 'read-only visual style study; not attached to generation',
        'normalization': 'complete frame resized to 320x320; RGBA alpha preserved; WebP quality96',
    })
(folder / 'manifest.json').write_text(json.dumps(rows, indent=2) + '\n')
print(json.dumps([{'id': r['id'], 'bytes': r['bytes']} for r in rows]))
