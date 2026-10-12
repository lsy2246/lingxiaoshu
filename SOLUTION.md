# 交付说明

## 范围

本版本完成任务看板到生产详情的完整本地链路：任务状态投影、租户隔离、生产内容绑定、历史成片选择、编辑保存、媒体播放和 SQLite 持久化。外部生成服务仍由受控执行器模拟，视频和音频使用项目自带合成媒体。

## 修改前复现与根因

在修改前启动服务并读取基线数据，可以复现以下请求结果：

| 请求 | 修改前表现 | 根因 |
|---|---|---|
| `GET /api/tasks` | 所有卡片显示“未开始” | `src/projection.ts` 硬编码状态投影 |
| `GET /api/tasks/task-done/production` | 返回 `film-2/v2/run-2` | 详情读取总取最新 artifact |
| `GET /api/tasks/task-unbound/production` | 错误返回 `content-a` | 未绑定时回退 `state.contents[0]` |
| `GET /api/tasks/task-foreign/production` | tenant-a 可读 tenant-b 内容 | 读接口在租户校验前返回 |
| 快速切换详情 | 慢请求覆盖新选择 | 页面没有检查请求是否仍为当前请求 |

## 修复与取舍

1. `productionDetail` 要求生产绑定、内容租户一致，并按任务的 `artifactId`、`artifactVersion`、`runId` 精确选择产物；找不到时返回业务错误，不回退最新版。
2. 详情读接口和写接口统一先校验服务端租户身份；客户端提交的 `tenantId` 不参与授权。
3. `projectTask` 使用后端状态和 `taskNeedsAttention` 投影，未知状态显示“未知状态”，不会误显示为成功。
4. 页面使用请求序号和当前任务 ID 丢弃过期响应，并为刷新、打开、保存、执行和媒体加载提供可理解反馈。
5. 新建 pending 任务不创建 `runId`，执行成功时才写入真实运行记录。
6. 保留一行 JSON SQLite 存储和合成媒体，避免为面试题引入额外数据库或供应商依赖。

## 验证

```sh
./node_modules/.bin/tsx --test test/*.test.ts
./node_modules/.bin/tsc --noEmit
git diff --check
```

当前结果：13 个测试通过，类型检查通过。测试覆盖 HTTP 静态资源、任务创建/编辑/执行、SQLite 重开、事务回滚、历史产物、未绑定任务、跨租户访问、状态投影、审批/取消/未知状态、缺失媒体资源和页面慢响应竞态。

手工接口验证：

```sh
curl http://127.0.0.1:4317/api/tasks/task-done/production
curl -i http://127.0.0.1:4317/api/tasks/task-unbound/production
curl -i http://127.0.0.1:4317/api/tasks/task-foreign/production
```

预期分别为历史 `film-1/v1/run-1`、409 `production_not_bound` 和 404 `task_not_found`。

## 浏览器验收步骤

1. 启动 `pnpm dev`，打开 `http://127.0.0.1:4317/`。
2. 创建任务，刷新页面，确认任务仍存在；打开详情，编辑口播和分镜后保存。
3. 依次执行 running、缺授权、失败、成功，确认看板状态和阻塞原因变化；成功后确认视频和音频控件可播放。
4. 用 `?delayMs=1500` 打开页面，先点“视频制作”，立即点“历史成片交付”，最终详情必须保持后者。
5. 打开“未派发计划”，确认页面显示未绑定错误而不展示 `content-a`。
6. 执行 `pnpm reset` 后停止并重启服务，确认样例恢复；对编辑后的独立数据库重启，确认保存内容仍存在。

## 已知限制

- 没有接入真实视频供应商、鉴权系统或多进程数据库并发模型。
- 本仓库没有提交操作录屏；以上步骤是可直接执行的录制脚本，运行日志和测试结果是当前代码证据。
- 页面竞态测试使用最小 DOM/Fetch 沙箱执行 `public/app.js`，另外保留了手工浏览器步骤用于真实媒体播放和视觉验收。

## AI 使用说明

AI 用于代码阅读、缺陷定位、补丁实现、测试设计和验证命令编排；最终改动由维护者在本地检查、运行和确认。
