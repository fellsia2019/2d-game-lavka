import type { RegisteredLayer } from './hall-scene-layers';

/** Every source and mask stays in the SAME original room frame. No sprite transforms. */
export const SHOP_EXPANSION_FRAME = { width:1536, height:1024 } as const;
export const expansionTask = (n:number) => `shop-s2-t${String(n).padStart(2,'0')}`;
const make=(id:string,n:number,room:'grocery'|'service',state:string,path:string,kind:RegisteredLayer['kind'],parent?:number):RegisteredLayer=>({id,task:expansionTask(n),source:`shop-expansion-${room}-${state}`,path,object:id,kind,...(parent?{parent:expansionTask(parent)}:{})});
const full='M0 0 H1536 V1024 H0 Z';
const floor='M0 701 L50 693 L83 695 L679 595 L720 603 L755 597 L1453 687 L1498 697 L1536 699 L1536 1024 H0 Z';
const walls='M0 0 H1536 V699 L1498 697 L1453 687 L755 597 L720 603 L679 595 L83 695 L50 693 L0 701 Z';
const rack='M724 106 L1329 39 L1371 54 L1369 75 L1356 80 L1358 645 L1364 649 L1364 680 L1326 707 L1299 704 L1299 700 L1101 677 L906 646 L727 617 L727 598 L731 594 L731 501 L723 494 L723 482 L733 480 L733 124 L726 120 Z';
// Closing the base uses its continuous face and support, not three floating
// rectangles that can reveal bare wood or import the future oil cabinet trim.
const doors='M727 499 L1305 529 L1305 499 L1357 492 L1357 645 L1364 649 L1364 680 L1326 707 L1299 704 L1299 700 L1101 677 L906 646 L727 617 Z';
const lowRack='M68 397 L516 390 L529 393 L535 405 L529 413 L569 613 L571 644 L557 649 L149 713 L145 722 L127 725 L65 695 L65 674 L72 670 L72 413 Z';
const teaShelves='M536 155 L578 149 L713 164 L713 176 L697 180 L536 165 Z M536 254 L578 248 L713 256 L713 268 L696 271 L537 265 Z M537 357 L714 357 L714 368 L547 371 L537 368 Z M539 451 L577 445 L714 442 L714 456 L559 469 L541 463 Z';
// Filled furniture uses a continuous registered face, never rectangular
// product cutouts with a different backing colour inside an empty bay.
const lowGoods=lowRack;
const mainGoods='M724 106 L1329 39 L1371 54 L1369 75 L1356 80 L1356 538 L1302 540 L1101 521 L904 510 L727 497 L723 493 L723 482 L733 480 L733 124 L726 120 Z';
const teaGoods='M560 195 Q580 189 610 196 L612 200 L613 195 Q637 191 657 199 L659 202 Q681 197 698 203 L698 251 L714 256 L714 268 L537 265 L537 254 L559 251 Z M559 280 L596 280 L608 298 L613 282 L650 282 L660 298 L663 283 L693 284 L697 354 L714 357 L714 369 L537 369 L537 357 L554 355 L554 305 Z M559 393 Q582 387 610 394 L612 396 Q636 388 657 395 L659 396 Q680 390 698 396 L699 445 L714 443 L714 456 L559 469 L539 463 L539 452 L559 451 Z';
/** Price tags enter at t18; the preceding stocked donors contain no tags. */
const tagBoxes = [
 [152,525,31,20],[209,522,33,20],[267,517,32,20],[320,512,32,20],[376,508,34,20],[434,503,28,20],[481,495,32,23],
 [168,663,31,23],[221,656,31,23],[280,647,34,23],[336,638,30,23],[391,631,31,23],[444,622,30,23],[496,613,33,23],
 [765,250,26,18],[812,248,29,18],[860,246,29,18],[938,244,30,18],[991,241,32,19],[1048,239,30,20],[1139,238,29,20],[1197,236,31,20],[1252,233,33,22],
 [764,365,29,18],[812,366,29,18],[859,367,29,18],[937,367,31,19],[992,369,32,20],[1046,370,32,20],[1141,371,32,20],[1198,372,31,20],[1252,373,32,20],
 [765,481,29,18],[812,484,28,19],[858,487,32,19],[938,495,30,20],[992,499,33,21],[1047,502,31,22],[1138,507,34,22],[1193,512,36,21],[1251,515,35,24],
 [589,252,25,16],[635,254,26,16],[679,256,23,16],[590,354,25,17],[635,355,25,17],[679,356,23,17],[588,449,24,18],[633,449,25,18],[679,448,24,18],
] as const;
const tagPath=(boxes:readonly (readonly number[])[])=>boxes.map(([x,y,w,h])=>`M${x} ${y} h${w} v${h} h-${w} Z`).join(' ');
export const GROCERY_PRICE_TAGS=tagPath(tagBoxes);
export const GROCERY_GOODS_TAGS=tagPath(tagBoxes.slice(0,41));
export const TEA_GOODS_TAGS=tagPath(tagBoxes.slice(41));
const contact=(n:number):RegisteredLayer=>({id:`shop-contact-${n}`,task:expansionTask(n),source:`shop-expansion-contact-${n}${n===4?'-v2':''}.svg`,path:full,object:`contact-${n}`,kind:'shadow'});
export const GROCERY_LAYERS:readonly RegisteredLayer[] = [
 make('expansion-clear-room',1,'grocery','cleared',full,'architecture'),
 make('expansion-whole-floor',2,'grocery','clean',floor,'architecture'),
 make('expansion-whole-walls',3,'grocery','clean',walls,'architecture'),
 ...[4,6,10].map(contact),
 make('expansion-sectional-rack',4,'grocery','empty-rack-v2',rack,'furniture'),
 make('expansion-cabinet-doors',5,'grocery','stocked-rack-v2',doors,'furniture',4),
 make('expansion-low-grocery-rack',6,'grocery','bare',lowRack,'furniture'),
 make('expansion-rice-pasta-main',7,'grocery','stocked-rack-v2',mainGoods,'goods',4),
 make('expansion-rice-pasta-low',7,'grocery','stocked-v2',lowGoods,'goods',6),
 make('expansion-tea-shelves',8,'grocery','bare',teaShelves,'furniture'),
 make('expansion-tea-coffee',9,'grocery','stocked-v2',teaGoods,'goods',8),
 make('expansion-oil-honey',10,'grocery','stocked-v2','M1293 499 L1323 492 L1321 401 L1328 386 L1328 371 L1347 369 L1350 385 L1354 384 L1354 370 L1371 369 L1372 385 L1378 385 L1378 372 L1394 372 L1395 393 L1399 428 L1428 427 L1430 434 L1451 437 L1454 447 L1457 493 L1476 498 L1474 513 L1467 517 L1467 699 L1435 724 L1414 723 L1294 704 Z','furniture'),
 make('expansion-paper-bags',11,'grocery','master','M1367 233 L1384 230 L1390 235 L1452 234 L1457 229 Q1474 228 1475 241 Q1471 255 1455 251 L1450 254 L1455 347 L1429 349 L1420 341 L1368 338 L1379 253 L1370 249 Z','equipment'),
 make('expansion-price-holders',18,'grocery','master',GROCERY_PRICE_TAGS,'equipment',4),
];

export const SERVICE_LAYERS:readonly RegisteredLayer[] = [
 ...[13,14,15,16,17].map(contact),
 // Replacing the whole counter silhouette allows the inherited short counter
 // to grow naturally without leaving a second countertop or floor fragments.
 make('service-counter-extension',13,'service','counter','M973 356 L1069 349 L1469 416 L1471 434 L1459 442 L1459 634 L1467 639 L1466 662 L1444 665 L1442 658 L1363 677 L1358 684 L1338 684 L1230 646 L1211 644 L981 527 L977 507 L984 502 L983 373 L975 370 Z M1200 625 L1340 651 L1474 624 L1474 675 L1330 694 L1200 653 Z','furniture'),
 make('service-terminal',12,'service','master','M1271 357 L1290 310 L1298 307 L1356 315 L1365 324 L1387 381 L1395 390 L1395 411 L1384 422 L1272 409 L1272 392 L1295 383 L1293 374 L1274 369 Z M1230 396 Q1234 379 1244 379 L1244 374 L1251 374 L1253 380 Q1264 382 1266 397 L1268 405 L1230 406 Z','equipment'),
 make('service-pickup-cabinet',14,'service','master','M654 366 L841 357 L880 367 L880 378 L874 383 L875 486 L879 493 L879 505 L862 507 L856 497 L695 507 L690 516 L671 512 L671 505 L656 500 L655 487 L660 479 L660 383 L654 378 Z','furniture'),
 make('service-returns-crate',15,'service','master','M879 438 L891 438 L891 430 L897 421 L898 410 L896 408 L897 405 Q903 403 909 406 L909 410 L906 411 L907 421 L913 432 L914 434 L914 416 L914 410 Q920 409 924 412 L925 412 L925 409 L920 408 L920 404 Q924 406 927 404 L929 404 L929 408 L927 410 L927 423 L934 434 L936 436 L937 418 L937 412 L937 410 L942 410 L942 408 L940 407 L940 404 Q945 403 950 405 L950 409 L948 410 L948 420 L955 434 L959 434 L960 422 L960 414 L959 412 L959 409 Q965 407 970 411 L970 414 L968 416 L970 426 L975 433 L977 442 L985 444 L985 496 L970 503 L906 506 L880 496 Z','goods'),
 make('service-delivery-trolley',16,'service','master','M428 314 Q435 307 445 315 L453 318 L461 345 L480 351 L481 334 Q480 324 472 324 L463 321 Q458 310 469 310 Q490 310 498 326 L503 352 L504 407 L540 405 L547 411 L580 421 L582 479 L587 484 L585 498 L578 500 L578 510 Q574 520 565 517 L558 509 L558 498 L540 498 Q539 510 531 511 Q519 512 518 499 L507 497 Q502 519 484 527 Q461 535 441 519 Q415 501 421 477 Q422 453 444 442 L449 439 L450 346 L444 328 L430 324 Z','furniture'),
 make('service-shopping-baskets',17,'service','master','M1365 546 L1387 533 L1400 534 Q1406 500 1438 500 Q1461 502 1470 531 L1511 541 L1517 551 L1508 571 L1507 593 L1514 603 L1510 620 L1506 638 L1512 648 L1508 668 L1494 697 L1477 707 L1405 710 L1384 696 L1377 670 L1371 650 L1367 640 L1374 629 L1369 610 L1363 599 L1373 589 L1369 567 Z','equipment'),
 make('service-window-display',19,'service','master','M540 132 H912 V347 H540 Z','goods'),
 make('service-promenade-sign',20,'service','master','M8 57 Q19 51 28 57 L29 67 L76 76 L84 64 L92 69 L96 87 L109 110 L106 125 L98 133 L87 154 L76 151 L31 144 L28 153 L12 155 L8 148 Z','equipment'),
];
