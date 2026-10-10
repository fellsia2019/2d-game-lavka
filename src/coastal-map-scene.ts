/** Registered coastal map artwork. Ownership and navigation remain with campaign/world. */
export const COASTAL_MAP_VERSION = 'coastal-map-2';
const plates = ['dormant', 'tidied', 'rough', 'cleared', 'foundation', 'structure', 'roofed', 'ready', 'complete'] as const;
type Plate = typeof plates[number];
const bakeryPlates = ['before', 'clear', 'foundation', 'walls', 'roof', 'ready', 'final'] as const;
const terracePlates = ['before', 'clear', 'foundation', 'frame', 'roof', 'ready', 'final'] as const;
export const COASTAL_MAP_ASSETS = [...plates.map(name => `coastal-map-${name}-v1.webp`),
  ...bakeryPlates.map(name => `coastal-bakery-map-${name}.webp`),
  ...terracePlates.map(name => `coastal-terrace-map-${name}.webp`)];
export const COASTAL_BAKERY_SITE = {
  domain: 'M993 322 L1010 303 L1015 290 L1064 253 L1277 263 L1277 234 L1303 228 L1338 234 L1338 275 L1411 297 L1422 329 L1425 454 L1410 486 L1330 496 L1242 479 L1160 474 L1071 457 L994 462 L980 445 Z',
  beforeDomain: 'M1000 298 L1177 292 L1210 265 L1234 283 L1248 284 L1248 261 L1311 261 L1321 296 L1431 298 L1424 452 L1395 470 L1359 477 L1050 446 L994 423 Z',
  footprint: 'M1050 435 L1333 472 L1406 420 L1131 391 Z',
} as const;

/** Terrace sources share the new stone foundation. Background outside these shapes stays live. */
export const COASTAL_TERRACE_SITE = {
  domain: 'M802 475 L885 472 L916 439 L988 432 L1050 439 L1110 450 L1238 447 L1294 453 L1340 478 L1418 494 L1412 641 L1390 659 L834 619 L772 602 Z',
  footprint: 'M880 582 L942 484 L1350 499 L1307 636 L985 623 Z',
  foundation: 'M877 574 L939 507 L941 500 L972 501 L971 497 L1318 520 L1318 532 L1345 532 L1348 559 L1321 608 L1318 640 L1290 650 L1168 643 L1137 647 L1013 640 L987 633 L876 611 Z',
  deck: 'M905 577 L956 495 L1322 512 L1293 605 L1293 626 L905 597 Z',
  frame: 'M886 451 L948 407 L1340 425 L1343 441 L1322 479 L1303 483 L1320 439 L957 424 L906 461 Z M886 451 L1318 469 L1318 490 L886 470 Z M886 466 L906 466 L906 574 L915 575 L914 603 L879 602 L879 576 L886 574 Z M1292 482 L1318 482 L1318 604 L1321 607 L1317 637 L1283 633 L1285 605 L1292 603 Z M1321 439 L1340 437 L1339 535 L1347 538 L1347 557 L1320 558 L1320 532 Z M945 423 L960 423 L960 501 L972 503 L972 529 L939 529 L939 505 L945 501 Z',
  roof: 'M883 451 L950 405 L1342 426 L1343 444 L1323 482 L1301 484 L889 467 Z',
  rails: 'M899 551 L944 489 L952 487 L1306 506 L1342 519 L1345 558 L1315 614 L1313 635 L1172 628 L1172 578 L1014 571 L1014 609 L905 603 Z',
  furnished: 'M852 548 L871 491 L899 479 L934 481 L942 473 L1292 488 L1331 481 L1347 524 L1368 556 L1360 606 L1342 634 L1311 638 L1172 628 L1171 607 L1140 608 L1137 641 L1010 635 L1009 604 L983 606 L880 608 L850 594 Z',
} as const;

export const COASTAL_MAP_SITES = [
  { id: 'fruit-extension', prefix: 'fruit-yard-s2-t', limit: 20,
    domain: 'M269 75 L552 75 L552 132 L516 140 L512 169 L486 183 L485 224 L456 238 L445 278 L416 312 L210 290 L202 267 L240 232 L265 202 Z',
    footprint: 'M303 242 L445 259 L508 212 L371 195 Z',
    mound: 'M342 215 Q362 177 408 191 Q426 190 448 222 L432 230 L376 227 Z',
    stump: 'M339 275 L348 263 L350 246 Q365 241 376 247 L379 262 L397 278 L377 282 L351 280 Z',
    frame: 'M303 137 L324 139 L324 246 L304 246 Z M431 150 L451 148 L451 260 L431 255 Z M507 126 L529 119 L530 176 L509 180 Z M304 137 L389 102 L530 117 L531 138 L392 124 L309 156 Z',
    facade: 'M310 151 L384 127 L442 155 L535 135 L535 151 L511 165 L486 184 L485 224 L453 240 L444 263 L310 249 Z' },
  { id: 'warehouse', prefix: 'warehouse-s1-t', limit: 26,
    domain: 'M971 29 L1465 29 L1465 289 L1444 289 L981 266 L963 239 Z',
    footprint: 'M1030 227 L1429 251 L1436 166 L1065 147 Z',
    mound: 'M1037 202 Q1047 174 1094 174 L1164 191 L1191 215 L1131 220 L1070 213 Z',
    stump: 'M1327 254 L1343 239 L1346 222 Q1359 216 1372 222 L1377 240 L1391 255 L1375 261 L1341 259 Z',
    lights: 'M1194 111 L1218 111 L1221 143 L1191 143 Z',
    equipment: 'M1296 214 L1411 214 L1411 270 L1296 267 Z' },
  { id: 'fruit-yard', prefix: 'fruit-yard-s1-t', limit: 26,
    domain: 'M180 369 L259 355 L420 367 L420 380 L610 390 L626 406 L661 439 L624 520 L581 593 L136 548 L119 515 Z',
    footprint: 'M246 523 L566 556 L615 464 L319 438 Z',
    mound: 'M222 475 L250 452 L306 449 L339 464 L372 478 L323 485 L258 485 Z M495 476 L530 450 L557 457 L586 483 L558 491 L522 485 Z',
    stump: 'M259 535 L270 523 L271 502 Q285 495 297 502 L299 522 L313 539 L295 542 L276 539 Z',
    lights: 'M247 444 L250 438 L253 445 L257 450 L255 466 L250 473 L245 467 L244 451 Z M410 460 L414 451 L418 460 L422 465 L420 480 L414 487 L408 480 L407 465 Z M560 476 L564 466 L568 476 L570 479 L568 490 L564 496 L559 490 L558 480 Z' },
] as const;

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
let instance = 0;
/** Whole-frame SVG: no generic SITE sprites, resized room artwork, or duplicate warehouse overlay. */
export function coastalMapArtHTML(completed: readonly string[], assets: string): string {
  const owned = new Set(completed), namespace = `coastal-map-${++instance}`;
  const defs: string[] = [], parts: string[] = [];
  let clipIndex = 0;
  const image = (plate: Plate, path: string, task?: string) => {
    const id = `${namespace}-${clipIndex++}`;
    defs.push(`<clipPath id="${id}"><path d="${path}"/></clipPath>`);
    return `<image href="${escape(assets)}coastal-map-${plate}-v1.webp" width="1536" height="1024" clip-path="url(#${id})" data-map-plate="${plate}"${task ? ` data-scene-task="${task}"` : ''}/>`;
  };
  for (const site of COASTAL_MAP_SITES) {
    const task = (n: number) => `${site.prefix}${String(n).padStart(2, '0')}`;
    let stage = 0;
    for (let n = 1; n <= site.limit; n++) if (owned.has(task(n))) stage = n;
    const extension = site.id === 'fruit-extension';
    let plate: Plate = 'dormant', outline = false;
    if (extension) {
      if (stage >= 12) plate = 'complete';
      else if (stage >= 7) plate = 'ready';
      else if (stage >= 5) plate = 'structure';
      else if (stage >= 3) plate = 'foundation';
      else if (stage >= 2) { plate = 'cleared'; outline = true; }
      else if (stage >= 1) plate = 'rough';
    } else {
      if (stage >= 14) plate = 'complete';
      else if (stage >= 10) plate = 'ready';
      else if (stage >= 9) plate = 'roofed';
      else if (stage >= 8) plate = 'structure';
      else if (stage >= 7) plate = 'foundation';
      else if (stage >= 5) { plate = 'cleared'; outline = stage === 6; }
      else if (stage >= 3) plate = 'cleared';
      else if (stage >= 2) plate = 'rough';
      else if (stage >= 1) plate = 'tidied';
    }
    const layers = [image(plate, site.domain, stage ? task(stage) : undefined)];
    if (!extension && (stage === 3 || stage === 4)) {
      layers.push(image('rough', site.mound));
      if (stage === 3) layers.push(image('rough', site.stump));
    }
    if (extension && stage === 4 && 'frame' in site) layers.push(image('structure', site.frame, task(4)));
    if (extension && stage === 6 && 'facade' in site) layers.push(image('ready', site.facade, task(6)));
    if (!extension && stage >= 12 && stage < 14 && 'lights' in site) layers.push(image(site.id === 'fruit-yard' ? 'roofed' : 'complete', site.lights, task(12)));
    if (site.id === 'warehouse' && stage === 13) layers.push(image('complete', site.equipment, task(13)));
    if (outline) layers.push(`<path d="${site.footprint}" fill="none" stroke="#fff1be" stroke-width="4" stroke-dasharray="12 8" data-scene-task="${task(extension ? 2 : 6)}"/>`);
    parts.push(`<g data-map-site="${site.id}" data-map-stage="${stage}" data-map-state="${plate}">${layers.join('')}</g>`);
  }
  // A new building keeps its own registered sources. Its high roof/chimney
  // domain is used only after the required warehouse has been completed.
  let bakeryStage = 0;
  for (let n=1;n<=26;n++) if(owned.has(`bakery-s1-t${String(n).padStart(2,'0')}`)) bakeryStage=n;
  const bakeryPlate:typeof bakeryPlates[number]=bakeryStage>=26?'final':bakeryStage>=10?'ready':bakeryStage>=9?'roof':bakeryStage>=8?'walls':bakeryStage>=7?'foundation':bakeryStage>=5?'clear':'before';
  const bakeryClip=`${namespace}-${clipIndex++}`;
  defs.push(`<clipPath id="${bakeryClip}"><path d="${bakeryStage>=5?COASTAL_BAKERY_SITE.domain:COASTAL_BAKERY_SITE.beforeDomain}"/></clipPath>`);
  const bakeryTask=bakeryStage?` data-scene-task="bakery-s1-t${String(bakeryStage).padStart(2,'0')}"`:'';
  const bakeryOutline=bakeryStage===6?`<path d="${COASTAL_BAKERY_SITE.footprint}" fill="none" stroke="#fff1be" stroke-width="4" stroke-dasharray="12 8" data-scene-task="bakery-s1-t06"/>`:'';
  let bakeryAwning='';
  let bakeryRoofBase='';
  if(bakeryStage===9){
    const id=`${namespace}-${clipIndex++}`;
    defs.push(`<clipPath id="${id}"><path d="M1008 405 L1037 405 L1048 426 L1048 450 L1028 456 L1007 449 Z M1307 451 L1337 451 L1353 460 L1353 484 L1315 484 L1305 468 Z"/></clipPath>`);
    bakeryRoofBase=`<image href="${escape(assets)}coastal-bakery-map-ready.webp" width="1536" height="1024" clip-path="url(#${id})" data-map-plate="bakery-roof-base" data-scene-task="bakery-s1-t09"/>`;
  }
  if(bakeryStage>=10&&bakeryStage<26){
    const id=`${namespace}-${clipIndex++}`;
    defs.push(`<clipPath id="${id}"><path d="M1160 333 L1328 341 L1333 354 L1309 377 Q1278 383 1264 375 Q1248 384 1230 374 Q1215 382 1199 371 Q1174 381 1155 367 L1145 359 Z"/></clipPath>`);
    bakeryAwning=`<image href="${escape(assets)}coastal-bakery-map-final.webp" width="1536" height="1024" clip-path="url(#${id})" data-map-plate="bakery-awning" data-scene-task="bakery-s1-t10"/>`;
  }
  const bakeryBuilding=`<image href="${escape(assets)}coastal-bakery-map-${bakeryPlate}.webp" width="1536" height="1024" clip-path="url(#${bakeryClip})" data-map-plate="bakery-${bakeryPlate}"${bakeryTask}/>`;
  parts.push(`<g data-map-site="bakery" data-map-stage="${bakeryStage}" data-map-state="${bakeryPlate}">${bakeryBuilding}${bakeryOutline}${bakeryRoofBase}${bakeryAwning}</g>`);
  let terraceStage = 0;
  for (let n=1;n<=26;n++) if(owned.has(`terrace-s1-t${String(n).padStart(2,'0')}`)) terraceStage=n;
  const terracePlate = terraceStage>=26?'final':terraceStage>=10?'ready':terraceStage>=9?'roof':terraceStage>=8?'frame':terraceStage>=7?'foundation':terraceStage>=2?'clear':'before';
  const terraceImage = (plate: typeof terracePlates[number], path: string, label=plate) => {
    const id=`${namespace}-${clipIndex++}`;
    defs.push(`<clipPath id="${id}"><path d="${path}"/></clipPath>`);
    return `<image href="${escape(assets)}coastal-terrace-map-${plate}.webp" width="1536" height="1024" clip-path="url(#${id})" data-map-plate="terrace-${label}"${terraceStage?` data-scene-task="terrace-s1-t${String(terraceStage).padStart(2,'0')}"`:''}/>`;
  };
  // Clear only the old pergola; structural silhouettes never import the donors' bakery facade.
  const terraceLayers=[terraceImage(terraceStage<2?'before':'clear',COASTAL_TERRACE_SITE.domain)];
  if(terraceStage>=7) terraceLayers.push(terraceImage('foundation',COASTAL_TERRACE_SITE.foundation));
  if(terraceStage>=8) terraceLayers.push(terraceImage('frame',COASTAL_TERRACE_SITE.deck),terraceImage('frame',COASTAL_TERRACE_SITE.frame));
  if(terraceStage>=9) terraceLayers.push(terraceImage('roof',COASTAL_TERRACE_SITE.roof));
  if(terraceStage>=10) terraceLayers.push(terraceImage('ready',COASTAL_TERRACE_SITE.rails));
  if(terraceStage>=26) terraceLayers.push(terraceImage('final',COASTAL_TERRACE_SITE.furnished));
  terraceLayers.push(terraceImage('before','M811 556 L824 548 L846 563 L835 594 L833 674 L847 689 L841 704 L806 701 L802 690 L814 675 L816 593 L806 577 Z M1317 588 L1334 577 L1355 596 L1346 626 L1343 704 L1358 733 L1354 753 L1314 756 L1309 742 L1324 706 L1326 629 L1313 607 Z'));
  if(terraceStage===6) terraceLayers.push(`<path d="${COASTAL_TERRACE_SITE.footprint}" fill="none" stroke="#fff1be" stroke-width="4" stroke-dasharray="12 8" data-scene-task="terrace-s1-t06"/>`);
  parts.push(`<g data-map-site="terrace" data-map-stage="${terraceStage}" data-map-state="${terracePlate}">${terraceLayers.join('')}</g>`);
  return `<svg class="coastal-map-art scene-background map-image" viewBox="0 0 1536 1024" width="1536" height="1024" data-art-version="${COASTAL_MAP_VERSION}" aria-hidden="true"><defs>${defs.join('')}</defs><image href="${escape(assets)}coastal-map-cleared-v1.webp" width="1536" height="1024"/>${parts.join('')}</svg>`;
}
