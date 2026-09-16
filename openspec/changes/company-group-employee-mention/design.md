# company-group-employee-mention — 设计

## Context

群会话已走标准发送路径：群根代理（Lead）的 `agent/pre-step` 路由器按 `text.includes('@显示名')` 确定性解析用户消息并排入投递（`company-group-chat/src/index.ts:243`）。路由是纯子串匹配，与输入框是否有弹窗无关——所以「群内 @ 员工」在投递侧已经可用，缺的只是 composer 的候选弹窗。

两个既有 `@` `InputTriggerSource` 都不适用：`ui-reference`（文件/会话引用）与群成员无关；`ui-digital-employees`（1:1 新任务）被 `leading + blank` 双门槛挡住，且其语义是「开新任务」而非「插提及文本」。群会话永远不是 blank，因此它在群内必然返回空候选。

`candidates()` 只拿到 `ClientSessionContext { sessionId }`（`ui-input-trigger/src/types.ts:19`），无法同步读到会话事件流，因此识别群会话只能用会话 id。既有先例 `ui-companies/src/client/index.ts:44` 已用 `session-company-group-` 前缀识别群会话（取消入口）。群会话 id 由 `groupSessionId` 确定性生成，成员会话用 `session-group-member-` 前缀，两者不冲突。

## Goals / Non-Goals

**Goals:**

- 群会话 composer 敲 `@` 弹出该公司已绑定员工候选，选中插入 `@显示名` 纯文本。
- 候选名单与 Lead 路由同源（同一份 `rosterOf`），保证「弹出来的都能被投递」。
- 每键候选查询无副作用：不创建群、不派发投递、不扫持久化。

**Non-Goals:**

- 不改 1:1 新任务 `@` 的既有语义（仍是 leading + blank 开新任务）。
- 不改群内成员会话（`session-group-member-*`）的可见性围栏——成员会话不弹候选。
- 不做行内 `@显示名` 的富文本高亮/装饰（`lexicon` 装饰是后续增强，不在本变更）。
- 不把提及改成结构化路由引用；纯文本落入既有子串路由。

## Decisions

### 1. 新 `@` 源放在 `ui-companies`，不扩展 `ui-digital-employees`

`ui-companies` 已拥有 `remote.companyGroups`、`remote.companies`，且群 surface、取消入口、群节点渲染都在这里；`ui-digital-employees` 是「开新任务」的语义，塞进群提及分支会在一处混两种结果类型（路由引用 vs 纯文本）。

**备选**：在 `ui-digital-employees` 的 source 里加「群分支」。否决：该 source 的 `routeSubmit`/`codec` 是路由引用专用，分支会让一个 source 同时产 `insert`（路由引用）与 `text`（纯文本）两种 pick 结果，且需把群识别与 `companyGroups` remote 的知识塞进一个不拥有它们的包。

### 2. 新增只读 remote `listCompanyGroupMembers`，不复用 `openCompanyGroup`

候选是每键一次的读路径。`openCompanyGroup` 会 `ensureGroup`（可能创建群 + 建 Lead 代理）+ `dispatchPending`（补投递）+ `persistence.list()` 扫描，副作用与弹窗语义不匹配，高频调用也重。

新 remote 只 `companies.get(companyId)` + `rosterOf(company)`，返回 `CompanyGroupMember[]`（`employeeId`/`displayName`/`departmentName`），复用 `rosterOf` 保证与路由同源。类型复用既有 `CompanyGroupMember`，无新 wire 类型。代价：`@Remote` 新增需走 typert 重新生成（gateway spec + client namespace）。

**备选**：候选直接调 `openCompanyGroup` 取 `view.members`，靠客户端缓存摊薄。否决：让弹窗背上开群副作用，语义错位且违背仓库「正确地基优先于兼容」的 pre-release 立场。

### 3. 选中插纯文本 `{ text: '@显示名', continue: true }`，不设 `codec`/`routeSubmit`

`InputTriggerSource.onPick` 的 `PickOutcome` 有 `{ text, continue?: boolean }` 结果（`ui-input-trigger/src/types.ts:124`），会走 `slash/input-insert-text` 把 `@query` token 替换为 `@显示名`。纯文本落到 composer 后，既有 Lead 路由 `text.includes('@显示名')` 命中，投递流程零改动。

不设 `codec`（纯文本不是 model/reference）也不设 `routeSubmit`（不是路由引用），因此天然不会误触发「开新任务」路径，也无需触碰 `ReferenceInsert`/`submission: 'routing'` 机制。

**备选**：插入结构化引用并扩 `routeSubmit` 走一个「群投递」remote。否决：路由已经在 Lead `agent/pre-step` 里确定性完成，再造一条发送通道会重复并引入第二套提交语义。

### 4. 群识别用 id 前缀 `session-company-group-`

`candidates()` 只有 `sessionId`，用前缀是唯一同步可用信号，且与取消入口 `index.ts:44` 一致。`session-company-group-` 是确定性 `groupSessionId`，与成员会话 `session-group-member-` 前缀互斥，无歧义。

**备选**：按 `company-group/opened` 标记事件识别。否决/降级：`candidates()` 拿不到事件流（`ClientSessionContext` 仅 `sessionId`），引入事件查询会让每键候选多一次会话事件读取；且本变更范围只需「群会话弹、非群不弹」，前缀已足够。

### 5. 不设 `leading` 门槛

路由是子串匹配，行中 `@显示名` 也能投递，弹窗不必比路由更严。`candidates()` 里不检查 `request.position`，行首/行中都弹。

## Risks / Trade-offs

- **[前缀识别与事件识别不一致]** → 若未来群会话 id 方案改变，前缀判断会失效；但 id 是 `groupSessionId` 确定性生成的稳定契约，且取消入口已依赖同一前缀，两处同源同变。已在 spec 的「候选与路由同源」外，保留「非群会话不掺和」场景锚定行为。
- **[roster 查询与路由名单时序差]** → 弹窗缓存一份成员名单，投递时名单可能已变（员工解绑）。风险被既有路由兜底：路由用 `rosterOf` 实时名单，解绑员工的投递会走 `runOneDelivery` 的「已解绑即丢」分支，不会产生错误回复；仅表现为候选短暂过时，下一次敲键刷新。
- **[typert 重新生成的回归面]** → `@Remote` 新增会重写 gateway 类型与 client namespace，可能牵动既有快照。任务里以「regenerate + 只跑相关测试」约束，避免全量重跑。
