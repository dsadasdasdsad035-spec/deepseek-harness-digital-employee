# `@deepseek-ai/dsh-mcp-market`

[English](README.md) | 中文

用于声明式 Streamable HTTP MCP 包的托管安装和凭据引用配置服务。

## 配置

`installRoot` 是托管包的用户私有目录。`trustedPublishers` 包含 Ed25519 发布者公钥。Web bundle 从 `DSH_MARKET_TRUSTED_PUBLISHERS` 读取这些记录。

## 包生命周期

`mcp-package.json` 声明包标识、版本、展示文本、Streamable HTTP 服务、固定请求头、凭据引用槽、每个非描述符文件的 SHA-256 表以及独立发布者签名。共享归档校验器和原子托管目录操作会应用与工具包相同的路径、大小、信任和所有权规则。

配置只持久化凭据引用名称。解析后的值仅在 Host 通过 `McpClientManager` 挂载已配置服务时存在；列表、模板目录、诊断和发布数据都不包含这些值。使用凭据的请求头必须具有空的固定值，包含疑似密钥值的请求会被拒绝。

`marketplace-test-mcp.zip` 声明 endpoint 引用 `MARKETPLACE_TEST_MCP_ENDPOINT` 与凭据引用 `MARKETPLACE_TEST_MCP_TOKEN`，不嵌入任一解析值。离线测试把 endpoint 绑定到使用临时端口的本机服务。模板投影会省略由凭据引用拥有的固定请求头项，并且只持久化 `headerCredentials`。

安装、升级、配置和卸载都需要重启。新的 Host 会解析引用、检查服务名唯一性并挂载可用客户端。缺失包、凭据或冲突服务名会保留为明确诊断。

## Model Experience

无，因为包生命周期与凭据引用配置不会改变提示词投影、模型请求或会话日志。

#### KV Cache effect

市场操作不会增加或修改请求历史；后续 Host 组合挂载已配置服务后产生的工具 schema 与结果由 MCP 客户端负责。

## Known Limitations and Deferred Work

- **传输支持有限** — 托管包仅支持 Streamable HTTP。
- **注册流程由外部负责** — 本包不提供公开发现、OAuth 注册、本地命令传输或发布者身份服务。
