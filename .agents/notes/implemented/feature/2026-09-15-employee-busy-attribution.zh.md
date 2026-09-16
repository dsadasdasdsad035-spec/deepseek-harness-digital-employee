# Agent Note: 数字员工的能力归属真正写入审计日志

Status: implemented

[English](2026-09-15-employee-busy-attribution.md) | 中文

## Problem

3D 公司控制台早有「员工在会话里干活时座位显示在忙」的需求，场景侧代码（屏幕亮起、头顶标签、走回工位）也早已实现并上线。但它从未生效。对真实服务实测可见原因：让 `@项目经理` 写周报，60 秒内 40 次轮询 `companyFloor` 均报 `busy: false`——尽管其成员会话确实是运行中的 loop。

该判定经员工的持久审计记录反查会话：

```
busyVerdict(id) -> employeeSessionIds(id) -> digitalEmployees.listAudit(id)
```

而审计日志一直是空的。写入点 `installAudit` 用 `agentCtx.get('agent')` 读取当前 Agent，取不到 `undefined` 时提前返回。

`agentCtx` 来自 agent-loop 的 `scope.ctx.extend({ agent })`。但 `ctx.get(name)` 只读 cordis 的**服务注册表**（`provide()`），而 `extend()` 挂的是原型链上的普通属性——因此真实运行时 `get('agent')` 恒为 `undefined`，审计被静默跳过。单元测试未发现，是因为它们用 `provide('agent', child)` 注册 Agent——生产从不使用的形状：测试是绿的，线上是死的。

静默跳过还意味着 `digital-employee-capabilities` 的「能力使用可归属」需求从未真正成立，工位屏幕的对话摘要（同样源自审计）也一直空白。

## Decision

- **把当前 Agent 当作作用域属性读取，而非服务。** `agentCtx.agent` 命中声明合并的 `Context.agent`，正是 agent-loop `extend({ agent })` 提供的那个。服务查询才是缺陷。
- **Agent 缺失时不再跳过。** 缺失是组合接线错误，不是丢失归属的理由，因此改为抛出并指明员工与作用域。静默 `return` 正是它得以潜伏的原因。
- **忙碌判定保持审计派生。** 成员会话 id 是确定性的（`session-group-member-<companyId>-<employeeId>`），可以不经审计直接推导，但审计是归属的权威；第二条确定性路径既绕过该权威，又会掩盖未来再次出现的审计断链。修好写入端即恢复读取端。
- **不动场景。** `busyVerdict` 对任何运行中的员工会话本就返回会话型在忙；一旦会话可知，既有场景呈现自然完成其余部分。

## Alternatives considered

- **在 agent-loop 里把 Agent 注册为服务**（`provide('agent', this)`）使 `get('agent')` 可用——会把本次修复扩散到 loop 的服务面，且与既有 `Context.agent` 声明重复。否决。
- **给 `compose` 新增 Agent 参数**——`compose` 已收到 `agentCtx`，再加一条通道冗余。否决。
- **在 `busyVerdict` 里加确定性会话 id 兜底**——理由见上，否决；记为开放问题。

## Consequences

对真实服务（真实模型调用）端到端验证：群 @提及后 1.5 秒 `busy` 翻为 ON（kind 为 `chat`），回合结束约 9 秒后转 OFF；`employees.json` 从 0 增至 6 条审计记录，全部归属到 `session-group-member-…`（员工的群成员会话）。包级测试现覆盖员工任务路径（创建与恢复）且用生产实际使用的 `extend({ agent })` 形状，另有专门回归断言 `agentCtx.get('agent')` 为 `undefined` 时归属仍落盘。附带收益：此前形同虚设的归属需求现在真正成立，工位屏幕对话摘要重新有数据。

## Problem space left open

- `busyVerdict` 是否应保留确定性会话 id 兜底以防归属再次回归（有意未加）。
- 忙碌是否该区分「谁把员工叫去干活」（群 / 单聊 / 自主任务）；当前两条会话路径都读作单一 `chat` 类型。
- 座位标签文案是「在忙」而需求文本写「工作中」——属文案决策，本次未处理。
