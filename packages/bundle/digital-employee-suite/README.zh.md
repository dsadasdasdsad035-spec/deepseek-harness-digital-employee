# `@deepseek-ai/dsh-digital-employee-suite`

[English](README.md) | 中文

这是一个 Web 可选扩展 bundle。它为已经包含 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 的 profile 增加数字员工操作、Template configuration、示例模板、员工持久化和 `@数字员工` 输入源。

在目标 profile 中执行 `dsh plugin --profile <name> add @deepseek-ai/dsh-digital-employee-suite`，或者把这个包加入 profile，并放在 `@deepseek-ai/dsh-web-app` 之后。该 bundle 不重复注册 `api-remotes`、Skill/Tool/MCP 市场或市场设置 UI，这些行仍由 `dsh-web-app` 负责。

员工记录和模板配置都保存于目标工程自己的 `$DSH_HOME`。bundle 不包含用户员工、模板、市场压缩包、开发机绝对路径或已解析凭据。升级或卸载 bundle 不会删除 `$DSH_HOME` 下的用户文件。

## 模型体验

### 数字员工上下文

#### 模型看到的内容

用户与受管理的数字员工开始聊天时，组合后的 Host 会解析该员工的已发布模板、指令、声明的技能、工具、MCP 服务、专家和记忆投影。suite 提供管理与聊天入口；Web bundle 提供共享的市场和 API remote 组合。

#### Token 影响

员工的指令文件、选中的能力说明和允许访问的记忆记录只会加入该员工会话。已安装但未激活的市场包不会作为可用能力暴露。

#### KV Cache 影响

已发布的模板版本和稳定的指令资源组成可复用的提示词前缀。员工选中的能力或记忆投影变化会影响后续会话上下文。

## 已知限制与延期工作

- **依赖 Web bundle**：该扩展不重复注册 Web bundle 的 API remote 或 Skill/Tool/MCP 市场行；使用方 profile 必须提供 `@deepseek-ai/dsh-web-app`。
- **重启后激活**：新安装的 Tool 和 MCP 包只有通过正常的 Host 激活与重启检查后才可选择。
- **目标本地配置**：员工记录、Template configuration 草稿和市场安装内容不会从 bundle 作者的机器迁移。
