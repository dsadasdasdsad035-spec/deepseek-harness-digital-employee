/**
 * Keyless assembled digital employee lifecycle and delegation snapshot.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/digital-employee-agent', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const expectedPath = join(fixtureDir, 'transcript.expected.jsonl')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('digital employee assembled snapshot', () => {
  it('covers identity, expert work, memory policy, denial, lifecycle, and result', async () => {
    const result = await runLoaderSmoke({
      label: 'digital employee headless snapshot',
      tempDirPrefix: 'dsh-digital-employee-snapshot-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath,
      env: {
        DSH_DIGITAL_EMPLOYEE_PRESET_ROOT: join(fixtureDir, 'presets'),
      },
    })

    expect(result.stderr).toBe('')
    const transcript = result.stdout
      .trimEnd()
      .split('\n')
      .filter(line => line.includes('"type":"acceptance"'))
      .join('\n') + '\n'
    expect(transcript).toContain('"stage":"chat-started"')
    expect(transcript).toContain('"stage":"ownership-recorded"')
    expect(transcript).toContain('"stage":"first-message-recorded"')
    if (refreshing) await writeFile(expectedPath, transcript)
    expect(transcript).toBe(await readFile(expectedPath, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
