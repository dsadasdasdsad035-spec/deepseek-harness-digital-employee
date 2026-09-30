/** Package-owned agent lifecycle invariants. @module @qq296629801/dsh-agent/invariant */

import type { Context } from '@qq296629801/cordis'
import type { InvariantInstaller } from '@qq296629801/dsh-invariants'
import type { Agent, AgentStatus } from '@qq296629801/dsh-agent'

const PACKAGE_NAME = '@qq296629801/dsh-agent'

/** Cordis companion plugin name. */
export const name = 'agent-invariant'
/** Services required before the companion can register. */
export const inject = ['invariants']

/** Install the agent contribution into its child registration fiber. */
const install: InvariantInstaller = (ctx, fail) => {
  const lastStatus = new WeakMap<Agent, AgentStatus>()
  ctx.on('agent/status', ({ agent, status }) => {
    const previous = lastStatus.get(agent)
    if (previous === status) {
      fail(`agent/status repeated ${status} (no-op transition)`)
    }
    lastStatus.set(agent, status)
  }, { global: true })
}

/**
 * Register the agent invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
