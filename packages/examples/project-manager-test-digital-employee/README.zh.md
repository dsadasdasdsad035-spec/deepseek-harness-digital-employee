# @deepseek-ai/dsh-project-manager-test-digital-employee

[English](README.md) | 中文

这是 `project-manager-test` 数字员工的离线确定性参考包。Web 开发 bundle 会注册它，用于手动测试数字员工管理；项目看板、项目文档、MCP server、skills 和 Atlas 记忆都使用静态 fixture 数据。

该包保留 `1.0.0` 供已有员工使用，并为新员工发布 `1.1.0`。从 `1.1.0` 创建员工时，会原子写入一条带有包内溯源的非敏感 Atlas 长期记忆。已有员工不会被回填。

根项目经理只授权三项 skills、两个本地工具和一个 stdio MCP 客户端。它可以向 `risk-reviewer` 专家委派一次审查；该专家仅拥有 `risk-review` skill、项目证据工具、`project-data` MCP 客户端和长期记忆访问权限。专家不能继续向其他专家或 subagent 委派。`AGENTS.md` 要求在汇报项目状态前使用已声明的能力取得证据。

该包不会访问模型、网络服务、凭据提供者或真实项目管理 API。

## 模型体验

### Project Manager 上下文

#### 模型看到的内容

员工 Consumer 把包内 `AGENTS.md`、项目经理个性、已初始化的 Atlas 记忆投影、三项 skills、两个本地工具和一个作用域化 project-data MCP 工具渲染为已记录的根上下文。Risk Reviewer 子会话只获得其声明的指令、risk-review skill、项目证据工具、project-data MCP 客户端和长期记忆投影。

#### Token 影响

静态项目经理指令、skill 文件和有界 Atlas 记忆会增加确定性的提示词内容。根和专家的工具与 MCP schema 仅在各自声明的能力范围内可见。

#### KV Cache 影响

员工模板版本、固定指令资产和有界记忆投影决定可复用的提示词前缀。不同的记忆查询、被接受的持久化决策或委派给 Risk Reviewer 的轮次会改变相关上下文。

## 已知限制与后续工作

- **仅用于测试的夹具数据**：Atlas 里程碑、负责人、风险、项目看板和文档响应均为静态数据，不代表生产项目管理 provider。
- **固定能力集合**：`1.1.0` 只暴露一个有界的 Risk Reviewer，不授予通用 subagent 委派能力，也不提供可编辑的记忆种子、专家定义或生产项目管理访问。
