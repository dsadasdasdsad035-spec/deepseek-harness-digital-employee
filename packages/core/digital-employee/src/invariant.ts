/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-digital-employee`.
 * @module @deepseek-ai/dsh-digital-employee/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-digital-employee'

/** Cordis companion plugin name. */
export const name = 'digital-employee-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the Definition owns one template map and publishes its
 * change event in the same synchronous effect that mutates that map.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
