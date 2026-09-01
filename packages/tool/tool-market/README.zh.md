# `@deepseek-ai/dsh-tool-market`

[English](README.md) | 中文

用于版本化工具 ZIP 包的受信任、重启后激活安装服务。

## 配置

`installRoot` 是托管包的用户私有目录。`trustedPublishers` 将发布者 ID 映射到 Ed25519 SPKI 公钥；重复 ID 会在解析时失败。Web bundle 从 `DSH_MARKET_TRUSTED_PUBLISHERS` 读取相同记录。

## 包生命周期

`tool-package.json` 声明包标识、版本、展示文本、请求的权限类别、工具名称与入参说明、插件入口、每个非描述符文件的 SHA-256 表以及独立发布者签名。安装会先验证有界 ZIP、规范化路径、文件表、描述符和受信任签名，再原子发布文件，且不会导入上传代码。

安装已有托管标识需要明确确认替换。安装、升级和卸载都会返回 `restartRequired: true`；新的 Host 组合会再次验证已安装描述符、签名和文件，然后导入入口插件。没有兼容市场清单的目录不会被替换或删除。

## Model Experience

无，因为包安装与清单展示不会改变提示词投影、模型请求或会话日志。

#### KV Cache effect

市场操作不会增加或修改请求历史；已安装插件在后续 Host 组合激活后产生的任何影响均由该插件负责。

## Known Limitations and Deferred Work

- **发布者信任来自本地配置** — 市场不提供公开发现、发布者身份或支付能力。
- **激活需要重启** — 上传的代码不会热加载，激活后的插件仍需自行负责运行时隔离。
