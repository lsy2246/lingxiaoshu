const { inputPorts, outputPorts, fieldEdges, inputIds, bindField } = globalThis.Workflow;
const NS = "http://www.w3.org/2000/svg";
const WIDTH = 280, HEADER = 112, ROW = 25;
const height = (n) => HEADER + Math.max(inputPorts(n).length, outputPorts(n).length, 1) * ROW + 42;
export function createGraphEditor(wrap, options) {
  const canvas = document.createElement("div");
  canvas.className = "graph-canvas";
  wrap.append(canvas);
  const hint = document.createElement("div");
  hint.className = "graph-hint";
  hint.textContent = "拖动空白平移 · 滚轮缩放 · 输出字段 → 输入字段";
  wrap.append(hint);
  const tools = document.createElement("div");
  tools.className = "zoom-tools";
  wrap.append(tools);
  let pan = { x: 24, y: 24, zoom: 0.8 }, selected = null, drag = null, connecting = null, moved = false;
  let svg;
  const all = () => [...(options.external?.() || []), ...options.nodes()];
  const editable = () => !options.locked?.();
  const point = (e) => {
    const r = wrap.getBoundingClientRect();
    return { x: (e.clientX - r.left - pan.x) / pan.zoom, y: (e.clientY - r.top - pan.y) / pan.zoom };
  };
  const transform = () => {
    canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${pan.zoom})`;
    zoomLabel.textContent = Math.round(pan.zoom * 100) + "%";
  };
  function control(label, fn) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = fn; tools.append(b); return b;
  }
  control("−", () => { pan.zoom = Math.max(0.2, pan.zoom - 0.1); transform(); }).setAttribute("aria-label", "缩小画布");
  const zoomLabel = document.createElement("span"); tools.append(zoomLabel);
  control("+", () => { pan.zoom = Math.min(1.6, pan.zoom + 0.1); transform(); }).setAttribute("aria-label", "放大画布");
  control("适应", fit);
  const cancel = control("取消连接", cancelConnection); cancel.hidden = true;
  function cancelConnection() { connecting = null; cancel.hidden = true; hint.textContent = "拖动空白平移 · 滚轮缩放 · 输出字段 → 输入字段"; drawEdges(); }
  function anchor(n, key, output) {
    const ports = output ? outputPorts(n) : inputPorts(n);
    const index = Math.max(0, ports.findIndex((p) => p.key === key));
    return { x: n.x + (output ? WIDTH : 0), y: n.y + HEADER + ROW * index + ROW / 2 };
  }
  function path(a, b) {
    const bend = Math.max(65, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + bend} ${a.y}, ${b.x - bend} ${b.y}, ${b.x} ${b.y}`;
  }
  function drawEdges() {
    if (!svg) return;
    svg.replaceChildren();
    const nodes = all();
    const makePath = (a, b, label, dashed, remove) => {
      const line = document.createElementNS(NS, "path");
      line.setAttribute("d", path(a, b)); line.setAttribute("class", "graph-edge" + (dashed ? " dependency-edge" : ""));
      if (remove) {
        line.setAttribute("tabindex", "0"); line.setAttribute("role", "button"); line.setAttribute("aria-label", "断开 " + label);
        line.ondblclick = remove;
        line.onkeydown = (e) => { if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); } };
      }
      svg.append(line);
      if (label) {
        const text = document.createElementNS(NS, "text"); text.setAttribute("x", (a.x + b.x) / 2); text.setAttribute("y", (a.y + b.y) / 2 - 7); text.setAttribute("text-anchor", "middle"); text.setAttribute("class", "edge-label"); text.textContent = label; svg.append(text);
      }
    };
    const edges = fieldEdges(options.nodes());
    for (const e of edges) {
      const from = nodes.find((n) => n.id === e.source), to = nodes.find((n) => n.id === e.target);
      if (!from || !to) continue;
      makePath(anchor(from, e.sourceField, true), anchor(to, e.targetField, false), `${e.sourceField} → ${e.targetField}`, false, () => {
        if (!editable()) return;
        delete to.settings.bindings[e.targetField]; options.changed?.(to); render();
      });
    }
    for (const to of options.nodes()) for (const id of inputIds(to, options.nodes())) {
      if (edges.some((e) => e.source === id && e.target === to.id)) continue;
      const from = nodes.find((n) => n.id === id); if (!from) continue;
      makePath({ x: from.x + WIDTH, y: from.y + 50 }, { x: to.x, y: to.y + 50 }, "执行依赖", true);
    }
    if (connecting) {
      const from = nodes.find((n) => n.id === connecting.id);
      if (from) makePath(anchor(from, connecting.field, true), connecting.point, "", false);
    }
  }
  function connect(target, field) {
    if (!connecting || !editable()) return;
    try {
      bindField(options.nodes(), connecting.id, connecting.field, target.id, field, options.external?.() || []);
      selected = target.id; options.changed?.(target); options.select?.(target.id);
    } catch (e) { options.notice?.(e.message, "error"); }
    cancelConnection(); render();
  }
  function render() {
    canvas.replaceChildren();
    const nodes = all();
    canvas.style.width = Math.max(1800, ...nodes.map((n) => n.x + WIDTH + 100)) + "px";
    canvas.style.height = Math.max(900, ...nodes.map((n) => n.y + height(n) + 100)) + "px";
    svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "graph-edges"); canvas.append(svg);
    for (const n of nodes) {
      const virtual = !options.nodes().includes(n), card = document.createElement("article");
      card.className = "workflow-node graph-node" + (selected === n.id ? " selected" : "") + (virtual ? " context-node" : "");
      card.dataset.nodeId = n.id; card.dataset.status = n.status || "pending";
      card.style.left = n.x + "px"; card.style.top = n.y + "px"; card.style.height = height(n) + "px";
      card.tabIndex = 0; card.setAttribute("aria-label", n.title + " 节点");
      const head = document.createElement("div"); head.className = "graph-node-head";
      const title = document.createElement("strong"); title.textContent = n.title;
      const operation = document.createElement("small"); operation.textContent = globalThis.Workflow.OP_LABELS[globalThis.Workflow.operationOf(n)] || "上下文变量";
      head.append(title, operation); card.append(head);
      head.onpointerdown = (e) => {
        if (e.button !== 0 || virtual) return; e.stopPropagation();
        selected = n.id; options.select?.(n.id); select(selected);
        if (!editable()) return;
        head.setPointerCapture?.(e.pointerId); const p = point(e);
        drag = { type: "node", node: n, target: card, x: p.x, y: p.y, originX: n.x, originY: n.y }; moved = false;
      };
      card.onkeydown = (e) => {
        if (e.target !== card) return;
        if (e.key === "Enter") { selected = n.id; options.select?.(n.id); select(n.id); }
      };
      card.ondblclick = (e) => { if (!e.target.closest("button")) options.open?.(n); };
      const ports = document.createElement("div"); ports.className = "graph-ports";
      for (const output of [false, true]) {
        const column = document.createElement("div"); column.className = output ? "graph-outputs" : "graph-inputs";
        for (const p of output ? outputPorts(n) : virtual ? [] : inputPorts(n)) {
          const b = document.createElement("button"); b.type = "button";
          b.className = "field-port " + (output ? "output-field" : "input-field");
          b.dataset.field = p.key; b.title = `${output ? "输出" : "输入"} ${p.key} · ${p.type}`;
          b.setAttribute("aria-label", n.title + " " + b.title); b.textContent = p.key + " · " + p.type;
          b.disabled = !editable();
          if (!output && n.settings?.bindings?.[p.key] !== undefined) b.classList.add("bound-field");
          b.onpointerdown = (e) => {
            e.stopPropagation();
            if (output && editable()) { const a = anchor(n, p.key, true); connecting = { id: n.id, field: p.key, point: a }; cancel.hidden = false; hint.textContent = `连接 ${n.title}.${p.key}，拖到目标输入，或点击目标字段`; drawEdges(); }
          };
          b.onclick = (e) => {
            e.stopPropagation();
            if (!output) connect(n, p.key);
            else if (e.detail === 0) { connecting = { id: n.id, field: p.key, point: anchor(n, p.key, true) }; cancel.hidden = false; drawEdges(); }
          };
          column.append(b);
        }
        ports.append(column);
      }
      card.append(ports);
      const footer = document.createElement("div"); footer.className = "graph-node-footer";
      footer.textContent = virtual ? "只读上下文 · 可拖出变量" : ({ done: "✓ 已完成", running: "◌ 执行中", waiting: "等待确认", skipped: "分支跳过", pending: "待执行" }[n.status] || "待执行");
      if (n.settings?.children) {
        const enter = document.createElement("button"); enter.type = "button"; enter.textContent = "进入子流程 · " + n.settings.children.length; enter.onclick = () => options.open?.(n); footer.append(enter);
      }
      card.append(footer); canvas.append(card);
    }
    drawEdges(); transform();
  }
  function select(id) { selected = id; canvas.querySelectorAll(".graph-node").forEach((n) => n.classList.toggle("selected", n.dataset.nodeId === id)); }
  function fit() {
    const nodes = all(); if (!nodes.length) return;
    const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + WIDTH)), maxY = Math.max(...nodes.map((n) => n.y + height(n)));
    const w = wrap.clientWidth || 640, h = wrap.clientHeight || 600;
    const zoom = Math.max(0.2, Math.min(1, (w - 80) / (maxX - minX), (h - 80) / (maxY - minY)));
    pan = { zoom, x: (w - (maxX - minX) * zoom) / 2 - minX * zoom, y: (h - (maxY - minY) * zoom) / 2 - minY * zoom }; transform();
  }
  wrap.onpointerdown = (e) => {
    if (e.button !== 0 || e.target.closest("button, .graph-node")) return;
    if (connecting) { cancelConnection(); return; }
    wrap.setPointerCapture?.(e.pointerId); drag = { type: "pan", x: e.clientX, y: e.clientY, originX: pan.x, originY: pan.y };
  };
  wrap.onpointermove = (e) => {
    if (connecting) { connecting.point = point(e); drawEdges(); return; }
    if (!drag) return;
    if (drag.type === "pan") { pan.x = drag.originX + e.clientX - drag.x; pan.y = drag.originY + e.clientY - drag.y; transform(); }
    else { const p = point(e); const step = options.snap?.() ? 23 : 1;
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > 3) moved = true;
      drag.node.x = Math.max(0, Math.min(100000, Math.round((drag.originX + p.x - drag.x) / step) * step));
      drag.node.y = Math.max(0, Math.min(100000, Math.round((drag.originY + p.y - drag.y) / step) * step));
      drag.target.style.left = drag.node.x + "px"; drag.target.style.top = drag.node.y + "px"; drawEdges();
    }
  };
  wrap.onpointerup = (e) => {
    if (connecting) {
      const port = document.elementFromPoint?.(e.clientX, e.clientY)?.closest(".input-field");
      if (port && wrap.contains(port)) connect(options.nodes().find((n) => n.id === port.closest(".graph-node").dataset.nodeId), port.dataset.field);
    }
    if (drag?.type === "node" && moved) options.changed?.(drag.node, true);
    drag = null;
  };
  wrap.onpointercancel = () => { drag = null; cancelConnection(); };
  wrap.onkeydown = (e) => { if (e.key === "Escape" && connecting) { e.stopPropagation(); cancelConnection(); } };
  wrap.onwheel = (e) => {
    e.preventDefault(); const p = point(e), r = wrap.getBoundingClientRect();
    pan.zoom = Math.max(0.2, Math.min(1.6, pan.zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
    pan.x = e.clientX - r.left - p.x * pan.zoom; pan.y = e.clientY - r.top - p.y * pan.zoom; transform();
  };
  wrap.ondragover = (e) => { e.preventDefault(); if (editable()) wrap.classList.add("drop-target"); };
  wrap.ondragleave = () => wrap.classList.remove("drop-target");
  wrap.ondrop = (e) => {
    e.preventDefault(); wrap.classList.remove("drop-target"); if (!editable()) return;
    const kind = e.dataTransfer?.getData("application/x-workflow-node"); if (!kind) return;
    const p = point(e); options.add?.(kind, { x: Math.max(0, p.x - WIDTH / 2), y: Math.max(0, p.y - 50) });
  };
  render();
  return { render, fit, select, cancelConnection };
}
globalThis.createGraphEditor = createGraphEditor;
