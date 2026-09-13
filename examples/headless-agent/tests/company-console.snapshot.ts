/**
 * Keyless assembled company-console snapshot: company CRUD with preset and
 * custom departments, employee-instance binding, the live busy/idle floor
 * projection (idle and task-busy verdicts), department deletion moving
 * members to the unassigned group, and the promotional-image pipeline.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const fixtureDir = fileURLToPath(new URL('./fixtures/core/company-console', import.meta.url))
const configPath = join(fixtureDir, 'cordis.yml')
const binScript = join(fixtureDir, 'driver.ts')
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

/** The prepared employee store: three active instances; Bob owns a task session through his audit record. */
const EMPLOYEES_STORE = `${JSON.stringify({
  schemaVersion: 1,
  instances: ['alice', 'bob', 'carol'].map((name, index) => ({
    id: `company-console-${name}`,
    templateId: 'company-console-assistant',
    templateVersion: '1.0.0',
    displayName: name === 'alice' ? 'Alice' : name === 'bob' ? 'Bob' : 'Carol',
    grants: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
    state: 'active',
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: `2026-09-13T00:00:0${String(index)}.000Z`,
  })),
  memories: [],
  audits: [{
    id: 'company-console-audit-bob-task',
    employeeId: 'company-console-bob',
    sessionId: 'company-console-session-task',
    category: 'lifecycle',
    action: 'task.start',
    outcome: 'succeeded',
    occurredAt: '2026-09-13T00:00:00.000Z',
    metadata: {},
  }],
}, null, 2)}\n`

describe('company console assembled snapshot', () => {
  it('manages companies, bindings, the floor projection, and promo images', async () => {
    const result = await runLoaderSmoke({
      label: 'company console snapshot',
      tempDirPrefix: 'dsh-company-console-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath,
      prepare: async (cwd) => {
        await writeFile(join(cwd, 'digital-employees.json'), EMPLOYEES_STORE)
      },
    })
    expect(result.stderr).toBe('')
    const transcript = result.stdout
      .trimEnd()
      .split('\n')
      .filter(line => line.includes('"type":"acceptance"'))
      .join('\n') + '\n'

    expect(transcript).toContain('"stage":"company-created","departments":["总裁","人力","行政","IT","销售"]')
    expect(transcript).toContain('"stage":"candidates","names":["Carol"]')
    expect(transcript).toContain('"stage":"skin-default","skinId":null')
    expect(transcript).toContain('"stage":"skin-switched","skinId":"courtyard"')
    expect(transcript).toContain('"busy":false')
    expect(transcript).toContain('"busyKind":"task"')
    expect(transcript).toContain('"department":"(未分配)"')
    expect(transcript).toContain('"stage":"company-deleted","remaining":0')
    expect(transcript).toContain('"stage":"group-opened"')
    expect(transcript).toContain('"stage":"group-mention","last":{"speakerKind":"employee","displayName":"Alice","text":"stub-turn: 收到，我按自己的节奏跟进。","context":"收到 @Alice 的消息"}')
    expect(transcript).toContain('"stage":"group-task-broadcast"')
    expect(transcript).toContain('"context":"task:1"')
    expect(transcript).toContain('"stage":"group-fallback","last":{"speakerKind":"employee","displayName":"Bob","text":"收到 @Bob 的消息","context":"收到 @Bob 的消息"}')

    if (refreshing) await writeFile(join(fixtureDir, 'console.expected.jsonl'), transcript)
    expect(transcript).toBe(await readFile(join(fixtureDir, 'console.expected.jsonl'), 'utf8'))
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
