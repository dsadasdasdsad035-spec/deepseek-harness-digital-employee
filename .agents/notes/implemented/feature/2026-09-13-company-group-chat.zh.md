# Agent Note: 公司群聊（每公司工作群）

Status: implemented

[English](2026-09-13-company-group-chat.md) | 中文

## Problem

数字员工自主干活的过程不可见、聊天又只能一对一。用户先确认公司绑定的就是「组织」花名册里的实例（是——实例而非模板），随后要求按公司建工作群：绑定员工领到任务、完成或失败时都在群里说话，用员工自己的口吻，群主可回复与 @提及。

## Decision

- **群是事件组装的会话，绝不直接调模型。** 每公司一个确定性会话（`session-company-group-<id>`）；消息是强类型 `company-group/message` 事件 `{speakerKind, employeeId?, displayName, text, taskEventSeq?, context}`（声明合并进 `SessionEventMap`；**不带 `@mode`**——它是会话日志事件而非 cordis 总线事件）。持久化、侧栏标题、实时推送全部白拿现有机制；群会话自身零模型调用。
- **触发源是追加式任务生命周期日志。** 失败台账是失败态代数（成功即删记录），因此 headless 驱动在写台账的同一位置向 `$DSH_HOME/digital-employees/task-events.jsonl`（`dsh-digital-employee-file/task-events`：单调 seq、`withFileLock`、断尾容错）追加 `started/succeeded/failed(+原因+挂起)` 事实。网关尾随（`pollIntervalMs` 默认 5 秒，schema 下限 500ms）；启动首轮跳过历史；群自身事件日志即去重游标（`context: "task:<seq>"`）。
- **发言轮是真实员工会话，且不进侧栏。** `digitalEmployeeAgent.createTask` 带 `meta { origin: 'subagent', delegationDepth: 1 }`、情境初始消息（成员名单+近期上下文+触发事实，**从不写台词**）与员工记忆查询；`whenIdle()` 与 `turnTimeoutMs`（120 秒）竞速；将 `lastAssistantText` 引用为该员工的群消息；失败/超时改写确定性一句话。发言轮经 promise 链串行，公开 `settle()`；`pollNow()` 供测试立即轮询。
- **提及复用同一套发言机制。** 用户消息以「我」落群；`@显示名`（对实时名单做子串匹配）以消息为情境排一轮发言；未被提及的消息不触发任何回复。
- **客户端：专用群面板（设计里的兜底方案，主动采用）。** 控制台楼层面板新增「公司群聊」；侧栏切换为群视图（说话人标注消息、插入 @ 的成员芯片、输入框、2.5 秒轮询）。接线教训：新增 remote 命名空间必须在 api-remotes 客户端同时加值导入与 `export type {} from '<pkg>/remote'`（TypertRemoteNamespaceMap 合并是类型副作用），且消费方读的是构建后的 client 面，必须全量重建。

## Alternatives considered

- **多挂载会话/agent-loop 扇出** —— 违反"插件不改 loop"；每会话单一 root Agent 是全局承重结构。
- **台账差分触发** —— 成功会抹掉记录；事件日志才是诚实来源。
- **聊天主界面的多说话人渲染** —— 对话渲染器假设单一助手流；群面板不动它即交付交互（侧栏列表仍经会话标题白拿）。

## Consequences

快照轨道：company-console 夹具组装真实网关 + stub 的 `digitalEmployeeAgent`（脚本化发言；情境含 `FORCE_FAIL` 强制降级）与先于网关排序的夹具本地 task-events 重定向；driver 断言 group-opened / group-mention / group-task-broadcast（task:1 游标）/ group-fallback，回放全绿。一次性 driver 显式 `process.exit` 收尾——群流量之后，组装进程的 stdio 管道比 `fiber.dispose()` 活得久，execa 的退出检测永不触发（无泄漏句柄：仅剩 stdio socket）。实机验证：面板打开并派生名单（模板未挂载的员工被正确跳过——小明/project-manager-demo）、用户消息落群、@提及排发言轮、无 key 部署呈现确定性降级句；配上 API key 后同一路径产出人设化发言。已知限制：播报最多滞后一个轮询间隔；无员工间接龙；群消息仅在控制台面板渲染（在聊天主界面打开群会话显示为空会话）。推迟项：聊天主界面说话人渲染、群未读标记、跨公司群。
