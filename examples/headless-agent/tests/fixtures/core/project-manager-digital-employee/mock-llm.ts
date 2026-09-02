import type { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm'

class ProjectManagerMockAdapter extends LlmAdapter {
  private calls = 0

  async * stream(): AsyncIterable<StreamChunk> {
    const tool = [
      'delegate_to_expert',
      'project_board',
      'project_document',
      'mcp__project-data__project_snapshot',
    ][this.calls++]
    if (tool !== undefined) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'block-end',
        index: 0,
        block: {
          type: 'tool-call',
          id: CallId(`project-manager-tool-${this.calls}`),
          name: tool,
          arguments: tool === 'delegate_to_expert'
            ? JSON.stringify({
              expert_id: 'risk-reviewer',
              prompt: 'Review the Atlas delivery risk and rollback readiness.',
            })
            : '{}',
        },
      }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = 'Atlas: Pilot is at risk; Chen owns acceptance criteria; use the staged rollback plan.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'project-manager-mock-llm'
export const inject = ['llm']

/** Register the deterministic tool-calling model route for this fixture. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['project-manager-mock'], new ProjectManagerMockAdapter())
  ctx.on('agent/request', async (_payload, next) => ({
    ...await next(),
    provider: 'project-manager-mock',
    model: 'project-manager-mock',
  }))
}
