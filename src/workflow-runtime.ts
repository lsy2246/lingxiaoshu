import { randomUUID } from "node:crypto";
import type {
  StudioNode,
  StudioProject,
  StudioOutput,
  StudioAsset,
  DigitalHuman,
} from "./contracts";
import {
  operationOf,
  inputIds,
  storyboard,
  VOICES,
} from "../public/workflow.js";

type Scope = Record<string, any>;
const badKeys = new Set(["__proto__", "constructor", "prototype"]);
function pathValue(scope: Scope, path: string): any {
  let value: any = scope;
  for (const key of path.split(".")) {
    if (badKeys.has(key) || value == null || !Object.hasOwn(value, key))
      throw Error("变量不存在：" + path);
    value = value[key];
  }
  return structuredClone(value);
}
export function resolveBindings(value: unknown, scope: Scope): any {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{([-\w]+(?:\.[-\w]+)*)\}\}$/);
    if (whole) return pathValue(scope, whole[1]);
    return value.replace(/\{\{([-\w]+(?:\.[-\w]+)*)\}\}/g, (_, path) => {
      const v = pathValue(scope, path);
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveBindings(v, scope));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        if (badKeys.has(k)) throw Error("不支持的变量字段");
        return [k, resolveBindings(v, scope)];
      }),
    );
  return value;
}
function requireArray(v: unknown, label: string): any[] {
  if (!Array.isArray(v) || v.length > 30)
    throw Error(label + "需要最多 30 项的数组");
  return v;
}
function requireText(v: unknown, label: string): string {
  if (typeof v !== "string") throw Error(label + "需要文本变量");
  return v;
}
function file(v: any, type: string): StudioAsset {
  if (
    !v ||
    typeof v.id !== "string" ||
    (type === "video"
      ? !["video", "avatar-video", "rough-cut", "final-video"].includes(v.type)
      : v.type !== type)
  )
    throw Error("需要" + type + "产物");
  return v;
}
function asset(
  type: string,
  refs: string[],
  extra: Partial<StudioAsset> = {},
): StudioAsset {
  return { id: "asset-" + randomUUID(), type, sourceIds: refs, ...extra };
}
function test(value: any, operator: string | undefined, compare: any): boolean {
  switch (operator) {
    case "contains":
      return typeof value === "string" && value.includes(String(compare));
    case "gt":
      return typeof value === "number" && value > Number(compare);
    case "truthy":
      return Boolean(value);
    default:
      return JSON.stringify(value) === JSON.stringify(compare);
  }
}
export function executeNode(
  node: StudioNode,
  p: StudioProject,
  human: DigitalHuman,
  scope: Scope,
): StudioOutput {
  const op = operationOf(node),
    settings = node.settings || {},
    sources = inputIds(node, p.nodes),
    inputs = resolveBindings(settings.bindings || {}, scope);
  const source = sources.map((id) => scope[id]).find(Boolean);
  const output: StudioOutput = {
    demo: true,
    type: op,
    summary: "",
    refs: sources,
    settings: structuredClone(settings),
    data: {},
  };
  const d = output.data!;
  switch (op) {
    case "input.collect":
      Object.assign(d, {
        topic: settings.values?.topic || p.topic,
        humanId: settings.values?.humanId || human.id,
        humanVersion: human.version,
        ratio: settings.values?.ratio || p.ratio,
        script: settings.values?.script || p.script,
        ...inputs,
      });
      break;
    case "storyboard.plan": {
      const topic = requireText(inputs.topic ?? source?.topic, "主题");
      output.scenes = structuredClone(
        settings.scenes ||
          storyboard(
            topic,
            inputs.script ?? source?.script ?? p.script,
            settings.text || inputs.text,
          ),
      );
      d.scenes = output.scenes;
      d.text = output.scenes.map((s) => s.dialogue).join("\n");
      output.text = d.text;
      break;
    }
    case "text.generate":
      d.text = resolveBindings(
        settings.text || inputs.value || node.prompt,
        scope,
      );
      output.text = requireText(d.text, "生成内容");
      break;
    case "json.transform": {
      const value = inputs.value ?? source;
      d.value = typeof value === "string" ? JSON.parse(value) : value;
      if (d.value === undefined) throw Error("请配置待转换 JSON");
      break;
    }
    case "review":
    case "select":
    case "edit":
      d.value =
        settings.approved && settings.confirmedValue !== undefined
          ? structuredClone(settings.confirmedValue)
          : (inputs.value ?? source);
      if (d.value === undefined) throw Error("缺少待确认内容");
      if (Array.isArray(d.value) && d.value[0]?.visual) output.scenes = d.value;
      break;
    case "if":
    case "switch": {
      const value = inputs.value ?? source;
      const branch =
        op === "switch"
          ? String(value)
          : test(value, settings.operator, settings.compare)
            ? "true"
            : "false";
      d.branch = branch;
      d.value =
        op === "switch"
          ? (settings.cases?.[branch] ?? inputs.default)
          : (inputs[branch] ?? value);
      break;
    }
    case "data.map": {
      const items = requireArray(inputs.items ?? source?.items, "映射输入");
      d.items = items.map((item) =>
        settings.field ? pathValue({ item }, "item." + settings.field) : item,
      );
      break;
    }
    case "data.filter": {
      const items = requireArray(inputs.items ?? source?.items, "筛选输入");
      d.items = items.filter((item) =>
        test(
          settings.field ? pathValue({ item }, "item." + settings.field) : item,
          settings.operator,
          settings.compare,
        ),
      );
      break;
    }
    case "data.merge":
      d.value = Object.assign(
        {},
        ...Object.values(inputs).map((v) => {
          if (!v || typeof v !== "object" || Array.isArray(v))
            throw Error("合并输入需要对象");
          return v;
        }),
      );
      break;
    case "forEach":
    case "batch":
    case "parallel.map": {
      const items = requireArray(
        inputs.items ?? source?.items ?? source?.scenes,
        "循环输入",
      );
      if (!settings.children?.length) throw Error("容器节点缺少子流程");
      output.iterations = [];
      d.items = [];
      for (const [index, item] of items.entries()) {
        const local: Scope = { ...scope, item, index },
          children = structuredClone(settings.children);
        for (const child of children) {
          child.status = "pending";
          delete child.output;
          delete child.result;
        }
        const remaining = new Set(children.map((c) => c.id));
        while (remaining.size) {
          const child = children.find(
            (c) =>
              remaining.has(c.id) &&
              inputIds(c, children).every((id) => Object.hasOwn(local, id)),
          );
          if (!child) throw Error("循环子流程存在未满足依赖");
          const gate = child.settings?.gate;
          if (
            (gate && local[gate.nodeId]?.branch !== gate.branch) ||
            inputIds(child, children).some((id) => local[id]?.skipped)
          ) {
            child.status = "skipped";
            local[child.id] = { skipped: true };
          } else {
            child.output = executeNode(
              child,
              { ...p, nodes: children },
              human,
              local,
            );
            child.status = "done";
            child.result = child.output.summary;
            local[child.id] = child.output.data;
          }
          remaining.delete(child.id);
        }
        const assets = children.flatMap((c) => c.output?.assets || []),
          video = assets
            .filter((a) => ["video", "avatar-video"].includes(a.type))
            .at(-1),
          audio = assets.find((a) => a.type === "audio");
        d.items.push({
          item,
          outputs: Object.fromEntries(children.map((c) => [c.id, local[c.id]])),
          video,
          audio,
        });
        output.iterations.push({ index, item, nodes: children });
      }
      output.assets = output.iterations.flatMap((i) =>
        i.nodes.flatMap((c) => c.output?.assets || []),
      );
      break;
    }
    case "wait": {
      const value = inputs.value ?? source;
      if (value === undefined) throw Error("等待节点缺少待传递数据");
      d.value = value;
      d.seconds = Math.max(0, Math.min(3600, Number(inputs.seconds) || 0));
      break;
    }
    case "image.generate": {
      const prompt = requireText(
        inputs.prompt ?? source?.text ?? node.prompt,
        "图片提示词",
      );
      const a = asset("image", [], {
        description: prompt,
        duration: Number(inputs.duration) || 5,
      });
      d.file = a;
      output.assets = [a];
      break;
    }
    case "video.generate": {
      const image = file(inputs.image ?? source?.file, "image");
      const a = asset("video", [image.id], {
        description: String(inputs.prompt ?? node.prompt),
        duration: Number(inputs.duration) || 5,
        url: "/media/demo.mp4",
      });
      d.file = a;
      output.assets = [a];
      break;
    }
    case "tts.generate": {
      const text = requireText(inputs.text ?? source?.text, "台词");
      const voiceId = settings.voiceId || "human";
      const voice =
        voiceId === "human"
          ? human.name + " · " + human.voice
          : VOICES.find((v) => v.id === voiceId)!.name;
      const a = asset("audio", [human.id + "@" + human.version], {
        text,
        description: voice,
        duration: (Number(inputs.duration) || 5) / (settings.speed || 1),
        url: "/media/demo.wav",
      });
      d.file = a;
      output.assets = [a];
      output.voice = voice;
      output.voiceId = voiceId;
      break;
    }
    case "avatar.lipsync": {
      const video = file(inputs.video, "video"),
        audio = file(inputs.audio, "audio");
      if (inputs.humanId !== human.id)
        throw Error("数字人变量与项目绑定不一致");
      const a = asset(
        "avatar-video",
        [video.id, audio.id, human.id + "@" + human.version],
        {
          duration: Math.max(video.duration || 0, audio.duration || 0),
          url: "/media/demo.mp4",
          description: human.name,
        },
      );
      d.file = a;
      output.assets = [a];
      break;
    }
    case "music.generate": {
      const a = asset("music", [], {
        description: node.prompt,
        url: "/media/demo.wav",
      });
      d.file = a;
      output.assets = [a];
      break;
    }
    case "timeline.compose": {
      const items = requireArray(inputs.items ?? source?.items, "时间线输入");
      let time = 0;
      output.timeline = items.map((entry, i) => {
        const video = file(entry.video, "video"),
          audio = file(entry.audio, "audio"),
          start = time;
        time += Math.max(video.duration || 0, audio.duration || 0);
        return {
          sceneId: entry.item?.id || "item-" + i,
          start,
          end: time,
          videoId: video.id,
          audioId: audio.id,
          dialogue: audio.text || "",
        };
      });
      const a = asset(
        "rough-cut",
        items.flatMap((e) => [e.video.id, e.audio.id]),
        { duration: time, url: "/media/demo.mp4" },
      );
      d.media = { ...a, timeline: output.timeline };
      output.assets = [a];
      output.sourceMediaId = a.id;
      break;
    }
    case "asr.subtitle": {
      const media = file(
        inputs.media ?? source?.media,
        "video",
      ) as StudioAsset & { timeline?: any[] };
      if (!media.timeline) throw Error("字幕识别需要带时间线的视频");
      output.cues = media.timeline
        .filter((c) => c.dialogue.trim())
        .map((c) => ({
          sceneId: c.sceneId,
          start: c.start,
          end: c.end,
          text: c.dialogue,
        }));
      output.sourceMediaId = media.id;
      d.subtitles = { sourceMediaId: media.id, cues: output.cues };
      output.assets = [
        asset("subtitles", [media.id], {
          text: output.cues.map((c) => c.text).join("\n"),
        }),
      ];
      break;
    }
    case "media.render": {
      const media = file(inputs.media, "video") as StudioAsset & {
        timeline?: any[];
      };
      if (inputs.subtitles && inputs.subtitles.sourceMediaId !== media.id)
        throw Error("字幕与视频来源不一致");
      output.timeline = media.timeline;
      output.cues = inputs.subtitles?.cues || [];
      output.format = String(inputs.ratio || p.ratio);
      output.sourceMediaId = media.id;
      const a = asset("final-video", [media.id], {
        duration: media.duration,
        url: "/media/demo.mp4",
      });
      d.media = { ...a, timeline: output.timeline, cues: output.cues };
      output.assets = [a];
      break;
    }
    case "output.video": {
      const v = file(inputs.value ?? source?.media, "video");
      d.value = v;
      output.assets = [v];
      break;
    }
    case "output.file": {
      const v = inputs.value ?? source?.file;
      if (!v?.id) throw Error("结束节点需要文件产物");
      d.value = v;
      output.assets = [v];
      break;
    }
    case "output.json":
      d.value = inputs.value ?? source;
      if (d.value === undefined) throw Error("结束节点缺少输出变量");
      break;
    default:
      throw Error("不支持的操作：" + op);
  }
  output.summary =
    (op === "forEach" || op === "batch" || op === "parallel.map"
      ? `${d.items.length} 项 · ${settings.children?.length} 个子节点 / 项`
      : op === "storyboard.plan"
        ? `${d.scenes.length} 个分镜`
        : op === "if" || op === "switch"
          ? `选择分支 ${d.branch}`
          : op) + " · 本地模拟";
  return output;
}
