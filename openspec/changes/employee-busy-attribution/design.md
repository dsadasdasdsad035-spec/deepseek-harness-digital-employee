# Design: employee-busy-attribution

## Context

三处既有事实决定本变更的形状：

1. **`Context.agent` 是声明合并的属性，不是注册服务**（`packages/core/agent/src/index.ts:46-49` 的 `interface Context { agent?: Agent }`）。`ctx.get(name)` 只查 cordis 的 service store（`vendor/cordis/src/reflect.ts:233` 的 `_getImpl`），而 agent-loop 用 `scope.ctx.extend({ agent: this })`（`agent-loop/src/agent.ts:95`）挂的是原型链属性——所以 `agentCtx.get('agent')` 在真实运行时恒为 `undefined`。
2. **`installAudit` 因此静默返回**（`digital-employee-agent/src/index.ts:1026-1027`），审计从不落盘（实测真实部署 `employees.json` 的 `audits` 恒为 0）。
3. **`busyVerdict` 以审计反查会话身份**（`company-management/src/index.ts:404-428`），审计为空即恒判空闲；而场景侧「在忙」的全部呈现（亮屏 `buildMemberDesk`、头顶标签 `statusLabel`、回工位 `npc.busy` 分支）与规格早已就绪，只等这一个信号。

## Goals / Non-Goals

**Goals:**

- 让审计在员工根任务组合路径上真正落盘，恢复能力归属。
- 让 `busyVerdict` 能识别员工运行中的会话，从而恢复既有「忙/闲实时呈现」行为。
- 用**员工组合路径**的测试锁死这一回归（现有测试只覆盖专家路径，是假绿的来源）。

**Non-Goals:**

- 不改 3D 场景的呈现逻辑（亮屏、标签、走位均已实现且正确）。
- 不新增会话事件类型或审计记录格式。
- 不改 `busyVerdict` 的判定语义（运行中即忙），除非 design 决策另行选择确定性兜底。
- 不引入「工作中」等新文案改动（属产品手感，另议）。

## Decisions

### D1: 修 `installAudit` 取 Agent 的方式——属性直读，而非服务查询

改为 `agentCtx.agent`（属性直读，命中声明合并的 `Context.agent`）。备选：

- **在 agent-loop 里把 agent 注册为服务**（`provide('agent', this)`）：能同时修好 `get('agent')`，但把「当前 Agent」从作用域属性升级为服务，影响面超出本缺陷，且与既有 `Context.agent` 声明语义重复。否决。
- **改成通过事件或参数把 Agent 传进 `compose`**：`compose` 已有 `agentCtx`，再加一个参数是冗余通道。否决。

选属性直读，改动最小且贴合既有声明。

### D2: 取不到 Agent 时不再静默返回

当前 `if (agent === undefined) return` 把一个可诊断的配置/接线错误变成静默缺失，正是本缺陷潜伏至今的原因。改为记录一条可观测诊断（logger 警告或显式抛出，按调用路径选择：组合路径属配置期，倾向显式失败；专家 path 已有 `provide('agent')` 前提，应始终可得）。备选：保持静默——即当前缺陷成因，否决。

### D3: `busyVerdict` 保持审计派生，不引入确定性兜底（本次）

成员会话 id 是确定性的 `session-group-member-<companyId>-<employeeId>`，理论上可绕过审计直接派生忙碌。但：

- 审计是**归属**的权威来源，确定性兜底会绕开「能力使用可追溯」的语义，形成第二条真相；
- 修好 D1 后审计自然覆盖成员会话（它就是员工的根任务会话之一）；
- 引入兜底会掩盖未来再次出现的审计断链，与「Misconfiguration fails loud」相悖。

因此本次只修审计链；把「确定性兜底」记为 Open Question，若修好后仍出现漏判再评估。

### D4: busy 粒度维持员工级布尔 + `busyKind`

现有 `busyKind: 'chat' | 'task'` 已够表达「会话型 vs 任务型」。群里被 @ 与单聊都归 `'chat'`——区分「被群叫去忙 vs 被单聊叫去忙」需要新的会话来源标注，超出本缺陷范围，记入 Open Questions。

## Risks / Trade-offs

- [修好审计后，真实部署的 `employees.json` 开始增长] → 审计是追加记录、已有容量与脱敏约束（`assertRedactedAuditMetadata`）；增长速率与能力使用频率同阶，可接受。
- [D2 改显式失败可能让某些从未真正组合过的路径暴露] → 属预期：这些路径本就没写审计；失败信息应指向缺失的 Agent 作用域。
- [成员会话在群投递中频繁创建/恢复，审计写入频率上升] → 审计写入走文件锁串行（`withFileLock`），且 `appendAudit` 在组合期一次；成员会话跨轮复用（本 arc 已实现），不会每轮写。
- [既有 3D 快照可能因 busy 翻转而变化] → 是恢复规格的预期差异，随实现刷新。

## Migration Plan

预发布期无兼容承诺。部署后审计开始增长；既有审计为空的部署在首次员工组合后即可恢复忙碌呈现。回滚 = 回退提交。

## Open Questions

- 是否需要在审计之外增加确定性会话 id 兜底（D3）——留待修好后观察是否仍有漏判。
- busy 是否需要区分会话来源（群 / 单聊 / 任务）——属呈现细化，另议。
