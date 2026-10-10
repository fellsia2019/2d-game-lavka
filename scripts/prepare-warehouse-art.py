"""Encode registered ImageGen plates, without editing their pixels or geometry.

Requires Pillow. Run with any Python environment providing it.
All source and runtime paths are relative to this repository.
"""
from pathlib import Path
from PIL import Image
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'docs/art/warehouse-rooms'
names = ['exterior-master', 'exterior-clean', 'exterior-tool-cupboard-v8', 'storage-master', 'storage-empty',
         'storage-clean', 'storage-before', 'storage-labels', 'storage-rack-bare', 'storage-pallet-only',
         'storage-inspection-table-bare', 'storage-packing-bench-bare', 'storage-packing-station-v6',
         'storage-dry-crates-bare', 'storage-cans-bare', 'cold-master', 'cold-empty', 'cold-clean',
         'cold-before', 'cold-cabinet-bare', 'cold-rack-bare', 'cold-ventilation', 'site-clear', 'site-before',
         'site-foundation', 'site-walls', 'map-master', 'map-foundation', 'map-walls']
entries = []
for name in names:
    source = SOURCE / (name + '.png')
    image = Image.open(source)
    assert image.size == (1536, 1024), (name, image.size)
    target = ROOT / 'public/assets' / ('warehouse-room-' + name + '.webp')
    image.convert('RGB').save(target, 'WEBP', quality=96, method=6)
    entries.append(dict(name=name, source=str(source.relative_to(ROOT)),
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        runtime=str(target.relative_to(ROOT)), bytes=target.stat().st_size,
        runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        frame=[0, 0, 1536, 1024], operation='RGB WebP export only'))
(SOURCE / 'manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(sheets=len(entries), bytes=sum(e['bytes'] for e in entries))))
