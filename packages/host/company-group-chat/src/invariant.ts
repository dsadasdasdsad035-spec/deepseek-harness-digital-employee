/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-host-company-group-chat`.
 * @module @deepseek-ai/dsh-host-company-group-chat/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-host-company-group-chat'

/** Cordis companion plugin name. */
export const name = 'company-group-chat-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the gateway owns no durable state of its own — group
 * sessions live in the session store, rosters derive from live bindings, and
 * the task lifecycle cursor re-derives from the group's own event log.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns installed registration disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
