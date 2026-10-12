import type {State,Task} from './contracts';
/** 考题缺口 B/C：读取详情尚未核验组织、任务绑定和原产物版本。读取本身没有执行副作用。 */
export function productionDetail(state:State,task:Task){
 const content=state.contents.find(c=>c.taskId===task.productionTaskId)??state.contents[0];
 return {task,content,artifact:content.artifacts.at(-1)??null};
}
