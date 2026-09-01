import { Context } from '@deepseek-ai/cordis'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DigitalEmployeeManagementGateway from '../src/index.ts'
import { ConfigurationStudioStore } from '../src/configuration-studio.ts'

const workspace = {
  id: 'workspace-1',
  path: '/workspace',
  attachSession: vi.fn(async () => {}),
}

let studioDirectory: string

beforeEach(async () => {
  studioDirectory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-test-'))
})

afterEach(async () => {
  await rm(studioDirectory, { recursive: true, force: true })
})

function administratorConfig() {
  return {
    administrator: true,
    studioFile: join(studioDirectory, 'studio.json'),
  }
}

function studioConfig() {
  return { studioFile: join(studioDirectory, 'studio.json') }
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
  const skills = {
    list: vi.fn(async (options?: { scope?: { agentPreset?: string } }) => {
      if (options?.scope?.agentPreset === 'standard') {
        return [
          { name: 'available-skill' },
          { name: 'market-active', description: 'Runtime description.' },
        ]
      }
      if (options?.scope?.agentPreset === 'unloadable') {
        return [{ name: 'unloadable-skill', description: 'Metadata without a loadable body.' }]
      }
      if (options?.scope?.agentPreset === 'restricted') return [{ name: 'restricted-skill' }]
      return [{ name: 'host-global-skill' }]
    }),
    get: vi.fn(async (name: string) => name === 'unloadable-skill'
      ? undefined
      : { name, content: `${name} instructions` }),
  }
  ctx.provide('skills', skills as never)
  ctx.provide('skillMarket', {
    list: vi.fn(async () => ({
      ok: true,
      value: {
        entries: [
          {
            skillId: 'market-inactive',
            description: 'Installed but waiting for activation.',
            version: '2.0.0',
            author: 'Market Author',
            tags: ['planning', 'managed'],
            installedAt: 2,
            hasBanner: true,
            installPath: '/private/user/skills/market-inactive',
            archiveFilename: 'market-inactive.zip',
          },
          {
            skillId: 'market-active',
            description: 'Marketplace description.',
            version: '1.2.3',
            author: 'Market Author',
            tags: ['managed', 'active'],
            installedAt: 1,
            hasBanner: false,
            installPath: '/private/user/skills/market-active',
            archiveFilename: 'market-active.zip',
          },
        ],
      },
    })),
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
  const agentPresets = {
    defaultId: 'standard',
    list: vi.fn(async () => [{ id: 'restricted' }, { id: 'standard' }, { id: 'unloadable' }]),
    standingKeyFor: vi.fn(async (preset?: string) => {
      if (preset === 'broken') throw new Error(`/private/presets/${preset}/agent.cordis.yml failed to mount`)
      if (preset !== 'standard' && preset !== 'restricted' && preset !== 'unloadable') {
        throw new Error(`unknown preset: ${preset}`)
      }
      return { agentPreset: preset }
    }),
  }
  ctx.provide('agentPresets', agentPresets as never)
  return { ctx, agentPresets, digitalEmployees, digitalEmployeeAgent, expert, parent, skills }
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
    await ctx.plugin(DigitalEmployeeManagementGateway, studioConfig())
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
    await ctx.plugin(DigitalEmployeeManagementGateway, administratorConfig())
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    await expect(gateway.listConfigurationAssets({ preset: 'standard' })).resolves.toEqual({
      entries: [
        {
          id: 'mcp:server' as never, kind: 'mcp', label: 'server', available: false,
          source: 'mcp-client', permissionSummary: [], restartRequired: false,
          diagnostic: 'This MCP client does not expose a credential-free declaration for template publication.',
        },
        {
          id: 'skill:available-skill' as never, kind: 'skill', label: 'available-skill', available: true,
          source: 'skill-registry', managedByMarket: false, permissionSummary: [], restartRequired: false,
        },
        {
          id: 'skill:market-active' as never, kind: 'skill', label: 'market-active',
          description: 'Marketplace description.', available: true,
          source: 'skill-market', version: '1.2.3', publisher: 'Market Author',
          tags: ['managed', 'active'], managedByMarket: true,
          permissionSummary: [], restartRequired: false,
        },
        {
          id: 'skill:market-inactive' as never, kind: 'skill', label: 'market-inactive',
          description: 'Installed but waiting for activation.', available: false,
          source: 'skill-market', version: '2.0.0', publisher: 'Market Author',
          tags: ['planning', 'managed'], managedByMarket: true,
          permissionSummary: [], restartRequired: true,
          diagnostic: 'Agent preset "standard" does not expose this installed Skill.',
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
    const result = await gateway.listConfigurationAssets({ preset: 'standard' })
    expect(result.entries.filter(entry => entry.label === 'market-active')).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('/private/user/skills')
    expect(JSON.stringify(result)).not.toContain('.zip')
    await ctx.fiber.dispose()
  })

  it('correlates installed marketplace examples with their active runtime capabilities', async () => {
    const { ctx } = harness()
    ctx.provide('toolMarket', {
      list: vi.fn(async () => ({
        ok: true,
        value: {
          entries: [{
            packageId: 'marketplace-test-tool',
            version: '1.0.0',
            publisherId: 'deepseek-marketplace-test',
            permissions: [],
            restartRequired: false,
            tools: [{
              name: 'available_tool',
              description: 'Available tool.',
              inputDescription: '{"text":"string"}',
            }],
          }],
        },
      })),
    } as never)
    ctx.provide('mcpMarket', {
      templateConfigurations: vi.fn(async () => [{
        packageId: 'marketplace-test-mcp',
        version: '1.0.0',
        publisherId: 'deepseek-marketplace-test',
        serverName: 'server',
        description: 'Marketplace MCP fixture.',
        available: true,
        restartRequired: false,
        declaration: {
          transport: 'streamable-http',
          url: 'http://127.0.0.1:43210/mcp',
          headerCredentials: { Authorization: 'MARKETPLACE_TEST_MCP_TOKEN' },
        },
      }]),
    } as never)
    await ctx.plugin(DigitalEmployeeManagementGateway, administratorConfig())
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    const catalog = await gateway.listConfigurationAssets({ preset: 'standard' })

    expect(catalog.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'skill:market-active',
        source: 'skill-market',
        version: '1.2.3',
        publisher: 'Market Author',
        available: true,
        restartRequired: false,
      }),
      expect.objectContaining({
        id: 'tool:available_tool',
        source: 'tool-market:marketplace-test-tool',
        version: '1.0.0',
        publisher: 'deepseek-marketplace-test',
        available: true,
        restartRequired: false,
      }),
      expect.objectContaining({
        id: 'mcp:server',
        source: 'mcp-market:marketplace-test-mcp',
        version: '1.0.0',
        publisher: 'deepseek-marketplace-test',
        available: true,
        restartRequired: false,
      }),
    ]))
    await ctx.fiber.dispose()
  })

  it('scopes configuration Skill assets to the requested Agent preset without Host-global fallback', async () => {
    const { agentPresets, ctx, skills } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway, administratorConfig())
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    const standard = await gateway.listConfigurationAssets({ preset: 'standard' })
    const restricted = await gateway.listConfigurationAssets({ preset: 'restricted' })

    expect(standard.entries.filter(entry => entry.kind === 'skill' && entry.available).map(entry => entry.label))
      .toEqual(['available-skill', 'market-active'])
    expect(restricted.entries.filter(entry => entry.kind === 'skill' && entry.available).map(entry => entry.label))
      .toEqual(['restricted-skill'])
    expect(standard.entries.some(entry => entry.label === 'restricted-skill')).toBe(false)
    expect(restricted.entries.some(entry => entry.label === 'available-skill')).toBe(false)
    expect([...standard.entries, ...restricted.entries].some(entry => entry.label === 'host-global-skill')).toBe(false)
    expect(agentPresets.standingKeyFor).toHaveBeenNthCalledWith(1, 'standard')
    expect(agentPresets.standingKeyFor).toHaveBeenNthCalledWith(2, 'restricted')
    expect(skills.list).toHaveBeenNthCalledWith(1, { scope: { agentPreset: 'standard' } })
    expect(skills.list).toHaveBeenNthCalledWith(2, { scope: { agentPreset: 'restricted' } })
    await ctx.fiber.dispose()
  })

  it('reports a client-safe preset failure and does not inspect Host-global Skills', async () => {
    const { ctx, skills } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway, administratorConfig())
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    await expect(gateway.listConfigurationAssets({ preset: 'broken' }))
      .rejects.toThrow('Agent preset "broken"')
    expect(skills.list).not.toHaveBeenCalled()
    await ctx.fiber.dispose()
  })

  it('uses the preset standing lifecycle for concurrent asset reads without creating task runtime', async () => {
    const { agentPresets, ctx, digitalEmployeeAgent } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway, administratorConfig())
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    const [first, second] = await Promise.all([
      gateway.listConfigurationAssets({ preset: 'standard' }),
      gateway.listConfigurationAssets({ preset: 'standard' }),
    ])

    expect(first).toEqual(second)
    expect(agentPresets.standingKeyFor).toHaveBeenCalledTimes(2)
    expect(digitalEmployeeAgent.createTask).not.toHaveBeenCalled()
    expect(digitalEmployeeAgent.createPreviewTask).not.toHaveBeenCalled()
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

  it.each([
    {
      name: 'installed but inactive',
      templateId: 'inactive-marketplace-skill',
      preset: 'standard',
      skill: 'market-inactive',
    },
    {
      name: 'uninstalled',
      templateId: 'uninstalled-marketplace-skill',
      preset: 'standard',
      skill: 'marketplace-test-skill-uninstalled',
    },
    {
      name: 'outside the selected preset',
      templateId: 'preset-scoped-marketplace-skill',
      preset: 'restricted',
      skill: 'market-active',
    },
  ])('rejects publication when a marketplace example is $name', async ({ templateId, preset, skill }) => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId,
        display: { name: templateId, description: 'Checks marketplace availability.' },
        instructions: 'Use only available marketplace capabilities.',
        preset,
        capabilities: {
          skills: [skill],
          tools: [],
          mcpServers: [],
          experts: [],
          allowSubagents: false,
        },
      })

      await expect(gateway.validateConfigurationDraft({ draftId: draft.id })).resolves.toMatchObject({
        diagnostics: [expect.objectContaining({
          code: 'unavailable-skill',
          path: 'capabilities.skills',
          message: `Skill "${skill}" is not available in this installation.`,
        })],
      })
      await expect(gateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision }))
        .rejects.toThrow('validation diagnostics')
      await ctx.fiber.dispose()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a Skill whose preset metadata cannot load its instructions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx } = harness()
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'unloadable-skill-employee',
        display: { name: 'Unloadable Skill', description: 'Checks Skill loading.' },
        instructions: 'Use the configured Skill.',
        capabilities: {
          skills: ['unloadable-skill'],
          tools: [],
          mcpServers: [],
          experts: [],
          allowSubagents: false,
        },
        preset: 'unloadable',
      })

      await expect(gateway.validateConfigurationDraft({ draftId: draft.id })).resolves.toMatchObject({
        diagnostics: [{
          code: 'unloadable-skill',
          path: 'capabilities.skills',
          message: 'Skill "unloadable-skill" is listed by Agent preset "unloadable" but its instructions cannot be loaded.',
        }],
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

  it('publishes and activates an employee with the three active marketplace examples', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx, digitalEmployees } = harness()
      ctx.provide('mcpClients', {} as never)
      digitalEmployees.create.mockResolvedValue({
        id: 'marketplace-employee',
        templateId: 'marketplace-reference',
        templateVersion: '0.1.1',
        displayName: 'Marketplace Reference',
        state: 'inactive',
        grants: {
          skills: ['market-active'],
          tools: ['available_tool'],
          mcpServers: ['server'],
          experts: [],
          allowSubagents: false,
        },
      })
      await ctx.plugin(DigitalEmployeeManagementGateway, {
        administrator: true,
        studioFile: join(directory, 'studio.json'),
      })
      const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
      const draft = await gateway.createConfigurationDraft({
        templateId: 'marketplace-reference',
        display: { name: 'Marketplace Reference', description: 'Exercises installed marketplace capabilities.' },
        instructions: 'Use the selected marketplace capabilities.',
        capabilities: {
          skills: ['market-active'],
          tools: ['available_tool'],
          mcpServers: ['server'],
          experts: [],
          allowSubagents: false,
        },
        mcpServers: [{
          id: 'server',
          transport: 'streamable-http',
          url: 'http://127.0.0.1:43210/mcp',
          headers: {},
          headerCredentials: { Authorization: 'AVAILABLE_TOKEN' },
        }],
      })

      await expect(gateway.validateConfigurationDraft({ draftId: draft.id }))
        .resolves.toEqual({ revision: draft.revision, diagnostics: [] })
      const publication = await gateway.publishConfigurationDraft({
        draftId: draft.id,
        revision: draft.revision,
      })
      expect(publication).toMatchObject({
        templateId: 'marketplace-reference',
        version: '0.1.1',
      })
      expect(digitalEmployees.registerTemplate).toHaveBeenCalledWith(expect.objectContaining({
        id: 'marketplace-reference',
        version: '0.1.1',
        capabilities: {
          skills: ['market-active'],
          tools: ['available_tool'],
          mcpServers: ['server'],
          experts: [],
          allowSubagents: false,
        },
        mcpServers: [expect.objectContaining({
          id: 'server',
          headerCredentials: { Authorization: 'AVAILABLE_TOKEN' },
        })],
      }))

      const employee = await gateway.create({
        templateId: 'marketplace-reference' as never,
        templateVersion: publication.version,
        displayName: 'Marketplace Reference',
        grants: {
          skills: ['market-active'],
          tools: ['available_tool'],
          mcpServers: ['server'],
          experts: [],
          allowSubagents: false,
        },
      })
      await expect(gateway.activate({ employeeId: employee.id })).resolves.toMatchObject({
        id: 'marketplace-employee',
        state: 'active',
      })
      expect(digitalEmployees.create).toHaveBeenCalledWith(expect.objectContaining({
        templateId: 'marketplace-reference',
        templateVersion: '0.1.1',
      }))
      expect(digitalEmployees.activate).toHaveBeenCalledWith('marketplace-employee')
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

  it('rolls back prepared publication work when durable persistence fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    const studioFile = join(directory, 'studio.json')
    let writes = 0
    const persist = vi.fn(async (...args: Parameters<typeof import('@deepseek-ai/dsh-atomic-write')['writeFileAtomic']>) => {
      writes += 1
      if (writes === 2) throw new Error('disk full')
      const { writeFileAtomic } = await import('@deepseek-ai/dsh-atomic-write')
      await writeFileAtomic(...args)
    })
    try {
      const store = new ConfigurationStudioStore(studioFile, persist)
      const draft = await store.create({
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery work.' },
        instructions: 'Coordinate delivery work.',
      }, 'draft-1' as never)
      const rollback = vi.fn(async () => {})

      await expect(store.publish(draft.id, draft.revision, async () => rollback)).rejects.toThrow('disk full')
      expect(rollback).toHaveBeenCalledOnce()
      await expect(store.listPublications()).resolves.toEqual([])
      await expect(store.publish(draft.id, draft.revision, async () => () => {}))
        .resolves.toMatchObject({ version: '0.1.1' })
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

  it('disposes active previews and published template registrations with its owning fiber', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-configuration-studio-'))
    try {
      const { ctx, digitalEmployees, digitalEmployeeAgent } = harness()
      const disposeTemplate = vi.fn()
      const disposePreview = vi.fn(async () => {})
      digitalEmployees.registerTemplate.mockReturnValue(disposeTemplate)
      digitalEmployeeAgent.createPreviewTask.mockResolvedValue({
        agent: { id: 'preview-session' },
        dispose: disposePreview,
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
      await gateway.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision })
      const preview = await gateway.previewConfigurationDraft({
        draftId: draft.id,
        revision: draft.revision,
        workspaceId: workspace.id as never,
      })

      await ctx.fiber.dispose()

      expect(disposePreview).toHaveBeenCalledOnce()
      expect(disposeTemplate).toHaveBeenCalledOnce()
      await expect(access(join(directory, 'digital-employee-previews', preview.id))).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('publishes a single non-conflicting management namespace', async () => {
    const { ctx } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway, studioConfig())
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
    await ctx.plugin(DigitalEmployeeManagementGateway, studioConfig())
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
    await ctx.plugin(DigitalEmployeeManagementGateway, studioConfig())
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    expect(() => gateway.continueExpert({
      parentSessionId: SessionId('missing'),
      childSessionId: SessionId('child'),
      content: [{ type: 'text', text: 'Continue.' }],
    })).toThrow('parent Agent "missing" is not live')
    await ctx.fiber.dispose()
  })
})
