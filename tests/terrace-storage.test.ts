import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshProgress, loadProgress, saveProgress, type Attempt, type Progress } from '../src/storage';
import { applyDebugSceneState } from '../src/debug-scene';
import { projectTasks, nextProjectTask, interiorOpen, validSchemaTenCampaign, phaseStatus, currentGlobalStage } from '../src/campaign';
import { offlineChapterLevel } from '../src/content-offline';
import { applyMove, initial } from '../src/engine';
import { createOrderAppearance } from '../src/order-supplies';

function partlyPlayed(number: number): Attempt {
  const definition = offlineChapterLevel(number), board = initial(definition);
  const moved = applyMove(board, ...definition.verifiedSolution[0]);
  assert.ok(moved);
  return { id: `before-terrace-${number}`, definition, appearance: createOrderAppearance(definition),
    board: moved, undo: [board], solution: definition.verifiedSolution.slice(1), mixCount: 0,
    hints: {}, reward: null };
}

function roundTrip(progress: Progress): Progress {
  let raw = '';
  assert.equal(saveProgress({ setItem: (_key, value) => { raw = value; } }, progress), true);
  const loaded = loadProgress({ getItem: () => raw });
  assert.equal(loaded.warning, undefined);
  assert.equal(loaded.migrated, false);
  return loaded.progress;
}

test('Every schema-10 bakery prefix keeps ownership, wallets and exact pinned attempts when terrace is added', () => {
  for (let prefix = 0; prefix <= 26; prefix++) for (const legacy of [false, true]) {
    if (legacy && (prefix < 13 || prefix > 25)) continue;
    const old: any = freshProgress();
    assert.equal(applyDebugSceneState(old, { projectId: 'bakery-1', works: prefix, orders: 38 }).ok, true);
    if (legacy) {
      old.campaign.completedTasks = old.campaign.completedTasks.filter((id: string) => !id.startsWith('bakery-s1-'));
      old.campaign.completedTasks.push(...projectTasks('bakery-1').slice().sort((a, b) => a.id.localeCompare(b.id)).slice(0, prefix).map(task => task.id));
      old.campaign.bakeryLegacyPrefix = prefix;
    }
    old.schema = 10; old.campaign.version = 'coastal-campaign-8';
    old.contentVersion = 'coastal-stage-1-2-bakery-v2';
    old.coins = 8765; old.stars = 39; old.repairKits = 17;
    old.attempt = partlyPlayed(639); old.attempts['bakery-1'] = old.attempt;
    old.attempts['warehouse-2'] = partlyPlayed(301);
    const before = JSON.parse(JSON.stringify(old));
    assert.equal(validSchemaTenCampaign(old.campaign), true, `${prefix}/${legacy}`);
    const loaded = loadProgress({ getItem: () => JSON.stringify(old) });
    assert.equal(loaded.warning, undefined, `${prefix}/${legacy}`);
    assert.equal(loaded.migrated, true);
    const progress = loaded.progress;
    assert.equal(progress.schema, 11);
    assert.equal(progress.campaign.version, 'coastal-campaign-9');
    assert.deepEqual(progress.campaign.completedTasks, before.campaign.completedTasks);
    assert.equal(progress.campaign.bakeryLegacyPrefix, before.campaign.bakeryLegacyPrefix);
    for (const key of ['coins', 'stars', 'repairKits', 'completed', 'inventory', 'settings', 'sceneDecor', 'attempt', 'attempts', 'selectedProject'] as const)
      assert.deepEqual(progress[key], before[key], `${prefix}/${legacy}: ${key}`);
    assert.equal(interiorOpen('bakery-1', progress.campaign), prefix >= 14);
    assert.equal(nextProjectTask(progress.campaign, 'bakery-1')?.id,
      projectTasks('bakery-1').find(task => !before.campaign.completedTasks.includes(task.id))?.id);
    assert.deepEqual(roundTrip(progress), progress);
  }
});

test('Terrace preview follows a completed bakery without falsely completing global Stage 3 or 4', () => {
  const progress = freshProgress();
  assert.equal(applyDebugSceneState(progress, { projectId: 'bakery-1', works: 26, orders: 80 }).ok, true);
  assert.equal(phaseStatus('terrace-1', progress.completed, progress.campaign), 'available');
  assert.equal(currentGlobalStage(progress.completed, progress.campaign), 3);
  assert.equal(applyDebugSceneState(progress, { projectId: 'terrace-1', works: 26, orders: 80 }).ok, true);
  assert.equal(phaseStatus('terrace-1', progress.completed, progress.campaign), 'complete');
  assert.equal(currentGlobalStage(progress.completed, progress.campaign), 3);
  assert.deepEqual(roundTrip(progress), progress);
});

test('Schema 10 cannot claim a terrace purchase that did not exist in its catalog', () => {
  const old: any = freshProgress(); old.schema = 10; old.campaign.version = 'coastal-campaign-8';
  old.campaign.completedTasks = ['terrace-s1-t01'];
  assert.equal(validSchemaTenCampaign(old.campaign), false);
  const loaded = loadProgress({ getItem: () => JSON.stringify(old) });
  assert.ok(loaded.warning);
});
