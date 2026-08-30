/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-digital-employee-file`.
 * @module @deepseek-ai/dsh-digital-employee-file/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-digital-employee-file'

/** Cordis companion plugin name. */
export const name = 'digital-employee-file-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: each mutation publishes one complete versioned document by atomic rename. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns installed registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
