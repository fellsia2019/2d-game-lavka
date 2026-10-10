/** Native presentation effects, in the same 1536×1024 coordinates as the room.
 * Transparent SVGs contain no floor pixels or furniture; each belongs to one
 * purchase, so its contact cannot appear before the corresponding object.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const destination = fileURLToPath(new URL('../public/assets/', import.meta.url));
// Each ellipse is [x,y,rx,ry,opacity,angle]. Only short contacts directly under
// physical supports belong here. Broad room/furniture-sized ellipses read as
// detached stains and must not substitute for the illustration's lighting.
const shadows = {
  'storage-pallet': [[790,610,16,4,.34,10],[852,635,17,4,.34,10],
    [943,653,18,4,.34,10],[1025,623,14,4,.32,10]],
  'storage-rack': [[846,558,16,4,.30,0],[1024,599,17,4,.30,0],
    [1239,643,19,4,.30,0],[1504,684,20,4,.30,0],
    [877,552,11,3,.24,0],[1058,589,11,3,.24,0],[1269,632,11,3,.24,0]],
  'storage-crates': [[1035,650,14,3,.30,0],[1112,671,15,4,.30,0],
    [1211,703,15,4,.30,0],[1240,709,15,4,.30,0],[1328,737,18,4,.32,0],[1424,698,14,4,.28,0]],
  'storage-chest': [[152,865,22,5,.34,-10],[86,824,18,4,.30,10],[280,826,18,4,.30,-10]],
  'storage-inspection-table': [[411,561,12,2.5,.30,0],[479,594,13,2.5,.32,0],
    [639,555,12,2.5,.30,0],[568,530,10,2,.26,0]],
  'storage-trolley': [[316,858,28,5,.34,0],[446,813,18,4,.30,0],[404,869,44,5,.28,-12]],
  'storage-cupboard': [[291,579,16,4,.32,0],[391,569,16,4,.32,0]],
  'storage-cans': [[465,569,32,2.5,.30,0],[531,568,29,2.5,.30,0],[584,558,22,2,.28,0]],
  'storage-packing-bench': [[620,491,12,2.5,.28,0],[715,514,13,2.5,.30,0],
    [797,493,12,2.5,.28,0]],
  'storage-delivery-crate': [[1457,871,14,3,.30,0],[1154,863,14,3,.30,0],
    [1226,895,12,3,.28,0],[1323,945,20,4,.34,0]],
  'cold-cabinet': [[351,718,16,4,.34,0],[476,689,17,4,.32,0],
    [575,668,15,4,.30,0],[652,651,15,4,.30,0],[294,704,15,4,.30,0]],
  'cold-rack': [[725,667,13,3,.32,0],[780,655,11,3,.30,0],[914,709,14,3,.32,0],
    [973,690,12,3,.30,0],[1155,757,17,3,.34,0],[1219,734,14,3,.30,0]],
  'cold-bins': [[692,680,16,4,.32,0],[807,705,18,4,.32,0],[938,737,18,4,.32,0],[1104,776,19,4,.34,0]],
  'cold-fruit': [[1216,795,18,4,.32,0],[1450,853,21,4,.34,0],[1510,810,18,4,.30,0]],
  'exterior-returns-rack': [[987,650,13,3,.30,0],[1149,646,13,3,.30,0]],
  'exterior-wash-basin': [[1190,628,11,3,.30,0],[1257,626,11,3,.30,0],[1227,626,17,3,.32,0]],
  'exterior-tool-cupboard': [[392,662,12,3,.30,0],[517,657,12,3,.30,0],[353,665,17,3,.25,0]],
  'exterior-awning': [[961,642,14,4,.28,0],[1497,627,14,4,.28,0]],
  'exterior-direction-post': [[48,823,21,4,.30,0]],
};
await mkdir(destination, { recursive: true });
const manifest = [];
for (const [name, ellipses] of Object.entries(shadows)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><defs><radialGradient id="contact"><stop stop-color="#603923" stop-opacity=".95"/><stop offset=".32" stop-color="#603923" stop-opacity=".65"/><stop offset=".7" stop-color="#603923" stop-opacity=".2"/><stop offset="1" stop-color="#603923" stop-opacity="0"/></radialGradient></defs>${ellipses.map(([x,y,rx,ry,opacity,angle]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" opacity="${opacity}" fill="url(#contact)" transform="rotate(${angle} ${x} ${y})"/>`).join('')}</svg>\n`;
  await writeFile(`${destination}warehouse-shadow-${name}-v8.svg`, svg);
  // Retire only the previous generated contact sheet with this exact name.
  await rm(`${destination}warehouse-shadow-${name}-v7.svg`, { force: true });
  manifest.push({ name, runtime: `public/assets/warehouse-shadow-${name}-v8.svg`,
    bytes: Buffer.byteLength(svg), sha256: createHash('sha256').update(svg).digest('hex'),
    frame: [0,0,1536,1024], ellipses, operation: 'native transparent radial-gradient effect' });
}
await writeFile(new URL('../docs/art/warehouse-rooms/shadow-manifest.json', import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${Object.keys(shadows).length} registered transparent contact effects`);
