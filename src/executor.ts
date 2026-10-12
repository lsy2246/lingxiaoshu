import {randomUUID} from 'node:crypto';
import type {State,Task} from './contracts';
export const executionModes=['running','missing_authorization','failure','success'] as const;
export type ExecutionMode=typeof executionModes[number];
/** 模拟外部服务结果，但写入的任务/运行/产物记录是真实数据库数据。每次成功追加产物，保留历史。 */
export function execute(state:State,task:Task,mode:ExecutionMode){
 const content=state.contents.find(c=>c.taskId===task.productionTaskId&&c.tenantId===task.tenantId);
 if(!content)throw Error('production_not_bound');
 if(mode==='missing_authorization'){task.status='waiting_external';task.blocked_reason='缺少数字人授权';task.output={waitState:{kind:'input',message:task.blocked_reason,requiresAttention:true}};return}
 delete task.blocked_reason;delete task.output;
 if(mode==='failure'){task.status='failed';task.blocked_reason='模拟生成服务失败';return}
 task.status=mode==='running'?'running':'succeeded';
 if(mode==='running')return;
 const runId='run-'+randomUUID();const version='v'+(content.artifacts.length+1);
 const artifact={taskId:content.taskId,artifactId:'film-'+randomUUID(),version,runId,kind:'short_video',origin:'agent',videoUrl:'/media/demo.mp4',audioUrl:'/media/demo.wav'};
 content.artifacts.push(artifact);content.runId=runId;content.version=version;
 task.runId=runId;task.artifactId=artifact.artifactId;task.artifactVersion=version;
}
