/** Digital employee Agent Consumer invariants. @module @deepseek-ai/dsh-digital-employee-agent/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-digital-employee-agent'

/** Cordis companion plugin name. */
export const name = 'digital-employee-agent-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: composition is validated before Agent publication. */
const install: InvariantInstaller = () => {}

/**
 * Register the digital employee Agent Consumer invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
