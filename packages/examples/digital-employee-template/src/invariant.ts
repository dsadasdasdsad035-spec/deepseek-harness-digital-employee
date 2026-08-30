/**
 * Package-owned invariant companion for the digital employee example template.
 * @module @deepseek-ai/dsh-digital-employee-example-template/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-digital-employee-example-template'

/** Cordis companion plugin name. */
export const name = 'digital-employee-example-template-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the digital employee registry validates and owns each immutable
 * template registration, while this package contributes no second mutable source to compare.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
