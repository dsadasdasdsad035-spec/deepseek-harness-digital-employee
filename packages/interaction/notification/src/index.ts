/**
 * Service Definition for the notification capability seam (`ctx.notifications`):
 * a channel registry plus provider-resolving delivery. Providers register
 * {@link NotificationChannel} instances under stable ids; consumers send one
 * message addressed by channel id and receive a closed delivery outcome.
 * Delivery failures are reported, never thrown — a failing channel must not
 * crash the task flow that asked for the alert.
 *
 * @module @deepseek-ai/dsh-notification
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { NotificationChannel, NotificationCredentialState, NotificationDelivery, NotificationMessage } from './types.ts'

export type { NotificationChannel, NotificationCredentialState, NotificationDelivery, NotificationMessage } from './types.ts'

/** One send request: a message plus the channel id that should deliver it. */
export interface NotificationSendRequest extends NotificationMessage {
  /** Registered channel id that should deliver this message. */
  readonly channel: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    notifications: NotificationService
  }
}

/**
 * The notification service: a channel registry with fail-visible, non-throwing
 * delivery. Registered as `ctx.notifications` (one instance per context).
 */
export class NotificationService extends Service {
  private readonly channels = new Map<string, NotificationChannel>()

  constructor(ctx: Context) {
    super(ctx, 'notifications')
  }

  /**
   * Register one delivery channel. Duplicate ids are rejected at registration.
   * @param channel - the channel; its `id` is the registry key.
   * @returns a disposer removing the registration, disposed with the calling
   *   fiber.
   * @throws when `channel.id` is already registered.
   */
  register(channel: NotificationChannel): () => void {
    if (this.channels.has(channel.id)) {
      throw new Error(`notification: channel "${channel.id}" is already registered`)
    }
    this.channels.set(channel.id, channel)
    return () => { this.channels.delete(channel.id) }
  }

  /**
   * List the registered channel ids in registration order.
   * @returns the stable channel ids.
   */
  listChannels(): readonly string[] {
    return [...this.channels.keys()]
  }

  /**
   * Report one channel's credential states. A channel without a
   * `credentials()` hook reports an empty list; an unknown id resolves to
   * `undefined` so callers can distinguish it from an unconfigured channel.
   * @param id - the registered channel id.
   * @returns the credential states, or `undefined` for an unknown channel.
   */
  async channelCredentials(id: string): Promise<readonly NotificationCredentialState[] | undefined> {
    const channel = this.channels.get(id)
    if (channel === undefined) return undefined
    if (channel.credentials === undefined) return []
    return await channel.credentials()
  }

  /**
   * Deliver one message through the addressed channel. Unknown channel ids and
   * throwing channels resolve to `{ delivered: false, reason }` — never reject —
   * so the calling task flow survives an absent or broken channel.
   * @param request - the message plus the channel id that should deliver it.
   * @returns the closed delivery outcome.
   */
  async send(request: NotificationSendRequest): Promise<NotificationDelivery> {
    const channel = this.channels.get(request.channel)
    if (channel === undefined) {
      const registered = [...this.channels.keys()].sort().join(', ')
      return { delivered: false, reason: `unknown channel "${request.channel}" (registered: ${registered})` }
    }
    try {
      return await channel.send(request)
    } catch (error: unknown) {
      return { delivered: false, reason: `channel "${request.channel}" threw: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
}

export default NotificationService
