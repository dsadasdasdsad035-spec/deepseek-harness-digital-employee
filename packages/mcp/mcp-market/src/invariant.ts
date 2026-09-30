/**
 * Package-owned invariant companion for the MCP marketplace.
 * @module @qq296629801/dsh-mcp-market/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-mcp-market'

/** Cordis companion plugin name. */
export const name = 'mcp-market-invariant'
/** Service required before reserving package ownership. */
export const inject = ['invariants']

/** No runtime invariant: manager reservations own active server-name uniqueness. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
