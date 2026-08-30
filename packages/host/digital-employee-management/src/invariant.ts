/** Digital employee management Host invariant companion. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-digital-employee-management'

/** Cordis companion plugin name. */
export const name = 'host-digital-employee-management-invariant'
/** Service required before reserving package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the gateway delegates every operation to an owning service. */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
