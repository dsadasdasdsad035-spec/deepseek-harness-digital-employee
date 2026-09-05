import type { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm'

let rounds = 0

class MockAdapter extends LlmAdapter {
  async * stream(): AsyncIterable<StreamChunk> {
    rounds += 1
    if (rounds === 1) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('call-wf'), name: 'workflow__noop', argumentsDelta: '{}' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('call-wf'), name: 'workflow__noop', arguments: '{}' } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else if (rounds === 2) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('call-sa'), name: 'subagent__reviewer', argumentsDelta: '{"prompt":"review"}' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('call-sa'), name: 'subagent__reviewer', arguments: '{"prompt":"review"}' } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'Done.' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Done.' } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

export const name = 'digital-employee-mock-llm'
export const inject = ['llm']
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['digital-employee-mock'], new MockAdapter())
  ctx.on('agent/request', async (_p, next) => ({ ...await next(), provider: 'digital-employee-mock', model: 'digital-employee-mock' }))
}
