# Agent Note: 市场工作流与子代理包对数字员工的支持

状态：已实现

[English](2026-09-05-marketplace-employee-workflows-subagents.md) | 中文

## 问题

工作流和子代理此前只能由 Host 配置为代码插件，数字员工无法从市场获取编排脚本或子代理 persona，模板作者也无法绑定它们。

## 决策

`workflow` 和 `subagent` 成为第四和第五种市场包 kind。workflow 条目声明绑定签名文件表的引擎脚本；subagent 条目声明子代理 persona（指令文件、工具白名单、委托策略），绝不携带 provider 代码——in-process spawn driver 是固定的执行后端。员工模板按 id 引用两种 kind；组合时解析引用，未解析即在任务启动前失败。挂载的资产注册 `workflow__<id>` 工具和 `subagent__<id>` provider，作用域仅限绑定员工的组合。

## 已否决的备选方案

- **将市场资产内联到员工包中**——重复六种市场格式并破坏资产版本独立性。
- **全局资产挂载**——与实例作用域冲突；Host 级资产仍是 cordis.yml 的职责。

## 后果

子代理 persona 扩大了可启动子进程的主体范围，但 spawn driver 的工具过滤与委托策略执行限制了风险。workflow 脚本在 worker 线程中运行（隔离但非安全边界）。kind 加宽仅在仓库内构成编译期破坏。
