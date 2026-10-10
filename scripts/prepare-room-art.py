"""Export full-room source plates without changing their geometry. Requires Pillow."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {
    'hall-room-main-master': 'docs/art/room-corners/main-master.png',
    'hall-room-main-empty': 'docs/art/room-corners/main-empty.png',
    'hall-room-main-clean': 'docs/art/hall-v1-empty-original.png',
    'hall-room-main-before': 'docs/art/room-corners/main-before.png',
    'hall-room-prep-master': 'docs/art/concepts/hall-four-view-2.png',
    'hall-room-prep-empty': 'docs/art/room-corners/prep-empty.png',
    'hall-room-prep-clean': 'docs/art/hall-v2-empty-original.png',
    'hall-room-prep-before': 'docs/art/room-corners/prep-before.png',
}
entries = []
for name, source in SOURCES.items():
    path = ROOT / source
    original = Image.open(path)
    assert original.size == (1536, 1024), (source, original.size)
    target = ROOT / 'public/assets' / (name + '.webp')
    original.convert('RGB').save(target, 'WEBP', quality=96, method=6)
    entries.append(dict(name=name, source=source, sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        runtime=str(target.relative_to(ROOT)), runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        bytes=target.stat().st_size, frame=[0,0,1536,1024], operation='RGB WebP export only'))
(ROOT / 'docs/art/room-corners/manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(sheets=len(entries), bytes=sum(entry['bytes'] for entry in entries))))
