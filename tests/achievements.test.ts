import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTS, projectOrders, projectTasks, type ProjectId } from '../src/campaign';
import { freshProgress, loadProgress, saveProgress, type Progress } from '../src/storage';
import { campaignAchievements, finalAchievement, unseenAchievement, acknowledgeAchievement, FINAL_ACHIEVEMENT_ID } from '../src/achievements';
import { offlineChapterLevel } from '../src/content-offline';
import { initial } from '../src/engine';

function finish(progress: Progress, id: ProjectId) {
  progress.completed.push(...projectOrders(id).map(order => order.id));
  progress.campaign.completedTasks.push(...projectTasks(id).map(task => task.id));
}

test('room medals require every first win and paid work; duplicate orders cannot inflate progress', () => {
  const p = freshProgress();
  p.completed = projectOrders('shop-1').map(order => order.id);
  p.completed.push(p.completed[0], 'chapter-1');
  let medal = campaignAchievements(p)[0];
  assert.equal(medal.ordersDone, 80);
  assert.equal(medal.earned, false);
  p.campaign.completedTasks = projectTasks('shop-1').slice(0, 13).map(task => task.id);
  assert.equal(campaignAchievements(p)[0].earned, false);
  p.campaign.completedTasks.push(projectTasks('shop-1')[13].id);
  medal = campaignAchievements(p)[0];
  assert.equal(medal.earned, true);
  assert.equal(medal.tasksDone, 14);
  p.completed.pop(); p.completed.splice(79, 1);
  assert.equal(campaignAchievements(p)[0].earned, false);
});

test('final achievement describes the delivered block, and opening all buildings alone does not complete it', () => {
  const p = freshProgress();
  for (const project of PROJECTS) p.completed.push(...projectOrders(project.id).map(order => order.id));
  assert.equal(finalAchievement(p).earned, false);
  for (const project of PROJECTS) p.campaign.completedTasks.push(...projectTasks(project.id).map(task => task.id));
  const before = structuredClone(p);
  assert.equal(campaignAchievements(p).filter(medal => medal.earned).length, 9);
  const final = finalAchievement(p);
  assert.equal(final.earned, true);
  assert.deepEqual([final.ordersDone, final.ordersTotal, final.tasksDone, final.tasksTotal], [840, 840, 204, 204]);
  assert.deepEqual(p, before, 'Computing medals does not modify ownership or wallets');
});

test('one final celebration replaces the last room notification and acknowledgements issue no rewards', () => {
  const p = freshProgress();
  finish(p, 'shop-1');
  assert.equal(unseenAchievement(p, 'shop-1')?.id, 'project:shop-1');
  assert.equal(acknowledgeAchievement(p, 'project:warehouse-1'), false);
  const before = structuredClone(p);
  assert.equal(acknowledgeAchievement(p, 'project:shop-1'), true);
  assert.equal(acknowledgeAchievement(p, 'project:shop-1'), true);
  assert.deepEqual(p.achievementsSeen, ['project:shop-1']);
  assert.equal(unseenAchievement(p, 'shop-1'), undefined);
  const { achievementsSeen: _, ...after } = p;
  const { achievementsSeen: __, ...previous } = before;
  assert.deepEqual(after, previous);
  for (const project of PROJECTS.filter(project => project.id !== 'shop-1')) finish(p, project.id);
  assert.equal(unseenAchievement(p, 'restaurant-1')?.id, FINAL_ACHIEVEMENT_ID);
  acknowledgeAchievement(p, FINAL_ACHIEVEMENT_ID);
  acknowledgeAchievement(p, 'project:restaurant-1');
  assert.equal(unseenAchievement(p, 'restaurant-1'), undefined);
});

test('old and malformed notification metadata preserve wallets and the exact pinned attempt', () => {
  const p = freshProgress();
  const definition = offlineChapterLevel(1);
  p.attempt = { id: 'achievement-pinned', definition, board: initial(definition), undo: [], solution: definition.verifiedSolution, mixCount: 0, hints: {}, reward: null };
  p.attempts['shop-1'] = p.attempt;
  p.coins = 987; p.stars = 8; p.repairKits = 5;
  for (const value of [undefined, null, 123, ['unknown', 'project:shop-1', 'project:shop-1']]) {
    const old = structuredClone(p) as any;
    if (value === undefined) delete old.achievementsSeen;
    else old.achievementsSeen = value;
    const loaded = loadProgress({ getItem: () => JSON.stringify(old) });
    assert.equal(loaded.warning, undefined);
    for (const key of ['completed', 'campaign', 'coins', 'stars', 'repairKits', 'inventory'] as const) assert.deepEqual(loaded.progress[key], p[key]);
    assert.deepEqual(loaded.progress.attempt?.definition, p.attempt.definition);
    assert.deepEqual(loaded.progress.attempt?.board, p.attempt.board);
    assert.deepEqual(loaded.progress.achievementsSeen, Array.isArray(value) ? ['project:shop-1'] : []);
    let saved = '';
    saveProgress({ setItem: (_key, text) => { saved = text; } }, loaded.progress);
    assert.deepEqual(loadProgress({ getItem: () => saved }).progress, loaded.progress);
    assert.equal(loadProgress({ getItem: () => saved }).migrated, false);
  }
});
