import type {Task} from './contracts';
/** 考题缺口 A：这里未消费真实状态。请建立一致的状态/阻塞投影，勿按 fixture ID 硬编码。 */
export function projectTask(task:Task){return {...task,statusLabel:'未开始',needsAttention:false}}
