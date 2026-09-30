/**
 * Package-owned invariant companion for `@qq296629801/dsh-tool-subagent-control`.
 * @module @qq296629801/dsh-tool-subagent-control/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-tool-subagent-control'

/** Cordis companion plugin name. */
export const name = 'tool-subagent-control-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this model-facing adapter has no independent lifecycle stream; delivery
 * and activation relations are owned by the subagent service it calls.
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
