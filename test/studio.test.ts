import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../src/server";
import { Store } from "../src/store";
import type { StudioProject } from "../src/contracts";
import {
  createWorkflow,
  makeNode,
  graphIssues,
  bindField,
  fieldEdges,
  inputIds,
} from "../public/workflow.js";
import {
  canTransitionNode,
  canTransitionProject,
  transitionNode,
  transitionProject,
} from "../src/studio-state-machine";

async function fixture(t: any) {
  const dir = mkdtempSync(join(tmpdir(), "studio-test-")),
    dbPath = join(dir, "studio.sqlite");
  const app = createApp({
    dbPath,
    tenantId: "tenant-a",
    publicDir: resolve("public"),
  });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  const address = app.server.address();
  assert(address && typeof address === "object");
  t.after(async () => {
    await new Promise<void>((r) => app.server.close(() => r()));
    app.store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const request = async (path: string, method = "GET", data?: unknown) => {
    const response = await fetch(
      "http://127.0.0.1:" + address.port + "/api/studio" + path,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      },
    );
    return { status: response.status, body: await response.json() };
  };
  const state = await request("");
  assert.equal(state.status, 200);
  const config = {
    topic: "测试数字人视频",
    humanId: state.body.humans[0].id,
    script: "viral",
    ratio: "9:16 竖屏",
    workflowVersion: 3,
    nodes: createWorkflow(
      (() => {
        let i = 0;
        return () => "n-" + i++;
      })(),
    ),
  };
  const create = async () => {
    const result = await request("/projects", "POST", config);
    assert.equal(result.status, 201);
    return result.body as StudioProject;
  };
  const elapsed = (id: string, ms: number) =>
    app.store.update((s) => {
      const p = s.studio!.projects.find((p) => p.id === id)!;
      p.stepStartedAt = Date.now() - ms;
    });
  return { ...app, request, config, create, elapsed, dir, dbPath };
}

test("studio saves node additions, removals and positions across SQLite reopen", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  const nodes = [
    ...p.nodes.slice(0, 1),
    {
      id: "n-caption",
      kind: "plugin",
      settings: { operation: "asr.subtitle" },
      title: "字幕",
      prompt: "关键词高亮",
      x: 111,
      y: 222,
    },
    p.nodes.find((n) => n.kind === "end")!,
  ];
  const saved = await f.request("/projects/" + p.id, "PUT", { ...p, nodes });
  assert.equal(saved.status, 200);
  assert.deepEqual(
    saved.body.nodes.map((n: any) => n.id),
    ["n-0", "n-caption", "n-7"],
  );
  const reopened = new Store(f.dbPath);
  try {
    const persisted = reopened.read().studio!.projects[0];
    assert.equal(persisted.nodes[1].x, 111);
    assert.equal(persisted.nodes[1].prompt, "关键词高亮");
  } finally {
    reopened.close();
  }
});

test("pause completes the current node and resume reuses upstream results", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  const running = await f.request("/projects/" + p.id + "/run", "POST", {
    revision: p.revision,
  });
  assert.equal(running.status, 200);
  const paused = await f.request("/projects/" + p.id + "/pause", "POST", {});
  assert.equal(paused.body.pauseRequested, true);
  f.elapsed(p.id, 4000);
  let current = (await f.request("")).body.projects[0];
  assert.equal(current.status, "paused");
  assert.equal(current.nodes[0].status, "done");
  assert.equal(current.nodes[1].status, "pending");
  const result = current.nodes[0].result;
  const resumed = await f.request("/projects/" + p.id + "/run", "POST", {
    revision: current.revision,
    from: "n-1",
  });
  assert.equal(resumed.status, 200);
  f.elapsed(p.id, 40000);
  current = (await f.request("")).body.projects[0];
  assert.equal(current.status, "succeeded");
  assert.equal(current.nodes[0].result, result);
  assert.equal(current.versions.length, 1);
  assert.equal(current.versions[0].videoUrl, "/media/demo.mp4");
});

test("editing a completed node invalidates downstream results and preserves historical snapshots", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  await f.request("/projects/" + p.id + "/run", "POST", {
    revision: p.revision,
  });
  f.elapsed(p.id, 40000);
  const completed = (await f.request("")).body.projects[0],
    history = structuredClone(completed.versions[0]),
    upstream = completed.nodes[0].result;
  completed.nodes[1].prompt = "改为更有活力的表达";
  const edited = await f.request("/projects/" + p.id, "PUT", completed);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.nodes[0].result, upstream);
  assert.equal(edited.body.nodes[1].status, "pending");
  assert.equal(edited.body.nodes[2].result, undefined);
  assert.deepEqual(edited.body.versions[0], history);
  await f.request("/projects/" + p.id + "/run", "POST", {
    revision: edited.body.revision,
    from: "n-1",
  });
  f.elapsed(p.id, 40000);
  const final = (await f.request("")).body.projects[0];
  assert.equal(final.versions.length, 2);
  assert.deepEqual(final.versions[0], history);
  assert.match(final.nodes[1].result, /更有活力/);
});

test("running edits, missing upstream, missing end and stale revisions are rejected", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  assert.equal(
    (
      await f.request("/projects/" + p.id + "/run", "POST", {
        revision: p.revision,
        from: "n-6",
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request("/projects/" + p.id, "PUT", { ...p, revision: 0 })).status,
    409,
  );
  const noEnd = await f.request("/projects/" + p.id, "PUT", {
    ...p,
    nodes: p.nodes.slice(0, 2),
  });
  assert.equal(noEnd.status, 200);
  assert.equal(
    (
      await f.request("/projects/" + p.id + "/run", "POST", {
        revision: noEnd.body.revision,
      })
    ).status,
    400,
  );
  const restored = await f.request("/projects/" + p.id, "PUT", {
    ...noEnd.body,
    nodes: p.nodes,
  });
  await f.request("/projects/" + p.id + "/run", "POST", {
    revision: restored.body.revision,
  });
  assert.equal(
    (await f.request("/projects/" + p.id, "PUT", restored.body)).status,
    409,
  );
});

test("all nodes can be removed from a draft and invalid node definitions cannot be saved", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  for (const nodes of [
    [{ ...p.nodes[0], kind: "unknown" }],
    [p.nodes[0], p.nodes[0]],
    [{ ...p.nodes[0], x: -1 }],
  ]) {
    assert.equal(
      (await f.request("/projects/" + p.id, "PUT", { ...p, nodes })).status,
      400,
    );
  }
  const empty = await f.request("/projects/" + p.id, "PUT", {
    ...p,
    nodes: [],
  });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.nodes.length, 0);
  assert.equal(
    (
      await f.request("/projects/" + p.id + "/run", "POST", {
        revision: empty.body.revision,
      })
    ).status,
    400,
  );
});

test("training stores actual file bytes privately and becomes ready after elapsed time", async (t) => {
  const f = await fixture(t);
  const data =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=";
  const created = await f.request("/humans", "POST", {
    name: "我的数字人",
    voice: "自然",
    files: [{ name: "portrait.png", type: "image/png", data }],
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, "training");
  assert.equal(created.body.files[0].data, undefined);
  const stored = f.store
    .read()
    .studio!.humans.find((h) => h.id === created.body.id)!;
  assert.equal(stored.files[0].data, data);
  const project = await f.request("/projects", "POST", {
    ...f.config,
    humanId: stored.id,
  });
  assert.equal(project.status, 201);
  assert.equal(
    (
      await f.request("/projects/" + project.body.id + "/run", "POST", {
        revision: project.body.revision,
      })
    ).status,
    409,
  );
  f.store.update((s) => {
    s.studio!.humans.find((h) => h.id === stored.id)!.trainingStartedAt =
      Date.now() - 25000;
  });
  const current = (await f.request("")).body.humans.find(
    (h: any) => h.id === stored.id,
  );
  assert.equal(current.status, "ready");
  assert.equal(current.progress, 100);
  assert.equal(current.files[0].data, undefined);
  const retrained = await f.request(
    "/humans/" + stored.id + "/retrain",
    "POST",
    {},
  );
  assert.equal(retrained.body.version, 2);
  assert.equal(retrained.body.status, "training");
  assert.equal(
    (
      await f.request("/humans", "POST", {
        name: "坏资料",
        files: [{ name: "a.txt", type: "text/plain", data: "YQ==" }],
      })
    ).status,
    400,
  );
});

test("studio queries and commands enforce server tenant identity", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  f.store.update((s) => {
    s.studio!.humans.push({
      id: "foreign-human",
      tenantId: "tenant-b",
      name: "其他组织",
      voice: "自然",
      status: "ready",
      version: 1,
      createdAt: new Date().toISOString(),
      files: [],
    });
    s.studio!.projects.push({
      ...structuredClone(p),
      id: "foreign-project",
      tenantId: "tenant-b",
      humanId: "foreign-human",
    });
  });
  const listing = (await f.request("")).body;
  assert(!listing.humans.some((h: any) => h.id === "foreign-human"));
  assert(!listing.projects.some((item: any) => item.id === "foreign-project"));
  assert.equal(
    (await f.request("/projects/foreign-project", "PUT", p)).status,
    404,
  );
  assert.equal(
    (
      await f.request("/projects/foreign-project/run", "POST", {
        revision: p.revision,
      })
    ).status,
    404,
  );
  assert.equal(
    (await f.request("/humans/foreign-human/retrain", "POST", {})).status,
    404,
  );
  assert.equal(
    (
      await f.request("/projects", "POST", {
        ...f.config,
        humanId: "foreign-human",
        tenantId: "tenant-b",
      })
    ).status,
    404,
  );
});

test("video template runs per-item subflows with real asset dependencies and matching subtitle source", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  assert.equal(p.nodes.length, 8);
  assert.deepEqual(graphIssues(p.nodes), []);
  await f.request("/projects/" + p.id + "/run", "POST", {
    revision: p.revision,
  });
  f.elapsed(p.id, 40000);
  const done = (await f.request("")).body.projects[0];
  assert.equal(done.status, "succeeded", done.error);
  const loop = done.nodes.find((n: any) => n.kind === "loop").output;
  assert.equal(loop.iterations.length, 3);
  for (const iteration of loop.iterations) {
    const [image, video, audio, avatar] = iteration.nodes.map(
      (n: any) => n.output.data.file,
    );
    assert.deepEqual(video.sourceIds, [image.id]);
    assert(avatar.sourceIds.includes(video.id));
    assert(avatar.sourceIds.includes(audio.id));
    assert.equal(audio.text, iteration.item.dialogue);
  }
  const media = done.nodes.find(
    (n: any) => n.settings.operation === "timeline.compose",
  ).output;
  const subtitles = done.nodes.find(
    (n: any) => n.settings.operation === "asr.subtitle",
  ).output;
  assert.equal(media.timeline.length, 3);
  assert.equal(media.timeline[0].start, 0);
  assert.equal(subtitles.sourceMediaId, media.data.media.id);
  assert.deepEqual(
    subtitles.cues.map((c: any) => c.text),
    media.timeline.map((c: any) => c.dialogue),
  );
});
test("manual review blocks execution, rejects bypass and resumes with edited value", async (t) => {
  const f = await fixture(t);
  f.config.nodes[2].settings!.autoApprove = false;
  f.config.nodes[2].settings!.approved = true;
  const p = await f.create();
  assert.equal(p.nodes[2].settings?.approved, undefined);
  await f.request("/projects/" + p.id + "/run", "POST", {
    revision: p.revision,
  });
  f.elapsed(p.id, 40000);
  let current = (await f.request("")).body.projects[0];
  assert.equal(current.status, "paused");
  assert.equal(current.nodes[2].status, "waiting");
  assert.equal(current.nodes[3].output, undefined);
  assert.equal(
    (
      await f.request("/projects/" + p.id + "/run", "POST", {
        revision: current.revision,
        from: current.nodes[3].id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/projects/" + p.id + "/confirm", "POST", {
        revision: 0,
        nodeId: current.nodes[2].id,
      })
    ).status,
    409,
  );
  const scenes = structuredClone(current.nodes[2].output.data.value);
  scenes[0].dialogue = "人工修改后的台词";
  const confirmed = await f.request("/projects/" + p.id + "/confirm", "POST", {
    revision: current.revision,
    nodeId: current.nodes[2].id,
    value: scenes,
  });
  assert.equal(confirmed.status, 200);
  f.elapsed(p.id, 40000);
  current = (await f.request("")).body.projects[0];
  assert.equal(current.status, "succeeded", current.error);
  assert.equal(
    current.nodes[3].output.iterations[0].nodes[2].output.data.file.text,
    "人工修改后的台词",
  );
});
test("generic condition gates execute the selected path and skip the other end", async (t) => {
  const f = await fixture(t),
    start = makeNode("start", 0, "input"),
    condition = makeNode("condition", 1, "choose"),
    yes = makeNode("end", 2, "yes"),
    no = makeNode("end", 3, "no");
  condition.settings = {
    operation: "if",
    bindings: {
      value: "{{input.topic}}",
      true: { answer: "选中" },
      false: { answer: "未选中" },
    },
    compare: f.config.topic,
    operator: "equals",
  };
  yes.settings = {
    operation: "output.json",
    bindings: { value: "{{choose.value}}" },
    gate: { nodeId: "choose", branch: "true" },
  };
  no.settings = {
    operation: "output.json",
    bindings: { value: "{{choose.value}}" },
    gate: { nodeId: "choose", branch: "false" },
  };
  const created = await f.request("/projects", "POST", {
    ...f.config,
    nodes: [start, condition, yes, no],
  });
  assert.equal(created.status, 201);
  await f.request("/projects/" + created.body.id + "/run", "POST", {
    revision: created.body.revision,
  });
  f.elapsed(created.body.id, 40000);
  const done = (await f.request("")).body.projects[0];
  assert.equal(done.status, "succeeded", done.error);
  assert.equal(done.nodes[2].status, "done");
  assert.equal(done.nodes[3].status, "skipped");
  assert.deepEqual(done.nodes[2].output.data.value, { answer: "选中" });
  assert.equal(done.versions[0].videoUrl, "");
});
test("variable-only dependencies invalidate consumers while preserving independent branches", async (t) => {
  const f = await fixture(t),
    start = makeNode("start", 0, "start"),
    a = makeNode("llm", 1, "a"),
    b = makeNode("llm", 2, "b"),
    end = makeNode("end", 3, "end");
  a.settings = {
    operation: "text.generate",
    bindings: { value: "{{start.topic}}" },
  };
  b.settings = { operation: "text.generate", bindings: { value: "独立内容" } };
  end.settings = {
    operation: "output.json",
    bindings: { value: "{{a.text}}" },
  };
  const p = (
    await f.request("/projects", "POST", {
      ...f.config,
      nodes: [start, a, b, end],
    })
  ).body;
  await f.request("/projects/" + p.id + "/run", "POST", {
    revision: p.revision,
  });
  f.elapsed(p.id, 40000);
  const done = (await f.request("")).body.projects[0];
  assert.equal(done.status, "succeeded", done.error);
  const bOutput = structuredClone(done.nodes[2].output);
  done.nodes[1].settings.bindings.value = "修改内容";
  const saved = await f.request("/projects/" + p.id, "PUT", done);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.nodes[3].status, "pending");
  assert.deepEqual(saved.body.nodes[2].output, bOutput);
});
test("invalid references, cycles and runtime type mismatches are explicit", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  p.nodes[1].settings!.bindings = { topic: "{{deleted.topic}}" };
  let saved = await f.request("/projects/" + p.id, "PUT", p);
  assert.equal(
    (
      await f.request("/projects/" + p.id + "/run", "POST", {
        revision: saved.body.revision,
      })
    ).status,
    400,
  );
  saved.body.nodes[1].settings.bindings = { topic: 42 };
  saved = await f.request("/projects/" + p.id, "PUT", saved.body);
  assert.equal(
    (
      await f.request("/projects/" + p.id + "/run", "POST", {
        revision: saved.body.revision,
      })
    ).status,
    200,
  );
  f.elapsed(p.id, 40000);
  const failed = (await f.request("")).body.projects[0];
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /文本变量/);
  const cycle = structuredClone(f.config.nodes);
  cycle[0].inputs = [cycle[1].id];
  assert(graphIssues(cycle).some((i) => i.message.includes("循环依赖")));
});
test("legacy migration archives custom configuration once without resurrecting deleted generic nodes", async (t) => {
  const f = await fixture(t),
    p = await f.create();
  const legacy = [
    {
      ...p.nodes[0],
      kind: "script",
      settings: { text: "保留文案" },
      prompt: "自定义提示词",
    },
  ];
  f.store.update((s) => {
    const q = s.studio!.projects[0];
    q.workflowVersion = 2;
    q.nodes = legacy;
  });
  const migrated = (await f.request("")).body.projects[0];
  assert.equal(migrated.workflowVersion, 3);
  assert.deepEqual(migrated.workflowArchives[0].nodes, legacy);
  assert.equal(migrated.nodes[1].settings.text, "保留文案");
  const deleted = await f.request("/projects/" + p.id, "PUT", {
    ...migrated,
    nodes: migrated.nodes.filter((n: any) => n.kind !== "human"),
  });
  assert.equal(deleted.status, 200);
  const next = (await f.request("")).body.projects[0];
  assert.equal(next.nodes.length, 7);
  assert.equal(next.workflowArchives.length, 1);
  assert(!next.nodes.some((n: any) => n.kind === "human"));
});

test("parallel container and wait node are valid composable workflow primitives", async (t) => {
  const f = await fixture(t),
    id = (suffix: string) => "n-" + suffix,
    start = { ...makeNode("start", 0, id("start")), title: "输入" },
    wait = { ...makeNode("wait", 1, id("wait")), title: "等待", inputs: [start.id], settings: { operation: "wait", bindings: { value: `{{${start.id}.topic}}`, seconds: 1 } } },
    end = { ...makeNode("end", 2, id("end")), title: "输出", inputs: [wait.id], settings: { operation: "output.json", bindings: { value: `{{${wait.id}.value}}` } } };
  const created = await f.request("/projects", "POST", { ...f.config, nodes: [start, wait, end] });
  assert.equal(created.status, 201);
  const running = await f.request("/projects/" + created.body.id + "/run", "POST", { revision: created.body.revision });
  assert.equal(running.status, 200);
  f.elapsed(created.body.id, 40000);
  const done = (await f.request("")).body.projects[0];
  assert.equal(done.status, "succeeded", done.error);
  assert.equal(done.nodes[1].output.data.value, "测试数字人视频");
});

test("field bindings create typed dependencies and reject invalid links", () => {
  const source = makeNode("plugin", 0, "image"),
    target = makeNode("plugin", 1, "video"),
    text = makeNode("llm", 2, "text");
  source.settings = { operation: "image.generate" };
  target.settings = { operation: "video.generate" };
  text.settings = { operation: "text.generate" };
  const nodes = [source, target, text];
  bindField(nodes, "image", "file", "video", "image");
  assert.deepEqual(fieldEdges(nodes), [
    { source: "image", sourceField: "file", target: "video", targetField: "image" },
  ]);
  assert.deepEqual(inputIds(target, nodes), ["image"]);
  assert.throws(
    () => bindField(nodes, "text", "text", "video", "image"),
    /类型不匹配/,
  );
  delete target.settings.bindings!.image;
  assert.deepEqual(fieldEdges(nodes), []);
  assert.deepEqual(inputIds(target, nodes), []);
});

test("studio state machine constrains project and node transitions", () => {
  assert(canTransitionProject("draft", "running"));
  assert(canTransitionProject("running", "failed"));
  assert(!canTransitionProject("draft", "succeeded"));
  const project: any = { status: "draft" };
  transitionProject(project, "running", "开始执行");
  transitionProject(project, "paused", "等待确认");
  assert.equal(project.stateHistory.length, 2);
  assert.throws(() => transitionProject({ status: "draft" } as any, "succeeded"), /不允许/);
  assert(canTransitionNode("pending", "running"));
  assert(!canTransitionNode("pending", "done"));
  const node: any = { status: "pending" };
  transitionNode(node, "running");
  transitionNode(node, "waiting");
  transitionNode(node, "done");
  assert.equal(node.status, "done");
});

test("mock controls seed, step, fail, complete and reset a project", async (t) => {
  const f = await fixture(t);
  const created = await f.create();
  const call = (action: string) => f.request(`/projects/${created.id}/mock/${action}`, "POST", {});
  let current = await call("seed");
  assert.equal(current.status, 200);
  assert.equal(current.body.status, "paused");
  assert(current.body.stateHistory.length >= 1);
  current = await call("step");
  assert.equal(current.body.status, "paused");
  current = await call("fail");
  assert.equal(current.body.status, "failed");
  current = await call("reset");
  assert.equal(current.body.status, "draft");
  current = await call("complete");
  assert.equal(current.body.status, "succeeded");
  assert.equal(current.body.versions.at(-1).videoUrl, "/media/demo.mp4");
});
