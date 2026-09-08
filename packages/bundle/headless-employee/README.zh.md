# `@deepseek-ai/dsh-headless-employee`

[English](README.md) | 中文

无人值守数字员工任务 bundle。[`cordis.patch.yml`](cordis.patch.yml) 叠加在 [`dsh-headless`](../headless/README.zh.md) 之上，插入员工核心（注册表、持久化文件存储、组合 agent、示例模板）、goal 自主三件套（[`dsh-goal`](../../goal/goal/README.zh.md)、轮次驱动器、模型侧工具）、通知通道（[`dsh-notification`](../../interaction/notification/README.zh.md) 及其三个 provider 插件），以及这个驱动器：`dsh --profile headless-employee --employee <id> "task"`。

普通 headless 启动 provider 解析 `--employee <id>` 与 `--task-key <key>`；选中员工后由 [`dsh-headless/employee`](../headless/src/employee-runner.ts) 接管运行，普通 runner 让位。驱动器组合员工的根 Agent（与 Web 表面相同的模板语义），把任务作为首条用户消息提交并附带一次有界的员工记忆检索，然后将任务文本 arm 为 goal，由轮次驱动器持续推进到终态。

退出码是给 cron 与 wrapper 的契约：`0` goal 完成、`2` 受阻、`3` 轮数预算耗尽、`1` 组合或用法失败。尝试以 `--task-key`（值班任务用稳定键）或"员工 + 任务文本"的哈希为键，计数落在 `$DSH_HOME/digital-employees/task-attempts.json`：每次尝试都是全新会话，失败原因会提升进员工记忆（下一次尝试的检索可以看到先前的教训）；任意一次完成即清零计数；达到配置上限（默认连续 3 次失败）后任务挂起——后续自动尝试以退出码 1 拒绝，直到人工恢复——并且在配置了 `notifyChannel` 时经该通道发送一条告警。成功运行不发送任何通知。

调度由部署侧自行驱动：crontab 加 `flock` wrapper 防止同键运行重叠；harness 内不保留定时器。通道凭证通过 credentials 服务从环境引用（`DSH_NOTIFY_FEISHU_URL`、`DSH_NOTIFY_FEISHU_SECRET`、`DSH_NOTIFY_WECOM_URL`、`DSH_NOTIFY_WEBHOOK_URL`）解析。

## Model Experience

### Goal 轮次

#### 模型可见内容

员工会话收到任务后，轮次驱动器在每次静默轮次后注入一条 goal 轮次提示，直到模型通过 goal 工具报告 `complete` 或 `blocked`，或轮数上限阻塞 goal。先前失败的尝试在员工记忆返回它们时经由检索浮现。

#### Token 影响

一组 goal 工具描述，加上每个续轮一条轮次提示；由 `maxGoalRounds`（默认 32）封顶。

#### KV Cache 影响

除员工自身的稳定前缀外无额外影响；goal 轮次作为普通用户面消息追加在保留历史之后。

## Known Limitations and Deferred Work

- **无专用 resume CLI** — 挂起任务以退出码 1 拒绝；恢复与放弃在 Web 任务控制台（`digitalEmployeeManagement` remote）中，人工也可直接编辑台账文件。
- **无成功摘要** — 值班任务的完成按设计保持静默；摘要通知推迟。
