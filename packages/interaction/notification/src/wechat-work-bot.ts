/**
 * `wechat-work-bot` notification provider: delivers text messages through a
 * WeChat Work (企业微信) group-bot webhook. The bot authenticates by the key
 * embedded in the webhook URL — the platform defines no request signing for
 * these bots, so this channel configures only the URL reference. A `msgtype:
 * 'text'` body with `errcode: 0` proves delivery; text is clipped to the
 * platform's 2048-byte content ceiling.
 *
 * @module @deepseek-ai/dsh-notification/wechat-work-bot
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialStates, deliverWebhook, renderText, truncateUtf8, type WebhookDialect } from './channels.ts'
import type { NotificationChannel, NotificationDelivery, NotificationMessage } from './types.ts'
import type {} from './index.ts'

/** Stable Cordis plugin name. */
export const name = 'notification-wechat-work-bot'

/** The notification registry is required before a channel can register. */
export const inject = ['notifications']

/** Channel id this provider registers under. */
export const WECHAT_WORK_BOT_CHANNEL = 'wechat-work-bot'

/** WeChat Work caps one text message's content at 2048 bytes. */
const MAX_TEXT_BYTES = 2048

/** Plugin config: the webhook URL credential reference and delivery knobs. */
export interface Config {
  /** Credential reference resolving to the group-bot webhook URL. */
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

interface WeChatWorkResponse {
  readonly errcode?: unknown
  readonly errmsg?: unknown
}

const dialect: WebhookDialect = {
  buildRequest(url: string, _secret: string | undefined, message: NotificationMessage) {
    return {
      url,
      body: {
        msgtype: 'text',
        text: { content: truncateUtf8(renderText(message), MAX_TEXT_BYTES) },
      },
    }
  },
  interpret(status: number, payload: unknown) {
    if (status !== 200) return `HTTP ${status}`
    const response = payload as WeChatWorkResponse | undefined
    if (response === undefined || typeof response.errcode !== 'number') {
      return 'the group bot answered without an errcode field'
    }
    if (response.errcode !== 0) {
      const msg = typeof response.errmsg === 'string' ? response.errmsg : ''
      return `errcode ${response.errcode}${msg !== '' ? `: ${msg}` : ''}`
    }
    return undefined
  },
}

/**
 * Mount the wechat-work-bot channel.
 * @param ctx - plugin context carrying the notification registry and the
 *   optional credentials service.
 * @param config - validated channel config.
 */
export function apply(ctx: Context, config: Config): void {
  const runtime = {
    id: WECHAT_WORK_BOT_CHANNEL,
    urlRef: config.urlRef,
    retries: config.retries as number,
    timeoutMs: config.timeoutMs as number,
  }
  const channel: NotificationChannel = {
    id: WECHAT_WORK_BOT_CHANNEL,
    send: (message: NotificationMessage): Promise<NotificationDelivery> => deliverWebhook(ctx, runtime, dialect, message),
    credentials: credentialStates(ctx, [config.urlRef]),
  }
  ctx.effect(() => ctx.notifications.register(channel), 'notification: wechat-work-bot channel')
}
