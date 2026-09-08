# @deepseek-ai/dsh-notification

English | [中文](README.zh.md)

Channel-registry notification seam. `ctx.notifications.send({channel, title, body, context?})` resolves to a closed delivery outcome — `{delivered: true}` or `{delivered: false, reason}` — and never rejects: an unknown channel id or a throwing channel becomes a visible failure result so the calling task flow survives an absent or broken alert path.

Providers register `NotificationChannel` implementations under stable ids (`register()` returns the disposer and rejects duplicates). `listChannels()` enumerates the registrations and `channelCredentials(id)` reports each channel's credential-reference configuration facts through the credentials describe path — configuration surfaces show setup state without ever touching a value; channels declare that surface with an optional `credentials()` hook. Three built-in providers ship as subpath plugins: `@deepseek-ai/dsh-notification/generic-webhook` (plain JSON document, any 2xx proves delivery), `.../wechat-work-bot` (WeChat Work group bot; the webhook key in the URL is the whole authentication — the platform defines no request signing; `errcode: 0` proves delivery, text is clipped to the 2048-byte ceiling), and `.../feishu-bot` (Feishu custom bot; an optional secret signs each attempt per the platform dialect — HMAC-SHA256 keyed by `timestamp\nsecret` over empty data, Base64 — with `timestamp` and `sign` riding the body; `code: 0` or the legacy `StatusCode: 0` proves delivery).

Every provider resolves its webhook URL (and optional secret) through [`ctx.credentials`](../../credentials/credentials/README.md) reference names in its config (`urlRef`, `secretRef`), so no endpoint URL or secret ever lands in cordis.yml; an unresolved reference fails visibly as "not configured" without attempting delivery. Delivery retries a configured count (default 2 extra attempts) with a per-attempt timeout; exhaustion returns the last failure reason. The exit-code contract of the employee task driver consumes these outcomes as log records only.

## Model Experience

None, as notifications are host-side alerts; nothing is appended to any model request.

#### KV Cache effect

None, as the seam contributes no prompt content.

## Known Limitations and Deferred Work

- **Text channels only** — every built-in provider posts one text document; rich cards and message templates are deferred until a consumer needs them.
- **No i18n of message content** — callers author titles and bodies; the seam never rewrites them.
