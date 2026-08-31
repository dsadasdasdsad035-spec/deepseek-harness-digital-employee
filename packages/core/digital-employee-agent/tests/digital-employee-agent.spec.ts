import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import {
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeMemoryId,
  createDigitalEmployeeTemplateId,
  createExpertId,
  projectDigitalEmployeeOwnership,
  type ResolvedDigitalEmployee,
} from '@deepseek-ai/dsh-digital-employee'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { createScope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { describe, expect, it, vi } from 'vitest'
import DigitalEmployeeAgent, {
  digitalEmployeeCompositionId,
  type ResolvedDigitalEmployeeExpert,
} from '@deepseek-ai/dsh-digital-employee-agent'

function resolved(root: string, id: string, displayName: string, personality?: string): ResolvedDigitalEmployee {
  const templatePersonality = 'Careful and evidence-driven.'
  const template = {
    id: createDigitalEmployeeTemplateId('analyst'),
    version: '1.0.0',
    display: { name: 'Analyst', description: 'Analyzes evidence.' },
    personality: templatePersonality,
    instructions: { kind: 'file' as const, root, path: 'AGENTS.md', revision: 'instructions-v1' },
    preset: 'coding',
    mcpServers: [],
    capabilities: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
    experts: [],
    delegation: { maxDepth: 0, maxConcurrency: 1, timeoutMs: 10_000 },
  }
  const instance = {
    id: createDigitalEmployeeInstanceId(id),
    templateId: template.id,
    templateVersion: template.version,
    displayName,
    ...(personality === undefined ? {} : { personality }),
    grants: template.capabilities,
    state: 'active' as const,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  }
  return {
    instance,
    template,
    personality: personality ?? templatePersonality,
    instructions: template.instructions,
    authority: template.capabilities,
    mcpServers: [],
    experts: [],
    delegation: template.delegation,
  }
}

describe('DigitalEmployeeAgent', () => {
  it('uses a canonical composition identity across non-semantic representation changes', () => {
    const first = resolved('/opt/dsh/plugins/employee-a', 'alpha', 'Alpha')
    const second = resolved('/Users/example/.dsh/plugins/employee-a', 'alpha', 'Renamed Alpha')
    const firstAuthority = {
      skills: ['summarize', 'research'],
      tools: ['write', 'read'],
      mcpServers: [],
      experts: [createExpertId('reviewer'), createExpertId('critic')],
      allowSubagents: true,
    }
    const secondAuthority = Object.fromEntries([
      ['allowSubagents', true],
      ['experts', [createExpertId('critic'), createExpertId('reviewer')]],
      ['mcpServers', []],
      ['tools', ['read', 'write']],
      ['skills', ['research', 'summarize']],
    ]) as typeof firstAuthority
    const expert = (id: 'critic' | 'reviewer', root: string) => ({
      id: createExpertId(id),
      name: id,
      responsibility: `Act as ${id}.`,
      instructions: {
        kind: 'file' as const,
        root,
        path: `experts/${id}/AGENTS.md`,
        revision: `${id}-v1`,
      },
      modelSettings: {},
      capabilities: {
        skills: ['review', 'research'],
        tools: ['write', 'read'],
        mcpServers: [],
        experts: [],
        allowSubagents: false,
      },
      memoryAccess: ['long-term', 'session'] as const,
      delegation: {
        mode: 'one-shot' as const,
        maxDepth: 0,
        maxConcurrency: 1,
        timeoutMs: 10_000,
      },
    })
    const firstComposition = {
      ...first,
      authority: firstAuthority,
      experts: [
        expert('reviewer', '/opt/dsh/plugins/employee-a'),
        expert('critic', '/opt/dsh/plugins/employee-a'),
      ],
    } satisfies ResolvedDigitalEmployee
    const secondComposition = {
      ...second,
      authority: secondAuthority,
      experts: [
        {
          ...expert('critic', '/Users/example/.dsh/plugins/employee-a'),
          capabilities: {
            ...expert('critic', '/Users/example/.dsh/plugins/employee-a').capabilities,
            skills: ['research', 'review'],
            tools: ['read', 'write'],
          },
          memoryAccess: ['session', 'long-term'] as const,
        },
        {
          ...expert('reviewer', '/Users/example/.dsh/plugins/employee-a'),
          capabilities: {
            ...expert('reviewer', '/Users/example/.dsh/plugins/employee-a').capabilities,
            skills: ['research', 'review'],
            tools: ['read', 'write'],
          },
          memoryAccess: ['session', 'long-term'] as const,
        },
      ],
    } satisfies ResolvedDigitalEmployee

    expect(digitalEmployeeCompositionId(firstComposition)).toBe(
      'sha256:e17a85deeca36b0ced02c35fdf3e67fbaf68e612cd5cc1fb6372a3a4a5331777',
    )
    expect(digitalEmployeeCompositionId(secondComposition))
      .toBe(digitalEmployeeCompositionId(firstComposition))
    expect(digitalEmployeeCompositionId({
      ...secondComposition,
      template: { ...secondComposition.template, version: '2.0.0' },
    })).not.toBe(digitalEmployeeCompositionId(firstComposition))
  })

  it('treats stdio MCP execution paths as semantic composition settings', () => {
    const first = resolved('/opt/dsh/plugins/employee-a', 'alpha', 'Alpha')
    const server = {
      id: 'release-control',
      transport: 'stdio' as const,
      command: '/opt/dsh/plugins/employee-a/bin/server',
      args: [],
      env: {},
      envCredentials: {},
      cwd: '/opt/dsh/plugins/employee-a',
    }
    const firstComposition = { ...first, mcpServers: [server] } satisfies ResolvedDigitalEmployee
    const relocatedComposition = {
      ...first,
      mcpServers: [{
        ...server,
        command: '/Users/example/.dsh/plugins/employee-a/bin/server',
        cwd: '/Users/example/.dsh/plugins/employee-a',
      }],
    } satisfies ResolvedDigitalEmployee

    expect(digitalEmployeeCompositionId(relocatedComposition))
      .not.toBe(digitalEmployeeCompositionId(firstComposition))
  })

  it('mounts the resolved preset and projects employee instructions into only that agent scope', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-agent-'))
    await writeFile(join(root, 'AGENTS.md'), 'Verify every material claim.', 'utf8')
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false })
    const mount = vi.fn(() => Promise.resolve())
    const restrictSkills = vi.fn()
    const restrictTools = vi.fn()
    ctx.provide('agentPresets', { mount } as never)
    ctx.provide('agents', { create: vi.fn() } as never)
    ctx.provide('digitalEmployees', { resolve: vi.fn() } as never)
    ctx.provide('skills', { restrict: restrictSkills } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('tools', { restrict: restrictTools } as never)
    await ctx.plugin(DigitalEmployeeAgent)
    const alphaKey = { employee: 'alpha' }
    const betaKey = { employee: 'beta' }
    const alpha = createScope(ctx, alphaKey)
    const beta = createScope(ctx, betaKey)

    await ctx.digitalEmployeeAgent.compose(
      alpha.ctx,
      resolved(root, 'alpha', 'Alpha', 'Direct and concise.'),
    )
    await ctx.digitalEmployeeAgent.compose(beta.ctx, resolved(root, 'beta', 'Beta'))

    expect(mount).toHaveBeenNthCalledWith(1, alpha.ctx, 'coding')
    expect(mount).toHaveBeenNthCalledWith(2, beta.ctx, 'coding')
    expect(restrictSkills).toHaveBeenNthCalledWith(1, { allow: [] })
    expect(restrictSkills).toHaveBeenNthCalledWith(2, { allow: [] })
    expect(restrictTools).toHaveBeenNthCalledWith(1, { allow: [] })
    expect(restrictTools).toHaveBeenNthCalledWith(2, { allow: [] })
    expect(renderPrompt(await alpha.ctx.get('systemPrompt')!.assemble({ scope: alphaKey }))).toBe([
      'Digital employee identity',
      'Employee: Alpha (alpha)',
      'Template: analyst@1.0.0',
      '',
      'Digital employee personality',
      'Template: Careful and evidence-driven.',
      'Instance override: Direct and concise.',
      '',
      'Digital employee instructions (revision instructions-v1)',
      'Verify every material claim.',
    ].join('\n'))
    expect(renderPrompt(await beta.ctx.get('systemPrompt')!.assemble({ scope: betaKey }))).toContain('Employee: Beta (beta)')
    expect(renderPrompt(await beta.ctx.get('systemPrompt')!.assemble({ scope: betaKey }))).not.toContain('Direct and concise.')
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toBe('')

    await alpha.dispose()
    expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: alphaKey }))).toBe('')
    await beta.dispose()
  })

  it('rejects an instruction path that escapes the contributing plugin root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-agent-path-'))
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: vi.fn() } as never)
    ctx.provide('digitalEmployees', { resolve: vi.fn() } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)
    const employee = resolved(root, 'alpha', 'Alpha')
    const escaped = {
      ...employee,
      instructions: { ...employee.instructions, path: '../AGENTS.md' },
    }
    const scope = createScope(ctx, { employee: 'alpha' })

    await expect(ctx.digitalEmployeeAgent.compose(scope.ctx, escaped))
      .rejects.toThrow('escapes plugin root')
    await scope.dispose()
  })

  it('resolves the employee before requesting Agent and Session creation', async () => {
    const ctx = new Context()
    const resolveEmployee = vi.fn(() => Promise.reject(new Error('digital employee "inactive" is inactive')))
    const createAgent = vi.fn()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: createAgent } as never)
    ctx.provide('digitalEmployees', { resolve: resolveEmployee } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)

    await expect(ctx.digitalEmployeeAgent.createTask({
      employeeId: createDigitalEmployeeInstanceId('inactive'),
      sessionId: SessionId('employee-task'),
    })).rejects.toThrow('inactive')
    expect(resolveEmployee).toHaveBeenCalledWith(createDigitalEmployeeInstanceId('inactive'))
    expect(createAgent).not.toHaveBeenCalled()
  })

  it('drains owned expert trees and root Agents before employee deletion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-delete-work-'))
    const employee = resolved(root, 'alpha', 'Alpha')
    const order: string[] = []
    const agent = { id: SessionId('employee-task') }
    const dispose = vi.fn(async () => { order.push('root-disposed') })
    const createAgent = vi.fn(() => Promise.resolve({ agent, dispose }))
    const drainContinuableDescendants = vi.fn(async () => { order.push('descendants-drained') })
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: createAgent } as never)
    ctx.provide('digitalEmployees', {
      resolve: () => Promise.resolve(employee),
      appendAudit: () => Promise.resolve(),
    } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', { drainContinuableDescendants } as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)

    const handle = await ctx.digitalEmployeeAgent.createTask({
      employeeId: employee.instance.id,
      sessionId: agent.id,
    })
    await ctx.serial('digital-employees/before-delete', employee.instance.id)

    expect(drainContinuableDescendants).toHaveBeenCalledWith([agent])
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['descendants-drained', 'root-disposed'])
    await handle.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('resolves required MCP credentials before requesting Agent and Session creation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-mcp-'))
    const employee = resolved(root, 'alpha', 'Alpha')
    const withMcp = {
      ...employee,
      template: {
        ...employee.template,
        mcpServers: [{
          id: 'github',
          transport: 'streamable-http' as const,
          url: 'https://mcp.example.test',
          headers: {},
          headerCredentials: { Authorization: credentialRef('GITHUB_TOKEN') },
        }],
      },
      authority: { ...employee.authority, mcpServers: ['github'] },
      mcpServers: [{
        id: 'github',
        transport: 'streamable-http' as const,
        url: 'https://mcp.example.test',
        headers: {},
        headerCredentials: { Authorization: credentialRef('GITHUB_TOKEN') },
      }],
    } satisfies ResolvedDigitalEmployee
    const createAgent = vi.fn()
    const resolveCredential = vi.fn(() => Promise.resolve(undefined))
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: createAgent } as never)
    ctx.provide('credentials', { resolve: resolveCredential } as never)
    ctx.provide('digitalEmployees', { resolve: () => Promise.resolve(withMcp) } as never)
    ctx.provide('mcpClients', { mount: vi.fn() } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)

    await expect(ctx.digitalEmployeeAgent.createTask({
      employeeId: withMcp.instance.id,
      sessionId: SessionId('employee-mcp-task'),
    })).rejects.toThrow('credential reference "GITHUB_TOKEN"')
    expect(resolveCredential).toHaveBeenCalledWith('GITHUB_TOKEN')
    expect(createAgent).not.toHaveBeenCalled()
  })

  it('uses distinct MCP server names for concurrent tasks of one employee', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-task-mcp-'))
    await writeFile(join(root, 'AGENTS.md'), 'Coordinate project delivery.', 'utf8')
    const base = resolved(root, 'alpha', 'Alpha')
    const declaration = {
      id: 'project-data',
      transport: 'streamable-http' as const,
      url: 'https://mcp.example.test',
      headers: {},
      headerCredentials: {},
    }
    const employee = {
      ...base,
      template: {
        ...base.template,
        mcpServers: [declaration],
        capabilities: { ...base.template.capabilities, mcpServers: ['project-data'] },
      },
      authority: { ...base.authority, mcpServers: ['project-data'] },
      mcpServers: [declaration],
    } satisfies ResolvedDigitalEmployee
    const mounted: string[] = []
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', {
      create: async (request: {
        sessionId: SessionId
        setup: (agentCtx: Context) => Promise<void>
      }) => {
        const agentCtx = new Context()
        agentCtx.provide('agent', {
          id: request.sessionId,
          session: { id: request.sessionId, append: () => {} },
        } as never)
        agentCtx.provide('skills', { restrict: () => {} } as never)
        agentCtx.provide('systemPrompt', { section: () => {} } as never)
        agentCtx.provide('tools', { restrict: () => {} } as never)
        await request.setup(agentCtx)
        return { agent: agentCtx.agent, dispose: async () => {} }
      },
    } as never)
    ctx.provide('credentials', { resolve: () => Promise.resolve({ value: 'unused' }) } as never)
    ctx.provide('digitalEmployees', {
      resolve: () => Promise.resolve(employee),
      appendAudit: () => Promise.resolve(),
    } as never)
    ctx.provide('mcpClients', {
      mount: (_agentCtx: Context, config: { serverName: string }) => {
        mounted.push(config.serverName)
        return Promise.resolve()
      },
    } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('systemPrompt', { section: () => {} } as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)

    await ctx.digitalEmployeeAgent.createTask({
      employeeId: employee.instance.id,
      sessionId: SessionId('employee-task-one'),
    })
    await ctx.digitalEmployeeAgent.createTask({
      employeeId: employee.instance.id,
      sessionId: SessionId('employee-task-two'),
    })

    expect(mounted).toHaveLength(2)
    expect(mounted[0]).toMatch(/^de-/)
    expect(mounted[1]).toMatch(/^de-/)
    expect(mounted[0]).not.toBe(mounted[1])
  })

  it('resolves an authorized expert into a named subagent composition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-expert-'))
    await writeFile(join(root, 'EXPERT.md'), 'Challenge unsupported claims.', 'utf8')
    const base = resolved(root, 'alpha', 'Alpha')
    const expertId = createExpertId('critic')
    const expert = {
      id: expertId,
      name: 'Evidence Critic',
      responsibility: 'Review evidence and identify unsupported claims.',
      instructions: {
        kind: 'file' as const,
        root,
        path: 'EXPERT.md',
        revision: 'critic-v1',
      },
      modelSettings: {
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        maxTokens: 4_096,
      },
      capabilities: {
        skills: ['review'],
        tools: ['web_search'],
        mcpServers: [],
        experts: [],
        allowSubagents: false,
      },
      memoryAccess: ['session', 'long-term'] as const,
      delegation: {
        mode: 'continuable' as const,
        maxDepth: 1,
        maxConcurrency: 1,
        timeoutMs: 30_000,
      },
    }
    const employee = {
      ...base,
      template: {
        ...base.template,
        capabilities: {
          ...base.template.capabilities,
          experts: [expertId],
        },
        experts: [expert],
      },
      authority: {
        ...base.authority,
        experts: [expertId],
      },
      experts: [expert],
    } satisfies ResolvedDigitalEmployee
    const queryMemory = vi.fn(() => Promise.resolve([{
      id: createDigitalEmployeeMemoryId('memory-review'),
      employeeId: employee.instance.id,
      scope: 'long-term' as const,
      content: 'Require a primary source for release claims.',
      tags: ['review'],
      sensitive: false,
      provenance: {
        sessionId: SessionId('source-session'),
        source: 'accepted-candidate',
        recordedAt: '2026-08-28T01:00:00.000Z',
      },
    }]))
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: vi.fn() } as never)
    ctx.provide('digitalEmployees', {
      resolve: () => Promise.resolve(employee),
      queryMemory,
      appendAudit: vi.fn(() => Promise.resolve()),
    } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)

    await expect(ctx.digitalEmployeeAgent.resolveExpert({
      employeeId: employee.instance.id,
      expertId,
      memory: {
        text: 'release',
        limit: 2,
      },
    })).resolves.toEqual({
      employeeId: employee.instance.id,
      id: expertId,
      label: 'Evidence Critic',
      responsibility: 'Review evidence and identify unsupported claims.',
      persona: 'Challenge unsupported claims.',
      instructionRevision: 'critic-v1',
      agentOptions: {
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        maxTokens: 4_096,
      },
      employeeAuthority: employee.authority,
      employeeDelegation: employee.delegation,
      capabilities: expert.capabilities,
      memoryProjection: {
        memories: [{
          id: createDigitalEmployeeMemoryId('memory-review'),
          scope: 'long-term',
          content: 'Require a primary source for release claims.',
          provenance: {
            sessionId: SessionId('source-session'),
            source: 'accepted-candidate',
            recordedAt: '2026-08-28T01:00:00.000Z',
          },
        }],
      },
      delegation: expert.delegation,
    })
    expect(queryMemory).toHaveBeenCalledWith({
      employeeId: employee.instance.id,
      text: 'release',
      scopes: ['session', 'long-term'],
      limit: 2,
    })
  })

  it('delegates one-shot and continuable experts through the existing subagent runtime', async () => {
    const expertId = createExpertId('critic')
    const oneShotRun = {
      id: SessionId('expert-one-shot'),
      localAgent: undefined,
      result: Promise.resolve({ output: [], stopReason: 'completed' as const }),
      dispose: vi.fn(() => Promise.resolve()),
    }
    const start = vi.fn(() => Promise.resolve(oneShotRun))
    const startContinuable = vi.fn(() => Promise.resolve({
      childId: SessionId('expert-continuable'),
      messageId: 'message-1',
    }))
    const append = vi.fn()
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: vi.fn() } as never)
    ctx.provide('digitalEmployees', { resolve: vi.fn() } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', { start, startContinuable } as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)
    const parent = {
      id: SessionId('parent'),
      session: { append },
    }
    const signal = new AbortController().signal
    const prompt = [{ type: 'text' as const, text: 'Review the release evidence.' }]
    const baseExpert = {
      employeeId: createDigitalEmployeeInstanceId('alpha'),
      id: expertId,
      label: 'Evidence Critic',
      responsibility: 'Review evidence.',
      persona: 'Challenge unsupported claims.',
      instructionRevision: 'critic-v1',
      agentOptions: { provider: 'deepseek', model: 'deepseek-reasoner' },
      employeeAuthority: {
        skills: ['review'],
        tools: ['web_search', 'read'],
        mcpServers: ['evidence'],
        experts: [createExpertId('fact-checker')],
        allowSubagents: true,
      },
      employeeDelegation: {
        maxDepth: 2,
        maxConcurrency: 3,
        timeoutMs: 20_000,
      },
      capabilities: {
        skills: ['review'],
        tools: ['web_search', 'write'],
        mcpServers: ['evidence'],
        experts: [createExpertId('fact-checker')],
        allowSubagents: true,
      },
      delegation: {
        mode: 'one-shot' as const,
        maxDepth: 0,
        maxConcurrency: 1,
        timeoutMs: 30_000,
      },
    } satisfies ResolvedDigitalEmployeeExpert
    vi.spyOn(ctx.digitalEmployeeAgent, 'resolveExpert').mockResolvedValueOnce(baseExpert)

    await expect(ctx.digitalEmployeeAgent.delegateToExpert({
      employeeId: baseExpert.employeeId,
      expertId,
      provider: 'spawn',
      parent: parent as never,
      parentAuthority: {
        capabilities: {
          skills: ['review'],
          tools: ['web_search'],
          mcpServers: ['evidence'],
          experts: [expertId, createExpertId('fact-checker')],
          allowSubagents: false,
        },
        delegation: {
          maxDepth: 1,
          maxConcurrency: 2,
          timeoutMs: 10_000,
        },
        depth: 0,
        activeDelegations: 0,
      },
      prompt,
      signal,
    })).resolves.toEqual({
      mode: 'one-shot',
      expert: baseExpert,
      authority: {
        skills: ['review'],
        tools: ['web_search'],
        mcpServers: ['evidence'],
        experts: [createExpertId('fact-checker')],
        allowSubagents: false,
      },
      delegation: {
        maxDepth: 1,
        maxConcurrency: 1,
        timeoutMs: 10_000,
      },
      run: oneShotRun,
    })
    expect(start).toHaveBeenCalledWith('spawn', {
      label: 'Evidence Critic',
      prompt,
      parent,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matchers are intentionally typed as any
      signal: expect.any(AbortSignal),
      agentOptions: baseExpert.agentOptions,
      maxDepth: 1,
      persona: 'Challenge unsupported claims.',
      toolFilter: { allow: ['web_search'] },
      composition: {
        digitalEmployeeExpert: {
          employeeId: baseExpert.employeeId,
          expertId,
          mcpServerIds: ['evidence'],
        },
      },
    })
    await oneShotRun.result
    await Promise.resolve()
    expect(append).toHaveBeenNthCalledWith(1, 'digital-employee/expert-delegation', {
      employeeId: baseExpert.employeeId,
      expertId,
      childSessionId: oneShotRun.id,
      mode: 'one-shot',
      provider: 'spawn',
      label: 'Evidence Critic',
      instructionRevision: 'critic-v1',
      prompt,
      authority: {
        skills: ['review'],
        tools: ['web_search'],
        mcpServers: ['evidence'],
        experts: [createExpertId('fact-checker')],
        allowSubagents: false,
      },
      delegation: {
        maxDepth: 1,
        maxConcurrency: 1,
        timeoutMs: 10_000,
      },
    })
    expect(append).toHaveBeenNthCalledWith(2, 'digital-employee/expert-result', {
      employeeId: baseExpert.employeeId,
      expertId,
      childSessionId: oneShotRun.id,
      output: [],
      stopReason: 'completed',
    })

    const continuableExpert = {
      ...baseExpert,
      delegation: { ...baseExpert.delegation, mode: 'continuable' as const },
    }
    vi.spyOn(ctx.digitalEmployeeAgent, 'resolveExpert').mockResolvedValueOnce(continuableExpert)
    await expect(ctx.digitalEmployeeAgent.delegateToExpert({
      employeeId: baseExpert.employeeId,
      expertId,
      provider: 'spawn',
      parent: parent as never,
      parentAuthority: {
        capabilities: {
          skills: ['review'],
          tools: ['web_search'],
          mcpServers: ['evidence'],
          experts: [expertId, createExpertId('fact-checker')],
          allowSubagents: false,
        },
        delegation: {
          maxDepth: 1,
          maxConcurrency: 2,
          timeoutMs: 10_000,
        },
        depth: 0,
        activeDelegations: 0,
      },
      prompt,
      signal,
    })).resolves.toEqual({
      mode: 'continuable',
      expert: continuableExpert,
      authority: {
        skills: ['review'],
        tools: ['web_search'],
        mcpServers: ['evidence'],
        experts: [createExpertId('fact-checker')],
        allowSubagents: false,
      },
      delegation: {
        maxDepth: 1,
        maxConcurrency: 1,
        timeoutMs: 10_000,
      },
      childId: SessionId('expert-continuable'),
      messageId: 'message-1',
    })
    expect(startContinuable).toHaveBeenCalledWith({
      provider: 'spawn',
      label: 'Evidence Critic',
      request: {
        prompt,
        parent,
        agentOptions: baseExpert.agentOptions,
        maxDepth: 1,
        persona: 'Challenge unsupported claims.',
        toolFilter: { allow: ['web_search'] },
        composition: {
          digitalEmployeeExpert: {
            employeeId: baseExpert.employeeId,
            expertId,
            mcpServerIds: ['evidence'],
          },
        },
      },
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matchers are intentionally typed as any
      signal: expect.any(AbortSignal),
    })
    expect(append).toHaveBeenNthCalledWith(3, 'digital-employee/expert-delegation', {
      employeeId: baseExpert.employeeId,
      expertId,
      childSessionId: SessionId('expert-continuable'),
      mode: 'continuable',
      provider: 'spawn',
      label: 'Evidence Critic',
      instructionRevision: 'critic-v1',
      prompt,
      authority: {
        skills: ['review'],
        tools: ['web_search'],
        mcpServers: ['evidence'],
        experts: [createExpertId('fact-checker')],
        allowSubagents: false,
      },
      delegation: {
        maxDepth: 1,
        maxConcurrency: 1,
        timeoutMs: 10_000,
      },
    })

    vi.spyOn(ctx.digitalEmployeeAgent, 'resolveExpert').mockResolvedValueOnce(baseExpert)
    await expect(ctx.digitalEmployeeAgent.delegateToExpert({
      employeeId: baseExpert.employeeId,
      expertId,
      provider: 'spawn',
      parent: parent as never,
      parentAuthority: {
        capabilities: {
          ...baseExpert.employeeAuthority,
          experts: [expertId, ...baseExpert.employeeAuthority.experts],
        },
        delegation: {
          ...baseExpert.employeeDelegation,
          maxDepth: 1,
        },
        depth: 1,
        activeDelegations: 0,
      },
      prompt,
      signal,
    })).rejects.toThrow('maximum depth')
    expect(append).toHaveBeenNthCalledWith(4, 'digital-employee/expert-authorization-denied', {
      employeeId: baseExpert.employeeId,
      expertId,
      reason: 'expert "critic" delegation exceeds maximum depth 1',
    })
    vi.spyOn(ctx.digitalEmployeeAgent, 'resolveExpert').mockResolvedValueOnce(baseExpert)
    await expect(ctx.digitalEmployeeAgent.delegateToExpert({
      employeeId: baseExpert.employeeId,
      expertId,
      provider: 'spawn',
      parent: parent as never,
      parentAuthority: {
        capabilities: {
          ...baseExpert.employeeAuthority,
          experts: [expertId, ...baseExpert.employeeAuthority.experts],
        },
        delegation: baseExpert.employeeDelegation,
        depth: 0,
        activeDelegations: 1,
      },
      prompt,
      signal,
    })).rejects.toThrow('maximum concurrency')
    expect(append).toHaveBeenNthCalledWith(5, 'digital-employee/expert-authorization-denied', {
      employeeId: baseExpert.employeeId,
      expertId,
      reason: 'expert "critic" delegation exceeds maximum concurrency 1',
    })
  })

  it('mounts only authorized expert MCP clients from non-secret child composition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-expert-mcp-'))
    const base = resolved(root, 'alpha', 'Alpha')
    const expertId = createExpertId('critic')
    const declaration = {
      id: 'evidence',
      transport: 'streamable-http' as const,
      url: 'https://mcp.example.test',
      headers: {},
      headerCredentials: { Authorization: credentialRef('EVIDENCE_TOKEN') },
    }
    const expert = {
      id: expertId,
      name: 'Evidence Critic',
      responsibility: 'Review evidence.',
      instructions: base.instructions,
      modelSettings: {},
      capabilities: {
        skills: [],
        tools: [],
        mcpServers: ['evidence'],
        experts: [],
        allowSubagents: false,
      },
      memoryAccess: [] as const,
      delegation: {
        mode: 'continuable' as const,
        maxDepth: 1,
        maxConcurrency: 1,
        timeoutMs: 10_000,
      },
    }
    const employee = {
      ...base,
      template: {
        ...base.template,
        mcpServers: [declaration],
        capabilities: {
          ...base.template.capabilities,
          mcpServers: ['evidence'],
          experts: [expertId],
        },
        experts: [expert],
      },
      authority: {
        ...base.authority,
        mcpServers: ['evidence'],
        experts: [expertId],
      },
      mcpServers: [declaration],
      experts: [expert],
    } satisfies ResolvedDigitalEmployee
    const mount = vi.fn(() => Promise.resolve())
    const appendAudit = vi.fn(() => Promise.resolve())
    const resolveCredential = vi.fn(() => Promise.resolve({ value: 'resolved-secret' }))
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: vi.fn() } as never)
    ctx.provide('credentials', { resolve: resolveCredential } as never)
    ctx.provide('digitalEmployees', {
      resolve: () => Promise.resolve(employee),
      appendAudit,
    } as never)
    ctx.provide('mcpClients', { mount } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)
    const childCtx = createScope(ctx, { child: 'expert' }).ctx
    const child = {
      id: SessionId('expert-child'),
      session: { id: SessionId('expert-child') },
    }
    childCtx.provide('agent', child as never)

    await ctx.serial('subagent/compose', childCtx, {
      digitalEmployeeExpert: {
        employeeId: employee.instance.id,
        expertId,
        mcpServerIds: ['evidence'],
      },
    })

    expect(resolveCredential).toHaveBeenCalledWith('EVIDENCE_TOKEN')
    expect(mount).toHaveBeenCalledWith(childCtx, expect.objectContaining({
      transport: 'streamable-http',
      url: declaration.url,
      headers: { Authorization: 'resolved-secret' },
    }))
    expect(appendAudit).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: employee.instance.id,
      sessionId: child.session.id,
      agentId: child.id,
      action: 'capabilities.configured',
      metadata: expect.objectContaining({ mcpServerCount: 1 }) as unknown as Record<string, unknown>,
    }))
    childCtx.emit('skill/selected', {
      name: 'review',
      provider: 'filesystem',
      source: 'project-agents',
      channel: 'model',
      sessionId: child.session.id,
      agentId: child.id,
    })
    await vi.waitFor(() => {
      expect(appendAudit).toHaveBeenCalledWith({
        employeeId: employee.instance.id,
        sessionId: child.session.id,
        agentId: child.id,
        category: 'capability',
        action: 'skill.selected',
        outcome: 'succeeded',
        metadata: {
          skill: 'review',
          provider: 'filesystem',
          source: 'project-agents',
          channel: 'model',
        },
      })
    })

    await expect(ctx.serial('subagent/compose', childCtx, {
      digitalEmployeeExpert: {
        employeeId: employee.instance.id,
        expertId,
        mcpServerIds: ['unauthorized'],
      },
    })).rejects.toThrow('does not authorize MCP server "unauthorized"')
    expect(mount).toHaveBeenCalledTimes(1)
    expect(JSON.stringify({
      digitalEmployeeExpert: {
        employeeId: employee.instance.id,
        expertId,
        mcpServerIds: ['evidence'],
      },
    })).not.toContain('resolved-secret')
  })

  it('records memory promotion decisions on the owning Session', async () => {
    const accepted = {
      kind: 'accepted' as const,
      memory: {
        id: createDigitalEmployeeMemoryId('memory-accepted'),
        employeeId: createDigitalEmployeeInstanceId('alpha'),
        scope: 'long-term' as const,
        content: 'Use staged releases.',
        tags: ['release'],
        sensitive: false,
        provenance: {
          sessionId: SessionId('parent'),
          source: 'expert-candidate',
          recordedAt: '2026-08-28T10:00:00.000Z',
        },
      },
    }
    const promoteMemory = vi.fn(() => Promise.resolve(accepted))
    const append = vi.fn()
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: vi.fn() } as never)
    ctx.provide('digitalEmployees', { promoteMemory } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)
    const candidate = {
      employeeId: accepted.memory.employeeId,
      content: accepted.memory.content,
      tags: accepted.memory.tags,
      sensitive: false,
      retentionDays: 30,
      provenance: accepted.memory.provenance,
    }

    await expect(ctx.digitalEmployeeAgent.promoteMemory(
      { id: SessionId('parent'), session: { append } } as never,
      candidate,
    )).resolves.toBe(accepted)
    expect(promoteMemory).toHaveBeenCalledWith(candidate)
    expect(append).toHaveBeenCalledWith('digital-employee/memory-decision', {
      employeeId: accepted.memory.employeeId,
      candidate,
      decision: {
        kind: 'accepted',
        memoryId: accepted.memory.id,
      },
    })
  })

  it('rejects unauthorized expert edges and applies the tightest delegation timeout', async () => {
    const expertId = createExpertId('critic')
    const append = vi.fn()
    const start = vi.fn((_provider: string, request: { signal: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => {
          reject(request.signal.reason instanceof Error
            ? request.signal.reason
            : new Error(String(request.signal.reason)))
        }, {
          once: true,
        })
      }))
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: vi.fn() } as never)
    ctx.provide('digitalEmployees', {} as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', { start } as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)
    const expert = {
      employeeId: createDigitalEmployeeInstanceId('alpha'),
      id: expertId,
      label: 'Critic',
      responsibility: 'Review evidence.',
      persona: 'Challenge unsupported claims.',
      instructionRevision: 'critic-v1',
      agentOptions: {},
      employeeAuthority: {
        skills: [],
        tools: [],
        mcpServers: [],
        experts: [],
        allowSubagents: false,
      },
      employeeDelegation: {
        maxDepth: 2,
        maxConcurrency: 2,
        timeoutMs: 50,
      },
      capabilities: {
        skills: [],
        tools: [],
        mcpServers: [],
        experts: [],
        allowSubagents: false,
      },
      delegation: {
        mode: 'one-shot' as const,
        maxDepth: 2,
        maxConcurrency: 2,
        timeoutMs: 5,
      },
    } satisfies ResolvedDigitalEmployeeExpert
    const parent = {
      id: SessionId('parent'),
      session: { append },
    }
    const request = {
      employeeId: expert.employeeId,
      expertId,
      provider: 'spawn',
      parent: parent as never,
      prompt: [{ type: 'text' as const, text: 'Review.' }],
      signal: new AbortController().signal,
    }

    vi.spyOn(ctx.digitalEmployeeAgent, 'resolveExpert').mockResolvedValueOnce(expert)
    await expect(ctx.digitalEmployeeAgent.delegateToExpert({
      ...request,
      parentAuthority: {
        capabilities: {
          ...expert.employeeAuthority,
          experts: [],
        },
        delegation: expert.employeeDelegation,
        depth: 0,
        activeDelegations: 0,
      },
    })).rejects.toThrow('does not authorize')
    expect(start).not.toHaveBeenCalled()
    expect(append).toHaveBeenNthCalledWith(1, 'digital-employee/expert-authorization-denied', {
      employeeId: expert.employeeId,
      expertId,
      reason: 'parent Agent does not authorize expert "critic"',
    })

    vi.spyOn(ctx.digitalEmployeeAgent, 'resolveExpert').mockResolvedValueOnce(expert)
    await expect(ctx.digitalEmployeeAgent.delegateToExpert({
      ...request,
      parentAuthority: {
        capabilities: {
          ...expert.employeeAuthority,
          experts: [expertId],
        },
        delegation: {
          ...expert.employeeDelegation,
          timeoutMs: 20,
        },
        depth: 0,
        activeDelegations: 0,
      },
    })).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('exposes expert catalog and existing subagent lifecycle operations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-expert-ops-'))
    const employee = resolved(root, 'alpha', 'Alpha')
    const followup = vi.fn(() => Promise.resolve('message-2'))
    const interrupt = vi.fn()
    const listDescendants = vi.fn(() => Promise.resolve([{
      id: SessionId('expert-child'),
      parentId: SessionId('parent'),
      depth: 1,
      mode: 'continuable',
      label: 'Evidence Critic',
      status: 'running',
    }]))
    const ctx = new Context()
    ctx.provide('agentPresets', { mount: () => Promise.resolve() } as never)
    ctx.provide('agents', { create: vi.fn() } as never)
    ctx.provide('digitalEmployees', { resolve: () => Promise.resolve(employee) } as never)
    ctx.provide('skills', { restrict: () => {} } as never)
    ctx.provide('subagents', { followup, interrupt, listDescendants } as never)
    ctx.provide('systemPrompt', {} as never)
    ctx.provide('tools', { restrict: () => {} } as never)
    await ctx.plugin(DigitalEmployeeAgent)
    const parent = { id: SessionId('parent') }
    const childId = SessionId('expert-child')
    const signal = new AbortController().signal
    const content = [{ type: 'text' as const, text: 'Check the revised evidence.' }]

    await expect(ctx.digitalEmployeeAgent.listExperts(employee.instance.id))
      .resolves.toEqual(employee.experts)
    await expect(ctx.digitalEmployeeAgent.followupExpert(
      parent as never,
      childId,
      content,
      { source: { kind: 'user' }, signal },
    )).resolves.toBe('message-2')
    ctx.digitalEmployeeAgent.interruptExpert(childId, {
      kind: 'ancestor',
      agent: parent as never,
    })
    await expect(ctx.digitalEmployeeAgent.listExpertTree(parent.id))
      .resolves.toEqual([{
        id: childId,
        parentId: parent.id,
        depth: 1,
        mode: 'continuable',
        label: 'Evidence Critic',
        status: 'running',
      }])
    await expect(ctx.digitalEmployeeAgent.expertResult({
      id: childId,
      localAgent: undefined,
      result: Promise.resolve({
        output: content,
        stopReason: 'completed',
      }),
      dispose: () => Promise.resolve(),
    })).resolves.toEqual({
      output: content,
      stopReason: 'completed',
    })
    expect(followup).toHaveBeenCalledWith(
      parent,
      childId,
      content,
      { source: { kind: 'user' }, signal },
    )
    expect(interrupt).toHaveBeenCalledWith(childId, {
      kind: 'ancestor',
      agent: parent,
    })
    expect(listDescendants).toHaveBeenCalledWith(parent.id, undefined)
  })

  it('records resolved identity and instruction revision before publishing the root Agent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-digital-employee-task-'))
    await writeFile(join(root, 'AGENTS.md'), 'Keep the durable record exact.', 'utf8')
    const employee = resolved(root, 'alpha', 'Alpha', 'Direct and concise.')
    let currentEmployee = employee
    const session = Session.create(SessionId('employee-task'))
    const append = vi.spyOn(session, 'append')
    const ctx = new Context()
    const mount = vi.fn(() => Promise.resolve())
    const restrictSkills = vi.fn()
    const restrictTools = vi.fn()
    const section = vi.fn(() => () => {})
    const queryMemory = vi.fn(() => Promise.resolve([{
      id: createDigitalEmployeeMemoryId('memory-release'),
      employeeId: employee.instance.id,
      scope: 'long-term' as const,
      content: 'Prefer a staged release with an explicit rollback.',
      tags: ['release'],
      sensitive: false,
      provenance: {
        sessionId: SessionId('source-session'),
        source: 'accepted-candidate',
        recordedAt: '2026-08-28T01:00:00.000Z',
      },
    }]))
    const createdHandle = { agent: { id: SessionId('employee-task') }, dispose: vi.fn() }
    const createAgent = vi.fn(async (options: {
      meta?: { agentPreset?: string }
      setup?: (agentCtx: Context) => Promise<void> | void
    }) => {
      const key = { employee: 'alpha' }
      const scope = createScope(ctx, key)
      const agentCtx = scope.ctx.extend({
        agent: {
          id: SessionId('employee-task'),
          session,
        },
      })
      await options.setup?.(agentCtx)
      await scope.dispose()
      return createdHandle
    })
    ctx.provide('agentPresets', { mount } as never)
    ctx.provide('agents', { create: createAgent } as never)
    ctx.provide('digitalEmployees', {
      resolve: () => Promise.resolve(currentEmployee),
      queryMemory,
      appendAudit: vi.fn(() => Promise.resolve()),
    } as never)
    ctx.provide('skills', { restrict: restrictSkills } as never)
    ctx.provide('subagents', {} as never)
    ctx.provide('systemPrompt', {
      section,
    } as never)
    ctx.provide('tools', { restrict: restrictTools } as never)
    await ctx.plugin(DigitalEmployeeAgent)

    const initialMessage = createUserMessage({
      content: [{ type: 'text', text: 'Prepare the release.' }],
      source: { kind: 'user' },
    })
    await expect(ctx.digitalEmployeeAgent.createTask({
      employeeId: employee.instance.id,
      sessionId: SessionId('employee-task'),
      agentOptions: { provider: 'mock', model: 'mock' },
      initialMessage,
      memory: {
        text: 'release',
        scopes: ['long-term'],
        limit: 2,
      },
    })).resolves.toBe(createdHandle)

    expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: SessionId('employee-task'),
      meta: { agentPreset: 'coding' },
      agentOptions: { provider: 'mock', model: 'mock' },
      initialMessages: [initialMessage],
      setup: expect.any(Function) as unknown as (ctx: Context) => Promise<void>,
    }))
    expect(append.mock.calls).toEqual([
      ['digital-employee/identity', {
        employeeId: 'alpha',
        displayName: 'Alpha',
        templateId: 'analyst',
        templateVersion: '1.0.0',
        compositionId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        personality: 'Direct and concise.',
      }],
      ['digital-employee/instructions', {
        revision: 'instructions-v1',
      }],
      ['digital-employee/memory-projection', {
        memories: [{
          id: 'memory-release',
          scope: 'long-term',
          content: 'Prefer a staged release with an explicit rollback.',
          provenance: {
            sessionId: 'source-session',
            source: 'accepted-candidate',
            recordedAt: '2026-08-28T01:00:00.000Z',
          },
        }],
      }],
    ])
    expect(queryMemory).toHaveBeenCalledWith({
      employeeId: employee.instance.id,
      text: 'release',
      scopes: ['long-term'],
      limit: 2,
    })
    expect(section).toHaveBeenCalledWith(expect.objectContaining({
      name: 'digital-employee:memory',
      text: [
        'Digital employee memory',
        '[memory-release] (long-term) Prefer a staged release with an explicit rollback.',
      ].join('\n'),
    }))
    expect(mount).toHaveBeenCalled()
    expect(restrictSkills).toHaveBeenCalledWith({ allow: [] })
    expect(restrictTools).toHaveBeenCalledWith({ allow: [] })

    const creationIdentity = session.events.find(event => event.type === 'digital-employee/identity')
    currentEmployee = {
      ...employee,
      instance: {
        ...employee.instance,
        displayName: 'Renamed Alpha',
        templateVersion: '2.0.0',
        state: 'inactive',
        updatedAt: '2026-08-29T00:00:00.000Z',
      },
    }
    expect(currentEmployee.instance.displayName).toBe('Renamed Alpha')
    const restored = Session.fromRestore(
      session.id,
      structuredClone(session.events),
      structuredClone(session.header),
    )

    expect(restored.events.find(event => event.type === 'digital-employee/identity')).toEqual(creationIdentity)
    expect(projectDigitalEmployeeOwnership(restored.events)).toMatchObject({
      employeeId: 'alpha',
      displayName: 'Alpha',
      templateId: 'analyst',
      templateVersion: '1.0.0',
      compositionId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
  })
})
