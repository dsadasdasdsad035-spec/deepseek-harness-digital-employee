# Agent Note: 员工自主任务（headless 入口、退出码契约、尝试台账、通知 seam）

状态：已实现

[English](2026-09-07-employee-autonomous-tasks.md) | 中文

## 问题

数字员工只能从 Web 表面启动，跑一条消息到静默即止，没有无人值守路径：部署侧 cron 没有员工感知的 CLI 入口，没有机器可读的终态，没有重试策略，任务连续失败时也无法告知人类。

## 决策

四个新增组成无人值守路径。(1) headless 启动 provider 解析 `--employee <id>` 与 `--task-key <key>`；选中员工后由 `@deepseek-ai/dsh-headless/employee` 接管运行，普通 runner 让位。驱动器经 `digitalEmployeeAgent.createTask` 组合员工根 Agent（首条用户消息加有界记忆检索），然后把任务文本 arm 为 goal——`goals.create` 自动 armed——续轮由既有轮次驱动器接管。(2) 退出码是给 cron 的契约：0 goal 完成、2 受阻、3 轮数预算耗尽、1 组合/用法/挂起；`round-limit` 是轮次驱动器自己的 blocked code，独占一个退出码。(3) 尝试以 `--task-key` 或"员工+任务文本"哈希为键，计数落在 `$DSH_HOME/digital-employees/task-attempts.json`（temp+rename 原子写）：每次尝试全新会话，失败原因提升进员工记忆使下一次尝试的检索可见先前教训，完成即清零，达到上限（默认 3）即挂起——后续自动尝试以退出码 1 拒绝——并在配置了 `notifyChannel` 时发送一条告警。挂起是台账状态而非 goal `paused`：goal 只活在单个会话内，台账是唯一跨尝试的家。(4) `@deepseek-ai/dsh-notification` 是通道注册表式 seam，`send()` 永不 reject（未知通道或抛异常通道 → 可见失败结果）。三个 provider 共享一条 webhook 管道（经 `ctx.credentials` 解析凭证、有界重试、单次超时），各带方言化的请求/响应判定；企业微信群机器人仅凭 URL key 鉴权（平台不为这类机器人定义请求签名——已对照官方文档核实），飞书自定义机器人以 `timestamp\nsecret` 为 key、对空数据做 HMAC-SHA256 签名。通道 URL/secret 只存在于凭证引用，绝不进 cordis.yml。

调度按决策留在部署侧：crontab 加 `flock` 负责时机与重叠；harness 内不保留定时器。无人值守推荐姿态是 `workspace-write` + `never`——越界操作确定性失败，而不是阻塞在无人应答的提示上。

## 已否决的备选方案

- **把员工套件拆成 Web 与 headless 复用的共享核心层** —— 长期更干净，但会搅动已发布的 bundle；薄 `dsh-headless-employee` bundle 叠在 `dsh-headless` 上，不动 Web 组合就补齐了表面。Web 侧若要 goal 轮次再重评估。
- **用会话续跑或 goal `paused` 计数重试** —— 否决：cron 每次起新进程，goal 生命周期按构造只在单会话内。
- **harness 内置 cron 触发器** —— 完全推迟；ACP 已服务程序化启动，harness 内 cron 会增加部署侧本已拥有的定时器/生命周期面。

## 后果

组装级 keyless 快照（`examples/headless-agent/tests/employee-autonomous.snapshot.ts`）在真实装配内以脚本化 mock 模型覆盖无人值守全路径：complete→退 0 且台账清零静默、round-limit→退 3 且记录失败、第 3 次失败挂起并发渠道告警。挂载式插件测试单独覆盖驱动器逻辑，startup 解析在真实 Loader 树上覆盖。`dsh employee-task resume` 命令与值班成功摘要推迟。台账是单个原子写 JSON 文件：同键并发运行需要部署侧加锁。已归档 market change 遗留的门禁失败（examples/package.json 四个未声明依赖、host 聚合缺两个 project reference）顺带修复，因为 `verify-cordis-config` 阻塞了后续所有变更。
