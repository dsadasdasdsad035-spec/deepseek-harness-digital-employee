import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm'

class DigitalEmployeeMockAdapter extends LlmAdapter {
  async * stream(): AsyncIterable<StreamChunk> {
    const text = 'Ada completed the keyless task.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'digital-employee-mock-llm'
export const inject = ['llm']

/** Register the deterministic keyless model route used by the assembled fixture. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['digital-employee-mock'], new DigitalEmployeeMockAdapter())
  ctx.on('agent/request', async (_payload, next) => ({
    ...await next(),
    provider: 'digital-employee-mock',
    model: 'digital-employee-mock',
  }))
}
