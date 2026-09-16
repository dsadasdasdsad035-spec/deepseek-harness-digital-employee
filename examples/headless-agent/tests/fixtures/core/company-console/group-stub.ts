import type { Context } from '@deepseek-ai/cordis'
import { taskEventsInternals } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { worldStateInternals } from '@deepseek-ai/dsh-company-file/world-state'
import { join } from 'node:path'

/**
 * Keyless member-session stubs, ordered before the gateway plugin: the task
 * lifecycle log is redirected into the fixture directory BEFORE the gateway's
 * first poll (so its boot cursor sees an empty log, never the real home), and
 * the employee-agent seam is stubbed with scripted continuable member Agents —
 * `FORCE_FAIL` inside the delivery text forces the deterministic fallback
 * path.
 */
export const name = 'company-console-group-stub'

interface StubEvent {
  seq: number
  type: string
  data: unknown
}

/** Register the member-Agent stub and redirect the lifecycle log. */
export function apply(ctx: Context): void {
  taskEventsInternals.path = join(process.cwd(), 'task-events.jsonl')
  worldStateInternals.path = join(process.cwd(), 'world-state.json')
  ctx.reflect.provide('digitalEmployeeAgent', {
    createTask: async (request: { sessionId: string }) => {
      const events: StubEvent[] = []
      const agent = {
        id: request.sessionId,
        status: 'idle' as const,
        session: { id: request.sessionId, events },
        followup: (message: { content: readonly { type: string; text?: string }[] }) => {
          const text = message.content
            .map(block => (block.type === 'text' ? block.text ?? '' : ''))
            .join('')
          events.push({ seq: events.length, type: 'user/message', data: message })
          events.push({ seq: events.length, type: 'turn/start', data: { turn: events.length } })
          events.push({ seq: events.length, type: 'pending-situation', data: { text } })
        },
        whenIdle: async () => {
          const started = events.filter(event => event.type === 'turn/start').length
          const ended = events.filter(event => event.type === 'turn/end').length
          if (started === ended) return
          const situation = events.findLast(event => event.type === 'pending-situation')
          const text = (situation?.data as { text: string } | undefined)?.text ?? ''
          if (text.includes('FORCE_FAIL')) {
            events.push({ seq: events.length, type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'stub speaking turn failure', code: 'UNKNOWN' } } } })
            return
          }
          events.push({
            seq: events.length,
            type: 'assistant/message',
            data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'stub-turn: 收到，我按自己的节奏跟进。' }] } },
          })
          events.push({ seq: events.length, type: 'turn/end', data: { reason: { kind: 'completed' } } })
        },
        cancel: () => {},
      }
      return { agent, dispose: async () => {} }
    },
    resumeTask: async (request: { resumeSessionId: string }) => {
      throw new Error(`stub resumeTask not expected: ${request.resumeSessionId}`)
    },
  })
}
