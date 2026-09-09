/**
 * Keyless builder employee snapshot: template registration, authoring tool
 * mounting, and employee creation.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/builder-employee', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const expectedPath = join(fixtureDir, 'transcript.expected.jsonl')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('builder employee assembled snapshot', () => {
  it('covers template registration, authoring tool mounting, and employee creation', async () => {
    const result = await runLoaderSmoke({
      label: 'Builder employee snapshot', tempDirPrefix: 'dsh-builder-employee-',
      binScript, libBinScript: binScript, configPath, binArgs: [configPath], tsconfigPath,
    })
    expect(result.stderr).toBe('')
    const transcript = result.stdout.trimEnd().split('\n').filter(l => l.includes('"type":"acceptance"')).join('\n') + '\n'
    expect(transcript).toContain('"stage":"template-registered"')
    expect(transcript).toContain('"found":true')
    expect(transcript).toContain('"stage":"authoring-tools"')
    expect(transcript).toContain('"count":5')
    expect(transcript).toContain('"stage":"employee-created"')
    if (refreshing) await writeFile(expectedPath, transcript)
    expect(transcript).toBe(await readFile(expectedPath, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
