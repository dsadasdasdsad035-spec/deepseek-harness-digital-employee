# `@deepseek-ai/dsh-digital-employee-suite`

[English](README.md) | 中文

这是一个可安装的 profile bundle 层，在 Web 面之上拥有三个业务域：Skill/Tool/MCP/Hook/Workflow/Subagent 六个市场、带管理与 Template configuration 的数字员工运行时、以及带 3D 园区控制台和群聊的公司模块。将它叠在 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app` 之上；shipped web profile 模板已经默认叠加它，因此普通的 `dsh web` 部署具备全部能力。

在其他 profile 中执行 `dsh plugin --profile <name> add @deepseek-ai/dsh-digital-employee-suite` 即可安装，或把这个包加入 profile，并放在 `@deepseek-ai/dsh-web-app` 之后（`dsh.profile.bundles`）。该 bundle 拥有全部域 Host 行与浏览器行（`ui-skill-market`、`ui-digital-employees`、`ui-companies`）；这些域的远程调用经由的共享 `api-remotes` 载体仍由 `dsh-web-app` 提供，两个 bundle 同时加载不会重复注册任何 namespace。

员工记录、公司数据和市场安装内容都保存于目标工程自己的 `$DSH_HOME`。bundle 不包含用户员工、公司、模板、市场压缩包、开发机绝对路径或已解析凭据。升级或卸载 bundle 不会删除 `$DSH_HOME` 下的用户文件。

## 模型体验

### 数字员工上下文

#### 模型看到的内容

用户与受管理的数字员工开始聊天时（`@数字员工` 输入源或管理页），组合后的 Host 会解析该员工的已发布模板、指令、声明的技能、工具、MCP 服务、专家和记忆投影，并追加记录该组合的持久化 `digital-employee/identity` 事件。suite 拥有市场、员工与公司贡献；Web bundle 提供共享的 API 载体。

#### Token 影响

员工的指令文件、选中的能力说明和允许访问的记忆记录只会加入该员工会话。已安装但未激活的市场包不会作为可用能力暴露。

#### KV Cache 影响

已发布的模板版本和稳定的指令资源组成可复用的提示词前缀。员工选中的能力或记忆投影变化会影响后续会话上下文。

## 已知限制与延期工作

- **依赖 Web bundle**：suite 的远程调用走 Web bundle 挂载的 `api-remotes` 载体与浏览器 roster；使用方 profile 必须提供 `@deepseek-ai/dsh-web-app`。
- **重启后激活**：新安装的 Tool 和 MCP 包只有通过正常的 Host 激活与重启检查后才可选择。
- **目标本地配置**：员工记录、公司数据、Template configuration 草稿和市场安装内容不会从 bundle 作者的机器迁移。
