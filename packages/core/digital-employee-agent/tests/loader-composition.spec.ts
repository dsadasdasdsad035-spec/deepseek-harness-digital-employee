import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const binScript = fileURLToPath(new URL(
  '../../../../examples/headless-agent/tests/fixtures/core/digital-employee-agent/driver.ts',
  import.meta.url,
))
const configPath = fileURLToPath(new URL(
  '../../../../examples/headless-agent/tests/fixtures/core/digital-employee-agent/cordis.yml',
  import.meta.url,
))
const tsconfigPath = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('digital employee assembled Loader composition', () => {
  it('creates an employee and runs one root task through the Agent loop', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'digital-employee-agent',
      tempDirPrefix: 'digital-employee-agent-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath,
      env: {
        DSH_DIGITAL_EMPLOYEE_PRESET_ROOT: join(dirname(configPath), 'presets'),
      },
    })
    const lines = stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const events = lines.slice(0, -1).flatMap((line) => {
      const event = line['event'] as SessionEvent | undefined
      return event === undefined ? [] : [event]
    })

    expect(stderr).toBe('')
    expect(events).toContainEqual(expect.objectContaining({
      type: 'digital-employee/identity',
      data: expect.objectContaining({
        displayName: 'Ada',
        templateId: 'research-assistant',
        templateVersion: '1.0.0',
        compositionId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        personality: 'Precise, curious, and concise.',
      }) as unknown as SessionEvent['data'],
    }))
    expect(events).toContainEqual(expect.objectContaining({
      type: 'digital-employee/instructions',
      data: { revision: 'research-assistant-v1' },
    }))
    expect(events.some(event => event.type === 'assistant/message')).toBe(true)
    expect(lines.find(line => line['type'] === 'result')).toMatchObject({
      type: 'result',
      output: 'Ada completed the keyless task.',
    })
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
