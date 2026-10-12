import type { StudioNode, StudioProject } from "./contracts";

export type StudioProjectStatus = StudioProject["status"];
export type StudioNodeStatus = StudioNode["status"];

export interface StudioStateEvent {
  from: StudioProjectStatus;
  to: StudioProjectStatus;
  at: string;
  reason?: string;
}

const projectTransitions: Record<StudioProjectStatus, readonly StudioProjectStatus[]> = {
  draft: ["running", "paused", "failed"],
  running: ["paused", "succeeded", "failed"],
  paused: ["running", "draft", "failed", "succeeded"],
  succeeded: ["running", "paused", "draft"],
  failed: ["running", "paused", "draft"],
};

const nodeTransitions: Record<StudioNodeStatus, readonly StudioNodeStatus[]> = {
  pending: ["running", "skipped"],
  running: ["pending", "done", "waiting", "skipped"],
  waiting: ["done", "pending"],
  done: ["pending"],
  skipped: ["pending"],
};

export function canTransitionProject(
  from: StudioProjectStatus,
  to: StudioProjectStatus,
) {
  return from === to || projectTransitions[from].includes(to);
}

export function transitionProject(
  project: Pick<StudioProject, "status" | "stateHistory" | "stateReason">,
  to: StudioProjectStatus,
  reason?: string,
  at = new Date().toISOString(),
) {
  if (!canTransitionProject(project.status, to))
    throw new Error(`不允许的流程状态转换：${project.status} → ${to}`);
  if (project.status !== to) {
    project.stateHistory = [
      ...(project.stateHistory || []).slice(-19),
      { from: project.status, to, at, ...(reason ? { reason } : {}) },
    ];
  }
  project.status = to;
  project.stateReason = reason;
}

export function canTransitionNode(from: StudioNodeStatus, to: StudioNodeStatus) {
  return from === to || nodeTransitions[from].includes(to);
}

export function transitionNode(node: Pick<StudioNode, "status">, to: StudioNodeStatus) {
  if (!canTransitionNode(node.status, to))
    throw new Error(`不允许的节点状态转换：${node.status} → ${to}`);
  node.status = to;
}
