import type {State,Task} from './contracts';

/** Read only the content and delivery explicitly bound to this task. */
export function productionDetail(state:State,task:Task){
 if(!task.productionTaskId)throw Error('production_not_bound');
 const content=state.contents.find(c=>c.taskId===task.productionTaskId&&c.tenantId===task.tenantId);
 if(!content)throw Error('production_not_bound');
 const hasArtifactBinding=Boolean(task.artifactId||task.artifactVersion);
 const artifact=hasArtifactBinding
  ? content.artifacts.find(candidate=>candidate.taskId===content.taskId
    &&candidate.artifactId===task.artifactId
    &&candidate.version===task.artifactVersion
    &&(!task.runId||candidate.runId===task.runId))??null
  : null;
 if(hasArtifactBinding&&!artifact)throw Error('artifact_not_found');
 return {task,content,artifact};
}
