"""Export registered bakery plates only; never paint, crop, mask or rescale source pixels."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ROOMS = ROOT / 'docs/art/bakery-rooms'
MAPS = ROOT / 'docs/art/bakery-map'
ROOM_NAMES = {'yard-awning-bare','yard-before','yard-clear-1','yard-clear-2','yard-clear-3','yard-clear-4','yard-cleared','yard-foundation-v2','yard-walls-v2','yard-roof','yard-ready','yard-finished-v2','yard-master-v2','oven-rough','oven-unlit','oven-clean','oven-bare','oven-master','shop-rough','shop-unlit','shop-clean','shop-furniture','shop-bare','shop-trays-clean','shop-stock','shop-trays','shop-master'}
MAP_NAMES = {'before','clear','foundation','walls','roof','ready','final'}
entries = []
for directory, prefix in [(ROOMS, 'bakery-'), (MAPS, 'coastal-bakery-map-')]:
    for source in sorted(directory.glob('*.png')):
        if source.stem not in (ROOM_NAMES if directory == ROOMS else MAP_NAMES):
            continue
        with Image.open(source) as image:
            assert image.size == (1536, 1024), (source.name, image.size)
            target = ROOT / 'public/assets' / f'{prefix}{source.stem}.webp'
            image.convert('RGB').save(target, 'WEBP', quality=94, method=6)
        entries.append(dict(name=source.stem, source=str(source.relative_to(ROOT)),
            runtime=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
            sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
            runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
            frame=[0, 0, 1536, 1024], operation='RGB WebP export only'))
(ROOMS / 'export-manifest.json').write_text(json.dumps(entries, indent=2)+'\n')
print(json.dumps(dict(sheets=len(entries), bytes=sum(item['bytes'] for item in entries))))
