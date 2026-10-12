# Промпты переделки ресторана, 12 октября 2026

Исполнитель: GPT-6 Astra; все растровые правки — встроенный ImageGen, режим edit,1536×1024. Ни CLI, ни внешние API не использовались. Ниже сохранён финальный набор требований по источникам; входные изображения указаны относительно `docs/art`. Промежуточные отклонённые варианты не входят в runtime. Точные выбранные файлы и SHA256 закреплены export-manifest.json.

## Фасад

`restaurant-rooms/yard-rework-v4.png` ← `restaurant-rooms/yard-clear.png`:

> Use case: precise-object-edit. 1536x1024. Build a two-storey restaurant by adding a SECOND STOREY vertically on top of this shop. Keep ALL of the existing ground floor, landscape, paving, flowers, door, windows and awning exactly as drawn. The physical model is CRITICAL: extend the existing shop walls straight upward with NO SIDEWAYS SHIFT and NO SETBACK. The second-floor FRONT LEFT corner must lie DIRECTLY ABOVE the left end of the lower storefront at x330. Its FRONT RIGHT corner must lie DIRECTLY ABOVE the right lower facade corner at x1088. The upper right SIDE WALL must follow the existing right shop wall perspective, back corner x1278. Thus the exact existing roof footprint supports the new walls. Replace blue edging with cream stone. Second storey height ~255 px with low red tiled hip roof fully visible with sky margin. Front has two turquoise windows (two upper small panes, one lower broad pane) followed by turquoise entrance door near RIGHT end. Door reached by external stone staircase along right/east SIDE wall, small corner landing, not a long front balcony. Separate small kitchen balcony near far right/rear side wall with a matching blue railing and supports. Rear copper chimney. Believable aligned architectural construction, crisp warm coastal illustrated game rendering, vertical wall corners straight, no leaning, no disjointed wings. No text, no people.

**Проверка результата:** фактическая левая несущая линия осталасьx397, за выступающим консольным карнизомx330; это сопоставлено с нижней кладкой и явно записано в модели. Буквальное выполнение всех координат промпта не предполагается.

`yard-rework-v5.png` ← `yard-rework-v4.png`:

> Preserve this exact 1536x1024 game image and geometry. Change ONLY two upper FRONT windows: remove their flower boxes completely to reveal clean cream wall below. Each window must have exactly THREE panes: two small upper panes side by side above a single continuous large lower pane. Thus ONE short central vertical divider ONLY in top row; no divider in bottom large pane. Current four little top panes must become two. Keep original outer frames, door, upper walls, roof, staircase, balcony, whole lower shop, all landscape absolutely unchanged. Keep crisp detail. No additional changes.

`yard-walls-rework-v4.png` ← `yard-rework-v5.png`: same registered walls and openings; remove roof/chimney, frames/glass/upper doors, lamps/plants/stair/balcony; leave unfinished cream masonry, dark openings and original lower shop.

`yard-foundation-rework-v4.png` ← `yard-clear.png`: replace only blue roof fascia with cream limestone blocks in same position/thickness/footprint; keep flat roof and all other content unchanged.

## Интерьеры

`hall-rework-v4.png` ← `hall-master-v3.png`: preserve architecture, camera, floor, windows, doorway, tables, chairs and lamps; replace tall right display cabinet and low left wooden sideboard with straight furniture flush along their side walls, facing room center, following side wall perspective. Symmetric doors, straight shelves, full feet; no large shadows, small contact shadows only; free doorway/aisle.

`kitchen-rework-v4.png` ← `kitchen-master-v3.png`: keep room architecture and equipment registered; shorten right serving table to follow right wall plane with four straight grounded legs; rebuild left tray cabinet with parallel verticals and castors; wooden prep table back edge against left wall, full legs and shelf; short contact shadows only.

`kitchen-prep-rework-v4.png` ← `kitchen-rework-v4.png`: remove only near-left tray cabinet, restore complete wooden table behind it with four legs and bottom shelf. Remove unused narrow undercounter cupboard between cooker and right table; reveal bare wall; keep all other furniture registered.

`hall-stair-rework-v4.png` ← `hall-empty.png` + exterior `yard-rework-v5.png`:

> Image1 is exact1536x1024 empty restaurant hall edit target. Image2 same building exterior railing reference. Change ONLY the exterior staircase landing railing visible THROUGH LEFT GLASS DOOR in Image1. Replace its thin metal spindles with turquoise painted wooden railing matching Image2: thicker square posts with round ball finial, simple straight upright wooden balusters and horizontal or stair-slope flat handrail, no circles/crosses. Keep exact view through door, railing position/height, landing footprint, sea view, plant, glass door and all room architecture, windows, walls, ceiling and floor unchanged/pixel registered. No furniture or new decor. Tiny precise correction of railing construction ONLY.

`kitchen-balcony-rework-v4.png` ← `kitchen-empty.png` + exterior `yard-rework-v5.png`:

> Image1 is exact 1536x1024 empty kitchen interior edit target. Image2 is same building exterior reference for BALCONY RAILING ONLY. Replace the ornamental thin metal railing with circles seen through the right open kitchen door in Image1 with the balcony railing from Image2: turquoise painted WOOD, thicker square posts, simple straight upright wooden balusters, horizontal flat handrail, round ball finials on the corner posts, no circles and no diagonal crosses. Maintain exact interior camera, balcony floor footprint/height and outside sea view. Change only visible balcony railing, keep door/frame/open leaf, all wall/floor architecture and ALL other pixels registered unchanged. No new furniture, no people, no additional decor.

## Карта

`restaurant-map/ready-rework-v4.png` ← `restaurant-map/clear.png` + `restaurant-rooms/yard-rework-v5.png`: add matching upstairs restaurant to central shop only, preserve original map perspective and lower shop. Aligned bearing walls, cream masonry, low red hip roof, copper chimney, W1/W2 three-pane windows, front-rightD1 with east stair, separate rear-eastD3 balcony with blue railing/brackets. Entire map surroundings unchanged.

`ready-rework-v5.png` ← `ready-rework-v4.png`: shorten central restaurant chimney so complete pointed cap fits inside image with trees/sky above; every other object unchanged.

`walls-rework-v4.png` ← `ready-rework-v5.png`: same upper wall outline/position; remove roof/chimney, glazing/doors, upper lamps/plants/stair/balcony; keep dark openings, cream support slab, lower facade and map untouched.

`door-rework-v6.png` ← `ready-rework-v5.png`:

> Fix ONLY the kitchen balcony access on central upstairs restaurant's RIGHT/EAST SIDE WALL. Currently the narrow turquoise opening to left of tiny balcony reads as short window. Replace it with a full height turquoise glazed DOOR that extends down to the balcony floor at y168, opening onto that very balcony, behind its railing. Balcony and door must physically connect: balcony platform continues left to door threshold. Keep existing balcony footprint, front facade, windows, front entrance/stair, roof/chimney, entire lower shop and rest of map completely unchanged. Full-height side door, NOT a window, no sill, clear threshold level with balcony floor. Same painterly style.

Вruntime из `door-rework-v6` берётся только боковая дверь: добавленный генератором лишний цветочный горшок уD1 исключён маской.


`walls-rework-v7.png` ← `door-rework-v6.png`: regenerate the same unfinished central upper storey with both windows and BOTH full-height door openings, removing roof/chimney/frames/glass/stair/balcony/plants/lamps. SideD3 must remain a doorway down to its threshold, not a short window. Lower shop and map unchanged. Replaces the earlier rough donor, whose side opening was too short.


## Целые двери до лестницы — yard-doors-rework-v4

Встроенный ImageGen, precise-object-edit. Edit target: actual кадр работы 10, сохранённый воспроизводимым renderer; полный новый PNG `restaurant-rooms/yard-doors-rework-v4.png`. В runtime заимствуются только два зарегистрированных дверных прямоугольника работы 10. Работа 12 перекрывает их готовым фасадом.

> Correct ONLY the two upstairs doors: remove the tiny detached turquoise railing post and rail fragments that overlap the bottom-right of the front upstairs door (x991–1028,y339–417), and remove the balusters, horizontal rail and plant that overlap the bottom of the narrow right-side upstairs door (x1178–1217,y284–398). Reconstruct complete unobstructed turquoise wooden door leaves in their original existing openings, with the same upper glass panes and lower solid turquoise panels. Keep both doors’ size, position, wall thickness, frame and perspective exactly unchanged. Do NOT add balconies, stairs, rails, plants or lights. Preserve every other pixel/composition/roof/windows/walls/ground and camera. Full wide 1536x1024 output, same framing. This is the pre-staircase construction stage: two complete closed doors only, no detached posts or railing fragments.


## Двери карты до лестницы — doors-rework-v8 / door-side-rework-v9

Встроенный ImageGen. `doors-rework-v8.png` — полный actual map10 edit target после удаления выступа D1; экспортируется только область D1 750,94–800,199. Несколько full-map попыток не устранили малый выступ D3 и не используются для его экспорта. Поэтому увеличенный inspection crop исходной D3 (825,80–865,195) передан как отдельный edit target, результат `door-side-rework-v9.png` уменьшен до 40×115 и показывается в исходных координатах только на работах 10–11. Начиная с 12 сохраняются прежние готовые доноры.

Промпт D1: remove the tiny isolated turquoise railing finial/post overlapping the lower right of front door D1 around x795,y168–197; reconstruct the complete closed turquoise wooden door leaf, upper glass panes and lower solid panels, in exactly its existing position and size. Preserve precisely the camera, framing, roof, walls, windows and every other building.

Промпт отдельной D3 (дословно):

> Precise object edit of this enlarged door crop. REMOVE the huge curved turquoise protruding handle at the BOTTOM of the door and the white knob above it. Replace this malformed bottom 20% with straight vertical turquoise wooden door boards finishing at a normal simple beige stone threshold. No blue structure protrudes outside the door opening. The door is a complete closed wooden turquoise door with four upper glass panes and vertical lower wood planks. Keep exact camera angle, existing door dimensions and perspective, surrounding beige wall. Keep the cropped narrow vertical framing, no zoom or extra scenery. The only handle is a small dark normal handle at mid-height; NO handle or knob at floor height.
