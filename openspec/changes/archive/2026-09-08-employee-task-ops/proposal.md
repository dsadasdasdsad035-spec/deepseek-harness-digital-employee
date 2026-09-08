## Why

自主任务的两个收尾项仍缺：挂起任务在服务器/无 Web 环境下只能手改 JSON（Web 控制台不总是可达）；值班式任务按规格完全静默，长时间无人值守时用户无法感知"它还在正常干活"。

## What Changes

- 新增 `dsh employee-task` 免引导 CLI 子命令：`list`（台账表格）、`resume <key>`（清挂起保计数）、`discard <key>`（删记录），直连 `digital-employee-file` 的带锁台账事务，无需 booted harness；未知键/非挂起键以非零退出码与明确错误失败。
- headless 员工驱动新增 opt-in 成功摘要：`successDigestChannel` + `successDigestEveryHours`（默认 24h）。配置后，成功运行累计并在间隔到达时经通知渠道发送一条聚合摘要（"N successful run(s) since …"）；未配置时行为不变（完全静默）。摘要状态存于同宿主的 `task-digest.json`，经同一文件锁事务读写；发送失败时保留计数，下次成功重试。
- 注意：`dsh employee-task` 不需要 `--profile`（免引导）；`--home` 不做（沿用 `DSH_HOME` 环境变量语义，与其他命令一致）。

### 非目标

- 会话回放/任务历史时序视图（独立设计）。
- 成本维度熔断。
- `dsh employee-task` 对 Web host 的写路径无影响（同一锁，两写者语义不变）。

## Capabilities

### New Capabilities

- `employee-task-cli`: 免引导台账管理子命令：list/resume/discard 的行为、退出码契约、与同一锁事务的一致性。

### Modified Capabilities

- `employee-headless-tasks`: 成功静默要求改为"默认静默 + opt-in 聚合摘要"；挂起告警行为不变。

## Impact

- 修改：`packages/core/digital-employee-file`（新增 `./task-attempts` 子路径导出 + 摘要状态存储）、`packages/bundle/headless/src/employee-runner.ts`（摘要逻辑与 Config）、`apps/cli`（子命令解析与运行器）。
- 新增测试：file 包摘要事务测试、apps/cli 子命令测试（临时 DSH_HOME）、runner 摘要触发测试。
- 文档：headless-employee README（移除 resume CLI 限制，补摘要说明）、Agent Note。
