# Tool 市场 ZIP 模板

[English](README.md) | 中文

编辑 `tool-package.json`，声明每个 Tool 及其请求的权限，并确保 `plugin/index.js` 不包含安装时副作用。Host 校验 ZIP 时不会执行代码；受信任代码仅在新的 Host 组合启动后激活。

发布前，计算每个非描述符文件的 SHA-256，将小写哈希写入 `files`，使用 Ed25519 对规范描述符载荷签名，并替换发布者签名占位符。在 `DSH_MARKET_TRUSTED_PUBLISHERS` 中配置匹配的公钥。

签名载荷是完整描述符去除 `publisher.signature` 后的紧凑 JSON。请使用仓库辅助函数 `descriptorSignaturePayload()`，避免序列化差异。
