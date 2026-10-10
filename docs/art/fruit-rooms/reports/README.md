# Fruit integrity repair evidence

User inputs: `../../review-2026-10-09/fruit-table-user.png`, `fruit-rack-user.png`, `fruit-hall-user.png`.

`*-before.png` are 3× nearest-context crops from actual production Canvas screenshots. `*-source.png` and `*-grid.png` show independent original donor geometry and coordinate measurements. `*-after-local*.png` are local Canvas2D composition crops, not gameplay/browser acceptance.

The earlier local widened masks in `left-group-17-after-local.png` and `left-group-25-after-local.png` are **rejected iterations**: visible background polygons. Current narrow whole-object perimeters are shown in `left-17-after-local.png` and `left-25-after-local-final.png`.

Stage 1 checks: t17 banana right continuous support; t18/t19 full table and four feet; t25 mixed-display upright. Stage 2 checks: t11 entire bare rack, t12 bare basket rims/supports with next stock preview, t13 stocked group, and t20 persistence. Each needs actual default and Canvas2D captures at desktop and 360 px after freeze.

`*-production-four-views.png` contain actual production crops from desktop default, desktop Canvas2D, mobile 360 default and mobile 360 Canvas2D. All 24 crops were personally inspected. The mixed-display grid exposed an additional tiny bright gap where two support masks met around source [199,535]; that grid is **before the final joint correction**, not acceptance evidence. `mixed-joint-source.png` shows the uninterrupted master beam; `mixed-joint-after-local.png` shows the corrected overlap (one contour point [200,534] → [194,528]). The final joint was then checked in fresh production for all four renderer/viewport combinations; `mixed-joint-final-production.png` shows the continuous beam without the bright gap.

Final personal review: all 28 fresh Canvas2D frames are collected in `final-fallback-grid-1.png` through `final-fallback-grid-7.png`; six default full frames (s1t26, s2t11, s2t20 at desktop and 360 px) are in `final-runtime-*.png`. These were inspected after the last contour correction. The six original fruit ROIs fail in archived old production and pass in new production against the same screenshot-based independent reference; numeric evidence is `../../review-2026-10-09/contour-regression.json`. Detailed scope and limitations are in `../../FRUIT_ROOMS.md`.
