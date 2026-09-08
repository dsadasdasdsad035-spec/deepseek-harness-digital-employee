## Why

数字员工今天只能从 Web 表面发起（`digital-employee-suite` 依赖 `web-app`），且单条消息跑完即停：没有无人值守入口，没有跨轮自主推进，失败无人知晓。部署侧 cron 需要 `dsh` 能以指定员工身份跑一个任务、跑到可判定的完成态、并在卡死时通知人类。

## What Changes

- 新增 headless 员工任务入口：`dsh --profile headless --employee <id> "task"`，组合员工核心（无 UI 行），任务文本自动 armed 为 goal objective，`goal-round-driver` 自动续轮直至 complete/blocked/budget-limited。
- 定义 headless 退出码契约：`0` = goal complete，`2` = blocked，`3` = budget-limited；cron/wrapper 依赖该契约决策重试与通知。
- 新增任务尝试台账：同一任务（员工 + 任务标识）的连续失败持久化计数；每次尝试开新 session 且员工 memory 记录失败原因（第 N 次尝试可看到前 N-1 次教训）；连续 3 次未 complete 后停止自动重试、置为挂起并通知。
- 新增 notification 能力缝：`ctx.notifications` Service Definition + generic-webhook、wechat-work-bot、feishu-bot 三个 Provider；渠道 URL/token 经 `ctx.credentials` 解析，绝不落在 cordis.yml。
- 值班式任务成功静默：完成不通知，仅 3 连败挂起时打扰人类；摘要留作后续工作。

## Capabilities

### New Capabilities

- `employee-headless-tasks`: headless CLI 以数字员工身份运行任务：员工组合入口、goal 自动 arm 与续轮、退出码契约、尝试台账与 3 连败挂起、成功静默策略。
- `notification-channels`: 通知能力缝：Service Definition、generic-webhook/wechat-work-bot/feishu-bot 三个 Provider、凭证解析与失败上报行为。

### Modified Capabilities

（无——`digital-employee-management` 的 `startChat` 行为不变；goal 域无现有 spec，续轮行为由 headless 入口侧组合产生。）

## Impact

- 新包：`packages/interaction/notification`（能力缝 + 三 provider）、headless 员工薄 bundle（`packages/bundle/headless-employee` 或并入 headless 的可选层）。
- 修改：`packages/boot/cmdline`（`--employee` 标志）、headless bundle 组合。
- 依赖既有：`dsh-goal`/`dsh-goal-round-driver`（续轮）、`dsh-digital-employee-agent`（createTask）、`dsh-credentials`（渠道凭证）、`dsh-digital-employee-file`（台账持久化宿主候选）。
- 部署侧不进仓库：crontab、防重叠锁、phase-1 wrapper 通知脚本。
