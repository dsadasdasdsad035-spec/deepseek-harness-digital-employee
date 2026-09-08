# Notification

English | [中文](notification.zh.md)

[`@deepseek-ai/dsh-notification`](../../packages/interaction/notification) is the channel-registry alert seam (`ctx.notifications`). `send()` resolves to a closed delivery outcome and never rejects: an unknown channel or a throwing channel becomes a visible failure result, so the calling task flow survives an absent or broken alert path. Three built-in providers ship as subpath plugins — `generic-webhook`, `wechat-work-bot`, and `feishu-bot` — each resolving its webhook URL (and optional signing secret) through [`ctx.credentials`](credentials.md) reference names, with bounded retries and a per-attempt timeout.

Source: [`packages/interaction/notification/src/types.ts`](../../packages/interaction/notification/src/types.ts)

## Public types

```ts type-equiv
/** One alert message a caller asks a channel to deliver. */
interface NotificationMessage {
  /** Short subject line; non-empty. */
  readonly title: string
  /** Body text; non-empty. */
  readonly body: string
  /** Optional string-valued task/session context a channel may append. */
  readonly context?: Readonly<Record<string, string>>
}
```

```ts type-equiv
/**
 * The closed outcome of one delivery attempt. `delivered: false` carries a
 * non-empty reason naming what failed; callers record it instead of throwing.
 */
type NotificationDelivery =
  | { readonly delivered: true }
  | { readonly delivered: false; readonly reason: string }
```

```ts type-equiv
/** One delivery channel a provider registers under a stable id. */
interface NotificationChannel {
  /** Stable channel id used as the `channel` value of a send request. */
  readonly id: string
  /**
   * Deliver one message. MUST resolve to a closed
   * {@link NotificationDelivery} — never reject — so a failing channel
   * cannot crash the calling task flow.
   * @param message - the message to deliver.
   */
  send(message: NotificationMessage): Promise<NotificationDelivery>
  /**
   * Report the channel's credential references and whether each currently
   * resolves. Configuration surfaces consume this to show setup state
   * WITHOUT any secret value. Omission means the channel declares no
   * credential references.
   * @returns the channel's credential states.
   */
  credentials?(): Promise<readonly NotificationCredentialState[]>
}
```

## Consumers

The employee task driver ([`@deepseek-ai/dsh-headless/employee`](../../packages/bundle/headless) / [`dsh-headless-employee`](../../packages/bundle/headless-employee)) sends one suspension alert after the configured consecutive-failure ceiling; successful runs stay silent by contract.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxnotifications--notificationservice"></a>

### `ctx.notifications` — `NotificationService`

The notification service: a channel registry with fail-visible, non-throwing delivery. Registered as `ctx.notifications` (one instance per context).

```ts cordis-catalog
/**
 * Register one delivery channel. Duplicate ids are rejected at registration.
 * @param channel - the channel; its `id` is the registry key.
 * @returns a disposer removing the registration, disposed with the calling
 *   fiber.
 * @throws when `channel.id` is already registered.
 */
register(channel: NotificationChannel): () => void

/**
 * List the registered channel ids in registration order.
 * @returns the stable channel ids.
 */
listChannels(): readonly string[]

/**
 * Report one channel's credential states. A channel without a
 * `credentials()` hook reports an empty list; an unknown id resolves to
 * `undefined` so callers can distinguish it from an unconfigured channel.
 * @param id - the registered channel id.
 * @returns the credential states, or `undefined` for an unknown channel.
 */
async channelCredentials(id: string): Promise<readonly NotificationCredentialState[] | undefined>

/**
 * Deliver one message through the addressed channel. Unknown channel ids and
 * throwing channels resolve to `{ delivered: false, reason }` — never reject —
 * so the calling task flow survives an absent or broken channel.
 * @param request - the message plus the channel id that should deliver it.
 * @returns the closed delivery outcome.
 */
async send(request: NotificationSendRequest): Promise<NotificationDelivery>
```

Source: [`packages/interaction/notification/src/index.ts`](../../packages/interaction/notification/src/index.ts)
<!-- END GENERATED cordis-surface -->
