import type { RegisteredLayer } from './hall-scene-layers';
/** All artwork is registered in one immutable 1536×1024 frame per camera. */
export const FRUIT_FRAME={width:1536,height:1024} as const;
export type FruitView='fruit-yard'|'fruit-market'|'fruit-extension-site'|'fruit-extension';
export const fruitTask=(stage:number,n:number)=>`fruit-yard-s${stage}-t${String(n).padStart(2,'0')}`;
export const FRUIT_FULL='M0 0 H1536 V1024 H0 Z';
const make=(id:string,s:number,n:number,source:string,path:string,kind:RegisteredLayer['kind']='furniture',parent?:number):RegisteredLayer=>({id,task:fruitTask(s,n),source:`fruit-room-${source}`,path,object:id,kind,...(parent?{parent:fruitTask(s,parent)}:{})});
const contact=(s:number,n:number)=>make(`fruit-contact-${s}-${n}`,s,n,`contact-${s}-${n}.svg`,FRUIT_FULL,'shadow');
export const FRUIT_CONTACT_TASKS=[[1,13],[1,16],[1,17],[1,18],[1,22],[1,23],[1,24],[1,25],[2,11],[2,12],[2,14],[2,16],[2,17],[2,19]] as const;
export const FRUIT_FOOTPRINTS={pavilion:[[77,711],[1209,808],[1465,650],[577,555]],extension:[[294,704],[1090,790],[1338,691],[836,594]]} as const;
const pavilionSteps='M75 642 L1211 716 L1211 808 L760 770 L754 786 L674 787 L349 756 L350 736 L76 716 Z M1211 716 L1462 600 L1462 660 L1211 808 Z';
const pavilionFloor='M76 638 L193 612 L193 583 L550 555 L601 568 L963 579 L1071 586 L1097 616 L1097 675 L1197 700 L1459 602 L1464 653 L1211 809 L759 771 L778 692 L467 666 L352 758 L75 715 Z';
const yard:readonly RegisteredLayer[]=[
 make('pavilion-clearing-1',1,1,'pavilion-cleared-1',FRUIT_FULL,'architecture'),
 make('pavilion-clearing-2',1,2,'pavilion-cleared-2',FRUIT_FULL,'architecture'),
 make('pavilion-clearing-3',1,3,'pavilion-cleared-3',FRUIT_FULL,'architecture'),
 make('pavilion-clearing-4',1,4,'pavilion-cleared-4',FRUIT_FULL,'architecture'),
 make('pavilion-level-whole-site',1,5,'pavilion-clear',FRUIT_FULL,'architecture'),
 make('pavilion-footprint-marking',1,6,'outline.svg',FRUIT_FULL,'architecture'),
 make('pavilion-whole-foundation',1,7,'pavilion-foundation',FRUIT_FULL,'architecture'),
 make('pavilion-complete-frame',1,8,'pavilion-frame',FRUIT_FULL,'architecture'),
 make('pavilion-whole-roof',1,9,'pavilion-roof',FRUIT_FULL,'architecture'),
 make('pavilion-entrance-steps',1,10,'pavilion-master',pavilionSteps,'architecture'),
 make('pavilion-whole-platform-finish',1,11,'pavilion-master',pavilionFloor,'architecture'),
 make('pavilion-safe-lit-entrance',1,12,'pavilion-master',FRUIT_FULL,'architecture'),
];
const marketLamps='M439 0 H529 V158 H439 Z M1211 0 H1313 V154 H1211 Z';
const mainCounter='M557 432 L593 410 L1019 416 L1028 440 L1027 454 L1021 454 L1021 535 L1026 535 L1026 561 L1004 563 L1001 552 L865 548 L865 554 L850 554 L850 546 L724 540 L724 548 L709 548 L707 538 L584 537 L583 542 L559 542 Z';
const mainTrays='M565 419 L596 371 L613 373 L741 377 L749 375 L868 378 L876 375 L1009 378 L1012 451 L1004 461 L572 455 Z';
const mainFirstStock='M576 427 L594 402 L608 390 L615 381 L625 380 L630 382 L640 377 L645 377 L648 381 L664 382 L668 374 L672 374 L670 383 L687 383 L692 374 L695 375 L694 383 L707 383 L711 378 L714 379 L713 384 L729 383 L738 376 L745 376 L749 381 L715 433 L715 444 H576 Z M867 443 L881 410 L891 401 L896 388 L907 383 L909 376 L912 377 L911 384 L920 385 L914 379 L916 377 L929 382 L936 384 L939 376 L942 378 L940 386 L952 389 L957 382 L969 386 L976 384 L976 379 L979 380 L980 389 L985 385 L988 379 L994 381 L990 389 L991 416 L1000 437 L1000 447 Z';
const mainExtraStock='M725 432 L738 408 L745 389 L751 382 L760 379 L766 376 L773 382 L781 378 L785 376 L783 387 L792 386 L803 382 L806 378 L810 379 L810 385 L820 386 L829 381 L832 379 L836 381 L835 386 L847 384 L853 378 L859 378 L857 389 L867 391 L871 407 L871 447 H727 Z';
const citrus='M402 309 L522 305 L533 309 L533 321 L574 493 L576 507 L571 519 L575 537 L560 542 L557 531 L459 545 L459 553 L445 557 L438 549 L437 535 L413 527 L413 537 L396 537 L394 525 L398 319 Z';
const banana='M29 442 L149 425 Q160 420 166 427 L168 446 L180 483 L189 496 L199 501 L201 511 L197 528 L214 577 L221 584 L226 590 L225 606 L237 650 L242 669 L249 675 L250 688 L247 700 L251 723 L249 730 L238 734 L231 732 L229 719 L136 766 L136 783 L126 791 L110 788 L106 769 L51 755 L49 766 L40 772 L28 768 L28 749 L34 741 L34 462 L28 460 Z';
// Continuous furniture perimeter; no interior crop crosses an upright or shelf rim.
const mixedDisplay='M188 489 L199 487 L197 477 Q207 477 214 485 L229 481 Q238 471 251 475 L264 477 L266 469 Q276 472 283 480 L287 473 L284 469 Q291 471 298 478 L303 455 Q314 453 320 462 L325 451 Q335 443 344 452 L350 444 Q360 440 366 452 L376 449 Q384 454 385 465 L397 465 L398 473 Q408 462 420 468 L427 475 L437 482 L449 487 L453 506 L459 552 L477 561 L488 574 L488 625 L477 627 L468 622 L468 611 L307 688 L307 703 L296 708 L283 704 L282 691 L270 704 L259 706 L248 701 L242 680 L194 528 L189 509 Z';
const packing='M1056 432 L1210 427 L1291 427 L1348 444 L1348 460 L1341 463 L1322 480 L1127 488 L1102 480 L1058 456 Z M1065 445 L1080 451 L1080 540 L1085 549 L1085 562 L1075 567 L1064 561 L1064 548 L1067 539 Z M1076 547 L1116 571 L1118 585 L1076 560 Z M1107 459 L1129 465 V573 L1130 575 V594 Q1130 601 1124 601 H1115 Q1104 597 1103 591 V577 L1107 567 Z M1265 483 L1284 481 L1284 536 L1288 542 L1287 554 L1275 558 L1264 552 L1260 539 L1265 536 Z M1318 462 L1341 460 L1341 569 L1344 577 L1342 592 L1328 596 L1315 589 L1314 572 L1318 565 Z';
const scale='M1084 389 Q1109 383 1143 389 Q1140 405 1118 407 L1118 418 L1134 423 L1136 438 L1129 442 L1094 441 L1092 436 L1097 424 L1105 418 L1105 406 Q1089 403 1084 389 Z M1166 388 Q1190 384 1218 389 Q1215 405 1192 406 L1192 418 L1207 423 L1210 438 L1201 443 L1168 442 L1167 437 L1172 425 L1181 418 L1181 406 Q1168 402 1166 388 Z M1137 427 L1140 397 L1144 385 L1144 376 L1149 374 L1152 379 L1163 380 L1165 384 L1152 386 L1153 397 L1157 426 L1162 432 L1161 440 L1135 439 Z M1207 426 L1224 418 L1224 398 L1241 395 L1302 400 L1317 411 L1317 440 L1283 448 L1211 444 Z';
const cupboard='M1326 213 L1453 196 L1535 201 L1535 218 L1520 221 L1520 591 L1507 596 L1496 590 L1494 575 L1475 581 L1475 601 L1451 607 L1439 593 L1345 565 L1344 568 L1332 565 L1334 225 L1326 222 Z';
const pickup='M1240 565 L1276 559 L1273 528 L1277 495 L1301 481 L1308 459 L1324 453 L1349 478 L1373 485 L1375 472 L1395 452 L1417 451 L1438 471 L1433 490 L1465 511 L1472 536 L1465 568 L1498 584 L1497 603 L1490 610 L1490 771 L1474 776 L1470 757 L1332 789 L1331 794 L1301 797 L1295 779 L1251 748 L1242 746 L1241 724 L1246 714 L1246 595 L1240 587 Z';
const customerBaskets='M1374 697 L1404 685 L1410 679 L1437 676 L1443 682 L1474 684 L1507 702 L1519 720 L1517 739 L1509 747 L1520 762 L1518 780 L1510 789 L1521 804 L1517 825 L1482 837 L1431 844 L1389 821 L1384 802 L1388 787 L1379 774 L1380 753 L1385 741 L1376 730 Z';
const market:readonly RegisteredLayer[]=[
 make('market-whole-floor-finish',1,11,'market-empty-v2',FRUIT_FULL,'architecture'),
 make('market-two-pendants',1,12,'market-master',marketLamps,'light'),
 ...FRUIT_CONTACT_TASKS.filter(([s])=>s===1).map(([s,n])=>contact(s,n)),
 contact(2,19),
 make('market-outside-bench-awning',2,19,'market-master','M63 181 L251 229 L253 270 L235 281 L235 406 L223 414 L218 276 L112 277 L113 337 L211 333 L223 372 L219 392 L202 396 L196 416 L180 415 L180 398 L114 407 L107 425 L93 423 L90 401 L75 385 L65 387 Z','furniture'),
 make('market-packaging-cupboard',1,22,'market-structure',cupboard),
 make('market-first-fruit-counter',1,13,'market-structure',mainCounter),
 make('market-shallow-trays',1,14,'market-bare',mainTrays,'equipment',13),
 make('market-apples-pears',1,15,'market-master',mainFirstStock,'goods',14),
 make('market-full-main-assortment',1,21,'market-master',mainExtraStock,'goods',14),
 make('market-citrus-rack',1,16,'market-supported',citrus),
 make('market-banana-rack',1,17,'market-supported',banana),
 make('market-mixed-display',1,25,'market-master',mixedDisplay),
 make('market-packing-table',1,18,'market-table-empty-v2',packing),
 make('market-weighing-scale',1,19,'market-table-stock-v2',scale,'equipment',18),
 make('market-clear-customer-route',1,20,'market-master','M686 570 L972 582 L928 887 L335 873 Z','architecture'),
 make('market-hamper-pickup',1,24,'market-master',pickup),
 make('market-shopping-baskets',1,23,'market-master',customerBaskets,'equipment'),
 make('market-opening-sign',1,26,'market-master','M730 174 C730 150 774 132 829 132 C884 132 930 150 930 174 C930 199 886 217 829 217 C773 217 730 199 730 174 Z M749 111 Q750 105 756 105 Q763 106 762 113 L758 120 L758 134 Q763 137 762 144 L759 150 L751 153 L750 143 L753 136 L753 122 Z M895 111 Q894 101 901 101 Q910 100 909 109 L904 119 L904 133 Q910 136 909 144 L906 149 L897 146 Q893 139 899 132 L899 118 Z','equipment'),
];
const extensionWindows='M352 326 L690 326 L690 609 L692 614 L693 639 L345 623 L345 601 L355 594 Z M1195 334 L1285 348 L1286 578 L1291 574 L1291 600 L1194 618 Z';
const extensionDoor='M717 333 L1077 326 L1077 766 L1048 790 L713 757 Z';
const site:readonly RegisteredLayer[]=[
 make('extension-clear-site',2,1,'extension-clear',FRUIT_FULL,'architecture'),
 make('extension-continuous-plinth',2,2,'extension-plinth',FRUIT_FULL,'architecture'),
 make('extension-whole-foundation',2,3,'extension-foundation',FRUIT_FULL,'architecture'),
 make('extension-whole-timber-frame',2,4,'extension-frame',FRUIT_FULL,'architecture'),
 make('extension-complete-walls',2,5,'extension-walls',FRUIT_FULL,'architecture'),
 make('extension-two-windows',2,6,'extension-unlit',extensionWindows,'architecture'),
 make('extension-entire-roof',2,7,'extension-roof',FRUIT_FULL,'architecture'),
 make('extension-wide-entry',2,8,'extension-unlit',extensionDoor,'architecture'),
 make('extension-connected-finished-shell',2,9,'extension-master',FRUIT_FULL,'architecture'),
];
// Whole furniture silhouettes, including low rims, solid backs, all legs and feet.



const hallCase='M1175 368 L1357 359 L1399 359 L1402 376 L1393 379 L1401 677 L1400 688 L1385 691 L1382 680 L1327 696 L1327 703 L1303 703 L1297 689 L1145 635 L1144 630 L1131 631 L1128 510 L1134 507 Q1135 439 1173 382 Z';
const hallBerryStock='M1170 399 L1346 399 L1370 464 L1370 480 L1190 474 L1164 454 Z M1152 475 L1358 475 L1358 544 L1146 524 Z';
const hallCounter='M923 451 L960 447 L960 438 L972 435 L984 403 L991 394 L1039 394 L1039 435 L1049 437 L1050 451 L1060 451 L1055 427 L1058 411 L1070 397 L1083 397 L1092 414 L1093 438 L1086 454 L1126 456 L1127 470 L1119 474 L1119 609 L1107 613 L1095 609 L994 615 L973 615 L969 600 L934 587 L931 474 L922 467 Z';
const hallPickup='M1335 511 L1376 505 L1504 519 L1528 528 L1528 543 L1519 548 L1519 746 L1507 751 L1497 746 L1496 730 L1465 736 L1465 754 L1440 756 L1437 746 L1355 708 L1352 710 L1342 706 L1342 547 L1335 538 Z M1378 460 L1376 451 L1383 449 L1383 443 L1391 439 L1396 438 L1398 432 L1403 433 L1406 426 L1411 426 L1414 433 L1420 430 L1424 433 L1420 421 L1425 419 L1428 423 L1429 413 L1433 414 L1436 421 L1440 414 L1444 416 L1447 425 L1448 438 L1454 440 L1456 425 L1460 410 Q1468 408 1466 416 L1460 439 L1469 439 L1473 432 L1478 435 L1480 432 L1484 432 L1484 427 L1489 424 L1493 427 L1493 438 L1500 433 L1503 438 L1500 444 Q1510 445 1504 451 L1509 455 L1507 464 L1507 521 L1468 528 L1376 510 Z';
const hall:readonly RegisteredLayer[]=[
 make('fruit-hall-whole-floor',2,10,'hall-empty',FRUIT_FULL,'architecture'),
 make('fruit-hall-large-rack',2,11,'hall-rack-only-v2',FRUIT_FULL),
 make('fruit-hall-two-tier-baskets',2,12,'hall-left-empty-v2',FRUIT_FULL),
 make('fruit-hall-expanded-assortment',2,13,'hall-left-stock-v2',FRUIT_FULL,'goods',11),
 ...FRUIT_CONTACT_TASKS.filter(([s,n])=>s===2&&n!==19).map(([s,n])=>contact(s,n)),
 make('fruit-hall-enclosed-berry-case',2,14,'hall-structure',hallCase),
 make('fruit-hall-berry-punnets',2,15,'hall-master',hallBerryStock,'goods',14),
 make('fruit-hall-checkout',2,16,'hall-master',hallCounter),
 make('fruit-hall-side-pickup',2,17,'hall-master',hallPickup),
 make('fruit-hall-three-lights',2,18,'hall-master','M703 0 H815 V142 H703 Z M1109 244 Q1114 228 1126 223 L1126 216 L1130 214 L1130 205 Q1131 200 1135 203 L1137 209 L1149 212 Q1151 200 1158 202 Q1165 213 1159 226 Q1150 231 1148 215 L1136 213 L1136 217 L1140 220 L1140 226 Q1148 234 1153 244 L1139 247 Q1134 257 1129 254 L1122 247 Z M1334 182 Q1341 165 1352 149 L1352 144 L1357 141 L1357 135 L1355 128 L1359 121 L1364 121 L1364 127 L1368 131 L1382 132 Q1388 118 1398 127 Q1405 140 1397 153 Q1385 162 1380 138 L1365 137 L1365 142 L1372 146 L1372 153 Q1382 165 1388 179 L1392 184 L1373 188 Q1362 202 1353 187 Z','light'),
 make('fruit-hall-market-sign',2,20,'hall-master','M697 206 C697 181 736 161 783 161 C833 161 870 181 870 206 C870 230 831 248 783 248 C735 248 697 230 697 206 Z M727 140 H734 V174 H727 Z M833 139 H840 V173 H833 Z','equipment'),
];
export const FRUIT_LAYERS:Record<FruitView,readonly RegisteredLayer[]>={'fruit-yard':yard,'fruit-market':market,'fruit-extension-site':site,'fruit-extension':hall};
