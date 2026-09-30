/**
 * Package-owned invariant companion for `@qq296629801/dsh-tmux-context`.
 * @module @qq296629801/dsh-tmux-context/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-tmux-context'

/** Cordis companion plugin name. */
export const name = 'tmux-context-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: a reading is a per-turn snapshot of external tmux state, so the session
 * holds no cross-event relation to check; scheduling and format are owned by pipeline tests.
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
