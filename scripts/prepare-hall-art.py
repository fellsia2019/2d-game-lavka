"""Package the single low window display without changing its PNG original."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / 'docs/art/campaign-window-display-original.png'
destination = ROOT / 'public/assets/campaign-window-display.webp'
image = Image.open(source).convert('RGBA')
assert image.getchannel('A').getextrema()[0] == 0
bounds = image.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
l,t,r,b = bounds
crop = (max(0,l-6),max(0,t-6),min(image.width,r+6),min(image.height,b+6))
image = image.crop(crop)
image.thumbnail((1000,500),Image.Resampling.LANCZOS)
temporary = destination.with_name(destination.name + '.tmp')
image.save(temporary,'WEBP',quality=92,method=6)
temporary.replace(destination)
entry = {'source':str(source.relative_to(ROOT)),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
         'runtime':str(destination.relative_to(ROOT)),'runtimeSha256':hashlib.sha256(destination.read_bytes()).hexdigest(),
         'size':list(image.size),'bytes':destination.stat().st_size,'alpha':True,'sourceCrop':list(crop)}
(ROOT / 'docs/art/hall-art-manifest.json').write_text(json.dumps(entry,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(entry,ensure_ascii=False))
