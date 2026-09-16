# company-group-employee-mention

## Why

群会话的 `@显示名` 提及路由已可用（Lead `agent/pre-step` 按 `text.includes('@显示名')` 确定性解析），但群输入框里敲 `@` 没有任何弹窗候选——群会话永远不是 blank，现有 `ui-digital-employees` 的 `@` 源被「新任务 + leading + blank」三重门槛挡掉，而它的语义是「开新任务」而非「插提及文本」。用户只能手打员工名，不知道群里有谁、也容易打错名字导致投递静默落空。

## What Changes

- 群会话输入框敲 `@` 弹出「该公司已绑定数字员工实例」候选列表（`displayName` + `departmentName`），随输入 query 过滤。
- 选中候选在输入框插入 `@显示名` 纯文本（非路由引用），回车后落入既有 Lead 提及路由，投递流程零改动。
- 新增只读 remote `listCompanyGroupMembers(companyId)`：返回该公司的群成员名单（`rosterOf` 结果），**不** `ensureGroup`、**不** `dispatchPending`、**不**扫描持久化——弹窗是每键一次的读路径，不带开群副作用。
- 非群会话不掺和：新 `@` 源按群会话 id 前缀 `session-company-group-` 快速识别（与现有取消入口 `ui-companies/src/client/index.ts:44` 同一信号），返回空候选；成员会话 `session-group-member-` 前缀不匹配，故不弹。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `company-group-chat`: 新增「群会话提及选择器」需求——群输入框 `@` 弹窗候选、插入 `@显示名` 纯文本落入既有提及路由；新增只读群成员查询 remote（无开群/派发副作用）。

## Impact

- `packages/host/company-group-chat`：新增 `@Remote('listCompanyGroupMembers')`（复用 `rosterOf`），走 gateway spec + typert 重新生成。
- `packages/client/ui-companies`：新增 `@` `InputTriggerSource`（`name: 'company-group-member'`），`inject` 增加 `inputTriggers`；按 `company-group/opened` 识别群会话，`onPick` 返回 `{ text: '@显示名', continue: true }`，不设 `codec`/`routeSubmit`。
- `packages/client/ui-digital-employees` 不变（1:1 新任务 `@` 语义保持原样）。
- 既有提及路由（`company-group-chat` Lead `agent/pre-step`）不变。
