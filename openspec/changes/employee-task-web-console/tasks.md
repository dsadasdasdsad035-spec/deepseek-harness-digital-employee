## 1. 台账锁事务与记录扩展

- [x] 1.1 台账读-改-写迁入 `withFileLock`：`employee-runner.ts` 的事务助手化（read→mutate→write 单锁），runner 三处写（清零/计数挂起/预置）走锁；host 复用同一助手（提取位置按 design D2）
- [x] 1.2 台账记录加 `displayName`（截断 80 字符）与 `employeeId` 字段：runner 落账写入；`readLedger` 读侧宽容回退
- [x] 1.3 host 单测：并发 resume/count 串行化、旧记录回退、恢复校验错误路径

## 2. Management host remote 面

- [x] 2.1 `listEmployeeTasks` / `resumeEmployeeTask` / `discardEmployeeTask` 三个 `@Remote`：锁内校验+写回，结构化错误（非挂起键恢复、未知键放弃）
- [x] 2.2 `describeNotificationChannels` / `testNotificationChannel` 两个 `@Remote`：describe 转发（不含值）、测试发送经 `ctx.notifications.send`（`[test]` 标题）
- [x] 2.3 gateway spec 更新 + typert 再生成 + host 单测（remote 契约、fixture channel 测试发送两态）

## 3. UI 任务视图

- [x] 3.1 工作区任务区块：`listEmployeeTasks` 过滤本员工，挂起行标记 + 失败计数 + 显示名；进入视图与动作后刷新
- [x] 3.2 恢复/放弃动作：remote 调用 + 行状态更新 + 错误 banner；放弃走 PermissionRow 同款确认弹窗
- [x] 3.3 client 契约测试：列表渲染（含 legacy 回退）、恢复成功/失败两态

## 4. 通知设置行

- [x] 4.1 `settings.general.item` 通知行：三渠道凭证状态（describe 转发），能力缺失隐藏
- [x] 4.2 测试发送按钮：remote 通路 + 成功/失败反馈（含凭证缺失态）
- [x] 4.3 client 契约测试 + 双语 locale

## 5. 端到端与文档

- [x] 5.1 装配快照：挂起 → 恢复 → 列表刷新；测试发送成功/凭证缺失（复用 employee-autonomous fixture 骨架）—— fixture 组合真实 management 网关 + storage/persistence/workspace 栈，suspend 场景 driver 串 列表→恢复→列表→测试发送 三态，replay 3/3
- [x] 5.2 README/doc-sync：management、ui 包 README 双语；capability-seams/config-catalog 若触及再生成；Agent Note
- [x] 5.3 门禁：typecheck/lint/hygiene/doc-sync 全绿；相关包 vitest 全绿
