/**
 * Package-owned invariant companion for the digital employee suite bundle.
 * @module @deepseek-ai/dsh-digital-employee-suite/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-digital-employee-suite'

/** Cordis plugin name. */
export const name = 'digital-employee-suite-bundle-invariant'
/** Service required before registration. */
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

/**
 * Register the bundle invariant companion.
 * @param ctx - Context carrying the invariant registry.
 * @returns The registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
