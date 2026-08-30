# @deepseek-ai/dsh-project-manager-test-digital-employee

[English](README.md) | 中文

这是 `project-manager-test` 数字员工的离线确定性参考包。Web 开发 bundle 会注册它，用于手动测试数字员工管理；项目看板、项目文档、MCP server、skills 和记忆种子都使用静态 Atlas 夹具数据。

模板只授权三项 skills、两个本地工具和一个 stdio MCP 客户端，不包含专家 agent 或通用 subagent 权限。`AGENTS.md` 要求在汇报项目状态前使用已声明的能力取得证据。

该包不会访问模型、网络服务、凭据提供者或真实项目管理 API。

## 模型体验

### Project Manager 上下文

#### 模型看到的内容

员工 Consumer 把包内 `AGENTS.md`、项目经理个性、Atlas 种子记忆投影、三项 skills、两个本地工具和一个作用域化 project-data MCP 工具渲染为已记录的员工上下文。

#### Token 影响

静态项目经理指令、skill 文件和有界 Atlas 记忆会增加确定性的提示词内容。工具与 MCP schema 仅在模板声明的能力范围内可见。

#### KV Cache 影响

员工模板版本、固定指令资产和有界记忆投影决定可复用的提示词前缀。不同的记忆查询或被接受的持久化决策会改变相关轮次的上下文。

## 已知限制与后续工作

- **仅用于测试的夹具数据**：Atlas 里程碑、负责人、风险、项目看板和文档响应均为静态数据，不代表生产项目管理 provider。
- **固定能力集合**：该包只声明一个员工修订，并刻意不授予专家 agent 或通用 subagent 委派能力。
