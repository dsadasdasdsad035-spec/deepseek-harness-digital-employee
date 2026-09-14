/**
 * The durable whereabouts store: one home of the `whereabouts.json` file
 * format — the per-employee visit history proving each digital employee
 * instance's continuous presence across page refreshes and host restarts.
 * Cross-process safety follows the task-attempts pattern (`withFileLock` +
 * `writeFileAtomic`); reads are strict, a missing file is the empty history.
 *
 * @module @deepseek-ai/dsh-digital-employee-file/whereabouts
 */

import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** One amenity arrival fact. */
export interface WhereaboutsVisit {
  /** Amenity place name from the interior plan (工位/茶水区/…). */
  readonly place: string
  /** Epoch milliseconds of the arrival. */
  readonly at: number
}

/** One employee's durable presence record. */
export interface WhereaboutsRecord {
  readonly employeeId: string
  readonly lastSeenAt: number
  readonly lastPlace: string
  /** Latest visits first; capped by the store. */
  readonly visits: readonly WhereaboutsVisit[]
}

/** The whole store: employee id → record. */
export type WhereaboutsStore = Record<string, WhereaboutsRecord>

/** Cap on retained visits per employee. */
export const WHEREABOUTS_VISIT_CAP = 50

/** Process-facing store path the tests substitute. */
export const whereaboutsInternals: { path: string } = {
  path: dshHomePath('digital-employees', 'whereabouts.json'),
}

/** Read the whole store; a missing file is the empty history.
 * @returns every employee record keyed by id.
 */
export async function readWhereabouts(): Promise<WhereaboutsStore> {
  let text: string
  try {
    text = await readFile(whereaboutsInternals.path, 'utf8')
  } catch {
    return {}
  }
  const parsed = JSON.parse(text) as unknown
  if (typeof parsed !== 'object' || parsed === null) throw new Error('whereabouts: store must be an object')
  const store: WhereaboutsStore = {}
  for (const [employeeId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) throw new Error(`whereabouts: record "${employeeId}" must be an object`)
    const record = value as Record<string, unknown>
    if (typeof record.lastSeenAt !== 'number') throw new Error(`whereabouts: record "${employeeId}" lastSeenAt must be a number`)
    if (typeof record.lastPlace !== 'string') throw new Error(`whereabouts: record "${employeeId}" lastPlace must be a string`)
    if (!Array.isArray(record.visits)) throw new Error(`whereabouts: record "${employeeId}" visits must be an array`)
    const visits = record.visits.map((visit) => {
      if (typeof visit !== 'object' || visit === null) throw new Error(`whereabouts: record "${employeeId}" has a non-object visit`)
      const entry = visit as Record<string, unknown>
      if (typeof entry.place !== 'string' || typeof entry.at !== 'number') {
        throw new Error(`whereabouts: record "${employeeId}" has a malformed visit`)
      }
      return { place: entry.place, at: entry.at }
    })
    store[employeeId] = { employeeId, lastSeenAt: record.lastSeenAt, lastPlace: record.lastPlace, visits }
  }
  return store
}

/** Record one amenity arrival under the file lock, capped to the latest visits.
 * @param employeeId - the arriving employee instance id.
 * @param place - the amenity place name.
 * @param at - epoch milliseconds of the arrival.
 * @returns the updated record.
 */
export async function reportVisit(employeeId: string, place: string, at: number): Promise<WhereaboutsRecord> {
  await mkdir(dirname(whereaboutsInternals.path), { recursive: true })
  return await withFileLock(whereaboutsInternals.path, async () => {
    const store = await readWhereabouts()
    const previous = store[employeeId]
    const visit: WhereaboutsVisit = { place, at }
    const visits = [visit, ...(previous?.visits ?? [])].slice(0, WHEREABOUTS_VISIT_CAP)
    const record: WhereaboutsRecord = { employeeId, lastSeenAt: at, lastPlace: place, visits }
    store[employeeId] = record
    await writeFileAtomic(whereaboutsInternals.path, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
    return record
  })
}
