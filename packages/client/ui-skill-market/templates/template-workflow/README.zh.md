# Workflow 市场模板

[English](README.md) | 中文

面向市场 workflow 包（`workflow-package.json`）的发布者模板。`workflows` 中每个条目把一个脚本绑定到挂载时引擎注册的 workflow id：

- `entry` —— 必须声明在 `files` 中的 workflow 脚本；由 worker 线程执行，依赖需随包携带。
- `timeoutSec` —— 可选的逐 workflow 超时。

替换发布者占位符，用 `dsh-market-package --kind workflow` 签名，并通过市场 Workflows 标签页上传。
