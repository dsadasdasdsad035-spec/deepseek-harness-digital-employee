/**
 * Keyless assembled digital employee hooks snapshot: hook package install,
 * template binding, and chat-triggered invocable hook execution.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/digital-employee-hooks', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const expectedPath = join(fixtureDir, 'transcript.expected.jsonl')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('digital employee hooks assembled snapshot', () => {
  it('covers confirmation-gated install, template binding, and chat-triggered invocable hook execution', async () => {
    const result = await runLoaderSmoke({
      label: 'Digital employee hooks snapshot',
      tempDirPrefix: 'dsh-digital-employee-hooks-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath,
    })

    expect(result.stderr).toBe('')
    const transcript = result.stdout
      .trimEnd()
      .split('\n')
      .filter(line => line.includes('"type":"acceptance"'))
      .join('\n') + '\n'
    expect(transcript).toContain('"stage":"install-unconfirmed"')
    expect(transcript).toContain('"code":"local-execution-confirmation-required"')
    expect(transcript).toContain('"stage":"install-confirmed"')
    expect(transcript).toContain('"invocable":true')
    expect(transcript).toContain('"stage":"hook-invoked-through-chat"')
    expect(transcript).toContain('HOOK-SAW:')
    expect(transcript).toContain('"invokedEcho":true')
    if (refreshing) await writeFile(expectedPath, transcript)
    expect(transcript).toBe(await readFile(expectedPath, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
