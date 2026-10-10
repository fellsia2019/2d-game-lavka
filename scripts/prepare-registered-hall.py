"""Export immutable source sheets without cropping, moving, masking or redrawing pixels.

The runtime owns registered SVG silhouettes in src/hall-scene-layers.ts.
Requires Pillow; all inputs, outputs and source coordinates are repository-relative.
"""
from pathlib import Path
import hashlib
import json
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {
    'scene-main-master': 'docs/art/concepts/scene-reset-finished-v3.png',
    'scene-main-empty': 'docs/art/concepts/scene-reset-middle-v2.png',
    'scene-main-before': 'docs/art/concepts/scene-reset-before-v2.png',
    'scene-main-clean': 'docs/art/scene-reset/main-clean.png',
    'scene-main-light': 'docs/art/scene-reset/main-light.png',
    'scene-prep-master': 'docs/art/scene-reset/prep-master-v2.png',
    'scene-prep-empty': 'docs/art/scene-reset/prep-empty.png',
    'scene-prep-clean': 'docs/art/scene-reset/prep-clean.png',
    'scene-prep-before': 'docs/art/scene-reset/prep-before.png',
    'scene-prep-light': 'docs/art/scene-reset/prep-light.png',
}
entries = []
for name, source in SOURCES.items():
    path = ROOT / source
    if '--partial' in sys.argv and not path.exists():
        continue
    original = Image.open(path)
    assert original.size == (1536, 1024), (source, original.size)
    target = ROOT / 'public/assets' / (name + '.webp')
    original.convert('RGB').save(target, 'WEBP', quality=96, method=6)
    entries.append(dict(name=name, source=source, sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        runtime=str(target.relative_to(ROOT)), runtimeSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        bytes=target.stat().st_size, frame=[0,0,1536,1024], offset=[0,0], operation='RGB WebP export only'))
(ROOT / 'docs/art/scene-reset/manifest.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(sheets=len(entries), bytes=sum(entry['bytes'] for entry in entries))))
