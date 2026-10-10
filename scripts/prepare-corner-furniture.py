"""Crop/pack the generated corner atlas sprites, preserving original alpha and PNGs."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
entries = []
specs = [
    ('hall-corner-cabinets-original.png', 'hall-corner-left', (0, 0, 768, 1024), (800, 900)),
    ('hall-corner-cabinets-original.png', 'hall-corner-right', (768, 0, 1536, 1024), (800, 900)),
    ('hall-corner-counter-original.png', 'hall-corner-counter', None, (1200, 900)),
    ('hall-corner-trays-original.png', 'hall-corner-tray-left', (0, 0, 768, 1024), (640, 420)),
    ('hall-corner-trays-original.png', 'hall-corner-tray-right', (768, 0, 1536, 1024), (640, 420)),
]
for filename, name, cell, size in specs:
    source = ROOT / 'docs/art' / filename
    original = Image.open(source).convert('RGBA')
    assert original.getchannel('A').getextrema()[0] == 0, filename
    cell = cell or (0, 0, original.width, original.height)
    sprite = original.crop(cell)
    bounds = sprite.getchannel('A').point(lambda a: 255 if a > 32 else 0).getbbox()
    assert bounds is not None, name
    left, top, right, bottom = bounds
    crop = (max(0, left-4), max(0, top-4), min(sprite.width, right+4), min(sprite.height, bottom+4))
    sprite = sprite.crop(crop)
    sprite.thumbnail(size, Image.Resampling.LANCZOS)
    destination = ROOT / 'public/assets' / (name + '.webp')
    sprite.save(destination, 'WEBP', quality=92, method=6)
    entry = dict(source=str(source.relative_to(ROOT)), sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        runtime=str(destination.relative_to(ROOT)), runtimeSha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
        size=list(sprite.size), bytes=destination.stat().st_size, alpha=True,
        sourceCell=list(cell), sourceCrop=[crop[0]+cell[0], crop[1]+cell[1], crop[2]+cell[0], crop[3]+cell[1]])
    entries.append(entry)
print(json.dumps(entries, ensure_ascii=False, indent=2))
(ROOT / 'docs/art/hall-corner-furniture-manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2)+'\n')
