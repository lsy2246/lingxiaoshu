// 防止读取期间任务切换：读取前后都检查当前性，核验产物归属后才应用结果。候选人需要接入页面。
import type { SocialContentTaskDetail } from './contracts';

/** Accept only the requested task while the editor's authenticated read is current. */
export async function readCurrentStudioSocialTask(
  taskId: string,
  read: () => Promise<SocialContentTaskDetail>,
  isCurrent: () => boolean,
  apply: (task: SocialContentTaskDetail) => void,
): Promise<void> {
  if (!isCurrent()) return;
  const task = await read();
  if (!isCurrent()) return;
  if (task.taskId !== taskId || !task.version?.trim()
    || task.sources.some(source => source.taskId !== taskId)
    || task.artifacts.some(artifact => artifact.taskId !== taskId)) {
    throw new Error('工作台任务身份不一致，请返回原任务重新打开。');
  }
  apply(task);
}
