/**
 * Keyless assembled MCP marketplace stdio snapshot.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/mcp-market-stdio', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const expectedPath = join(fixtureDir, 'transcript.expected.jsonl')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('MCP marketplace stdio assembled snapshot', () => {
  it('covers confirmation-gated install, configuration, restart activation, and stdio tool execution', async () => {
    const result = await runLoaderSmoke({
      label: 'MCP marketplace stdio snapshot',
      tempDirPrefix: 'dsh-mcp-market-stdio-',
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
    expect(transcript).toContain('"stage":"activated"')
    expect(transcript).toContain('mcp__stdio-fixture__fixture_echo')
    expect(transcript).toContain('token-present')
    if (refreshing) await writeFile(expectedPath, transcript)
    expect(transcript).toBe(await readFile(expectedPath, 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
