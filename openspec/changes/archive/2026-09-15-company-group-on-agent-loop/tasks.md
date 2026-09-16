## 1. 事件面与员工组装基座

- [x] 1.1 在 `SessionEventMap` 增加 `company-group/turn-queued` / `company-group/turn-delivered`（非 surface、`ignorable: true`，含 `@mode` 与 payload `@param` JSDoc），更新双 SDK（TypeScript + Python）投影与预期输出
- [x] 1.2 `digitalEmployeeAgent.createTask` 增加冷恢复路径：目标会话已持久化而未活态时按同一员工组装走 `agents.resume`（组装指纹不匹配时按当前组装重建并说明），保持 `trackRootHandle` 追踪
- [x] 1.3 包级测试：冷恢复组装一致性、恢复后记忆投影/身份事件齐备、删除员工排空成员会话

## 2. 群网关：根代理与确定性路由

- [x] 2.1 `ensureGroup` 建群/冷恢复时创建或恢复 Lead 根代理（最小 preset、零工具；检出 `company-group/opened` 后 resume，无则 create），Lead 句柄随群生命周期处置
- [x] 2.2 实现 Lead 路由插件（`agent/pre-step`）：领取用户消息 → 解析 `@显示名` → 追加用户名义 `company-group/message` → 每个命中成员追加 `company-group/turn-queued` → 返回空消息 enter 决策（零模型调用结束回合）；无效提及仅落库
- [x] 2.3 移除网关的 `deliverFromComposer` / `setGroupDelivery` 注册与 apiproxy `prompt` 的群短路分支（`api-proxy.ts:2396-2413`）、`api/index.ts` 的 `setGroupDelivery` 声明；群会话走标准 prompt 通道
- [x] 2.4 包级测试：无提及零模型调用、多提及各自排队、重复提及不去重、非群会话不受影响

## 3. 成员会话与投递派发

- [x] 3.1 成员会话管理：确定性 id `session-group-member-<companyId>-<employeeId>`、`origin: 'subagent'` 元数据、首次投递 `createTask` 创建 / 冷态恢复（任务 1.2 路径）、按员工登记句柄
- [x] 3.2 投递派发器：折算群日志 queued−delivered 得每员工待投队列，按日志序串行；投递 = 注入情境消息（触发事实/被点名原文 + 有界群近况快照）+ 唤醒；delivered 前不投下一条；折算时过滤已不在册成员
- [x] 3.3 回合收尾监听：成员 agent 的 `agent/turn-stopping` → 取最后 assistant 文本回写 `company-group/message`（员工名义）+ `company-group/turn-delivered`；失败/取消/超时写降级播报并 delivered，队列继续
- [x] 3.4 任务生命周期播报改道：`pollTaskEvents` 的路由改为追加 `turn-queued`（`dedupKey: task:<seq>`），复用派发器；移除 `turnChain` 与 `turnTimeoutMs`/`runSpeakingTurn`/一次性 `session-group-turn-*`
- [x] 3.5 新增 `cancelCompanyGroupTurn` remote：转发当前发言成员 agent 的 `cancel({ keepInbox: false })`
- [x] 3.6 包级测试：按员工串行、重启重放补投递、任务去重、解绑丢弃待投、降级播报、取消路径

## 4. 客户端投影

- [x] 4.1 群视图：对「正在发言」成员订阅其会话事件流，`assistant/chunk` 投影为该员工气泡进行中文本，`company-group/message` 落地后定稿；回合结束退订
- [x] 4.2 群视图取消入口接 `cancelCompanyGroupTurn`
- [x] 4.3 输入框在群会话上下文走标准发送路径，移除群专用投递客户端逻辑

## 5. 验证与文档

- [x] 5.1 更新/新增 keyless 组装快照：开群 → 无提及消息（零模型调用）→ @提及员工流式发言 → 取消 → 重启冷恢复重放（走真实可运行示例）
- [x] 5.2 更新受影响 README/JSDoc（company-group-chat、apiproxy 群路径移除、digitalEmployeeAgent 冷恢复契约）与 `docs/subsystems` 对应页
- [x] 5.3 撰写 Agent Note（决策 D1-D6、三种对话面对照结论、agent-team 收敛留待后续）并归档流程
- [x] 5.4 全量验证：`pnpm run typecheck && pnpm run test`（受影响包）、`pnpm run doc-sync`、构建冒烟
