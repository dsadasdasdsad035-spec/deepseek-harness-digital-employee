# MCP 市场 ZIP 模板

[English](README.md) | 中文

编辑 `mcp-package.json` 以声明 Streamable HTTP 服务。`credentialReferences` 将 HTTP 请求头映射到凭据引用 slot。对应的固定 `headers` 值必须保持为空。切勿在此 ZIP 中放入 API 密钥、token、密码或解析后的授权值。

发布前，使用 Ed25519 对规范描述符载荷签名，并替换发布者签名占位符。在 `DSH_MARKET_TRUSTED_PUBLISHERS` 中配置匹配的公钥。

签名载荷是完整描述符去除 `publisher.signature` 后的紧凑 JSON。请使用仓库辅助函数 `descriptorSignaturePayload()`，避免序列化差异。
