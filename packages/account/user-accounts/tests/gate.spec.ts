/**
 * The web auth gate over a real Loader-composed webserver: unauthenticated
 * traffic redirects, the public allowlist passes, login issues a working
 * session cookie, first boot forces owner creation, and the admin endpoints
 * gate by role.
 */

import { mkdtempSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@qq296629801/cordis'
import Loader from '@qq296629801/cordis-plugin-loader'
import Include from '@qq296629801/cordis-plugin-include'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import HttpServer from '@qq296629801/dsh-host-webserver'
import UserAccounts from '@qq296629801/dsh-user-accounts'
import type { UserAccountService } from '../src/index.ts'
import * as Gate from '../src/gate.ts'
import EmailService from '@qq296629801/dsh-email'
import * as QqSmtp from '@qq296629801/dsh-email/qq-smtp'

let context: Context | undefined
let origin: string
let cookie: string | undefined
let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-auth-gate-'))
})

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  cookie = undefined
})

interface CallResult {
  status: number
  text: string
  setCookie: string | null
  location?: string | null
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<CallResult> {
  const res = await fetch(origin + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie !== undefined ? { cookie: `dsh_session=${encodeURIComponent(cookie)}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  })
  const setCookie = res.headers.get('set-cookie')
  return { status: res.status, text: await res.text(), setCookie, location: res.headers.get('location') }
}

/** Compose the real webserver + account gate over a temp user store. */
async function boot(options: { seedOwner?: boolean } = {}): Promise<UserAccountService> {
  root = await mkdtemp(join(tmpdir(), 'dsh-auth-gate-root-'))
  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@qq296629801/dsh-host-webserver', HttpServer],
    ['@qq296629801/dsh-user-accounts', UserAccounts],
    ['@qq296629801/dsh-user-accounts/gate', Gate],
    ['@qq296629801/dsh-email', EmailService],
    ['@qq296629801/dsh-email/qq-smtp', QqSmtp],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@qq296629801/dsh-host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@qq296629801/dsh-user-accounts'",
    '  config:',
    '    allowRegistration: true',
    '    dbPath: ' + JSON.stringify(join(root, 'users.db')),
    "- name: '@qq296629801/dsh-user-accounts/gate'",
    "- name: '@qq296629801/dsh-email'",
    "- name: '@qq296629801/dsh-email/qq-smtp'",
    '  config:',
    '    userRef: SMTP_USER',
    '    passRef: SMTP_PASS',
    '',
  ].join('\n'))
  await context.loader.create({ name: 'cordis:include', config: { path: configPath } })
  await context.loader.await()
  const port = (context.get('webServer') as unknown as { port: number }).port
  origin = `http://127.0.0.1:${port}`
  const accounts = context.get('userAccounts') as UserAccountService
  if (options.seedOwner !== false && accounts.isEmpty()) {
    await accounts.createOwner('owner@example.com', 'pw-123456')
  }
  return accounts
}

describe('web auth gate', () => {
  it('redirects unauthenticated page traffic to /login and blocks unknown API paths', async () => {
    await boot()
    const page = await call('GET', '/')
    expect(page.status).toBe(302)
    expect(page.location).toBe('/login')
    const rpc = await call('POST', '/rpc', { method: 'anything' })
    expect(rpc.status).toBe(302)
    expect(rpc.location).toBe('/login')
    expect(rpc.text).toBe('')
  })

  it('keeps the public allowlist reachable without a session', async () => {
    await boot()
    const loginPage = await call('GET', '/login')
    expect(loginPage.status).toBe(200)
    expect(loginPage.text).toContain('登录 DSH')
    const registerPage = await call('GET', '/register')
    expect(registerPage.status).toBe(200)
    expect(registerPage.text).toContain('注册 DSH 账户')
    const unknownApi = await call('GET', '/api/auth/unknown')
    expect(unknownApi.status).toBe(404)
  })

  it('logs in through /api/auth/login and the cookie passes the gate', async () => {
    await boot()
    const bad = await call('POST', '/api/auth/login', { email: 'owner@example.com', password: 'wrong' })
    expect(JSON.parse(bad.text)).toEqual({ ok: false, error: '邮箱或密码错误' })
    const good = await call('POST', '/api/auth/login', { email: 'owner@example.com', password: 'pw-123456' })
    expect(JSON.parse(good.text)).toEqual({ ok: true, redirect: '/' })
    cookie = /dsh_session=([^;]+)/.exec(good.setCookie ?? '')?.[1]
    // The fixture composes no SPA pages, so an authenticated '/' is passed
    // through dispatch (404 from the empty fallback) rather than redirected.
    const page = await call('GET', '/')
    expect(page.status).not.toBe(302)
    expect(page.text).not.toContain('/login')
  })

  it('logout invalidates the session cookie', async () => {
    await boot()
    const login = await call('POST', '/api/auth/login', { email: 'owner@example.com', password: 'pw-123456' })
    cookie = /dsh_session=([^;]+)/.exec(login.setCookie ?? '')?.[1]
    const out = await call('POST', '/api/auth/logout')
    expect((JSON.parse(out.text) as { ok: boolean }).ok).toBe(true)
    const page = await call('GET', '/')
    expect(page.status).toBe(302)
  })

  it('forces first-boot owner creation on an empty store', async () => {
    await boot({ seedOwner: false })
    const redirected = await call('GET', '/')
    expect(redirected.status).toBe(302)
    expect(redirected.location).toBe('/setup')
    const setupPage = await call('GET', '/setup')
    expect(setupPage.status).toBe(200)
    expect(setupPage.text).toContain('创建管理员账户')
    const created = await call('POST', '/api/auth/setup', { email: 'boss@example.com', password: 'boot-pw-1' })
    expect((JSON.parse(created.text) as { ok: boolean }).ok).toBe(true)
    const again = await call('POST', '/api/auth/setup', { email: 'x@example.com', password: 'boot-pw-2' })
    expect((JSON.parse(again.text) as { ok: boolean }).ok).toBe(false)
  })

  it('admin endpoints gate by role', async () => {
    const service = await boot()
    await service.completeRegistration('admin@example.com', 'pw-123456')
    const adminId = service.idByEmail('admin@example.com') as string
    service.setRole(adminId, 'admin')
    await service.completeRegistration('user@example.com', 'pw-123456')
    const ownerLogin = await call('POST', '/api/auth/login', { email: 'owner@example.com', password: 'pw-123456' })
    cookie = /dsh_session=([^;]+)/.exec(ownerLogin.setCookie ?? '')?.[1]
    const listed = await call('POST', '/api/admin/users/list')
    expect(listed.status).toBe(200)
    expect((JSON.parse(listed.text) as { ok: boolean }).ok).toBe(true)
  })
})
