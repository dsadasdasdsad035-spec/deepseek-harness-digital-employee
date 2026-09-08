# @deepseek-ai/dsh-email

[English](README.md) | 中文

DeepSeek Harness 的邮件 seam（`ctx.email`）：通道注册表 + fail-visible、不抛错的投递。`send({transport, to, subject, text})` 解析为 `{ delivered: true }` 或 `{ delivered: false, reason }`；未知通道与抛错通道都转为失败结果，绝不 reject。SMTP 凭证经 [`ctx.credentials`](../../credentials/credentials/README.zh.md) 引用解析——绝不来自 cordis.yml 或代码。

`qq-smtp` 子路径插件提供 QQ 邮箱 transport（smtp.qq.com:465 SSL；密码为 QQ 授权码，非登录密码）。有限重试，单次投递超时；投递失败返回最后一次原因。

## Model Experience

无，本 seam 不承载提示词、工具或会话内容；消息的用户可见渲染由消费方负责。

#### KV Cache effect

无。

## Known Limitations and Deferred Work

- **仅纯文本** — 本 seam 不支持 HTML 邮件、附件或抄送/密送。
- **单一 SMTP transport** — 仅内置 QQ transport；其他 provider 是同一契约的薄变体。
- **有限重试** — 投递失败在配置次数后返回最后原因；无排队或重放。
