import { existsSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { internals, withTaskAttempts } from '@deepseek-ai/dsh-digital-employee-file'
import { describe, expect, it } from 'vitest'

describe('probe', () => {
  it('seed writes the ledger', async () => {
    const home = mkdtempSync(join(tmpdir(), 'probe-'))
    internals.path = join(home, 'digital-employees', 'task-attempts.json')
    await withTaskAttempts((draft) => {
      draft.k = { consecutiveFailures: 1 }
    })
    process.stderr.write(`PROBE exists=${existsSync(internals.path)} path=${internals.path}\n`)
    expect(existsSync(internals.path)).toBe(true)
  })
})
