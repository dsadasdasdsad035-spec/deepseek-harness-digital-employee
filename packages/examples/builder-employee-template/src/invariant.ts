/**
 * Package-owned invariant companion for the builder employee template.
 * @module @qq296629801/dsh-builder-employee-template/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-builder-employee-template'

/** Cordis companion plugin name. */
export const name = 'builder-employee-template-invariant'
/** Service required before reserving package ownership. */
export const inject = ['invariants']

/** No runtime invariant: template registration and draft validation own correctness. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
