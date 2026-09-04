/**
 * Package-owned invariant companion for the hook marketplace.
 * @module @deepseek-ai/dsh-hooks-market/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-hooks-market'

/** Cordis companion plugin name. */
export const name = 'hooks-market-invariant'
/** Service required before reserving package ownership. */
export const inject = ['invariants']

/** No runtime invariant: publisher trust and file-table hashes own package integrity. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
