"""Pack approved hall layers. Crop/resize only; keep source PNGs and their alpha."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
specs = [
    ("hall-v1-empty", "hall-v1-empty", None, 1536, False),
    ("hall-v2-empty", "hall-v2-empty", None, 1536, False),
    ("hall-v1-displays", "hall-v1-west-display", (0, 0, 843, 1024), 1000, True),
    ("hall-v1-displays", "hall-v1-north-display", (843, 0, 1536, 1024), 1000, True),
    ("hall-v1-counter", "hall-v1-counter", None, 1200, True),
    ("hall-v2-north-display", "hall-v2-north-display", None, 1000, True),
    ("hall-v2-packing-table", "hall-v2-packing-table", None, 1000, True),
    ("hall-v2-order-rack", "hall-v2-order-rack", None, 1000, True),
    ("hall-v2-cupboard", "hall-v2-cupboard", None, 1000, True),
    ("hall-basket-left", "hall-tray-left", None, 640, True),
    ("hall-basket-right", "hall-tray-right", None, 640, True),
    ("hall-order-parcel", "hall-order-parcel", None, 400, True),
    ("hall-packing-wall-shelf", "hall-packing-wall-shelf", None, 700, True),
    ("hall-balance-scale", "hall-balance-scale", None, 500, True),
]
entries = []
runtime = {}
for source_name, name, cell, max_width, transparent in specs:
    source = ROOT / "docs/art" / (source_name + "-original.png")
    original = Image.open(source).convert("RGBA" if transparent else "RGB")
    cell = cell or (0, 0, original.width, original.height)
    sprite = original.crop(cell)
    crop = (0, 0, sprite.width, sprite.height)
    if transparent:
        assert sprite.getchannel("A").getextrema()[0] == 0, name
        bounds = sprite.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox()
        assert bounds is not None, name
        l, t, r, b = bounds
        crop = (max(0, l-4), max(0, t-4), min(sprite.width, r+4), min(sprite.height, b+4))
        sprite = sprite.crop(crop)
    if sprite.width > max_width:
        sprite = sprite.resize((max_width, round(sprite.height * max_width / sprite.width)), Image.Resampling.LANCZOS)
    destination = ROOT / "public/assets" / (name + ".webp")
    sprite.save(destination, "WEBP", quality=92, method=6)
    source_crop = [crop[0]+cell[0], crop[1]+cell[1], crop[2]+cell[0], crop[3]+cell[1]]
    entries.append(dict(source=str(source.relative_to(ROOT)), runtime=str(destination.relative_to(ROOT)),
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        runtimeSha256=hashlib.sha256(destination.read_bytes()).hexdigest(), bytes=destination.stat().st_size,
        alpha=transparent, sourceCell=list(cell), sourceCrop=source_crop, size=list(sprite.size)))
    runtime[name] = dict(width=sprite.width, height=sprite.height, crop=source_crop)
(ROOT / "docs/art/hall-two-views-manifest.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2)+"\n")
(ROOT / "src/hall-art.json").write_text(json.dumps(runtime, indent=2)+"\n")
print(json.dumps({e["runtime"]: e["size"] for e in entries}, indent=2))
