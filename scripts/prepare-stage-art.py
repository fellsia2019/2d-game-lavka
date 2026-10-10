"""Slice generated Stage 1–2 atlases; preserve original alpha and save manifest."""
from pathlib import Path
import hashlib
import json
from PIL import Image
import numpy as np
from collections import deque

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'docs/art'
OUT = ROOT / 'public/assets'
ATLASES = [
    ('stage-construction-atlas-original.png', 4, 3, 'site', [
        'rubbish', 'ruins', 'vines', 'stumps', 'rough-ground', 'clear-ground',
        'outline', 'foundation', 'frame', 'walls', 'roof', 'windows-door']),
    ('stage-shop-furniture-atlas-original.png', 4, 4, 'furniture', [
        'bread-stand', 'bread-trays', 'packing-table', 'scale', 'order-rack',
        'door', 'awning', 'lanterns', 'bag-stand', 'bench', 'directions',
        'pickup-counter', 'trolley', 'cupboard', 'crates', 'pallet']),
    ('stage-shop-expansion-atlas-original.png', 4, 4, 'furniture', [
        'floor-broken', 'floor-new', 'wall-panel', 'modular-shelf',
        'base-cabinet', 'groceries-stand', 'tea-shelf', 'condiment-stand',
        'bag-roll', 'terminal', 'counter-extension', 'side-counter',
        'return-bin', 'shopping-baskets', 'price-holders', 'window-display']),
    ('stage-warehouse-furniture-atlas-original.png', 4, 4, 'furniture', [
        'category-boards', 'sacks', 'ice-chest', 'inspection-table',
        'tool-cupboard', 'metal-bins', 'packing-station', 'supply-bell',
        'insulation', 'cold-cabinet', 'wire-shelves', 'thermometer',
        'flour-rack', 'sugar-containers', 'wash-basin', 'drying-rack']),
    ('stage-fruit-furniture-atlas-original.png', 4, 4, 'furniture', [
        'canopy', 'wind-screens', 'spotlight', 'direction-post',
        'fruit-stand', 'fruit-baskets', 'citrus-stand', 'banana-bar',
        'walkway', 'packaging-cupboard', 'hamper-counter', 'opening-sign',
        'fruit-island', 'tiered-baskets', 'berry-case', 'large-sign']),
    ('stage-goods-atlas-original.png', 5, 3, '', [
        'apple', 'orange', 'banana', 'rice', 'tea', 'olive-oil', 'flour',
        'sugar', 'coffee', 'olives', 'pasta', 'canned-tomatoes', 'peach',
        'grape', 'strawberry']),
]
report = []
sprite_sources = {}

def object_sprites(image, columns, rows):
    """Identify complete alpha-connected objects rather than cutting nominal grid borders.

    Generated atlases have generous gaps but rows and columns are not mathematically
    equal. Connected silhouettes are assigned by their centroid; paired lanterns and
    multi-part baskets stay together. Max pooling preserves faint alpha edges.
    """
    rgba = np.array(image)
    alpha = rgba[:, :, 3]
    height, width = alpha.shape
    scale = 3
    padded = np.pad(alpha, ((0, (-height) % scale), (0, (-width) % scale)))
    low = padded.reshape(padded.shape[0] // scale, scale, padded.shape[1] // scale, scale).max(axis=(1,3)) > 4
    labels = np.zeros(low.shape, dtype=np.int16)
    objects = []
    label_id = 0
    for y, x in zip(*np.nonzero(low)):
        if labels[y,x]: continue
        label_id += 1
        queue = deque([(int(y),int(x))]); labels[y,x] = label_id
        pixels = []
        while queue:
            cy,cx = queue.pop(); pixels.append((cy,cx))
            for ny,nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                if 0 <= ny < low.shape[0] and 0 <= nx < low.shape[1] and low[ny,nx] and not labels[ny,nx]:
                    labels[ny,nx] = label_id; queue.append((ny,nx))
        if len(pixels) < 25: continue
        points = np.array(pixels)
        cx = points[:,1].mean() * scale / width
        cy = points[:,0].mean() * scale / height
        col = min(columns - 1,max(0,int(cx * columns)))
        row = min(rows - 1,max(0,int(cy * rows)))
        objects.append((label_id,row * columns + col,len(pixels)))
    ownership = np.full(low.shape,-1,dtype=np.int16)
    for label_id,index,_ in objects: ownership[labels == label_id] = index
    full = np.repeat(np.repeat(ownership,scale,axis=0),scale,axis=1)[:height,:width]
    for index in range(columns * rows):
        mask = full == index
        assert np.any(mask), f'No connected sprite at {index}'
        pixels = rgba.copy(); pixels[:,:,3] = np.where(mask,alpha,0)
        sprite = Image.fromarray(pixels,'RGBA')
        bounds = sprite.getchannel('A').getbbox()
        l,t,r,b = bounds
        crop = (max(0,l-4),max(0,t-4),min(width,r+4),min(height,b+4))
        yield sprite.crop(crop), list(crop)

def record(source, dest, image, bounds=None):
    temporary = dest.with_name(dest.name + '.tmp')
    image.save(temporary, 'WEBP', quality=92, method=6)
    temporary.replace(dest)
    report.append({'source': str(source.relative_to(ROOT)),
                   'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                   'runtime': str(dest.relative_to(ROOT)), 'size': list(image.size),
                   'bytes': dest.stat().st_size, 'alpha': image.mode == 'RGBA',
                   'sourceCrop': bounds})

for file, columns, rows, prefix, names in ATLASES:
    source = ART / file
    image = Image.open(source).convert('RGBA')
    assert image.getchannel('A').getextrema()[0] == 0, f'{file}: alpha required'
    for name, (sprite,crop) in zip(names,object_sprites(image,columns,rows)):
        sprite.thumbnail((360, 440) if not prefix else (540, 440), Image.Resampling.LANCZOS)
        sprite_sources[f'{prefix + "-" if prefix else ""}{name}'] = (source,sprite.copy(),crop)
        dest = OUT / f'{prefix + "-" if prefix else ""}{name}.webp'
        record(source, dest, sprite, crop)

source,lanterns,source_crop = sprite_sources['furniture-lanterns']
for name,half in [('left',(0,0,lanterns.width//2,lanterns.height)),
                  ('right',(lanterns.width//2,0,lanterns.width,lanterns.height))]:
    image = lanterns.crop(half)
    image = image.crop(image.getchannel('A').getbbox())
    record(source,OUT/f'furniture-lantern-{name}.webp',image)
    report[-1]['derivedFrom'] = 'furniture-lanterns'
source,canopy,_ = sprite_sources['furniture-canopy']
image = canopy.crop((0,0,canopy.width,round(canopy.height*.52)))
record(source,OUT/'site-pavilion-roof.webp',image)
report[-1]['derivedFrom'] = 'furniture-canopy, upper 52%'

source = ART / 'stage-display-window-original.png'
image = Image.open(source).convert('RGBA')
bounds = image.getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
image = image.crop(bounds)
image.thumbnail((640,440),Image.Resampling.LANCZOS)
record(source,OUT/'furniture-display-window.webp',image,list(bounds))

for file, runtime in [('stage-warehouse-empty-original.png', 'stage-warehouse-empty.webp'),
                      ('stage-shop-expansion-empty-original.png', 'stage-shop-expansion-empty.webp'),
                      ('stage-fruit-market-empty-original.png', 'stage-fruit-market-empty.webp'),
                      ('stage-shop-front-empty-original.png', 'stage-shop-front-empty.webp'),
                      ('stage-warehouse-yard-empty-original.png', 'stage-warehouse-yard-empty.webp'),
                      ('campaign-map-cleared-original.png', 'campaign-map.webp')]:
    source = ART / file
    image = Image.open(source).convert('RGB')
    image.thumbnail((1536, 1024), Image.Resampling.LANCZOS)
    record(source, OUT / runtime, image)

(ART / 'stage-art-manifest.json').write_text(json.dumps({
    'date': '2026-10-06', 'assets': report,
    'bytes': sum(entry['bytes'] for entry in report),
}, ensure_ascii=False, indent=2) + '\n')
print(f'{len(report)} assets, {sum(entry["bytes"] for entry in report):,} bytes')
