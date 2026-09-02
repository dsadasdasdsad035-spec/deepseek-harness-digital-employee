/**
 * Package-owned invariant companion for the project-manager fixture.
 * @module @deepseek-ai/dsh-project-manager-test-digital-employee/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-project-manager-test-digital-employee'

/** Cordis companion plugin name. */
export const name = 'project-manager-test-digital-employee-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the template registry owns immutable template
 * registration, while fixture tools, Skills, and MCP data are package constants.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
