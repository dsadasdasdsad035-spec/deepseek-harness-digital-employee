import type { Context } from '@deepseek-ai/cordis'
import { taskEventsInternals } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { join } from 'node:path'

/**
 * Keyless group-chat stubs, ordered before the gateway plugin:
 * the task lifecycle log is redirected into the fixture directory BEFORE the
 * gateway's first poll (so its boot cursor sees an empty log, never the real
 * home), and the employee-agent seam is stubbed with a scripted speaking
 * turn — `FORCE_FAIL` inside the situation text forces the deterministic
 * fallback path.
 */
export const name = 'company-console-group-stub'

/** Register the speaking-turn stub and redirect the lifecycle log. */
export function apply(ctx: Context): void {
  taskEventsInternals.path = join(process.cwd(), 'task-events.jsonl')
  ctx.reflect.provide('digitalEmployeeAgent', {
    createTask: async (request: {
      initialMessage?: { content: readonly { type: string; text?: string }[] }
    }) => {
      const situation = request.initialMessage?.content
        .map(block => (block.type === 'text' ? block.text ?? '' : ''))
        .join('') ?? ''
      if (situation.includes('FORCE_FAIL')) throw new Error('stub speaking turn failure')
      return {
        agent: {
          whenIdle: () => Promise.resolve(),
          session: {
            events: [{
              type: 'assistant/message',
              seq: 1,
              data: { message: { content: [{ type: 'text', text: 'stub-turn: 收到，我按自己的节奏跟进。' }] } },
            }],
          },
        },
        dispose: async () => {},
      }
    },
  })
}
