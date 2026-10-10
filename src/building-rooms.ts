import {projectById,phaseStatus,nextProjectTask,type ProjectId} from './campaign';
import {sceneViews,sceneTaskView,SCENE_TASKS,type CampaignView} from './campaign-scene';
import type {Progress} from './storage';

export interface BuildingRoom { id:CampaignView; name:string; projectId:ProjectId; stage:number; kind:string;
  completed:number;total:number;recommended:boolean; }
type RoomProgress=Pick<Progress,'completed'|'campaign'>;
const kinds:Partial<Record<CampaignView,string>>={
  hall:'Торговый зал · вход и витрины', 'hall-prep':'Торговый зал · упаковка',
  'warehouse-yard':'Строительная площадка', 'warehouse-receiving':'Открытый двор',
  'fruit-yard':'Строительная площадка', 'fruit-extension-site':'Строительная площадка',
  'fruit-market':'Открытый павильон',
  'bakery-yard':'Фасад и строительная площадка', 'bakery-oven':'Помещение выпечки', 'bakery-shop':'Торговый зал',
};

/** Opening a chooser is read-only. Each card belongs to an available local stage. */
export function buildingRooms(progress:RoomProgress,preferred:ProjectId):BuildingRoom[]{
  const project=projectById(preferred);
  if(!project||!['available','complete'].includes(phaseStatus(preferred,progress.completed,progress.campaign)))return[];
  const next=nextProjectTask(progress.campaign,preferred),recommended=next&&sceneTaskView(next.id);
  return sceneViews(project.areaId,progress.campaign.completedTasks).flatMap(view=>{
    const eligible=SCENE_TASKS.filter(task=>task.view===view.id).map(task=>projectById(task.phaseId))
      .filter(candidate=>candidate?.areaId===project.areaId&&['available','complete'].includes(phaseStatus(candidate.id,progress.completed,progress.campaign)));
    const owner=eligible.find(candidate=>candidate?.id===preferred)??eligible.at(-1);
    if(!owner)return[];
    const tasks=SCENE_TASKS.filter(task=>task.phaseId===owner.id&&task.view===view.id);
    return [{...view,name:view.id==='hall'?'Вход и витрины':view.name,projectId:owner.id,stage:owner.stage,kind:kinds[view.id]??'Помещение',
      completed:tasks.filter(task=>progress.campaign.completedTasks.includes(task.id)).length,total:tasks.length,
      recommended:owner.id===preferred&&view.id===recommended}];
  }).sort((a,b)=>Number(b.projectId===preferred&&b.id===recommended)-Number(a.projectId===preferred&&a.id===recommended)
    ||Number(b.projectId===preferred)-Number(a.projectId===preferred));
}

/** Entry names the actual next work room; choosing it still belongs to the controller. */
export function projectRoomEntry(progress:RoomProgress,projectId:ProjectId):BuildingRoom|undefined {
  const rooms=buildingRooms(progress,projectId);
  return rooms.find(room=>room.recommended)??rooms.find(room=>room.projectId===projectId)??rooms[0];
}
