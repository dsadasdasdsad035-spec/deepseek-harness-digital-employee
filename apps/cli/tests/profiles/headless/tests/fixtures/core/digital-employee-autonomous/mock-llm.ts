import type { Context } from '@deepseek-ai/cordis'
import { ToolCallId, LlmAdapter, type GenerateOptions, type Message, type StreamChunk } from '@deepseek-ai/dsh-llm'

interface AdapterState {
  step: number
}

class AutonomousMockAdapter extends LlmAdapter {
  constructor(private readonly state: AdapterState) {
    super()
  }

  /** Render one plain-text assistant turn. */
  private *text(text: string, finish: 'stop' | 'tool-calls'): Generator<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: finish === 'stop' ? { kind: 'stop' } : { kind: 'tool-calls' } }
  }

  /** Render one assistant tool-call turn. */
  private *toolCall(id: string, name: string, args: string): Generator<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id: ToolCallId(id), name, argumentsDelta: args }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(id), name, arguments: args } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }

  /**
   * Extract the current goal id and revision from the latest get_goal tool
   * result. The result text is goal-tool JSON, so the block serialization is
   * un-escaped before the exact-shape match.
   */
  private goalRef(messages: readonly Message[]): { id: string; revision: number } | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message === undefined) continue
      for (const block of message.content) {
        if (block.type !== 'tool-result') continue
        const text = JSON.stringify(block).replaceAll('\\', '')
        const goal = /"id":"(goal-[0-9a-f-]+)"/.exec(text)
        const revision = /"revision":(\d+)/.exec(text)
        if (goal !== null && revision !== null) {
          return { id: goal[1] as string, revision: Number(revision[1]) }
        }
      }
    }
    return undefined
  }

  async * stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    const taskText = request.messages.at(0)?.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('') ?? ''
    if (taskText.includes('endless queue')) {
      yield* this.text('Still watching the queue.', 'stop')
      return
    }
    this.state.step += 1
    if (this.state.step === 1) {
      yield* this.toolCall('call-get-goal', 'get_goal', '{}')
      return
    }
    if (this.state.step === 2) {
      const ref = this.goalRef(request.messages)
      if (ref === undefined) {
        yield* this.text('No goal was visible; stopping.', 'stop')
        return
      }
      const args = JSON.stringify({ goal_id: ref.id, revision: ref.revision, action: 'complete' })
      yield* this.toolCall('call-update-goal', 'update_goal', args)
      return
    }
    yield* this.text('Milestone summary complete.', 'stop')
  }
}

export const name = 'digital-employee-autonomous-mock-llm'
export const inject = ['llm']

/** Register the deterministic keyless model route used by the assembled fixture. */
export function apply(ctx: Context): void {
  const state: AdapterState = { step: 0 }
  ctx.llm.registerAdapter(['employee-autonomous-mock'], new AutonomousMockAdapter(state))
  ctx.on('agent/request', async (_payload, next) => ({
    ...await next(),
    provider: 'employee-autonomous-mock',
    model: 'employee-autonomous-mock',
  }))
}
