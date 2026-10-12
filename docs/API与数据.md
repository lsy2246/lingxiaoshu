# API与数据

所有地址相对于 http://127.0.0.1:4317 。当前模拟身份由服务端INTERVIEW_TENANT确定，默认为tenant-a，客户端tenantId不授权。所有操作只影响本题SQLite。

| 方法与地址 | 输入 | 输出/用途 |
|---|---|---|
| GET /api/session | 无 | 当前模拟组织 |
| GET /api/tasks | 无 | 当前组织任务，带展示状态 |
| POST /api/tasks | {"title":"新联调任务"} | 201，新任务和对应内容一起持久化 |
| GET /api/tasks/:id/production | 可选delayMs=1500，最大2000 | task、content、artifact；读取绑定待修 |
| PUT /api/tasks/:id/content | {"narration":"新口播","scenes":[{"id":"scene-1","description":"新分镜"}]} | 保存内容，媒体为受控本地文件 |
| POST /api/tasks/:id/execute | {"mode":"running"}，或missing_authorization、failure、success | 更新真实记录；success追加产物版本 |

Task.id是业务任务，productionTaskId关联Content.taskId，runId表示执行，artifactId+artifactVersion表示交付。Content当前runId会变化；Artifact自己的runId不会变化。不能把当前运行误当历史交付的运行。

样例：task-done固定对应content-a/run-1/film-1/v1；content-a当前已是run-2并另有film-2/v2。task-unbound无productionTaskId。task-foreign属于tenant-b。对不存在、未绑定、越权、缺原产物等情况请自行选择合理HTTP语义并在交付说明中记录。

SQLite使用一行JSON保存精简业务状态，事务确保单次更新原子性；不是完整生产数据库设计。候选人可按需改为关系表，避免扩大范围。成功执行不会生成新的视频字节，只追加使用合成媒体的独立运行和产物记录。需验证实际播放而非仅显示URL。
