/** Invariant companion for the browser-only digital employee workspace. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-digital-employees'

/** Cordis companion plugin name. */
export const name = 'client-ui-digital-employees-invariant'
/** Required invariant registry. */
export const inject = ['invariants']

// No runtime invariant: this browser-only package owns no mutable runtime relationship.
const install: InvariantInstaller = () => {}

/** Register the package-owned empty companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
