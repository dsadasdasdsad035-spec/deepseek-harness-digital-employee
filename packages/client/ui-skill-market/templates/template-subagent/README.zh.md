# Subagent 市场模板

[English](README.md) | 中文

面向声明式 subagent persona 包（`subagent-package.json`）的发布者模板。`subagents` 中每个条目声明一个委托时由 spawn driver 组合的子代理 persona：

- `instructions` —— 必须声明在 `files` 中的 persona 指令文件；不接受 provider 代码。
- `tools` —— 子代理的工具白名单。
- `delegation` —— 可选策略（`mode`、`maxDepth`、`maxConcurrency`、`timeoutMs`），在每次委托时执行。

替换发布者占位符，用 `dsh-market-package --kind subagent` 签名，并通过市场 Subagents 标签页上传。
