/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-notification`.
 * @module @deepseek-ai/dsh-notification/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-notification'

/** Cordis companion plugin name. */
export const name = 'notification-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the notification seam owns no session events and no
 * mutable cross-call state — every channel registration is registry-disposed
 * with its fiber, and delivery outcomes are returned to the caller that owns
 * their audit trail.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
