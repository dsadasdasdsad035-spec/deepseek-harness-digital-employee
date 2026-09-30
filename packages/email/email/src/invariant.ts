/**
 * Package-owned invariant companion for `@qq296629801/dsh-email`.
 * @module @qq296629801/dsh-email/invariant
 */

import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-email'

/** Cordis companion plugin name. */
export const name = 'email-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the email seam owns no session events and no mutable
 * cross-call state — every transport registration is registry-disposed with
 * its fiber, and delivery outcomes are returned to the caller that owns their
 * audit trail.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
