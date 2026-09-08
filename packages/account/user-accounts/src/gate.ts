/**
 * The web auth gate: one plugin owning (a) the request gate that redirects
 * unauthenticated traffic to /login, (b) the login/register/forgot/reset
 * pages, and (c) the /api/auth/* JSON endpoints they post to. Mounted on the
 * web surface by the web-app bundle; without it the webserver serves with no
 * gate (the pre-account behavior).
 *
 * @module @deepseek-ai/dsh-user-accounts/gate
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

// Type-only: pulls ctx.email into this program.
import type {} from '@deepseek-ai/dsh-email'
import type { SessionIdentity } from './index.ts'

/** Stable Cordis plugin name. */
export const name = 'user-accounts-gate'

/** Services required by the gate. */
export const inject = ['webServer', 'userAccounts', 'email']

/** Gate config. */
export interface Config {
  /** The cookie name (default dsh_session). */
  cookieName?: string
}

export const Config: z<Config> = z.object({
  cookieName: z.string().default('dsh_session'),
})

/** Paths usable without a session, by exact match or prefix. */
const PUBLIC_EXACT = new Set(['/login', '/register', '/forgot', '/reset', '/favicon.svg', '/favicon.ico'])
const PUBLIC_PREFIXES = ['/api/auth/', '/api/admin/', '/assets/']

function isPublicPath(pathname: string, firstBoot: boolean): boolean {
  if (firstBoot) return pathname === '/setup' || pathname === '/api/auth/setup'
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix))
}

/** Read one body field as a trimmed string; non-string values become ''. */
function readString(body: Record<string, unknown>, name: string): string {
  const value = body[name]
  return typeof value === 'string' ? value : ''
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie
  if (header === undefined) return undefined
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    if (pair.slice(0, eq).trim() === name) return decodeURIComponent(pair.slice(eq + 1).trim())
  }
  return undefined
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => {
      try {
        resolve(data === '' ? {} : JSON.parse(data) as Record<string, unknown>)
      } catch {
        reject(new Error('invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

/** The shared HTML shell for the four auth pages. */
function page(title: string, action: string, body: string): string {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${title} — DSH</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f6f8}
  form{background:#fff;padding:2rem 2.5rem;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);display:flex;flex-direction:column;gap:.9rem;min-width:320px}
  h1{font-size:1.2rem;margin:0}
  input{padding:.55rem .75rem;border:1px solid #ccc;border-radius:8px;font-size:1rem}
  button{padding:.6rem;border:0;border-radius:8px;background:#2563eb;color:#fff;font-size:1rem;cursor:pointer}
  a{color:#2563eb;font-size:.9rem}
  #msg{color:#c62828;font-size:.9rem;min-height:1.2em}
</style></head><body>
<form id="f" data-action="${action}">${body}
  <div id="msg"></div>
</form>
<script>
const f = document.getElementById('f')
f.addEventListener('submit', async (e) => {
  e.preventDefault()
  const msg = document.getElementById('msg')
  msg.textContent = ''
  const data = {}
  for (const el of f.querySelectorAll('input')) data[el.name] = el.value
  try {
    const res = await fetch(f.dataset.action, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(data) })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.ok) { location.href = body.redirect || '/' ; return }
    msg.textContent = body.error || ('请求失败 (' + res.status + ')')
  } catch (err) { msg.textContent = '网络错误' }
})
</script>
</body></html>`
}

/**
 * Mount the web auth gate.
 * @param ctx - context carrying the account service, email service, and webserver.
 * @param config - validated gate config.
 */
export function apply(ctx: Context, config: Config): void {
  const accounts = ctx.get('userAccounts')
  if (accounts === undefined) throw new Error('user-accounts-gate: ctx.userAccounts is required')
  const webServer = ctx.get('webServer') as {
    registerGate(handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean> | boolean): () => void
    register(route: { kind: 'exact'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
  } | undefined
  if (webServer === undefined) throw new Error('user-accounts-gate: ctx.webServer is required')
  const cookieName = config.cookieName ?? 'dsh_session'

  const setSessionCookie = (res: ServerResponse, cookie: string): void => {
    res.setHeader('set-cookie', `${cookieName}=${encodeURIComponent(cookie)}; HttpOnly; SameSite=Lax; Path=/`)
  }

  // ── the gate: everything not on the public list requires a valid session ──
  ctx.effect(() => webServer.registerGate((req: IncomingMessage, res: ServerResponse) => {
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    if (accounts.isEmpty()) {
      // First boot: force owner creation before anything else is reachable.
      if (pathname !== '/setup' && !isPublicPath(pathname, true)) {
        res.writeHead(302, { location: '/setup' })
        res.end()
        return false
      }
      if (pathname === '/setup' || pathname === '/api/auth/setup') return true
    }
    if (isPublicPath(pathname, false)) return true
    const cookie = readCookie(req, cookieName) ?? ''
    if (accounts.resolveSession(cookie) !== undefined) return true
    // Denied requests own their response: browsers follow the redirect to the
    // login page; SPA fetch calls see the 302 as an auth failure.
    res.writeHead(302, { location: '/login' })
    res.end()
    return false
  }), 'user-accounts-gate: request gate')

  // ── auth JSON endpoints ──
  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): void => {
    ctx.effect(() => webServer.register({ kind: 'exact', path, handler }), `user-accounts-gate: ${path}`)
  }

  route('/api/auth/login', async (req, res) => {
    const body = await readBody(req)
    const result = await accounts.login(readString(body, 'email'), readString(body, 'password'))
    switch (result.kind) {
      case 'ok':
        setSessionCookie(res, result.cookie)
        json(res, 200, { ok: true, redirect: '/' })
        return
      case 'locked':
        json(res, 200, { ok: false, error: `尝试次数过多，请 ${result.retryAfterMinutes} 分钟后再试` })
        return
      case 'disabled':
        json(res, 200, { ok: false, error: '账户已被禁用' })
        return
      default:
        json(res, 200, { ok: false, error: '邮箱或密码错误' })
    }
  })

  route('/api/auth/request-code', async (req, res) => {
    const body = await readBody(req)
    const email = readString(body, 'email')
    await accounts.issueVerificationCode(email, async (to, code) => {
      const outcome = await ctx.email.send({
        transport: 'qq-smtp',
        to,
        subject: 'DSH 注册验证码',
        text: `你的注册验证码是 ${code}，10 分钟内有效。`,
      })
      return outcome.delivered ? undefined : outcome.reason
    })
    json(res, 200, { ok: true })
  })

  route('/api/auth/register', async (req, res) => {
    if (!accounts.registrationAllowed) {
      json(res, 200, { ok: false, error: '注册已关闭，请联系管理员创建账户' })
      return
    }
    const body = await readBody(req)
    const email = readString(body, 'email')
    const password = readString(body, 'password')
    if (!accounts.verifyCode(email, readString(body, 'code'))) {
      json(res, 200, { ok: false, error: '验证码错误或已过期' })
      return
    }
    const outcome = await accounts.completeRegistration(email, password)
    if (outcome === 'duplicate') {
      json(res, 200, { ok: false, error: '注册请求无效' })
      return
    }
    const login = await accounts.login(email, password)
    if (login.kind === 'ok') setSessionCookie(res, login.cookie)
    json(res, 200, { ok: true, redirect: '/' })
  })

  route('/api/auth/forgot', async (req, res) => {
    const body = await readBody(req)
    const token = accounts.issueResetToken(readString(body, 'email'))
    if (token !== undefined) {
      // The email capability is the only transport; when uncomposed the reset
      // flow degrades to admin-side password setting.
      const outcome = await ctx.email.send({
        transport: 'qq-smtp',
        to: readString(body, 'email'),
        subject: 'DSH 密码重置',
        text: `15 分钟内有效，仅可使用一次：${new URL('/reset?token=' + token, 'http://' + (req.headers.host ?? 'localhost')).href}`,
      }).catch(() => ({ delivered: false as const, reason: '邮件服务未就绪' }))
      void outcome
    }
    json(res, 200, { ok: true })
  })

  route('/api/auth/reset', async (req, res) => {
    const body = await readBody(req)
    const updated = await accounts.completeReset(readString(body, 'token'), readString(body, 'password'))
    if (!updated) {
      json(res, 200, { ok: false, error: '重置链接无效或已过期，请重新申请' })
      return
    }
    json(res, 200, { ok: true, redirect: '/login' })
  })

  route('/api/auth/logout', (req, res) => {
    const cookie = readCookie(req, cookieName)
    if (cookie !== undefined) accounts.logout(cookie)
    res.setHeader('set-cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
    json(res, 200, { ok: true, redirect: '/login' })
  })

  // ── admin user-management endpoints (owner/admin sessions only) ──
  const adminGate = (req: IncomingMessage, res: ServerResponse): SessionIdentity | undefined => {
    const identity = accounts.resolveSession(readCookie(req, cookieName) ?? '')
    if (identity === undefined || (identity.role !== 'owner' && identity.role !== 'admin')) {
      res.writeHead(403, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'administrator only' }))
      return undefined
    }
    return identity
  }

  route('/api/admin/users/list', (req, res) => {
    if (adminGate(req, res) === undefined) return
    json(res, 200, { ok: true, users: accounts.list() })
  })

  route('/api/admin/users/create', async (req, res) => {
    if (adminGate(req, res) === undefined) return
    const body = await readBody(req)
    const email = readString(body, 'email').toLowerCase()
    const password = readString(body, 'password')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) {
      json(res, 200, { ok: false, error: '需要合法邮箱与至少 8 位密码' })
      return
    }
    if (accounts.idByEmail(email) !== undefined) {
      json(res, 200, { ok: false, error: '该邮箱已存在' })
      return
    }
    const view = await accounts.completeRegistration(email, password)
    json(res, 200, { ok: view !== 'duplicate', user: view === 'duplicate' ? null : view })
  })

  route('/api/admin/users/reset-password', async (req, res) => {
    if (adminGate(req, res) === undefined) return
    const body = await readBody(req)
    const updated = await accounts.adminSetPassword(readString(body, 'id'), readString(body, 'password'))
    json(res, 200, { ok: updated })
  })

  route('/api/admin/users/set-disabled', async (req, res) => {
    if (adminGate(req, res) === undefined) return
    const body = await readBody(req)
    const id = readString(body, 'id')
    const account = accounts.get(id)
    if (account !== undefined && account.role === 'owner') {
      json(res, 200, { ok: false, error: '不能禁用 owner 账户' })
      return
    }
    json(res, 200, { ok: accounts.setDisabled(id, body.disabled === true) })
  })

  route('/api/admin/users/delete', async (req, res) => {
    if (adminGate(req, res) === undefined) return
    const body = await readBody(req)
    const id = readString(body, 'id')
    const account = accounts.get(id)
    if (account !== undefined && account.role === 'owner') {
      json(res, 200, { ok: false, error: '不能删除 owner 账户' })
      return
    }
    json(res, 200, { ok: accounts.delete(id) })
  })

  // ── first-boot owner bootstrap ──
  route('/api/auth/setup', async (req, res) => {
    if (!accounts.isEmpty()) {
      json(res, 200, { ok: false, error: 'owner 已存在' })
      return
    }
    const body = await readBody(req)
    const owner = await accounts.createOwner(readString(body, 'email'), readString(body, 'password'))
    const login = await accounts.login(owner.email, readString(body, 'password'))
    if (login.kind === 'ok') setSessionCookie(res, login.cookie)
    json(res, 200, { ok: true, redirect: '/' })
  })

  route('/setup', (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page('初始化管理员', '/api/auth/setup', `
      <h1>创建管理员账户</h1>
      <input name="email" placeholder="管理员邮箱" required>
      <input name="password" type="password" placeholder="密码（至少 8 位）" required minlength="8">
      <button type="submit">创建并登录</button>
    `.trim()))
    void _req
  })

  // ── pages ──
  route('/login', (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page('登录', '/api/auth/login', `
      <h1>登录 DSH</h1>
      <input name="email" placeholder="邮箱" required>
      <input name="password" type="password" placeholder="密码" required>
      <button type="submit">登录</button>
      <a href="/forgot">忘记密码？</a>
      <a href="/register">注册新账户</a>
    `.trim()))
    void _req
  })

  route('/register', (_req, res) => {
    if (!accounts.registrationAllowed) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(page('注册', '/api/auth/register', `
        <h1>注册 DSH 账户</h1>
        <p>注册已关闭，请联系管理员创建账户。</p>
        <a href="/login">返回登录</a>
      `.trim()))
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page('注册', '/api/auth/register', `
      <h1>注册 DSH 账户</h1>
      <input name="email" placeholder="邮箱" required>
      <div style="display:flex;gap:.5rem">
        <input name="code" placeholder="邮箱验证码" required style="flex:1">
        <button type="button" id="send">发送验证码</button>
      </div>
      <input name="password" type="password" placeholder="设置密码（至少 8 位）" required minlength="8">
      <button type="submit">注册并登录</button>
      <div id="msg"></div>
      <a href="/login">已有账户？登录</a>
    `.trim()) + `
    <script>
      document.getElementById('send').addEventListener('click', async () => {
        const email = document.querySelector('input[name=email]').value
        const msg = document.getElementById('msg')
        const res = await fetch('/api/auth/request-code', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ email }) })
        msg.textContent = res.ok ? '验证码已发送，请查收邮箱' : '发送失败'
      })
      document.getElementById('f').removeEventListener('submit', () => {})
    </` + 'script>')
    void _req
  })

  route('/forgot', (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page('忘记密码', '/api/auth/forgot', `
      <h1>重置密码</h1>
      <input name="email" placeholder="注册邮箱" required>
      <button type="submit">发送重置链接</button>
      <div id="msg" style="color:#1a7f37"></div>
      <a href="/login">返回登录</a>
    `.trim()))
    void _req
  })

  route('/reset', (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(page('设置新密码', '/api/auth/reset', `
      <h1>设置新密码</h1>
      <input name="token" placeholder="重置令牌（邮件链接已自动带上）" required>
      <input name="password" type="password" placeholder="新密码（至少 8 位）" required minlength="8">
      <button type="submit">确认重置</button>
      <a href="/login">返回登录</a>
    `.trim()))
    void _req
  })
}
