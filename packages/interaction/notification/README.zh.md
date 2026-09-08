# @deepseek-ai/dsh-notification

[English](README.md) | 中文

通道注册表式通知 seam。`ctx.notifications.send({channel, title, body, context?})` 解析为封闭的投递结果——`{delivered: true}` 或 `{delivered: false, reason}`——且永不 reject：未知的通道 id 或抛出异常的通道都会变成可见的失败结果，因此发起通知的任务流程不会因告警路径缺失或损坏而崩溃。

Provider 以稳定 id 注册 `NotificationChannel` 实现（`register()` 返回注销函数并拒绝重复 id）。`listChannels()` 枚举已注册通道，`channelCredentials(id)` 经 credentials 的 describe 路径报告各通道的凭证引用配置事实——配置面据此展示设置状态而绝不接触值；通道以可选的 `credentials()` 钩子声明该能力。内置三个 provider 以子路径插件形式发布：`@deepseek-ai/dsh-notification/generic-webhook`（通用 JSON 文档，任意 2xx 即视为送达）、`.../wechat-work-bot`（企业微信群机器人；URL 中的 webhook key 即全部鉴权——平台不为这些机器人定义请求签名；`errcode: 0` 即视为送达，文本按 2048 字节上限裁剪）、`.../feishu-bot`（飞书自定义机器人；可选的 secret 按平台方言为每次投递签名——以 `timestamp\nsecret` 为 key、对空数据做 HMAC-SHA256、Base64 编码——`timestamp` 与 `sign` 随请求体携带；`code: 0` 或旧版 `StatusCode: 0` 即视为送达）。

每个 provider 通过 [`ctx.credentials`](../../credentials/credentials/README.zh.md) 以配置中的引用名（`urlRef`、`secretRef`）解析自己的 webhook URL（及可选 secret），因此任何端点 URL 或 secret 都不会落到 cordis.yml；未解析的引用以"未配置"可见地失败，不尝试投递。投递按配置次数重试（默认额外 2 次）并带单次超时；耗尽后返回最后一次失败原因。员工任务驱动的退出码契约只把这些结果作为日志记录消费。

## Model Experience

无；通知是宿主侧告警，不会向任何模型请求追加内容。

#### KV Cache effect

无；本 seam 不贡献任何提示词内容。

## Known Limitations and Deferred Work

- **仅文本通道** — 所有内置 provider 都只投递一份文本文档；富卡片与消息模板推迟到有消费方需要时再做。
- **消息内容不做 i18n** — 标题与正文由调用方撰写；seam 从不改写。
