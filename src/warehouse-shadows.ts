import type { RegisteredLayer } from './hall-scene-layers';
const full = 'M0 0 H1536 V1024 H0 Z';
const shadow = (id: string, stage: number, work: number, object: string): RegisteredLayer => ({
  id: `${id}-shadow`, task: `warehouse-s${stage}-t${String(work).padStart(2, '0')}`,
  source: `warehouse-shadow-${id}-v8.svg`, path: full, object, kind: 'shadow',
});
/** Contacts are painted before every floor object; no opaque donor-floor patches. */
export const STORAGE_SHADOWS: readonly RegisteredLayer[] = [
  shadow('storage-rack',1,14,'storage-rack'), shadow('storage-pallet',1,13,'receiving-pallet'),
  shadow('storage-crates',1,16,'dry-crates'), shadow('storage-chest',1,17,'receiving-chest'),
  shadow('storage-inspection-table',1,18,'inspection-table'), shadow('storage-trolley',1,19,'hand-trolley'),
  shadow('storage-cupboard',1,22,'inventory-cupboard'), shadow('storage-cans',1,23,'return-cans'),
  shadow('storage-packing-bench',1,24,'packing-bench'), shadow('storage-delivery-crate',1,25,'delivery-crate'),
];
export const COLD_SHADOWS: readonly RegisteredLayer[] = [
  shadow('cold-cabinet',2,3,'cold-cabinet'), shadow('cold-rack',2,7,'flour-rack'),
  shadow('cold-bins',2,9,'sugar-bins'), shadow('cold-fruit',2,11,'fruit-rack'),
];
export const EXTERIOR_SHADOWS: readonly RegisteredLayer[] = [
  shadow('exterior-returns-rack',2,13,'returns-rack'), shadow('exterior-wash-basin',2,14,'wash-basin'),
  shadow('exterior-tool-cupboard',2,16,'receiving-tools'), shadow('exterior-awning',2,17,'receiving-awning'),
  shadow('exterior-direction-post',2,20,'direction-post'),
];
export const WAREHOUSE_SHADOW_ASSETS = [...STORAGE_SHADOWS, ...COLD_SHADOWS, ...EXTERIOR_SHADOWS].map(layer=>layer.source);
