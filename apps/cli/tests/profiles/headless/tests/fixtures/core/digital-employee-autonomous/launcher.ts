import type { Context } from '@deepseek-ai/cordis'
import { HEADLESS_STARTUP_SERVICE } from '@deepseek-ai/dsh-headless/startup'

/** The deterministic employee id the prepared store file carries. */
export const EMPLOYEE_ID = 'employee-autonomous-ada'

/** The stable attempt-ledger key every scenario uses. */
export const TASK_KEY = 'autonomous-snapshot-key'

/** Employee task text per scenario; keyed to the mock model's behavior. */
const TASKS: Record<string, string> = {
  complete: 'Finish the milestone summary.',
  loop: 'Watch the endless queue.',
  suspend: 'Watch the endless queue.',
}

/**
 * Synchronously provide the launcher services the employee runner waits on
 * through its inject list: the recorded exit hook and the startup values
 * (task from the scenario env, the prepared employee id, the stable task
 * key). The employee instance itself is seeded on disk by the test's
 * prepare hook before the process starts.
 * @param ctx - plugin context receiving the provides.
 */
export function apply(ctx: Context): void {
  const scenario = process.env.DSH_EMPLOYEE_AUTONOMOUS_SCENARIO ?? 'complete'
  const exits: number[] = []
  ;(globalThis as unknown as { __employeeAutonomousExits: number[] }).__employeeAutonomousExits = exits
  ctx.provide('appExit', (code: number) => { exits.push(code) })
  ctx.provide(HEADLESS_STARTUP_SERVICE, {
    task: TASKS[scenario] ?? TASKS.complete as string,
    employee: EMPLOYEE_ID,
    taskKey: TASK_KEY,
  })
}
