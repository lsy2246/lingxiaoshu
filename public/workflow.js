// Shared by the editor and the server so ports and validation stay in sync.
export const CATALOG = {
  start: {
    title: "开始",
    icon: "▶",
    description: "配置主题、剧本、画幅和数字人",
    output: "输入变量",
    ports: [],
    operations: ["input.collect"],
    prompt: "定义工作流需要的输入变量。",
  },
  llm: {
    title: "大模型",
    icon: "✦",
    description: "理解、生成或转换结构化内容",
    output: "文本 / JSON",
    ports: [{ label: "输入变量", kinds: ["start", "llm", "code"] }],
    operations: ["text.generate", "storyboard.plan", "json.transform"],
    prompt: "根据输入生成结构化结果，并严格遵循输出格式。",
  },
  plugin: {
    title: "插件",
    icon: "◆",
    description: "调用生图、生视频、TTS、ASR 等能力",
    output: "媒体 / 数据",
    ports: [
      {
        label: "上游数据",
        kinds: ["start", "llm", "loop", "parallel", "plugin", "code", "human", "wait"],
      },
    ],
    operations: [
      "image.generate",
      "video.generate",
      "tts.generate",
      "asr.subtitle",
      "avatar.lipsync",
      "music.generate",
      "media.render",
    ],
    prompt: "选择一个插件能力并配置模型参数。",
  },
  code: {
    title: "代码",
    icon: "{}",
    description: "提取字段、转换格式、计算时间线",
    output: "转换后的数据",
    ports: [
      {
        label: "输入数据",
        kinds: ["start", "llm", "loop", "parallel", "plugin", "code", "human", "wait"],
      },
    ],
    operations: ["data.map", "data.filter", "timeline.compose", "data.merge"],
    prompt: "用转换规则把上游数据变成下游需要的结构。",
  },
  condition: {
    title: "条件",
    icon: "?",
    description: "根据变量选择不同分支",
    output: "分支结果",
    ports: [
      { label: "判断变量", kinds: ["start", "llm", "code", "plugin", "parallel", "wait", "human"] },
    ],
    operations: ["if", "switch"],
    prompt: "配置分支条件和每条路径的处理方式。",
  },
  loop: {
    title: "循环",
    icon: "↻",
    description: "遍历数组，逐项执行子流程",
    output: "批量结果",
    ports: [{ label: "数组", kinds: ["llm", "code", "plugin", "loop", "parallel"] }],
    operations: ["forEach", "batch"],
    prompt: "遍历每个分镜、素材或商品，执行同一组操作。",
  },
  parallel: {
    title: "并行",
    icon: "⑂",
    description: "同时处理多条分支，完成后合并结果",
    output: "并行结果",
    ports: [{ label: "输入数组", kinds: ["llm", "code", "plugin", "loop", "parallel"] }],
    operations: ["parallel.map"],
    prompt: "为输入数组同时执行子流程，全部完成后返回结果。",
  },
  wait: {
    title: "等待",
    icon: "◷",
    description: "等待指定时间或外部信号再继续",
    output: "等待后的数据",
    ports: [{ label: "待传递数据", kinds: ["start", "llm", "code", "plugin", "loop", "parallel", "human"] }],
    operations: ["wait"],
    prompt: "等待节点完成后，把上游数据原样交给下游。",
  },
  human: {
    title: "人工确认",
    icon: "◎",
    description: "暂停流程，允许修改或选择后继续",
    output: "确认后的数据",
    ports: [
      {
        label: "待确认内容",
        kinds: ["llm", "plugin", "code", "loop", "parallel", "wait", "human"],
      },
    ],
    operations: ["review", "select", "edit"],
    prompt: "等待人工确认；确认后才继续下游节点。",
  },
  end: {
    title: "结束",
    icon: "■",
    description: "输出视频、音频、文件或结构化结果",
    output: "工作流输出",
    ports: [{ label: "最终结果", kinds: ["plugin", "code", "human", "llm", "parallel", "wait"] }],
    operations: ["output.video", "output.file", "output.json"],
    prompt: "定义最终返回给用户的输出。",
  },
};
export const VOICES = [
  { id: "human", name: "数字人绑定音色", detail: "跟随当前数字人的声音方案" },
  { id: "warm", name: "温暖女声", detail: "亲切叙述 · 适合生活种草" },
  { id: "steady", name: "沉稳男声", detail: "清晰稳重 · 适合产品讲解" },
  { id: "bright", name: "活力女声", detail: "明亮轻快 · 适合短视频开场" },
];
export const OP_FIELDS = {
  // Start-node values are user inputs and become typed output ports.
  "input.collect": ["topic", "humanId", "ratio", "script"],
  "text.generate": ["value"],
  "storyboard.plan": ["topic", "text"],
  "json.transform": ["value"],
  "image.generate": ["prompt", "duration"],
  "video.generate": ["image", "prompt", "duration"],
  "tts.generate": ["text", "duration", "humanId"],
  "avatar.lipsync": ["video", "audio", "humanId"],
  "asr.subtitle": ["media"],
  "music.generate": ["prompt"],
  "media.render": ["media", "subtitles", "ratio"],
  "data.map": ["items"],
  "data.filter": ["items"],
  "data.merge": ["a", "b"],
  "timeline.compose": ["items"],
  if: ["value", "true", "false"],
  switch: ["value", "default"],
  forEach: ["items"],
  batch: ["items"],
  "parallel.map": ["items"],
  wait: ["value", "seconds"],
  review: ["value"],
  select: ["value"],
  edit: ["value"],
  "output.video": ["value"],
  "output.file": ["value"],
  "output.json": ["value"],
};
export const OP_OUTPUTS = {
  "input.collect": ["topic", "humanId", "humanVersion", "ratio", "script"],
  "text.generate": ["text"],
  "storyboard.plan": ["scenes", "text"],
  "json.transform": ["value"],
  "image.generate": ["file"],
  "video.generate": ["file"],
  "tts.generate": ["file"],
  "avatar.lipsync": ["file"],
  "asr.subtitle": ["subtitles"],
  "music.generate": ["file"],
  "media.render": ["media"],
  "data.map": ["items"],
  "data.filter": ["items"],
  "data.merge": ["value"],
  "timeline.compose": ["media"],
  if: ["branch", "value"],
  switch: ["branch", "value"],
  forEach: ["items"],
  batch: ["items"],
  "parallel.map": ["items"],
  wait: ["value"],
  review: ["value"],
  select: ["value"],
  edit: ["value"],
  "output.video": ["value"],
  "output.file": ["value"],
  "output.json": ["value"],
};
export const OP_LABELS = {
  "input.collect": "收集输入",
  "text.generate": "生成文本",
  "storyboard.plan": "脚本与分镜规划",
  "json.transform": "解析 JSON",
  "image.generate": "生成图片",
  "video.generate": "图生视频",
  "tts.generate": "台词配音",
  "avatar.lipsync": "数字人口型",
  "asr.subtitle": "识别字幕",
  "music.generate": "生成配乐",
  "media.render": "渲染成片",
  "data.map": "字段映射",
  "data.filter": "筛选数组",
  "data.merge": "合并对象",
  "timeline.compose": "合成时间线",
  if: "条件判断",
  switch: "多路选择",
  forEach: "逐项循环",
  batch: "批量循环",
  "parallel.map": "并行处理",
  wait: "等待 / 延迟",
  review: "确认内容",
  select: "选择内容",
  edit: "编辑内容",
  "output.video": "输出视频",
  "output.file": "输出文件",
  "output.json": "输出 JSON",
};
export function operationOf(node) {
  return node.settings?.operation || CATALOG[node.kind]?.operations[0];
}
// bindings are the canonical field edges. `inputs` is only an execution dependency.
const OUTPUT_TYPES = {
  topic: "text", humanId: "text", humanVersion: "number", ratio: "text", script: "text",
  text: "text", scenes: "array", items: "array", branch: "text", subtitles: "subtitles",
  media: "video",
};
const INPUT_TYPES = {
  topic: "text", text: "text", prompt: "text", duration: "number", humanId: "text",
  ratio: "text", items: "array", image: "image", video: "video", audio: "audio",
  media: "video", subtitles: "subtitles", seconds: "number",
};
export function outputPorts(node) {
  const op = operationOf(node);
  const fields = [...new Set([...(OP_OUTPUTS[op] || []), ...(node.kind === "start" ? Object.keys({ ...(node.settings?.values || {}), ...(node.settings?.bindings || {}) }) : [])])];
  return fields.map((key) => ({ key, type: key === "file" ? ({ "image.generate": "image", "tts.generate": "audio", "music.generate": "audio", "video.generate": "video", "avatar.lipsync": "video" }[op] || "any") : OUTPUT_TYPES[key] || "any" }));
}
export function inputPorts(node) {
  if (node.kind === "start") return [];
  return [...new Set([...(OP_FIELDS[operationOf(node)] || []), ...Object.keys(node.settings?.bindings || {})])]
    .map((key) => ({ key, type: INPUT_TYPES[key] || "any" }));
}
export function compatiblePorts(source, target) {
  return source === "any" || target === "any" || source === target;
}
export function fieldEdges(nodes) {
  const edges = [];
  for (const node of nodes) for (const [targetField, value] of Object.entries(node.settings?.bindings || {})) {
    if (typeof value !== "string") continue;
    for (const match of value.matchAll(/\{\{([-\w]+)\.([-\w]+)(?:\.[-\w]+)*\}\}/g))
      edges.push({ source: match[1], sourceField: match[2], target: node.id, targetField });
  }
  return edges;
}
export function bindField(nodes, sourceId, sourceField, targetId, targetField, external = []) {
  const source = [...nodes, ...external].find((n) => n.id === sourceId);
  const target = nodes.find((n) => n.id === targetId);
  if (!source || !target || sourceId === targetId) throw Error("输入输出来源无效");
  if (descendants(nodes, [targetId]).has(sourceId)) throw Error("连接会形成循环依赖");
  const out = outputPorts(source).find((p) => p.key === sourceField);
  const input = inputPorts(target).find((p) => p.key === targetField);
  if (!out || !input) throw Error("输入或输出字段不存在");
  if (!compatiblePorts(out.type, input.type)) throw Error(`类型不匹配：${out.type} → ${input.type}`);
  target.settings ||= {};
  target.settings.bindings ||= {};
  target.settings.bindings[targetField] = `{{${sourceId}.${sourceField}}}`;
}
export function referenceIds(value) {
  const ids = new Set();
  const scan = (v) => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\{\{([-\w]+)(?:\.[-\w]+)*\}\}/g))
        ids.add(m[1]);
    } else if (v && typeof v === "object") Object.values(v).forEach(scan);
  };
  scan(value);
  return [...ids];
}
export function inputIds(node, nodes) {
  const local = new Set(nodes.map((n) => n.id));
  return [
    ...new Set([
      ...(node.inputs || []),
      ...(node.settings?.gate ? [node.settings.gate.nodeId] : []),
      ...referenceIds(node.settings).filter(
        (id) => local.has(id) && id !== node.id,
      ),
    ]),
  ];
}
export function descendants(nodes, seeds) {
  const affected = new Set(seeds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (
        !affected.has(n.id) &&
        inputIds(n, nodes).some((id) => affected.has(id))
      ) {
        affected.add(n.id);
        changed = true;
      }
  }
  return affected;
}
export function makeNode(kind, index, id) {
  const c = CATALOG[kind];
  return {
    id,
    kind,
    title: c.title,
    prompt: c.prompt,
    x: 30 + (index % 4) * 220,
    y: 30 + Math.floor(index / 4) * 195,
    inputs: [],
    settings: { operation: c.operations[0] },
    status: "pending",
  };
}
export function connectDefaults(node, nodes) {
  node.inputs = CATALOG[node.kind].ports
    .map(
      (port) =>
        port.kinds
          .map((kind) => nodes.find((n) => n.id !== node.id && n.kind === kind))
          .find(Boolean)?.id,
    )
    .filter(Boolean);
}
export function createWorkflow(id) {
  const nodes = [
    ["start", "input.collect", "运行输入"],
    ["llm", "storyboard.plan", "脚本与分镜"],
    ["human", "review", "确认方案"],
    ["loop", "forEach", "逐镜生成"],
    ["code", "timeline.compose", "合成时间线"],
    ["plugin", "asr.subtitle", "识别字幕"],
    ["plugin", "media.render", "渲染成片"],
    ["end", "output.video", "输出视频"],
  ].map(([kind, operation, title], i) => ({
    ...makeNode(kind, i, id()),
    title,
    settings: {
      operation,
      ...(kind === "start"
        ? { values: { topic: "", humanId: "", ratio: "9:16 竖屏", script: "viral" } }
        : {}),
    },
  }));
  const ref = (i, path) => "{{" + nodes[i].id + "." + path + "}}";
  nodes[1].settings.bindings = {
    topic: ref(0, "topic"),
    script: ref(0, "script"),
  };
  nodes[2].settings = {
    operation: "review",
    autoApprove: true,
    bindings: { value: ref(1, "scenes") },
  };
  nodes[3].settings = {
    operation: "forEach",
    bindings: { items: ref(2, "value") },
    children: [],
  };
  const children = [
    ["image.generate", "生成分镜图"],
    ["video.generate", "图生视频"],
    ["tts.generate", "台词配音"],
    ["avatar.lipsync", "数字人口型"],
  ].map(([operation, title], i) => ({
    ...makeNode("plugin", i, id()),
    title,
    settings: { operation },
  }));
  children[0].settings.bindings = {
    prompt: "{{item.visual}}",
    duration: "{{item.duration}}",
  };
  children[1].settings.bindings = {
    image: "{{" + children[0].id + ".file}}",
    prompt: "{{item.camera}}",
    duration: "{{item.duration}}",
  };
  children[2].settings.bindings = {
    text: "{{item.dialogue}}",
    duration: "{{item.duration}}",
    humanId: ref(0, "humanId"),
  };
  children[3].settings.bindings = {
    video: "{{" + children[1].id + ".file}}",
    audio: "{{" + children[2].id + ".file}}",
    humanId: ref(0, "humanId"),
  };
  nodes[3].settings.children = children;
  nodes[4].settings.bindings = { items: ref(3, "items") };
  nodes[5].settings.bindings = { media: ref(4, "media") };
  nodes[6].settings.bindings = {
    media: ref(4, "media"),
    subtitles: ref(5, "subtitles"),
    ratio: ref(0, "ratio"),
  };
  nodes[7].settings.bindings = { value: ref(6, "media") };
  for (let i = 1; i < nodes.length; i++) nodes[i].inputs = [nodes[i - 1].id];
  layoutWorkflow(nodes);
  return nodes;
}
export function layoutWorkflow(nodes) {
  // Columns reflect dependency depth; independent voice and image branches are visible.
  const levels = new Map(),
    visiting = new Set();
  function level(n) {
    if (levels.has(n.id)) return levels.get(n.id);
    if (visiting.has(n.id)) return 0;
    visiting.add(n.id);
    const upstream = inputIds(n, nodes)
      .map((id) => nodes.find((other) => other.id === id))
      .filter(Boolean);
    const value = upstream.length ? Math.max(...upstream.map(level)) + 1 : 0;
    visiting.delete(n.id);
    levels.set(n.id, value);
    return value;
  }
  const rows = new Map();
  for (const n of nodes) {
    const col = level(n),
      row = rows.get(col) || 0;
    rows.set(col, row + 1);
    n.x = 30 + col * 340;
    n.y = 30 + row * 440;
  }
}
export function upgradeWorkflow(project, id) {
  if (project.workflowVersion === 3) return false;
  project.workflowArchives ??= [];
  project.workflowArchives.push({
    nodes: structuredClone(project.nodes),
    version: project.workflowVersion || 1,
    createdAt: new Date().toISOString(),
  });
  const old = project.nodes;
  project.nodes = createWorkflow(id);
  const plan = project.nodes.find((n) => operationOf(n) === "storyboard.plan");
  plan.settings.scenes = old.find((n) => n.kind === "shot")?.settings?.scenes;
  plan.settings.text = old.find((n) => n.kind === "script")?.settings?.text;
  project.workflowVersion = 3;
  project.status = "draft";
  project.pauseRequested = false;
  project.error = "流程已升级；旧节点配置已归档，历史成片保留。";
  return true;
}
export function graphIssues(nodes, external = [], nested = false) {
  const problems = [],
    byId = new Map(nodes.map((n) => [n.id, n])),
    scope = new Set([...byId.keys(), ...external]);
  for (const n of nodes) {
    const config = CATALOG[n.kind];
    if (!config || !config.operations.includes(operationOf(n))) {
      problems.push({ nodeId: n.id, message: n.title + "：节点操作无效" });
      continue;
    }
    for (const id of [
      ...(n.inputs || []),
      ...referenceIds(n.settings?.bindings),
      ...(n.settings?.gate ? [n.settings.gate.nodeId] : []),
    ])
      if (id === n.id || !scope.has(id))
        problems.push({
          nodeId: n.id,
          message: n.title + "：变量或输入来源不存在",
        });
    const inspect = (value) => {
      if (typeof value === "string") {
        for (const m of value.matchAll(
          /\{\{([-\w]+)\.([-\w]+)(?:\.[-\w]+)*\}\}/g,
        )) {
          const source = byId.get(m[1]);
          if (source && !outputPorts(source).some((p) => p.key === m[2]))
            problems.push({
              nodeId: n.id,
              message: n.title + "：来源没有输出字段 " + m[2],
            });
        }
      } else if (value && typeof value === "object")
        Object.values(value).forEach(inspect);
    };
    inspect(n.settings?.bindings);
    for (const [key, value] of Object.entries(n.settings?.bindings || {})) {
      if (typeof value !== "string") continue;
      const ref = value.match(/^\{\{([-\w]+)\.([-\w]+)\}\}$/);
      const source = ref && byId.get(ref[1]);
      const out = source && outputPorts(source).find((p) => p.key === ref[2]);
      const input = inputPorts(n).find((p) => p.key === key);
      if (out && input && !compatiblePorts(out.type, input.type))
        problems.push({ nodeId: n.id, message: n.title + `：类型不匹配 ${out.type} → ${input.type}` });
    }
    if (
      n.settings?.gate &&
      byId.get(n.settings.gate.nodeId)?.kind !== "condition" &&
      !external.includes(n.settings.gate.nodeId)
    )
      problems.push({
        nodeId: n.id,
        message: n.title + "：执行分支需要条件节点",
      });
    if (
      n.kind !== "start" &&
      !inputIds(n, nodes).length &&
      !Object.keys(n.settings?.bindings || {}).length
    )
      problems.push({ nodeId: n.id, message: n.title + "：请配置输入变量" });
    if (["loop", "parallel"].includes(n.kind)) {
      if (!n.settings?.children?.length)
        problems.push({ nodeId: n.id, message: n.title + "：循环需要子流程" });
      else
        problems.push(
          ...graphIssues(
            n.settings.children,
            [...scope, "item", "index"],
            true,
          ).map((issue) => ({
            nodeId: n.id,
            message: n.title + " / " + issue.message,
          })),
        );
    }
    if (nested && ["loop", "parallel", "human", "start", "end"].includes(n.kind))
      problems.push({
        nodeId: n.id,
        message: "容器子流程支持大模型、插件、转换、条件和等待节点",
      });
  }
  const visiting = new Set(),
    visited = new Set();
  const visit = (n) => {
    if (visiting.has(n.id)) {
      problems.push({ nodeId: n.id, message: n.title + "：流程形成循环依赖" });
      return;
    }
    if (visited.has(n.id)) return;
    visiting.add(n.id);
    for (const id of inputIds(n, nodes)) if (byId.has(id)) visit(byId.get(id));
    visiting.delete(n.id);
    visited.add(n.id);
  };
  nodes.forEach(visit);
  if (!nested && nodes.filter((n) => n.kind === "start").length !== 1)
    problems.push({ message: "流程需要且只能有一个开始节点" });
  if (!nested && !nodes.some((n) => n.kind === "end"))
    problems.push({ message: "流程需要结束节点" });
  return problems;
}
export function storyboard(topic, script = "viral", text) {
  const total = script === "story" ? 60 : script === "launch" ? 45 : 30;
  const lines = (
    text ||
    `关于${topic}，你最关心什么？\n今天用一个具体场景，带你了解${topic}的核心价值。\n选择适合自己的方式，从今天开始尝试。`
  )
    .split(/\n+/)
    .filter((line) => line.trim());
  const visuals = [
    `数字人正面出镜，背景呼应「${topic}」主题`,
    `「${topic}」的应用场景和细节特写`,
    "数字人回到镜头前，给出行动引导",
  ];
  return lines.map((dialogue, i) => ({
    id: `scene-${i + 1}`,
    duration: total / lines.length,
    visual: visuals[Math.min(i, 2)],
    dialogue,
    camera: ["正面近景，缓慢推近", "横移特写，展示细节", "中景，镜头稳定"][
      Math.min(i, 2)
    ],
  }));
}
globalThis.Workflow = {
  CATALOG,
  OP_FIELDS,
  OP_OUTPUTS,
  OP_LABELS,
  operationOf,
  inputPorts,
  outputPorts,
  fieldEdges,
  bindField,
  compatiblePorts,
  referenceIds,
  VOICES,
  inputIds,
  descendants,
  makeNode,
  connectDefaults,
  createWorkflow,
  layoutWorkflow,
  graphIssues,
  storyboard,
  upgradeWorkflow,
};
