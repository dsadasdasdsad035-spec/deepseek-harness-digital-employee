# @deepseek-ai/dsh-email

English | [中文](README.zh.md)

Email seam for the DeepSeek Harness (`ctx.email`): a transport registry with fail-visible, non-throwing delivery. `send({transport, to, subject, text})` resolves to `{ delivered: true }` or `{ delivered: false, reason }`; unknown transports and throwing transports become failure results, never rejections. SMTP credentials resolve through [`ctx.credentials`](../../credentials/credentials/README.md) references — never from cordis.yml or code.

The `qq-smtp` subpath plugin ships the QQ Mail transport (smtp.qq.com:465 SSL; the password is the QQ-issued authorization code 授权码, not the login password). Bounded retries with a per-attempt timeout; delivery failure returns the last reason.

## Model Experience

None, as this seam carries no prompt, tool, or session content; consumers own any user-visible rendering of their messages.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Plain text only** — no HTML mail, attachments, or CC/BCC in this seam.
- **Single SMTP transport** — only the QQ transport ships; other providers are thin variations of the same contract.
- **Bounded retry** — delivery failures return the last reason after the configured attempts; no queueing or replay.
