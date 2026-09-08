/**
 * Employee task driver tests: pure terminal classification and ledger
 * transitions, plus mounted end-to-end runs over fake employee/goal/session
 * services covering the exit-code contract, attempt memory, suspension, and
 * notification paths.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { GoalView } from '@deepseek-ai/dsh-goal'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyAttemptFailure, attemptKeyOf, internals as ledger, listTaskAttempts, resetAttempt, withTaskAttempts } from '@deepseek-ai/dsh-digital-employee-file'
import * as EmployeeRunner from '../src/employee-runner.ts'
import { HEADLESS_STARTUP_SERVICE } from '../src/startup.ts'

const { apply, classifyOutcome, exitCodeOf, internals, name } = EmployeeRunner

/** One recorded suspension notification. */
type SentNotice = { channel: string; title: string; body: string; context?: Record<string, string> }

/** Everything one mounted run observed. */
interface Observed {
  exits: number[]
  out: string
  err: string
  followups: string[]
  createdTasks: Array<{ employeeId: string; memoryText: string }>
  goalCreates: Array<{ objective: string; maxGoalRounds: number }>
  promoted: string[]
  sent: SentNotice[]
  flushes: number
}

/** Program the fake goal terminal the run classifies. */
type GoalPhaseProgram =
  | { phase: 'complete' }
  | { phase: 'blocked'; code: string; message: string }
  | { phase: 'active' }

function goalView(program: GoalPhaseProgram): GoalView {
  return {
    id: 'goal-1',
    revision: 1,
    objective: 'task',
    phase: program.phase,
    maxGoalRounds: 4,
    roundsStarted: 1,
    createdAt: 0,
    updatedAt: 0,
    activation: 'disarmed',
    ...program.phase === 'blocked' ? { blockedReason: { code: program.code, message: program.message } } : {},
  } as GoalView
}

/**
 * Mount the runner over complete fakes and run one task attempt.
 * @param options - the programmed goal phase, config overrides, startup
 *   values, and the optional notification channel behavior.
 * @returns what the run observed.
 */
async function mountedRun(options: {
  goal: GoalPhaseProgram
  config?: Partial<EmployeeRunner.Config>
  startup?: { task?: string; employee?: string | null; taskKey?: string }
  notifyOutcome?: 'delivered' | 'failed'
  promoteBehavior?: 'accepted' | 'rejected' | 'throws'
  neverIdle?: boolean
}): Promise<Observed> {
  const followups: string[] = []
  const observed: Observed = {
    exits: [],
    out: '',
    err: '',
    followups,
    createdTasks: [],
    goalCreates: [],
    promoted: [],
    sent: [],
    flushes: 0,
  }
  capturedOut = ''
  capturedErr = ''
  const view = goalView(options.goal)
  const events: SessionEvent[] = [
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'final answer' }] } } },
  ] as unknown as SessionEvent[]
  const whenIdle = options.neverIdle === true
    ? new Promise<void>(() => {})
    : Promise.resolve()
  const agent = {
    id: 'session-x',
    status: 'idle',
    whenIdle: () => whenIdle,
    followup: (message: { content: Array<{ type: string; text: string }> }) => {
      followups.push(message.content.filter(block => block.type === 'text').map(block => block.text).join(''))
    },
    session: { id: 'session-x', events, seq: events.length },
  } as unknown as Agent

  const ctx = new Context()
  ctx.provide('appExit', (code: number) => { observed.exits.push(code) })
  // `employee: null` selects the inert path explicitly; an omitted employee
  // still runs as the default employee.
  ctx.provide(HEADLESS_STARTUP_SERVICE, {
    task: options.startup?.task ?? 'do the thing',
    ...(options.startup?.employee === null ? {} : { employee: options.startup?.employee ?? 'emp-1' }),
    ...options.startup?.taskKey !== undefined ? { taskKey: options.startup.taskKey } : {},
  })
  ctx.provide('digitalEmployeeAgent', {
    async createTask(request: {
      employeeId: string
      memory?: { text: string }
    }) {
      observed.createdTasks.push({
        employeeId: request.employeeId,
        memoryText: request.memory?.text ?? '',
      })
      return { agent, dispose: async () => {} }
    },
  })
  ctx.provide('digitalEmployees', {
    async promoteMemory(candidate: { content: string }) {
      if (options.promoteBehavior === 'throws') throw new Error('store down')
      observed.promoted.push(candidate.content)
      return options.promoteBehavior === 'rejected'
        ? { kind: 'rejected' as const, reason: 'not relevant' }
        : { kind: 'accepted' as const, memory: {} }
    },
  })
  ctx.provide('goals', {
    create(_agent: Agent, request: { objective: string; maxGoalRounds: number }) {
      observed.goalCreates.push({ objective: request.objective, maxGoalRounds: request.maxGoalRounds })
      return view
    },
    get: () => view,
  })
  ctx.provide('sessions', { flush: async () => { observed.flushes += 1 } })
  ctx.provide('notifications', {
    async send(request: SentNotice) {
      observed.sent.push(request)
      return options.notifyOutcome === 'failed'
        ? { delivered: false as const, reason: 'channel offline' }
        : { delivered: true as const }
    },
  })
  ctx.plugin({ name, apply }, {
    maxGoalRounds: 4,
    maxFailedAttempts: 3,
    settleTimeoutMs: 200,
    ...options.config,
  })
  // The run chain includes real file IO; poll until the exit landed.
  const start = Date.now()
  while (observed.exits.length === 0 && Date.now() - start < 2000) {
    await new Promise((resolve) => { setTimeout(resolve, 5) })
  }
  observed.out = capturedOut
  observed.err = capturedErr
  return observed
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-employee-ledger-'))
  ledger.path = join(dir, 'task-attempts.json')
  internals.stdout = { write: (chunk) => { capturedOut += chunk; return true } }
  internals.stderr = { write: (chunk) => { capturedErr += chunk; return true } }
  capturedOut = ''
  capturedErr = ''
})

afterEach(() => {
  ledger.path = join(tmpdir(), `stale-${Date.now()}.json`)
  internals.stdout = process.stdout
  internals.stderr = process.stderr
})

let capturedOut = ''
let capturedErr = ''

describe('classifyOutcome and exit codes', () => {
  it('maps complete, round-limit budget, other blocks, and unfinished phases', () => {
    expect(classifyOutcome(goalView({ phase: 'complete' }))).toEqual({ kind: 'complete' })
    expect(classifyOutcome(undefined)).toEqual({ kind: 'unfinished', phase: 'none' })
    expect(classifyOutcome(goalView({ phase: 'active' }))).toEqual({ kind: 'unfinished', phase: 'active' })
    const budget = classifyOutcome(goalView({ phase: 'blocked', code: 'round-limit', message: 'limit hit' }))
    expect(budget).toEqual({ kind: 'budget-limited', message: 'limit hit' })
    const blocked = classifyOutcome(goalView({ phase: 'blocked', code: 'missing-tool', message: 'no tool' }))
    expect(blocked).toEqual({ kind: 'blocked', code: 'missing-tool', message: 'no tool' })
    expect(exitCodeOf({ kind: 'complete' })).toBe(0)
    expect(exitCodeOf({ kind: 'budget-limited', message: '' })).toBe(3)
    expect(exitCodeOf({ kind: 'blocked', code: '', message: '' })).toBe(2)
    expect(exitCodeOf({ kind: 'unfinished', phase: 'active' })).toBe(2)
  })
})

describe('ledger keys and transitions', () => {
  it('prefers the explicit key and hashes employee plus task otherwise', () => {
    expect(attemptKeyOf('emp', 'task', 'roster-key')).toBe('roster-key')
    const hashed = attemptKeyOf('emp', 'task', undefined)
    expect(hashed).toMatch(/^[0-9a-f]{24}$/)
    expect(attemptKeyOf('emp', 'other', undefined)).not.toBe(hashed)
    expect(attemptKeyOf('emp2', 'task', undefined)).not.toBe(hashed)
    expect(attemptKeyOf('emp', 'task', '')).not.toBe('roster-key')
  })

  it('resets on success and suspends exactly at the ceiling', () => {
    const key = 'k'
    const draft: Parameters<typeof applyAttemptFailure>[0] = {}
    expect(applyAttemptFailure(draft, key, 'r1', 3)).toBe(false)
    expect(draft[key]).toEqual({ consecutiveFailures: 1, lastReason: 'r1' })
    expect(applyAttemptFailure(draft, key, 'r2', 3)).toBe(false)
    expect(applyAttemptFailure(draft, key, 'r3', 3)).toBe(true)
    expect(draft[key]).toEqual({ consecutiveFailures: 3, suspended: true, lastReason: 'r3' })
    resetAttempt(draft, key)
    expect(draft[key]).toBeUndefined()
    resetAttempt(draft, 'missing')
  })
})

describe('ledger file IO', () => {
  it('round-trips through the locked transaction and reads missing files as empty', async () => {
    expect(await listTaskAttempts()).toEqual({})
    await withTaskAttempts((draft) => { draft.k = { consecutiveFailures: 1, lastReason: 'x' } })
    expect(await listTaskAttempts()).toEqual({ k: { consecutiveFailures: 1, lastReason: 'x' } })
    // The transaction re-reads under the lock: mutations compose across calls.
    await withTaskAttempts((draft) => { draft.k!.consecutiveFailures += 1 })
    expect(await listTaskAttempts().then(l => l.k?.consecutiveFailures)).toBe(2)
    expect(await listTaskAttempts().then(l => l.k?.displayName)).toBeUndefined()
  })
})

describe('mounted employee runs', () => {
  it('arms the goal, prints the final text, exits 0, and clears the ledger on complete', async () => {
    await withTaskAttempts((draft) => { draft.k = { consecutiveFailures: 2, lastReason: 'earlier' } })
    const observed = await mountedRun({ goal: { phase: 'complete' }, startup: { taskKey: 'k' } })
    expect(observed.exits).toEqual([0])
    expect(observed.goalCreates).toEqual([{ objective: 'do the thing', maxGoalRounds: 4 }])
    expect(observed.createdTasks[0]?.employeeId).toBe('emp-1')
    expect(observed.createdTasks[0]?.memoryText).toBe('do the thing')
    expect(observed.followups).toEqual(['do the thing'])
    expect(observed.out).toContain('final answer')
    expect(observed.flushes).toBe(1)
    expect(await listTaskAttempts()).toEqual({})
    expect(observed.promoted).toEqual([])
    expect(observed.sent).toEqual([])
  })

  it('records the failure, promotes the reason into employee memory, and exits 2', async () => {
    const observed = await mountedRun({
      goal: { phase: 'blocked', code: 'missing-tool', message: 'no deploy tool' },
      startup: { taskKey: 'k' },
    })
    expect(observed.exits).toEqual([2])
    expect(observed.promoted).toHaveLength(1)
    expect(observed.promoted[0]).toContain('blocked (missing-tool): no deploy tool')
    const ledger = await listTaskAttempts()
    expect(ledger.k).toEqual({
      consecutiveFailures: 1,
      displayName: 'do the thing',
      employeeId: 'emp-1',
      lastReason: 'blocked (missing-tool): no deploy tool',
    })
  })

  it('maps round-limit exhaustion onto exit code 3', async () => {
    const observed = await mountedRun({
      goal: { phase: 'blocked', code: 'round-limit', message: 'Goal reached its configured limit of 4 rounds.' },
    })
    expect(observed.exits).toEqual([3])
    const ledger = await listTaskAttempts()
    expect(Object.values(ledger)[0]?.lastReason).toContain('budget-limited')
  })

  it('suspends and notifies on the third consecutive failure', async () => {
    await withTaskAttempts((draft) => { Object.assign(draft, {
      roster: { consecutiveFailures: 2, lastReason: 'previous stumbles' },
    }) })
    const observed = await mountedRun({
      goal: { phase: 'blocked', code: 'missing-tool', message: 'still no tool' },
      startup: { taskKey: 'roster' },
      config: { notifyChannel: 'feishu-bot' },
    })
    expect(observed.exits).toEqual([2])
    expect(observed.err).toContain('suspended after reaching the failure ceiling')
    const ledger = await listTaskAttempts()
    expect(ledger.roster?.suspended).toBe(true)
    expect(observed.sent).toHaveLength(1)
    expect(observed.sent[0]?.channel).toBe('feishu-bot')
    expect(observed.sent[0]?.context).toEqual({ employee: 'emp-1', taskKey: 'roster' })
  })

  it('refuses a suspended task before creating anything', async () => {
    await withTaskAttempts((draft) => { Object.assign(draft, {
      roster: { consecutiveFailures: 3, suspended: true, lastReason: 'stuck' },
    }) })
    const observed = await mountedRun({ goal: { phase: 'complete' }, startup: { taskKey: 'roster' } })
    expect(observed.exits).toEqual([1])
    expect(observed.err).toContain('is suspended')
    expect(observed.createdTasks).toEqual([])
  })

  it('stays silent on failure without a configured channel', async () => {
    const observed = await mountedRun({ goal: { phase: 'blocked', code: 'x', message: 'y' } })
    expect(observed.sent).toEqual([])
    expect(observed.err).not.toContain('suspended')
  })

  it('keeps running when memory promotion rejects or throws', async () => {
    for (const behavior of ['rejected', 'throws'] as const) {
      const observed = await mountedRun({
        goal: { phase: 'blocked', code: 'c', message: 'm' },
        promoteBehavior: behavior,
      })
      expect(observed.exits).toEqual([2])
      expect(Object.keys(await listTaskAttempts())).toHaveLength(1)
    }
  })

  it('logs an undelivered suspension notification without failing the exit path', async () => {
    await withTaskAttempts((draft) => { Object.assign(draft, {
      roster: { consecutiveFailures: 2, lastReason: 'r' },
    }) })
    const observed = await mountedRun({
      goal: { phase: 'blocked', code: 'c', message: 'm' },
      startup: { taskKey: 'roster' },
      config: { notifyChannel: 'generic-webhook' },
      notifyOutcome: 'failed',
    })
    expect(observed.exits).toEqual([2])
    expect(observed.sent).toHaveLength(1)
  })

  it('settles on the current goal state when quiescence never arrives', async () => {
    const observed = await mountedRun({
      goal: { phase: 'active' },
      neverIdle: true,
      config: { settleTimeoutMs: 30 },
    })
    expect(observed.exits).toEqual([2])
    expect(Object.values(await listTaskAttempts())[0]?.lastReason).toContain('phase "active"')
  })

  it('is inert without an employee selection', async () => {
    const observed = await mountedRun({
      goal: { phase: 'complete' },
      startup: { employee: null, taskKey: 'k' },
    })
    await new Promise((resolve) => { setTimeout(resolve, 20) })
    expect(observed.exits).toEqual([])
    expect(observed.createdTasks).toEqual([])
  })
})
