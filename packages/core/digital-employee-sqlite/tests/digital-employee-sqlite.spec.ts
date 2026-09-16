import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import DigitalEmployees, {
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeTemplateId,
  createExpertId,
  type DigitalEmployeeInstance,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { SqliteDigitalEmployeeProvider } from '@deepseek-ai/dsh-digital-employee-sqlite'

const template: DigitalEmployeeTemplate = {
  id: createDigitalEmployeeTemplateId('analyst'),
  version: '1.0.0',
  display: { name: 'Analyst', description: 'Analyzes data.' },
  personality: 'Precise.',
  instructions: { kind: 'file', root: import.meta.dirname, path: 'AGENTS.md', revision: 'v1' },
  preset: 'headless',
  capabilities: {
    skills: ['analysis'],
    tools: ['read'],
    mcpServers: [],
    experts: [createExpertId('reviewer')],
    allowSubagents: true,
  },
  experts: [{
    id: createExpertId('reviewer'),
    name: 'Reviewer',
    responsibility: 'Reviews output.',
    instructions: { kind: 'file', root: import.meta.dirname, path: 'reviewer/AGENTS.md', revision: 'v1' },
    modelSettings: {
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      maxTokens: 4_096,
    },
    capabilities: {
      skills: [],
      tools: ['read'],
      mcpServers: [],
      experts: [],
      allowSubagents: false,
    },
    memoryAccess: ['session'],
    delegation: { mode: 'continuable', maxDepth: 0, maxConcurrency: 1, timeoutMs: 10_000 },
  }],
  delegation: { maxDepth: 2, maxConcurrency: 2, timeoutMs: 30_000 },
}

const upgradedTemplate: DigitalEmployeeTemplate = {
  ...template,
  version: '2.0.0',
  display: { ...template.display, description: 'Analyzes and publishes data.' },
  instructions: { ...template.instructions, revision: 'v2' },
  mcpServers: [{
    id: 'publisher',
    transport: 'streamable-http',
    url: 'https://mcp.example.test',
    headers: {},
    headerCredentials: { Authorization: 'PUBLISH_TOKEN' as never },
  }],
  capabilities: {
    ...template.capabilities,
    tools: ['read', 'write'],
    mcpServers: ['publisher'],
  },
}

async function harness(
  dbPath: string,
  policy: { allowSensitiveMemory?: boolean; maxRetentionDays?: number } = {},
): Promise<{ ctx: Context; provider: SqliteDigitalEmployeeProvider }> {
  const ctx = new Context()
  await ctx.plugin(DigitalEmployees)
  ctx.digitalEmployees.registerTemplate(template)
  ctx.digitalEmployees.registerTemplate(upgradedTemplate)
  const provider = new SqliteDigitalEmployeeProvider(ctx, { path: dbPath, ...policy })
  await provider.initialize()
  ctx.digitalEmployees.configureProvider(provider)
  return { ctx, provider }
}

describe('SqliteDigitalEmployeeProvider', () => {
  it('persists independent instances and restores them after reopen', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-'))
    const dbPath = join(root, 'employees.db')
    const first = await harness(dbPath)
    const alpha = await first.ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Alpha',
      personality: 'Direct.',
      grants: template.capabilities,
    })
    const beta = await first.ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Beta',
      grants: { ...template.capabilities, tools: [] },
    })
    await first.ctx.digitalEmployees.transition(alpha.id, 'active')
    await first.provider.close()

    const second = await harness(dbPath)
    expect(await second.ctx.digitalEmployees.list()).toEqual([
      expect.objectContaining({ id: alpha.id, displayName: 'Alpha', state: 'active' }),
      expect.objectContaining({ id: beta.id, displayName: 'Beta', state: 'inactive' }),
    ])
    expect((await second.ctx.digitalEmployees.get(beta.id))?.grants.tools).toEqual([])
    await second.provider.close()
  })

  it('persists attributable audit records and rejects credential-shaped metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-audit-'))
    const { ctx, provider } = await harness(join(root, 'employees.db'))
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Audited',
      grants: template.capabilities,
    })

    const audit = await ctx.digitalEmployees.appendAudit({
      employeeId: employee.id,
      sessionId: SessionId('audit-session'),
      agentId: SessionId('audit-agent'),
      category: 'capability',
      action: 'tool.call',
      outcome: 'succeeded',
      metadata: { tool: 'read', callId: 'call-1' },
    })
    expect(audit).toMatchObject({
      employeeId: employee.id,
      sessionId: 'audit-session',
      agentId: 'audit-agent',
      metadata: { tool: 'read', callId: 'call-1' },
    })
    expect(await ctx.digitalEmployees.listAudit(employee.id)).toEqual([audit])

    await expect(ctx.digitalEmployees.appendAudit({
      employeeId: employee.id,
      category: 'capability',
      action: 'mcp.call',
      outcome: 'succeeded',
      metadata: { credentialValue: 'do-not-store' },
    })).rejects.toThrow('may contain a credential value')
    expect(await readFile(join(root, 'employees.db'), 'utf8')).not.toContain('do-not-store')
    await provider.close()
  })

  it('resolves only active instances against their exact template version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-resolve-'))
    const { ctx, provider } = await harness(join(root, 'employees.db'))
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Scoped analyst',
      grants: { ...template.capabilities, skills: [], experts: [] },
    })
    await expect(ctx.digitalEmployees.resolve(employee.id)).rejects.toThrow('inactive')
    await ctx.digitalEmployees.transition(employee.id, 'active')

    const resolved = await ctx.digitalEmployees.resolve(employee.id)
    expect(resolved.template).toEqual(template)
    expect(resolved.authority.skills).toEqual([])
    expect(resolved.authority.tools).toEqual(['read'])
    expect(resolved.experts).toEqual([])
    await provider.close()
  })

  it('provides typed lifecycle operations and removes employee-owned data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-delete-'))
    const { ctx, provider } = await harness(join(root, 'employees.db'))
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Disposable analyst',
      grants: template.capabilities,
    })
    await ctx.digitalEmployees.promoteMemory({
      employeeId: employee.id,
      content: 'Durable fact.',
      tags: [],
      sensitive: false,
      provenance: {
        sessionId: SessionId('session-delete'),
        source: 'fixture',
        recordedAt: '2026-08-29T00:00:00.000Z',
      },
    })
    await ctx.digitalEmployees.appendAudit({
      employeeId: employee.id,
      category: 'lifecycle',
      action: 'create',
      outcome: 'succeeded',
      metadata: {},
    })

    expect(await ctx.digitalEmployees.inspect(employee.id)).toEqual(employee)
    expect((await ctx.digitalEmployees.activate(employee.id)).state).toBe('active')
    expect((await ctx.digitalEmployees.deactivate(employee.id)).state).toBe('inactive')
    await ctx.digitalEmployees.transition(employee.id, 'deleting')
    await ctx.digitalEmployees.delete(employee.id)
    expect(await ctx.digitalEmployees.get(employee.id)).toBeUndefined()
    expect(await ctx.digitalEmployees.queryMemory({
      employeeId: employee.id,
      text: '',
      scopes: ['long-term'],
      limit: 10,
    })).toEqual([])
    expect(await ctx.digitalEmployees.listAudit(employee.id)).toEqual([])
    await provider.close()
  })

  it('previews upgrades and grants newly declared capabilities only after explicit approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-upgrade-'))
    const { ctx, provider } = await harness(join(root, 'employees.db'))
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Upgradeable analyst',
      grants: template.capabilities,
    })

    await expect(ctx.digitalEmployees.previewUpgrade({
      employeeId: employee.id,
      targetVersion: upgradedTemplate.version,
    })).resolves.toMatchObject({
      currentVersion: '1.0.0',
      targetVersion: '2.0.0',
      addedCapabilities: { tools: ['write'], mcpServers: ['publisher'] },
      removedCapabilities: { tools: [], mcpServers: [] },
    })

    const withoutApproval = await ctx.digitalEmployees.applyUpgrade({
      employeeId: employee.id,
      targetVersion: upgradedTemplate.version,
      approvedCapabilities: {
        skills: [],
        tools: [],
        mcpServers: [],
        experts: [],
        allowSubagents: false,
      },
    })
    expect(withoutApproval.templateVersion).toBe('2.0.0')
    expect(withoutApproval.grants.tools).toEqual(['read'])
    expect(withoutApproval.grants.mcpServers).toEqual([])
    await provider.close()
  })

  it('exports and imports a redacted inactive employee with fresh durable ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-portable-'))
    const { ctx, provider } = await harness(join(root, 'employees.db'))
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Portable analyst',
      personality: 'Portable.',
      grants: template.capabilities,
    })
    const decision = await ctx.digitalEmployees.promoteMemory({
      employeeId: employee.id,
      content: 'Use the approved publishing checklist.',
      tags: ['publishing'],
      sensitive: false,
      provenance: {
        sessionId: SessionId('portable-session'),
        source: 'fixture',
        recordedAt: '2026-08-29T00:00:00.000Z',
      },
    })
    expect(decision.kind).toBe('accepted')

    const artifact = await ctx.digitalEmployees.exportEmployee({
      employeeId: employee.id,
      includeMemory: true,
    })
    const serialized = JSON.stringify(artifact)
    expect(serialized).not.toContain('PUBLISH_TOKEN')
    expect(serialized).not.toContain('portable-session')
    expect(serialized).not.toContain(employee.id)

    const imported = await ctx.digitalEmployees.importEmployee(artifact)
    expect(imported.id).not.toBe(employee.id)
    expect(imported).toMatchObject({
      templateId: employee.templateId,
      templateVersion: employee.templateVersion,
      displayName: employee.displayName,
      personality: employee.personality,
      grants: employee.grants,
      state: 'inactive',
    })
    expect(await ctx.digitalEmployees.queryMemory({
      employeeId: imported.id,
      text: 'publishing',
      scopes: ['long-term'],
      limit: 10,
    })).toEqual([
      expect.objectContaining({
        employeeId: imported.id,
        content: 'Use the approved publishing checklist.',
      }),
    ])
    await provider.close()
  })

  it('retrieves bounded employee-owned long-term memory with deterministic metadata ranking', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-memory-'))
    const { ctx, provider } = await harness(join(root, 'employees.db'))
    const first = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'First analyst',
      grants: template.capabilities,
    })
    const second = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Second analyst',
      grants: template.capabilities,
    })
    const tagMatch = await ctx.digitalEmployees.promoteMemory({
      employeeId: first.id,
      content: 'Review the final checklist.',
      tags: ['launch'],
      sensitive: false,
      provenance: {
        sessionId: SessionId('session-tag'),
        source: 'fixture',
        recordedAt: '2026-08-27T09:00:00.000Z',
      },
    })
    await ctx.digitalEmployees.promoteMemory({
      employeeId: second.id,
      content: 'Another launch checklist.',
      tags: ['launch'],
      sensitive: false,
      provenance: {
        sessionId: SessionId('session-other'),
        source: 'fixture',
        recordedAt: '2026-08-27T11:00:00.000Z',
      },
    })

    const result = await ctx.digitalEmployees.queryMemory({
      employeeId: first.id,
      text: 'LAUNCH',
      scopes: ['long-term'],
      limit: 1,
    })

    expect(tagMatch.kind).toBe('accepted')
    expect(result).toEqual([
      expect.objectContaining({
        id: tagMatch.kind === 'accepted' ? tagMatch.memory.id : undefined,
        employeeId: first.id,
      }),
    ])
    await expect(ctx.digitalEmployees.queryMemory({
      employeeId: first.id,
      text: '',
      scopes: ['long-term'],
      limit: 5,
    })).resolves.toHaveLength(1)
    await provider.close()
  })

  it('returns explicit promotion decisions for ownership, duplicates, sensitivity, and retention', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-policy-'))
    const { ctx, provider } = await harness(join(root, 'employees.db'), {
      allowSensitiveMemory: false,
      maxRetentionDays: 30,
    })
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Policy analyst',
      grants: template.capabilities,
    })
    const provenance = {
      sessionId: SessionId('session-policy'),
      source: 'fixture',
      recordedAt: '2026-08-28T09:00:00.000Z',
    }

    await expect(ctx.digitalEmployees.promoteMemory({
      employeeId: createDigitalEmployeeInstanceId('missing'),
      content: 'Owned fact',
      tags: [],
      sensitive: false,
      provenance,
    })).resolves.toMatchObject({
      kind: 'rejected',
      reason: expect.stringContaining('does not exist') as unknown as string,
    })

    await expect(ctx.digitalEmployees.promoteMemory({
      employeeId: employee.id,
      content: 'Owned fact',
      tags: ['policy'],
      sensitive: false,
      retentionDays: 10,
      provenance,
    })).resolves.toMatchObject({ kind: 'accepted' })

    await expect(ctx.digitalEmployees.promoteMemory({
      employeeId: employee.id,
      content: '  owned FACT  ',
      tags: ['policy'],
      sensitive: false,
      provenance,
    })).resolves.toMatchObject({
      kind: 'rejected',
      reason: expect.stringContaining('duplicate') as unknown as string,
    })

    await expect(ctx.digitalEmployees.promoteMemory({
      employeeId: employee.id,
      content: 'Sensitive fact',
      tags: [],
      sensitive: true,
      provenance,
    })).resolves.toMatchObject({
      kind: 'rejected',
      reason: expect.stringContaining('sensitive') as unknown as string,
    })

    await expect(ctx.digitalEmployees.promoteMemory({
      employeeId: employee.id,
      content: 'Long retention',
      tags: [],
      sensitive: false,
      retentionDays: 31,
      provenance,
    })).resolves.toMatchObject({
      kind: 'rejected',
      reason: expect.stringContaining('30') as unknown as string,
    })
    await provider.close()
  })

  it('excludes expired memory and enforces ownership when deleting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-retention-'))
    const dbPath = join(root, 'employees.db')
    const { ctx, provider } = await harness(dbPath)
    const owner = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Memory owner',
      grants: template.capabilities,
    })
    const other = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Other employee',
      grants: template.capabilities,
    })
    const accepted = await ctx.digitalEmployees.promoteMemory({
      employeeId: owner.id,
      content: 'Expiring launch note.',
      tags: ['launch'],
      sensitive: false,
      provenance: {
        sessionId: SessionId('session-expiring'),
        source: 'fixture',
        recordedAt: '2026-08-28T03:00:00.000Z',
      },
    })
    if (accepted.kind !== 'accepted') throw new Error(accepted.reason)

    await expect(ctx.digitalEmployees.deleteMemory(other.id, accepted.memory.id))
      .rejects.toThrow(`does not exist for employee "${other.id}"`)
    expect(await ctx.digitalEmployees.queryMemory({
      employeeId: owner.id,
      text: 'launch',
      scopes: ['long-term'],
      limit: 10,
    })).toHaveLength(1)
    await provider.close()

    const db = new DatabaseSync(dbPath)
    db.prepare('UPDATE memories SET expires_at = ? WHERE id = ?')
      .run('2000-01-01T00:00:00.000Z', accepted.memory.id)
    db.close()

    const restored = await harness(dbPath)
    expect(await restored.ctx.digitalEmployees.queryMemory({
      employeeId: owner.id,
      text: 'launch',
      scopes: ['long-term'],
      limit: 10,
    })).toEqual([])

    await restored.ctx.digitalEmployees.deleteMemory(owner.id, accepted.memory.id)
    await restored.provider.close()
  })

  it('imports a legacy employees.json document once and renames it aside', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-legacy-'))
    const legacyPath = join(root, 'employees.json')
    await writeFile(legacyPath, `${JSON.stringify({
      schemaVersion: 1,
      instances: [{
        id: '8a50e77e-6d47-4b0a-9db1-2b0ee7e73e01',
        templateId: template.id,
        templateVersion: template.version,
        displayName: 'Legacy analyst',
        grants: { ...template.capabilities, tools: [] },
        state: 'inactive',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }],
      memories: [{
        id: '8a50e77e-6d47-4b0a-9db1-2b0ee7e73e02',
        employeeId: '8a50e77e-6d47-4b0a-9db1-2b0ee7e73e01',
        scope: 'long-term',
        content: 'Legacy launch note.',
        tags: ['legacy'],
        sensitive: false,
        provenance: {
          sessionId: 'legacy-session',
          source: 'legacy',
          recordedAt: '2026-09-01T00:00:00.000Z',
        },
      }],
      audits: [],
    }, null, 2)}\n`, 'utf8')

    const first = await harness(join(root, 'employees.db'))
    const imported = await first.ctx.digitalEmployees.list()
    expect(imported).toHaveLength(1)
    const legacy = imported[0] as DigitalEmployeeInstance
    expect(legacy).toMatchObject({ displayName: 'Legacy analyst' })
    expect(await first.ctx.digitalEmployees.queryMemory({
      employeeId: legacy.id,
      text: 'legacy',
      scopes: ['long-term'],
      limit: 5,
    })).toHaveLength(1)
    await first.provider.close()
    expect(await readFile(join(root, 'employees.json.imported'), 'utf8')).toContain('Legacy analyst')
    await expect(readFile(legacyPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })

    // A reopen sees the imported data and no legacy file remains to import.
    const second = await harness(join(root, 'employees.db'))
    expect(await second.ctx.digitalEmployees.list()).toHaveLength(1)
    await second.provider.close()
  })

  it('fails the open loudly when the legacy document cannot be trusted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-legacy-bad-'))
    const legacyPath = join(root, 'employees.json')
    await writeFile(legacyPath, '{', 'utf8')
    const provider = new SqliteDigitalEmployeeProvider(new Context(), { path: join(root, 'employees.db') })
    await expect(provider.initialize()).rejects.toThrow('cannot parse as JSON')
    await provider.close()
  })

  it('rejects databases with foreign schema ownership before any use', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-foreign-'))
    const dbPath = join(root, 'employees.db')
    const foreign = new DatabaseSync(dbPath)
    foreign.exec('CREATE TABLE unrelated (id TEXT)')
    foreign.close()

    const provider = new SqliteDigitalEmployeeProvider(new Context(), { path: dbPath })
    await expect(provider.initialize()).rejects.toThrow('unversioned schema or application identity')
    await provider.close()
  })

  it('reuses an existing database only when schema ownership still matches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-version-'))
    const dbPath = join(root, 'employees.db')
    const first = await harness(dbPath)
    await first.ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Stamped analyst',
      grants: template.capabilities,
    })
    await first.provider.close()

    const db = new DatabaseSync(dbPath)
    db.exec('PRAGMA user_version = 99')
    db.close()

    const provider = new SqliteDigitalEmployeeProvider(new Context(), { path: dbPath })
    await expect(provider.initialize()).rejects.toThrow('incompatible with this build')
    await provider.close()
  })

  it('serializes concurrent mutations so each write lands exactly once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-race-'))
    const { ctx, provider } = await harness(join(root, 'employees.db'))
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Busy analyst',
      grants: template.capabilities,
    })
    const provenance = {
      sessionId: SessionId('session-race'),
      source: 'fixture',
      recordedAt: '2026-08-28T09:00:00.000Z',
    }
    await Promise.all(Array.from({ length: 12 }, (_, index) => ctx.digitalEmployees.promoteMemory({
      employeeId: employee.id,
      content: `Raced fact ${index}.`,
      tags: [],
      sensitive: false,
      provenance,
    })))
    await expect(ctx.digitalEmployees.queryMemory({
      employeeId: employee.id,
      text: '',
      scopes: ['long-term'],
      limit: 20,
    })).resolves.toHaveLength(12)
    await provider.close()
  })

  it('serves an in-memory database for ephemeral contexts', async () => {
    const { ctx, provider } = await harness(':memory:')
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Ephemeral analyst',
      grants: template.capabilities,
    })
    expect((await ctx.digitalEmployees.get(employee.id))?.displayName).toBe('Ephemeral analyst')
    await provider.close()
  })

  it('refreshes the import archive after a manual database loss', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-sqlite-reimport-'))
    const dbPath = join(root, 'employees.db')
    const legacyPath = join(root, 'employees.json')
    await writeFile(legacyPath, `${JSON.stringify({
      schemaVersion: 1,
      instances: [{
        id: '8a50e77e-6d47-4b0a-9db1-2b0ee7e73e03',
        templateId: template.id,
        templateVersion: template.version,
        displayName: 'Reimported analyst',
        grants: template.capabilities,
        state: 'inactive',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      }],
      memories: [],
      audits: [],
    }, null, 2)}\n`, 'utf8')

    const first = await harness(dbPath)
    await first.provider.close()
    await rename(join(root, 'employees.json.imported'), legacyPath)
    // The archive exists but the database was removed by hand; reimport repopulates.
    await rm(dbPath, { force: true })
    const second = await harness(dbPath)
    expect(await second.ctx.digitalEmployees.list()).toHaveLength(1)
    await second.provider.close()
  })
})
