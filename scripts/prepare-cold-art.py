"""Package generated cold-shop sources. Crop/scale only; preserve original alpha."""
from pathlib import Path
from PIL import Image
import json
import hashlib

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "docs" / "art"
ASSETS = ROOT / "public" / "assets"
report = []

def package(picture, source, name, size, transparent):
    if transparent:
        assert picture.mode == "RGBA" and picture.getchannel("A").getextrema()[0] == 0
        bounds = picture.getchannel("A").point(lambda a: 255 if a > 48 else 0).getbbox()
        assert bounds, f"Empty sprite {source}"
        left, top, right, bottom = bounds
        picture = picture.crop((max(0, left-8), max(0, top-8), min(picture.width, right+8), min(picture.height, bottom+8)))
    else:
        picture = picture.convert("RGB")
    picture.thumbnail(size, Image.Resampling.LANCZOS)
    destination = ASSETS / (name + ".webp")
    picture.save(destination, quality=90, method=6)
    report.append({"source": source, "sourceSha256": hashlib.sha256((ART / source).read_bytes()).hexdigest(),
                   "output": destination.relative_to(ROOT).as_posix(), "width": picture.width,
                   "height": picture.height, "bytes": destination.stat().st_size, "alpha": transparent})

package(Image.open(ART / "campaign-shop-cold-original.png"), "campaign-shop-cold-original.png",
        "campaign-shop-cold", (1536, 1024), False)
package(Image.open(ART / "campaign-fridge-original.png"), "campaign-fridge-original.png",
        "campaign-fridge", (1100, 850), True)
atlas = Image.open(ART / "cold-goods-atlas-original.png")
assert atlas.mode == "RGBA"
for index, name in enumerate(["eggs", "cheese", "juice"]):
    cell = atlas.crop((index*atlas.width//3, 0, (index+1)*atlas.width//3, atlas.height))
    package(cell, "cold-goods-atlas-original.png", name, (320, 420), True)
(ART / "cold-art-manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf8")
for asset in report:
    print(f"{asset['output']}: {asset['width']} x {asset['height']}, {asset['bytes']} bytes")
