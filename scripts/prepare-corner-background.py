"""Package the approved corner's empty architectural background, preserving its framing."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
reference = ROOT / 'docs/art/concepts/hall-corner-fuller.png'
source = ROOT / 'docs/art/hall-corner-empty-original.png'
destination = ROOT / 'public/assets/hall-corner-empty.webp'
image = Image.open(source).convert('RGB')
reference_size = Image.open(reference).size
assert image.size == reference_size, 'The edited background must preserve approved canvas dimensions'
assert image.width * 2 == image.height * 3, 'The approved scene uses exact 3:2 framing'
temporary = destination.with_name(destination.name + '.tmp')
image.save(temporary,'WEBP',quality=92,method=6)
temporary.replace(destination)
entry = {'date':'2026-10-06','reference':str(reference.relative_to(ROOT)),
         'referenceSha256':hashlib.sha256(reference.read_bytes()).hexdigest(),
         'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
         'sourceBytes':source.stat().st_size,'sourceSize':list(image.size),
         'runtime':str(destination.relative_to(ROOT)),'runtimeSha256':hashlib.sha256(destination.read_bytes()).hexdigest(),
         'runtimeSize':list(image.size),'bytes':destination.stat().st_size,'alpha':False,'crop':None,
         'packaging':'RGB WebP quality 92, method 6. No resizing or cropping.'}
(ROOT / 'docs/art/hall-corner-empty-manifest.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(entry,ensure_ascii=False))
