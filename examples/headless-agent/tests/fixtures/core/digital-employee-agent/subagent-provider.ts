import type { Context } from '@deepseek-ai/cordis'
import type { SubagentProvider } from '@deepseek-ai/dsh-subagent'
import { SessionId } from '@deepseek-ai/dsh-session'

const provider: SubagentProvider = {
  name: 'digital-employee-fixture',
  capabilities: {
    outputSchema: false,
    depthLimit: true,
    toolFilter: true,
    persona: true,
  },
  inheritsParentContext: false,
  async start(request) {
    return {
      id: SessionId(`expert:${request.parent.id}`),
      localAgent: undefined,
      result: Promise.resolve({
        output: [{ type: 'text', text: 'Review complete.' }],
        stopReason: 'completed',
      }),
      async dispose() {},
    }
  },
}

export const name = 'digital-employee-fixture-subagent-provider'
export const inject = ['subagents']

/** Register the deterministic expert transport used by the keyless snapshot. */
export function apply(ctx: Context): void {
  ctx.subagents.registerProvider(provider)
}
