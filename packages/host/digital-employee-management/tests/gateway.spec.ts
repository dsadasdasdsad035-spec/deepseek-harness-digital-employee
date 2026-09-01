import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import DigitalEmployeeManagementGateway from '../src/index.ts'

const workspace = {
  id: 'workspace-1',
  path: '/workspace',
  attachSession: vi.fn(async () => {}),
}

function harness() {
  const ctx = new Context()
  const expert = { id: 'reviewer', name: 'Reviewer' }
  const digitalEmployees = {
    listTemplates: vi.fn(() => []),
    registerTemplate: vi.fn(() => vi.fn()),
    list: vi.fn(() => Promise.resolve([])),
    inspect: vi.fn((id: string) => Promise.resolve({
      id,
      templateId: 'template-1',
      templateVersion: '1.0.0',
      grants: { experts: ['reviewer'] },
    })),
    getTemplate: vi.fn(() => ({ experts: [expert] })),
    create: vi.fn((request: unknown) => Promise.resolve(request)),
    activate: vi.fn((id: string) => Promise.resolve({ id, state: 'active' })),
    deactivate: vi.fn((id: string) => Promise.resolve({ id, state: 'inactive' })),
    delete: vi.fn(() => Promise.resolve()),
    queryMemory: vi.fn(() => Promise.resolve([])),
    promoteMemory: vi.fn(() => Promise.resolve({ kind: 'rejected', reason: 'not configured' })),
    deleteMemory: vi.fn(() => Promise.resolve()),
    listAudit: vi.fn(() => Promise.resolve([])),
    previewUpgrade: vi.fn((request: unknown) => Promise.resolve(request)),
    applyUpgrade: vi.fn((request: unknown) => Promise.resolve(request)),
    exportEmployee: vi.fn((request: unknown) => Promise.resolve(request)),
    importEmployee: vi.fn((request: unknown) => Promise.resolve(request)),
  }
  const digitalEmployeeAgent = {
    createTask: vi.fn(({ sessionId }: { sessionId: string }) =>
      Promise.resolve({ agent: { id: sessionId }, dispose: vi.fn() })),
    createPreviewTask: vi.fn(({ sessionId }: { sessionId: string }) =>
      Promise.resolve({ agent: { id: sessionId }, dispose: vi.fn() })),
    listExperts: vi.fn(() => Promise.resolve([])),
    listExpertTree: vi.fn(() => Promise.resolve([])),
    followupExpert: vi.fn(() => Promise.resolve('message-1')),
    interruptExpert: vi.fn(),
  }
  const parent = { id: SessionId('parent') }
  ctx.provide('agentDefaultModel', {
    currentSelection: () => ({ provider: 'test', model: 'test-model' }),
  } as never)
  ctx.provide('agents', { get: (id: string) => id === parent.id ? parent : undefined } as never)
  ctx.provide('attachments', {} as never)
  ctx.provide('digitalEmployees', digitalEmployees as never)
  ctx.provide('digitalEmployeeAgent', digitalEmployeeAgent as never)
  ctx.provide('workspaceRegistry', {
    get: (id: string) => id === workspace.id ? workspace : undefined,
  } as never)
  ctx.provide('skills', {
    list: vi.fn(async () => [{ name: 'available-skill' }]),
  } as never)
  ctx.provide('tools', {
    get: vi.fn((name: string) => name === 'available_tool' ? {} : undefined),
    schemas: vi.fn(() => [
      { name: 'available_tool', description: 'Available tool.', parameters: { type: 'object' } },
      { name: 'mcp__server__lookup', description: 'MCP lookup.', parameters: { type: 'object' } },
    ]),
  } as never)
  ctx.provide('credentials', {
    resolve: vi.fn(async (reference: string) => reference === 'AVAILABLE_TOKEN' ? { value: 'test' } : undefined),
  } as never)
  ctx.provide('agentPresets', {
    defaultId: 'standard',
    list: vi.fn(async () => [{ id: 'headless' }, { id: 'standard' }]),
  } as never)
  return { ctx, digitalEmployees, digitalEmployeeAgent, expert, parent }
}

describe('DigitalEmployeeManagementGateway', () => {
  it('injects the registries read by the configuration asset catalog', () => {
    expect(DigitalEmployeeManagementGateway.inject).toEqual(expect.arrayContaining([
      'skills',
      'tools',
    ]))
  })

  it('keeps configuration drafts behind the local administrator gate', async () => {
    const { ctx } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    expect(() => gateway.listConfigurationDrafts()).toThrow('administrator mode is disabled')
    await ctx.fiber.dispose()
  })

  it('creates detached drafts for the local administrator', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

      const created = await gateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate work and report risks.',
      })

      expect(created).toMatchObject({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant' },
        preset: 'standard',
        revision: 1,
      })
      await expect(gateway.listConfigurationDrafts()).resolves.toEqual([created])
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('lists resolvable assets for administrator template selection', async () => {
    const { ctx } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway, { administrator: true })
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    await expect(gateway.listConfigurationAssets()).resolves.toEqual({
      entries: [
        {
          id: 'mcp:server' as never, kind: 'mcp', label: 'server', available: false,
          source: 'mcp-client', permissionSummary: [], restartRequired: false,
          diagnostic: 'This MCP client does not expose a credential-free declaration for template publication.',
        },
        {
          id: 'skill:available-skill' as never, kind: 'skill', label: 'available-skill', available: true,
          source: 'skill-registry', permissionSummary: [], restartRequired: false,
        },
        {
          id: 'tool:available_tool' as never, kind: 'tool', label: 'available_tool',
          description: 'Available tool.', available: true, source: 'tool-registry',
          permissionSummary: ['{"type":"object"}'], restartRequired: false,
        },
        {
          id: 'tool:mcp__server__lookup' as never, kind: 'tool', label: 'mcp__server__lookup',
          description: 'MCP lookup.', available: true, source: 'tool-registry',
          permissionSummary: ['{"type":"object"}'], restartRequired: false,
        },
      ],
    })
    await ctx.fiber.dispose()
  })

  it('restores administrator drafts from the configured durable store', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    const studioFile = join(directory, 'studio.json')
    try {
      const first = harness()
      await first.ctx.plugin(DigitalEmployeeManagementGateway, { administrator: true, studioFile })
      const firstGateway = first.ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      await firstGateway.createConfigurationDraft({
        templateId: 'support-assistant',
        display: { name: 'Support Assistant', description: 'Handles support requests.' },
        instructions: 'Resolve customer requests carefully.',
      })
      await first.ctx.fiber.dispose()

      const second = harness()
      await second.ctx.plugin(DigitalEmployeeManagementGateway, { administrator: true, studioFile })
      const secondGateway = second.ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      await expect(secondGateway.listConfigurationDrafts()).resolves.toHaveLength(1)
      await second.ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reports draft validation diagnostics before preview or publication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'invalid identifier',
        display: { name: 'Invalid', description: 'Checks validation.' },
        instructions: 'Validate this draft.',
      })

      await expect(gateway.validateConfigurationDraft({ draftId: draft.id })).resolves.toEqual({
        revision: 1,
        diagnostics: [expect.objectContaining({ code: 'template-id' })],
      })
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('resolves skills, tools, credentials, and MCP prerequisites before preview or publication', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate delivery work.',
        capabilities: {
          skills: ['missing-skill'],
          tools: ['missing_tool'],
          mcpServers: ['deployment'],
          experts: [],
          allowSubagents: false,
        },
        preset: 'missing-preset',
        mcpServers: [{
          id: 'deployment',
          transport: 'streamable-http',
          url: 'https://mcp.example.test',
          headers: {},
          headerCredentials: { Authorization: 'MISSING_TOKEN' },
        }],
      })

      await expect(gateway.validateConfigurationDraft({ draftId: draft.id })).resolves.toMatchObject({
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ code: 'unavailable-skill', path: 'capabilities.skills' }),
          expect.objectContaining({ code: 'unavailable-tool', path: 'capabilities.tools' }),
          expect.objectContaining({ code: 'unavailable-credential', path: 'mcpServers.deployment.headerCredentials.Authorization' }),
          expect.objectContaining({ code: 'unavailable-mcp-client', path: 'mcpServers' }),
          expect.objectContaining({ code: 'unavailable-preset', path: 'preset' }),
        ]),
      })
      await expect(gateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision }))
        .rejects.toThrow('validation diagnostics')
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('updates drafts with a revision precondition and can discard them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate work and report risks.',
      })

      await expect(gateway.updateConfigurationDraft({
        draftId: draft.id,
        revision: draft.revision,
        patch: { personality: 'Direct and practical.' },
      })).resolves.toMatchObject({ revision: 2, personality: 'Direct and practical.' })
      await expect(gateway.updateConfigurationDraft({
        draftId: draft.id,
        revision: draft.revision,
        patch: { personality: 'Stale write.' },
      })).rejects.toThrow('revision conflict')
      await expect(gateway.deleteConfigurationDraft({ draftId: draft.id })).resolves.toBeUndefined()
      await expect(gateway.listConfigurationDrafts()).resolves.toEqual([])
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('publishes a validated draft as an immediately selectable template version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx, digitalEmployees } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate work and report risks.',
      })

      await expect(gateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision }))
        .resolves.toMatchObject({ templateId: 'operations-assistant', version: '0.1.1' })
      await expect(gateway.listConfigurationPublications()).resolves.toEqual([
        expect.objectContaining({ draftId: draft.id, version: '0.1.1' }),
      ])
      expect(digitalEmployees.registerTemplate).toHaveBeenCalledWith(expect.objectContaining({
        id: 'operations-assistant',
        version: '0.1.1',
        instructions: expect.objectContaining({ path: 'AGENTS.md' }),
      }))
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('materializes authored expert instructions into the immutable published version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx, digitalEmployees } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate work and report risks.',
        capabilities: {
          skills: [],
          tools: [],
          mcpServers: [],
          experts: ['risk-reviewer'],
          allowSubagents: false,
        },
        experts: [{
          id: 'risk-reviewer',
          name: 'Risk reviewer',
          responsibility: 'Find delivery risks.',
          instructions: 'Inspect assumptions and report material risks.',
          modelSettings: {},
          capabilities: {
            skills: [],
            tools: [],
            mcpServers: [],
            experts: [],
            allowSubagents: false,
          },
          memoryAccess: ['long-term'],
          delegation: { mode: 'one-shot', maxDepth: 0, maxConcurrency: 1, timeoutMs: 30_000 },
        }],
      })

      await gateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision })

      expect(digitalEmployees.registerTemplate).toHaveBeenCalledWith(expect.objectContaining({
        experts: [expect.objectContaining({
          id: 'risk-reviewer',
          instructions: expect.objectContaining({ path: 'experts/risk-reviewer/AGENTS.md' }),
        })],
      }))
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('writes local publication memory seeds when creating an employee', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx, digitalEmployees } = harness()
      digitalEmployees.create.mockResolvedValue({
        id: 'employee-1',
        templateId: 'operations-assistant',
        templateVersion: '0.1.1',
      })
      digitalEmployees.promoteMemory = vi.fn(() => Promise.resolve({
        kind: 'accepted',
        memory: { id: 'memory-1', employeeId: 'employee-1', scope: 'long-term', content: 'Atlas', tags: [] },
      })) as never
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate work and report risks.',
        memorySeeds: [{ content: 'Atlas project facts are durable working context.', tags: ['atlas'], sensitive: false }],
      })
      await gateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision })

      await gateway.create({
        templateId: 'operations-assistant' as never,
        templateVersion: '0.1.1',
        displayName: 'Atlas PM',
        grants: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
      })

      expect(digitalEmployees.promoteMemory).toHaveBeenCalledWith(expect.objectContaining({
        employeeId: 'employee-1',
        content: 'Atlas project facts are durable working context.',
        provenance: expect.objectContaining({ source: 'configuration-seed' }),
      }))
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('restores the published draft snapshot after later draft edits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    const studioFile = join(directory, 'studio.json')
    try {
      const first = harness()
      await first.ctx.plugin(DigitalEmployeeManagementGateway, { administrator: true, studioFile })
      const firstGateway = first.ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await firstGateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate delivery work.',
      })
      await firstGateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision })
      await firstGateway.updateConfigurationDraft({
        draftId: draft.id, revision: draft.revision, patch: { personality: 'Edited after publishing.' },
      })
      await first.ctx.fiber.dispose()

      const second = harness()
      await second.ctx.plugin(DigitalEmployeeManagementGateway, { administrator: true, studioFile })
      const secondGateway = second.ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      await secondGateway.listTemplates()
      expect(second.digitalEmployees.registerTemplate).toHaveBeenCalledWith(expect.objectContaining({
        version: '0.1.1',
        personality: 'Helpful, careful, and concise.',
      }))
      await second.ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not allocate a published version when template registration rejects the draft', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx, digitalEmployees } = harness()
      digitalEmployees.registerTemplate.mockImplementationOnce(() => {
        throw new Error('unavailable preset')
      })
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate delivery work.',
      })

      await expect(gateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision }))
        .rejects.toThrow('unavailable preset')
      await expect(gateway.listConfigurationPublications()).resolves.toEqual([])
      await expect(gateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision }))
        .resolves.toMatchObject({ version: '0.1.1' })
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('starts and disposes an isolated preview for a validated current draft', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx, digitalEmployeeAgent } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate delivery work.',
      })

      const preview = await gateway.previewConfigurationDraft({
        draftId: draft.id,
        revision: draft.revision,
        workspaceId: workspace.id as never,
      })

      expect(preview).toMatchObject({
        draftId: draft.id,
        revision: draft.revision,
        state: 'active',
      })
      expect(digitalEmployeeAgent.createPreviewTask).toHaveBeenCalledWith(expect.objectContaining({
        workspacePath: workspace.path,
        employee: expect.objectContaining({
          template: expect.objectContaining({
            id: draft.templateId,
            version: `preview-${draft.revision}`,
          }),
        }),
      }))
      await expect(gateway.disposeConfigurationPreview({ previewId: preview.id })).resolves.toBeUndefined()
      expect(digitalEmployeeAgent.createPreviewTask.mock.results[0]?.value).resolves.toMatchObject({
        dispose: expect.any(Function),
      })
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('publishes a single non-conflicting management namespace', async () => {
    const { ctx } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'digitalEmployeeManagement',
      namespace: 'digitalEmployees',
    })
    expect(remoteMethods(gateway).map(method => method.method)).toEqual([
      'listConfigurationDrafts', 'listConfigurationAssets', 'listConfigurationPublications', 'createConfigurationDraft', 'updateConfigurationDraft', 'deleteConfigurationDraft', 'validateConfigurationDraft', 'previewConfigurationDraft', 'disposeConfigurationPreview', 'publishConfigurationDraft', 'listTemplates', 'list', 'get', 'create', 'activate', 'deactivate',
      'delete', 'startChat', 'listMemory', 'deleteMemory', 'listExperts',
      'taskTree', 'continueExpert', 'interruptExpert', 'listAudit',
      'previewUpgrade', 'applyUpgrade', 'exportEmployee', 'importEmployee',
    ])
    await ctx.fiber.dispose()
  })

  it('routes lifecycle, task, memory, expert, upgrade, and portability operations', async () => {
    const { ctx, digitalEmployees, digitalEmployeeAgent, expert, parent } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    await gateway.activate({ employeeId: 'employee-1' as never })
    await gateway.listMemory({
      employeeId: 'employee-1' as never,
      text: 'release',
      scopes: ['long-term'],
      limit: 5,
    })
    await expect(gateway.listExperts({ employeeId: 'employee-1' as never }))
      .resolves.toEqual([expert])
    await gateway.continueExpert({
      parentSessionId: parent.id,
      childSessionId: SessionId('child'),
      content: [{ type: 'text', text: 'Continue.' }],
    })
    gateway.interruptExpert({
      parentSessionId: parent.id,
      childSessionId: SessionId('child'),
    })

    expect(digitalEmployees.activate).toHaveBeenCalledWith('employee-1')
    expect(digitalEmployees.queryMemory).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'employee-1',
      text: 'release',
    }))
    expect(digitalEmployees.getTemplate).toHaveBeenCalledWith('template-1', '1.0.0')
    expect(digitalEmployeeAgent.listExperts).not.toHaveBeenCalled()
    expect(digitalEmployeeAgent.followupExpert).toHaveBeenCalledWith(
      parent,
      'child',
      [{ type: 'text', text: 'Continue.' }],
      expect.objectContaining({ source: { kind: 'user' } }),
    )
    expect(digitalEmployeeAgent.interruptExpert).toHaveBeenCalledWith('child', {
      kind: 'user',
      parentSessionId: 'parent',
    })
    await ctx.fiber.dispose()
  })

  it('rejects expert control when the declared parent Agent is not live', async () => {
    const { ctx } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    expect(() => gateway.continueExpert({
      parentSessionId: SessionId('missing'),
      childSessionId: SessionId('child'),
      content: [{ type: 'text', text: 'Continue.' }],
    })).toThrow('parent Agent "missing" is not live')
    await ctx.fiber.dispose()
  })
})
