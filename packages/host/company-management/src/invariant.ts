/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-company-management`.
 * @module @deepseek-ai/dsh-host-company-management/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-company-management'

/** Cordis companion plugin name. */
export const name = 'company-management-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the gateway defers every mutation to the company
 * provider's serialized transactions and reads the agent and persistence
 * registries per request.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns installed registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
