import type { Context } from '@deepseek-ai/cordis'
import type { NotificationDelivery, NotificationMessage } from '@deepseek-ai/dsh-notification'

/** Captured sends through globalThis so the driver reads the same array. */
const globals = globalThis as unknown as { __employeeAutonomousSent?: Array<{ channel: string; title: string; body: string }> }
const captured: Array<{ channel: string; title: string; body: string }> = globals.__employeeAutonomousSent ?? []
globals.__employeeAutonomousSent = captured

export const name = 'digital-employee-autonomous-channel'
export const inject = ['notifications']

/** Register the in-memory delivery channel the suspension alert targets. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.notifications.register({
    id: 'fixture-channel',
    send: async (message: NotificationMessage): Promise<NotificationDelivery> => {
      captured.push({ channel: 'fixture-channel', title: message.title, body: message.body })
      return { delivered: true }
    },
  }), 'employee-autonomous: fixture channel')
}

export { captured }
