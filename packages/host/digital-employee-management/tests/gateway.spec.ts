import { Context } from '@deepseek-ai/cordis'
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
  return { ctx, digitalEmployees, digitalEmployeeAgent, expert, parent }
}

describe('DigitalEmployeeManagementGateway', () => {
  it('publishes a single non-conflicting management namespace', async () => {
    const { ctx } = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway

    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'digitalEmployeeManagement',
      namespace: 'digitalEmployees',
    })
    expect(remoteMethods(gateway).map(method => method.method)).toEqual([
      'listTemplates', 'list', 'get', 'create', 'activate', 'deactivate',
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
