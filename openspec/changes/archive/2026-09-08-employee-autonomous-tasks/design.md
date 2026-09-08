## Context

自主循环基建已存在但未接入员工：`dsh-goal`/`dsh-goal-round-driver`（armed goal 自动续轮）、`tool-ralph`、`dsh-digital-employee-agent`（`createTask` 组合员工 root agent）、`dsh-credentials`（env/.env 凭证）。缺口有三：`digital-employee-suite` 只组合在 Web 表面（要求 `web-app`）；goal 的 arm 入口只有人工命令 `/goal`；无通知能力缝。无人值守权限姿态（`workspace-write` + `never`）与 durable session/replay 已就绪。

约束：不修改 `agent-loop`（插件而非循环改动）；capability seam 三角色齐全（Service Definition / Provider / Consumer）；插件无硬编码可调项（Config 字段可从 cordis.yml 改）；凭证不入 cordis.yml；keyless 快照测试覆盖产品可见行为。

## Goals / Non-Goals

**Goals:**

- `dsh --profile headless --employee <id> "task"` 一条命令跑完一个员工任务并给出可判定退出码。
- 任务自动 armed 为 goal，续轮、终态判定全部无人参与。
- 尝试台账跨进程持久（cron 每次起新进程），3 连败挂起 + 通知，成功清零、成功静默。
- notification 能力缝 + 三渠道 Provider，凭证经 `ctx.credentials`。

**Non-Goals:**

- 部署侧 cron/wrapper/防重叠锁（不进仓库）。
- 值班式成功摘要通知（后续工作）。
- 第二员工复核验收（模型自评，钩子保留）。
- 成本（token/费用）维度熔断；仅轮数上限沿用 goal 域 `maxGoalRounds`。

## Decisions

### D1：headless 员工组合 = 新薄 bundle，不动 `digital-employee-suite`

新 bundle（`packages/bundle/headless-employee`）组合 base + `dsh-digital-employees` + `digital-employee-file` + `digital-employee-agent` + goal 三件套，不组合 `digital-employee-management`（Web 表面宿主）与任何 `ui-*` 行。备选是让 `digital-employee-suite` 拆出 core 层被两个表面复用——更干净但牵动已发布 bundle 结构；pre-release 立场下先薄 bundle，若 Web 侧也要 goal 再提取共享层。

### D2：`--employee` 在 cmdline 解析，入口逻辑在插件

`packages/boot/cmdline` 只加标志与转发；arm/台账/退出码逻辑放一个新插件（`dsh-headless-employee-runner`），经 `ctx` 服务组合完成。这样 headless 入口是插件的 Consumer 而非 CLI 内嵌逻辑，符合"行为在插件、loop 不动"。

### D3：自动 arm = 会话创建监听，非 `/goal` 命令复用

runner 在 `createTask` 返回的 root agent 上直接调 `ctx.goals.create + arm`（objective = 任务文本，`maxGoalRounds` 取 Config）。不复用 `/goal` 命令路径：命令面向交互式会话，arm 时机与错误文案不同；goal 服务 API 已是公共面。round driver 按现有 armed 语义自动续轮，无新驱动逻辑。

### D4：退出码映射在 runner 的进程收尾

goal 终态 → 退出码（complete 0 / blocked 2 / budget-limited 3 / 组合失败 1）。runner 监听 goal 投影终态或 agent quiescence 判定结束，把终态写入进程退出。blockedReason 进 stderr 供 wrapper 记录。

### D5：台账持久化在 `digital-employee-file` 同宿主新文件，任务键 = 员工 id + 调用方提供任务键

台账 JSON 文件放 `$DSH_HOME/digital-employees/task-attempts.json`（同宿主、同持久语义）。任务键：`--task-key <key>` 可选标志 + 命令行任务文本哈希兜底——cron 值班任务显式传稳定 key，一次性任务用文本哈希自动成键。备选：每任务独立 session 续跑计数——被否，cron 每次新进程，跨进程需独立持久层，且"3 次全新尝试"语义本来就不要同一会话。

失败原因写员工 memory 用现有 memory 记录路径（`digitalEmployees` 记录接口），第 N 次尝试 `createTask` 的 memory 查询自然带回前 N-1 次教训。

### D6：3 连败挂起 = 台账态机，非 goal pause 复用

挂起是台账层状态（`suspended`），不是 goal 的 paused：goal 生命周期在一次会话内，挂起跨会话。挂起后 runner 对同键任务直接拒绝启动（退出码 1 + 提示 resume），resume 是后续 `dsh employee-task resume <key>` 命令（本期做拒绝，resume 命令进 tasks 但优先级最低）。

### D7：notification 缝 = Service Definition + 三 Provider + runner 为 Consumer

`ctx.notifications.send({ channel, title, body, context })`。Provider 经 `fetch` POST：generic-webhook（通用 JSON）、wechat-work-bot（企微机器人协议）、feishu-bot（飞书协议 + 签名）。凭证：Config 存渠道→凭证引用名映射，值经 `ctx.credentials.resolve`。有限重试（Config 可调，默认 2 次），失败返回结果并 log warn，不抛穿调用方。触发点本期仅一处：runner 3 连败挂起时。

### D8：无人值守权限姿态 = 部署配置，非代码强制

headless bundle 的 sandbox 默认与 base 一致（`DSH_PERMISSION_MODE` 可调）；文档示例推荐 `workspace-write` + `never`。不强制 full-access：越界操作确定性失败（escalation 被 never 拒绝）正是无人值守的正确失败方式。

## Risks / Trade-offs

- [cron 每次新进程，DSH_HOME 台账并发写] → 台账文件写用原子写（temp + rename）；同任务键并发由部署侧 flock 防（文档写明）；harness 内不做锁。
- [goal 终态判定与进程退出竞态] → runner 等待 round driver 整体 quiescence + goal 终态投影，双条件都满足才退出；超时兜底 Config。
- [memory 失败记录被员工模板的 memory 权限挡住] → 失败记录走管理侧写入路径（runner 持有 host 权限），读取沿用员工 memory 投影权限；快照测试覆盖"第 3 次尝试可见前两次原因"。
- [通知渠道协议变动（飞书/企微签名）] → Provider 独立包内实现，协议细节集中一处；契约测试用本地 HTTP 桩，不打真实端点。
- [退出码 2/3 与既有 headless 退出码冲突] → 实现前核对 `headless-runner` 既有退出码语义，冲突则换码位并写进契约测试。

## Migration Plan

纯新增（新 bundle、新插件、cmdline 加标志），无既有格式迁移。回滚 = 移除 bundle/标志。首期部署文档给 crontab + flock wrapper + 凭证环境变量示例。

## Open Questions

- `dsh employee-task resume` 命令的交互形态（本期仅实现挂起拒绝，命令骨架可后定）。
- 通知消息的正文模板是否需要 i18n（本期固定中文/英文单选 Config，后续按需）。
