## Why

数字员工自主任务（`employee-autonomous-tasks`）落地后是纯 headless 面：任务挂起只能手删 `$DSH_HOME` 下的台账 JSON，通知渠道只能改 cordis.yml overlay，Web 用户对"员工在自动跑什么、什么卡住了"完全不可见。管理闭环断在两处：挂起后的恢复动作、通知渠道的配置与验证。

## What Changes

- 挂起任务中心：员工管理 host 新增台账只读 remote（列出挂起/失败计数/最近原因）与恢复 remote（清除挂起态，下个调度周期由 cron 自然拉起）；UI 在数字员工工作区新增任务视图，挂起任务提供恢复/放弃动作。
- 台账并发安全迁移：`task-attempts.json` 的读-改-写整体迁入 `withFileLock` 带锁存储，headless runner 与 Web host 恢复写路径共用同一锁语义；台账记录增加 `displayName` 字段（旧记录缺字段时回退截断的任务文本）。
- 通知渠道设置行：通用设置新增"通知"行，展示三渠道（feishu-bot / wechat-work-bot / generic-webhook）的凭证配置状态（经 `ctx.credentials.describe`，绝不显示值），每渠道提供"发送测试消息"动作走真实 `notifications.send`。
- Web 侧渲染遵循既有模式：恢复/放弃按钮走 host remote（与 `/permission` 命令行同构的单一写路径），设置行照 `ui-permission-presets` 的 settings slot + controller 模式。

### 非目标（后续独立 change）

- 任务历史的会话回放（加载非本进程创建的 durable session 并渲染 goal 轮次）。
- "立即重试"按钮（从 Web host 拉 headless 进程）——调度职责保留在部署侧 cron。
- 值班式成功摘要通知。

## Capabilities

### New Capabilities

- `employee-task-console`: 挂起任务中心的 host 数据面与 UI：台账列表 remote、恢复/放弃 remote、员工工作区任务视图、`displayName` 兼容语义。
- `notification-channel-settings`: 通知渠道的设置面：渠道状态描述、测试发送动作、凭证状态展示（不露值）。

### Modified Capabilities

（无——台账锁迁移是 `employee-headless-tasks` 内部实现变化，其规格中的持久化要求不变；`notification-channels` 规格的 `send` 契约不变。）

## Impact

- 修改：`packages/host/digital-employee-management`（新 `@Remote` 方法 + gateway spec + typert regen）、`packages/bundle/headless/src/employee-runner.ts`（台账写迁锁、记录 `displayName`）、`packages/client/ui-digital-employees`（任务视图）、新 UI 设置行（并入 `ui-settings-general` 生态或 `ui-digital-employees` 内）。
- 复用：`dsh-atomic-write` 的 `withFileLock`、`ui-permission-presets` 的 settings controller 模式、`notifications.send` 测试通路。
- 快照：UI 行为走 client 契约测试 + 装配快照（挂起列表→恢复→台账清挂起）。
