# Hook 市场模板

[English](README.md) | 中文

面向市场钩子包（`hook-package.json`）的发布者模板。`hooks` 中每个条目把一条 shell 命令绑定到一个代理拦截事件：

- `event` —— `UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`、`SessionStart` 之一。
- `matcher` —— 除 `SessionStart` 外必填；桥按事件查询主体求值（与 Claude Code 相同的字面量或正则）。
- `command` —— Host 白名单内的裸解释器名（默认 `['node']`）；含 `/` 的 `args` 条目必须声明在 `files` 中。
- `invocable` —— 为 `true` 时，安装会额外注册 `hook__<id>` 模型工具，聊天参与者可按需触发钩子。

替换发布者占位符，用 `dsh-market-package --kind hook` 签名，并通过市场 Hooks 标签页上传。随附的 `hooks/echo.js` 测试钩子会回显其 stdin 载荷摘要，使安装 → 绑定 → 触发全链路可观测。
