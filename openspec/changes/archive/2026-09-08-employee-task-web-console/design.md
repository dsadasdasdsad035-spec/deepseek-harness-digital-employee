## Context

自主任务的执行面（headless runner、台账、通知缝）已完成且门禁全绿。Web 侧现状：`ui-digital-employees` 有工作区与配置工作室，settings 生态有 `ui-permission-presets` 的 slot+controller 范本；host 侧 `digital-employee-management` 拥有员工文件读写与 Typert `@Remote` 面。进程模型：任务跑在 cron 拉起的 headless 进程，跑完即退；Web host 与之共享的落点只有台账 JSON 与 durable session。

关键约束：@Remote 新方法需要 gateway spec + typert regen（仓库既定流程）；"模型可见 ⟺ 已记录"不触及（本变更是纯产品面）；测试政策要求 keyless 快照走真实装配。

## Goals / Non-Goals

**Goals:**

- 挂起任务的可见性与恢复/放弃闭环，全部经 host remote 单一写路径。
- 台账并发写安全：runner 与 Web host 共享带锁事务。
- 通知渠道的配置可见性 + 测试发送（复用生产 send）。
- UI 全部走既有 slot/controller/remote 模式，零新机制。

**Non-Goals:**

- 会话回放/任务历史时序视图（二期）。
- "立即重试"（Web host 拉起任务进程）——调度职责留在部署侧。
- 成功摘要通知。

## Decisions

### D1：台账读-改-写迁入 `withFileLock`

现状 `writeLedger` 是 temp+rename 原子写，读-改-写无跨进程互斥；Web host 成为第二个写者后必须串行化。`dsh-atomic-write` 的 `withFileLock` 已被 hooks-market service 用于同型文件。迁移：ledger 的 read→mutate→write 收进一把 `withFileLock(path, async () => …)`；runner 的失败计数/挂起写与 host 的恢复/放弃写走同一入口。锁文件伴生路径（`.lock`）随台账生命周期，README 注明。备选（进程内内存锁）被否：跨进程无效；备选（host 独占写、runner 经 IPC 上报）被否：headless 进程必须独立于 Web host 存在。

### D2：台账宿主与管理 remote 放 `digital-employee-management`

台账已落在 `$DSH_HOME/digital-employees/` 员工数据区；management host 已持该区文件读写与 `@Remote` 面。新增三个 remote：`listEmployeeTasks`（只读折叠，含 displayName 回退）、`resumeEmployeeTask(key)`、`discardEmployeeTask(key)`。恢复语义 = 清 `suspended` 保计数（下轮失败重新达上限会再挂起，构成天然的"再给三次机会"）。放弃 = 删记录。两者都先读校验目标态再在锁内写回；非挂起键恢复返回结构化错误。runner 侧的 `readLedger/writeLedger` 纯函数保留，套上锁的事务助手放 management（或提取到 `digital-employee-file` 若 runner 也需引用——倾向前者，避免 examples 对 file 包的新依赖）。

### D3：`displayName` 写入点在 runner

台账记录加可选 `displayName`：runner 落账时写 `--task-key` 场景的任务文本截断（80 字符）。旧记录无字段 → 列表回退显示 `(legacy)` 或截断键名。不回填迁移（pre-release 立场：后端拒绝旧格式，台账无兼容承诺）——但列表读侧做宽容回退，因为台账是跨进程共享运行数据而非 on-disk 协议。

### D4：UI 任务视图进 `DigitalEmployeeWorkspace`

工作区加"任务"区块（非新顶层页）：数据 = `listEmployeeTasks` 按 `employeeId` 过滤（台账记录补 `employeeId` 字段——runner 已知，落账写入）。行内动作按钮 → remote 调用 → 行状态更新；错误走界面 banner。挂起行视觉标记（红点/边）与失败计数并列。不引入轮询：进入视图与动作后刷新（快照断言这两态即可）。

### D5：通知设置行照 PermissionRow 模式

`ui-digital-employees`（或独立小组件）注册 `settings.general.item` slot：描述态 = 三渠道凭证 describe 结果（`credentials` remote 面已有 describe 通路则直用，无则在 management host 加只读 remote `describeNotificationChannels` 转发 describe——倾向后者，因 client 不宜直连 credentials 面）；动作态 = 测试发送。测试发送路径：UI → management host remote `testNotificationChannel(channel)` → `ctx.notifications.send`（标题 `[test] <channel>`，body 说明这是设置页测试）→ 结果回传。渠道注册表本身从 bundle 组合固定为三内置渠道，不做成动态清单（本期）。

### D6：@Remote 与 typert 流程

新增 5 个 remote（list/resume/discard + describeChannels/testChannel）按既定流程：gateway spec 更新 → `pnpm run gen-*` typert 再生成 → client 契约类型随生成更新。不做手写 client stub。

### D7：测试策略

- host 单测：台账锁事务（并发 resume/count 模拟）、displayName 回退、恢复校验错误。
- client 契约测试：设置行状态渲染、测试发送按钮通路（notifications 用 fixture channel）。
- 装配快照：挂起 → 恢复 → 列表刷新；测试发送成功/凭证缺失两态。复用 `employee-autonomous.snapshot.ts` 的 fixture 骨架（seed 台账 + fixture channel 已有）。

## Risks / Trade-offs

- [锁文件残留] → `withFileLock` 的释放在 finally；残留 `.lock` 不影响下次获取（锁语义由该库保证）。
- [台账 schema 演进 vs 运行数据宽容读] → 读侧只对 `displayName/employeeId` 宽容，其余字段校验失败整表报错（不静默吞）。
- [UI 无轮询导致状态滞后] → 本期接受（进入视图/动作后刷新）；轮询/推送留给二期任务历史。
- [测试发送打扰真实群] → 标题强制 `[test]` 前缀 + body 明示；这是产品取舍，写入 README。

## Migration Plan

纯新增 remote + UI；台账读写迁锁是 runner 内部重构（同文件格式）。回滚 = 移除 UI 行与 remote。

## Open Questions

- 设置行的归属包（`ui-digital-employees` 内 vs 独立小组件）——实现时按 settings slot 注册成本定。
- `discard` 是否需要确认弹窗文案 i18n（本期固定双语二选一，照 PermissionRow confirm 模式）。
