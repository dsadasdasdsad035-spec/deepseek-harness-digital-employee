import type { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MarketplaceEmployeeMockAdapter extends LlmAdapter {
  private calls = 0

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const callIndex = this.calls++
    const mcpTool = options.tools?.find(tool => tool.name.startsWith('mcp__') && tool.name.endsWith('__lookup'))
    const call = [
      { name: 'skill', arguments: '{"name":"marketplace-test-skill"}' },
      { name: 'marketplace_test_echo', arguments: '{"text":"hello"}' },
      ...(mcpTool === undefined ? [] : [{ name: mcpTool.name, arguments: '{"query":"risk-42"}' }]),
    ][callIndex]
    if (callIndex === 2 && mcpTool === undefined) {
      throw new Error('marketplace employee request does not expose the selected MCP Tool')
    }
    if (call !== undefined) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'block-end',
        index: 0,
        block: {
          type: 'tool-call',
          id: CallId(`marketplace-employee-tool-${this.calls}`),
          name: call.name,
          arguments: call.arguments,
        },
      }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = [
      'MARKETPLACE_TEST_SKILL_LOADED',
      'MARKETPLACE_TEST_TOOL_ECHO:hello',
      'MARKETPLACE_TEST_MCP_LOOKUP:risk-42',
    ].join(' | ')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'marketplace-digital-employee-mock-llm'
export const inject = ['llm']

/** Register the deterministic marketplace capability model sequence. */
export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['marketplace-employee-mock'], new MarketplaceEmployeeMockAdapter())
  ctx.on('agent/request', async (_payload, next) => ({
    ...await next(),
    provider: 'marketplace-employee-mock',
    model: 'marketplace-employee-mock',
  }))
}
