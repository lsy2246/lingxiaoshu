# 运维说明

## 启动与停止

环境要求：Node.js `>=22.19.0`、pnpm `11.19.0`。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

默认地址为 `http://127.0.0.1:4317`。可用 `PORT` 修改端口，用 `INTERVIEW_DB_PATH` 指定独立 SQLite 文件，用 `INTERVIEW_TENANT=tenant-a|tenant-b` 模拟服务端组织身份。停止服务使用 `Ctrl+C`，服务会关闭 SQLite 连接。

## 日志与告警

服务在请求异常时输出一行 JSON：

```json
{"event":"request_failed","path":"/api/tasks/...","error":"production_not_bound"}
```

需要关注：持续出现 `request_failed`、SQLite 打开失败、媒体文件 404，以及页面状态长期停留在 `waiting_external`。当前实现是单进程本地服务，没有外部日志采集或告警平台。

## 数据与备份

默认数据文件为 `data/interview.sqlite`，不应提交 Git。备份前停止服务，然后复制该 SQLite 文件；恢复时停止服务、替换文件并重新启动。恢复验证：

```sh
INTERVIEW_DB_PATH=/tmp/interview-restore.sqlite pnpm dev
curl http://127.0.0.1:4317/api/tasks
```

题目样例重置必须先停止服务：

```sh
pnpm reset
```

`pnpm reset` 只重置当前 `INTERVIEW_DB_PATH` 指向的本地 SQLite，不连接生产系统。

## 发布与回滚

发布前执行：

```sh
./node_modules/.bin/tsx --test test/*.test.ts
./node_modules/.bin/tsc --noEmit
git diff --check
```

发布内容是 Git 提交和锁文件；不要提交 `data/`、`.env*` 或 `node_modules/`。回滚到上一提交后重启服务；如果数据结构发生变化，先备份 SQLite，再按提交说明执行对应迁移或恢复备份。本版本没有关系表迁移，状态保存在单行 JSON 中。

## 故障注入验证

- 慢请求：页面地址加 `?delayMs=1500`，验证旧详情不会覆盖当前任务。
- 未绑定：打开 `task-unbound`，预期 HTTP 409 和“尚未绑定生产内容”。
- 越权：tenant-a 请求 `task-foreign`，预期 HTTP 404。
- 缺媒体：将测试数据库中的媒体 URL 指向不存在文件，页面应提示视频或音频暂不可用。
