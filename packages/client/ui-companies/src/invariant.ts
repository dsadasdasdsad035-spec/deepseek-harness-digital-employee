/** Invariant companion for the browser-only company campus console. */
import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'

const PACKAGE_NAME = '@qq296629801/dsh-client-ui-companies'

/** Cordis companion plugin name. */
export const name = 'client-ui-companies-invariant'
/** Required invariant registry. */
export const inject = ['invariants']

// No runtime invariant: this browser-only package owns no mutable runtime relationship.
const install: InvariantInstaller = () => {}

/** Register the package-owned empty companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
