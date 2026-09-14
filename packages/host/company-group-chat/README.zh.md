# @deepseek-ai/dsh-host-company-group-chat

[English](README.md) | 中文

基于既有缝的每公司工作群：每公司一个事件组装的群会话（带说话人标注的 `company-group/message` 事件），成员由公司绑定实时派生，员工人设化播报任务动态。网关尾随 headless 驱动追加的任务生命周期日志（`task-events.jsonl`，经 `@deepseek-ai/dsh-digital-employee-file/task-events`），把 领到任务 / 完成 / 失败 事实转成发言轮——一个短生命周期的员工会话（`origin: 'subagent'`，不进侧栏），携带该员工的完整组装，只注入情境、从不写台词；失败降级为确定性一句话。用户消息落群，`@显示名` 提及为该员工排一轮发言。该命名空间同时承载持久 presence remotes：`reportEmployeeVisit`/`employeePresence` 写读每员工封顶的功能区到访史（`whereabouts.json`），证明实例跨刷新的连续存在。群会话本身从不调用模型；其自身事件日志兼任播报去重游标。

## Model Experience

无。本网关只把发言轮产出引用进群会话；员工模型调用运行在数字员工代理的子会话中，不在此处。

#### KV Cache effect

情境提示短且逐轮变化；员工组装（缓存重的前缀）与其普通会话完全一致，缓存行为随员工预设不变。

## Known Limitations and Deferred Work

- **无员工间接龙** —— 播报不引发同事回应；同事只在任务事件触发或用户 @提及时发言。
- **触发为轮询** —— 生命周期日志每 `pollIntervalMs`（默认 5 秒）尾随一次；完成播报最多滞后一个间隔。
- **无群管理界面** —— 群在首次打开或首次播报时创建；成员随绑定变化，无手动邀请。
