## Context

台账锁事务（`withTaskAttempts`）已在 `digital-employee-file` 落地并被 runner 与 Web host 共用；apps/cli 已有 `plugin`/`web`/`dump-config` 三种免引导子命令先例（commander 子命令 + bin 动态 dispatch + 独立 runner 文件返回退出码）。成功摘要的唯一新状态是"窗口计数 + 上次发送时间"，与台账同宿主、同锁模式。

## Goals / Non-Goals

**Goals:** 免引导 CLI 三子命令；opt-in 聚合摘要（默认静默不变）；全部写经既有锁事务。
**Non-Goals:** 会话回放、成本熔断、Web 端摘要配置 UI（走 cordis.yml/overlay）。

## Decisions

### D1：CLI 直接 import `digital-employee-file` 的台账模块
该模块仅依赖 fs + atomic-write + home-paths，无 harness 服务。通过新子路径导出 `@deepseek-ai/dsh-digital-employee-file/task-attempts` 暴露（root 会拖入 provider 依赖链）。apps/cli 增加该 workspace 依赖；bin 在 employee-task 分支先 `loadLayeredEnv('dsh')` 再动态 import（与 profile 模式一致，保证 `.env` 里的 `DSH_HOME` 生效）。

### D2：命令解析与退出码
`employee-task` 子命令内建独立 commander：`list`、`resume <key>`、`discard <key>`；未知子命令/缺参数 → 用法信息 + 退出码 1；非法目标（未知键、resume 非挂起键）→ stderr 明确错误 + 退出码 1，台账不变。输出为人类可读表格行（不追求机器格式，本期非目标）。

### D3：摘要状态 = 独立 sidecar `task-digest.json`
同宿主同锁模式（`withFileLock` + atomic write），结构 `{ successes, lastSentAt? }`。成功路径：successes+1 → 若配置了渠道且 (now - lastSentAt) ≥ 间隔 且 successes > 0 → send → 成功后写 `{ successes: 0, lastSentAt: now }`；发送失败不写状态（下次成功重试）。未配置渠道时零写零发（默认静默不变）。摘要通知经 `notifyChannel` 同一 `notifications.send` 通路，标题 `[digest]`。

### D4：不新增 invariant companion
摘要状态无会话事件、无跨调用可变注册态；`digital-employee-file` 既有 no-runtime-invariant companion 说明已覆盖（任务台账与摘要同性质）。

## Risks / Trade-offs

- [CLI 与 runner 的 DSH_HOME 不一致导致改错文件] → 两者都只认 `resolveDshHome()`；文档强调子命令沿用同一环境变量。
- [摘要与挂起告警同渠道造成混淆] → 摘要标题强制 `[digest]`、告警无前缀；README 写明。
- [命令表输出宽屏换行] → 仅打印必要列，长原因截断到 60 字符。

## Migration Plan

纯新增（子命令、Config 字段、状态文件），无格式迁移；回滚 = 移除。
