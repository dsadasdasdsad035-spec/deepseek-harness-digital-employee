import { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, expectTypeOf, it } from 'vitest'
import DigitalEmployees, {
  createDigitalEmployeeAuditId,
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeMemoryId,
  createDigitalEmployeeOperationId,
  createDigitalEmployeeTaskId,
  createDigitalEmployeeTemplateId,
  createExpertId,
  DigitalEmployeeTemplateSchema,
  assertLifecycleTransition,
  type DigitalEmployeeInstanceId,
  type DigitalEmployeeLongTermMemoryRecord,
  type DigitalEmployeeSessionMemoryRecord,
  type DigitalEmployeeTaskMemoryRecord,
  type DigitalEmployeeTemplate,
  type DigitalEmployeeTemplateId,
} from '@deepseek-ai/dsh-digital-employee'

const template = {
  id: createDigitalEmployeeTemplateId('research-assistant'),
  version: '1.0.0',
  display: {
    name: 'Research Assistant',
    description: 'Researches bounded questions.',
  },
  personality: 'Careful and concise.',
  instructions: {
    kind: 'file',
    root: import.meta.dirname,
    path: 'AGENTS.md',
    revision: 'sha256:instructions-v1',
  },
  preset: 'headless',
  mcpServers: [{
    id: 'github',
    transport: 'streamable-http',
    url: 'https://mcp.example.test',
    headers: {},
    headerCredentials: { Authorization: credentialRef('GITHUB_TOKEN') },
  }],
  capabilities: {
    skills: ['web-research'],
    tools: ['web_search'],
    mcpServers: ['github'],
    experts: [createExpertId('critic')],
    allowSubagents: true,
  },
  experts: [{
    id: createExpertId('critic'),
    name: 'Critic',
    responsibility: 'Review evidence.',
    instructions: {
      kind: 'file',
      root: import.meta.dirname,
      path: 'experts/critic/AGENTS.md',
      revision: 'sha256:critic-v1',
    },
    modelSettings: {
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      maxTokens: 4_096,
    },
    capabilities: {
      skills: [],
      tools: [],
      mcpServers: [],
      experts: [],
      allowSubagents: false,
    },
    memoryAccess: ['session'],
    delegation: {
      mode: 'one-shot',
      maxDepth: 0,
      maxConcurrency: 1,
      timeoutMs: 30_000,
    },
  }],
  delegation: {
    maxDepth: 2,
    maxConcurrency: 3,
    timeoutMs: 60_000,
  },
} satisfies DigitalEmployeeTemplate

describe('digital employee contracts', () => {
  it('constructs distinct branded identifiers without changing wire values', () => {
    expect(createDigitalEmployeeTemplateId('research-assistant')).toBe('research-assistant')
    expect(createDigitalEmployeeInstanceId('employee-1')).toBe('employee-1')
    expect(createDigitalEmployeeMemoryId('memory-1')).toBe('memory-1')
    expect(createExpertId('critic')).toBe('critic')
    expect(createDigitalEmployeeAuditId('audit-1')).toBe('audit-1')
    expect(createDigitalEmployeeOperationId('operation-1')).toBe('operation-1')
    expect(createDigitalEmployeeTaskId('task-1')).toBe('task-1')
    expectTypeOf<DigitalEmployeeTemplateId>().not.toEqualTypeOf<DigitalEmployeeInstanceId>()
  })

  it('defines distinct task, Session, and long-term memory records', () => {
    expectTypeOf<DigitalEmployeeTaskMemoryRecord['scope']>().toEqualTypeOf<'task'>()
    expectTypeOf<DigitalEmployeeSessionMemoryRecord['scope']>().toEqualTypeOf<'session'>()
    expectTypeOf<DigitalEmployeeLongTermMemoryRecord['scope']>().toEqualTypeOf<'long-term'>()
    expectTypeOf<DigitalEmployeeTaskMemoryRecord>().toHaveProperty('taskId')
    expectTypeOf<DigitalEmployeeSessionMemoryRecord>().toHaveProperty('sessionId')
    expectTypeOf<DigitalEmployeeLongTermMemoryRecord>().toHaveProperty('expiresAt')
  })

  it('restores the exact model-visible memory projection from Session events', () => {
    const session = Session.create(SessionId('employee-memory-session'))
    session.append('digital-employee/memory-projection', {
      memories: [{
        id: createDigitalEmployeeMemoryId('memory-restore'),
        scope: 'long-term',
        content: 'Keep the rollback procedure visible.',
        provenance: {
          sessionId: SessionId('source-session'),
          source: 'accepted-candidate',
          recordedAt: '2026-08-28T02:00:00.000Z',
        },
      }],
    })

    const restored = Session.fromRestore(
      session.id,
      structuredClone(session.events),
      structuredClone(session.header),
    )

    expect(restored.events[0]).toMatchObject({
      type: 'digital-employee/memory-projection',
      data: {
        memories: [{
          id: 'memory-restore',
          content: 'Keep the rollback procedure visible.',
          provenance: { sessionId: 'source-session' },
        }],
      },
    })
  })

  it('restores expert delegation, result, denial, and memory decisions from Session events', () => {
    const session = Session.create(SessionId('employee-expert-session'))
    const employeeId = createDigitalEmployeeInstanceId('employee-1')
    const expertId = createExpertId('critic')
    const childSessionId = SessionId('expert-child')
    const authority = {
      skills: [],
      tools: ['read'],
      mcpServers: [],
      experts: [],
      allowSubagents: false,
    }
    const delegation = {
      maxDepth: 1,
      maxConcurrency: 1,
      timeoutMs: 10_000,
    }
    session.append('digital-employee/expert-delegation', {
      employeeId,
      expertId,
      childSessionId,
      mode: 'one-shot',
      provider: 'spawn',
      label: 'Critic',
      instructionRevision: 'critic-v1',
      prompt: [{ type: 'text', text: 'Review the evidence.' }],
      authority,
      delegation,
    })
    session.append('digital-employee/expert-result', {
      employeeId,
      expertId,
      childSessionId,
      output: [{ type: 'text', text: 'The evidence is sufficient.' }],
      stopReason: 'completed',
    })
    session.append('digital-employee/expert-authorization-denied', {
      employeeId,
      expertId: createExpertId('unapproved'),
      reason: 'parent Agent does not authorize expert "unapproved"',
    })
    session.append('digital-employee/memory-decision', {
      employeeId,
      candidate: {
        employeeId,
        content: 'Require primary evidence.',
        tags: ['review'],
        sensitive: false,
        retentionDays: 30,
        provenance: {
          sessionId: session.id,
          expertId,
          source: 'expert-candidate',
          recordedAt: '2026-08-28T10:00:00.000Z',
        },
      },
      decision: {
        kind: 'accepted',
        memoryId: createDigitalEmployeeMemoryId('memory-review'),
      },
    })

    const restored = Session.fromRestore(
      session.id,
      structuredClone(session.events),
      structuredClone(session.header),
    )

    expect(restored.events.slice(0, session.events.length).map(event => [event.type, event.data])).toEqual(
      session.events.map(event => [event.type, event.data]),
    )
    expect(restored.events.at(-1)?.type).toBe('session/end-seed')
  })

  it('validates complete templates and rejects malformed or inconsistent experts', () => {
    expect(DigitalEmployeeTemplateSchema(template)).toEqual(template)
    expect(DigitalEmployeeTemplateSchema({
      ...template,
      memorySeeds: [{
        content: 'Keep rollback ownership explicit.',
        tags: ['delivery'],
        sensitive: false,
        provenance: { source: 'fixture-seed', recordedAt: '2026-08-31T00:00:00.000Z' },
      }],
    })).toMatchObject({ memorySeeds: [expect.objectContaining({ sensitive: false })] })
    expect(() => DigitalEmployeeTemplateSchema({
      ...template,
      memorySeeds: [{
        content: 'Never store this.',
        tags: [],
        sensitive: true,
        provenance: { source: 'fixture-seed', recordedAt: '2026-08-31T00:00:00.000Z' },
      }],
    })).toThrow('sensitive must be false')
    expect(() => DigitalEmployeeTemplateSchema({ ...template, version: '' })).toThrow('version')
    expect(() => DigitalEmployeeTemplateSchema({
      ...template,
      capabilities: { ...template.capabilities, experts: [createExpertId('missing')] },
    })).toThrow('missing')
    expect(() => DigitalEmployeeTemplateSchema({
      ...template,
      experts: [...template.experts, template.experts[0]],
    })).toThrow('duplicate')
    expect(() => DigitalEmployeeTemplateSchema({
      ...template,
      capabilities: { ...template.capabilities, mcpServers: ['missing'] },
    })).toThrow('missing MCP server')
  })

  it('registers exact template versions and removes them with their owning effect', async () => {
    const ctx = new Context()
    await ctx.plugin(DigitalEmployees)
    const dispose = ctx.digitalEmployees.registerTemplate(template)

    expect(ctx.digitalEmployees.getTemplate(template.id, template.version)).toEqual(template)
    expect(ctx.digitalEmployees.listTemplates()).toEqual([template])
    expect(() => ctx.digitalEmployees.registerTemplate(template)).toThrow('already registered')

    dispose()
    expect(ctx.digitalEmployees.getTemplate(template.id, template.version)).toBeUndefined()
  })

  it('runs effect-owned reference validators before publishing a template', async () => {
    const ctx = new Context()
    await ctx.plugin(DigitalEmployees)
    const dispose = ctx.digitalEmployees.registerTemplateReferenceValidator((candidate) => {
      if (candidate.preset === 'missing') throw new Error(`missing preset "${candidate.preset}"`)
    })

    expect(() => ctx.digitalEmployees.registerTemplate({ ...template, preset: 'missing' })).toThrow('missing preset')
    expect(ctx.digitalEmployees.listTemplates()).toEqual([])

    dispose()
    expect(() => ctx.digitalEmployees.registerTemplate({ ...template, preset: 'missing' })).not.toThrow()
  })

  it('rejects lifecycle transitions that skip required states', () => {
    expect(() => { assertLifecycleTransition('inactive', 'active') }).not.toThrow()
    expect(() => { assertLifecycleTransition('active', 'inactive') }).not.toThrow()
    expect(() => { assertLifecycleTransition('inactive', 'deleting') }).not.toThrow()
    expect(() => { assertLifecycleTransition('active', 'deleted') }).toThrow('active')
    expect(() => { assertLifecycleTransition('deleted', 'active') }).toThrow('deleted')
  })
})
