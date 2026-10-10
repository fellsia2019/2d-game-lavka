import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingRooms,projectRoomEntry} from '../src/building-rooms';
import {freshProgress} from '../src/storage';
import {projectOrders,projectTasks,type ProjectId} from '../src/campaign';

test('building rooms respect unlocks and reached rooms without mutating a save',()=>{
  const p=freshProgress(),before=JSON.stringify(p);
  assert.deepEqual(buildingRooms(p,'warehouse-1'),[]);
  assert.deepEqual(buildingRooms(p,'shop-2'),[]);
  assert.deepEqual(buildingRooms(p,'bakery-1' as ProjectId),[]);
  assert.deepEqual(buildingRooms(p,'shop-1').map(room=>room.id),['hall','hall-prep']);
  assert.equal(JSON.stringify(p),before);
});
test('rooms of earlier and current stages select their real owner',()=>{
  const p=freshProgress();
  for(const id of ['shop-1','warehouse-1'] as const){p.completed.push(...projectOrders(id).map(order=>order.id));p.campaign.completedTasks.push(...projectTasks(id).map(task=>task.id));}
  const rooms=buildingRooms(p,'shop-2'),before=JSON.stringify(p);
  assert.equal(rooms.find(room=>room.id==='hall')?.projectId,'shop-1');
  assert.equal(rooms.find(room=>room.id==='shop-grocery')?.projectId,'shop-2');
  assert.equal(rooms.find(room=>room.id==='shop-service'),undefined);
  assert.equal(buildingRooms(p,'warehouse-2').find(room=>room.id==='warehouse-receiving')?.projectId,'warehouse-2');
  assert.equal(JSON.stringify(p),before);
});

 test('room recommendations follow the next unpaid work and expose read-only progress',()=>{
  const p=freshProgress(),before=JSON.stringify(p);
  assert.equal(projectRoomEntry(p,'shop-1')?.id,'hall');
  assert.equal(projectRoomEntry(p,'warehouse-1'),undefined);
  assert.equal(buildingRooms(p,'shop-1').filter(r=>r.recommended).length,1);
  assert.equal(JSON.stringify(p),before);
  p.campaign.completedTasks.push(...projectTasks('shop-1').slice(0,10).map(t=>t.id));
  const rooms=buildingRooms(p,'shop-1'),snapshot=JSON.stringify(p);
  assert.equal(projectRoomEntry(p,'shop-1')?.id,'hall-prep');
  assert.equal(rooms.find(r=>r.id==='hall')?.completed,10);
  assert.equal(rooms.find(r=>r.id==='hall-prep')?.completed,0);
  assert.equal(JSON.stringify(p),snapshot);
});

test('bakery rooms lead through the recognizable entrance before the back kitchen',()=>{
  const p=freshProgress();
  for(const id of ['shop-1','warehouse-1','shop-2','warehouse-2','fruit-yard-1','fruit-yard-2'] as const){p.completed.push(...projectOrders(id).map(order=>order.id));p.campaign.completedTasks.push(...projectTasks(id).map(task=>task.id));}
  assert.equal(projectRoomEntry(p,'bakery-1')?.id,'bakery-yard');
  p.campaign.completedTasks.push(...projectTasks('bakery-1').slice(0,10).map(task=>task.id));
  assert.equal(projectRoomEntry(p,'bakery-1')?.id,'bakery-shop');
  p.campaign.completedTasks.push(...projectTasks('bakery-1').slice(10,19).map(task=>task.id));
  assert.equal(projectRoomEntry(p,'bakery-1')?.id,'bakery-oven');
  const before=JSON.stringify(p);
  assert.deepEqual(new Set(buildingRooms(p,'bakery-1').map(room=>room.id)),new Set(['bakery-yard','bakery-oven','bakery-shop']));
  assert.equal(JSON.stringify(p),before);
});
