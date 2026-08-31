import type { Context } from '@deepseek-ai/cordis'
import {
  CallId,
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class ProjectManagerMockAdapter extends LlmAdapter {
  private rootCalls = 0
  private reviewerCalls = 0

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const isRiskReviewer = options.system?.includes('Risk Reviewer') === true
    const tool = isRiskReviewer
      ? ['mcp__project-data__project_snapshot'][this.reviewerCalls++]
      : [
        'project_board',
        'project_document',
        'mcp__project-data__project_snapshot',
      ][this.rootCalls++]
    if (tool !== undefined) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'block-end',
        index: 0,
        block: {
          type: 'tool-call',
          id: CallId(`project-manager-tool-${isRiskReviewer ? this.reviewerCalls : this.rootCalls}`),
          name: tool,
          arguments: '{}',
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
