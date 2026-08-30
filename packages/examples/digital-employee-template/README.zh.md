# @deepseek-ai/dsh-digital-employee-example-template

[English](README.md) | 中文

Operations Coordinator 数字员工的交付示例模板。该插件在自身 Cordis effect 生命周期内，把不可变版本 `1.0.0` 与 `2.0.0` 注册到 `ctx.digitalEmployees`。

两个版本都使用 `standard` preset、包内 `AGENTS.md` 指令，以及一个带包内指令、可继续的 Independent Reviewer 专家。版本 `1.0.0` 只授权该专家；版本 `2.0.0` 修订 coordinator 指令，并允许通用 subagent，从而提供具体的升级预览与授权审查路径。

模板不声明 skill、工具或 MCP server。其 reviewer 不拥有任何能力，可以访问任务与 Session 记忆，不允许继续向下委派，最多运行一个子级，超时为 30 秒。

## 模型体验

### Operations Coordinator 上下文

#### 模型看到的内容

员工 Consumer 把所选版本的包内 `AGENTS.md`、coordinator 个性与 Independent Reviewer 指令渲染为已记录的员工和专家上下文。

#### Token 影响

所选 coordinator 与 reviewer 指令文件会增加稳定的提示词内容；当实例与父级权限允许时，版本 `2.0.0` 还可能暴露通用 subagent schema。

#### KV Cache 影响

实例在两个模板版本之间升级，或改变个性与授权时，前缀会变化。

## 已知限制与后续工作

- **仅用于演示权限**：该模板刻意不声明工具、skill 或 MCP server；部署需要发布另一个模板来演示这些能力类型。
- **固定的示例修订**：指令文本与两个版本标识符都是包资产，不是运行时配置。
