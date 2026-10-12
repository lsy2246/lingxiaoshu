/** 三种身份不能混用：taskId 是业务任务，runId 是一次执行，artifactId+version 是一次交付。 */
export interface SocialContentTaskDetail {
 taskId:string; version:string; runId?:string; tenantId:string;
 sources:Array<{taskId:string;sourceId:string}>;
 artifacts:Artifact[]; scenes:Scene[]; narration:string;
}
export interface Scene {id:string;description:string;mediaUrl:string}
export interface Artifact {taskId:string;artifactId:string;version:string;runId:string;kind:string;origin:string;videoUrl:string;audioUrl:string}
export interface Task {id:string;tenantId:string;title:string;status:string;blocked_reason?:string;output?:Record<string,unknown>;productionTaskId?:string;runId?:string;artifactId?:string;artifactVersion?:string;createdAt:string}
export interface State {tasks:Task[];contents:SocialContentTaskDetail[]}
