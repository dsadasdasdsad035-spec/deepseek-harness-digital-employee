# Agent Note: 数字员工 suite 拥有市场、员工、公司三个域

Status: implemented

[English](2026-09-22-suite-owns-market-employee-company-rows.md) | 中文

## 问题

`dsh-digital-employee-suite` 作为可选扩展发布时，`dsh-web-app` 仍然内联了全部市场、数字员工和公司配置行。此时不存在可以独立安装的单元：在精简的 Web bundle 上安装 suite 什么也带不来，三个域也无法作为一个插件交付给其他部署。

## 决策

所有权翻转。suite 的 `cordis.patch.yml` 现在拥有六个市场（Skill/Tool/MCP/Hook/Workflow/Subagent）、带 SQLite 持久化与管理的数字员工运行时（保留 `studioFile` 默认值）、以及带文件存储、管理网关和群聊的公司模块，外加三个浏览器行（`ui-skill-market`、`ui-digital-employees`、`ui-companies`）。`dsh-web-app` 保留共享的 `api-remotes` 载体和通用浏览器表层，不再依赖任何域包。`PROFILE_TEMPLATES.web` 组合 `[dsh-base, dsh-web-app, dsh-digital-employee-suite]`，shipped 表层行为不变；拆分前的 `[dsh-base, dsh-web-app]` 元组登记进 `INSTALLATION_OWNED_PROFILE_TUPLES`，既有的 web profile 在下次加载时自动归一化，任何自定义列表仍归用户所有。suite 进入 `apps/cli` 的依赖闭包，`healProfilesModuleFallback` 得以为内置解析链接全部域包；装配级 harness（jsdom assembled boot、Web e2e scaffold、Web presets e2e）组合同样的三层栈。

## 考虑过的替代方案

- **在 suite 中重述这些行、Web bundle 继续持有：** 否决；在 shipped 组合上安装 suite 只是无操作的同名覆盖，实际上什么都不可安装。
- **拆成三个 bundle（市场、员工、公司）：** 否决；使用方要的是一个能力集和一条安装命令，且 Template configuration 本就依赖市场目录。
- **维持域行在 Web bundle 内、不提供可安装单元：** 否决；这正是促成翻转的原状，且没有分发路径。

## 影响

树外部署用 `dsh plugin --profile <name> add @deepseek-ai/dsh-digital-employee-suite` 一次安装三个域。仅含 Web 的 profile 启动通用控制台：客户端仍会挂载全部远程 namespace（`api-remotes` 的集合在构建期固定），缺少对应域 Host 行的调用以 `service-unavailable` 失败——与任何未挂载 Host 行的形态一致，而会发起这些调用的域浏览器行同样不存在。既有 web profile 自动归一化到三层模板；回滚时把 suite 从 profile 移除即恢复通用表层，不触碰 `$DSH_HOME` 数据。被取代的 Web bundle 组合测试已删除并重写了 suite 测试，顺带清掉了它们围绕已退役 `digital-employee-file` provider 的存量漂移。
