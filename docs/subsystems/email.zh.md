# 邮件

[English](email.md) | 中文

[`@deepseek-ai/dsh-email`](../../packages/email/email) 是通道注册表式的邮件 seam（`ctx.email`）。`send()` 解析为封闭的投递结果且永不 reject；provider 以稳定 id 注册纯文本 SMTP 通道，并经 [`ctx.credentials`](credentials.zh.md) 引用解析自身凭证，因此 SMTP 账号或授权码不会落入 cordis.yml。

来源：[`packages/email/email/src/types.ts`](../../packages/email/email/src/types.ts)

## 公开类型

```ts type-equiv
/** One plain-text email a caller asks to deliver. */
interface EmailMessage {
  /** Recipient address. */
  readonly to: string
  /** Subject line; non-empty. */
  readonly subject: string
  /** Plain-text body; non-empty. */
  readonly text: string
}
```

```ts type-equiv
/**
 * The closed outcome of one delivery attempt. `delivered: false` carries a
 * non-empty reason naming what failed; callers record it instead of throwing.
 */
type EmailDelivery =
  | { readonly delivered: true }
  | { readonly delivered: false; readonly reason: string }
```

```ts type-equiv
/** One SMTP transport a provider registers under a stable id. */
interface EmailTransport {
  /** Stable transport id used by configuration surfaces. */
  readonly id: string
  /**
   * Deliver one message. MUST resolve to a closed {@link EmailDelivery} —
   * never reject — so a failing mail path cannot crash the calling flow.
   * @param message - the message to deliver.
   */
  send(message: EmailMessage): Promise<EmailDelivery>
}
```

## 消费方

账户系统经 `ctx.email.send` 发送注册验证码与密码重置链接；QQ SMTP provider 经凭证服务解析 `SMTP_USER` / `SMTP_PASS`。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxemail--emailservice"></a>

### `ctx.email` — `EmailService`

The email service: a transport registry with fail-visible, non-throwing delivery.

```ts cordis-catalog
/**
 * Register one SMTP transport. Duplicate ids are rejected at registration.
 * @param transport - the transport; its `id` is the registry key.
 * @returns a disposer removing the registration, disposed with the calling fiber.
 * @throws when `transport.id` is already registered.
 */
register(transport: EmailTransport): () => void

/**
 * Enumerate the registered transport ids.
 * @returns the transport ids in registration order.
 */
listTransports(): readonly string[]

/**
 * Deliver one message through the addressed transport. Unknown transport ids
 * and throwing transports resolve to `{ delivered: false, reason }` — never
 * reject — so the calling flow survives an absent or broken mail path.
 * @param request - the message plus the transport id that should deliver it.
 * @returns the closed delivery outcome.
 */
async send(request: EmailSendRequest): Promise<EmailDelivery>
```

Source: [`packages/email/email/src/index.ts`](../../packages/email/email/src/index.ts)
<!-- END GENERATED cordis-surface -->
