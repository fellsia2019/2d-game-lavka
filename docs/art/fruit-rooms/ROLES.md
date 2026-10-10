# Image roles

Every PNG is an original full 1536×1024 ImageGen plate. Every `.prompt.txt` records the built-in request; no bitmap was painted by code. Edits explicitly preserve the target camera and frame. Style input was `../shop-expansion/grocery-master.png` where stated in prompt.

- `pavilion-master`: accepted exterior identity; `pavilion-draft` is discarded photographic version. Master edit used draft as target and grocery room as style reference.
- `pavilion-frame`: master edit, open roof rafters and rough slab, no lamps/steps.
- `pavilion-foundation`: frame edit, removes all timber above whole slab.
- `pavilion-clear`: foundation edit, removes slab to reveal prepared land.
- `pavilion-before`: clear edit, five distinct cleanup groups.
- `market-master`: accepted independent interior; `market-draft` is discarded cropped-right version. Draft used pavilion identity and grocery style references; master edit contained the whole right counter/baskets and shortened the runner.
- `market-bare`: master edit, empty trays, no stock/scale/runner/sign/bench.
- `market-structure`: bare edit, only the main counter without baskets and full packaging cupboard.
- `market-empty-v2`: corrected empty interior preserving the open left/right sides and square teal rear wall. Earlier `market-empty` is rejected for invented architecture.
- `market-before-v2`: corrected empty edit with whole rough cement floor; earlier `market-before` is rejected.
- `extension-master`: accepted independent exterior identity.
- `extension-walls`: master edit, masonry walls, open holes and roof rafters.
- `extension-frame`: walls edit, full timber frame on same foundation.
- `extension-foundation`: frame edit, complete foundation alone.
- `extension-clear`: foundation edit, prepared land.
- `extension-before`: clear edit, neglected site debris.
- `hall-master`: accepted independent interior; `hall-draft` is discarded cropped furniture version. Draft used extension identity and grocery style references; master edit recomposed the room to fit every full furniture piece.
- `hall-bare`: master edit, all goods removed, empty basket/rack/case/counters; no lights or sign.
- `hall-structure`: bare edit, removes basket stand and pickup cabinet to reveal the complete side/base of the earlier rack and glass case.
- `hall-empty`: master edit, no furniture/goods/lamps/sign; finished whole floor.
- `hall-before`: empty edit, whole rough cement floor.

Runtime exports only accepted named sources; drafts are not included in FRUIT_ASSETS.

Additional registered construction sources and support restoration:

- `pavilion-roof`: frame edit adds complete cream/teal roof, preserving rough whole slab without steps or lamps.
- `pavilion-cleared-1` through `pavilion-cleared-4`: consecutive full-frame cleanup states derived from `pavilion-before`; remove one complete debris group at a time, avoiding rectangular soil patches.
- `market-supported`: master edit removes only the future low mixed-fruit display to reveal every citrus-rack support.
- `extension-plinth`: complete closed low stone perimeter on the same construction footprint, before filling the foundation.
- `extension-unlit`: master edit removes the future exterior lamp. Used for installed windows and doors.
- `extension-roof`: unlit edit removes the entire door assembly and approach stones. Full roof-ready shell with the two installed windows, before doors and connecting path.

User-reported integrity repair, 9 October 2026:

- `market-table-stock-v2`: master edit removes the later pickup cabinet, shopping baskets, tall cupboard and two plants around the table; reconstructs the entire fourth leg and straight square feet. Preserves scales and packing supplies.
- `market-table-empty-v2`: stock-v2 edit removes only scales and packing supplies, preserving the whole table geometry.
- `hall-left-stock-v2`: hall-master edit removes all right-hand furnishings, lamps and sign; preserves the complete stocked left rack and basket stand.
- `hall-left-empty-v2`: left-stock-v2 edit removes only produce, preserving all furniture outer rims, supports and shadows.
- `hall-rack-only-v2`: left-empty-v2 edit removes only the basket stand and restores the full unobstructed side/base of the rack.

All five v2 repair plates are built-in ImageGen originals and use the same 1536×1024 registration. Their prompts are adjacent `.prompt.txt` files.
