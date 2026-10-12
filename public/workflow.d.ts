import type { StudioNode, StudioProject, StudioScene } from "../src/contracts";
export interface WorkflowKind {
  title: string;
  icon: string;
  description: string;
  output: string;
  prompt: string;
  operations: string[];
  ports: Array<{ label: string; kinds: string[]; optional?: boolean }>;
}
export const CATALOG: Record<string, WorkflowKind>;
export const VOICES: Array<{ id: string; name: string; detail: string }>;
export function operationOf(node: StudioNode): string;
export function inputPorts(node: StudioNode): Array<{ key: string; type: string }>;
export function outputPorts(node: StudioNode): Array<{ key: string; type: string }>;
export function compatiblePorts(source: string, target: string): boolean;
export function fieldEdges(nodes: StudioNode[]): Array<{ source: string; sourceField: string; target: string; targetField: string }>;
export function bindField(nodes: StudioNode[], sourceId: string, sourceField: string, targetId: string, targetField: string, external?: StudioNode[]): void;
export function referenceIds(value: unknown): string[];
export function inputIds(node: StudioNode, nodes: StudioNode[]): string[];
export function descendants(nodes: StudioNode[], seeds: string[]): Set<string>;
export function makeNode(kind: string, index: number, id: string): StudioNode;
export function connectDefaults(node: StudioNode, nodes: StudioNode[]): void;
export function createWorkflow(id: () => string): StudioNode[];
export function layoutWorkflow(nodes: StudioNode[]): void;
export function upgradeWorkflow(
  project: StudioProject,
  id: () => string,
): boolean;
export function graphIssues(
  nodes: StudioNode[],
): Array<{ nodeId?: string; message: string }>;
export function storyboard(
  topic: string,
  script?: string,
  text?: string,
): StudioScene[];
