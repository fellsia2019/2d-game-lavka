"""Package supplied/generated art into reusable, compressed runtime assets.
No source image is overwritten. Run with Python + Pillow.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
art = ROOT / 'docs' / 'art'; art.mkdir(exist_ok=True)
assets = ROOT / 'public' / 'assets'; assets.mkdir(exist_ok=True)

atlas = Image.open(art / 'goods-atlas-original.png')
assert atlas.mode == 'RGBA' and atlas.getchannel('A').getextrema()[0] == 0
w, h = atlas.size
for n, name in enumerate(['jam', 'milk', 'bread', 'pear', 'honey', 'lemon']):
    col, row = n % 3, n // 3
    sprite = atlas.crop((col*w//3, row*h//2, (col+1)*w//3, (row+1)*h//2))
    # Tight per-object cells retain aspect ratio, so the bottle can be tall in
    # a narrow gameplay slot rather than fitting a wasteful square atlas cell.
    bounds = sprite.getchannel('A').point(lambda a: 255 if a > 48 else 0).getbbox()
    if bounds:
        x0,y0,x1,y1 = bounds
        sprite = sprite.crop((max(0,x0-8),max(0,y0-8),min(sprite.width,x1+8),min(sprite.height,y1+8)))
    sprite.thumbnail((320, 420), Image.Resampling.LANCZOS)
    sprite.save(assets / f'{name}.webp', quality=91, method=6)

shelf = Image.open(art / 'shelf-original.png')
# Tight silhouette bounds retain the generated transparent border and texture.
box = shelf.getchannel('A').getbbox()
shelf = shelf.crop(box)
shelf.thumbnail((1000, 600), Image.Resampling.LANCZOS)
shelf.save(assets / 'shelf.webp', quality=90, method=6)
scene = Image.open(ROOT / 'docs' / 'reference' / 'coastal-shop-concept.png').convert('RGB')
scene.save(assets / 'shop.webp', quality=88, method=6)
print('\n'.join(f'{p.name}: {p.stat().st_size:,} bytes' for p in assets.glob('*.webp')))

# Repair layers preserve generated alpha and share the runtime sprite pipeline.
for source, name, size in [('counter-original.png', 'counter', (1400, 700)), ('garden-original.png', 'garden', (900, 600))]:
    sprite = Image.open(art / source).convert('RGBA')
    assert sprite.getchannel('A').getextrema()[0] == 0, f'{source}: transparent alpha required'
    bounds = sprite.getchannel('A').getbbox()
    if bounds: sprite = sprite.crop(bounds)
    sprite.thumbnail(size, Image.Resampling.LANCZOS)
    sprite.save(assets / f'{name}.webp', quality=90, method=6)
    print(f'{name}.webp: {sprite.width} × {sprite.height}, { (assets / (name+".webp")).stat().st_size:,} bytes')
