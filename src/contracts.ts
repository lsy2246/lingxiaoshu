/** 三种身份不能混用：taskId 是业务任务，runId 是一次执行，artifactId+version 是一次交付。 */
export interface SocialContentTaskDetail {
  taskId: string;
  version: string;
  runId?: string;
  tenantId: string;
  sources: Array<{ taskId: string; sourceId: string }>;
  artifacts: Artifact[];
  scenes: Scene[];
  narration: string;
}
export interface Scene {
  id: string;
  description: string;
  mediaUrl: string;
}
export interface Artifact {
  taskId: string;
  artifactId: string;
  version: string;
  runId: string;
  kind: string;
  origin: string;
  videoUrl: string;
  audioUrl: string;
}
export interface Task {
  id: string;
  tenantId: string;
  title: string;
  status: string;
  blocked_reason?: string;
  output?: Record<string, unknown>;
  productionTaskId?: string;
  runId?: string;
  artifactId?: string;
  artifactVersion?: string;
  createdAt: string;
}
export interface StudioScene {
  id: string;
  duration: number;
  visual: string;
  dialogue: string;
  camera: string;
}
export interface StudioAsset {
  id: string;
  type: string;
  sceneId?: string;
  sourceIds: string[];
  description?: string;
  text?: string;
  duration?: number;
  url?: string;
}
export interface StudioTimeline {
  sceneId: string;
  start: number;
  end: number;
  videoId: string;
  audioId: string;
  dialogue: string;
}
export interface StudioCue {
  sceneId: string;
  start: number;
  end: number;
  text: string;
}
export interface StudioOutput {
  demo: true;
  type: string;
  summary: string;
  refs: string[];
  data?: Record<string, any>;
  iterations?: Array<{ index: number; item: unknown; nodes: StudioNode[] }>;
  text?: string;
  scenes?: StudioScene[];
  assets?: StudioAsset[];
  voice?: string;
  voiceId?: string;
  timeline?: StudioTimeline[];
  cues?: StudioCue[];
  sourceMediaId?: string;
  format?: string;
  settings?: StudioNode["settings"];
}
export interface StudioNode {
  id: string;
  kind: string;
  title: string;
  prompt: string;
  x: number;
  y: number;
  status: "pending" | "running" | "done" | "waiting" | "skipped";
  result?: string;
  inputs?: string[];
  output?: StudioOutput;
  settings?: {
    operation?: string;
    values?: Record<string, string>;
    bindings?: Record<string, unknown>;
    children?: StudioNode[];
    autoApprove?: boolean;
    approved?: boolean;
    confirmedValue?: unknown;
    field?: string;
    operator?: "equals" | "contains" | "gt" | "truthy";
    compare?: unknown;
    cases?: Record<string, unknown>;
    gate?: { nodeId: string; branch: string };
    scenes?: StudioScene[];
    text?: string;
    voiceId?: string;
    speed?: number;
    emotion?: string;
  };
}
export interface DigitalHuman {
  id: string;
  tenantId: string;
  name: string;
  voice: string;
  status: "training" | "ready" | "failed";
  createdAt: string;
  trainingStartedAt?: number;
  version: number;
  demo?: boolean;
  files: Array<{ name: string; type: string; size: number; data?: string }>;
}
export interface StudioVersion {
  id: string;
  version: number;
  createdAt: string;
  videoUrl: string;
  audioUrl: string;
  nodes: StudioNode[];
  topic: string;
  humanId: string;
}
export interface StudioProject {
  id: string;
  tenantId: string;
  topic: string;
  humanId: string;
  script: string;
  ratio: string;
  nodes: StudioNode[];
  status: "draft" | "running" | "paused" | "succeeded" | "failed";
  stateReason?: string;
  stateHistory?: Array<{
    from: "draft" | "running" | "paused" | "succeeded" | "failed";
    to: "draft" | "running" | "paused" | "succeeded" | "failed";
    at: string;
    reason?: string;
  }>;
  revision: number;
  createdAt: string;
  updatedAt: string;
  stepStartedAt?: number;
  pauseRequested?: boolean;
  versions: StudioVersion[];
  error?: string;
  workflowVersion?: number;
  workflowArchives?: Array<{
    nodes: StudioNode[];
    version: number;
    createdAt: string;
  }>;
}
export interface State {
  tasks: Task[];
  contents: SocialContentTaskDetail[];
  studio?: { humans: DigitalHuman[]; projects: StudioProject[] };
}
