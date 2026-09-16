# Agent Note: 群会话数字员工提及选择器

Status: implemented

[English](2026-09-16-company-group-employee-mention.md) | 中文

## Problem

群内提及路由本已端到端可用——Lead 的 `agent/pre-step` 路由器按纯子串匹配解析 `@显示名`，每命中一次就排队一条投递。缺的是「发现」：在群输入框敲 `@` 什么都不弹，用户必须凭记忆准确拼写员工显示名，拼错则静默失败（无投递、无回复）。唯一能胜任的 `@` 源 `ui-digital-employees` 被刻意限定为「开启一个新的员工任务」：它对候选设 `position === 'leading'` 与会话 `blank` 位两道门禁，且选中会生成路由引用、创建一个新的员工所属根会话。群会话永不为 blank，其消息必须落入群自身的日志，因此该源在群内按设计返回 `[]`，且不应被强改为他途。

## Decision

- **第二个 `@` 源拥有群输入框，而非在既有源内分支。** `createCompanyGroupMentionSource` 位于 `ui-companies`——已拥有 `remote.companyGroups` 与群会话呈现的包——以独立名称 `company-group-member` 注册。`ui-digital-employees` 的「开新任务」语义原样不动，于是一个源无需同时产出路由引用与纯文本提及两种结果。
- **选中插入纯文本，而非路由引用。** `onPick` 返回 `{ text: '@显示名 ' }`，经 `slash/input-insert-text` 落盘；该源不声明 `codec`、不声明 `routeSubmit`。群 Lead 的子串路由器随后按用户手打完全一致地解析该文本，投递路径零新增机械被复用。插入结构化引用、再加一个群专用 `routeSubmit` 被否决：那是与已拥有提交职责的路由器重复的第二条发送通道。
- **群会话以 `session-company-group-` id 前缀识别。** `candidates()` 只拿到 `ClientSessionContext { sessionId }`，无法访问会话事件流，因此 spec 提到的 `company-group/opened` 标记在选择路径上不可达。确定性 `groupSessionId` 前缀是每键可用且唯一的信号，取消入口（`groupTurnActions.cancel`）已按它取键；成员会话使用互斥的 `session-group-member-` 前缀，两者永不相撞。`companyIdOfGroupSession` 把解析集中供两处调用方共用。
- **只读 remote `listCompanyGroupMembers(companyId)` 供候选列表。** 它复用 `rosterOf`——正是 Lead 路由器据以匹配的同一份名单——因此每个被提供的候选都保证可投递。它刻意不 `ensureGroup`、不 `dispatchPending`、不扫描持久化——选择器每次按键都会重新查询，而把「开群」（或重放排队投递）作为按键副作用的做法既语义错误又昂贵。候选 value 携带员工 id；显示名走候选 name，故 `onPick` 无需回查名单。

## Alternatives considered

**在 `ui-digital-employees` 的源中加群分支。** 否决：该源的 `codec`/`routeSubmit` 是路由引用专用机械，加分支会让一个源同时产出 `insert`（路由）与 `text`（纯文本提及）两种结果，并引入该包并不拥有的 `companyGroups` 知识——比注册第二个源更差的接缝。

**复用 `openCompanyGroup` 取候选。** 否决：它会创建群会话、建立其 Lead 代理、派发待办投递、扫描持久化——且每次按键一次。读路径不应背负开群副作用；预发布期「正确地基优先」的立场支持专造只读 remote 而非缓存一次重调用。

**以 `company-group/opened` 事件识别群会话。** 否决：`candidates()` 只见会话 id，事件不可达；事件驱动识别会为 id 前缀已能回答的区分强加每键一次的会话事件读取。

## Consequences

- 同一触发器上现共存两个 `@` 源，作用域互斥（leading+blank 开新任务 vs. 群会话内任意位置），以不同名称注册，故菜单既不合并也不会因重复注册抛错。
- 选择器的名单每次按键拉取、不做实时订阅；在拉取与提交之间被解绑的成员由路由器既有的「离队即丢投递」路径兜底，故最坏情况只是候选短暂过时，绝非消息丢失或误投。
- `ui-companies` 增加 `inputTriggers` 依赖，并在其 `dsh.client.inject` 列表中增加 `@` 触发器；群提及源经 `ctx.effect` 注册与注销，与每个同类源一致。
- 模型可见路径未变：提及解析仍是 Lead 上的确定性子串匹配，故不涉及转录、SDK 投影或 `SESSION_FORMAT_VERSION`。宿主 `group.spec.ts` 的 remote 面断言与新增的选择器测试把两端钉住。

## Testing

- `packages/host/company-group-chat/tests/group.spec.ts` 断言新 remote 出现在方法名册中、返回绑定名单、跟随实时绑定变化，并——关键的一项——不创建任何会话且从不调用 `persistenceList`，证明读路径无开群副作用。
- `packages/client/ui-companies/tests/group-mention.client.spec.ts` 钉住群前缀候选、普通会话与成员会话返回空、查询过滤、纯文本选中结果，以及 `codec`/`routeSubmit` 的缺席。
- 无（keyless）装配式 `company-console` 快照原样通过，确认新增的只读 remote 与客户端源不改动群转录。
