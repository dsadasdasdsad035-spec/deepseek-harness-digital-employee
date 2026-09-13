/**
 * The append-only lifecycle log for autonomous digital employee tasks: the
 * one home of the `task-events.jsonl` file format. The headless task driver
 * appends one line per lifecycle fact (started / succeeded / failed); the
 * company-group host tails the same file to turn task transitions into group
 * broadcasts. Unlike the attempt ledger (current-state algebra), this file is
 * a monotonic event history — readers cursor by `seq` and never mutate.
 *
 * Cross-process safety shares the attempt ledger's pattern: appends run
 * inside the file lock and re-derive the next `seq` under it, so writers
 * serialize. Readers tolerate one torn trailing line (a crash mid-append)
 * by dropping it; anything before it parsed or the read fails loud.
 *
 * @module @deepseek-ai/dsh-digital-employee-file/task-events
 */

import { mkdir, readFile } from 'node:fs/promises'
import { appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** One autonomous task lifecycle fact, appended by the headless driver. */
export interface TaskLifecycleEventRecord {
  readonly kind: 'started' | 'succeeded' | 'failed'
  readonly employeeId: string
  readonly taskKey: string
  /** Truncated task text, the same display form the attempt ledger stamps. */
  readonly taskTitle: string
  /** Epoch milliseconds of the fact. */
  readonly at: number
  /** Present when a `failed` fact also reached the suspension ceiling. */
  readonly suspended?: true
  /** Failure classification, `failed` facts only. */
  readonly reason?: string
}

/** One stored line: the record plus its monotonic sequence number. */
export interface TaskLifecycleEvent extends TaskLifecycleEventRecord {
  readonly seq: number
}

/** Process-facing log path the tests substitute. */
export const taskEventsInternals: { path: string } = {
  path: dshHomePath('digital-employees', 'task-events.jsonl'),
}

/**
 * Append one lifecycle fact as the next sequenced line.
 * @param record - the fact to persist.
 * @returns the stored event with its sequence number.
 */
export async function appendTaskLifecycleEvent(record: TaskLifecycleEventRecord): Promise<TaskLifecycleEvent> {
  await mkdir(dirname(taskEventsInternals.path), { recursive: true })
  return await withFileLock(taskEventsInternals.path, async () => {
    const events = await readEvents()
    const seq = (events.at(-1)?.seq ?? 0) + 1
    const event: TaskLifecycleEvent = { seq, ...record }
    await appendFile(taskEventsInternals.path, `${JSON.stringify(event)}\n`, 'utf8')
    return event
  })
}

/**
 * Read the whole lifecycle log in sequence order.
 * @returns every parsed event; a torn trailing line is dropped.
 */
export async function listTaskLifecycleEvents(): Promise<readonly TaskLifecycleEvent[]> {
  return await withFileLock(taskEventsInternals.path, async () => readEvents())
}

/** Parse the log file without the lock; callers wanting consistency hold it. */
async function readEvents(): Promise<readonly TaskLifecycleEvent[]> {
  let text: string
  try {
    text = await readFile(taskEventsInternals.path, 'utf8')
  } catch {
    return []
  }
  const events: TaskLifecycleEvent[] = []
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    if (line === '') continue
    // A crash mid-append leaves a torn final line; drop exactly that one.
    if (index === lines.length - 1 && !text.endsWith('\n')) break
    events.push(parseEventLine(line))
  }
  return events
}

/** Parse one stored line or fail loud on structural corruption. */
function parseEventLine(line: string): TaskLifecycleEvent {
  const input = JSON.parse(line) as Record<string, unknown>
  if (typeof input.seq !== 'number' || !Number.isInteger(input.seq) || input.seq < 1) throw new Error('task events: seq must be a positive integer')
  if (input.kind !== 'started' && input.kind !== 'succeeded' && input.kind !== 'failed') throw new Error('task events: kind must be started, succeeded, or failed')
  for (const field of ['employeeId', 'taskKey', 'taskTitle'] as const) {
    if (typeof input[field] !== 'string') throw new Error(`task events: ${field} must be a string`)
  }
  if (typeof input.at !== 'number' || !Number.isInteger(input.at)) throw new Error('task events: at must be integer epoch milliseconds')
  if (input.suspended !== undefined && input.suspended !== true) throw new Error('task events: suspended must be true when present')
  if (input.reason !== undefined && typeof input.reason !== 'string') throw new Error('task events: reason must be a string when present')
  return {
    seq: input.seq,
    kind: input.kind,
    employeeId: input.employeeId as string,
    taskKey: input.taskKey as string,
    taskTitle: input.taskTitle as string,
    at: input.at,
    ...(input.suspended !== undefined ? { suspended: true } : {}),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  }
}
