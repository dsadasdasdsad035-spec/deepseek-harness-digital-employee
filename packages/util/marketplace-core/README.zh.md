# `@deepseek-ai/dsh-marketplace-core`

[English](README.md) | 中文

托管技能、工具和 MCP 市场共用的安全与文件系统原语。

本包验证有界 base64 ZIP 输入，拒绝不安全或重复的规范化路径及不支持的文件项，解析版本化包描述符，验证 SHA-256 文件表和 Ed25519 签名，序列化托管清单，并执行按键串行的原子安装、替换、回滚与卸载。

托管变更只操作带有兼容 `.dsh-market.json` 记录且类型与标识匹配的目录。失败响应使用稳定代码和归档内相对名称，不暴露 Host 绝对路径。

## Publisher CLI

`dsh-market-package` bin 将源目录转换为可安装的 Tool 或 MCP 包。它依据实际字节计算描述符 `files` 的 SHA-256 表，用提供的身份替换发布者占位符，使用 Ed25519 对规范描述符载荷签名，并通过安装端共享的检查自检组装出的归档。

```sh
dsh-market-package ./my-package --kind tool --publisher-id my-publisher \
  --generate-key ./publisher.pem --output my-package.zip
```

命令在 stdout 输出匹配的 `DSH_MARKET_TRUSTED_PUBLISHERS` JSON 数组；私钥字节只留在密钥文件中，绝不出现在归档或 stdout。传入 `--trust-file <path>` 可把记录持久化到约定位置的受信任发布者文件（Harness home 下的 `market-publishers.json`，按发布者 id 合并、创建时仅属主可写），也可以在启动 shell 中导出打印的数组。配置了 `trustedPublishersFile` 的市场网关会合并文件与内联记录；文件格式错误、权限不安全或发布者 id 跨来源重复都会让组合失败。

## Model Experience

无，因为归档校验与托管文件系统变更不会改变提示词投影、模型请求或会话日志。

#### KV Cache effect

这些原语不会增加或修改请求历史。

## Known Limitations and Deferred Work

- **提供方集成相互独立** — 各市场提供方负责发布者信任存储与特定包类型的激活。
