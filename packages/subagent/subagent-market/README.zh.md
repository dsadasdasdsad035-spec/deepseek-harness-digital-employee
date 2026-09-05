# `@deepseek-ai/dsh-subagent-market`

[English](README.md) | 中文

Managed install and employee-scoped mounting for marketplace subagent packages.

## 配置

`installRoot` is the private user directory for managed packages. `trustedPublishers` / `trustedPublishersFile` carry Ed25519 publisher keys; `allowUnsignedPackages` is the development override with the same semantics as the other package markets.

## 包生命周期

Install, upgrade, and uninstall are restart-bound; a fresh Host composition projects installed descriptors for employee mounting. Every install requires the explicit local-execution confirmation because subagent packages execute local code.

## 员工挂载

`mountEmployeeSubagents(agentCtx, bindings)` registers one model-facing surface per declared entry — `subagent__<id>` — composing the persona through the spawn driver. Bindings are instance-scoped: only the binding employee's composition exposes them.

## Model Experience

### 绑定的 subagent 资产

#### 模型看到的内容

Within a binding employee's composition, every declared entry registers as `subagent__<id>` — a tool that composes the declared persona through the spawn driver and returns its text output. Passive or unbound assets never appear.

#### Token effect

One short tool schema per bound entry, stable while the employee's bindings and package versions are unchanged.

#### KV Cache effect

Mounting or unbinding a package changes the request prefix on the next composition.

## 已知限制与推迟工作

- **Worker 线程隔离 workflow 执行但不是安全边界** —— 沿袭自 workflow 引擎。
- **仅支持声明式 persona** —— 不分发 provider 代码；spawn driver 是固定的执行后端。
