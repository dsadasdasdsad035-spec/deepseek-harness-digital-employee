/**
 * Service Definition for the email capability seam (`ctx.email`): a transport
 * registry plus provider-resolving delivery. Providers register
 * {@link EmailTransport} instances under stable ids; consumers send one
 * plain-text message addressed by transport id and receive a closed delivery
 * outcome. Delivery failures are reported, never thrown.
 *
 * @module @deepseek-ai/dsh-email
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { EmailDelivery, EmailMessage, EmailTransport } from './types.ts'

export type { EmailDelivery, EmailMessage, EmailTransport } from './types.ts'

/** One send request: a message plus the transport id that should deliver it. */
export interface EmailSendRequest extends EmailMessage {
  /** Registered transport id that should deliver this message. */
  readonly transport: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    email: EmailService
  }
}

/** The email service: a transport registry with fail-visible, non-throwing delivery. */
export class EmailService extends Service {
  private readonly transports = new Map<string, EmailTransport>()

  constructor(ctx: Context) {
    super(ctx, 'email')
  }

  /**
   * Register one SMTP transport. Duplicate ids are rejected at registration.
   * @param transport - the transport; its `id` is the registry key.
   * @returns a disposer removing the registration, disposed with the calling fiber.
   * @throws when `transport.id` is already registered.
   */
  register(transport: EmailTransport): () => void {
    if (this.transports.has(transport.id)) {
      throw new Error(`email: transport "${transport.id}" is already registered`)
    }
    this.transports.set(transport.id, transport)
    return () => { this.transports.delete(transport.id) }
  }

  /**
   * Enumerate the registered transport ids.
   * @returns the transport ids in registration order.
   */
  listTransports(): readonly string[] {
    return [...this.transports.keys()]
  }

  /**
   * Deliver one message through the addressed transport. Unknown transport ids
   * and throwing transports resolve to `{ delivered: false, reason }` — never
   * reject — so the calling flow survives an absent or broken mail path.
   * @param request - the message plus the transport id that should deliver it.
   * @returns the closed delivery outcome.
   */
  async send(request: EmailSendRequest): Promise<EmailDelivery> {
    const transport = this.transports.get(request.transport)
    if (transport === undefined) {
      const registered = [...this.transports.keys()].sort().join(', ')
      return { delivered: false, reason: `unknown transport "${request.transport}" (registered: ${registered})` }
    }
    try {
      return await transport.send({ to: request.to, subject: request.subject, text: request.text })
    } catch (error) {
      return { delivered: false, reason: `transport "${request.transport}" threw: ${error instanceof Error ? error.message : String(error)}` }
    }
  }
}

export default EmailService
