/**
 * Package-owned invariant companion for the digital employee suite bundle.
 * @module @qq296629801/dsh-headless-employee/invariant
 */

import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-headless-employee'

/** Cordis plugin name. */
export const name = 'digital-employee-suite-bundle-invariant'
/** Service required before registration. */
export const inject = ['invariants']

/** No runtime invariant: the bundle only composes row manifests; it owns no runtime state. */
const install: InvariantInstaller = () => {}

/**
 * Register the bundle invariant companion.
 * @param ctx - Context carrying the invariant registry.
 * @returns The registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
