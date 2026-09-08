/**
 * Keyless assembled digital-employee autonomous-task snapshot: one employee,
 * goal-armed continuation, the exit-code contract, the attempt ledger, and
 * suspension notification, over a scripted mock model.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/digital-employee-autonomous', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

/** The prepared employee store: one active instance of the fixture template. */
const EMPLOYEES_STORE = `${JSON.stringify({
  schemaVersion: 1,
  instances: [{
    id: 'employee-autonomous-ada',
    templateId: 'research-assistant',
    templateVersion: '1.0.0',
    displayName: 'Ada',
    grants: { skills: [], tools: ['get_goal', 'create_goal', 'update_goal'], mcpServers: [], experts: ['reviewer'], allowSubagents: false },
    state: 'active',
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  }],
  memories: [],
  audits: [],
}, null, 2)}\n`

/** Boot one scenario and fold its acceptance lines. `stderr` matches the process stderr when the scenario legitimately writes one. */
async function runScenario(scenario: string, tempPrefix: string, stderr?: RegExp): Promise<string> {
  const result = await runLoaderSmoke({
    label: `employee autonomous ${scenario} snapshot`,
    tempDirPrefix: tempPrefix,
    binScript,
    libBinScript: binScript,
    configPath,
    binArgs: [configPath],
    tsconfigPath,
    prepare: async (cwd) => {
      await writeFile(join(cwd, 'digital-employees.json'), EMPLOYEES_STORE)
      if (scenario === 'suspend') {
        await mkdir(join(cwd, '.dsh', 'digital-employees'), { recursive: true })
        await writeFile(join(cwd, '.dsh', 'digital-employees', 'task-attempts.json'), `${JSON.stringify({
          'autonomous-snapshot-key': { consecutiveFailures: 2, lastReason: 'previous attempts failed' },
        }, null, 2)}\n`)
      }
    },
    env: {
      DSH_DIGITAL_EMPLOYEE_PRESET_ROOT: join(fixtureDir, '..', 'digital-employee-agent', 'presets'),
      DSH_EMPLOYEE_AUTONOMOUS_SCENARIO: scenario,
    },
  })
  if (stderr === undefined) expect(result.stderr).toBe('')
  else expect(result.stderr).toMatch(stderr)
  return result.stdout
    .trimEnd()
    .split('\n')
    .filter(line => line.includes('"type":"acceptance"'))
    .join('\n') + '\n'
}

describe('employee autonomous task assembled snapshot', () => {
  it('completes a goal-armed employee task and exits zero', async () => {
    const transcript = await runScenario('complete', 'dsh-employee-autonomous-complete-')
    expect(transcript).toContain('"stage":"exit-recorded"')
    expect(transcript).toContain('"exits":[0]')
    // Completion clears the ledger and stays silent.
    expect(transcript).toContain('"stage":"ledger-state"')
    expect(transcript).toContain('"stage":"notifications-captured","count":1')
    if (refreshing) await writeFile(join(fixtureDir, 'complete.expected.jsonl'), transcript)
    expect(transcript).toBe(await readFile(join(fixtureDir, 'complete.expected.jsonl'), 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('exhausts the round budget, records the failure, and exits three', async () => {
    const transcript = await runScenario('loop', 'dsh-employee-autonomous-loop-')
    expect(transcript).toContain('"exits":[3]')
    expect(transcript).toContain('"consecutiveFailures":1')
    expect(transcript).toContain('"stage":"notifications-captured","count":1')
    if (refreshing) await writeFile(join(fixtureDir, 'loop.expected.jsonl'), transcript)
    expect(transcript).toBe(await readFile(join(fixtureDir, 'loop.expected.jsonl'), 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)

  it('suspends on the third consecutive failure and notifies the channel', async () => {
    const transcript = await runScenario('suspend', 'dsh-employee-autonomous-suspend-', /suspended after reaching the failure ceiling/)
    expect(transcript).toContain('"exits":[3]')
    expect(transcript).toContain('"suspended":true')
    expect(transcript).toContain('"stage":"notification-sent"')
    expect(transcript).toContain('"channel":"fixture-channel"')
    if (refreshing) await writeFile(join(fixtureDir, 'suspend.expected.jsonl'), transcript)
    expect(transcript).toBe(await readFile(join(fixtureDir, 'suspend.expected.jsonl'), 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
