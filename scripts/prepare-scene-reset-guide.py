"""Draw a camera-locked concept guide, not game art. Requires Pillow.

All cuboids use the same orthographic projection and physical units. Nothing
is imported by the application; ImageGen can use this guide as its reference.
"""
from pathlib import Path
from math import sqrt, atan, degrees
import json
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/art/concepts"
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1536, 1024
SCALE = 170
ORIGIN = (768, 376)
U = SCALE / sqrt(2)
V = SCALE / sqrt(6)
Z = SCALE * sqrt(2 / 3)
polygons = []

def project(p):
    x, y, z = p
    return (ORIGIN[0] + U * (x - y), ORIGIN[1] + V * (x + y) - Z * z)

def quad(points, color, stroke="#49666a", width=2):
    polygons.append((points, color, stroke, width))

def plane_x(x, y0, y1, z0, z1, color):
    quad([(x,y0,z0),(x,y1,z0),(x,y1,z1),(x,y0,z1)],color)

def plane_y(y, x0, x1, z0, z1, color):
    quad([(x0,y,z0),(x1,y,z0),(x1,y,z1),(x0,y,z1)],color)

faces = []
def box(name, x, y, z, w, d, h, color="#3d9299", top="#d9a16b"):
    X,Y,T = x+w,y+d,z+h
    visible = [
        ([(x,Y,z),(X,Y,z),(X,Y,T),(x,Y,T)],color),
        ([(X,y,z),(X,Y,z),(X,Y,T),(X,y,T)],"#28747c"),
        ([(x,y,T),(X,y,T),(X,Y,T),(x,Y,T)],top),
    ]
    for vertices, paint in visible:
        faces.append((sum(sum(p) for p in vertices)/len(vertices), vertices, paint))
    return dict(id=name,position=[x,y,z],size=[w,d,h],rotation=0)

quad([(0,0,0),(5,0,0),(5,4,0),(0,4,0)],"#e1ba88","#ab8156",3)
plane_y(0,0,5,0,2.65,"#f0dec1")
# Door opening on the left wall is a real missing section, not an overlay.
plane_x(0,0,2.8,0,2.65,"#ead5b4")
plane_x(0,3.8,4,0,2.65,"#ead5b4")
plane_x(0,2.8,3.8,2.1,2.65,"#ead5b4")
plane_x(-.015,2.8,3.8,0,2.1,"#8cc9df")
plane_x(.015,.76,2.4,1.62,2.4,"#8cc9df")
for y in [.76,1.58,2.4]:
    plane_x(.03,y-.025,y+.025,1.6,2.43,"#428c96")
for z in [1.62,2.4]:
    plane_x(.03,.735,2.425,z-.025,z+.025,"#428c96")

objects = []
def add(*args, **kwargs):
    result = box(*args, **kwargs)
    objects.append(result)
    return result

add('west-cabinet',.035,.12,0,.63,2.43,.88)
add('north-cabinet',.12,.035,0,4.66,.63,.88)
# Broad integrated produce bins have a 0.08m front lip and a 0.20m back.
for i,y in enumerate([.22,1.36]):
    add(f'west-bin-floor-{i}',.14,y,.9,.5,1.04,.035,top="#c79a68")
    add(f'west-bin-back-{i}',.12,y,.9,.045,1.04,.20,"#ba8755")
    add(f'west-bin-front-{i}',.64,y,.9,.035,1.04,.08,"#c59762")
    for side in [y,y+1.0]:
        add(f'west-bin-side-{i}-{side}',.12,side,.9,.55,.035,.2,"#bd895a")
for i,x in enumerate([.24,1.76,3.28]):
    add(f'north-bin-floor-{i}',x,.14,.9,1.34,.5,.035,top="#c79a68")
    add(f'north-bin-back-{i}',x,.12,.9,1.34,.035,.20,"#ba8755")
    add(f'north-bin-front-{i}',x,.64,.9,1.34,.035,.08,"#c59762")
    for side in [x,x+1.3]:
        add(f'north-bin-side-{i}-{side}',side,.12,.9,.035,.55,.2,"#bd895a")

add('north-shelf-back',.12,.025,.88,4.66,.09,1.12,"#438b91",top="#4f989c")
for z in [1.37,1.95]:
    add(f'north-shelf-{z}',.12,.09,z,4.66,.51,.05)
for x in [.12,1.64,3.16,4.72]:
    add(f'north-divider-{x}',x,.1,.88,.06,.54,1.12)
add('counter',2.2,1.9,0,2.4,.7,.9)
add('counter-top',2.14,1.86,.9,2.52,.78,.08,"#cc955e",top="#dfb07a")
add('register',3.75,2.03,.98,.49,.36,.42,"#b98e3a",top="#d7b86e")

for _,vertices,paint in sorted(faces,key=lambda f:f[0]):
    quad(vertices,paint)

# Resolve depth per pixel, not by the centroid of long shelves. Centroid sorting
# incorrectly lets a distant end of a cabinet cover a nearby produce bin.
pixels = np.zeros((H,W,3),dtype=np.uint8)
pixels[:] = [248,241,228]
depth = np.full((H,W),-np.inf)
for vertices,paint,_,_ in polygons:
    projected = [project(p) for p in vertices]
    color = [int(paint[i:i+2],16) for i in (1,3,5)]
    for indices in [(0,1,2),(0,2,3)]:
        a,b,c = [projected[i] for i in indices]
        da,db,dc = [sum(vertices[i]) for i in indices]
        x0 = max(0,int(min(a[0],b[0],c[0])))
        x1 = min(W,int(max(a[0],b[0],c[0]))+1)
        y0 = max(0,int(min(a[1],b[1],c[1])))
        y1 = min(H,int(max(a[1],b[1],c[1]))+1)
        den = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-8 or x0>=x1 or y0>=y1: continue
        yy,xx = np.mgrid[y0:y1,x0:x1]
        xx,yy = xx+.5,yy+.5
        wa = ((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
        wb = ((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den
        wc = 1-wa-wb
        d = wa*da+wb*db+wc*dc
        mask = (wa>=0)&(wb>=0)&(wc>=0)&(d>=depth[y0:y1,x0:x1]-1e-8)
        pixels[y0:y1,x0:x1][mask] = color
        depth[y0:y1,x0:x1][mask] = d[mask]
Image.fromarray(pixels).save(OUT/'scene-reset-camera-guide.png')
data = dict(status='PROPOSAL_ONLY',units='meters',room=[5,4,2.65],
    projection=dict(type='orthographic',origin=ORIGIN,
        matrix=[[U,-U,0],[V,V,-Z]],wallAxisAngleDegrees=degrees(atan(V/U))),
    door=dict(wall='x=0',interval=[2.8,3.8],height=2.1),
    clearance=dict(staffAisleToCounterBody=1.225,staffAisleToCountertop=1.185,
        entranceNotOccupied=True),objects=objects)
(OUT/'scene-reset-camera-guide.json').write_text(json.dumps(data,indent=2)+'\n')
print(f'{len(objects)} modules; wall axes ±{data["projection"]["wallAxisAngleDegrees"]:.1f}°; proposal files in docs/art/concepts')
