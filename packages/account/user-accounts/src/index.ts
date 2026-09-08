/**
 * The account store and service: SQLite users table (node:sqlite), argon2id
 * password hashing, email verification codes, single-use reset tokens, signed
 * session cookies, and login rate limiting. All in-memory ephemeral state
 * (sessions, codes, tokens, rate counters) is intentional — restarts invalidate
 * them and users simply re-authenticate.
 *
 * Security invariants enforced here:
 * - password hashes never leave the store; views are hash-free
 * - registration and forgot-password responses are uniform (anti-enumeration)
 * - verification codes and reset tokens are single-use with TTLs
 * - login failures lock the email for 15 minutes after 5 consecutive failures
 *
 * @module @deepseek-ai/dsh-user-accounts
 */

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type { AccountRole, SessionIdentity, UserAccountView } from './types.ts'

export type { AccountRole, SessionIdentity, UserAccount, UserAccountView } from './types.ts'

/** Session cookie lifetime in milliseconds (default 7 days). */
export const SESSION_TTL_MS = 7 * 24 * 3_600_000
/** Verification code TTL. */
export const CODE_TTL_MS = 10 * 60_000
/** Reset token TTL. */
export const RESET_TTL_MS = 15 * 60_000
/** Failed logins before the email locks. */
export const LOCK_THRESHOLD = 5
/** Lock duration after the threshold. */
export const LOCK_MS = 15 * 60_000
/** Per-IP sliding-window limit. */
export const IP_WINDOW_LIMIT = 60
/** Per-IP window length. */
export const IP_WINDOW_MS = 60_000

/** Plugin config. */
export interface Config {
  /** Allow open registration (default false — accounts are admin-created). */
  allowRegistration?: boolean
  /** Session lifetime in milliseconds (default 7 days). */
  sessionTtlMs?: number
  /** Absolute path to the users database (tests substitute; default under $DSH_HOME). */
  dbPath?: string
}

export const Config: z<Config> = z.object({
  allowRegistration: z.boolean().default(false),
  sessionTtlMs: z.number().min(60_000).default(SESSION_TTL_MS),
  dbPath: z.string(),
})

/** One pending reset token (owner = the account it resets). */
interface ResetRow {
  owner: string
  expiresAt: number
}

/** One email's login-failure lock state. */
interface LockState {
  failures: number
  lockedUntil: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    userAccounts: UserAccountService
  }
}

/** Stable Cordis plugin name for loader mounting. */
export const name = 'user-accounts'

/** The account service, registered as `ctx.userAccounts`. */
export class UserAccountService extends Service {
  static Config: z<Config> = Config

  private db!: DatabaseSync
  private sessions = new Map<string, { accountId: string; expiresAt: number }>()
  private codes = new Map<string, { codeHash: string; expiresAt: number }>()
  private resets = new Map<string, ResetRow>()
  private locks = new Map<string, LockState>()
  private ipWindow: number[] = []
  private secret = randomBytes(32)
  private readonly options: Config

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'userAccounts')
    this.options = config
    const dbPath = config.dbPath ?? join(resolveDshHome(), 'accounts', 'users.db')
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      disabled INTEGER NOT NULL DEFAULT 0,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`)
  }

  /**
   * Whether the users table is empty, which drives first-boot owner creation.
   * @returns true when no account exists yet.
   */
  isEmpty(): boolean {
    return this.count() === 0
  }

  /**
   * List every account as a hash-free view, in creation order.
   * @returns the account views.
   */
  list(): UserAccountView[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at').all() as Array<Record<string, unknown>>
    return rows.map(row => this.viewOf(row))
  }

  /**
   * Look up one account id by email (admin flows).
   * @param email - the email address (case-insensitive).
   * @returns the account id, or undefined.
   */
  idByEmail(email: string): string | undefined {
    const row = this.findByEmail(normalizeEmail(email))
    return row === undefined ? undefined : String(row.id)
  }

  /**
   * Look up one account view by id.
   * @param id - the account id.
   * @returns the account view, or undefined.
   */
  get(id: string): UserAccountView | undefined {
    const row = this.rowById(id)
    return row === undefined ? undefined : this.viewOf(row)
  }

  /**
   * Create the first `owner` account (first-boot bootstrap; bypasses
   * allowRegistration by design).
   * @param email - the owner's email (case-insensitive).
   * @param password - the plaintext password; stored as argon2id.
   * @returns the created account view.
   */
  async createOwner(email: string, password: string): Promise<UserAccountView> {
    return await this.insert(normalizeEmail(email), password, 'owner')
  }

  /**
   * Verify login credentials and rate limits.
   * @param email - the email address.
   * @param password - the plaintext password attempt.
   * @returns the session identity and cookie token, or a closed failure kind.
   */
  async login(email: string, password: string): Promise<
    { kind: 'ok'; cookie: string; identity: SessionIdentity }
    | { kind: 'locked'; retryAfterMinutes: number }
    | { kind: 'bad-credentials' }
    | { kind: 'disabled' }
  > {
    const normalized = normalizeEmail(email)
    const now = Date.now()
    if (!this.ipAllows(now)) return { kind: 'locked', retryAfterMinutes: 1 }
    const lock = this.locks.get(normalized)
    if (lock !== undefined && lock.lockedUntil > now) {
      return { kind: 'locked', retryAfterMinutes: Math.ceil((lock.lockedUntil - now) / 60_000) }
    }
    const row = this.findByEmail(normalized)
    if (row === undefined || !(await this.verifyPassword(row.password_hash as string, password))) {
      this.recordFailure(normalized, now)
      return { kind: 'bad-credentials' }
    }
    if (row.disabled === 1) return { kind: 'disabled' }
    this.locks.delete(normalized)
    return this.issueSession(row)
  }

  /**
   * Validate a session cookie value.
   * @param cookie - the raw cookie token.
   * @returns the session identity, or undefined when invalid/expired.
   */
  resolveSession(cookie: string): SessionIdentity | undefined {
    const raw = this.verifyCookie(cookie)
    if (raw === undefined) return undefined
    const tokenHash = this.hashToken(raw)
    const row = this.sessions.get(tokenHash)
    if (row === undefined || row.expiresAt <= Date.now()) {
      this.sessions.delete(tokenHash)
      return undefined
    }
    const account = this.rowById(row.accountId)
    if (account === undefined || account.disabled === 1) return undefined
    return { accountId: account.id as string, role: account.role as AccountRole }
  }

  /**
   * Invalidate one session (logout).
   * @param cookie - the raw cookie token.
   */
  logout(cookie: string): void {
    const raw = this.verifyCookie(cookie)
    if (raw !== undefined) this.sessions.delete(this.hashToken(raw))
  }

  /**
   * Invalidate every session belonging to one account.
   * @param accountId - the account whose sessions die.
   */
  invalidateAllFor(accountId: string): void {
    for (const [hash, row] of this.sessions) {
      if (row.accountId === accountId) this.sessions.delete(hash)
    }
  }

  /**
   * Issue a verification code for one email and hand it to the send callback.
   * Uniform regardless of registration state (anti-enumeration).
   * @param email - the target email.
   * @param send - the delivery callback; returns the failure reason when undeliverable.
   */
  async issueVerificationCode(email: string, send: (to: string, code: string) => Promise<string | undefined>): Promise<void> {
    const code = String(100000 + Math.floor(Math.random() * 900000))
    this.codes.set(normalizeEmail(email), {
      codeHash: this.hashToken(code),
      expiresAt: Date.now() + CODE_TTL_MS,
    })
    await send(email, code)
  }

  /**
   * Consume a verification code for one email.
   * @param email - the email the code was issued for.
   * @param code - the candidate code.
   * @returns true when the code matches and is unexpired.
   */
  verifyCode(email: string, code: string): boolean {
    const row = this.codes.get(normalizeEmail(email))
    if (row === undefined || row.expiresAt <= Date.now()) return false
    const a = Buffer.from(this.hashToken(code))
    const b = Buffer.from(row.codeHash)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false
    this.codes.delete(normalizeEmail(email))
    return true
  }

  /**
   * Create the account after code verification (registration step two).
   * @param email - the verified email.
   * @param password - the chosen password.
   * @returns the account view, or `duplicate` when the email is taken.
   */
  async completeRegistration(email: string, password: string): Promise<UserAccountView | 'duplicate'> {
    const normalized = normalizeEmail(email)
    if (this.findByEmail(normalized) !== undefined) return 'duplicate'
    return await this.insert(normalized, password, 'user')
  }

  /** Whether open registration is allowed by config. */
  get registrationAllowed(): boolean {
    return this.options.allowRegistration ?? false
  }

  /**
   * Issue a password reset token for one email; returns undefined for unknown
   * emails so callers keep the uniform response (anti-enumeration).
   * @param email - the email to reset.
   * @returns the reset token when the account exists.
   */
  issueResetToken(email: string): string | undefined {
    const row = this.findByEmail(normalizeEmail(email))
    if (row === undefined) return undefined
    const token = randomBytes(24).toString('base64url')
    this.resets.set(token, {
      owner: String(row.id),
      expiresAt: Date.now() + RESET_TTL_MS,
    })
    return token
  }

  /**
   * Consume a reset token and set a new password; invalidates all sessions of
   * the account.
   * @param token - the reset token.
   * @param newPassword - the replacement password.
   * @returns true when the token was valid and the password updated.
   */
  async completeReset(token: string, newPassword: string): Promise<boolean> {
    const row = this.resets.get(token)
    if (row === undefined || row.expiresAt <= Date.now()) return false
    this.resets.delete(token)
    const passwordHash = await this.hashPassword(newPassword)
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.owner)
    this.invalidateAllFor(row.owner)
    return true
  }

  /**
   * Change one account's password (admin reset) and kill its sessions.
   * @param accountId - the target account id.
   * @param newPassword - the replacement password.
   * @returns true when the account exists.
   */
  async adminSetPassword(accountId: string, newPassword: string): Promise<boolean> {
    if (this.get(accountId) === undefined) return false
    const passwordHash = await this.hashPassword(newPassword)
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, accountId)
    this.invalidateAllFor(accountId)
    return true
  }

  /**
   * Set the disabled flag; disabling kills all sessions of the account.
   * @param accountId - the target account id.
   * @param disabled - the new flag.
   * @returns true when the account exists.
   */
  setDisabled(accountId: string, disabled: boolean): boolean {
    if (this.get(accountId) === undefined) return false
    this.db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, accountId)
    if (disabled) this.invalidateAllFor(accountId)
    return true
  }

  /**
   * Set an account's role.
   * @param accountId - the target account id.
   * @param role - the new role.
   * @returns true when the account exists.
   */
  setRole(accountId: string, role: AccountRole): boolean {
    if (this.get(accountId) === undefined) return false
    this.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, accountId)
    return true
  }

  /**
   * Delete one account entirely.
   * @param accountId - the target account id.
   * @returns true when the account existed.
   */
  delete(accountId: string): boolean {
    if (this.get(accountId) === undefined) return false
    this.db.prepare('DELETE FROM users WHERE id = ?').run(accountId)
    this.invalidateAllFor(accountId)
    return true
  }

  /**
   * Count the live `owner` accounts.
   * @returns the owner count.
   */
  ownerCount(): number {
    return this.count("role = 'owner'")
  }

  /**
   * Whether any account besides the target exists (last-owner protection).
   * @param accountId - the account excluded from the check.
   * @returns true when another account exists.
   */
  hasOtherAccounts(accountId: string): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM users WHERE id != ?').get(accountId) as { n: number }
    return row.n > 0
  }

  private count(where = '1=1'): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${where}`).get() as { n: number }
    return row.n
  }

  private rowById(id: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  }

  private findByEmail(normalized: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(normalized)
  }

  private viewOf(row: Record<string, unknown>): UserAccountView {
    return {
      id: String(row.id),
      email: String(row.email),
      role: row.role as AccountRole,
      disabled: row.disabled === 1,
      ownerId: String(row.owner_id),
      createdAt: String(row.created_at),
    }
  }

  private async insert(email: string, password: string, role: AccountRole): Promise<UserAccountView> {
    const id = randomUUID()
    const passwordHash = await this.hashPassword(password)
    const createdAt = new Date().toISOString()
    this.db.prepare('INSERT INTO users (id, email, password_hash, role, disabled, owner_id, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(id, email, passwordHash, role, id, createdAt)
    return { id, email, role, disabled: false, ownerId: id, createdAt }
  }

  private issueSession(row: Record<string, unknown>): { kind: 'ok'; cookie: string; identity: SessionIdentity } {
    const raw = randomBytes(32).toString('base64url')
    this.sessions.set(this.hashToken(raw), {
      accountId: String(row.id),
      expiresAt: Date.now() + (this.options.sessionTtlMs ?? SESSION_TTL_MS),
    })
    const identity: SessionIdentity = { accountId: String(row.id), role: row.role as AccountRole }
    return { kind: 'ok', cookie: this.signCookie(raw), identity }
  }

  private signCookie(raw: string): string {
    return `${raw}.${createHmac('sha256', this.secret).update(raw).digest('base64url')}`
  }

  private verifyCookie(cookie: string): string | undefined {
    const dot = cookie.lastIndexOf('.')
    if (dot <= 0) return undefined
    const raw = cookie.slice(0, dot)
    const mac = Buffer.from(cookie.slice(dot + 1))
    const expected = Buffer.from(createHmac('sha256', this.secret).update(raw).digest('base64url'))
    if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return undefined
    return raw
  }

  private hashToken(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex')
  }

  private async hashPassword(password: string): Promise<string> {
    const argon2 = await import('argon2')
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65_536, timeCost: 2, parallelism: 1 })
  }

  private async verifyPassword(hash: string, password: string): Promise<boolean> {
    const argon2 = await import('argon2')
    return argon2.verify(hash, password)
  }

  private recordFailure(normalized: string, now: number): void {
    const lock = this.locks.get(normalized) ?? { failures: 0, lockedUntil: 0 }
    lock.failures += 1
    if (lock.failures >= LOCK_THRESHOLD) lock.lockedUntil = now + LOCK_MS
    this.locks.set(normalized, lock)
  }

  private ipAllows(now: number): boolean {
    this.ipWindow = this.ipWindow.filter(t => now - t < IP_WINDOW_MS)
    if (this.ipWindow.length >= IP_WINDOW_LIMIT) return false
    this.ipWindow.push(now)
    return true
  }
}

/**
 * Normalize an email for storage and lookup.
 * @param email - the raw email address.
 * @returns the trimmed lowercase form.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export default UserAccountService
