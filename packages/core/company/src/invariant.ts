/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-company`.
 * @module @deepseek-ai/dsh-company/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-company'

/** Cordis companion plugin name. */
export const name = 'company-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the Definition defers every operation to the sole
 * configured provider and publishes `companies/change` inside the same
 * serialized mutation that changed the document.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
