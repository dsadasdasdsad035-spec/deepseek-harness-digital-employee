# @deepseek-ai/dsh-host-company-group-chat

[English](README.md) | 中文

基于 agent loop 基座的每公司工作群：每公司一个带 Lead 根代理的群会话，成员由公司绑定实时派生，员工为常驻 continuable 成员会话。用户消息走标准 `session.prompt` 通道进入 Lead；确定性的 `agent/pre-step` 路由把它落为 `company-group/message` 事件、为每个 `@显示名` 提及排入 `company-group/turn-queued` 投递，并零模型调用结束回合。每个（公司, 员工）二元组拥有一个持久成员会话（`session-group-member-<companyId>-<employeeId>`，`origin: 'subagent'`，不进侧栏），经 `digitalEmployeeAgent` 按该员工完整组装创建或恢复，新建与冷恢复都会按 `memberMemoryProjectionLimit`（默认 5，范围 1-50）投影该成员最近的长期记忆；投递注入情境与有界群近况快照，以普通 loop 回合运行（工具、流式块、可取消），最终发言以员工名义回写群消息。网关尾随 headless 驱动追加的任务生命周期日志（`task-events.jsonl`，经 `@deepseek-ai/dsh-digital-employee-file/task-events`），把 领到任务 / 完成 / 失败 事实转入同一队列，按日志游标去重（`dedupKey: task:<seq>`）；失败、超时（取消）或成员离队的投递以确定性一句话收尾。队列本身持久——`company-group/turn-delivered` 事件结算排队项，宿主重启重放「已排队未完成」。该命名空间同时承载 `cancelCompanyGroupTurn`、只读 `listCompanyGroupMembers`（某公司当前绑定成员名单，解析时不打开群会话、不触碰持久化；供客户端 `@` 提及选择器使用，与路由器名单一致），以及持久 presence remotes：`reportEmployeeVisit`/`employeePresence` 写读每员工封顶的功能区到访史（`whereabouts.json`），证明实例跨刷新的连续存在。

## Model Experience

无。本网关只做提及路由并把成员发言引用进群会话；员工模型调用运行在 continuable 成员会话中。

#### KV Cache effect

每次投递都重入同一成员会话，员工组装（缓存重的前缀）与该成员自身历史跨轮保持热态；逐投递的前缀增长仅为情境与有界群快照。

## Known Limitations and Deferred Work

- **无员工间接龙** —— 播报不引发同事回应；同事只在任务事件触发或用户 @提及时发言。
- **触发为轮询** —— 生命周期日志每 `pollIntervalMs`（默认 5 秒）尾随一次；完成播报最多滞后一个间隔。
- **无群管理界面** —— 群在首次打开或首次播报时创建；成员随绑定变化，无手动邀请。
