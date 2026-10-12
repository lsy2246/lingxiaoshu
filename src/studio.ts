import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Store } from "./store";
import type {
  State,
  StudioProject,
  StudioNode,
  StudioOutput,
  StudioAsset,
  DigitalHuman,
} from "./contracts";
import {
  CATALOG,
  VOICES,
  descendants,
  graphIssues,
  inputIds,
  storyboard,
  upgradeWorkflow,
} from "../public/workflow.js";

import { executeNode } from "./workflow-runtime";
import { transitionNode, transitionProject } from "./studio-state-machine";

const kinds = new Set(Object.keys(CATALOG));
const STEP_MS = 3500;
const TRAIN_MS = 20000;
class StudioError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function ensure(state: State, tenantId: string) {
  state.studio ??= { humans: [], projects: [] };
  if (!state.studio.humans.some((h) => h.tenantId === tenantId)) {
    state.studio.humans.push({
      id: "demo-" + tenantId,
      tenantId,
      name: "小映 · 示例",
      voice: "自然亲切",
      status: "ready",
      version: 1,
      demo: true,
      createdAt: new Date().toISOString(),
      files: [],
    });
  }
  return state.studio;
}
function owned<T extends { id: string; tenantId: string }>(
  items: T[],
  id: string,
  tenantId: string,
) {
  const item = items.find(
    (item) => item.id === id && item.tenantId === tenantId,
  );
  if (!item) throw new StudioError(404, "内容不存在或无权访问");
  return item;
}
function safeHuman(h: DigitalHuman) {
  return {
    ...h,
    files: h.files.map(({ name, type, size }) => ({ name, type, size })),
    progress:
      h.status === "training"
        ? Math.min(
            99,
            Math.floor(
              ((Date.now() - (h.trainingStartedAt ?? Date.now())) / TRAIN_MS) *
                100,
            ),
          )
        : h.status === "ready"
          ? 100
          : 0,
  };
}
function result(node: StudioNode, p: StudioProject, h: DigitalHuman) {
  const scope = Object.fromEntries(
    p.nodes.filter((n) => n.output?.data).map((n) => [n.id, n.output!.data]),
  );
  const output = executeNode(node, p, h, scope);
  node.output = output;
  const inputs =
    inputIds(node, p.nodes)
      .map((id) => p.nodes.find((n) => n.id === id)?.title)
      .join("、") || "无（起始节点）";
  return `${output.summary}\n输入节点：${inputs}\n配置：${node.prompt || "使用剧本默认设置"}`;
}

function mockOutput(node: StudioNode, index: number): StudioOutput {
  const operation = node.settings?.operation || node.kind;
  const scenes = [
    { id: "scene-mock-1", duration: 4, visual: "数字人面对镜头展示产品亮点", dialogue: "今天用 30 秒讲清楚这个产品为什么值得选。", camera: "中景推进" },
    { id: "scene-mock-2", duration: 5, visual: "产品细节与使用场景快速切换", dialogue: "核心功能一眼可见，使用起来也很简单。", camera: "特写切换" },
  ];
  const asset = { id: `asset-mock-${index}`, type: operation.includes("audio") || operation.includes("tts") ? "audio" : "video", sourceIds: [], url: "/media/demo.mp4", duration: 9, description: "Mock 演示产物" };
  return {
    demo: true,
    type: "mock",
    summary: `Mock 已完成：${node.title}`,
    refs: node.inputs || [],
    data: { mock: true, operation, scenes, text: scenes.map((scene) => scene.dialogue).join("\n"), file: asset, media: asset },
    scenes: operation === "storyboard.plan" ? scenes : undefined,
    assets: [asset],
  };
}

function mockProject(p: StudioProject, action: string) {
  if (action === "reset") {
    for (const node of p.nodes) {
      if (node.status !== "pending") transitionNode(node, "pending");
      delete node.output;
      delete node.result;
    }
    transitionProject(p, "draft", "Mock 已重置");
    delete p.error;
    p.pauseRequested = false;
    return;
  }
  if (action === "seed") {
    for (const [index, node] of p.nodes.entries()) {
      if (index === 0 || node.kind === "start") {
        if (node.status !== "done") {
          if (node.status === "running") transitionNode(node, "pending");
          transitionNode(node, "running");
          transitionNode(node, "done");
        }
        node.output = mockOutput(node, index);
        node.result = node.output.summary;
        continue;
      }
      if (node.status !== "pending") transitionNode(node, "pending");
      delete node.output;
      delete node.result;
    }
    transitionProject(p, "paused", "Mock 数据已填充，可逐步执行");
    p.error = undefined;
    return;
  }
  if (action === "fail") {
    if (p.status !== "running" && p.status !== "paused")
      transitionProject(p, "running", "Mock 开始失败场景");
    transitionProject(p, "failed", "Mock 模拟：第三方生成服务超时");
    p.error = "Mock 模拟：第三方生成服务超时";
    return;
  }
  if (action === "wait") {
    const node = p.nodes.find((candidate) => candidate.status === "pending" && candidate.kind === "human") || p.nodes.find((candidate) => candidate.status === "pending");
    if (!node) throw new StudioError(409, "没有可进入等待状态的节点");
    transitionNode(node, "running");
    transitionNode(node, "waiting");
    transitionProject(p, "paused", `Mock 模拟等待：${node.title}`);
    p.stateReason = `Mock 模拟等待：${node.title}`;
    return;
  }
  if (action === "complete") {
    if (p.status !== "running" && p.status !== "paused")
      transitionProject(p, "running", "Mock 开始完成场景");
    for (const [index, node] of p.nodes.entries()) {
      if (node.status === "waiting") transitionNode(node, "done");
      else if (node.status !== "done") {
        if (node.status === "running") transitionNode(node, "pending");
        if (node.status === "skipped") transitionNode(node, "pending");
        transitionNode(node, "running");
        transitionNode(node, "done");
      }
      node.output = mockOutput(node, index);
      node.result = node.output.summary;
    }
    transitionProject(p, "succeeded", "Mock 模拟：全部节点完成");
    p.error = undefined;
    p.versions.push({
      id: "mock-version-" + randomUUID(),
      version: p.versions.length + 1,
      createdAt: new Date().toISOString(),
      videoUrl: "/media/demo.mp4",
      audioUrl: "/media/demo.wav",
      nodes: structuredClone(p.nodes),
      topic: p.topic,
      humanId: p.humanId,
    });
    return;
  }
  if (action === "step") {
    const node = p.nodes.find((candidate) => candidate.status === "pending");
    if (!node) throw new StudioError(409, "没有可执行的 Mock 节点");
    transitionNode(node, "running");
    transitionNode(node, "done");
    const index = p.nodes.indexOf(node);
    node.output = mockOutput(node, index);
    node.result = node.output.summary;
    transitionProject(p, "paused", `Mock 已完成：${node.title}`);
    p.stateReason = `Mock 已完成：${node.title}`;
    return;
  }
  throw new StudioError(400, "未知的 Mock 状态操作");
}
/** Time based simulator resumes after reload/server restart; completion never depends on browser timers. */
function advance(state: State, tenantId: string, now = Date.now()) {
  const studio = ensure(state, tenantId);
  for (const p of studio.projects.filter(
    (p) => p.tenantId === tenantId && p.workflowVersion !== 3,
  )) {
    if (upgradeWorkflow(p, () => "node-" + randomUUID())) {
      p.revision++;
      p.updatedAt = new Date(now).toISOString();
    }
  }
  for (const h of studio.humans.filter(
    (h) => h.tenantId === tenantId && h.status === "training",
  )) {
    if (now - (h.trainingStartedAt ?? now) >= TRAIN_MS) h.status = "ready";
  }
  for (const p of studio.projects.filter(
    (p) => p.tenantId === tenantId && p.status === "running",
  )) {
    const h = studio.humans.find(
      (h) => h.id === p.humanId && h.tenantId === tenantId,
    );
    if (!h || h.status !== "ready") {
      transitionProject(p, "failed", "数字人尚未完成训练");
      p.error = "数字人尚未完成训练";
      p.revision++;
      continue;
    }
    while (
      p.status === "running" &&
      now - (p.stepStartedAt ?? now) >= STEP_MS
    ) {
      const node = p.nodes.find((n) => n.status === "running");
      if (node) {
        try {
          const gate = node.settings?.gate;
          if (
            (gate &&
              p.nodes.find((n) => n.id === gate.nodeId)?.output?.data
                ?.branch !== gate.branch) ||
            inputIds(node, p.nodes).some(
              (id) => p.nodes.find((n) => n.id === id)?.status === "skipped",
            )
          ) {
              transitionNode(node, "skipped");
            node.output = {
              demo: true,
              type: "skipped",
              summary: "分支未选中",
              refs: inputIds(node, p.nodes),
              data: { skipped: true },
            };
          } else {
            node.result = result(node, p, h);
            if (
              node.kind === "human" &&
              !node.settings?.autoApprove &&
              !node.settings?.approved
            ) {
              transitionNode(node, "waiting");
              transitionProject(p, "paused", `等待人工确认：${node.title}`);
              p.pauseRequested = false;
              p.revision++;
              break;
            }
            transitionNode(node, "done");
          }
        } catch (e) {
          transitionNode(node, "pending");
          transitionProject(p, "failed", e instanceof Error ? e.message : "节点输入产物不完整");
          p.error = e instanceof Error ? e.message : "节点输入产物不完整";
          p.revision++;
          break;
        }
      }
      const next = p.nodes.find(
        (n) =>
          n.status === "pending" &&
          inputIds(n, p.nodes).every((id) =>
            p.nodes.some(
              (candidate) =>
                candidate.id === id &&
                ["done", "skipped"].includes(candidate.status),
            ),
          ),
      );
      if (!next) {
        if (p.nodes.some((n) => n.status === "pending")) {
          transitionProject(p, "failed", "流程存在未满足的输入依赖，请检查节点连线");
          p.error = "流程存在未满足的输入依赖，请检查节点连线";
          p.revision++;
          continue;
        }
        if (!p.nodes.some((n) => n.kind === "end" && n.status === "done")) {
          transitionProject(p, "failed", "没有选中的结束节点，请检查分支");
          p.error = "没有选中的结束节点，请检查分支";
          p.revision++;
          break;
        }
        transitionProject(p, "succeeded", "所有节点执行完成");
        p.pauseRequested = false;
        p.versions.push({
          id: "version-" + randomUUID(),
          version: p.versions.length + 1,
          createdAt: new Date(now).toISOString(),
          videoUrl:
            p.nodes
              .filter((n) => n.kind === "end" && n.status === "done")
              .flatMap((n) => n.output?.assets || [])
              .find((a) => a.url?.endsWith(".mp4"))?.url || "",
          audioUrl:
            p.nodes
              .filter((n) => n.kind === "end" && n.status === "done")
              .flatMap((n) => n.output?.assets || [])
              .find((a) => a.url?.endsWith(".wav"))?.url || "",
          nodes: structuredClone(p.nodes),
          topic: p.topic,
          humanId: p.humanId,
        });
      } else if (p.pauseRequested) {
        transitionProject(p, "paused", "已完成当前节点，等待继续");
        p.pauseRequested = false;
      } else {
        transitionNode(next, "running");
        p.stepStartedAt = (p.stepStartedAt ?? now) + STEP_MS;
      }
      p.updatedAt = new Date(now).toISOString();
      p.revision++;
    }
  }
}
function validateNodes(nodes: StudioNode[], nested = false) {
  if (nodes.length > (nested ? 20 : 30))
    throw new StudioError(400, nested ? "子流程最多 20 个节点" : "节点数量超过限制");
  const ids = new Set();
  for (const node of nodes) {
    if (
      !node ||
      !kinds.has(node.kind) ||
      ids.has(node.id) ||
      !/^[-a-zA-Z0-9_]{1,100}$/.test(node.id) ||
      typeof node.title !== "string" ||
      !node.title.trim() ||
      node.title.length > 60 ||
      typeof node.prompt !== "string" ||
      node.prompt.length > 2000 ||
      !Number.isFinite(node.x) ||
      !Number.isFinite(node.y)
    )
      throw new StudioError(400, "节点配置无效");
    ids.add(node.id);
    const st = node.settings;
    if (
      !st ||
      typeof st !== "object" ||
      Array.isArray(st) ||
      !CATALOG[node.kind].operations.includes(
        st.operation || CATALOG[node.kind].operations[0],
      )
    )
      throw new StudioError(400, "节点操作无效");
    if (JSON.stringify(st).length > 100000)
      throw new StudioError(400, "节点配置过大");
    if (
      st.bindings !== undefined &&
      (!st.bindings ||
        typeof st.bindings !== "object" ||
        Array.isArray(st.bindings))
    )
      throw new StudioError(400, "变量绑定需要对象");
    if (
      st.values !== undefined &&
      (!st.values ||
        typeof st.values !== "object" ||
        Array.isArray(st.values) ||
        Object.values(st.values).some((value) => typeof value !== "string"))
    )
      throw new StudioError(400, "开始节点参数无效");
    if (st.autoApprove !== undefined && typeof st.autoApprove !== "boolean")
      throw new StudioError(400, "确认模式无效");
    if (
      st.operator !== undefined &&
      !["equals", "contains", "gt", "truthy"].includes(st.operator)
    )
      throw new StudioError(400, "条件运算符无效");
    if (
      st.gate &&
      (typeof st.gate.nodeId !== "string" || typeof st.gate.branch !== "string")
    )
      throw new StudioError(400, "分支配置无效");
    if (st.children !== undefined) {
      if (nested || !["loop", "parallel"].includes(node.kind) || !Array.isArray(st.children))
        throw new StudioError(400, "子流程配置无效");
      validateNodes(st.children, true);
    }
    if (nested && ["loop", "parallel", "start", "end"].includes(node.kind))
      throw new StudioError(400, "容器子流程不支持再次嵌套容器、开始或结束节点");
    if (st.voiceId !== undefined && !VOICES.some((v) => v.id === st.voiceId))
      throw new StudioError(400, "音色无效");
    if (
      st.speed !== undefined &&
      (!Number.isFinite(st.speed) || st.speed < 0.5 || st.speed > 2)
    )
      throw new StudioError(400, "语速无效");
  }
}
function validateProject(body: Record<string, unknown>) {
  if (
    typeof body.topic !== "string" ||
    !body.topic.trim() ||
    body.topic.length > 200
  )
    throw new StudioError(400, "请输入 1–200 字的视频主题");
  if (
    typeof body.humanId !== "string" ||
    typeof body.script !== "string" ||
    body.script.length > 100 ||
    typeof body.ratio !== "string" ||
    body.ratio.length > 30
  )
    throw new StudioError(400, "请选择数字人、剧本和画幅");
  if (!Array.isArray(body.nodes) || body.nodes.length > 30)
    throw new StudioError(400, "每条流程最多 30 个节点");
  validateNodes(body.nodes as StudioNode[]);
  const ids = new Set<string>();
  for (const n of body.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      !/^[-a-zA-Z0-9_]{1,100}$/.test(n.id) ||
      ids.has(n.id) ||
      !kinds.has(n.kind) ||
      typeof n.title !== "string" ||
      !n.title.trim() ||
      n.title.length > 60 ||
      typeof n.prompt !== "string" ||
      n.prompt.length > 2000 ||
      !Number.isFinite(n.x) ||
      !Number.isFinite(n.y) ||
      n.x < 0 ||
      n.y < 0 ||
      Math.abs(n.x) > 100000 ||
      Math.abs(n.y) > 100000 ||
      (n.inputs !== undefined &&
        (!Array.isArray(n.inputs) ||
          n.inputs.length > 30 ||
          n.inputs.some(
            (id: unknown) =>
              typeof id !== "string" ||
              !/^[-a-zA-Z0-9_]{1,100}$/.test(id as string),
          )))
    )
      throw new StudioError(400, "节点配置无效，请检查名称、提示词或位置");
    ids.add(n.id);
  }
  for (const n of body.nodes as StudioNode[]) {
    const settings = n.settings;
    if (
      settings !== undefined &&
      (!settings || typeof settings !== "object" || Array.isArray(settings))
    )
      throw new StudioError(400, "节点设置无效");
    if (!settings) continue;
    if (
      (settings.text !== undefined &&
        (typeof settings.text !== "string" || settings.text.length > 10000)) ||
      (settings.voiceId !== undefined &&
        !VOICES.some((v) => v.id === settings.voiceId)) ||
      (settings.speed !== undefined &&
        (!Number.isFinite(settings.speed) ||
          settings.speed < 0.5 ||
          settings.speed > 2)) ||
      (settings.emotion !== undefined &&
        !["自然", "亲切", "活力", "沉稳"].includes(settings.emotion))
    )
      throw new StudioError(400, "配音或文案设置无效");
    if (settings.scenes !== undefined) {
      if (
        !Array.isArray(settings.scenes) ||
        settings.scenes.length < 1 ||
        settings.scenes.length > 30
      )
        throw new StudioError(400, "每份分镜需要 1–30 个镜头");
      const sceneIds = new Set<string>();
      for (const scene of settings.scenes) {
        if (
          !scene ||
          typeof scene.id !== "string" ||
          !/^[-a-zA-Z0-9_]{1,100}$/.test(scene.id) ||
          sceneIds.has(scene.id) ||
          !Number.isFinite(scene.duration) ||
          scene.duration < 0.5 ||
          scene.duration > 120 ||
          typeof scene.visual !== "string" ||
          !scene.visual.trim() ||
          scene.visual.length > 2000 ||
          typeof scene.dialogue !== "string" ||
          scene.dialogue.length > 2000 ||
          typeof scene.camera !== "string" ||
          scene.camera.length > 500
        )
          throw new StudioError(
            400,
            "分镜需包含有效时长、画面描述、台词和镜头运动",
          );
        sceneIds.add(scene.id);
      }
    }
  }
}

function normalizeProjectInputs(body: Record<string, unknown>) {
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const start = nodes.find(
    (node): node is StudioNode =>
      Boolean(node) && typeof node === "object" && (node as StudioNode).kind === "start",
  );
  const values = start?.settings?.values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return;
  for (const key of ["topic", "humanId", "script", "ratio"] as const) {
    const value = values[key];
    if (typeof value === "string" && value.trim()) body[key] = value;
  }
}
function editableSettings(st: StudioNode["settings"]): StudioNode["settings"] {
  if (!st) return {};
  const { approved, confirmedValue, ...config } = structuredClone(st);
  if (config.children)
    config.children = config.children.map((n) => ({
      ...n,
      status: "pending",
      output: undefined,
      result: undefined,
      settings: editableSettings(n.settings),
    }));
  return config;
}
function applyProject(p: StudioProject, body: Record<string, unknown>) {
  normalizeProjectInputs(body);
  validateProject(body);
  if (p.status === "running")
    throw new StudioError(409, "请等待当前节点完成并暂停后再修改");
  if (body.revision !== p.revision)
    throw new StudioError(409, "流程已在其他页面更新，请刷新后重新编辑");
  const nodes = (body.nodes as StudioNode[]).map((n) => ({
    ...n,
    settings: editableSettings(n.settings),
  }));
  const changedIds = new Set<string>();
  if (
    p.topic !== body.topic ||
    p.humanId !== body.humanId ||
    p.script !== body.script ||
    p.ratio !== body.ratio
  )
    nodes.forEach((n) => changedIds.add(n.id));
  for (const n of nodes) {
    const old = p.nodes.find((old) => old.id === n.id);
    if (
      !old ||
      old.id !== n.id ||
      old.kind !== n.kind ||
      old.prompt !== n.prompt ||
      JSON.stringify(old.inputs ?? []) !== JSON.stringify(n.inputs ?? []) ||
      JSON.stringify(editableSettings(old.settings)) !==
        JSON.stringify(n.settings ?? {})
    )
      changedIds.add(n.id);
  }
  if (p.nodes.length !== nodes.length)
    p.nodes
      .filter((old) => !nodes.some((n) => n.id === old.id))
      .forEach((old) =>
        p.nodes
          .filter((n) => inputIds(n, p.nodes).includes(old.id))
          .forEach((n) => changedIds.add(n.id)),
      );
  const affected = descendants(nodes, [...changedIds]);
  // Removing the tail still invalidates the delivery, but keeps valid upstream results.
  const changed = p.nodes.length !== nodes.length || affected.size > 0;
  p.nodes = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title.trim(),
    prompt: n.prompt,
    x: n.x,
    y: n.y,
    ...(n.inputs ? { inputs: [...new Set(n.inputs)] } : {}),
    status:
      !affected.has(n.id) &&
      ["done", "skipped", "waiting"].includes(
        p.nodes.find((old) => old.id === n.id)?.status || "",
      )
        ? p.nodes.find((old) => old.id === n.id)!.status
        : "pending",
    ...(!affected.has(n.id) && p.nodes.find((old) => old.id === n.id)?.result
      ? { result: p.nodes.find((old) => old.id === n.id)!.result }
      : {}),
    ...(!affected.has(n.id) && p.nodes.find((old) => old.id === n.id)?.output
      ? { output: p.nodes.find((old) => old.id === n.id)!.output }
      : {}),
    settings: !affected.has(n.id)
      ? p.nodes.find((old) => old.id === n.id)?.settings || n.settings
      : n.settings,
  }));
  p.topic = (body.topic as string).trim();
  p.humanId = body.humanId as string;
  p.script = body.script as string;
  p.ratio = body.ratio as string;
  p.workflowVersion = 3;
  if (changed || p.nodes.some((n) => !["done", "skipped"].includes(n.status)))
    transitionProject(
      p,
      p.nodes.some((n) => ["done", "skipped"].includes(n.status)) ? "paused" : "draft",
      changed ? "流程配置已修改" : undefined,
    );
  p.revision++;
  p.updatedAt = new Date().toISOString();
}
async function readBody(req: IncomingMessage, limit = 500000) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new StudioError(
        413,
        "资料总量超过限制，请上传 8 MB 以内的演示资料",
      );
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}") as Record<
      string,
      unknown
    >;
  } catch {
    throw new StudioError(400, "请求内容格式无效");
  }
}
export async function studioRoute(
  req: IncomingMessage,
  path: string,
  store: Store,
  tenantId: string,
  send: (status: number, body: unknown) => void,
) {
  if (!path.startsWith("/api/studio")) return false;
  try {
    // Advance before commands too, so pause always respects the actual completed steps.
    store.update((s) => advance(s, tenantId));
    if (req.method === "GET" && path === "/api/studio") {
      const studio = store.read().studio!;
      send(200, {
        humans: studio.humans
          .filter((h) => h.tenantId === tenantId)
          .map(safeHuman),
        projects: studio.projects.filter((p) => p.tenantId === tenantId),
        demo: true,
      });
      return true;
    }
    if (req.method === "POST" && path === "/api/studio/humans") {
      const b = await readBody(req, 12000000);
      if (
        typeof b.name !== "string" ||
        !b.name.trim() ||
        b.name.length > 40 ||
        !Array.isArray(b.files) ||
        !b.files.length ||
        b.files.length > 5
      )
        throw new StudioError(400, "请填写名称，并上传 1–5 个训练资料文件");
      let total = 0;
      const files = b.files.map((f) => {
        if (
          !f ||
          typeof f.name !== "string" ||
          f.name.length > 200 ||
          typeof f.type !== "string" ||
          !/^((image\/(png|jpeg|webp))|(video\/(mp4|webm|quicktime))|(audio\/(wav|mpeg|mp4|webm|x-wav)))$/.test(
            f.type,
          ) ||
          typeof f.data !== "string" ||
          !f.data.length ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)
        )
          throw new StudioError(
            400,
            "资料格式不支持，请使用图片、MP4/WebM 视频或音频",
          );
        const size = Buffer.from(f.data, "base64").length;
        total += size;
        return { name: f.name, type: f.type, size, data: f.data };
      });
      if (total > 8 * 1024 * 1024)
        throw new StudioError(413, "演示资料总量请控制在 8 MB 以内");
      if (
        !files.some(
          (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
        )
      )
        throw new StudioError(400, "至少需要一份人物照片或视频");
      const h: DigitalHuman = {
        id: "human-" + randomUUID(),
        tenantId,
        name: b.name.trim(),
        voice: typeof b.voice === "string" ? b.voice.slice(0, 50) : "自然亲切",
        status: "training",
        version: 1,
        createdAt: new Date().toISOString(),
        trainingStartedAt: Date.now(),
        files,
      };
      store.update((s) => ensure(s, tenantId).humans.push(h));
      send(201, safeHuman(h));
      return true;
    }
    const humanMatch = path.match(/^\/api\/studio\/humans\/([^/]+)\/retrain$/);
    if (req.method === "POST" && humanMatch) {
      const h = store.update((s) => {
        const studio = ensure(s, tenantId),
          h = owned(studio.humans, decodeURIComponent(humanMatch[1]), tenantId);
        if (h.demo)
          throw new StudioError(400, "示例数字人无需训练，请创建自己的数字人");
        if (h.status === "training")
          throw new StudioError(409, "数字人正在训练中");
        if (
          studio.projects.some(
            (p) => p.humanId === h.id && p.status === "running",
          )
        )
          throw new StudioError(
            409,
            "该数字人正在生成视频，请等生成完成或暂停后再重新训练",
          );
        h.status = "training";
        h.trainingStartedAt = Date.now();
        h.version++;
        return h;
      });
      send(200, safeHuman(h));
      return true;
    }
    if (req.method === "POST" && path === "/api/studio/projects") {
      const b = await readBody(req);
      normalizeProjectInputs(b);
      validateProject(b);
      const p: StudioProject = {
        id: "project-" + randomUUID(),
        tenantId,
        topic: b.topic as string,
        humanId: b.humanId as string,
        script: b.script as string,
        ratio: b.ratio as string,
        nodes: [],
        status: "draft",
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        versions: [],
        workflowVersion: 3,
      };
      store.update((s) => {
        owned(ensure(s, tenantId).humans, p.humanId, tenantId);
        applyProject(p, { ...b, revision: 0 });
        s.studio!.projects.push(p);
      });
      send(201, p);
      return true;
    }
    const mockMatch = path.match(
      /^\/api\/studio\/projects\/([^/]+)\/mock\/(seed|step|wait|fail|complete|reset)$/,
    );
    if (req.method === "POST" && mockMatch) {
      const id = decodeURIComponent(mockMatch[1]);
      const action = mockMatch[2];
      const p = store.update((s) => {
        const project = owned(ensure(s, tenantId).projects, id, tenantId);
        if (project.status === "running")
          throw new StudioError(409, "请先暂停真实流程，再使用 Mock 状态控制");
        mockProject(project, action);
        project.revision++;
        project.updatedAt = new Date().toISOString();
        return project;
      });
      send(200, p);
      return true;
    }
    const match = path.match(
      /^\/api\/studio\/projects\/([^/]+)(?:\/(run|pause|confirm))?$/,
    );
    if (match) {
      const id = decodeURIComponent(match[1]),
        action = match[2],
        b = await readBody(req);
      const p = store.update((s) => {
        const studio = ensure(s, tenantId),
          p = owned(studio.projects, id, tenantId);
        if (req.method === "PUT" && !action) {
          owned(studio.humans, b.humanId as string, tenantId);
          applyProject(p, b);
        } else if (req.method === "POST" && action === "run") {
          if (p.nodes.some((n) => n.status === "waiting"))
            throw new StudioError(409, "请先完成人工确认");
          if (p.status === "running")
            throw new StudioError(409, "流程已经在执行中");
          if (b.revision !== p.revision)
            throw new StudioError(409, "流程状态已更新，请刷新后重试");
          const human = owned(studio.humans, p.humanId, tenantId);
          if (human.status !== "ready")
            throw new StudioError(409, "数字人训练完成后才能生成视频");
          const issues = graphIssues(p.nodes);
          if (issues.length) throw new StudioError(400, issues[0].message);
          if (b.from !== undefined && typeof b.from !== "string")
            throw new StudioError(400, "开始节点无效");
          // A full rerun clears the graph. A partial rerun clears descendants only.
          if (
            !b.from &&
            p.nodes.every((n) => ["done", "skipped"].includes(n.status))
          )
            for (const n of p.nodes) {
              transitionNode(n, "pending");
              delete n.output;
              delete n.result;
              if (n.settings) {
                delete n.settings.approved;
                delete n.settings.confirmedValue;
              }
            }
          const index =
            typeof b.from === "string"
              ? p.nodes.findIndex((n) => n.id === b.from)
              : p.nodes.findIndex(
                  (n) =>
                    !["done", "skipped"].includes(n.status) &&
                    inputIds(n, p.nodes).every((id) =>
                      ["done", "skipped"].includes(
                        p.nodes.find((a) => a.id === id)?.status || "",
                      ),
                    ),
                );
          if (index < 0) throw new StudioError(400, "开始节点不存在");
          const selected = p.nodes[index];
          const missing = inputIds(selected, p.nodes).filter(
            (id) =>
              !["done", "skipped"].includes(
                p.nodes.find((n) => n.id === id)?.status || "",
              ),
          );
          if (missing.length)
            throw new StudioError(
              409,
              "所选节点缺少已完成的输入，请先生成上游结果",
            );
          const affected = descendants(p.nodes, [selected.id]);
          for (const n of p.nodes)
            if (affected.has(n.id)) {
              transitionNode(n, n.id === selected.id ? "running" : "pending");
              delete n.result;
              delete n.output;
              if (n.settings) {
                delete n.settings.approved;
                delete n.settings.confirmedValue;
              }
            }
          transitionProject(p, "running", b.from ? "从指定节点继续" : "开始执行");
          p.pauseRequested = false;
          p.stepStartedAt = Date.now();
          delete p.error;
          p.revision++;
        } else if (req.method === "POST" && action === "confirm") {
          if (b.revision !== p.revision)
            throw new StudioError(409, "流程状态已更新，请刷新后重试");
          const node = p.nodes.find(
            (n) => n.id === b.nodeId && n.status === "waiting",
          );
          if (!node || node.kind !== "human")
            throw new StudioError(409, "没有等待确认的节点");
          if (b.value !== undefined && JSON.stringify(b.value).length > 50000)
            throw new StudioError(400, "确认内容过大");
          node.settings = {
            ...node.settings,
            approved: true,
            ...(b.value !== undefined ? { confirmedValue: b.value } : {}),
          };
          node.result = result(
            node,
            p,
            owned(studio.humans, p.humanId, tenantId),
          );
          transitionNode(node, "done");
          transitionProject(p, "running", "人工确认已完成");
          p.stepStartedAt = Date.now() - STEP_MS;
          p.revision++;
          delete p.error;
        } else if (req.method === "POST" && action === "pause") {
          if (p.status !== "running")
            throw new StudioError(409, "当前没有正在执行的流程");
          p.pauseRequested = true;
          p.revision++;
        } else throw new StudioError(405, "不支持的操作");
        return p;
      });
      send(200, p);
      return true;
    }
    send(404, { message: "接口不存在" });
  } catch (e) {
    send(e instanceof StudioError ? e.status : 500, {
      message: e instanceof StudioError ? e.message : "工作台请求失败，请重试",
    });
  }
  return true;
}
