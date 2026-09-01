# `@deepseek-ai/dsh-marketplace-core`

[English](README.md) | 中文

托管技能、工具和 MCP 市场共用的安全与文件系统原语。

本包验证有界 base64 ZIP 输入，拒绝不安全或重复的规范化路径及不支持的文件项，解析版本化包描述符，验证 SHA-256 文件表和 Ed25519 签名，序列化托管清单，并执行按键串行的原子安装、替换、回滚与卸载。

托管变更只操作带有兼容 `.dsh-market.json` 记录且类型与标识匹配的目录。失败响应使用稳定代码和归档内相对名称，不暴露 Host 绝对路径。

## Model Experience

无，因为归档校验与托管文件系统变更不会改变提示词投影、模型请求或会话日志。

#### KV Cache effect

这些原语不会增加或修改请求历史。

## Known Limitations and Deferred Work

- **提供方集成相互独立** — 各市场提供方负责发布者信任存储与特定包类型的激活。
