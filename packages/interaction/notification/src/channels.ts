/**
 * Shared webhook-channel plumbing for the three built-in notification
 * providers: credential resolution through `ctx.credentials`, bounded retries,
 * per-attempt timeouts, and provider-supplied request/response dialects. The
 * seam's fail-visible rule lives here — every failure path resolves to a
 * closed {@link NotificationDelivery}, never a throw.
 *
 * @module @deepseek-ai/dsh-notification/channels
 * @internal
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { NotificationDelivery, NotificationMessage } from './types.ts'

/** JSON value crossing the fetch body boundary. */
export type WebhookBody = Record<string, unknown>

/** The request one channel dialect builds for one message. */
export interface WebhookRequest {
  /** The URL to POST to, after any signing query is appended. */
  readonly url: string
  /** The JSON body to POST. */
  readonly body: WebhookBody
}

/**
 * The dialect one provider supplies: how a message becomes a signed request,
 * and which HTTP response proves delivery. `interpret` returns undefined for
 * success and a failure reason otherwise; it sees the parsed JSON body when
 * the response carried one, else `undefined`.
 */
export interface WebhookDialect {
  /**
   * Build the signed request for one message.
   * @param url - the resolved webhook URL.
   * @param secret - the resolved signing secret, when the channel configures one.
   * @param message - the message to deliver.
   */
  buildRequest(url: string, secret: string | undefined, message: NotificationMessage): WebhookRequest
  /**
   * Interpret one completed HTTP response.
   * @param status - the response status code.
   * @param payload - the parsed JSON body when the response carried one.
   * @returns undefined when the response proves delivery, else the failure reason.
   */
  interpret(status: number, payload: unknown): string | undefined
}

/** The resolved knobs every webhook channel shares (schema defaults applied). */
export interface WebhookChannelRuntime {
  /** Stable channel id used in delivery-failure reasons. */
  readonly id: string
  /** Credential reference holding the webhook URL. */
  readonly urlRef: string
  /** Credential reference holding the signing secret, when the dialect signs. */
  readonly secretRef?: string
  /** Delivery attempts beyond the first. */
  readonly retries: number
  /** Per-attempt timeout in milliseconds. */
  readonly timeoutMs: number
}

/** Resolve one credential reference to its value, or the failure reason. */
async function resolveCredential(
  credentials: CredentialProvider | undefined,
  ref: string,
): Promise<{ value: string } | { reason: string }> {
  if (credentials === undefined) {
    return { reason: `credential "${ref}" is unresolved (no credentials service is composed)` }
  }
  const resolved = await credentials.resolve(credentialRef(ref))
  if (resolved === undefined) {
    return { reason: `credential "${ref}" is unresolved` }
  }
  return { value: resolved.value }
}

/**
 * Build the `credentials()` reporter one webhook channel exposes to
 * configuration surfaces: every named reference resolves to its configured
 * fact through the credentials describe path — never to a value.
 * @param ctx - plugin context carrying the optional credentials service.
 * @param refs - the channel's credential reference names.
 * @returns the reporter closure.
 */
export function credentialStates(ctx: Context, refs: readonly string[]): () => Promise<readonly { ref: string; configured: boolean }[]> {
  return async (): Promise<readonly { ref: string; configured: boolean }[]> => {
    const credentials = ctx.get('credentials')
    return await Promise.all(refs.map(async (ref) => {
      if (credentials === undefined) return { ref, configured: false }
      const info = await credentials.describe(credentialRef(ref))
      return { ref, configured: info.configured }
    }))
  }
}

/**
 * Render one message as single-channel text: title, blank line, body, then
 * each context entry as `key: value` lines. Used by the bot dialects whose
 * wire format is one text field.
 * @param message - the message to render.
 * @returns the rendered text.
 */
export function renderText(message: NotificationMessage): string {
  const entries = Object.entries(message.context ?? {})
  const context = entries.length === 0 ? '' : `\n\n${entries.map(([key, value]) => `${key}: ${value}`).join('\n')}`
  return `${message.title}\n\n${message.body}${context}`
}

/**
 * Truncate text to at most `maxBytes` UTF-8 bytes on a character boundary,
 * appending an ellipsis marker when truncation happened. Bot APIs reject
 * over-length text outright, so providers clip defensively.
 * @param text - the text to clip.
 * @param maxBytes - the byte ceiling.
 * @returns the clipped text.
 */
export function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  // The byte cut can land mid-character; decoding emits a replacement
  // character whose 3 bytes can push the prefix back over the budget
  // reserved for the marker, so trim until the encoded prefix genuinely fits.
  const budget = maxBytes - 3
  let clipped = Buffer.from(text, 'utf8').subarray(0, budget).toString('utf8')
  while (Buffer.byteLength(clipped, 'utf8') > budget) clipped = clipped.slice(0, -1)
  return `${clipped}...`
}

/**
 * Deliver one message through a webhook dialect: resolve credentials, then
 * POST the built request up to `retries + 1` times. Network errors and
 * dialect-rejected responses retry; every failure path resolves to a closed
 * delivery outcome.
 * @param ctx - plugin context carrying the optional credentials service.
 * @param runtime - the channel's resolved knobs.
 * @param dialect - the provider's request/response dialect.
 * @param message - the message to deliver.
 * @returns the closed delivery outcome.
 */
export async function deliverWebhook(
  ctx: Context,
  runtime: WebhookChannelRuntime,
  dialect: WebhookDialect,
  message: NotificationMessage,
): Promise<NotificationDelivery> {
  const credentials = ctx.get('credentials')
  const url = await resolveCredential(credentials, runtime.urlRef)
  if ('reason' in url) {
    return { delivered: false, reason: `channel "${runtime.id}" is not configured: ${url.reason}` }
  }
  let secret: string | undefined
  if (runtime.secretRef !== undefined) {
    const resolved = await resolveCredential(credentials, runtime.secretRef)
    if ('reason' in resolved) {
      return { delivered: false, reason: `channel "${runtime.id}" is not configured: ${resolved.reason}` }
    }
    secret = resolved.value
  }
  const request = dialect.buildRequest(url.value, secret, message)
  const attempts = runtime.retries + 1
  let lastReason = ''
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(runtime.timeoutMs),
      })
      const text = await response.text()
      let payload: unknown
      try {
        payload = text === '' ? undefined : JSON.parse(text) as unknown
      } catch {
        payload = undefined
      }
      const reason = dialect.interpret(response.status, payload)
      if (reason === undefined) return { delivered: true }
      lastReason = reason
    } catch (error: unknown) {
      lastReason = `network: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return { delivered: false, reason: `channel "${runtime.id}" delivery failed after ${attempts} attempt(s): ${lastReason}` }
}
