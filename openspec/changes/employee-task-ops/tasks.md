## 1. digital-employee-file 台账子路径与摘要状态

- [ ] 1.1 `task-attempts.ts` 增加 `./task-attempts` 子路径导出（package.json exports/files + constraints 校验）
- [ ] 1.2 摘要状态事务：`withTaskDigest`（同锁模式）+ `recordTaskDigestSuccess` 纯函数（successes+1、窗口判定）+ `resetTaskDigest`；`internals.digestPath`
- [ ] 1.3 单元测试：子命令键序输出辅助、摘要窗口判定、失败保留状态、锁串行化

## 2. `dsh employee-task` 子命令

- [ ] 2.1 `args.ts` 增加 `EmployeeTaskInvocation` 与 commander 子命令（list / resume <key> / discard <key>）；`bin.ts` 分支先 `loadLayeredEnv` 再动态 import
- [ ] 2.2 `employee-task.ts` 运行器：三子命令实现（list 表格、resume/discard 锁内校验+写回）、退出码 0/1、用法输出
- [ ] 2.3 测试：args 解析（含 parent-options 拒绝）、临时 DSH_HOME 下三子命令端到端（含非法目标退出码 1、台账不变断言）

## 3. headless runner 成功摘要

- [ ] 3.1 Config 增加 `successDigestChannel` / `successDigestEveryHours`（默认 24h）；成功路径接入摘要事务与 `notifications.send`（`[digest]` 标题）；发送失败保留状态
- [ ] 3.2 挂载级测试：未配置零通知（默认静默回归）、窗口未到不发、到达发送并重置、发送失败保留累计
- [ ] 3.3 装配快照回归（employee-autonomous 三场景 replay）

## 4. 文档与门禁

- [ ] 4.1 README 双语：headless-employee（移除 resume CLI 限制、补摘要与 CLI 用法）、args 帮助示例
- [ ] 4.2 Agent Note（双语配对）
- [ ] 4.3 门禁：typecheck/lint/hygiene/doc-sync 全绿；相关包测试与快照 replay 全绿
