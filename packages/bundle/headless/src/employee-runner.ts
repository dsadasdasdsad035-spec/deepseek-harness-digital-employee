/**
 * @deepseek-ai/dsh-headless/employee — one-shot digital-employee task driver.
 * When the command line selects an employee (`dsh --profile headless
 * --employee <id> "task"`), this runner composes the employee's root Agent
 * through `digitalEmployeeAgent`, arms the task text as a goal the round
 * driver keeps pushing, classifies the durable goal terminal state into the
 * process exit code, and maintains the cross-process attempt ledger: fresh
 * session per attempt, failure reasons promoted into employee memory, and
 * suspension plus an optional channel notification after consecutive
 * failures reach the configured ceiling.
 *
 * @module @deepseek-ai/dsh-headless/employee
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  applyAttemptFailure,
  attemptKeyOf,
  listTaskAttempts,
  resetAttempt,
  stampAttemptDisplay,
  withTaskAttempts,
} from '@deepseek-ai/dsh-digital-employee-file'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import type { DigitalEmployeeInstanceId } from '@deepseek-ai/dsh-digital-employee'
// Side-effect type import: declaration-merges ctx.digitalEmployeeAgent.
import type {} from '@deepseek-ai/dsh-digital-employee-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import { HEADLESS_STARTUP_SERVICE, type HeadlessStartupValues } from './startup.ts'

/** Stable Cordis plugin name. */
export const name = 'headless-employee-runner'

/** Services required before an employee task run can start. */
export const inject = ['digitalEmployeeAgent', 'digitalEmployees', 'goals', 'sessions', HEADLESS_STARTUP_SERVICE]

/** Process-facing output streams the tests substitute. */
export const internals: {
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
} = {
  stdout: process.stdout,
  stderr: process.stderr,
}

/** The classified terminal outcome of one employee task attempt. */
export type EmployeeTaskOutcome =
  | { readonly kind: 'complete' }
  | { readonly kind: 'blocked'; readonly code: string; readonly message: string }
  | { readonly kind: 'budget-limited'; readonly message: string }
  | { readonly kind: 'unfinished'; readonly phase: string }

/** Exit code: the goal completed. */
export const EXIT_COMPLETE = 0
/** Exit code: composition, usage, or suspended-before-start failure. */
export const EXIT_FAILURE = 1
/** Exit code: the goal ended blocked for a non-budget reason. */
export const EXIT_BLOCKED = 2
/** Exit code: the goal ended blocked by the round-limit budget. */
export const EXIT_BUDGET = 3

/**
 * Classify the durable goal state after the whole agent reached quiescence.
 * `blocked` with code `round-limit` is the round driver's budget exhaustion
 * and carries its own exit code; any other still-unfinished phase means the
 * run ended without a terminal goal and is reported as blocked.
 * @param goal - the final goal view, when one exists.
 * @returns the classified outcome.
 */
export function classifyOutcome(goal: GoalView | undefined): EmployeeTaskOutcome {
  if (goal === undefined) return { kind: 'unfinished', phase: 'none' }
  switch (goal.phase) {
    case 'complete':
      return { kind: 'complete' }
    case 'blocked':
      return goal.blockedReason?.code === 'round-limit'
        ? { kind: 'budget-limited', message: goal.blockedReason.message }
        : { kind: 'blocked', code: goal.blockedReason?.code ?? 'unknown', message: goal.blockedReason?.message ?? '' }
    default:
      return { kind: 'unfinished', phase: goal.phase }
  }
}

/**
 * Map one classified outcome onto the process exit code.
 * @param outcome - the classified terminal outcome of one attempt.
 * @returns the process exit code.
 */
export function exitCodeOf(outcome: EmployeeTaskOutcome): number {
  switch (outcome.kind) {
    case 'complete': return EXIT_COMPLETE
    case 'budget-limited': return EXIT_BUDGET
    case 'blocked':
    case 'unfinished': return EXIT_BLOCKED
  }
}

/** Plugin config: autonomy bounds and the alert channel for suspensions. */
export interface Config {
  /** Round ceiling armed onto the goal (default 32). */
  maxGoalRounds?: number
  /** Consecutive failed attempts before suspension (default 3). */
  maxFailedAttempts?: number
  /** Notification channel notified on suspension; omitted stays silent. */
  notifyChannel?: string
  /** Whole-run quiescence ceiling in milliseconds (default 1_800_000). */
  settleTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  maxGoalRounds: z.number().step(1).min(1).default(32),
  maxFailedAttempts: z.number().step(1).min(1).default(3),
  notifyChannel: z.string(),
  settleTimeoutMs: z.number().min(1).default(1_800_000),
})

/** Render the suspend notification message for one exhausted task. */
function suspendMessage(employeeId: string, key: string, reason: string): { title: string; body: string } {
  return {
    title: 'Digital employee task suspended',
    body: `Employee "${employeeId}" task "${key}" failed consecutively and is now suspended; automatic retries are refused until a human resumes it. Last failure: ${reason}`,
  }
}

/** Fold the last non-empty assistant text of one session. */
function lastAssistantText(events: readonly SessionEvent[]): string {
  let text = ''
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const joined = event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    if (joined !== '') text = joined
  }
  return text
}

/**
 * Mount the employee task driver. The plugin is inert unless the command line
 * selected an employee; the ordinary runner stays owner of plain tasks.
 * @param ctx - plugin context carrying the employee, goal, session, startup,
 *   and optional notification and default-model services plus the launcher's
 *   exit request.
 * @param config - validated autonomy bounds.
 */
export function apply(ctx: Context, config: Config): void {
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('headless-employee-runner: the launcher must provide ctx.appExit before the tree mounts')
  }
  const startup = ctx.get(HEADLESS_STARTUP_SERVICE) as HeadlessStartupValues | undefined
  if (startup?.employee === undefined) return
  const io: EmployeeIo = { stdout: internals.stdout, stderr: internals.stderr, exit }
  void run(ctx, config, startup.employee, startup.task, startup.taskKey, io)
    .catch((error: unknown) => {
      io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`)
      io.exit(EXIT_FAILURE)
    })
}

/** Process-facing effects, substituted in tests. */
export interface EmployeeIo {
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
  exit(code: number): void
}

/**
 * Run one employee task attempt end to end and request the mapped exit.
 * @param ctx - context carrying employee, goal, and session services.
 * @param config - validated autonomy bounds.
 * @param employeeId - the selected employee.
 * @param task - the task text.
 * @param taskKeyExplicit - the caller-provided ledger key, when present.
 * @param io - process-facing effects.
 */
async function run(
  ctx: Context,
  config: Config,
  employeeId: string,
  task: string,
  taskKeyExplicit: string | undefined,
  io: EmployeeIo,
): Promise<void> {
  // Loader siblings (the seed that registers the employee) mount concurrently;
  // await the complete application before resolving the employee.
  await ctx.get('loader')?.await()
  const employee = employeeId as DigitalEmployeeInstanceId
  const key = attemptKeyOf(employeeId, task, taskKeyExplicit)
  const prior = (await listTaskAttempts())[key]
  if (prior?.suspended === true) {
    io.stderr.write(`dsh: task "${key}" is suspended after ${prior.consecutiveFailures} consecutive failures (last: ${prior.lastReason ?? 'unknown'}); resume it before retrying\n`)
    io.exit(EXIT_FAILURE)
    return
  }
  const displayName = task.length > 80 ? `${task.slice(0, 77)}...` : task

  const sessionId = SessionId(`session-${randomUUID()}`)
  const defaultModel = ctx.get('agentDefaultModel')
  const selection = defaultModel?.currentSelection()
  const handle = await ctx.digitalEmployeeAgent.createTask({
    employeeId: employee,
    sessionId,
    meta: { cwd: process.cwd() },
    ...selection !== undefined
      ? { agentOptions: { provider: selection.provider, model: selection.model }, modelSelection: selection }
      : {},
    memory: { text: task, scopes: ['task', 'session', 'long-term'], limit: 8 },
  })
  // Arm the goal BEFORE the first turn starts, so the round driver's idle
  // trigger sees an armed goal from the beginning and continuation rounds
  // flow without a second nudge; then the task text opens the first turn.
  const agent = handle.agent
  ctx.goals.create(agent, { objective: task, maxGoalRounds: config.maxGoalRounds as number })
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: task }],
    source: { kind: 'user' },
  }))

  const idled = await raceSettle(agent.whenIdle(), config.settleTimeoutMs as number)
  // The round driver's round-limit block appends after the last turn's idle
  // transition; when the run reached quiescence normally, wait for the goal
  // to leave 'active' (bounded ordering grace) so a budget exhaustion is not
  // misread as an unfinished run. A settle timeout classifies as-is.
  if (idled) await waitForGoalTerminality(ctx, agent)
  await ctx.sessions.flush(agent.session)
  const goal = ctx.goals.get(agent)
  const outcome = classifyOutcome(goal)
  io.stdout.write(lastAssistantText(agent.session.events) + '\n')

  const reasonOf = (): string => {
    switch (outcome.kind) {
      case 'complete': return 'complete'
      case 'blocked': return `blocked (${outcome.code}): ${outcome.message}`
      case 'budget-limited': return `budget-limited: ${outcome.message}`
      case 'unfinished': return `run ended with goal phase "${outcome.phase}"`
    }
  }

  if (outcome.kind === 'complete') {
    await withTaskAttempts((ledger) => { resetAttempt(ledger, key) })
    io.exit(EXIT_COMPLETE)
    return
  }

  const reason = reasonOf()
  const suspended = await withTaskAttempts((ledger) => {
    const hit = applyAttemptFailure(ledger, key, reason, config.maxFailedAttempts as number)
    stampAttemptDisplay(ledger, key, displayName, employeeId)
    return hit
  })
  await promoteFailureMemory(ctx, employee, sessionId, reason)
  if (suspended) {
    io.stderr.write(`dsh: task "${key}" suspended after reaching the failure ceiling: ${reason}\n`)
    await notifySuspended(ctx, config, employeeId, key, reason)
  }
  io.exit(exitCodeOf(outcome))
}

/**
 * Wait until the armed goal leaves the active phase, bounded by a fixed
 * ordering grace: every writer of a terminal phase (the round driver's
 * round-limit block, the goal tools) settles within milliseconds of agent
 * quiescence, so the grace only absorbs event-loop ordering, never work.
 * @param ctx - context carrying the goal service.
 * @param agent - the run's agent.
 */
async function waitForGoalTerminality(ctx: Context, agent: Agent): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const goal = ctx.goals.get(agent)
    if (goal === undefined || goal.phase !== 'active') return
    await new Promise((resolve) => { setTimeout(resolve, 25) })
  }
}

/** Await the agent's quiescence with a bounded ceiling; a timeout settles with whatever state exists. */
/**
 * Await the agent's quiescence with a bounded ceiling.
 * @param idle - the agent's quiescence promise.
 * @param timeoutMs - the ceiling; on expiry the run settles with whatever
 *   state exists.
 * @returns whether quiescence arrived before the ceiling.
 */
function raceSettle(idle: Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { resolve(false) }, timeoutMs)
    void idle.then(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

/** Best-effort promote of one failure reason into employee memory. */
async function promoteFailureMemory(
  ctx: Context,
  employee: DigitalEmployeeInstanceId,
  sessionId: SessionId,
  reason: string,
): Promise<void> {
  try {
    const decision = await ctx.digitalEmployees.promoteMemory({
      employeeId: employee,
      content: `Task attempt failed: ${reason}`,
      tags: ['task-attempt', 'failed'],
      sensitive: false,
      provenance: { sessionId, source: 'headless-employee-runner', recordedAt: new Date().toISOString() },
    })
    if (decision.kind === 'rejected') {
      ctx.logger.warn(`headless-employee-runner: memory review rejected the failure record: ${decision.reason}`)
    }
  } catch (error: unknown) {
    ctx.logger.warn(`headless-employee-runner: failed to record the attempt failure in employee memory: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The notification seam surface this driver consumes; structural so this package stays untyped-import free. */
interface NotificationsLike {
  send(request: {
    readonly channel: string
    readonly title: string
    readonly body: string
    readonly context?: Readonly<Record<string, string>>
  }): Promise<{ readonly delivered: true } | { readonly delivered: false; readonly reason: string }>
}

/** Best-effort suspension notification through the composed channel. */
async function notifySuspended(ctx: Context, config: Config, employeeId: string, key: string, reason: string): Promise<void> {
  const notifications = ctx.get('notifications') as NotificationsLike | undefined
  const channel = config.notifyChannel
  if (notifications === undefined || channel === undefined) return
  const message = suspendMessage(employeeId, key, reason)
  const outcome = await notifications.send({
    channel,
    title: message.title,
    body: message.body,
    context: { employee: employeeId, taskKey: key },
  })
  if (!outcome.delivered) {
    ctx.logger.warn(`headless-employee-runner: suspension notification was not delivered: ${outcome.reason}`)
  }
}
