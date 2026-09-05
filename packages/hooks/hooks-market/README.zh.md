# `@deepseek-ai/dsh-hooks-market`

[English](README.md) | 中文

面向 `hook-package.json`（与 Tool、MCP 并列的第三种包 kind）的托管安装、凭据引用配置与员工作用域挂载。

## 配置

`installRoot` 是受管钩子包的用户私有目录。`trustedPublishers` / `trustedPublishersFile` 携带 Ed25519 发布者公钥；`stdioInterpreters`（默认 `['node']`）允许列出裸解释器命令；`allowUnsignedPackages` 与其他包市场的开发开关语义一致。

## 生命周期

安装、升级、配置和卸载均需重启：新的 Host 组合才会解析已安装描述符供员工挂载。凭据引用只持久化名称；解析值仅存在于单次钩子运行的环境中。每个钩子包安装都需要显式的本地执行确认。

## 员工挂载

`mountEmployeeHooks(agentCtx, bindings)`（见 `src/bridge.ts`）为每个声明的事件注册被动拦截处理器，并为每个 `invocable` 钩子注册一个 `hook__<id>` 模型工具，执行走共享的 `dsh-hook-protocol` runner。绑定为实例作用域：只有绑定员工的组合会运行这些命令。

## Model Experience

### 可调用钩子工具

#### 模型看到的内容

仅声明为 `invocable` 的钩子会出现，作为绑定该包的员工组合中的 `hook__<id>` 工具。一次调用以 `{ "input": ... }` 作为 stdin 载荷运行钩子命令，并将命令的 stdout 作为工具结果返回。被动钩子绝不作为工具出现；其作用通过拦截点（阻止结果、注入上下文）到达模型。

#### Token effect

每个绑定的 invocable 钩子一个工具 schema：简短的名称、描述和一个可选的字符串参数。

#### KV Cache effect

工具 schema 属于请求前缀；在员工的钩子绑定与包版本不变时保持稳定。挂载或解绑包会在下一次请求改变前缀。
## Known Limitations and Deferred Work

- **被动的 SessionStart 绑定随 Host 挂载，而非逐员工回合**——实例作用域完整覆盖四个回合内事件点；分离的 SessionStart 行为沿用 Host 级桥。
- **钩子输入重写仍被推迟**——`updatedInput` 与其他桥一样，仍受 pre-tool-input-rewrite Agent Note 约束。
