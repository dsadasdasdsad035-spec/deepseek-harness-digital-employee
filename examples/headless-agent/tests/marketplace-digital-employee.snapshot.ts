/**
 * Keyless marketplace digital employee capability snapshot.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/marketplace-digital-employee', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const expectedPath = join(fixtureDir, 'transcript.expected.jsonl')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('marketplace digital employee assembled snapshot', () => {
  it('uses selected marketplace capabilities with durable attribution and no escalation', async () => {
    const result = await runLoaderSmoke({
      label: 'marketplace digital employee snapshot',
      tempDirPrefix: 'dsh-marketplace-employee-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath,
      env: {
        DSH_MARKETPLACE_EMPLOYEE_PRESET_ROOT: join(fixtureDir, 'presets'),
      },
    })

    expect(result.stderr).toBe('')
    const transcript = result.stdout
      .trimEnd()
      .split('\n')
      .filter(line => line.includes('"type":"acceptance"'))
      .join('\n') + '\n'
    expect(transcript).toContain('"stage":"capabilities-used"')
    expect(transcript).toContain('"stage":"durable-attribution"')
    expect(transcript).toContain('"undeclaredAbsent":true')
    expect(transcript).toContain('"skillLoaded":true')
    expect(transcript).toContain('"toolResult":true')
    expect(transcript).toContain('"mcpResult":true')
    expect(transcript).toContain('"skillAudit":true')
    expect(transcript).toContain('"toolAudit":true')
    expect(transcript).toContain('"mcpAudit":true')
    if (refreshing) await writeFile(expectedPath, transcript)
    expect(transcript).toBe(await readFile(expectedPath, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
