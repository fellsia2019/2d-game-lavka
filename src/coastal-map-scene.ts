/** Registered coastal map artwork. Ownership and navigation remain with campaign/world. */
export const COASTAL_MAP_VERSION = 'coastal-map-2';
const plates = ['dormant', 'tidied', 'rough', 'cleared', 'foundation', 'structure', 'roofed', 'ready', 'complete'] as const;
type Plate = typeof plates[number];
const bakeryPlates = ['before', 'clear', 'foundation', 'walls', 'roof', 'ready', 'final'] as const;
export const COASTAL_MAP_ASSETS = [...plates.map(name => `coastal-map-${name}-v1.webp`),
  ...bakeryPlates.map(name => `coastal-bakery-map-${name}.webp`)];
export const COASTAL_BAKERY_SITE = {
  domain: 'M993 322 L1010 303 L1015 290 L1064 253 L1277 263 L1277 234 L1303 228 L1338 234 L1338 275 L1411 297 L1422 329 L1425 454 L1410 486 L1330 496 L1242 479 L1160 474 L1071 457 L994 462 L980 445 Z',
  beforeDomain: 'M1000 298 L1177 292 L1210 265 L1234 283 L1248 284 L1248 261 L1311 261 L1321 296 L1431 298 L1424 452 L1395 470 L1359 477 L1050 446 L994 423 Z',
  footprint: 'M1050 435 L1333 472 L1406 420 L1131 391 Z',
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
  return `<svg class="coastal-map-art scene-background map-image" viewBox="0 0 1536 1024" width="1536" height="1024" data-art-version="${COASTAL_MAP_VERSION}" aria-hidden="true"><defs>${defs.join('')}</defs><image href="${escape(assets)}coastal-map-cleared-v1.webp" width="1536" height="1024"/>${parts.join('')}</svg>`;
}
