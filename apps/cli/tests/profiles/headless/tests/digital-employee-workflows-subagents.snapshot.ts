/**
 * Keyless assembled workflow+subagent snapshot: install, bind, bridge mount.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/digital-employee-workflows-subagents', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const expectedPath = join(fixtureDir, 'transcript.expected.jsonl')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('workflow+subagent assembled snapshot', () => {
  it('covers install, bind, bridge mount', async () => {
    const result = await runLoaderSmoke({
      label: 'WF+SA snapshot', tempDirPrefix: 'dsh-wf-sa-',
      binScript, libBinScript: binScript, configPath, binArgs: [configPath], tsconfigPath,
    })
    expect(result.stderr).toBe('')
    const transcript = result.stdout.trimEnd().split('\n').filter(l => l.includes('"type":"acceptance"')).join('\n') + '\n'
    expect(transcript).toContain('"stage":"workflow-installed"')
    expect(transcript).toContain('"stage":"subagent-installed"')
    expect(transcript).toContain('"stage":"inventory"')
    if (refreshing) await writeFile(expectedPath, transcript)
    expect(transcript).toBe(await readFile(expectedPath, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
