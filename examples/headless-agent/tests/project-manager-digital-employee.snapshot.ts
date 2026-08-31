/**
 * Keyless project-manager digital employee workflow snapshot.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/project-manager-digital-employee', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const expectedPath = join(fixtureDir, 'transcript.expected.jsonl')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('project-manager digital employee assembled snapshot', () => {
  it('covers management creation, initialized memory, bounded risk review, scoped MCP data, and the root result', async () => {
    const result = await runLoaderSmoke({
      label: 'project-manager digital employee snapshot',
      tempDirPrefix: 'dsh-project-manager-employee-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath,
      env: {
        DSH_PROJECT_MANAGER_PRESET_ROOT: join(fixtureDir, 'presets'),
      },
    })

    expect(result.stderr).toBe('')
    const transcript = result.stdout
      .trimEnd()
      .split('\n')
      .filter(line => line.includes('"type":"acceptance"'))
      .join('\n') + '\n'
    expect(transcript).toContain('"stage":"workflow-complete"')
    expect(transcript).toContain('"projected":true')
    expect(transcript).toContain('"durableAttribution":true')
    expect(transcript).toContain('"stage":"management-created"')
    expect(transcript).toContain('"stage":"risk-review-delegated"')
    expect(transcript).toContain('"expertMcp":true')
    expect(transcript).toContain('"stage":"expert-descendant-denied"')
    if (refreshing) await writeFile(expectedPath, transcript)
    expect(transcript).toBe(await readFile(expectedPath, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
