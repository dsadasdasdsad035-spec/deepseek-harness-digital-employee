/**
 * Pure types of the account system: user records, roles, session identity,
 * and the public view that never carries a password hash.
 *
 * @module @deepseek-ai/dsh-user-accounts/types
 */

/** Account role. `owner` is the bootstrap account and cannot be removed or demoted. */
export type AccountRole = 'owner' | 'admin' | 'user'

/** One stored user account. The password hash never leaves the store module. */
export interface UserAccount {
  /** Account id (random UUID). */
  readonly id: string
  /** Lowercased email address, unique across the table. */
  readonly email: string
  /** argon2id hash string (salt and parameters embedded). */
  readonly passwordHash: string
  /** Account role. */
  readonly role: AccountRole
  /** Disabled accounts cannot log in; their sessions are invalidated. */
  readonly disabled: boolean
  /** Multi-tenant owner pre-embedding: initially the account's own id. */
  readonly ownerId: string
  /** ISO timestamp of creation. */
  readonly createdAt: string
}

/** The public view of an account: no password hash ever crosses this face. */
export interface UserAccountView {
  readonly id: string
  readonly email: string
  readonly role: AccountRole
  readonly disabled: boolean
  readonly ownerId: string
  readonly createdAt: string
}

/** The signed session identity bound into the request context after login. */
export interface SessionIdentity {
  /** Account id the session belongs to. */
  readonly accountId: string
  /** Account role at session creation. */
  readonly role: AccountRole
}
