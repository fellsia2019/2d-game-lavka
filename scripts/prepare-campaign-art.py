"""Package campaign PNG originals into local WebP assets without altering sources."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "docs" / "art"
ASSETS = ROOT / "public" / "assets"
ITEMS = [
    ("campaign-shop-empty-original.png", "campaign-shop-empty.webp", (1536, 1024), False),
    ("campaign-map-cleared-original.png", "campaign-map.webp", (1536, 1024), False),
    ("campaign-shelving-original.png", "campaign-shelving.webp", (1000, 700), True),
    ("campaign-basket-original.png", "campaign-basket.webp", (640, 320), True),
]

report = []
for source_name, output_name, size, transparent in ITEMS:
    source = ART / source_name
    picture = Image.open(source)
    source_size = picture.size
    picture = picture.convert("RGBA" if transparent else "RGB")
    if transparent:
        assert picture.getchannel("A").getextrema()[0] == 0, f"{source_name}: actual alpha required"
        bounds = picture.getchannel("A").point(lambda value: 255 if value > 48 else 0).getbbox()
        assert bounds, f"{source_name}: empty sprite"
        left, top, right, bottom = bounds
        picture = picture.crop((max(0, left - 8), max(0, top - 8),
                                min(picture.width, right + 8), min(picture.height, bottom + 8)))
    picture.thumbnail(size, Image.Resampling.LANCZOS)
    destination = ASSETS / output_name
    picture.save(destination, format="WEBP", quality=90, method=6)
    packaged = Image.open(destination)
    if transparent:
        assert packaged.mode == "RGBA" and packaged.getchannel("A").getextrema()[0] == 0
    entry = {
        "source": f"docs/art/{source_name}",
        "sourceSize": list(source_size),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "runtime": f"public/assets/{output_name}",
        "runtimeSize": list(packaged.size),
        "bytes": destination.stat().st_size,
        "transparent": transparent,
    }
    report.append(entry)
    print(f"{output_name}: {packaged.width} x {packaged.height}, {entry['bytes']} bytes; alpha={transparent}")
(ROOT / "docs" / "campaign-art-report.json").write_text(
    json.dumps({"assets": report, "bytes": sum(item["bytes"] for item in report)},
               ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
