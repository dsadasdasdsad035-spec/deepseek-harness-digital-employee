/**
 * Package-owned invariant companion for `@qq296629801/dsh-client-ui-commands`.
 * @module @qq296629801/dsh-client-ui-commands/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-client-ui-commands'

/** Cordis companion plugin name. */
export const name = 'client-ui-commands-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a browser-side source over the wire command
 * directory — it emits no cordis events and owns no cross-plugin mutable
 * state; dispatch and cache behavior are asserted by this package's specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
