## 1. Notification 能力缝

- [x] 1.1 新建 `packages/interaction/notification`：Service Definition（`ctx.notifications.send` 契约、结果类型）、Config（渠道→凭证引用名映射、重试次数），按 capability seam 惯例注册
- [x] 1.2 实现 `generic-webhook` Provider：通用 JSON 载荷 POST，凭证经 `ctx.credentials.resolve`，缺失上报"未配置"
- [x] 1.3 实现 `wechat-work-bot` 与 `feishu-bot` Provider：各自机器人协议载荷与签名，非成功响应视为投递失败
- [x] 1.4 单元与契约测试：本地 HTTP 桩验证三渠道载荷格式、凭证解析失败、有限重试、失败不抛穿调用方

## 2. Headless 员工任务入口

- [x] 2.1 `packages/boot/cmdline` 加 `--employee <id>` 与 `--task-key <key>` 标志，转发给 headless 运行器；核对既有 headless 退出码语义并锁定 0/1/2/3 契约
- [x] 2.2 新建 `dsh-headless-employee-runner` 插件：解析员工、`createTask` 组合 root agent、任务文本 armed 为 goal（`maxGoalRounds` Config）
- [x] 2.3 终态→退出码映射：监听 goal 终态投影 + agent quiescence 双条件收尾，blockedReason 写 stderr；含收尾超时兜底
- [x] 2.4 新薄 bundle `packages/bundle/headless-employee`：base + 员工核心 + goal 三件套 + runner，无 UI 行；`verify-cordis-config` 通过

## 3. 尝试台账与挂起

- [x] 3.1 台账持久层：`$DSH_HOME/digital-employees/task-attempts.json` 原子写；任务键 = `--task-key` 或任务文本哈希
- [x] 3.2 尝试生命周期：每尝试新会话；blocked/budget 记台账 + 失败原因写员工 memory（host 权限路径）；complete 清零
- [x] 3.3 三连败挂起：第 3 次未 complete 置 `suspended`，同键启动直接拒绝（退出码 1 + 提示），经 notification 发告警（员工/任务键/失败原因摘要）
- [x] 3.4 keyless 快照测试：两次失败后第 3 次尝试的模型可见 memory 含前两次原因；挂起拒绝路径；成功静默（无通知事件）

## 4. 验证与文档

- [x] 4.2 部署文档：crontab + flock wrapper 示例、凭证环境变量清单、权限姿态推荐（`workspace-write` + `never`）—— 已写入 `packages/bundle/headless-employee/README.md` 的部署段落
- [x] 4.3 Agent Note（非平凡变更强制）：记录 seam 划分、退出码契约、台账语义与后续 resume/摘要的延后决策 —— `.agents/notes/implemented/feature/2026-09-07-employee-autonomous-tasks.md`
- [x] 4.1 端到端 headless 快照：`--employee` 跑通 arm→续轮→complete 退出 0；blocked 退出 2 的装配样例 —— `examples/headless-agent/tests/employee-autonomous.snapshot.ts`：keyless 装配快照（脚本化 mock 模型 + 真实 loader/员工组合/goal 续轮），三场景（complete 退 0、round-limit 退 3、3 连败挂起+通知），预期输出已提交，keyless replay 验证通过
- [x] 4.4 `pnpm run typecheck && pnpm run lint && pnpm run hygiene`，相关包测试与 `doc-sync` 通过 —— 三道门全绿：lint 0 错（清理约 250 个基线违规：自动修复 + 类型化重写 + 窄例外）、hygiene 13/13（版本号对齐、knip 配置/依赖清理、publint 全量构建后通过并过滤刻意的 client-CJS 权衡、notification 不变量接线）、doc-sync 28/28（JSDoc 补齐、builder-employee note 补 Alternatives、notification 子系统页 + 网站清单注册、翻译配对 1051 对一致）；typecheck 0 错，回归测试 138+3 全绿
