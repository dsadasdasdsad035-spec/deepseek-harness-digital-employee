/**
 * The account service over a temp SQLite database: owner bootstrap, verified
 * registration, login with uniform errors and rate limiting, password reset
 * lifecycle, and session invalidation.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import { UserAccountService } from '../src/index.ts'

let dir: string
let service: UserAccountService

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-user-accounts-'))
  service = new UserAccountService(new Context(), {
    dbPath: join(dir, 'users.db'),
    allowRegistration: true,
    sessionTtlMs: 60_000,
  })
})

describe('owner bootstrap', () => {
  it('starts empty, creates the owner, and stores no hash on the view', async () => {
    expect(service.isEmpty()).toBe(true)
    const owner = await service.createOwner('Owner@Example.com', 'boot-pw-1')
    expect(owner.role).toBe('owner')
    expect(owner.ownerId).toBe(owner.id)
    expect(owner.email).toBe('owner@example.com')
    expect(service.isEmpty()).toBe(false)
    expect('passwordHash' in owner).toBe(false)
  })
})

describe('code-verified registration', () => {
  it('creates the account after the correct code and rejects duplicates', async () => {
    let sent: string | undefined
    await service.issueVerificationCode('New@Example.com', async (_to, c) => { sent = c })
    expect(sent).toMatch(/^\d{6}$/)
    expect(service.verifyCode('new@example.com', '000000')).toBe(false)
    expect(service.verifyCode('new@example.com', sent as string)).toBe(true)
    const view = await service.completeRegistration('new@example.com', 'pw-123456')
    expect(view).toMatchObject({ email: 'new@example.com', role: 'user' })
    expect(await service.completeRegistration('new@example.com', 'again')).toBe('duplicate')
  })

  it('rejects wrong codes and codes issued for other emails', async () => {
    await service.issueVerificationCode('Third@Example.com', async () => undefined)
    expect(service.verifyCode('third@example.com', '000000')).toBe(false)
    expect(service.verifyCode('other@example.com', '123456')).toBe(false)
  })

  it('reports closed registration when the switch is off', () => {
    const closed = new UserAccountService(new Context(), { dbPath: join(dir, 'closed.db'), allowRegistration: false })
    expect(closed.registrationAllowed).toBe(false)
  })
})

describe('login and rate limiting', () => {
  it('logs in with correct credentials and the session resolves', async () => {
    await service.createOwner('owner@example.com', 'boot-pw-1')
    const result = await service.login('owner@example.com', 'boot-pw-1')
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(service.resolveSession(result.cookie)).toMatchObject({ accountId: result.identity.accountId, role: 'owner' })
  })

  it('returns one uniform error for wrong password and unknown email', async () => {
    await service.createOwner('owner@example.com', 'boot-pw-1')
    expect(await service.login('owner@example.com', 'nope')).toEqual({ kind: 'bad-credentials' })
    expect(await service.login('nobody@example.com', 'nope')).toEqual({ kind: 'bad-credentials' })
  })

  it('locks the email after five consecutive failures even with the right password', async () => {
    await service.createOwner('owner@example.com', 'boot-pw-1')
    for (let i = 0; i < 5; i += 1) await service.login('owner@example.com', 'wrong')
    const sixth = await service.login('owner@example.com', 'boot-pw-1')
    expect(sixth.kind).toBe('locked')
    if (sixth.kind === 'locked') expect(sixth.retryAfterMinutes).toBeGreaterThan(0)
  })

  it('rejects disabled accounts', async () => {
    const user = await service.completeRegistration('u@example.com', 'pw-123456')
    if (user === 'duplicate') throw new Error('unexpected duplicate')
    service.setDisabled(user.id, true)
    expect(await service.login('u@example.com', 'pw-123456')).toEqual({ kind: 'disabled' })
  })

  it('password change invalidates all sessions of the account', async () => {
    const owner = await service.createOwner('owner@example.com', 'boot-pw-1')
    const login = await service.login('owner@example.com', 'boot-pw-1')
    if (login.kind !== 'ok') throw new Error('login failed')
    expect(service.resolveSession(login.cookie)).toBeDefined()
    await service.adminSetPassword(owner.id, 'new-pw-9')
    expect(service.resolveSession(login.cookie)).toBeUndefined()
  })

  it('logout invalidates exactly one session', async () => {
    await service.createOwner('owner@example.com', 'boot-pw-1')
    const a = await service.login('owner@example.com', 'boot-pw-1')
    const b = await service.login('owner@example.com', 'boot-pw-1')
    if (a.kind !== 'ok' || b.kind !== 'ok') throw new Error('logins failed')
    service.logout(a.cookie)
    expect(service.resolveSession(a.cookie)).toBeUndefined()
    expect(service.resolveSession(b.cookie)).toBeDefined()
  })
})

describe('password reset lifecycle', () => {
  it('issue → set new password → sessions die → token single-use', async () => {
    await service.createOwner('owner@example.com', 'old-pw-1')
    const login = await service.login('owner@example.com', 'old-pw-1')
    if (login.kind !== 'ok') throw new Error('login failed')
    const token = service.issueResetToken('owner@example.com')
    expect(token).toBeDefined()
    expect(await service.completeReset(token as string, 'new-pw-9')).toBe(true)
    expect(await service.login('owner@example.com', 'old-pw-1')).toEqual({ kind: 'bad-credentials' })
    expect((await service.login('owner@example.com', 'new-pw-9')).kind).toBe('ok')
    expect(service.resolveSession(login.cookie)).toBeUndefined()
    expect(await service.completeReset(token as string, 'again')).toBe(false)
  })

  it('returns no token for unknown emails', () => {
    expect(service.issueResetToken('nobody@example.com')).toBeUndefined()
  })
})

describe('account management surface', () => {
  it('deletes accounts and counts live owners', async () => {
    await service.createOwner('owner@example.com', 'pw-1')
    const user = await service.completeRegistration('u@example.com', 'pw-2')
    if (user === 'duplicate') throw new Error('unexpected duplicate')
    expect(service.ownerCount()).toBe(1)
    expect(service.delete(user.id)).toBe(true)
    expect(service.get(user.id)).toBeUndefined()
    expect(service.delete(user.id)).toBe(false)
  })
})
