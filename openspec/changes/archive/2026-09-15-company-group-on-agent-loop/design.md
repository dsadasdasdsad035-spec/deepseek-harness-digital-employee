# Design: company-group-on-agent-loop

## Context

三种对话面中，普通聊天会话与数字员工单聊都是「一个会话一个根代理、一个常驻 loop」的标准形态；公司群会话是唯一旁路：`ensureGroup` 只建裸会话（无根代理），apiproxy 的 `prompt` 以 `groupDelivery` 短路（`api-proxy.ts:2396-2413`），员工发言经 `runSpeakingTurn` 在一次性 `session-group-turn-<uuid>` 会话里跑 `digitalEmployeeAgent.createTask` 后即弃（`company-group-chat/src/index.ts:386-408`）。

spine 的两个硬边界决定了架构形状：

1. **loop 与会话一对一**：`ReactLoopAgent` 每次请求从 `session.deriveMessages()` 重放自己的会话；一个 agent 一套组装（人格/工具/模型），composition 是 per-agent 而非 per-turn（`agent-loop/src/agent.ts:346`）。
2. **一个 SessionId 只挂一个 agent**：`AgentRegistry.enter` 强制 `agent id === session.id` 并拒绝重复注册（`agent/src/index.ts:484-490`）。

另外 surface 是封闭三事件联合（`session/src/surface.ts:15-19`），自定义群事件不进模型视野——群历史对模型的可见性必须发生在各成员自己的会话里。

可复用的既有机制：`digitalEmployeeAgent.createTask` 的员工组装（身份/指令/记忆投影/MCP）；loop 的 `agent/pre-step` 瀑布可改写进入回合的消息（含改写为空使回合**零模型调用**结束，`agent-loop/src/agent.ts:277-281`）；`origin: 'subagent'` 会话头对通用路由与列表的围栏（`api/remotes/src/agent-lookup.ts:62-72`）；数字员工删除时的 continuable 后代排空（`digital-employee-agent/src/index.ts:197-201`）。

## Goals / Non-Goals

**Goals:**

- 群会话回到标准 prompt 路径：用户消息走 `session.prompt` → Lead `followup`，apiproxy 群特例整体退役。
- 员工发言获得单聊同级的 loop 能力：流式、取消、跨轮记忆、工具可见。
- 投递可恢复：队列状态持久在群日志里，重启重放，去重游标化。

**Non-Goals:**

- 不产品化 `experimental/agent-team`（见决策 D1），不引入共享任务板；群协调层收敛为后续独立变更。
- 不做主持人模式：无提及时 Lead 不推理、不代答；Lead 永不为路由决策消耗模型调用。
- 不改 core（agent/agent-loop/session surface/AgentRegistry）；全部新行为落在插件层。
- 不迁移既有群历史：旧 `company-group/message` 事件照常渲染；新投递事件只增不改。

## Decisions

### D1: 群协调层内建在 company-group-chat，不复用/不转正 experimental/agent-team

agent-team 的邮箱+花名册解决了同类问题（去重、冷恢复、供给竞态），但它是 experimental（README 自述排除于正式发布）、其 Lead 语义是「任意普通运行时根隐式成队」，成员是无身份的通用 continuable 子代理；而群成员是数字员工，组装、删除事件、记忆投影都在 `digitalEmployeeAgent` 里。为这个面转正整个包并桥接 spawn provider，改动面大于收益。群需要的只是 agent-team 邮箱的一个子集（按员工串行、日志游标去重、冷重放），以两个群事件实现约百余行。后续若群与 team 需求收敛，再评估合并——预发布期无兼容包袱。

**备选**：A) 主持人单 loop（员工由模型扮演）——丢弃 per-employee 组装/工具/模型，否决；B) 多写者共享会话——需动 AgentRegistry 与 surface 封闭联合，违反「plugins, not loop changes」，否决。

### D2: Lead 是无脑路由器，经 `agent/pre-step` 实现「落库 + 派发 + 零模型调用」

Lead 在 `ensureGroup` 创建（或冷恢复时 `agents.resume`），用最小 preset、零工具。路由插件的 `agent/pre-step` 监听：领取到的用户消息 → 解析 `@显示名` → 以用户名义 `session.append('company-group/message')` → 为每个命中成员 `session.append('company-group/turn-queued', …)` → 返回空消息的 enter 决策。`turn()` 对 step 0 空消息回合直接 `completed` 结束、不发生模型调用（`agent.ts:277-281`），「无点名不触发」由此免费获得。用户消息因此**不**进群会话的 surface（不落 `user/message`），群日志保持纯自定义事件、Lead 上下文恒为空——群历史对模型的可见性由 D3 的注入承担。

**备选**：Lead 作为真主持人推理分派——每条消息一次模型调用，成本与确定性都差，否决。

### D3: 员工成员会话 = 确定性 id 的 continuable 会话，群近况以注入消息提供

- id：`session-group-member-<companyId>-<employeeId>`，`meta.origin = 'subagent'`（隐藏于列表、围栏于通用 prompt，群投递专属）。
- 首次投递经 `digitalEmployeeAgent.createTask` 创建（完整组装 + 确定性 id）；后续投递若冷态则按同一员工组装走 `agents.resume`（`createTask` 增加冷恢复路径，见任务 1）。
- 每次投递注入一条用户消息：情境（触发事实或被点名原文）+ 有界群近况快照（近期 `company-group/message` 折叠，调用方烘焙框架文本，符合 surface 的 caller-owned framing 约定）。员工回合的流式块/工具调用即其自身会话的标准事件——可见、可订阅、可取消。
- 回合结束（`agent/turn-stopping` 监听该成员 agent）：取最后一条 assistant 文本，回写群日志 `company-group/message`（员工名义）+ `company-group/turn-delivered`；失败/取消则写降级播报。群历史回写让 UI 投影保持现状（只折群日志）。

**备选**：把员工回执以 user 角色中继进群会话 surface 供未来 Lead 阅读——Lead 无脑化后没有读者，白增日志噪声，否决（D2 附带说明）。

### D4: 投递队列 = 群日志事件 + 重放折算，替代进程内 turnChain

事件：`company-group/turn-queued { seq, employeeId, memberSessionId, displayName, situation, context, dedupKey? }` 与 `company-group/turn-delivered { queueSeq }`。派发器按日志顺序对每个员工维护「排队未完成」队列：活态则投递（注入 + 唤醒），冷态先恢复再投递；同员工串行由「上一条 delivered 前不投下一条」保证。重启后 `ensureGroup` 折算 queued−delivered 重放。任务播报以 `dedupKey = task:<seq>` 沿用现有游标去重；@提及投递不去重（用户重复点名是意图）。两个事件随声明合并进入 `KNOWN_SESSION_EVENT_TYPES`（经 `gen-persistence-catalog` 再生成），required-on-read、无需 `ignorable` 标记；预发布期 `SESSION_FORMAT_VERSION` 维持 0。

**备选**：沿用进程内 turnChain + 内存游标——重启即丢待发投递，正是本变更要修的缺陷，否决。

### D5: 实时进度 = 群日志事件投影的进行中指示节点；取消 = 网关 remote 转发成员 cancel

群视图以会话节点投影 `company-group/turn-queued`（开始）与 `company-group/turn-delivered`（结束）为「X 正在输入… + 取消」指示行——两事件都在群会话日志内，聊天面按标准事件流收到，无需跨会话订阅。取消经 `cancelCompanyGroupTurn` remote 转发到当前发言成员 agent 的 `cancel({ keepInbox: false })`，回合以 aborted 收尾、触发 D3 的降级回写。成员会话内的逐块流式文本不镜像进群日志（自定义事件不进 surface，镜像会让持久邮箱日志按 token 量双倍膨胀且不受 compaction 约束）；转写内的实时块级投影需要跨会话合成，留作后续增强。**BREAKING**（对内）：apiproxy 移除 `setGroupDelivery` 注入点。

### D6: 生命周期挂接复用既有员工删除链

成员会话句柄按员工登记进 `digitalEmployeeAgent` 的根句柄追踪（`trackRootHandle`），员工删除时既有 `digital-employees/before-delete` 处置链自动排空；解绑公司在群侧丢弃该员工的 queued 未投递（折算时过滤不在册成员）。

## Risks / Trade-offs

- [成员会话冷恢复组装漂移：员工模板在会话存续期间升版] → 恢复按当前组装重建（与单聊 resume 同策略）；组装指纹事件 `digital-employee/identity` 已在会话日志中可稽核。
- [群近况快照随群活跃无限增长注入] → 快照有界（近期 N 条 + 字符上限），成员自身会话内由 compaction 兜底。
- [投递重放与活态派发竞态（重启窗口）] → 派发器以群日志事件为唯一事实：投递前重折 queued−delivered，delivered 幂等跳过。
- [Lead 创建后从未发生模型调用，preset/模型路由校验空转] → Lead 组装固定最小 preset，模型路由缺失不应阻断开群；路由插件不依赖任何模型能力。
- [群视图订阅 N 个成员会话的带宽] → 只订阅「正在发言」的成员，回合结束即退订。
- [旧群日志无 queued/delivered 事件] → 折算视队列为空，直接从新事件起算；旧消息渲染不变。

## Migration Plan

预发布期无兼容承诺：一次性切换。部署即生效——旧群会话冷恢复时补建 Lead（`ensureGroup` 检出标记事件后 `agents.resume`/`create`），历史 `company-group/message` 原样渲染；一次性 `session-group-turn-*` 会话不再产生，已持久化的照旧存在但不被引用。回滚 = 回退提交。

## Open Questions

- 群近况快照的 N 条/字符上限取值（实现时按单条消息长度分布定，不影响规格）。
- `company-group/turn-delivered` 是否需要携带用量/时长统计（可后加字段，事件已 `ignorable`）。
