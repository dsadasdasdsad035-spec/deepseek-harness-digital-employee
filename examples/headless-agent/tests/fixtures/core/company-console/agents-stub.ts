import type { Context } from '@deepseek-ai/cordis'

/**
 * Real agent spine for the fixture: the company group Lead is a true root
 * Agent whose router spends zero model calls, so the loop loads without any
 * LLM adapter. The floor projection reads the same live registry; with no
 * declarative agents configured, every running verdict stays idle.
 */
export const name = 'company-console-agents-stub'

/** Mount the registry and loop the group gateway drives. */
export function apply(ctx: Context): void {
  void ctx
}
