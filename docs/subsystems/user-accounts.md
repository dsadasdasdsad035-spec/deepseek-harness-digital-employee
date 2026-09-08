# User Accounts

English | [中文](user-accounts.zh.md)

[`@deepseek-ai/dsh-user-accounts`](../../packages/account/user-accounts) is the account system for the Web surface (`ctx.userAccounts`): SQLite user store, argon2id password hashing, email verification codes, single-use reset tokens, HMAC-signed session cookies, and login rate limiting. The web auth gate redirects unauthenticated traffic to `/login` and keeps `/register`, `/forgot`, `/reset`, `/api/auth/*`, and static assets public.

Source: [`packages/account/user-accounts/src/index.ts`](../../packages/account/user-accounts/src/index.ts)

## Public types

```ts type-equiv
/** Account role. `owner` is the bootstrap account and cannot be removed or demoted. */
type AccountRole = 'owner' | 'admin' | 'user'
```

```ts type-equiv
/** The signed session identity bound into the request context after login. */
interface SessionIdentity {
  /** Account id the session belongs to. */
  readonly accountId: string
  /** Account role at session creation. */
  readonly role: AccountRole
}
```

## First boot

An empty store forces owner creation before the rest of the surface is reachable; the `owner` role cannot be disabled, deleted, or demoted. `allowRegistration` gates open registration (default off).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxuseraccounts--useraccountservice"></a>

### `ctx.userAccounts` — `UserAccountService`

The account service, registered as `ctx.userAccounts`.

```ts cordis-catalog
/**
 * Whether the users table is empty, which drives first-boot owner creation.
 * @returns true when no account exists yet.
 */
isEmpty(): boolean

/**
 * List every account as a hash-free view, in creation order.
 * @returns the account views.
 */
list(): UserAccountView[]

/**
 * Look up one account id by email (admin flows).
 * @param email - the email address (case-insensitive).
 * @returns the account id, or undefined.
 */
idByEmail(email: string): string | undefined

/**
 * Look up one account view by id.
 * @param id - the account id.
 * @returns the account view, or undefined.
 */
get(id: string): UserAccountView | undefined

/**
 * Create the first `owner` account (first-boot bootstrap; bypasses
 * allowRegistration by design).
 * @param email - the owner's email (case-insensitive).
 * @param password - the plaintext password; stored as argon2id.
 * @returns the created account view.
 */
async createOwner(email: string, password: string): Promise<UserAccountView>

/**
 * Verify login credentials and rate limits.
 * @param email - the email address.
 * @param password - the plaintext password attempt.
 * @returns the session identity and cookie token, or a closed failure kind.
 */
async login(email: string, password: string): Promise< { kind: 'ok'; cookie: string; identity: SessionIdentity } | { kind: 'locked'; retryAfterMinutes: number } | { kind: 'bad-credentials' } | { kind: 'disabled' } >

/**
 * Validate a session cookie value.
 * @param cookie - the raw cookie token.
 * @returns the session identity, or undefined when invalid/expired.
 */
resolveSession(cookie: string): SessionIdentity | undefined

/**
 * Invalidate one session (logout).
 * @param cookie - the raw cookie token.
 */
logout(cookie: string): void

/**
 * Invalidate every session belonging to one account.
 * @param accountId - the account whose sessions die.
 */
invalidateAllFor(accountId: string): void

/**
 * Issue a verification code for one email and hand it to the send callback.
 * Uniform regardless of registration state (anti-enumeration).
 * @param email - the target email.
 * @param send - the delivery callback; returns the failure reason when undeliverable.
 */
async issueVerificationCode(email: string, send: (to: string, code: string) => Promise<string | undefined>): Promise<void>

/**
 * Consume a verification code for one email.
 * @param email - the email the code was issued for.
 * @param code - the candidate code.
 * @returns true when the code matches and is unexpired.
 */
verifyCode(email: string, code: string): boolean

/**
 * Create the account after code verification (registration step two).
 * @param email - the verified email.
 * @param password - the chosen password.
 * @returns the account view, or `duplicate` when the email is taken.
 */
async completeRegistration(email: string, password: string): Promise<UserAccountView | 'duplicate'>

/**
 * Issue a password reset token for one email; returns undefined for unknown
 * emails so callers keep the uniform response (anti-enumeration).
 * @param email - the email to reset.
 * @returns the reset token when the account exists.
 */
issueResetToken(email: string): string | undefined

/**
 * Consume a reset token and set a new password; invalidates all sessions of
 * the account.
 * @param token - the reset token.
 * @param newPassword - the replacement password.
 * @returns true when the token was valid and the password updated.
 */
async completeReset(token: string, newPassword: string): Promise<boolean>

/**
 * Change one account's password (admin reset) and kill its sessions.
 * @param accountId - the target account id.
 * @param newPassword - the replacement password.
 * @returns true when the account exists.
 */
async adminSetPassword(accountId: string, newPassword: string): Promise<boolean>

/**
 * Set the disabled flag; disabling kills all sessions of the account.
 * @param accountId - the target account id.
 * @param disabled - the new flag.
 * @returns true when the account exists.
 */
setDisabled(accountId: string, disabled: boolean): boolean

/**
 * Set an account's role.
 * @param accountId - the target account id.
 * @param role - the new role.
 * @returns true when the account exists.
 */
setRole(accountId: string, role: AccountRole): boolean

/**
 * Delete one account entirely.
 * @param accountId - the target account id.
 * @returns true when the account existed.
 */
delete(accountId: string): boolean

/**
 * Count the live `owner` accounts.
 * @returns the owner count.
 */
ownerCount(): number

/**
 * Whether any account besides the target exists (last-owner protection).
 * @param accountId - the account excluded from the check.
 * @returns true when another account exists.
 */
hasOtherAccounts(accountId: string): boolean
```

Source: [`packages/account/user-accounts/src/index.ts`](../../packages/account/user-accounts/src/index.ts)
<!-- END GENERATED cordis-surface -->
