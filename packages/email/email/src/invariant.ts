/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-email`.
 * @module @deepseek-ai/dsh-email/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-email'

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
