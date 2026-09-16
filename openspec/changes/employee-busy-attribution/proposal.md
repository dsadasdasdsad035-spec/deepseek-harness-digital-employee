# employee-busy-attribution

## Why

`company-3d-console` 的「忙/闲状态实时呈现」需求（含「会话开始实时变忙」场景）在实际部署中**从不生效**：员工在会话里干活时，工位屏幕不亮、头顶标签不翻、小人也不回工位。

实测（无鉴权实例 + 真实模型）：在星桥科技群 `@项目经理` 让其写周报，60 秒内轮询 `companyFloor` 40 次，`项目经理.busy` **始终 false**——尽管其成员会话确实是运行中的 loop。

根因是一条静默断链。`busyVerdict` 通过审计记录反查员工的会话身份：

```
busyVerdict(id)                                  company-management/src/index.ts:410
  └─ employeeSessionIds(id)                      :404
       └─ ctx.digitalEmployees.listAudit(id)     → 读审计记录里的 sessionId
            └─ 审计记录数 = 0  ← 断点
```

审计本该在员工组合时写入（`installAudit`，`digital-employee-agent/src/index.ts:1021`），但其首行是：

```ts
const agent = agentCtx.get('agent')
if (agent === undefined) return   // 真实运行时恒真 → 静默返回
```

`agentCtx` 来自 agent-loop 的 `scope.ctx.extend({ agent })`（`agent-loop/src/agent.ts:95`），而 `ctx.get()` 只查 cordis 的 **service store**（`provide()` 注册的服务，`vendor/cordis/src/reflect.ts:233`）；`extend()` 挂的是原型链上的普通属性。因此 `get('agent')` 在真实运行时恒为 `undefined`，审计**从不写入**。

单元测试未发现，是因为测试用 `childCtx.provide('agent', child)` 把它显式注册成了服务——测试假绿，线上真断。

连带影响：审计为空的沉默代价还包括能力归属无法追溯（`digital-employee-capabilities` 的「Capability use is attributable」实际未生效）与工位屏幕对话摘要（`chatTail`）始终为空。

## What Changes

- 员工组合的审计安装 SHALL 从 Agent 作用域正确取得当前 Agent，使能力配置、技能选择、工具调用等审计记录真正落盘。
- 员工的会话归属 SHALL 因此可从审计记录派生，`busyVerdict` 能识别运行中的员工会话。
- 由此恢复既有规格行为：员工在会话/群成员会话中干活时，内部场景实时呈现「在忙」（亮屏、工作动画、头顶标签、回到工位）；干完转为「空闲」并可外出活动。
- 审计回归测试 SHALL 覆盖**员工组合路径**（`createTask` / `resumeTask`），而非仅专家组合路径。

## Capabilities

### Modified Capabilities

- `digital-employee-capabilities`: 让「Capability use is attributable」在真实运行时成立——审计安装在员工组合路径上必须取到 Agent，否则审计静默缺失。
- `company-3d-console`: 明确「忙/闲状态实时呈现」的会话来源包含**员工所有承载会话**（单聊与公司群成员会话），并补一条以群 @提及为触发源的可验证场景。

## Impact

- `packages/core/digital-employee-agent`：`installAudit` 取 Agent 的方式（属性直读而非服务查询）；`createTask`/`resumeTask`/专家组合三处审计路径。
- `packages/host/company-management`：`busyVerdict`/`employeeSessionIds` 是否需要在审计之外增加确定性兜底（见 design）。
- 数据面：`digital-employees/employees.json` 的 `audits` 将开始增长（真实部署此前恒为 0）。
- 无事件格式变更；审计记录是既有格式。
