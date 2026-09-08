/**
 * `feishu-bot` notification provider: delivers text messages through a Feishu
 * (飞书) custom-bot webhook. When a `secretRef` is configured the request is
 * signed per the platform dialect — HMAC-SHA256 keyed by `timestamp\nsecret`
 * over empty data, Base64-encoded — with `timestamp` and `sign` riding the
 * body; without one the message posts unsigned. `code: 0` (or the legacy
 * `StatusCode: 0`) proves delivery.
 *
 * @module @deepseek-ai/dsh-notification/feishu-bot
 */

import { createHmac } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialStates, deliverWebhook, renderText, truncateUtf8, type WebhookDialect } from './channels.ts'
import type { NotificationChannel, NotificationDelivery, NotificationMessage } from './types.ts'
import type {} from './index.ts'

/** Stable Cordis plugin name. */
export const name = 'notification-feishu-bot'

/** The notification registry is required before a channel can register. */
export const inject = ['notifications']

/** Channel id this provider registers under. */
export const FEISHU_BOT_CHANNEL = 'feishu-bot'

/** Feishu caps one webhook request body at 20 KB. */
const MAX_TEXT_BYTES = 20_000

/** Plugin config: the webhook URL credential reference and delivery knobs. */
export interface Config {
  /** Credential reference resolving to the custom-bot webhook URL. */
  urlRef: string
  /** Credential reference resolving to the signing secret, when the bot requires signatures. */
  secretRef?: string
  /** Delivery attempts beyond the first (default 2). */
  retries?: number
  /** Per-attempt timeout in milliseconds (default 10000). */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  urlRef: z.string().required(),
  secretRef: z.string(),
  retries: z.number().step(1).min(0).default(2),
  timeoutMs: z.number().min(1).default(10_000),
})

interface FeishuResponse {
  readonly code?: unknown
  readonly msg?: unknown
  readonly StatusCode?: unknown
}

/**
 * The Feishu custom-bot signature: HMAC-SHA256 keyed by `timestamp\nsecret`
 * over empty data, Base64-encoded. The platform rejects signatures whose
 * timestamp is older than one hour, so this is computed per delivery attempt.
 * @param timestamp - current time in whole seconds.
 * @param secret - the bot's signing secret.
 * @returns the Base64 signature.
 */
function sign(timestamp: number, secret: string): string {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64')
}

const dialect: WebhookDialect = {
  buildRequest(url: string, secret: string | undefined, message: NotificationMessage) {
    const body: Record<string, unknown> = {
      msg_type: 'text',
      content: { text: truncateUtf8(renderText(message), MAX_TEXT_BYTES) },
    }
    if (secret !== undefined) {
      const timestamp = Math.floor(Date.now() / 1000)
      body.timestamp = String(timestamp)
      body.sign = sign(timestamp, secret)
    }
    return { url, body }
  },
  interpret(status: number, payload: unknown) {
    if (status !== 200) return `HTTP ${status}`
    const response = payload as FeishuResponse | undefined
    if (response !== undefined && typeof response.code === 'number') {
      if (response.code !== 0) {
        const msg = typeof response.msg === 'string' ? response.msg : ''
        return `code ${response.code}${msg !== '' ? `: ${msg}` : ''}`
      }
      return undefined
    }
    if (response !== undefined && typeof response.StatusCode === 'number') {
      if (response.StatusCode !== 0) return `StatusCode ${response.StatusCode}`
      return undefined
    }
    return 'the custom bot answered without a code field'
  },
}

/**
 * Mount the feishu-bot channel.
 * @param ctx - plugin context carrying the notification registry and the
 *   optional credentials service.
 * @param config - validated channel config.
 */
export function apply(ctx: Context, config: Config): void {
  const runtime = {
    id: FEISHU_BOT_CHANNEL,
    urlRef: config.urlRef,
    ...config.secretRef !== undefined ? { secretRef: config.secretRef } : {},
    retries: config.retries as number,
    timeoutMs: config.timeoutMs as number,
  }
  const channel: NotificationChannel = {
    id: FEISHU_BOT_CHANNEL,
    send: (message: NotificationMessage): Promise<NotificationDelivery> => deliverWebhook(ctx, runtime, dialect, message),
    credentials: credentialStates(ctx, config.secretRef === undefined ? [config.urlRef] : [config.urlRef, config.secretRef]),
  }
  ctx.effect(() => ctx.notifications.register(channel), 'notification: feishu-bot channel')
}
