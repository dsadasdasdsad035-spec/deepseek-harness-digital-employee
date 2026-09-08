/**
 * The attempt-ledger store: locked transaction serialization, tolerant display
 * fields, strict counting fields, and the driver-facing algebra.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyAttemptFailure,
  attemptKeyOf,
  internals,
  listTaskAttempts,
  resetAttempt,
  stampAttemptDisplay,
  withTaskAttempts,
  type TaskAttemptLedger,
} from '../src/task-attempts.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-task-attempts-'))
  internals.path = join(dir, 'task-attempts.json')
})

afterEach(() => {
  internals.path = join(tmpdir(), `stale-${Date.now()}.json`)
})

describe('attemptKeyOf', () => {
  it('prefers the explicit key and hashes employee plus task otherwise', () => {
    expect(attemptKeyOf('emp', 'task', 'roster-key')).toBe('roster-key')
    const hashed = attemptKeyOf('emp', 'task', undefined)
    expect(hashed).toMatch(/^[0-9a-f]{24}$/)
    expect(attemptKeyOf('emp', 'other', undefined)).not.toBe(hashed)
    expect(attemptKeyOf('emp2', 'task', undefined)).not.toBe(hashed)
  })
})

describe('listTaskAttempts', () => {
  it('reads a missing file as an empty ledger', async () => {
    expect(await listTaskAttempts()).toEqual({})
  })

  it('fails loud on an unparseable ledger', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir(dir, { recursive: true })
    await writeFile(internals.path, 'not json')
    await expect(listTaskAttempts()).rejects.toThrow(/not valid JSON/)
  })

  it('fails loud on an invalid counting field instead of silently resetting', async () => {
    const { writeFile } = await import('node:fs/promises')
    const { writeFile: writeFileAtomicImport } = await import('node:fs/promises')
    void writeFileAtomicImport
    await writeFile(internals.path, `${JSON.stringify({ k: { consecutiveFailures: -1 } })}\n`)
    await expect(listTaskAttempts()).rejects.toThrow(/invalid consecutiveFailures/)
  })

  it('tolerates missing display fields', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(internals.path, `${JSON.stringify({ legacy: { consecutiveFailures: 2 } })}\n`)
    expect(await listTaskAttempts()).toEqual({ legacy: { consecutiveFailures: 2 } })
  })

  it('rejects wrong-typed display fields', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(internals.path, `${JSON.stringify({ broken: { consecutiveFailures: 1, employeeId: 7 } })}\n`)
    await expect(listTaskAttempts()).rejects.toThrow(/invalid employeeId/)
  })
})

describe('withTaskAttempts', () => {
  it('writes through the transaction and re-reads under the lock', async () => {
    expect(await listTaskAttempts()).toEqual({})
    await withTaskAttempts((draft) => { draft.k = { consecutiveFailures: 1, lastReason: 'x' } })
    await withTaskAttempts((draft) => { draft.k!.consecutiveFailures += 1 })
    const ledger = await listTaskAttempts()
    expect(ledger.k?.consecutiveFailures).toBe(2)
  })

  it('serializes concurrent read-modify-write transactions', async () => {
    // Both transactions increment the same counter; serialized execution must
    // land both increments (lost updates would leave 1).
    await Promise.all([
      withTaskAttempts((draft) => { draft.k = { consecutiveFailures: (draft.k?.consecutiveFailures ?? 0) + 1 } }),
      withTaskAttempts((draft) => { draft.k = { consecutiveFailures: (draft.k?.consecutiveFailures ?? 0) + 1 } }),
    ])
    expect((await listTaskAttempts()).k?.consecutiveFailures).toBe(2)
  })

  it('leaves the file untouched when the mutation throws', async () => {
    await withTaskAttempts((draft) => { draft.k = { consecutiveFailures: 1 } })
    await expect(withTaskAttempts(() => { throw new Error('boom') })).rejects.toThrow('boom')
    expect((await listTaskAttempts()).k?.consecutiveFailures).toBe(1)
  })
})

describe('ledger algebra', () => {
  it('suspends exactly at the ceiling and preserves display fields', () => {
    const draft: TaskAttemptLedger = {
      k: { consecutiveFailures: 1, lastReason: 'r1', displayName: 'Weekly report', employeeId: 'emp-1' },
    }
    expect(applyAttemptFailure(draft, 'k', 'r2', 3)).toBe(false)
    expect(applyAttemptFailure(draft, 'k', 'r3', 3)).toBe(true)
    expect(draft.k).toEqual({
      consecutiveFailures: 3,
      suspended: true,
      lastReason: 'r3',
      displayName: 'Weekly report',
      employeeId: 'emp-1',
    })
    resetAttempt(draft, 'k')
    expect(draft.k).toBeUndefined()
  })

  it('stamps display fields only onto existing records', () => {
    const draft: TaskAttemptLedger = {}
    stampAttemptDisplay(draft, 'missing', 'name', 'emp')
    expect(draft.missing).toBeUndefined()
    draft.k = { consecutiveFailures: 1 }
    stampAttemptDisplay(draft, 'k', 'Weekly report', 'emp-1')
    expect(draft.k?.displayName).toBe('Weekly report')
    expect(draft.k?.employeeId).toBe('emp-1')
  })
})
