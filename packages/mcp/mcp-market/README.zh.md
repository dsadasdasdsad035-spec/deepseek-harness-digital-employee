# `@deepseek-ai/dsh-mcp-market`

[English](README.md) | 中文

面向 Streamable HTTP 与 stdio MCP 包的托管安装和凭据引用配置服务。

## 配置

`installRoot` 是托管包的用户私有目录。`trustedPublishers` 包含 Ed25519 发布者公钥。Web bundle 从 `DSH_MARKET_TRUSTED_PUBLISHERS` 读取这些记录。

`stdioInterpreters`（默认 `['node']`）列出 stdio 服务可以使用的裸解释器命令名；安装与激活会以指名该命令的结构化失败拒绝其他命令。

`allowUnsignedPackages`（默认 `false`）是显式的开发开关：启用后安装与激活跳过发布者信任校验，但归档、描述符、文件表、所有权、凭据引用与原子性规则全部保持。Web bundle 默认启用，仅在启动环境设置 `DSH_MARKET_ALLOW_UNSIGNED=0` 时关闭；设置该值后，下一次组合即恢复严格校验。

## 包生命周期

`mcp-package.json` 声明包标识、版本、展示文本、任意传输的服务（可在一个包内混用）、固定请求头或环境变量值、凭据引用槽、每个非描述符文件的 SHA-256 表、可选的权限披露以及独立发布者签名。共享归档校验器和原子托管目录操作会应用与工具包相同的路径、大小、信任和所有权规则。

stdio 服务将可执行载荷装入签名文件表：`command` 必须是解释器白名单内的裸命令名，`args` 中所有含斜杠的条目必须是已声明文件，Host 在受管包目录下、于清洗过的父环境之上运行该服务。任何 stdio 服务都隐含 `subprocess` 权限，且市场在安装或升级此类包之前要求一次显式的本地执行确认（`confirmLocalExecution`）。

配置只持久化凭据引用名称，HTTP 请求头槽与 stdio 环境变量槽规则一致。解析后的值仅在 Host 通过 `McpClientManager` 挂载已配置服务时存在；列表、模板目录、诊断和发布数据都不包含这些值。使用凭据的请求头或环境变量必须具有空的固定值，包含疑似密钥值的请求会被拒绝。

安装、升级、配置和卸载都需要重启。新的 Host 会解析引用、检查服务名唯一性并挂载可用客户端。缺失包、凭据、解释器或冲突服务名会保留为明确诊断。

## Model Experience

无，因为包生命周期与凭据引用配置不会改变提示词投影、模型请求或会话日志。

#### KV Cache effect

市场操作不会增加或修改请求历史；后续 Host 组合挂载已配置服务后产生的工具 schema 与结果由 MCP 客户端负责。

## Known Limitations and Deferred Work

- **注册流程由外部负责** — 本包不提供公开发现、OAuth 注册或发布者身份服务。
- **解释器白名单默认仅含 `node`** — 部署方通过 `stdioInterpreters` 扩展列表；其他运行时（例如捆绑的 Python）属于文档化的配置变更，不需要新 schema。
