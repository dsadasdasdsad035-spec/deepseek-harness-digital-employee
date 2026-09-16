# Agent Note: 公司群会话回到 agent loop 基座

Status: implemented

[English](2026-09-15-company-group-on-agent-loop.md) | 中文

## Problem

三种对话面中，普通聊天会话与数字员工单聊都运行标准 spine——一个会话、一个根代理、一个常驻 loop——而公司群是唯一的旁路：`ensureGroup` 只建裸会话（无根代理），apiproxy 的 `prompt` 经注入的 `groupDelivery` 钩子短路，员工每次发言都在一次性 `session-group-turn-<uuid>` 会话里跑完、抄回一段文本即弃。代价（代码阅读确认）：无流式、不可取消、逐轮失忆（situation 提示词重述一切）、工具调用不可见、进程内 `turnChain` 的排队投递随重启丢失、群事件永远进不了任何模型的上下文。

## Decision

- **群会话获得 Lead 根代理与标准发送路径。** `ensureGroup` 在确定性群会话 id 上创建（或冷恢复）真实 agent；用户消息经普通 `session.prompt` → `followup` 到达。`groupDelivery`/`setGroupDelivery` 特例从 apiproxy、其 API 接口、api-catalog 与客户端 fixtures 中整体删除。
- **Lead 是无脑路由器；提及路由零模型调用。** Lead 作用域的 `agent/pre-step` 监听解析领取到的用户消息，追加用户名义的 `company-group/message`，为每个 `@显示名` 命中排队一条 `company-group/turn-queued`，然后返回空消息的 enter 决策——loop 对 step 0 空回合在 `buildRequest` 之前即以 `completed` 收尾，无提及消息永不碰模型（「无点名不回复」由机制自然产生）。
- **员工是 continuable 成员会话，不再一锤子。** 每个（公司, 员工）二元组拥有 `session-group-member-<companyId>-<employeeId>`（`origin: 'subagent'`，隐藏且被通用路由围栏），经 `digitalEmployeeAgent.createTask` 创建、经新增 `resumeTask` 冷恢复（同一组装、身份事件守卫、不重放 identity/instructions 事件）。投递注入情境与有界群近况快照（caller-owned framing；surface 封闭联合不动），以普通流式、可带工具的回合规程运行，最终 assistant 文本以员工名义回写群消息。
- **队列即群日志。** `turn-queued`/`turn-delivered` 事件加 queued−delivered 折算给出按员工串行、重启重放、成员离队丢弃与任务播报去重游标（`dedupKey: task:<seq>`）；进程内 `turnChain`、`runSpeakingTurn`、一次性会话与「赛超时兜底」退役。超时现在真正取消成员回合，随后与任何失败一样以确定性一句话收尾。`cancelCompanyGroupTurn` 把取消暴露给群视图。
- **实时进度是事件投影的指示节点，不是 chunk 镜像。** 聊天面把 `turn-queued` 渲染为「正在输入… + 取消」、在 `turn-delivered` 时隐藏。向群日志镜像成员 `assistant/chunk` 被否决：自定义事件不进 surface，持久邮箱日志会按每回合全量 token 流膨胀且不受 compaction 约束。转写内 chunk 级投影（跨会话合成）留待后续。

## Alternatives considered

- **主持人 Lead（单 loop 扮演全体员工）**——loop 层面最省，但丢掉 per-employee 组装/工具/模型/记忆这一产品核心；否决。
- **多写者共享会话（N loop 写一个日志）**——被注册表「一会话一 agent」身份与 surface 封闭联合阻挡；改 core spine 违反「plugins, not loop changes」；对该面否决。
- **转正 `experimental/agent-team`**——其花名册/邮箱解决同类问题，但它是 experimental、其 Lead 语义是「任意普通运行时根」、成员是通用 continuable 子代理，而群成员需要既有数字员工组装/删除/记忆机制。群需要的子集（串行、去重、重放）以约百行日志折算实现；与 agent-team 的收敛留作后续变更。

## Consequences

路由零模型调用由真 loop 测试栈（AgentLoop + MockAdapter）实证：无提及测试断言 `adapter.requests` 恒空。成员连续性由「两轮发言仅一次 `createTask`、成员会话内两条注入 user/message」实证。冷重放、成员离队丢弃、取消降级与去重各有专测（网关套件 12 项，另 `resumeTask` 2 项）。keyless 组装快照（company-console）改为启动真 agent spine、经 Lead followup 发送，并刷新预期转写（3 行）。已知限制：指示节点不显示增量文本；员工间接龙仍在范围外；任务播报触发滞后仍为一个轮询间隔。留待后续：转写内 chunk 投影、与 agent-team 收敛、恢复时的员工记忆刷新。

## 实机服务验证（2026-09-15）

在无鉴权测试实例（`dsh web --patch` 禁用 accounts/email 行、`$DSH_HOME` 指向真实数据副本、端口 3090）上按裸 `/api` HTTP 契约（typert 端点 `POST /api/<namespace>/<method>` 带 `{args}`；核心方法 `POST /api/session.prompt`）端到端驱动。真实 DeepSeek 调用下：无提及消息落库零触发且 Lead 日志无 `request/header`（线上级零模型调用证明）；`@项目经理` 产出真实自我介绍；第二次点名回答「我们刚才聊到了我的自我介绍」（成员会话连续性、真实记忆）；两次投递共用同一 `memberSessionId` 且全部结算；`cancelCompanyGroupTurn` 回合中取消成功、队列以确定性降级收尾。本轮回款两处修复：网关 `static inject` 必须声明 `agents`（测试侧 AgentRegistry 以插件身份声明故未暴露）；成员会话需要部署默认模型选择（`agentDefaultModel.currentSelection()` 作 `agentOptions` + `modelSelection` 传入），否则 persona 的 `{{model}}` 变量在提示组装处失败——失败降级为兜底句，这正是首轮实机「回复」是降级文案的原因。

## 浏览器 GUI 验证（2026-09-15）

通过内嵌浏览器驱动真实 Web UI 暴露了两个脚本 e2e 无法触及的缺陷，均已修复并有覆盖：

1. **「正在输入…」指示器卡死转写。** `buildViewNode` 在结算后返回 `null`，但会话装配器禁止撤回已物化的节点（`conversation-assembler.ts` 抛「withdrew materialized target」）；`turn-delivered` 更新因此中止 flush，指示器残留、后续消息不再渲染。修复：结算后以 `visibility: 'hidden'` 返回同一节点，绝不返回 `null`。
2. **冷恢复丢失 router。** 浏览器刷新经 apiproxy 通用 `agentFor` 恢复群会话，其 setup 只重装会话 preset，不知这是公司群。Lead 回到无 `agent/pre-step` router 的状态，把 `@mention` 当成普通 assistant 回复（群日志出现 `request/header` 与 `assistant/message`）。修复：在网关构造函数经 `agent/session-start` 挂载 router（每次 create/resume 都触发），监听器按 opened 标记解析公司后在 `agent.ctx` 上挂载。脚本验证：经 `session.list` + `session.history` 冷恢复后，`@mention` 仍正确路由到成员，群日志无 `request/header` 或 `assistant/message`。
