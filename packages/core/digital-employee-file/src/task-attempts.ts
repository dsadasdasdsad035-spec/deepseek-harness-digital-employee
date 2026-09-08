/**
 * The attempt-ledger store for autonomous digital employee tasks: the one
 * home of the `task-attempts.json` file format, its locked read-modify-write
 * transaction, and the ledger algebra both writers share. The headless task
 * driver (success reset, failure counting, suspension) and the management
 * host's task console (resume, discard) mutate the ledger ONLY through
 * {@link withTaskAttempts}, which serializes cross-process writers with the
 * same file lock the employee document itself uses.
 *
 * Reads are tolerant of the two additive display fields (`displayName`,
 * `employeeId`) — the ledger is cross-process runtime data, not an on-disk
 * protocol — and strict about the counting fields: a structurally invalid
 * ledger fails loud rather than silently resetting suspension state.
 *
 * @module @deepseek-ai/dsh-digital-employee-file/task-attempts
 */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** One autonomous task's attempt-ledger record. */
export interface TaskAttemptRecord {
  /** Consecutive attempts that did not complete, reset by any completion. */
  consecutiveFailures: number
  /** Present once the task suspended; further automatic attempts are refused. */
  suspended?: true
  /** Human-readable reason of the latest failed attempt. */
  lastReason?: string
  /** Display name for consoles; truncated task text when the driver wrote it. */
  displayName?: string
  /** Owning employee identity, so consoles can group per employee. */
  employeeId?: string
}

/** The whole ledger: task key → record. */
export type TaskAttemptLedger = Record<string, TaskAttemptRecord>

/** Process-facing state the tests substitute. */
export const internals: { path: string } = {
  path: dshHomePath('digital-employees', 'task-attempts.json'),
}

/**
 * Derive the stable ledger key for one attempt: the explicit task key when
 * given (duty rosters pass a stable key), else a hash of employee and task
 * text (one-off tasks key themselves).
 * @param employeeId - the employee the task runs as.
 * @param task - the task text.
 * @param explicit - the caller-provided task key, when present.
 * @returns the ledger key.
 */
export function attemptKeyOf(employeeId: string, task: string, explicit: string | undefined): string {
  if (explicit !== undefined && explicit !== '') return explicit
  return createHash('sha256').update(`${employeeId}\u0000${task}`).digest('hex').slice(0, 24)
}

/** Narrow one parsed record; display fields are optional, counting fields strict. */
function parseRecord(key: string, value: unknown): TaskAttemptRecord {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`task attempts: record "${key}" is not an object`)
  }
  const input = value as Record<string, unknown>
  if (typeof input.consecutiveFailures !== 'number' || !Number.isInteger(input.consecutiveFailures) || input.consecutiveFailures < 0) {
    throw new Error(`task attempts: record "${key}" has an invalid consecutiveFailures`)
  }
  if (input.suspended !== undefined && input.suspended !== true) {
    throw new Error(`task attempts: record "${key}" has an invalid suspended flag`)
  }
  if (input.lastReason !== undefined && typeof input.lastReason !== 'string') {
    throw new Error(`task attempts: record "${key}" has an invalid lastReason`)
  }
  if (input.displayName !== undefined && typeof input.displayName !== 'string') {
    throw new Error(`task attempts: record "${key}" has an invalid displayName`)
  }
  if (input.employeeId !== undefined && typeof input.employeeId !== 'string') {
    throw new Error(`task attempts: record "${key}" has an invalid employeeId`)
  }
  return {
    consecutiveFailures: input.consecutiveFailures,
    ...input.suspended === true ? { suspended: true } : {},
    ...input.lastReason !== undefined ? { lastReason: input.lastReason } : {},
    ...input.displayName !== undefined ? { displayName: input.displayName } : {},
    ...input.employeeId !== undefined ? { employeeId: input.employeeId } : {},
  }
}

/**
 * Read the ledger; a missing file is an empty ledger. An unparseable or
 * structurally invalid file throws — counting state must not be silently
 * reset.
 * @returns the parsed ledger.
 */
export async function listTaskAttempts(): Promise<TaskAttemptLedger> {
  let text: string
  try {
    text = await readFile(internals.path, 'utf8')
  } catch {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`task attempts: ledger at ${internals.path} is not valid JSON`, { cause: error })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`task attempts: ledger at ${internals.path} is not an object`)
  }
  const ledger: TaskAttemptLedger = {}
  for (const [key, value] of Object.entries(parsed)) {
    ledger[key] = parseRecord(key, value)
  }
  return ledger
}

/**
 * Run one read-modify-write transaction against the ledger under the
 * cross-process file lock: the draft is read, handed to `mutate` for in-place
 * editing, and atomically written back when `mutate` settles. Both ledger
 * writers (the headless task driver and the management task console) MUST go
 * through this entry so concurrent updates serialize instead of overwriting
 * each other.
 * @param mutate - receives a mutable draft; edits land only when it settles.
 * @returns whatever `mutate` settled with.
 */
export async function withTaskAttempts<T>(mutate: (ledger: TaskAttemptLedger) => Promise<T> | T): Promise<T> {
  // The lock file shares the ledger's directory, which may not exist yet on
  // a fresh deployment; create it before acquiring the cross-process lock.
  await mkdir(dirname(internals.path), { recursive: true })
  return await withFileLock(internals.path, async () => {
    const ledger = await listTaskAttempts()
    const result = await mutate(ledger)
    await writeFileAtomic(internals.path, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 })
    return result
  })
}

/**
 * Record one completion in place: the consecutive-failure counter resets, so
 * later tasks of the same key start from zero.
 * @param ledger - the draft under transaction.
 * @param key - the task key.
 */
export function resetAttempt(ledger: TaskAttemptLedger, key: string): void {
  const { [key]: _removed, ...rest } = ledger
  for (const k of Object.keys(ledger)) Reflect.deleteProperty(ledger, k)
  Object.assign(ledger, rest)
  void _removed
}

/**
 * Record one failed attempt in place and decide suspension: the counter
 * increments and the task suspends exactly when it reaches the ceiling.
 * @param ledger - the draft under transaction.
 * @param key - the task key.
 * @param reason - human-readable failure reason of this attempt.
 * @param maxFailedAttempts - the suspension ceiling.
 * @returns whether this failure reached the ceiling and suspended the task.
 */
export function applyAttemptFailure(
  ledger: TaskAttemptLedger,
  key: string,
  reason: string,
  maxFailedAttempts: number,
): boolean {
  const prior = ledger[key]
  const consecutiveFailures = (prior?.consecutiveFailures ?? 0) + 1
  const suspended = consecutiveFailures >= maxFailedAttempts
  ledger[key] = {
    consecutiveFailures,
    ...suspended ? { suspended: true as const } : {},
    lastReason: reason,
    ...prior?.displayName !== undefined ? { displayName: prior.displayName } : {},
    ...prior?.employeeId !== undefined ? { employeeId: prior.employeeId } : {},
  }
  return suspended
}

/**
 * Stamp the display fields one driver writes when it first records a task.
 * Preserved across failure increments so consoles keep the name.
 * @param ledger - the draft under transaction.
 * @param key - the task key.
 * @param displayName - truncated task text for consoles.
 * @param employeeId - owning employee identity.
 */
export function stampAttemptDisplay(ledger: TaskAttemptLedger, key: string, displayName: string, employeeId: string): void {
  const record = ledger[key]
  if (record === undefined) return
  record.displayName = displayName
  record.employeeId = employeeId
}

/** One digest window's state: successes since the last sent digest. */
export interface TaskDigestState {
  /** Successful runs accumulated since the last sent digest. */
  successes: number
  /** Epoch milliseconds of the last successfully sent digest, when one was sent. */
  lastSentAt?: number
}

/** Process-facing digest state path the tests substitute. */
export const digestInternals: { path: string } = {
  path: dshHomePath('digital-employees', 'task-digest.json'),
}

/**
 * Read the digest state; a missing file is the empty window.
 * @returns the parsed digest state.
 */
export async function readTaskDigest(): Promise<TaskDigestState> {
  try {
    const parsed = JSON.parse(await readFile(digestInternals.path, 'utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    const input = parsed as Record<string, unknown>
    if (typeof input.successes !== 'number' || !Number.isInteger(input.successes) || input.successes < 0) {
      throw new Error('invalid successes')
    }
    if (input.lastSentAt !== undefined && typeof input.lastSentAt !== 'number') {
      throw new Error('invalid lastSentAt')
    }
    return {
      successes: input.successes,
      ...input.lastSentAt !== undefined ? { lastSentAt: input.lastSentAt } : {},
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('task digest:')) throw error
    if (error instanceof Error && ('invalid successes' === error.message || 'invalid lastSentAt' === error.message)) {
      throw new Error(`task digest: digest state at ${digestInternals.path} has ${error.message}`)
    }
    return { successes: 0 }
  }
}

/**
 * Run one read-modify-write transaction against the digest state under the
 * same cross-process file lock pattern as the ledger.
 * @param mutate - receives a mutable draft; edits land only when it settles.
 * @returns whatever `mutate` settled with.
 */
export async function withTaskDigest<T>(mutate: (state: TaskDigestState) => Promise<T> | T): Promise<T> {
  await mkdir(dirname(digestInternals.path), { recursive: true })
  return await withFileLock(digestInternals.path, async () => {
    const state = await readTaskDigest()
    const result = await mutate(state)
    const temp = `${digestInternals.path}.${randomUUID()}.tmp`
    await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`)
    await rename(temp, digestInternals.path)
    return result
  })
}

/**
 * Whether one successful run should send the digest now: the window has
 * elapsed since the last sent digest (or none was ever sent).
 * @param state - the current digest state.
 * @param intervalMs - the configured minimum interval between digests.
 * @param now - current epoch milliseconds.
 * @returns true when a digest should be sent.
 */
export function digestDue(state: TaskDigestState, intervalMs: number, now: number): boolean {
  if (state.successes === 0) return false
  return state.lastSentAt === undefined || now - state.lastSentAt >= intervalMs
}

/**
 * Record one successful run in place.
 * @param state - the digest state to mutate.
 */
export function countDigestSuccess(state: TaskDigestState): void {
  state.successes += 1
}

/**
 * Reset the window after a successfully sent digest.
 * @param state - the digest state to mutate.
 * @param now - epoch milliseconds of the send.
 */
export function markDigestSent(state: TaskDigestState, now: number): void {
  state.successes = 0
  state.lastSentAt = now
}
