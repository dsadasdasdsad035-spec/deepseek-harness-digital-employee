import type { Context } from '@deepseek-ai/cordis'

/**
 * Keyless live-agent stub: the company floor projection only reads the
 * registry for in-process running agents, and this fixture has none — every
 * lookup resolves to `undefined`, exactly like an idle deployment.
 */
export const name = 'company-console-agents-stub'

/** Register the stub registry the management gateway injects. */
export function apply(ctx: Context): void {
  ctx.reflect.provide('agents', { get: () => undefined })
}
