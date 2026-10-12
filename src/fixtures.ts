import type {State,Artifact} from './contracts';
const artifact=(id:string,version:string,runId:string):Artifact=>({taskId:'content-a',artifactId:id,version,runId,kind:'short_video',origin:'agent',videoUrl:'/media/demo.mp4',audioUrl:'/media/demo.wav'});
/** 完全合成的两个组织。旧任务固定绑定 run-1/film-1，当前内容已经推进到 run-2。 */
export function initialState():State{return {
 tasks:[
 {id:'task-running',tenantId:'tenant-a',title:'视频制作',status:'running',productionTaskId:'content-a',runId:'run-2',createdAt:'2026-10-11T00:00:00Z'},
 {id:'task-blocked',tenantId:'tenant-a',title:'数字人素材准备',status:'waiting_external',blocked_reason:'缺少已授权数字人',output:{waitState:{kind:'input',message:'请补充数字人授权',requiresAttention:true}},productionTaskId:'content-a',runId:'run-2',createdAt:'2026-10-11T00:00:00Z'},
 {id:'task-done',tenantId:'tenant-a',title:'历史成片交付',status:'succeeded',productionTaskId:'content-a',runId:'run-1',artifactId:'film-1',artifactVersion:'v1',createdAt:'2026-10-11T00:00:00Z'},
 {id:'task-unbound',tenantId:'tenant-a',title:'未派发计划',status:'pending',createdAt:'2026-10-11T00:00:00Z'},
 {id:'task-foreign',tenantId:'tenant-b',title:'其他组织任务',status:'running',productionTaskId:'content-b',runId:'run-b',createdAt:'2026-10-11T00:00:00Z'}],
 contents:[{taskId:'content-a',tenantId:'tenant-a',version:'v2',runId:'run-2',sources:[{taskId:'content-a',sourceId:'reference-a'}],artifacts:[artifact('film-1','v1','run-1'),artifact('film-2','v2','run-2')],scenes:[{id:'scene-1',description:'演示产品使用步骤',mediaUrl:'/media/demo.mp4'},{id:'scene-2',description:'演示收尾说明',mediaUrl:'/media/demo.mp4'}],narration:'这是虚构产品的演示口播。'},
 {taskId:'content-b',tenantId:'tenant-b',version:'v1',runId:'run-b',sources:[],artifacts:[],scenes:[],narration:'其他组织内容'}]};}
