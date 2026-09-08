/**
 * `qq-smtp` email provider: delivers plain-text mail through QQ Mail's SMTP
 * endpoint (smtp.qq.com:465, SSL). The account is the QQ mail address and the
 * password is the QQ-issued authorization code (授权码) — never the login
 * password. Both resolve through credentials references; an unresolved
 * reference fails visibly as "not configured" without attempting delivery.
 * Connection/auth failures retry a bounded number of times.
 *
 * @module @deepseek-ai/dsh-email/qq-smtp
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { EmailDelivery, EmailMessage } from './types.ts'
import type {} from './index.ts'

/** Stable Cordis plugin name. */
export const name = 'email-qq-smtp'

/** The email registry is required before a transport can register. */
export const inject = ['email']

/** Transport id this provider registers under. */
export const QQ_SMTP_TRANSPORT = 'qq-smtp'

/** Plugin config: credential reference names and delivery knobs. */
export interface Config {
  /** Credential reference resolving to the SMTP account (the QQ mail address). */
  userRef: string
  /** Credential reference resolving to the SMTP authorization code (授权码). */
  passRef: string
  /** SMTP host override (default smtp.qq.com). */
  host?: string
  /** SMTP port override (default 465, SSL). */
  port?: number
  /** Delivery attempts beyond the first (default 1). */
  retries?: number
  /** Per-attempt timeout in milliseconds (default 15000). */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  userRef: z.string().required(),
  passRef: z.string().required(),
  host: z.string(),
  port: z.number().step(1).min(1),
  retries: z.number().step(1).min(0).default(1),
  timeoutMs: z.number().min(1).default(15_000),
})

/** Minimal nodemailer surface this provider uses; keeps the dep internal. */
interface Mailer {
  sendMail(options: { from: string; to: string; subject: string; text: string }): Promise<{ messageId?: string }>
  close(): void
}

type MailerFactory = (options: {
  host: string
  port: number
  secure: boolean
  auth: { user: string; pass: string }
  connectionTimeout: number
}) => Mailer

/** Resolve one credential, or the failure reason. */
async function resolveCredential(ctx: Context, ref: string): Promise<{ value: string } | { reason: string }> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) {
    return { reason: `credential "${ref}" is unresolved (no credentials service is composed)` }
  }
  const resolved = await credentials.resolve(credentialRef(ref))
  if (resolved === undefined) return { reason: `credential "${ref}" is unresolved` }
  return { value: resolved.value }
}

/** Load nodemailer lazily so the seam stays usable without it until delivery. */
async function loadMailer(): Promise<{ createTransport: MailerFactory }> {
  return await import('nodemailer')
}

/**
 * Mount the qq-smtp transport.
 * @param ctx - plugin context carrying the email registry and the optional credentials service.
 * @param config - validated transport config.
 */
export function apply(ctx: Context, config: Config): void {
  const host = config.host ?? 'smtp.qq.com'
  const port = config.port ?? 465
  const attempts = (config.retries as number) + 1
  const timeoutMs = config.timeoutMs as number

  const transport = {
    id: QQ_SMTP_TRANSPORT,
    async send(message: EmailMessage): Promise<EmailDelivery> {
      const user = await resolveCredential(ctx, config.userRef)
      if ('reason' in user) return { delivered: false, reason: `transport "${QQ_SMTP_TRANSPORT}" is not configured: ${user.reason}` }
      const pass = await resolveCredential(ctx, config.passRef)
      if ('reason' in pass) return { delivered: false, reason: `transport "${QQ_SMTP_TRANSPORT}" is not configured: ${pass.reason}` }

      const { createTransport } = await loadMailer()
      const mailer = createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user: user.value, pass: pass.value },
        connectionTimeout: timeoutMs,
      })
      let lastReason = ''
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await mailer.sendMail({ from: user.value, to: message.to, subject: message.subject, text: message.text })
          return { delivered: true }
        } catch (error) {
          lastReason = error instanceof Error ? error.message : String(error)
        }
      }
      mailer.close()
      return { delivered: false, reason: `qq-smtp delivery failed after ${attempts} attempt(s): ${lastReason}` }
    },
  }
  ctx.effect(() => ctx.email.register(transport), 'email: qq-smtp transport')
}
