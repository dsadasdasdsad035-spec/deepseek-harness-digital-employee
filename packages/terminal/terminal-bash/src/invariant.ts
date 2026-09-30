/**
 * Package-owned invariant companion for `@qq296629801/dsh-terminal-bash`.
 * @module @qq296629801/dsh-terminal-bash/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-terminal-bash'

/** Cordis companion plugin name. */
export const name = 'terminal-bash-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: readiness, terminal buffers, and process-tree state are private per-session
 * implementation state, and the backend publishes no independent lifecycle stream or snapshot.
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
