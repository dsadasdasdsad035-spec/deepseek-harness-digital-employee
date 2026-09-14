/**
 * The durable world-state store: one home of the `world-state.json` file —
 * car fleet states and per-employee last positions so scene re-entry resumes
 * from the last coordinates instead of re-randomizing. Lock + atomic merge
 * follow the whereabouts pattern.
 *
 * @module @deepseek-ai/dsh-company-file/world-state
 */

import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** One car's saved motion state on the road graph. */
export interface CarWorldState {
  /** Road-graph node index the car travels from. */
  readonly from: number
  /** Road-graph node index the car travels toward. */
  readonly to: number
  /** Progress along the edge, 0..1. */
  readonly t: number
  /** Speed in world units per second. */
  readonly speed: number
  /** Epoch milliseconds of the snapshot. */
  readonly at: number
}

/** One employee's saved floor position. */
export interface EmployeeWorldState {
  /** Company whose floor the coordinates belong to. */
  readonly companyId: string
  /** World x on that company's floor. */
  readonly x: number
  /** World z on that company's floor. */
  readonly z: number
  /** Whether the employee was seated at snapshot time. */
  readonly seated: boolean
  /** Epoch milliseconds of the snapshot. */
  readonly at: number
}

/** The whole world state: stable car ids and employee ids keyed entries. */
export interface CompanyWorldState {
  readonly cars: Readonly<Record<string, CarWorldState>>
  readonly employees: Readonly<Record<string, EmployeeWorldState>>
}

/** Patch shape accepted by the report remote. */
export interface CompanyWorldStatePatch {
  readonly cars?: Readonly<Record<string, CarWorldState>>
  readonly employees?: Readonly<Record<string, EmployeeWorldState>>
}

/** Process-facing store path the tests substitute. */
export const worldStateInternals: { path: string } = {
  path: dshHomePath('companies', 'world-state.json'),
}

/** Read the whole store; a missing file is the empty state.
 * @returns the persisted car and employee states.
 */
export async function readCompanyWorldState(): Promise<CompanyWorldState> {
  let text: string
  try {
    text = await readFile(worldStateInternals.path, 'utf8')
  } catch {
    return { cars: {}, employees: {} }
  }
  const parsed = JSON.parse(text) as Record<string, unknown>
  return { cars: parseEntries(parsed.cars, parseCar), employees: parseEntries(parsed.employees, parseEmployee) }
}

/** Merge one patch under the file lock and publish atomically.
 * @param patch - car/employee entries to overlay; absent sections keep the saved ones.
 * @returns the merged state.
 */
export async function reportCompanyWorldState(patch: CompanyWorldStatePatch): Promise<CompanyWorldState> {
  await mkdir(dirname(worldStateInternals.path), { recursive: true })
  return await withFileLock(worldStateInternals.path, async () => {
    const current = await readCompanyWorldState()
    const merged: CompanyWorldState = {
      cars: { ...current.cars, ...patch.cars },
      employees: { ...current.employees, ...patch.employees },
    }
    await writeFileAtomic(worldStateInternals.path, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 })
    return merged
  })
}

type EntryParser<T> = (value: Record<string, unknown>, id: string) => T

function parseEntries<T>(section: unknown, parse: EntryParser<T>): Record<string, T> {
  if (typeof section !== 'object' || section === null) throw new Error('world state: sections must be objects')
  const out: Record<string, T> = {}
  for (const [id, value] of Object.entries(section as Record<string, unknown>)) {
    const entry = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
    if (entry === null) throw new Error(`world state: entry "${id}" must be an object`)
    out[id] = parse(entry, id)
  }
  return out
}

function parseCar(value: Record<string, unknown>, id: string): CarWorldState {
  for (const field of ['from', 'to', 't', 'speed', 'at'] as const) {
    if (typeof value[field] !== 'number') throw new Error(`world state: car "${id}" ${field} must be a number`)
  }
  return {
    from: value.from as number,
    to: value.to as number,
    t: value.t as number,
    speed: value.speed as number,
    at: value.at as number,
  }
}

function parseEmployee(value: Record<string, unknown>, id: string): EmployeeWorldState {
  if (typeof value.companyId !== 'string') throw new Error(`world state: employee "${id}" companyId must be a string`)
  for (const field of ['x', 'z', 'at'] as const) {
    if (typeof value[field] !== 'number') throw new Error(`world state: employee "${id}" ${field} must be a number`)
  }
  if (typeof value.seated !== 'boolean') throw new Error(`world state: employee "${id}" seated must be a boolean`)
  return {
    companyId: value.companyId,
    x: value.x as number,
    z: value.z as number,
    seated: value.seated,
    at: value.at as number,
  }
}
