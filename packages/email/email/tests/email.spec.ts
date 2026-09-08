/**
 * The email seam: registry behavior and the qq-smtp credential-gated delivery
 * surface (unconfigured references fail visibly before any SMTP connection).
 */

import { Context } from '@deepseek-ai/cordis'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import EmailService from '@deepseek-ai/dsh-email'
import * as QqSmtp from '@deepseek-ai/dsh-email/qq-smtp'
import { describe, expect, it } from 'vitest'

/** A credentials provider over a mutable table. */
function fakeCredentials(values: Record<string, string>): CredentialProvider {
  return {
    async resolve(ref: string) {
      const value = values[ref]
      return value === undefined ? undefined : { value, source: 'test' }
    },
    async describe(ref: string) {
      return { configured: values[ref] !== undefined, key: ref, kind: 'apikey' } as never
    },
  } as unknown as CredentialProvider
}

/** Mount the email service with a credentials table. */
async function mounted(credentials?: Record<string, string>) {
  const ctx = new Context()
  await ctx.plugin(EmailService)
  if (credentials !== undefined) ctx.provide('credentials', fakeCredentials(credentials))
  await ctx.plugin(QqSmtp, { userRef: 'SMTP_USER', passRef: 'SMTP_PASS', retries: 1, timeoutMs: 2000 })
  return ctx
}

describe('EmailService registry', () => {
  it('reports unknown transports without throwing', async () => {
    const ctx = await mounted()
    const outcome = await ctx.email.send({ transport: 'nope', to: 'a@b.c', subject: 't', text: 'b' })
    expect(outcome).toEqual({ delivered: false, reason: 'unknown transport "nope" (registered: qq-smtp)' })
  })

  it('rejects duplicate transport ids', async () => {
    const ctx = await mounted()
    expect(() => ctx.email.register({ id: 'qq-smtp', send: async () => ({ delivered: true }) })).toThrow(/already registered/)
  })

  it('contains throwing transports into delivered:false', async () => {
    const ctx = await mounted()
    ctx.email.register({ id: 'broken', send: async () => { throw new Error('boom') } })
    const outcome = await ctx.email.send({ transport: 'broken', to: 'a@b.c', subject: 't', text: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('threw: boom')
  })

  it('lists transports in registration order', async () => {
    const ctx = await mounted()
    ctx.email.register({ id: 'a', send: async () => ({ delivered: true }) })
    expect(ctx.email.listTransports()).toEqual(['qq-smtp', 'a'])
  })
})

describe('qq-smtp credential gating', () => {
  it('fails visibly when no credentials service is composed', async () => {
    const ctx = new Context()
    await ctx.plugin(EmailService)
    await ctx.plugin(QqSmtp, { userRef: 'SMTP_USER', passRef: 'SMTP_PASS', retries: 0 })
    const outcome = await ctx.email.send({ transport: 'qq-smtp', to: 'a@b.c', subject: 't', text: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) {
      expect(outcome.reason).toContain('is not configured')
      expect(outcome.reason).toContain('no credentials service is composed')
    }
  })

  it('fails on the account reference before attempting delivery', async () => {
    const ctx = await mounted({})
    const outcome = await ctx.email.send({ transport: 'qq-smtp', to: 'a@b.c', subject: 't', text: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('SMTP_USER" is unresolved')
  })

  it('fails on the unresolved pass reference even when the account resolves', async () => {
    const ctx = await mounted({ SMTP_USER: 'me@qq.com' })
    const outcome = await ctx.email.send({ transport: 'qq-smtp', to: 'a@b.c', subject: 't', text: 'b' })
    expect(outcome.delivered).toBe(false)
    if (!outcome.delivered) expect(outcome.reason).toContain('SMTP_PASS" is unresolved')
  })
})
