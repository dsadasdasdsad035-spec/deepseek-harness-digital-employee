/**
 * Package-owned invariant companion for the project-manager fixture.
 * @module @deepseek-ai/dsh-project-manager-test-digital-employee/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-project-manager-test-digital-employee'

export const name = 'project-manager-test-digital-employee-invariant'
export const inject = ['invariants']

const install: InvariantInstaller = () => {}

/** Reserve package ownership; template resource checks run in the package test. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
