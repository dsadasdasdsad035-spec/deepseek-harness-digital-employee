import type { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm'

/**
 * Round-aware deterministic model: the first request asks for the bound
 * `hook__echo` tool; the second request reports the tool result verbatim so
 * the acceptance transcript can match the echo output end to end.
 */
class DigitalEmployeeHookMockAdapter extends LlmAdapter {
  private rounds = 0

  async * stream(): AsyncIterable<StreamChunk> {
    this.rounds += 1
    if (this.rounds === 1) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('call-hook-echo'), name: 'hook__echo', argumentsDelta: '{"input":"assembled-round-trip"}' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('call-hook-echo'), name: 'hook__echo', arguments: '{"input":"assembled-round-trip"}' } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = 'Echo hook finished.'
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
  ctx.llm.registerAdapter(['digital-employee-mock'], new DigitalEmployeeHookMockAdapter())
  ctx.on('agent/request', async (_payload, next) => ({
    ...await next(),
    provider: 'digital-employee-mock',
    model: 'digital-employee-mock',
  }))
}
