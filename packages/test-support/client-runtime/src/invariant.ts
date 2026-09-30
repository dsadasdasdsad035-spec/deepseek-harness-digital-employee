/**
 * Package-owned invariant companion for `@qq296629801/dsh-client-test-runtime`.
 * @module @qq296629801/dsh-client-test-runtime/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-client-test-runtime'

/** Cordis companion plugin name. */
export const name = 'client-test-runtime-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this test-support package owns no production event
 * stream or mutable data — it assembles the runtime SlotRegistry and renderer
 * (whose packages own their invariants) around test doubles; its own behavior
 * is exercised by its package tests.
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
