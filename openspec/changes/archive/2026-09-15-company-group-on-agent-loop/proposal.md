# company-group-on-agent-loop

## Why

公司群会话是三种对话面中唯一离开 agent loop 基础的：群会话没有根代理（apiproxy 以 `groupDelivery` 特例短路 `session.prompt`），员工每次发言都在一次性隐藏会话里跑完 loop 即弃——由此付出无流式、不可取消、逐轮失忆（situation 提示词重述一切）、工具调用不可见、进程内 `turnChain` 串行等代价；群自定义事件永远进不了任何模型视野。数字员工单聊已证明「员工 = 常驻根代理 loop」在现有 spine 上完全成立，本变更把群会话修复到同一基础上。

## What Changes

- 群会话获得根代理（Lead）：开群即创建，走 `agents.create` 标准路径；用户消息经标准 `session.prompt` → `followup` 进入 Lead loop，apiproxy 的 `groupDelivery` / `setGroupDelivery` 特例退役。
- Lead 是确定性路由器而非主持人：`agent/pre-step` 监听解析 `@提及`，把用户消息落为群事件并向被提及员工排入投递；无有效提及时该回合**零模型调用**自然结束（保留「无点名不触发」行为）。
- 员工从一次性发言轮升级为常驻 continuable 成员会话：每（公司, 员工）一条确定性 id 的持久会话，经 `digitalEmployeeAgent.createTask` 完整组装（人格/工具/MCP/记忆投影）；发言在自己的 loop 里流式执行、可取消、跨轮连续。
- 投递持久化：投递队列以 `company-group/turn-queued|delivered` 事件落在群会话日志内（含去重游标与冷恢复重放），替代进程内 `turnChain`；任务生命周期播报走同一队列。
- 发言落地保持既有形态：员工回合结束后以该员工名义追加 `company-group/message`；回合失败仍降级为确定性一句话播报。
- 客户端：群视图对「正在发言」的成员会话订阅事件流实现实时生成展示，并提供取消入口；输入框回归标准发送路径。
- 移除：一次性 `session-group-turn-<uuid>` 会话与 `turnTimeoutMs` 整段超时兜底（改为真实取消 + 失败降级）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `company-group-chat`: 群会话从「无根代理、发送经网关特例投递、员工发言为一次性子代理」改为「根代理 + 标准发送路径 + 常驻 continuable 成员会话 + 持久投递队列」；任务播报与提及路由需求随路径改写；渲染需求增加实时生成投影。

## Impact

- `packages/host/company-group-chat`：网关重写核心（根代理、路由插件、成员生命周期、持久队列）。
- `packages/host/apiproxy`：移除 groupDelivery 注入与 `prompt` 内的群短路分支。
- `packages/core/digital-employee-agent`：`createTask` 增加冷恢复（对持久化成员会话按员工组装走 `agents.resume`）。
- `packages/client/ui-companies` / 会话视图：群视图订阅成员会话事件流、取消入口、标准发送。
- 会话事件面：新增 `company-group/turn-queued` / `company-group/turn-delivered` 两个 `SessionEventMap` 成员（非 surface、带 `ignorable`），`SESSION_FORMAT_VERSION` 维持 0（预发布期无兼容承诺）。
- 双 SDK 投影与既有快照随事件面更新。
