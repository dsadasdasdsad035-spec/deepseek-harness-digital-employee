/**
 * Package-owned invariant companion for the subagent marketplace.
 * @module @qq296629801/dsh-subagent-market/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-subagent-market'

/** Cordis companion plugin name. */
export const name = 'subagent-market-invariant'
/** Service required before reserving package ownership. */
export const inject = ['invariants']

/** No runtime invariant: publisher trust and file-table hashes own package integrity. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
