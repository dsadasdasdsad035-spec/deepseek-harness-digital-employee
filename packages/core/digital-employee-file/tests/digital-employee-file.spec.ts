import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import DigitalEmployees, {
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeTemplateId,
  createExpertId,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { FileDigitalEmployeeProvider } from '@deepseek-ai/dsh-digital-employee-file'

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
  path: string,
  policy: { allowSensitiveMemory?: boolean; maxRetentionDays?: number } = {},
): Promise<{ ctx: Context; provider: FileDigitalEmployeeProvider }> {
  const ctx = new Context()
  await ctx.plugin(DigitalEmployees)
  ctx.digitalEmployees.registerTemplate(template)
  ctx.digitalEmployees.registerTemplate(upgradedTemplate)
  const provider = new FileDigitalEmployeeProvider(ctx, { path, ...policy })
  await provider.initialize()
  ctx.digitalEmployees.configureProvider(provider)
  return { ctx, provider }
}

describe('FileDigitalEmployeeProvider', () => {
  it('persists independent instances and restores them from schema version 1', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-'))
    const path = join(root, 'employees.json')
    const first = await harness(path)
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

    const second = await harness(path)
    expect(await second.ctx.digitalEmployees.list()).toEqual([
      expect.objectContaining({ id: alpha.id, displayName: 'Alpha', state: 'active' }),
      expect.objectContaining({ id: beta.id, displayName: 'Beta', state: 'inactive' }),
    ])
    expect((await second.ctx.digitalEmployees.get(beta.id))?.grants.tools).toEqual([])
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ schemaVersion: 1 })
  })

  it('persists attributable audit records and rejects credential-shaped metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-audit-'))
    const path = join(root, 'employees.json')
    const { ctx } = await harness(path)
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
    expect(await readFile(path, 'utf8')).not.toContain('do-not-store')
  })

  it('rejects corrupted and unknown stored formats during initialization', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-invalid-'))
    const malformed = join(root, 'malformed.json')
    await writeFile(malformed, '{', 'utf8')
    await expect(harness(malformed)).rejects.toThrow('cannot parse')

    const unknown = join(root, 'unknown.json')
    await writeFile(unknown, JSON.stringify({ schemaVersion: 2, instances: [], memories: [], audits: [] }), 'utf8')
    await expect(harness(unknown)).rejects.toThrow('schema version 2')
  })

  it('resolves only active instances against their exact template version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-resolve-'))
    const { ctx } = await harness(join(root, 'employees.json'))
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
  })

  it('fails resolution when the exact template version leaves the registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-template-'))
    const ctx = new Context()
    await ctx.plugin(DigitalEmployees)
    const disposeTemplate = ctx.digitalEmployees.registerTemplate(template)
    const provider = new FileDigitalEmployeeProvider(ctx, { path: join(root, 'employees.json') })
    await provider.initialize()
    ctx.digitalEmployees.configureProvider(provider)
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Pinned analyst',
      grants: template.capabilities,
    })
    await ctx.digitalEmployees.transition(employee.id, 'active')
    disposeTemplate()

    await expect(ctx.digitalEmployees.resolve(employee.id)).rejects.toThrow('unavailable template')
  })

  it('provides typed lifecycle operations and removes employee-owned data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-delete-'))
    const { ctx } = await harness(join(root, 'employees.json'))
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Disposable analyst',
      grants: template.capabilities,
    })

    expect(await ctx.digitalEmployees.inspect(employee.id)).toEqual(employee)
    expect((await ctx.digitalEmployees.activate(employee.id)).state).toBe('active')
    expect((await ctx.digitalEmployees.deactivate(employee.id)).state).toBe('inactive')
    await ctx.digitalEmployees.delete(employee.id)
    expect(await ctx.digitalEmployees.get(employee.id)).toBeUndefined()
  })

  it('previews upgrades and grants newly declared capabilities only after explicit approval', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-upgrade-'))
    const { ctx } = await harness(join(root, 'employees.json'))
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
  })

  it('leaves the employee unchanged when upgrade validation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-upgrade-failure-'))
    const { ctx } = await harness(join(root, 'employees.json'))
    const employee = await ctx.digitalEmployees.create({
      templateId: template.id,
      templateVersion: template.version,
      displayName: 'Pinned analyst',
      grants: template.capabilities,
    })

    await expect(ctx.digitalEmployees.applyUpgrade({
      employeeId: employee.id,
      targetVersion: '9.9.9',
      approvedCapabilities: template.capabilities,
    })).rejects.toThrow('is not registered')
    expect(await ctx.digitalEmployees.inspect(employee.id)).toEqual(employee)
  })

  it('exports and imports a redacted inactive employee with fresh durable ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-portable-'))
    const { ctx } = await harness(join(root, 'employees.json'))
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
  })

  it('rejects malformed imports without creating an employee', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-import-invalid-'))
    const { ctx } = await harness(join(root, 'employees.json'))

    await expect(ctx.digitalEmployees.importEmployee({
      formatVersion: 1,
      employee: {
        templateId: template.id,
        templateVersion: 'missing',
        displayName: 'Invalid import',
        grants: template.capabilities,
      },
      memories: [],
    })).rejects.toThrow()
    expect(await ctx.digitalEmployees.list()).toEqual([])
  })

  it('retrieves bounded employee-owned long-term memory with deterministic metadata ranking', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-memory-'))
    const { ctx } = await harness(join(root, 'employees.json'))
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
    const contentMatch = await ctx.digitalEmployees.promoteMemory({
      employeeId: first.id,
      content: 'The launch checklist is ready.',
      tags: ['operations'],
      sensitive: false,
      provenance: {
        sessionId: SessionId('session-content'),
        source: 'fixture',
        recordedAt: '2026-08-27T10:00:00.000Z',
      },
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

    expect(contentMatch.kind).toBe('accepted')
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
    })).resolves.toHaveLength(2)
  })

  it('returns explicit promotion decisions for ownership, duplicates, sensitivity, and retention', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-policy-'))
    const { ctx } = await harness(join(root, 'employees.json'), {
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
  })

  it('excludes expired memory and enforces ownership when deleting', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-retention-'))
    const path = join(root, 'employees.json')
    const { ctx } = await harness(path)
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

    const stored = JSON.parse(await readFile(path, 'utf8')) as {
      memories: Array<Record<string, unknown>>
    }
    stored.memories[0] = { ...stored.memories[0], expiresAt: '2000-01-01T00:00:00.000Z' }
    await writeFile(path, `${JSON.stringify(stored, null, 2)}\n`, 'utf8')
    const restored = await harness(path)
    expect(await restored.ctx.digitalEmployees.queryMemory({
      employeeId: owner.id,
      text: 'launch',
      scopes: ['long-term'],
      limit: 10,
    })).toEqual([])

    await restored.ctx.digitalEmployees.deleteMemory(owner.id, accepted.memory.id)
    expect(await restored.ctx.digitalEmployees.queryMemory({
      employeeId: owner.id,
      text: 'launch',
      scopes: ['long-term'],
      limit: 10,
    })).toEqual([])
  })
})
