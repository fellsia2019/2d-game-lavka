"""Export ImageGen full-frame donors. No pixel or geometry edits. Requires Pillow."""
from pathlib import Path
from PIL import Image
import hashlib
import json
root = Path(__file__).resolve().parent.parent
entries = []
for name in ['main-before', 'main-counter', 'main-lighting', 'prep-lighting']:
    source = root / 'docs/art/room-polish' / (name + '.png')
    target = root / 'public/assets' / ('hall-polish-' + name + '.webp')
    image = Image.open(source)
    assert image.size == (1536, 1024)
    image.convert('RGB').save(target, 'WEBP', quality=96, method=6)
    entries.append(dict(source=str(source.relative_to(root)), runtime=str(target.relative_to(root)),
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(), bytes=target.stat().st_size,
        frame=[0, 0, 1536, 1024], operation='RGB WebP export only'))
(root / 'docs/art/room-polish/manifest.json').write_text(json.dumps(entries, indent=2)+'\n')
print(json.dumps(dict(sheets=len(entries), bytes=sum(e['bytes'] for e in entries))))
