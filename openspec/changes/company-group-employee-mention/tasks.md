## 1. Host 只读群成员查询

- [x] 1.1 在 `packages/host/company-group-chat/src/index.ts` 新增 `@Remote('listCompanyGroupMembers')`：`listCompanyGroupMembers(companyId: CompanyId): Promise<CompanyGroupMember[]>`，实现为 `companies.get(companyId)`（未找到抛错）+ `rosterOf(company)`，不调 `ensureGroup`/`dispatchPending`/`sessionPersistence`；JSDoc 注明只读无副作用。
- [x] 1.2 更新 `packages/host/company-group-chat/tests/typert-generation.spec.ts`：新增 `expect(artifact!.remote!.dts).toContain('listCompanyGroupMembers:')` 断言。
- [x] 1.3 运行 typert 重新生成（`pnpm run typert-contracts`，即 `build:lib:host`），提交生成的 `lib/typert.host.*` 与 `lib/typert.remote-client.*` 产物。
- [x] 1.4 在 `tests/group.spec.ts` 增加新 remote 单测：返回当前绑定成员名单（displayName/departmentName），并断言不产生群会话创建或投递派发副作用（复用 mock-adapter）。

## 2. 客户端群成员 @ 源

- [x] 2.1 `packages/client/ui-companies` 的 `inject` 增加 `inputTriggers`（当前缺），并在 `apply()` 里 `ctx.get('inputTriggers')` 取服务。
- [x] 2.2 新增 `packages/client/ui-companies/src/client/group-mention.ts`，导出 `InputTriggerSource`：`trigger: '@'`、`name: 'company-group-member'`、`order` 与展示标题按需；不实现 `codec`/`routeSubmit`。
- [x] 2.3 `candidates()`：`sessionId` 不以 `session-company-group-` 开头返回 `[]`；解析 companyId 后调 `remote.companyGroups.listCompanyGroupMembers`，按 query 过滤，映射为候选（`name: displayName`、`description: departmentName`、`value: employeeId`）。
- [x] 2.4 `onPick()`：命中候选返回 `{ text: `@${displayName}`, continue: true }`，落入 `slash/input-insert-text`；不设 leading 门槛。
- [x] 2.5 `apply()` 中 `inputTriggers.registerSource(source)` 并随 dispose 注销。
- [x] 2.6 新增 `tests/group-mention.client.spec.ts`：群前缀会话弹候选、非群/成员会话返回空、选中插入 `@显示名` 文本、query 过滤。

## 3. 验证

- [x] 3.1 跑聚焦测试：`pnpm run test` 中 `-t` 聚焦 `company-group-chat` 与 `ui-companies`（含 typert-generation 与 group-mention）。
- [x] 3.2 确认无模型/用户转录面变化：提及路由（Lead 子串匹配）未改，仅新增客户端弹窗，故无 assembled snapshot 需更新；在变更里说明豁免理由（客户端 UI 不入 headless transcript）。
- [x] 3.3 跑 `pnpm run typecheck` 与相关 lint，确认新增 remote 的 typert 产物与 client namespace 一致。
