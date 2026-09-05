# Agent Note: 市场钩子包与员工钩子绑定

状态：已实现

[English](2026-09-04-marketplace-employee-hooks.md) | 中文

## 问题

代理生命周期钩子此前只能由 Host 配置，市场与数字员工都无法获取拦截行为，也没有任何机制把钩子绑定到特定员工。

## 决策

`hook` 成为第三种市场包 kind，复用 tool/mcp 机制（信任、文件表、披露、托管生命周期）。描述符条目把一条 shell 命令绑定到一个拦截事件；`invocable` 条目额外注册 `hook__<id>` 工具，聊天参与者可按需触发。除 SessionStart 外每个条目必须声明非空 matcher，避免“永远生效”的钩子静默上线。员工模板按 id 引用已安装的钩子包；组合时解析引用，缺失即在 Session 创建前失败。绑定为实例作用域：桥挂载在员工组合上下文，绝不挂载到 host 平面。

## 已否决的备选方案

- **生成 Claude Code hooks.json 复用现有桥**——会让类型化表面穿过外语 dialect 解析器，且丢失 invocable 工具注册。
- **全局钩子安装**——与实例作用域冲突；Host 级钩子仍是 cordis.yml 的职责。

## 后果

钩子包以与 stdio MCP 包相同的披露姿态执行本地代码。kind 加宽仅在仓库内构成编译期破坏。invocable 钩子以 `hook__` 前缀扩展工具命名空间，遵循与 `mcp__` 相同的唯一性纪律。
