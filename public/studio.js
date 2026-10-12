const $ = (id) => document.getElementById(id);
const {
  CATALOG,
  OP_FIELDS,
  OP_OUTPUTS,
  OP_LABELS,
  operationOf,
  VOICES,
  inputIds,
  referenceIds,
  descendants,
  makeNode,
  connectDefaults,
  createWorkflow,
  layoutWorkflow,
  graphIssues,
  storyboard,
  upgradeWorkflow,
} = globalThis.Workflow;
const labels = {
  draft: "草稿",
  running: "生成中",
  paused: "已暂停",
  succeeded: "已完成",
  failed: "生成失败",
};
const mockActions = [
  ["seed", "mock-seed"],
  ["step", "mock-step"],
  ["wait", "mock-wait"],
  ["fail", "mock-fail"],
  ["complete", "mock-complete"],
  ["reset", "mock-reset"],
];
const state = {
  humans: [],
  projects: [],
  tasks: [],
  project: null,
  nodeId: null,
  dirty: false,
  busy: false,
  view: "works",
  tenant: "",
  epoch: 0,
  loadId: 0,
  pan: { x: 20, y: 10, zoom: 1 },
  connecting: null,
  connectionPoint: null,
  snapGrid: true,
};
let toastTimer,
  drag = null;
function el(tag, content, className) {
  const e = document.createElement(tag);
  if (content !== undefined) e.textContent = content;
  if (className) e.className = className;
  return e;
}
function button(label, fn, className = "subtle-button") {
  const b = el("button", label, className);
  b.type = "button";
  b.onclick = fn;
  return b;
}
function notice(value, kind = "success") {
  const root = $("message");
  root.textContent = value;
  root.className = "toast show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => root.classList.remove("show"), 5000);
}
async function api(path, method = "GET", body) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    const error = new Error(data.message || data.error || "请求失败");
    error.status = r.status;
    throw error;
  }
  return data;
}
const clone = (value) => structuredClone(value);
const uid = () => crypto.randomUUID();
const BUILTIN_TEMPLATES = [
  { id: "digital-human", name: "数字人爆款视频", description: "文案 → 人工确认 → 逐镜生图 / 生视频 / 配音 / 口型 → 字幕 → 成片", create: () => createWorkflow(uid) },
  { id: "minimal", name: "文案快速输出", description: "输入 → 大模型文案 → 输出 JSON", create: () => {
    const id = uid, nodes = [
      ["start", "input.collect", "运行输入"],
      ["llm", "text.generate", "生成文案"],
      ["end", "output.json", "输出结果"],
    ].map(([kind, operation, title], i) => ({ ...makeNode(kind, i, id()), title, settings: { operation } }));
    nodes[1].settings.bindings = { value: "{{" + nodes[0].id + ".topic}}" };
    nodes[2].settings.bindings = { value: "{{" + nodes[1].id + ".text}}" };
    nodes.forEach((n, i) => { if (i) n.inputs = [nodes[i - 1].id]; });
    layoutWorkflow(nodes); return nodes;
  } },
  { id: "blank", name: "空白画布", description: "仅保留开始和结束，完全自由编排", create: () => {
    const id = uid, nodes = [["start", "input.collect", "运行输入"], ["end", "output.video", "输出视频"]]
      .map(([kind, operation, title], i) => ({ ...makeNode(kind, i, id()), title, settings: { operation } }));
    nodes[1].inputs = [nodes[0].id]; layoutWorkflow(nodes); return nodes;
  } },
];
function newNode(kind, index) {
  return makeNode(kind, index, uid());
}
function workflowNodes() {
  return createWorkflow(uid);
}
function draft() {
  return {
    topic: "新品咖啡机的 30 秒种草介绍",
    humanId: state.humans.find((h) => h.status === "ready")?.id || "",
    script: "viral",
    ratio: "9:16 竖屏",
    nodes: workflowNodes(),
    workflowVersion: 3,
    status: "draft",
    revision: 0,
    versions: [],
  };
}
function cache() {
  try {
    localStorage.setItem(
      "yingsheng:" + state.tenant,
      JSON.stringify({ project: state.project, dirty: state.dirty }),
    );
  } catch {}
}
function locked() {
  return state.busy || state.project?.status === "running";
}
function mutate(index) {
  if (locked()) return;
  const affected = descendants(
    state.project.nodes,
    index === undefined
      ? state.project.nodes.map((n) => n.id)
      : [state.project.nodes[index]?.id],
  );
  for (const n of state.project.nodes)
    if (affected.has(n.id)) {
      n.status = "pending";
      delete n.result;
      delete n.output;
    }
  state.project.status = state.project.nodes.some((n) => n.status === "done")
    ? "paused"
    : "draft";
  state.dirty = true;
  cache();
  renderCanvas();
  renderRun();
}
function replaceProject(p) {
  state.project = clone(p);
  state.dirty = false;
  state.projects = state.projects
    .filter((item) => item.id !== p.id)
    .concat([clone(p)]);
  cache();
}
function switchView(view) {
  if (view === "create" && !state.project) view = "works";
  state.view = view;
  document.body.classList.toggle("editor-mode", view === "create");
  for (const node of document.querySelectorAll(".view"))
    node.classList.toggle("active-view", node.id === view + "-view");
  for (const node of document.querySelectorAll(".nav-item"))
    node.classList.toggle(
      "active",
      node.dataset.view === view || (view === "create" && node.dataset.view === "works"),
    );
  $("page-title").textContent = {
    create: "工作流编辑器",
    humans: "我的数字人",
    works: "我的作品",
  }[view];
  if (view === "create") requestAnimationFrame(fitCanvas);
  if (view === "works") renderWorks();
}
for (const b of document.querySelectorAll("[data-view]"))
  b.onclick = () => {
    if (b.dataset.view === "create" && !b.classList.contains("nav-item"))
      return newProject();
    if (b.dataset.view === "works" && state.view === "create")
      return leaveEditor();
    switchView(b.dataset.view);
  };
function face(h) {
  const root = el("div", undefined, "human-face");
  const colors = h.demo
    ? ["#eac9a5", "#352c34", "#f5e8d5"]
    : ["#bdd5e6", "#263448", "#dfb28f"];
  root.innerHTML =
    '<svg viewBox="0 0 60 70" aria-hidden="true"><rect width="60" height="70" fill="' +
    colors[0] +
    '"/><path d="M5 70Q7 48 30 48Q53 48 55 70" fill="' +
    colors[1] +
    '"/><path d="M24 43h12v13q-6 6-12 0z" fill="' +
    colors[2] +
    '"/><ellipse cx="30" cy="29" rx="14" ry="19" fill="' +
    colors[2] +
    '"/><path d="M16 31Q9 10 27 8Q47 4 46 31L40 19Q26 25 19 19z" fill="' +
    colors[1] +
    '"/><circle cx="25" cy="30" r="1" fill="#362e31"/><circle cx="35" cy="30" r="1" fill="#362e31"/><path d="M27 39q3 2 6 0" stroke="#a57966" fill="none" stroke-linecap="round"/></svg>';
  return root;
}
function renderHumans() {
  const library = $("human-library");
  if (!library) return;
  library.replaceChildren();
  for (const h of state.humans) {
    const card = el("article", undefined, "human-card"),
      head = el("div", undefined, "human-card-head"),
      desc = el("div");
    desc.append(
      el("strong", h.name),
      el("small", h.voice + " · 版本 " + h.version),
    );
    head.append(
      face(h),
      desc,
      el(
        "span",
        h.status === "ready"
          ? "可使用"
          : h.status === "failed"
            ? "训练失败"
            : "训练中",
        "training-badge " + h.status,
      ),
    );
    card.append(head);
    card.append(
      el(
        "p",
        h.demo
          ? "示例形象，用于体验完整创作流程。创建自己的数字人后，就能在这里管理。"
          : h.status === "training"
            ? trainingStage(h.progress) +
              " · " +
              h.files.length +
              " 份资料已保存"
            : h.files.map((f) => f.name).join("、"),
      ),
    );
    if (h.status === "training") {
      const track = el("div", undefined, "progress-track"),
        bar = el("span");
      bar.style.width = h.progress + "%";
      track.append(bar);
      card.append(track);
    }
    const actions = el("div", undefined, "human-card-actions");
    const use = button(
      "生成视频",
      () => {
        if (locked()) return notice("请先暂停当前流程", "error");
        const start = state.project?.nodes.find((node) => node.kind === "start");
        if (start) {
          start.settings ||= { operation: "input.collect" };
          start.settings.values ||= {};
          start.settings.values.humanId = h.id;
        }
        state.project.humanId = h.id;
        mutate(0);
        renderHumans();
        switchView("create");
      },
      "primary-button",
    );
    use.disabled = h.status !== "ready" || locked();
    const preview = button("试播", () =>
      previewMedia(
        "数字人试播 · " + h.name,
        "/media/demo.mp4",
        "/media/demo.wav",
      ),
    );
    preview.disabled = h.status !== "ready";
    actions.append(use, preview);
    if (!h.demo) {
      const retrain = button("重新训练", () => retrainHuman(h));
      retrain.disabled = h.status === "training";
      actions.append(retrain);
    }
    card.append(actions);
    library.append(card);
  }
  if (!state.humans.length)
    library.append(el("p", "先创建一个数字人，再开始视频创作。", "muted"));
  const p = el(
    "p",
    "上传资料，自动训练。数字人可以在不同视频中重复使用。",
    "human-note",
  );
  library.before(p);
  for (const old of document.querySelectorAll(".human-note"))
    if (old !== p) old.remove();
}
function trainingStage(progress) {
  return progress < 20
    ? "资料检查"
    : progress < 55
      ? "形象训练"
      : progress < 80
        ? "声音处理"
        : "生成试播";
}
const wrap = $("canvas-wrap");
let mainGraph;
function renderCanvas() {
  if (!mainGraph) {
    wrap.replaceChildren();
    mainGraph = globalThis.createGraphEditor(wrap, {
      nodes: () => state.project?.nodes || [],
      locked, snap: () => state.snapGrid, notice,
      select: selectNode,
      open: (n) => ["loop", "parallel"].includes(n.kind) && editSubflow(n),
      add: addNodeKind,
      changed: (n, positionOnly) => {
        if (positionOnly) { state.dirty = true; cache(); renderRun(); }
        else { mutate(state.project.nodes.indexOf(n)); renderInspector(); }
      },
    });
  } else mainGraph.render();
  $("node-count").textContent = state.project.nodes.length;
  const warnings = $("workflow-issues");
  const issues = graphIssues(state.project.nodes);
  warnings.replaceChildren(); warnings.hidden = !issues.length;
  for (const issue of issues.slice(0, 4))
    warnings.append(button(issue.message, () => issue.nodeId && selectNode(issue.nodeId), "workflow-warning"));
  renderPalette();
}
function cancelConnection() { mainGraph?.cancelConnection(); }
function renderPalette() {
  const root = $("node-palette-list"); root.replaceChildren();
  for (const [kind, config] of Object.entries(CATALOG)) {
    const b = button("", () => addNodeKind(kind), "palette-node");
    b.draggable = true; b.dataset.nodeKind = kind;
    b.append(el("span", config.icon, "node-kind kind-" + kind), el("span", config.title, "palette-node-title"), el("small", config.description));
    b.ondragstart = (e) => e.dataTransfer?.setData("application/x-workflow-node", kind);
    b.disabled = locked() || state.project.nodes.length >= 30;
    root.append(b);
  }
}
function selectNode(id) {
  state.nodeId = id; mainGraph?.select(id); renderInspector(); renderEditorTools();
}
function fitCanvas() { if (state.view === "create") mainGraph?.fit(); }
$("fit-canvas").onclick = fitCanvas;
$("toggle-palette").onclick = (event) => {
  const layout = document.querySelector(".workflow-layout");
  const collapsed = layout.classList.toggle("palette-collapsed");
  event.currentTarget.setAttribute("aria-pressed", String(!collapsed));
  event.currentTarget.textContent = collapsed ? "显示节点库" : "节点库";
};
$("toggle-inspector").onclick = (event) => {
  const layout = document.querySelector(".workflow-layout");
  const collapsed = layout.classList.toggle("inspector-collapsed");
  event.currentTarget.setAttribute("aria-pressed", String(!collapsed));
  event.currentTarget.textContent = collapsed ? "显示检查器" : "检查器";
};
$("workflow-templates").onclick = openTemplates;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.querySelector("dialog[open]") && document.querySelector(".expanded-editor"))
    $("focus-canvas").click();
});
function openTemplates() {
  if (locked()) return notice("请先暂停流程，再切换模板", "error");
  const d = modal("选择工作流模板"), list = el("div", undefined, "node-library");
  d.append(el("p", "模板只决定初始节点组合，应用后仍可自由增删、连线和修改每个字段。", "muted"));
  for (const template of BUILTIN_TEMPLATES) {
    const item = button("", () => {
      const next = template.create();
      state.project.nodes = next;
      state.nodeId = null;
      state.project.status = "draft";
      state.project.error = "已应用模板；历史成片版本仍保留，可继续回看。";
      state.dirty = true;
      cache();
      renderProject();
      d.close();
      notice("已应用模板：" + template.name + "，可以继续自由编排");
    }, "template-choice");
    item.append(el("strong", template.name), el("small", template.description));
    list.append(item);
  }
  d.append(list);
}
$("layout-nodes").onclick = () => {
  if (locked()) return notice("请先暂停流程，再调整节点位置", "error");
  layoutNodes();
  notice("已按依赖关系重新布局");
};
$("duplicate-node").onclick = () => duplicateNode(state.nodeId);
$("delete-node").onclick = () => state.nodeId && removeNode(state.nodeId);
$("snap-grid").onclick = (event) => {
  state.snapGrid = !state.snapGrid;
  event.currentTarget.textContent = "网格吸附 · " + (state.snapGrid ? "开" : "关");
  event.currentTarget.setAttribute("aria-pressed", String(state.snapGrid));
};
$("cancel-connection").onclick = cancelConnection;
$("focus-canvas").onclick = (event) => {
  const layout = document.querySelector(".workflow-layout");
  const focused = !layout.classList.contains("canvas-focused");
  layout.classList.toggle("canvas-focused", focused);
  layout.classList.toggle("palette-collapsed", focused);
  layout.classList.toggle("inspector-collapsed", focused);
  $("toggle-palette").textContent = focused ? "显示节点库" : "节点库";
  $("toggle-inspector").textContent = focused ? "显示检查器" : "检查器";
  $("toggle-palette").setAttribute("aria-pressed", String(!focused));
  $("toggle-inspector").setAttribute("aria-pressed", String(!focused));
  event.currentTarget.textContent = focused ? "退出专注" : "专注画布";
  event.currentTarget.setAttribute("aria-pressed", String(focused));
  requestAnimationFrame(fitCanvas);
};
function previewScenes(node) {
  const p = state.project;
  const script = p.nodes.find(
    (n) =>
      inputIds(node, p.nodes).includes(n.id) &&
      operationOf(n) === "storyboard.plan",
  );
  return clone(
    node.settings?.scenes ||
      node.output?.scenes ||
      storyboard(
        p.topic,
        p.script,
        node.settings?.text || script?.settings?.text || script?.output?.text,
      ),
  );
}
function editStoryboard(node) {
  if (locked()) return;
  const p = state.project,
    scenes = previewScenes(node),
    d = modal("逐镜编辑 · 画面、台词与时长");
  d.classList.add("storyboard-dialog");
  d.append(
    el(
      "p",
      "画面描述用于生图，镜头运动用于图生视频，台词用于配音。调整后只重做依赖这份分镜的节点。",
      "muted",
    ),
  );
  const list = el("div", undefined, "scene-edit-list");
  function render() {
    list.replaceChildren();
    for (const [index, scene] of scenes.entries()) {
      const card = el("div", undefined, "scene-edit-card"),
        head = el("div", undefined, "scene-edit-head");
      head.append(el("strong", `镜头 ${index + 1}`));
      for (const [label, delta] of [
        ["↑", -1],
        ["↓", 1],
      ]) {
        const b = button(label, () => {
          [scenes[index], scenes[index + delta]] = [
            scenes[index + delta],
            scenes[index],
          ];
          render();
        });
        b.disabled = index + delta < 0 || index + delta >= scenes.length;
        b.setAttribute(
          "aria-label",
          `镜头 ${index + 1} ${delta < 0 ? "前移" : "后移"}`,
        );
        head.append(b);
      }
      const remove = button(
        "删除",
        () => {
          scenes.splice(index, 1);
          render();
        },
        "danger-button",
      );
      remove.disabled = scenes.length === 1;
      head.append(remove);
      card.append(head);
      for (const [key, title, type, max] of [
        ["duration", "时长（秒）", "number", 120],
        ["visual", "画面描述 → 生图", "textarea", 2000],
        ["dialogue", "台词 → 配音（可留空）", "textarea", 2000],
        ["camera", "镜头运动 → 图生视频", "input", 500],
      ]) {
        const label = el("label", title),
          control = el(type === "number" ? "input" : type);
        if (type === "number") {
          control.type = "number";
          control.min = "0.5";
          control.max = max;
          control.step = "0.5";
        } else control.maxLength = max;
        control.value = scene[key];
        control.dataset.field = key;
        control.oninput = () => {
          scene[key] =
            key === "duration" ? Number(control.value) : control.value;
        };
        label.append(control);
        card.append(label);
      }
      list.append(card);
    }
  }
  const error = el("p", "", "dependency-error");
  error.setAttribute("role", "alert");
  const add = button("＋ 增加镜头", () => {
    if (scenes.length >= 30) {
      error.textContent = "最多 30 个镜头";
      return;
    }
    scenes.push({
      id: "scene-" + uid(),
      duration: 5,
      visual: "",
      dialogue: "",
      camera: "稳定中景",
    });
    render();
  });
  const footer = el("div", undefined, "modal-footer");
  footer.append(
    button("取消", () => d.close()),
    button(
      "应用分镜",
      () => {
        if (locked() || state.project !== p) {
          error.textContent = "流程状态已变更，请关闭后重试";
          return;
        }
        if (
          scenes.some(
            (scene) =>
              !scene.visual.trim() ||
              !Number.isFinite(scene.duration) ||
              scene.duration < 0.5 ||
              scene.duration > 120,
          )
        ) {
          error.textContent = "请为每个镜头填写画面描述与 0.5–120 秒时长";
          return;
        }
        node.settings = { ...node.settings, scenes: clone(scenes) };
        mutate(p.nodes.indexOf(node));
        renderInspector();
        d.close();
        notice("已应用分镜，保存后用于图片、视频和配音任务");
      },
      "primary-button",
    ),
  );
  render();
  d.append(list, add, error, footer);
}
function renderGenericConfig(root, node, changed, scope, nested = false) {
  node.settings ||= {};
  const operation = operationOf(node),
    opLabel = el("label", "操作 / 能力"),
    select = el("select");
  for (const op of CATALOG[node.kind].operations) {
    const option = el("option", OP_LABELS[op] + " · " + op);
    option.value = op;
    select.append(option);
  }
  select.value = operation;
  select.disabled = locked();
  select.onchange = () => {
    node.settings = {
      operation: select.value,
      bindings: {},
      ...(["loop", "parallel"].includes(node.kind) ? { children: [] } : {}),
    };
    changed();
    if (nested) {
      root.replaceChildren();
      renderGenericConfig(root, node, changed, scope, true);
    } else renderInspector();
  };
  opLabel.append(select);
  root.append(opLabel);
  if (node.kind === "start") {
    node.settings.values ||= {};
    const values = node.settings.values;
    const topic = el("textarea");
    topic.rows = 3;
    topic.maxLength = 200;
    topic.value = values.topic || state.project?.topic || "";
    topic.placeholder = "这条视频要表达的主题或目标";
    topic.disabled = locked();
    topic.oninput = () => { values.topic = topic.value; changed(); };
    const topicLabel = el("label", "视频主题 / 目标"); topicLabel.append(topic); root.append(topicLabel);
    const human = el("select");
    const ready = state.humans.filter((item) => item.status === "ready");
    for (const item of ready) { const option = el("option", item.name + " · " + item.voice); option.value = item.id; human.append(option); }
    if (!ready.length) { const option = el("option", "暂无可用数字人"); option.value = ""; human.append(option); }
    human.value = values.humanId || state.project?.humanId || "";
    human.disabled = locked();
    human.onchange = () => { values.humanId = human.value; changed(); };
    const humanLabel = el("label", "出镜数字人"); humanLabel.append(human); root.append(humanLabel);
    const script = el("select");
    for (const [value, label] of [["viral", "爆款种草 · 30 秒"], ["launch", "产品发布 · 45 秒"], ["story", "品牌故事 · 60 秒"]]) { const option = el("option", label); option.value = value; script.append(option); }
    script.value = values.script || state.project?.script || "viral";
    script.disabled = locked();
    script.onchange = () => { values.script = script.value; changed(); };
    const scriptLabel = el("label", "预置剧本"); scriptLabel.append(script); root.append(scriptLabel);
    const ratio = el("select");
    for (const value of ["9:16 竖屏", "16:9 横屏", "1:1 方形"]) { const option = el("option", value); option.value = value; ratio.append(option); }
    ratio.value = values.ratio || state.project?.ratio || "9:16 竖屏";
    ratio.disabled = locked();
    ratio.onchange = () => { values.ratio = ratio.value; changed(); };
    const ratioLabel = el("label", "画幅"); ratioLabel.append(ratio); root.append(ratioLabel);
    root.append(el("small", "这些值会通过输出端口连接到后续节点，修改后只重做下游。", "muted"));
    return;
  }
  const list = el("datalist");
  list.id = "variables-" + node.id;
  const candidates = scope.filter(
    (n) => n.id !== node.id && !descendants(scope, [node.id]).has(n.id),
  );
  for (const n of candidates)
    for (const field of OP_OUTPUTS[operationOf(n)] || []) {
      const o = el("option");
      o.value = "{{" + n.id + "." + field + "}}";
      o.label = n.title + " / " + field;
      list.append(o);
    }
  if (nested)
    for (const field of ["visual", "dialogue", "camera", "duration", "id"]) {
      const o = el("option");
      o.value = "{{item." + field + "}}";
      o.label = "当前循环项 / " + field;
      list.append(o);
    }
  root.append(list);
  const parse = (v) => {
    if (!v.length) return undefined;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  const fields = new Set([
    ...(OP_FIELDS[operation] || []),
    ...Object.keys(node.settings.bindings || {}),
  ]);
  for (const key of fields) {
    const l = el("label", "输入变量 · " + key),
      input = el("input");
    const v = node.settings.bindings?.[key];
    input.value =
      v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
    input.maxLength = 10000;
    input.placeholder = "填常量或选择 {{节点ID.字段}}";
    input.setAttribute("list", list.id);
    input.disabled = locked();
    const apply = () => {
      node.settings.bindings ||= {};
      const value = parse(input.value);
      if (value === undefined) delete node.settings.bindings[key];
      else node.settings.bindings[key] = value;
      changed();
    };
    input.onchange = apply;
    const picker = el("div", undefined, "variable-picker");
    const source = el("select");
    source.setAttribute("aria-label", key + "变量来源");
    const blank = el("option", "选择节点输出 / 当前循环项…");
    blank.value = "";
    source.append(blank);
    for (const option of list.children) {
      const choice = el("option", option.label);
      choice.value = option.value;
      source.append(choice);
    }
    source.value = typeof v === "string" && [...source.options].some((o) => o.value === v) ? v : "";
    source.disabled = locked();
    source.onchange = () => {
      if (!source.value) return;
      input.value = source.value;
      apply();
    };
    const clear = button("清空", () => {
      input.value = "";
      source.value = "";
      apply();
    });
    clear.disabled = locked();
    clear.setAttribute("aria-label", "清空输入变量 " + key);
    picker.append(source, clear);
    l.append(input, picker);
    root.append(l);
  }
  const custom = button("+ 自定义变量", () => {
    const d = modal("添加输入变量"),
      input = el("input");
    input.placeholder = "变量名，如 product";
    d.append(
      input,
      button("添加", () => {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(input.value))
          return notice("请使用英文变量名", "error");
        node.settings.bindings = {
          ...node.settings.bindings,
          [input.value]: "",
        };
        changed();
        d.close();
        if (nested) {
          root.replaceChildren();
          renderGenericConfig(root, node, changed, scope, true);
        } else renderInspector();
      }),
    );
  });
  custom.disabled = locked();
  root.append(custom);
  root.append(
    el(
      "small",
      "输出字段：" + (OP_OUTPUTS[operation] || []).join(" · "),
      "muted output-fields",
    ),
  );
  if (node.kind === "code")
    root.append(
      el("small", "转换节点使用字段映射和筛选规则；不执行任意脚本。", "muted"),
    );
  if (operation === "tts.generate") {
    const label = el("label", "配音音色"),
      voice = el("select");
    for (const v of VOICES) {
      const o = el("option", v.name);
      o.value = v.id;
      voice.append(o);
    }
    voice.value = node.settings.voiceId || "human";
    voice.disabled = locked();
    voice.onchange = () => {
      node.settings.voiceId = voice.value;
      changed();
    };
    label.append(voice);
    root.append(label);
    const speedLabel = el("label", "语速（0.5–2 倍）"),
      speed = el("input");
    speed.type = "number";
    speed.min = "0.5";
    speed.max = "2";
    speed.step = "0.25";
    speed.value = node.settings.speed || 1;
    speed.disabled = locked();
    speed.onchange = () => {
      node.settings.speed = Number(speed.value);
      changed();
    };
    speedLabel.append(speed);
    root.append(speedLabel);
    root.append(
      button("试听演示音频", () =>
        previewMedia("配音试听 · 固定演示音频", null, "/media/demo.wav"),
      ),
    );
  }
  if (
    ["condition", "code"].includes(node.kind) &&
    ["if", "data.filter", "data.map"].includes(operation)
  ) {
    if (node.kind === "code") {
      const l = el("label", "提取字段（留空使用整项）"),
        i = el("input");
      i.value = node.settings.field || "";
      i.disabled = locked();
      i.onchange = () => {
        node.settings.field = i.value;
        changed();
      };
      l.append(i);
      root.append(l);
    }
    if (operation !== "data.map") {
      const l = el("label", "判断规则"),
        op = el("select");
      for (const value of ["equals", "contains", "gt", "truthy"]) {
        const o = el(
          "option",
          {
            equals: "等于",
            contains: "包含",
            gt: "大于",
            truthy: "非空 / 为真",
          }[value],
        );
        o.value = value;
        op.append(o);
      }
      op.value = node.settings.operator || "equals";
      op.disabled = locked();
      op.onchange = () => {
        node.settings.operator = op.value;
        changed();
      };
      const i = el("input");
      i.placeholder = "比较值（支持 JSON 常量）";
      i.value =
        node.settings.compare === undefined
          ? ""
          : JSON.stringify(node.settings.compare);
      i.disabled = locked();
      i.onchange = () => {
        node.settings.compare = parse(i.value);
        changed();
      };
      l.append(op, i);
      root.append(l);
    }
  }
  if (operation === "switch") {
    const l = el("label", "分支值映射（JSON 对象）"),
      i = el("textarea");
    i.value = JSON.stringify(node.settings.cases || {}, null, 2);
    i.disabled = locked();
    i.onchange = () => {
      try {
        const v = JSON.parse(i.value);
        if (!v || Array.isArray(v) || typeof v !== "object") throw Error();
        node.settings.cases = v;
        changed();
      } catch {
        notice("分支映射需要 JSON 对象", "error");
      }
    };
    l.append(i);
    root.append(l);
  }
  const conditions = candidates.filter((n) => n.kind === "condition");
  if (conditions.length) {
    const l = el("label", "执行分支（选填）"),
      sel = el("select"),
      none = el("option", "始终执行");
    none.value = "";
    sel.append(none);
    for (const c of conditions) {
      const o = el("option", c.title);
      o.value = c.id;
      sel.append(o);
    }
    sel.value = node.settings.gate?.nodeId || "";
    const input = el("input");
    input.placeholder = "分支名，例如 true / false";
    input.value = node.settings.gate?.branch || "true";
    sel.disabled = input.disabled = locked();
    const update = () => {
      if (sel.value)
        node.settings.gate = { nodeId: sel.value, branch: input.value };
      else delete node.settings.gate;
      changed();
    };
    sel.onchange = input.onchange = update;
    l.append(sel, input);
    root.append(l);
  }
  if (node.kind === "human") {
    const label = el("label", "一键运行时自动确认"),
      check = el("input");
    check.type = "checkbox";
    check.checked = !!node.settings.autoApprove;
    check.disabled = locked();
    check.onchange = () => {
      node.settings.autoApprove = check.checked;
      changed();
    };
    label.append(check);
    root.append(label);
    if (node.status === "waiting") {
      const l = el(
          "label",
          operation === "select"
            ? "选择一个值（JSON）"
            : "确认内容（可编辑 JSON）",
        ),
        value = el("textarea");
      value.value = JSON.stringify(node.output?.data?.value, null, 2);
      const err = el("p", "", "dependency-error");
      l.append(value);
      root.append(
        l,
        err,
        button(
          "确认并继续",
          () =>
            command(async () => {
              let parsed;
              try {
                parsed = JSON.parse(value.value);
              } catch {
                err.textContent = "请输入有效 JSON";
                return;
              }
              if (state.dirty)
                throw Error("请先保存流程配置，再重新运行到人工确认");
              replaceProject(
                await api(
                  "/api/studio/projects/" + state.project.id + "/confirm",
                  "POST",
                  {
                    revision: state.project.revision,
                    nodeId: node.id,
                    value: parsed,
                  },
                ),
              );
              notice("已确认，继续执行");
            }),
          "primary-button",
        ),
      );
    }
  }
  if (["loop", "parallel"].includes(node.kind)) {
    const b = button(
      (node.kind === "parallel" ? "编辑并行子流程 · " : "编辑循环子流程 · ") +
        (node.settings.children?.length || 0) + " 个节点",
      () => editSubflow(node),
    );
    b.disabled = locked();
    root.append(b);
  }
  if (node.output?.data) {
    const details = el("details"),
      summary = el("summary", "查看结构化输出"),
      pre = el("pre", JSON.stringify(node.output.data, null, 2), "node-result");
    details.append(summary, pre);
    root.append(details);
  }
  if (node.output?.iterations) {
    const detail = el("details");
    detail.append(
      el("summary", "循环执行记录 · " + node.output.iterations.length + " 项"),
    );
    for (const iteration of node.output.iterations) {
      detail.append(el("strong", "第 " + (iteration.index + 1) + " 项"));
      for (const child of iteration.nodes)
        detail.append(
          el(
            "p",
            child.title +
              " · " +
              child.status +
              " · " +
              (child.output?.summary || "未执行"),
          ),
        );
    }
    root.append(detail);
  }
}
function editSubflow(node) {
  const d = modal((node.kind === "parallel" ? "并行子流程 · " : "循环子流程 · ") + node.title);
  d.classList.add("subflow-dialog");
  const children = clone(node.settings.children || []);
  const external = () => {
    const item = { id: "item", title: "当前循环项", kind: "start", x: 18, y: 18, settings: { operation: "input.collect", bindings: { visual: "", dialogue: "", camera: "", duration: "", id: "" } } };
    const index = { id: "index", title: "当前序号", kind: "start", x: 18, y: 190, settings: { operation: "input.collect", bindings: { value: "" } } };
    return [item, index, ...state.project.nodes.filter((n) => n.id !== node.id).map((n) => ({ ...n, x: 18, y: 360 }))];
  };
  d.append(el("p", node.kind === "parallel" ? "每个 item 同时执行同一套子流程；拖入节点并用字段端口连接，完成后合并为 items。" : "每个 item 依次执行同一套子流程；item、index 和外层节点都可以作为只读变量。", "muted"));
  const layout = el("div", undefined, "subflow-editor-layout"), palette = el("aside", undefined, "subflow-palette"), canvas = el("div", undefined, "subflow-canvas canvas-wrap"), inspector = el("aside", undefined, "subflow-inspector inspector");
  palette.append(el("strong", "子流程节点"), el("small", "拖入画布或点击添加"));
  const selected = { id: children[0]?.id || null };
  const renderInspector = () => {
    inspector.replaceChildren();
    const child = children.find((n) => n.id === selected.id);
    if (!child) { inspector.append(el("div", "选择一个子节点配置字段", "inspector-empty")); return; }
    const head = el("div", undefined, "inspector-head"), info = el("div");
    info.append(el("p", "子流程节点"), el("h4", child.title)); head.append(info); inspector.append(head);
    const editor = el("div", undefined, "node-editor");
    const title = el("input"); title.value = child.title; title.maxLength = 60; title.setAttribute("aria-label", "子节点名称"); title.onchange = () => { child.title = title.value; graph.render(); renderInspector(); }; editor.append(el("label", "节点名称"), title);
    const prompt = el("textarea"); prompt.value = child.prompt || ""; prompt.setAttribute("aria-label", "子节点提示词"); prompt.onchange = () => { child.prompt = prompt.value; }; editor.append(el("label", "生成要求 / 提示词"), prompt);
    renderGenericConfig(editor, child, () => { graph.render(); renderInspector(); }, [...state.project.nodes, ...children], true);
    const actions = el("div", undefined, "inspector-actions");
    actions.append(button("删除子节点", () => { const i = children.findIndex((n) => n.id === child.id); children.splice(i, 1); selected.id = children[Math.max(0, i - 1)]?.id || null; graph.render(); renderInspector(); }, "danger-button"));
    inspector.append(editor, actions);
  };
  let graph;
  const selectChild = (id) => { selected.id = id; renderInspector(); graph?.select(id); };
  graph = globalThis.createGraphEditor(canvas, { nodes: () => children, external, locked, snap: () => state.snapGrid, select: selectChild, add: (kind, position) => { if (children.length >= 20) return notice("每个子流程最多 20 个节点", "error"); const child = makeNode(kind, children.length, uid()); Object.assign(child, position); children.push(child); selected.id = child.id; graph.render(); renderInspector(); }, changed: () => { state.dirty = true; cache(); renderInspector(); }, notice });
  for (const [kind, config] of Object.entries(CATALOG)) {
    if (["start", "end", "loop", "parallel", "human"].includes(kind)) continue;
    const b = button(config.title, () => graph && graphAdd(kind)); b.draggable = true; b.ondragstart = (e) => e.dataTransfer?.setData("application/x-workflow-node", kind); palette.append(b);
  }
  const graphAdd = (kind) => { if (children.length >= 20) return notice("每个子流程最多 20 个节点", "error"); const child = makeNode(kind, children.length, uid()); child.x = 80 + (children.length % 3) * 340; child.y = 80 + Math.floor(children.length / 3) * 190; children.push(child); selected.id = child.id; graph.render(); renderInspector(); };
  const footer = el("div", undefined, "modal-footer");
  footer.append(button("自动布局", () => { layoutWorkflow(children); graph.render(); }), button("取消", () => d.close()), button("应用子流程", () => { node.settings.children = children; mutate(state.project.nodes.indexOf(node)); renderInspector(); d.close(); }, "primary-button"));
  layout.append(palette, canvas, inspector); d.append(layout, footer); renderInspector();
}
function renderInspector() {
  const root = $("inspector"),
    p = state.project,
    n = p?.nodes.find((n) => n.id === state.nodeId);
  root.replaceChildren();
  if (!n) {
    const empty = el("div", undefined, "inspector-empty");
    empty.append(
      el("span", "⌁", "empty-icon"),
      el("strong", "选择一个节点"),
      el("p", "查看详情、修改提示词，或设置从这里继续生成。"),
    );
    root.append(empty);
    return;
  }
  const index = p.nodes.indexOf(n),
    head = el("div", undefined, "inspector-head"),
    info = el("div");
  info.append(
    el("p", "NODE / " + String(index + 1).padStart(2, "0")),
    el("h4", n.title),
  );
  head.append(
    info,
    button(
      "×",
      () => {
        state.nodeId = null;
        renderCanvas();
        renderInspector();
      },
      "close-inspector",
    ),
  );
  root.append(head);
  const editor = el("div", undefined, "node-editor");
  function field(label, tag, value, oninput) {
    const l = el("label", label),
      input = el(tag);
    input.value = value;
    input.disabled = locked();
    input.maxLength = tag === "input" ? 60 : 2000;
    input.oninput = () => oninput(input.value);
    l.append(input);
    editor.append(l);
    return input;
  }
  field("节点名称", "input", n.title, (value) => {
    n.title = value;
    state.dirty = true;
    cache();
    renderCanvas();
    renderRun();
  });
  field("生成要求 / 提示词", "textarea", n.prompt, (value) => {
    n.prompt = value;
    mutate(index);
  });
  renderGenericConfig(
    editor,
    n,
    () => {
      syncProjectFromStart();
      mutate(index);
      renderCanvas();
    },
    p.nodes,
  );
  const config = CATALOG[n.kind],
    dependency = el("div", undefined, "node-dependencies");
  dependency.append(el("strong", "输入与产物"));
  const inputList = inputIds(n, p.nodes);
  dependency.append(
    el(
      "p",
      config.output +
        " ← " +
        (inputList.length
          ? inputList
              .map(
                (id) =>
                  p.nodes.find((item) => item.id === id)?.title || "已删除",
              )
              .join("、")
          : "无，上游起点"),
      "muted",
    ),
  );
  const portControls = [];
  for (const sourceId of inputList) {
    const source = p.nodes.find((item) => item.id === sourceId);
    const row = el("div", undefined, "connection-row");
    const disconnect = button("断开", () => {
      if (locked()) return;
      n.inputs = (n.inputs || []).filter((id) => id !== sourceId);
      const clearReferences = (node) => {
        for (const [key, value] of Object.entries(node.settings?.bindings || {}))
          if (referenceIds(value).includes(sourceId)) delete node.settings.bindings[key];
        if (node.settings?.gate?.nodeId === sourceId) delete node.settings.gate;
        (node.settings?.children || []).forEach(clearReferences);
      };
      clearReferences(n);
      mutate(index);
      renderInspector();
      notice("已断开来源，并清除引用此来源的变量映射");
    }, "danger-button");
    disconnect.disabled = locked();
    disconnect.setAttribute("aria-label", "断开 " + (source?.title || sourceId));
    row.append(el("span", (source?.title || "已删除节点") + " → " + n.title), disconnect);
    dependency.append(row);
  }
  for (const port of config.ports) {
    const label = el("label", port.label),
      select = el("select"),
      blank = el("option", port.optional ? "不使用" : "请选择输入来源");
    blank.value = "";
    select.append(blank);
    const downstream = descendants(p.nodes, [n.id]);
    for (const candidate of p.nodes.filter(
      (a) => port.kinds.includes(a.kind) && !downstream.has(a.id),
    )) {
      const option = el(
        "option",
        candidate.title + " · " + CATALOG[candidate.kind].output,
      );
      option.value = candidate.id;
      select.append(option);
    }
    select.value =
      inputList.find((id) =>
        port.kinds.includes(p.nodes.find((a) => a.id === id)?.kind),
      ) || "";
    select.disabled = locked();
    select.setAttribute("aria-label", port.label + "来源");
    portControls.push(select);
    select.onchange = () => {
      const selected = select.value;
      const removable = new Set(
        p.nodes
          .filter((candidate) => port.kinds.includes(candidate.kind))
          .map((candidate) => candidate.id),
      );
      n.inputs = [
        ...new Set([
          ...(n.inputs || []).filter((id) => !removable.has(id)),
          ...(selected ? [selected] : []),
        ]),
      ];
      mutate(index);
      renderInspector();
    };
    label.append(select);
    dependency.append(label);
  }
  for (const issue of graphIssues(p.nodes).filter(
    (issue) => issue.nodeId === n.id,
  ))
    dependency.append(el("p", issue.message, "dependency-error"));
  editor.append(dependency);
  if (n.kind === "llm") {
    const text = field(
      "自定义口播（每段一行，留空自动生成）",
      "textarea",
      n.settings?.text || "",
      (value) => {
        n.settings = { ...n.settings, text: value };
        mutate(index);
      },
    );
    text.maxLength = 10000;
  }
  if (operationOf(n) === "storyboard.plan") {
    const scenes = previewScenes(n);
    const preview = el("div", undefined, "storyboard-preview");
    preview.append(
      el(
        "strong",
        `${scenes.length} 个镜头 · ${scenes.reduce((sum, scene) => sum + scene.duration, 0).toFixed(1)} 秒`,
      ),
    );
    for (const [i, scene] of scenes.entries())
      preview.append(
        el(
          "div",
          `镜头 ${i + 1} · ${scene.duration.toFixed(1)} 秒\n画面：${scene.visual}\n台词：${scene.dialogue || "（无台词）"}\n运动：${scene.camera}`,
          "storyboard-scene",
        ),
      );
    const edit = button(
      "编辑分镜画面与台词",
      () => editStoryboard(n),
      "primary-button",
    );
    edit.disabled = locked();
    preview.append(edit);
    editor.append(preview);
  }
  const hint = el(
    "p",
    "修改生成配置后，此节点和 " +
      (descendants(p.nodes, [n.id]).size - 1) +
      " 个依赖节点需要重做；其他分支和历史成片会保留。",
    "muted",
  );
  editor.append(hint);
  const order = el("div", undefined, "inspector-actions");
  const up = button("↑ 调整优先级", () => reorder(index, -1)),
    down = button("↓ 调整优先级", () => reorder(index, 1));
  up.disabled = locked() || index === 0;
  down.disabled = locked() || index === p.nodes.length - 1;
  order.append(up, down);
  editor.append(order);
  const actions = el("div", undefined, "inspector-actions"),
    run = button("从这里生成", () => startRun(n.id), "primary-button"),
    remove = button("删除节点", () => removeNode(n.id), "danger-button");
  run.disabled = locked() || n.status === "waiting";
  remove.disabled = locked();
  actions.append(run, remove);
  editor.append(actions);
  if (n.result) {
    editor.append(el("div", n.result, "node-result"));
    if (n.output?.scenes?.length && operationOf(n) !== "storyboard.plan") {
      const storyboardBox = el("div", undefined, "storyboard-preview");
      storyboardBox.append(el("strong", "分镜结果"));
      for (const scene of n.output.scenes)
        storyboardBox.append(
          el(
            "div",
            `#${scene.id.replace("scene-", "")} · ${scene.duration}s · ${scene.visual}\n台词：${scene.dialogue}\n镜头：${scene.camera}`,
            "storyboard-scene",
          ),
        );
      editor.append(storyboardBox);
    }
    if (n.output?.text)
      editor.append(el("div", n.output.text, "storyboard-scene"));
    if (n.output?.assets?.length) {
      for (const [i, asset] of n.output.assets.entries()) {
        const card = el("div", undefined, "asset-card");
        card.append(
          el(
            "strong",
            `${asset.sceneId ? "镜头 " + (n.output.scenes?.findIndex((s) => s.id === asset.sceneId) + 1) : "产物"} · ${asset.type}`,
          ),
          el("p", asset.description || asset.text || "媒体产物引用已保存"),
        );
        if (asset.duration)
          card.append(el("small", asset.duration.toFixed(1) + " 秒"));
        const sources = p.nodes.filter((a) =>
          a.output?.assets?.some((item) => asset.sourceIds.includes(item.id)),
        );
        card.append(
          el(
            "small",
            "来源：" +
              (sources.map((a) => a.title).join("、") || "主题 / 节点配置"),
          ),
        );
        if (asset.url)
          card.append(
            button("播放固定演示媒体", () =>
              previewMedia(
                n.title + " · 固定演示媒体",
                asset.type === "audio" || asset.type === "music"
                  ? null
                  : asset.url,
                asset.type === "audio" || asset.type === "music"
                  ? asset.url
                  : null,
              ),
            ),
          );
        if (asset.type === "image")
          card.append(el("small", "模拟图片任务 · 尚未接入生图服务"));
        editor.append(card);
      }
    }
    if (n.output?.timeline)
      for (const clip of n.output.timeline)
        editor.append(
          el(
            "div",
            `${clip.start.toFixed(1)}–${clip.end.toFixed(1)} 秒 · ${clip.dialogue || "（静音镜头）"}`,
            "storyboard-scene",
          ),
        );
    if (n.output?.cues)
      for (const cue of n.output.cues)
        editor.append(
          el(
            "div",
            `${cue.start.toFixed(1)}–${cue.end.toFixed(1)} 秒\n${cue.text}`,
            "storyboard-scene",
          ),
        );
  }
  root.append(editor);
}
function reorder(index, delta) {
  if (locked()) return;
  const nodes = state.project.nodes,
    [n] = nodes.splice(index, 1);
  nodes.splice(index + delta, 0, n);
  state.dirty = true;
  layoutNodes();
  renderInspector();
}
function layoutNodes() {
  layoutWorkflow(state.project.nodes);
  state.dirty = true;
  cache();
  renderCanvas();
  renderRun();
  fitCanvas();
}
function duplicateNode(id) {
  if (locked() || !id) return;
  if (state.project.nodes.length >= 30) return notice("每条流程最多 30 个节点", "error");
  const original = state.project.nodes.find((n) => n.id === id);
  if (!original) return;
  const node = clone(original);
  node.id = uid();
  node.title = (original.title.slice(0, 52) + " · 副本");
  node.x = original.x + 46;
  node.y = original.y + 184;
  node.status = "pending";
  delete node.result;
  delete node.output;
  // Nested node IDs are local, but must still be unique in a copied subflow.
  const ids = new Map();
  const rekey = (item) => {
    for (const child of item.settings?.children || []) {
      const old = child.id;
      child.id = uid();
      ids.set(old, child.id);
      child.status = "pending";
      delete child.result;
      delete child.output;
      rekey(child);
    }
  };
  rekey(node);
  const remap = (value) => {
    if (typeof value === "string") {
      if (ids.has(value)) return ids.get(value);
      return value.replace(/\{\{([-\w]+)(?=\.)/g, (match, key) => ids.has(key) ? "{{" + ids.get(key) : match);
    }
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, remap(v)]));
    return value;
  };
  node.settings = remap(node.settings);
  state.project.nodes.push(node);
  state.nodeId = node.id;
  mutate(state.project.nodes.length - 1);
  renderInspector();
  renderEditorTools();
  notice("已复制节点及配置，请检查输入变量");
}
function removeNode(id) {
  if (locked()) return;
  const index = state.project.nodes.findIndex((n) => n.id === id);
  if (index < 0) return;
  mutate(index);
  state.project.nodes.splice(index, 1);
  state.nodeId =
    state.project.nodes[Math.min(index, state.project.nodes.length - 1)]?.id;
  cache();
  renderCanvas();
  renderRun();
  renderInspector();
  notice("节点已删除，保存流程后生效");
}
function modal(title) {
  const dialog = el("dialog", undefined, "modal"),
    head = el("div", undefined, "modal-head");
  head.append(
    el("h3", title),
    button("×", () => dialog.close(), "close-inspector"),
  );
  dialog.append(head);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
$("add-node").onclick = () => {
  if (locked()) return notice("请先暂停流程，再添加节点", "error");
  if (state.project.nodes.length >= 30)
    return notice("每条流程最多 30 个节点", "error");
  const d = modal("添加生成节点");
  d.append(
    el("p", "节点会自动选择可用输入。请在详情中连接来源；输入就绪后才会执行。"),
  );
  const list = el("div", undefined, "node-library");
  for (const [kind, c] of Object.entries(CATALOG)) {
    const b = button(
      "",
      () => { addNodeKind(kind); d.close(); },
      "",
    );
    const info = el("div");
    info.append(el("strong", c.title), el("small", c.description));
    b.append(el("span", c.icon, "node-kind kind-" + kind), info);
    list.append(b);
  }
  d.append(list);
};
function addNodeKind(kind, position) {
  if (locked()) return notice("请先暂停流程，再添加节点", "error");
  if (!CATALOG[kind]) return;
  if (state.project.nodes.length >= 30) return notice("每条流程最多 30 个节点", "error");
  const nodes = state.project.nodes,
    i = state.nodeId ? nodes.findIndex((n) => n.id === state.nodeId) + 1 : nodes.length,
    n = newNode(kind, nodes.length);
  nodes.splice(i, 0, n);
  connectDefaults(n, nodes);
  if (position) Object.assign(n, position);
  else {
    const anchor = nodes[i - 1];
    n.x = anchor ? anchor.x + 200 : 46;
    n.y = anchor?.y || 46;
  }
  state.nodeId = n.id;
  mutate(i);
  renderInspector();
  notice("已添加“" + CATALOG[kind].title + "”");
}
function renderRun() {
  const p = state.project;
  if (!p) return;
  const running = p.status === "running",
    done = p.nodes.filter((n) => ["done", "skipped"].includes(n.status)).length,
    waiting = p.nodes.find((n) => n.status === "waiting");
  $("run-label").textContent = running
    ? p.pauseRequested
      ? "将在当前节点完成后暂停"
      : "正在生成 · " + done + "/" + p.nodes.length + " 步"
    : p.status === "succeeded"
      ? "视频已完成 · 第 " + p.versions.length + " 版"
      : p.status === "paused"
        ? waiting
          ? "等待人工确认 · " + waiting.title
          : "流程已暂停 · 可调整后续节点"
        : p.status === "failed"
          ? "生成失败"
          : "准备好开始";
  $("run-subtitle").textContent =
    p.error ||
    graphIssues(p.nodes)[0]?.message ||
    (state.dirty
      ? "有未保存修改 · 保存后会保留到当前工作区"
      : p.status === "succeeded"
        ? "成片已保存在“我的作品”，可以预览或局部重做"
        : "通用节点按变量依赖执行 · 循环内逐项生成 · 支持确认与局部重做");
  const b = $("generate");
  b.replaceChildren(
    el(
      "span",
      running
        ? "暂停生成"
        : p.status === "paused"
          ? waiting
            ? "查看待确认内容"
            : "继续生成"
          : p.status === "succeeded"
            ? "重新生成"
            : "一键生成视频",
    ),
    el("span", running ? "Ⅱ" : "→", "arrow"),
  );
  b.disabled = state.busy || (running && p.pauseRequested);
  $("save-workflow").disabled = locked();
  $("add-node").disabled = locked();
  renderMockControls();
  renderEditorTools();
}
function renderMockControls() {
  const p = state.project;
  const stateBadge = $("mock-state");
  const history = $("mock-history");
  if (!p || !stateBadge || !history) return;
  stateBadge.textContent = labels[p.status] || p.status;
  stateBadge.className = "mock-state-badge " + p.status;
  history.replaceChildren();
  const entries = (p.stateHistory || []).slice(-5);
  if (!entries.length) history.append(el("span", "暂无状态转换记录", "muted"));
  for (const entry of entries) {
    const row = el("div", undefined, "mock-history-row");
    row.append(el("strong", labels[entry.to] || entry.to), el("span", entry.reason || `${labels[entry.from] || entry.from} → ${labels[entry.to] || entry.to}`), el("time", new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })));
    history.append(row);
  }
  for (const [action, id] of mockActions) {
    const button = $(id);
    if (!button) continue;
    button.disabled = state.busy || !p.id || p.status === "running";
    button.title = p.status === "running" ? "请先暂停真实流程" : "使用 Mock 状态机演示";
  }
}
function renderEditorTools() {
  const selected = state.project?.nodes.some((n) => n.id === state.nodeId);
  $("duplicate-node").disabled = locked() || !selected || state.project.nodes.length >= 30;
  $("delete-node").disabled = locked() || !selected;
  $("layout-nodes").disabled = locked();
  $("cancel-connection").hidden = !state.connecting;
}
function renderProject() {
  const p = state.project;
  syncProjectFromStart();
  $("editor-project-title").textContent = p.topic || "未命名视频";
  $("editor-project-status").textContent = labels[p.status] || "草稿";
  renderCanvas();
  renderInspector();
  renderRun();
  renderHumans();
}

function syncProjectFromStart() {
  const p = state.project;
  const start = p?.nodes?.find((node) => node.kind === "start");
  if (!p || !start) return;
  start.settings ||= { operation: "input.collect" };
  const values = start.settings.values ||= {
    topic: p.topic || "",
    humanId: p.humanId || "",
    ratio: p.ratio || "9:16 竖屏",
    script: p.script || "viral",
  };
  if (typeof values.topic === "string" && values.topic.trim()) p.topic = values.topic.trim();
  else values.topic = p.topic || "";
  if (typeof values.humanId === "string" && values.humanId) p.humanId = values.humanId;
  else values.humanId = p.humanId || "";
  if (typeof values.script === "string" && values.script) p.script = values.script;
  else values.script = p.script || "viral";
  if (typeof values.ratio === "string" && values.ratio) p.ratio = values.ratio;
  else values.ratio = p.ratio || "9:16 竖屏";
}

function leaveEditor() {
  if (state.busy) return;
  if (!state.dirty) {
    switchView("works");
    return;
  }
  const d = modal("返回我的作品");
  d.append(el("p", "当前流程有未保存修改。返回列表前要如何处理？"));
  const footer = el("div", undefined, "modal-footer");
  footer.append(
    button("继续编辑", () => d.close()),
    button("保存并返回", () => {
      d.close();
      command(async () => {
        await saveCurrent();
        switchView("works");
      });
    }, "primary-button"),
    button("放弃修改", () => {
      d.close();
      state.dirty = false;
      const remote = state.project?.id && state.projects.find((p) => p.id === state.project.id);
      if (remote) replaceProject(remote);
      switchView("works");
    }, "danger-button"),
  );
  d.append(footer);
}

$("back-to-works").onclick = leaveEditor;
async function saveCurrent() {
  syncProjectFromStart();
  const p = state.project,
    body = {
      topic: p.topic,
      humanId: p.humanId,
      script: p.script,
      ratio: p.ratio,
      workflowVersion: 3,
      nodes: p.nodes,
      revision: p.revision,
    };
  const saved = await api(
    "/api/studio/projects" + (p.id ? "/" + encodeURIComponent(p.id) : ""),
    p.id ? "PUT" : "POST",
    body,
  );
  replaceProject(saved);
  return saved;
}
async function command(fn) {
  if (state.busy) return;
  state.busy = true;
  state.epoch++;
  renderRun();
  renderInspector();
  renderHumans();
  try {
    await fn();
  } catch (e) {
    notice(e.message, "error");
    if (e.status === 409 && /其他页面|状态已更新/.test(e.message))
      resolveConflict();
  } finally {
    state.busy = false;
    state.epoch++;
    renderProject();
    renderWorks();
  }
}
$("save-workflow").onclick = () =>
  command(async () => {
    await saveCurrent();
    notice("流程已保存，刷新页面后仍可继续");
  });
async function startRun(from) {
  if (state.project.status === "running") return;
  await command(async () => {
    const p = state.project;
    const issues = graphIssues(p.nodes);
    if (issues.length) throw new Error(issues[0].message);
    if (from) {
      const node = p.nodes.find((n) => n.id === from);
      if (!node) throw new Error("开始节点不存在");
      if (
        inputIds(node, p.nodes).some(
          (id) =>
            !["done", "skipped"].includes(
              p.nodes.find((n) => n.id === id)?.status,
            ),
        )
      )
        throw new Error("这个节点需要上游结果，请先从第一个未完成节点开始");
    }
    const saved = await saveCurrent(),
      running = await api("/api/studio/projects/" + saved.id + "/run", "POST", {
        revision: saved.revision,
        ...(from ? { from } : {}),
      });
    replaceProject(running);
    notice(
      from ? "已从所选节点开始生成" : "生成已开始，可以离开页面，稍后查看结果",
    );
  });
}
$("generate").onclick = () =>
  state.project.status === "running"
    ? command(async () => {
        replaceProject(
          await api(
            "/api/studio/projects/" + state.project.id + "/pause",
            "POST",
            {},
          ),
        );
        notice("将在当前节点完成后暂停");
      })
    : state.project.nodes.some((n) => n.status === "waiting")
      ? selectNode(state.project.nodes.find((n) => n.status === "waiting").id)
      : startRun();
for (const [action, id] of mockActions) {
  const control = $(id);
  if (!control) continue;
  control.onclick = () => command(async () => {
    if (!state.project?.id) {
      notice("请先保存流程，再使用 Mock 控制", "error");
      return;
    }
    const updated = await api(`/api/studio/projects/${encodeURIComponent(state.project.id)}/mock/${action}`, "POST", {});
    replaceProject(updated);
    state.dirty = false;
    notice(`Mock 已执行：${control.textContent}`);
  });
}
function newProject() {
  if (state.busy) return;
  if (state.dirty) {
    const d = modal("开始新视频");
    d.append(
      el("p", "当前流程有未保存修改。先保存，或放弃这些修改后开始新视频。"),
    );
    const footer = el("div", undefined, "modal-footer");
    footer.append(
      button("返回编辑", () => d.close()),
      button(
        "保存并新建",
        () => {
          d.close();
          command(async () => {
            await saveCurrent();
            openNewProjectWizard();
          });
        },
        "primary-button",
      ),
      button(
        "放弃并新建",
        () => {
          d.close();
          openNewProjectWizard();
        },
        "danger-button",
      ),
    );
    d.append(footer);
    return;
  }
  openNewProjectWizard();
}
function openNewProjectWizard() {
  const d = modal("新建视频工作流");
  d.classList.add("new-project-dialog");
  const step = el("p", "01 / 选择模板", "section-kicker"),
    intro = el("p", "先确定创作方式，再填写本条视频的信息；创建后仍可自由增删节点、调整字段和执行顺序。", "muted"),
    form = el("div", undefined, "new-project-form"),
    templateGrid = el("div", undefined, "wizard-template-grid"),
    selected = { id: BUILTIN_TEMPLATES[0].id };
  for (const template of BUILTIN_TEMPLATES) {
    const item = button("", () => {
      selected.id = template.id;
      templateGrid.querySelectorAll("button").forEach((b) => b.classList.toggle("selected", b.dataset.template === template.id));
    }, "wizard-template");
    item.dataset.template = template.id;
    item.append(el("strong", template.name), el("small", template.description));
    if (template.id === selected.id) item.classList.add("selected");
    templateGrid.append(item);
  }
  const topic = el("textarea"); topic.value = "新品咖啡机的 30 秒种草介绍"; topic.rows = 3; topic.maxLength = 200; topic.placeholder = "例如：用 30 秒介绍新品咖啡机，语气轻松、有记忆点";
  const human = el("select");
  for (const h of state.humans.filter((item) => item.status === "ready")) { const o = el("option", h.name + " · " + h.voice); o.value = h.id; human.append(o); }
  if (state.project?.humanId && [...human.options].some((o) => o.value === state.project.humanId)) human.value = state.project.humanId;
  const script = el("select");
  for (const [value, label] of [["viral", "爆款种草 · 30 秒"], ["launch", "产品发布 · 45 秒"], ["story", "品牌故事 · 60 秒"]]) { const o = el("option", label); o.value = value; script.append(o); }
  const ratio = el("select");
  for (const value of ["9:16 竖屏", "16:9 横屏", "1:1 方形"]) { const o = el("option", value); o.value = value; ratio.append(o); }
  for (const [label, control] of [["视频主题 / 目标", topic], ["出镜数字人", human], ["预置剧本", script], ["画幅", ratio]]) { const l = el("label", label); l.append(control); form.append(l); }
  const error = el("p", "", "dependency-error");
  const create = button("创建并打开工作流", () => {
    if (!topic.value.trim()) { error.textContent = "请先填写视频主题或目标"; return; }
    const template = BUILTIN_TEMPLATES.find((item) => item.id === selected.id) || BUILTIN_TEMPLATES[0];
    state.project = draft();
    state.project.nodes = template.create();
    state.project.topic = topic.value.trim();
    state.project.humanId = human.value;
    state.project.script = script.value;
    state.project.ratio = ratio.value;
    state.nodeId = null;
    state.dirty = true;
    cache();
    d.close();
    renderProject();
    switchView("create");
    fitCanvas();
    notice("工作流已创建，可以继续调整节点和字段");
  }, "primary-button");
  const footer = el("div", undefined, "modal-footer"); footer.append(button("取消", () => d.close()), create);
  d.append(step, intro, templateGrid, el("p", "02 / 填写视频信息", "section-kicker"), form, error, footer);
}
function resetProject() {
  state.project = draft();
  state.nodeId = null;
  state.dirty = false;
  cache();
  renderProject();
  switchView("create");
}
function resolveConflict() {
  const d = modal("流程已更新");
  d.append(
    el(
      "p",
      "另一个页面已经保存了新版本。你的修改仍保留在当前页面，可以保存为一条新视频，或加载最新版本重新编辑。",
    ),
  );
  const footer = el("div", undefined, "modal-footer");
  footer.append(
    button("保留当前修改", () => d.close()),
    button("加载最新版本", async () => {
      try {
        const data = await api("/api/studio");
        const p = data.projects.find((p) => p.id === state.project.id);
        if (!p) throw new Error("原流程不存在");
        replaceProject(p);
        renderProject();
        renderWorks();
        d.close();
      } catch (e) {
        notice(e.message, "error");
      }
    }),
    button(
      "保存为新视频",
      () => {
        d.close();
        delete state.project.id;
        state.project.revision = 0;
        state.project.versions = [];
        state.project.nodes.forEach((n) => {
          n.status = "pending";
          delete n.result;
        });
        state.project.status = "draft";
        state.dirty = true;
        command(async () => {
          await saveCurrent();
          notice("已保存为一条新视频");
        });
      },
      "primary-button",
    ),
  );
  d.append(footer);
}
function previewMedia(title, videoUrl, audioUrl, versions) {
  const d = modal(title);
  d.append(
    el("p", "本地演示媒体 · 当前未连接真实生图、生视频或数字人训练服务。"),
  );
  const video = el("video");
  video.controls = true;
  if (videoUrl) video.src = videoUrl;
  video.playsInline = true;
  const error = el("p", "", "inline-error");
  video.onerror = () =>
    (error.textContent = "视频文件暂不可用，请重新生成或检查媒体文件。");
  if (videoUrl) d.append(video);
  if (audioUrl) {
    const audio = el("audio");
    audio.controls = true;
    audio.src = audioUrl;
    audio.onerror = () =>
      (error.textContent = "音频文件暂不可用，请检查媒体文件。");
    d.append(audio);
  }
  const download = el("a", "下载视频", "primary-button");
  download.href = videoUrl;
  download.download = "映生-视频.mp4";
  download.style.display = "inline-block";
  download.style.marginTop = "15px";
  if (videoUrl) d.append(download);
  d.append(error);
  if (versions) {
    const list = el("div", undefined, "version-list");
    for (const v of [...versions].reverse())
      list.append(
        button(
          "第 " +
            v.version +
            " 版 · " +
            new Date(v.createdAt).toLocaleString("zh-CN"),
          () => {
            video.src = v.videoUrl;
            notice("已切换到第 " + v.version + " 版");
          },
          "",
        ),
      );
    d.append(list);
  }
  d.addEventListener("close", () => {
    video.pause();
    for (const a of d.querySelectorAll("audio")) a.pause();
  });
}
function renderWorks() {
  const root = $("works-list");
  root.replaceChildren();
  const projects = [...state.projects].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (!projects.length) {
    const empty = el("div", undefined, "works-empty");
    empty.append(
      el("span", "✦", "empty-icon"),
      el("strong", "还没有视频作品"),
      el("p", "选择剧本模板并填写主题，创建第一条视频工作流。"),
      button("＋ 新建视频", newProject, "primary-button"),
    );
    root.append(empty);
    return;
  }
  for (const p of projects) {
    const row = el("article", undefined, "work-item"),
      main = el("div", undefined, "work-item-main");
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", "打开工作流：" + p.topic);
    main.append(
      el("strong", p.topic),
      el(
        "p",
        p.nodes.length +
          " 个节点 · " +
          p.versions.length +
          " 个成片版本 · " +
          new Date(p.createdAt).toLocaleDateString("zh-CN"),
      ),
    );
    const openWorkflow = () => {
      if (state.busy) return;
      if (state.dirty) return notice("请先保存当前流程，再打开其他视频", "error");
      replaceProject(p);
      state.nodeId = null;
      renderProject();
      switchView("create");
    };
    row.onclick = (event) => { if (!event.target.closest("button")) openWorkflow(); };
    row.onkeydown = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openWorkflow(); } };
    row.append(
      el("div", p.versions.length ? "▶" : "⌁", "work-thumb"),
      main,
      el("span", labels[p.status], "work-status " + p.status),
    );
    if (p.versions.length) {
      const v = p.versions.at(-1);
      row.append(
        button(v.videoUrl ? "预览成片" : "查看输出", () => {
          if (v.videoUrl)
            previewMedia(p.topic, v.videoUrl, v.audioUrl, p.versions);
          else {
            const d = modal("工作流输出 · 第 " + v.version + " 版");
            const pre = el(
              "pre",
              JSON.stringify(
                v.nodes
                  .filter((n) => n.kind === "end")
                  .map((n) => n.output?.data),
                null,
                2,
              ),
              "node-result",
            );
            d.append(pre);
          }
        }),
      );
    }
    row.append(
      button(p.status === "running" ? "查看进度" : "打开流程", openWorkflow),
    );
    root.append(row);
  }
  for (const task of state.tasks) {
    const row = el("article", undefined, "work-item"),
      main = el("div", undefined, "work-item-main");
    main.append(
      el("strong", task.title),
      el(
        "p",
        "原工作台任务 · " +
          new Date(task.createdAt).toLocaleDateString("zh-CN"),
      ),
    );
    row.append(
      el("div", "▤", "work-thumb"),
      main,
      el("span", task.statusLabel, "work-status " + task.status),
      button("查看详情", () => legacyDetail(task.id)),
    );
    root.append(row);
  }
  if (!projects.length && !state.tasks.length)
    root.append(
      el("div", "还没有作品，开始生成你的第一条视频。", "empty-state"),
    );
  if ($("task-count"))
    $("task-count").textContent = projects.length + state.tasks.length;
}
let detailEpoch = 0;
async function legacyDetail(id) {
  const epoch = ++detailEpoch,
    d = modal("任务详情");
  d.append(el("p", "正在加载…"));
  d.addEventListener("close", () => detailEpoch++);
  try {
    const view = await api(
      "/api/tasks/" + encodeURIComponent(id) + "/production",
    );
    if (epoch !== detailEpoch || !d.open) return;
    for (const e of [...d.children].slice(1)) e.remove();
    d.append(el("p", view.task.title + " · " + view.task.status));
    if (view.task.blocked_reason)
      d.append(el("p", view.task.blocked_reason, "inline-error"));
    const text = el("label", "口播文案"),
      narration = el("textarea", undefined, "topic-input");
    narration.value = view.content.narration;
    text.append(narration);
    d.append(text);
    const scenes = view.content.scenes.map((s) => {
      const l = el("label", "分镜"),
        input = el("textarea", undefined, "topic-input");
      input.value = s.description;
      l.append(input);
      d.append(l);
      return { id: s.id, input };
    });
    const save = button(
      "保存修改",
      async () => {
        save.disabled = true;
        try {
          await api(
            "/api/tasks/" + encodeURIComponent(id) + "/content",
            "PUT",
            {
              narration: narration.value,
              scenes: scenes.map((s) => ({
                id: s.id,
                description: s.input.value,
              })),
            },
          );
          notice("修改已保存");
        } catch (e) {
          notice(e.message, "error");
        } finally {
          save.disabled = false;
        }
      },
      "primary-button",
    );
    d.append(save);
    const advanced = el("details"),
      summary = el("summary", "任务联调"),
      mode = el("select");
    for (const [value, label] of [
      ["running", "开始执行"],
      ["missing_authorization", "模拟缺少授权"],
      ["failure", "模拟生成失败"],
      ["success", "完成并创建新版本"],
    ]) {
      const option = el("option", label);
      option.value = value;
      mode.append(option);
    }
    const execute = button("执行", async () => {
      execute.disabled = true;
      try {
        await api("/api/tasks/" + encodeURIComponent(id) + "/execute", "POST", {
          mode: mode.value,
        });
        notice("执行状态已保存");
        d.close();
        await load();
        legacyDetail(id);
      } catch (e) {
        notice(e.message, "error");
      } finally {
        execute.disabled = false;
      }
    });
    advanced.append(summary, mode, execute);
    d.append(advanced);
    if (view.artifact)
      d.append(
        button("预览绑定的历史成片", () =>
          previewMedia(
            view.task.title,
            view.artifact.videoUrl,
            view.artifact.audioUrl,
          ),
        ),
      );
    else d.append(el("p", "尚无成片"));
  } catch (e) {
    if (epoch === detailEpoch && d.open)
      d.append(el("p", e.message, "inline-error"));
  }
}
function createHuman() {
  const d = modal("创建你的数字人");
  d.append(
    el(
      "p",
      "上传人物照片或视频，可附加声音资料。系统会自动处理，你可以离开此页面。",
    ),
  );
  const nameLabel = el("label", "数字人名称"),
    name = el("input");
  name.placeholder = "例如：我的品牌主理人";
  name.maxLength = 40;
  name.required = true;
  nameLabel.append(name);
  const voiceLabel = el("label", "口播风格"),
    voice = el("input");
  voice.value = "自然亲切";
  voice.maxLength = 50;
  voiceLabel.append(voice);
  const fileLabel = el("label", "训练资料 · 1–5 个文件，总量不超过 8 MB"),
    files = el("input");
  files.type = "file";
  files.accept =
    "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/wav,audio/mpeg,audio/mp4,audio/webm";
  files.multiple = true;
  fileLabel.append(files);
  const summary = el("div", "", "file-list");
  files.onchange = () => {
    summary.textContent = [...files.files]
      .map((f) => f.name + " · " + (f.size / 1024 / 1024).toFixed(2) + " MB")
      .join(" / ");
  };
  const error = el("p", "", "inline-error"),
    footer = el("div", undefined, "modal-footer"),
    submit = button(
      "上传并开始训练",
      async () => {
        error.textContent = "";
        const selected = [...files.files];
        if (!name.value.trim() || !selected.length) {
          error.textContent = "请输入名称并选择至少一份人物照片或视频。";
          return;
        }
        if (
          selected.length > 5 ||
          selected.reduce((sum, f) => sum + f.size, 0) > 8 * 1024 * 1024
        ) {
          error.textContent = "最多 5 个文件，总量不超过 8 MB。";
          return;
        }
        submit.disabled = true;
        files.disabled = true;
        name.disabled = true;
        voice.disabled = true;
        submit.textContent = "正在上传…";
        try {
          const payload = await Promise.all(
            selected.map(
              (f) =>
                new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve({
                      name: f.name,
                      type: f.type,
                      data: String(reader.result).split(",")[1],
                    });
                  reader.onerror = () =>
                    reject(new Error("文件读取失败，请重新选择"));
                  reader.readAsDataURL(f);
                }),
            ),
          );
          const h = await api("/api/studio/humans", "POST", {
            name: name.value,
            voice: voice.value,
            files: payload,
          });
          state.humans.push(h);
          renderHumans();
          d.close();
          notice("资料已保存，已开始自动训练");
        } catch (e) {
          error.textContent = e.message;
          submit.disabled = false;
          files.disabled = false;
          name.disabled = false;
          voice.disabled = false;
          submit.textContent = "上传并开始训练";
        }
      },
      "primary-button",
    );
  footer.append(
    button("取消", () => d.close()),
    submit,
  );
  d.append(
    nameLabel,
    voiceLabel,
    fileLabel,
    summary,
    el(
      "p",
      "本地演示模式：资料保存到本机 SQLite，训练进度由模拟执行器驱动，不会调用外部服务。",
      "demo-notice",
    ),
    error,
    footer,
  );
}
$("create-human").onclick = createHuman;
function retrainHuman(h) {
  const d = modal("重新训练 · " + h.name);
  d.append(
    el(
      "p",
      "将复用已上传的 " +
        h.files.length +
        " 份资料训练新版本。现有成片会保留；训练期间该数字人暂不可用于新视频。",
    ),
  );
  const footer = el("div", undefined, "modal-footer"),
    confirm = button(
      "开始重新训练",
      async () => {
        confirm.disabled = true;
        try {
          const updated = await api(
            "/api/studio/humans/" + h.id + "/retrain",
            "POST",
            {},
          );
          state.humans = state.humans.map((item) =>
            item.id === h.id ? updated : item,
          );
          renderHumans();
          d.close();
          notice("新版本开始训练");
        } catch (e) {
          notice(e.message, "error");
          confirm.disabled = false;
        }
      },
      "primary-button",
    );
  footer.append(
    button("取消", () => d.close()),
    confirm,
  );
  d.append(footer);
}
async function load(manual = false) {
  const id = ++state.loadId,
    epoch = state.epoch;
  try {
    const [data, tasks] = await Promise.all([
      api("/api/studio"),
      api("/api/tasks"),
    ]);
    if (id !== state.loadId || epoch !== state.epoch || state.busy) return;
    const oldHumans = state.humans;
    state.humans = data.humans;
    state.projects = data.projects;
    state.tasks = tasks;
    for (const h of data.humans)
      if (
        h.status === "ready" &&
        oldHumans.some((old) => old.id === h.id && old.status === "training")
      )
        notice(h.name + " 的训练已完成，可以试播了");
    if (!state.project) {
      let saved;
      try {
        saved = JSON.parse(
          localStorage.getItem("yingsheng:" + state.tenant) || "null",
        );
      } catch {}
      if (Array.isArray(saved?.project?.nodes) && saved.dirty) {
        state.project = saved.project;
        state.dirty = true;
        if (upgradeWorkflow(state.project, uid)) {
          const remote = data.projects.find((p) => p.id === state.project.id);
          if (remote) state.project.revision = remote.revision;
          cache();
          notice("已升级为通用工作流，旧节点配置已归档，历史作品保留");
        }
      } else
        state.project = clone(
          data.projects.find((p) => p.id === saved?.project?.id) ||
            data.projects.find((p) => p.status === "running") ||
            draft(),
        );
      renderProject();
      if (state.view === "create") fitCanvas();
    } else if (state.project.id && !state.dirty) {
      const remote = data.projects.find((p) => p.id === state.project.id);
      if (remote && remote.revision !== state.project.revision) {
        const before = state.project.status;
        replaceProject(remote);
        renderProject();
        if (before === "running" && remote.status === "succeeded")
          notice("视频已完成，在“我的作品”中查看成片");
        if (before === "running" && remote.status === "paused")
          notice("流程已暂停，现在可以调整后续节点");
      }
    }
    renderHumans();
    renderWorks();
    if (manual) notice("工作区已刷新");
  } catch (e) {
    if (manual || !state.project) notice("加载失败：" + e.message, "error");
  }
}
$("refresh").onclick = () => load(true);
window.addEventListener("beforeunload", (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("resize", fitCanvas);
const demo = el(
  "p",
  "本地演示 · 数字人训练与视频生成使用模拟执行器，输出为项目内置演示媒体。",
  "demo-notice",
);
$("humans-view").append(demo);
try {
  const session = await api("/api/session");
  state.tenant = session.tenantId;
  document.querySelector(".sidebar-foot .mono").textContent = session.tenantId;
  await load();
} catch (e) {
  notice("无法连接工作区：" + e.message, "error");
}
setInterval(() => {
  if (
    !document.hidden &&
    (state.humans.some((h) => h.status === "training") ||
      state.projects.some((p) => p.status === "running"))
  )
    load();
}, 1500);
