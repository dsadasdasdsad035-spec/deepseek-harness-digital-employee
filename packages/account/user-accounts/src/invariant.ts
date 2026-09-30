/**
 * Package-owned invariant companion for `@qq296629801/dsh-user-accounts`.
 * @module @qq296629801/dsh-user-accounts/invariant
 */

import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-user-accounts'

/** Cordis companion plugin name. */
export const name = 'user-accounts-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the account store owns no session events; passwords
 * and tokens never cross the package boundary, and every mutation is a direct
 * synchronous store call whose result the caller owns.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
