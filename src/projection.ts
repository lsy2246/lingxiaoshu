import type {Task} from './contracts';
import {taskNeedsAttention,taskWaitLabels} from './taskExecutionState';

const statusLabels:Record<string,string>={
 pending:'未开始',queued:'排队中',running:'执行中',waiting_external:'等待外部输入',
 failed:'失败',succeeded:'已完成',completed:'已完成',cancelled:'已取消',skipped:'已跳过',
 waiting_approval:'等待审批',handed_off:'已转交',waiting_human:'需要人工处理',
};

/** Project backend state for the board; unknown states remain visibly unknown. */
export function projectTask(task:Task){
 const waitState=task.output?.waitState as {kind?:string}|undefined;
 const waitLabel=waitState?.kind&&waitState.kind in taskWaitLabels
  ? taskWaitLabels[waitState.kind as keyof typeof taskWaitLabels] : undefined;
 return {...task,statusLabel:waitLabel??statusLabels[task.status]??'未知状态',needsAttention:taskNeedsAttention(task)};
}
