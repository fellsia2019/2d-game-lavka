import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshProgress, loadProgress, saveProgress, type Attempt, type Progress } from '../src/storage';
import { applyDebugSceneState } from '../src/debug-scene';
import { CHAPTER } from '../src/content';
import { projectTasks, nextProjectTask, interiorOpen, validSchemaElevenCampaign, phaseStatus, currentGlobalStage } from '../src/campaign';
import { offlineChapterLevel } from '../src/content-offline';
import { applyMove, initial } from '../src/engine';
import { createOrderAppearance } from '../src/order-supplies';

function partlyPlayed(number: number): Attempt {
  const definition = offlineChapterLevel(number), board = initial(definition);
  const moved = applyMove(board, ...definition.verifiedSolution[0]);
  assert.ok(moved);
  return { id: `before-restaurant-${number}`, definition, appearance: createOrderAppearance(definition),
    board: moved, undo: [board], solution: definition.verifiedSolution.slice(1), mixCount: 0,
    hints: {}, reward: null };
}
function roundTrip(progress: Progress): Progress {
  let raw = '';
  assert.equal(saveProgress({ setItem: (_key, value) => { raw = value; } }, progress), true);
  const loaded = loadProgress({ getItem: () => raw });
  assert.equal(loaded.warning, undefined); assert.equal(loaded.migrated, false);
  return loaded.progress;
}

test('Every schema-11 terrace prefix retains exact wallets, all paid ownership and pinned attempts after restaurant migration', () => {
  for (let prefix = 0; prefix <= 26; prefix++) for (const legacyBakery of [false, true]) {
    const old: any = freshProgress();
    assert.equal(applyDebugSceneState(old, { projectId: 'terrace-1', works: prefix, orders: 38 }).ok, true);
    if (legacyBakery) {
      // Schema11 retains the historical bakery marker; its paid identities must survive again.
      old.campaign.bakeryLegacyPrefix = 20;
    }
    old.schema = 11; old.campaign.version = 'coastal-campaign-9';
    old.contentVersion = 'coastal-stage-1-2-bakery-terrace-v1';
    old.coins = 8765; old.stars = 39; old.repairKits = 17;
    old.attempt = partlyPlayed(719); old.attempts['terrace-1'] = old.attempt;
    old.attempts['warehouse-2'] = partlyPlayed(301);
    old.attempts['bakery-1'] = partlyPlayed(639);
    const before = JSON.parse(JSON.stringify(old));
    assert.equal(validSchemaElevenCampaign(old.campaign), true, `${prefix}/${legacyBakery}`);
    const loaded = loadProgress({ getItem: () => JSON.stringify(old) });
    assert.equal(loaded.warning, undefined, `${prefix}/${legacyBakery}`); assert.equal(loaded.migrated, true);
    const progress = loaded.progress;
    assert.equal(progress.schema, 12); assert.equal(progress.campaign.version, 'coastal-campaign-10');
    assert.deepEqual(progress.campaign.completedTasks, before.campaign.completedTasks);
    assert.equal(progress.campaign.bakeryLegacyPrefix, before.campaign.bakeryLegacyPrefix);
    for (const key of ['coins', 'stars', 'repairKits', 'completed', 'inventory', 'settings', 'sceneDecor', 'attempt', 'attempts', 'selectedProject'] as const)
      assert.deepEqual(progress[key], before[key], `${prefix}/${legacyBakery}: ${key}`);
    assert.equal(interiorOpen('terrace-1', progress.campaign), prefix >= 14);
    assert.equal(nextProjectTask(progress.campaign, 'terrace-1')?.id,
      projectTasks('terrace-1').find(task => !before.campaign.completedTasks.includes(task.id))?.id);
    assert.deepEqual(roundTrip(progress), progress);
  }
});

test('The restaurant prototype follows terrace completion but never completes full global Stages3–5', () => {
  const progress = freshProgress();
  assert.equal(applyDebugSceneState(progress, { projectId: 'terrace-1', works: 26, orders: 80 }).ok, true);
  assert.equal(phaseStatus('restaurant-1', progress.completed, progress.campaign), 'available');
  assert.equal(currentGlobalStage(progress.completed, progress.campaign), 3);
  assert.equal(applyDebugSceneState(progress, { projectId: 'restaurant-1', works: 26, orders: 80 }).ok, true);
  assert.equal(phaseStatus('restaurant-1', progress.completed, progress.campaign), 'complete');
  assert.equal(currentGlobalStage(progress.completed, progress.campaign), 3);
  assert.equal(progress.completed.length, 840); assert.equal(progress.campaign.completedTasks.length, 204);
  assert.deepEqual(roundTrip(progress), progress);
});

test('Schema11 cannot own restaurant purchases, and future schema13 stays read-only', () => {
  const old: any = freshProgress(); old.schema = 11; old.campaign.version = 'coastal-campaign-9';
  old.campaign.completedTasks = ['restaurant-s1-t01'];
  assert.equal(validSchemaElevenCampaign(old.campaign), false);
  const loaded = loadProgress({ getItem: () => JSON.stringify(old) }); assert.ok(loaded.warning);
  const future = { ...freshProgress(), schema: 13, completed: CHAPTER.slice(0, 1).map(order => order.id) };
  assert.equal(loadProgress({ getItem: () => JSON.stringify(future) }).readOnly, true);
});
