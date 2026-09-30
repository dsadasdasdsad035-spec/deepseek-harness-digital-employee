/**
 * Package-owned invariant companion for `@qq296629801/dsh-digital-employee-sqlite`.
 * @module @qq296629801/dsh-digital-employee-sqlite/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-digital-employee-sqlite'

/** Cordis companion plugin name. */
export const name = 'digital-employee-sqlite-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: provider writes commit through SQLite transactions and
 * schema-ownership validation, observable only by database round-trip checks.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns installed registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
