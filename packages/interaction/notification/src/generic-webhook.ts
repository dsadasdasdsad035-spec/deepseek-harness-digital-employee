/**
 * `generic-webhook` notification provider: POSTs the message as a plain JSON
 * document (`title`, `body`, `context`, `timestamp`) to any webhook URL. Any
 * 2xx response proves delivery; there is no signing dialect.
 *
 * @module @deepseek-ai/dsh-notification/generic-webhook
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialStates, deliverWebhook, type WebhookDialect } from './channels.ts'
import type { NotificationChannel, NotificationDelivery, NotificationMessage } from './types.ts'
import type {} from './index.ts'

/** Stable Cordis plugin name. */
export const name = 'notification-generic-webhook'

/** The notification registry is required before a channel can register. */
export const inject = ['notifications']

/** Channel id this provider registers under. */
export const GENERIC_WEBHOOK_CHANNEL = 'generic-webhook'

/** Plugin config: the webhook URL credential reference and delivery knobs. */
export interface Config {
  /** Credential reference resolving to the webhook URL. */
  urlRef: string
  /** Delivery attempts beyond the first (default 2). */
  retries?: number
  /** Per-attempt timeout in milliseconds (default 10000). */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  urlRef: z.string().required(),
  retries: z.number().step(1).min(0).default(2),
  timeoutMs: z.number().min(1).default(10_000),
})

const dialect: WebhookDialect = {
  buildRequest(url: string, _secret: string | undefined, message: NotificationMessage) {
    return {
      url,
      body: {
        title: message.title,
        body: message.body,
        ...message.context !== undefined ? { context: message.context } : {},
        timestamp: new Date().toISOString(),
      },
    }
  },
  interpret(status: number) {
    return status >= 200 && status < 300 ? undefined : `HTTP ${status}`
  },
}

/**
 * Mount the generic-webhook channel.
 * @param ctx - plugin context carrying the notification registry and the
 *   optional credentials service.
 * @param config - validated channel config.
 */
export function apply(ctx: Context, config: Config): void {
  const runtime = {
    id: GENERIC_WEBHOOK_CHANNEL,
    urlRef: config.urlRef,
    retries: config.retries as number,
    timeoutMs: config.timeoutMs as number,
  }
  const channel: NotificationChannel = {
    id: GENERIC_WEBHOOK_CHANNEL,
    send: (message: NotificationMessage): Promise<NotificationDelivery> => deliverWebhook(ctx, runtime, dialect, message),
    credentials: credentialStates(ctx, [config.urlRef]),
  }
  ctx.effect(() => ctx.notifications.register(channel), 'notification: generic-webhook channel')
}
