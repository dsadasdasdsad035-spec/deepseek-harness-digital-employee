/**
 * `dsh employee-task` end-to-end over a temp DSH_HOME: the command runs in a
 * subprocess through the same source launch path users invoke, so exit codes,
 * stdout rendering, and ledger persistence are verified as one behavior.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { digestInternals, internals, listTaskAttempts, withTaskAttempts } from '@deepseek-ai/dsh-digital-employee-file'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'


let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-employee-task-'))
  internals.path = join(home, 'digital-employees', 'task-attempts.json')
  digestInternals.path = join(home, 'digital-employees', 'task-digest.json')
})

afterEach(() => {
  internals.path = join(tmpdir(), `stale-${Date.now()}.json`)
  digestInternals.path = join(tmpdir(), `stale-${Date.now()}.json`)
})

/** Run `dsh employee-task <args...>` under the temp home. */
function spawnTask(args: readonly string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [
    '--import', 'tsx/esm',
    join(import.meta.dirname, '../src/bin.ts'),
    'employee-task',
    ...args,
  ], {
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
    timeout: 60_000,
  })
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

describe('dsh employee-task', () => {
  it('lists records sorted by key with the legacy key fallback', async () => {
    await withTaskAttempts((draft) => {
      draft['b-second'] = { consecutiveFailures: 1, displayName: 'Second task' }
      draft['a-first'] = { consecutiveFailures: 3, suspended: true, lastReason: 'blocked: no tool' }
    })
    const { existsSync } = await import('node:fs')
    const ledgerPath = internals.path
    const preExists = existsSync(ledgerPath)
    const run = spawnTask(['list'])
    process.stderr.write(`DIAG ${JSON.stringify({ preExists, ledgerPath, childOut: run.stdout, childErr: run.stderr, postKeys: Object.keys(listTaskAttempts()) })}\n`)
    const lines = run.stdout.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('a-first')
    expect(lines[0]).toContain('suspended')
    expect(lines[0]).toContain('blocked: no tool') // legacy record: displayName falls back to the key
    expect(lines[1]).toContain('Second task')
  })

  it('prints an empty-state note for a missing ledger', () => {
    const run = spawnTask(['list'])
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('No autonomous task attempts recorded.')
  })

  it('resumes a suspended key, keeping the count and clearing the flag', async () => {
    await withTaskAttempts((draft) => {
      draft.k = { consecutiveFailures: 3, suspended: true, lastReason: 'stuck' }
    })
    const run = spawnTask(['resume', 'k'])
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('Resumed k.')
    const ledger = await listTaskAttempts()
    expect(ledger.k).toMatchObject({ consecutiveFailures: 3, lastReason: 'stuck' })
    expect(ledger.k?.suspended).toBeUndefined()
  })

  it('fails with exit 1 on an unknown resume key and leaves the ledger unchanged', async () => {
    await withTaskAttempts((draft) => {
      draft.k = { consecutiveFailures: 1 }
    })
    const run = spawnTask(['resume', 'missing'])
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('not in the ledger')
    expect((await listTaskAttempts()).k).toBeDefined()
  })

  it('fails with exit 1 when resuming a non-suspended key', async () => {
    await withTaskAttempts((draft) => {
      draft.k = { consecutiveFailures: 1 }
    })
    const run = spawnTask(['resume', 'k'])
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('is not suspended')
  })

  it('discards a known key and fails on an unknown one afterwards', async () => {
    await withTaskAttempts((draft) => {
      draft.k = { consecutiveFailures: 3, suspended: true }
    })
    const run = spawnTask(['discard', 'k'])
    expect(run.code).toBe(0)
    expect(run.stdout).toContain('Discarded k.')
    expect(await listTaskAttempts()).toEqual({})
    const again = spawnTask(['discard', 'k'])
    expect(again.code).toBe(1)
    expect(again.stderr).toContain('not in the ledger')
  })
})
