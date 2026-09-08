# Email

English | [中文](email.zh.md)

[`@deepseek-ai/dsh-email`](../../packages/email/email) is the transport-registry email seam (`ctx.email`). `send()` resolves to a closed delivery outcome and never rejects; providers register plain-text SMTP transports under stable ids and resolve their credentials through [`ctx.credentials`](credentials.md) references, so no SMTP account or authorization code lands in cordis.yml.

Source: [`packages/email/email/src/types.ts`](../../packages/email/email/src/types.ts)

## Public types

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

## Consumers

The account system uses `ctx.email.send` for registration verification codes and password-reset links; the QQ SMTP provider resolves `SMTP_USER` / `SMTP_PASS` through the credentials service.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
