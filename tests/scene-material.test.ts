import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySceneMaterial, validSceneMaterial } from '../src/scene-material';

test('Scene finishes keep alpha and the relative light/shadow detail of wood', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 0, 80, 80, 80, 100, 180, 180, 180, 220, 255, 255, 255, 255]);
  applySceneMaterial(pixels, { shadow: 0x102030, highlight: 0xd0e0f0, amount: 1 });
  assert.deepEqual([...pixels.slice(0, 4)], [16, 32, 48, 0]);
  assert.deepEqual([...pixels.slice(12)], [208, 224, 240, 255]);
  assert.deepEqual([pixels[3], pixels[7], pixels[11], pixels[15]], [0, 100, 220, 255]);
  for (let channel = 0; channel < 3; channel++) assert.ok(pixels[4 + channel] < pixels[8 + channel]);
  const unchanged = new Uint8ClampedArray([201, 138, 62, 140]);
  applySceneMaterial(unchanged, { shadow: 0, highlight: 0xffffff, amount: 0 });
  assert.deepEqual([...unchanged], [201, 138, 62, 140]);
});

test('Invalid scene material inputs are rejected before renderer setup', () => {
  assert.equal(validSceneMaterial({ shadow: 0, highlight: 0xffffff, amount: .96 }), true);
  for (const value of [null, [], {}, { shadow: -1, highlight: 0xffffff, amount: 1 },
    { shadow: 0, highlight: 0x1000000, amount: 1 }, { shadow: 0, highlight: 0xffffff, amount: NaN },
    { shadow: 0, highlight: 0xffffff, amount: 1.1 }]) assert.equal(validSceneMaterial(value), false);
});
