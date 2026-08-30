import { describe, expect, it, vi } from 'vitest'
import type {
  DigitalEmployeeInstance, DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-api-remotes/client'
import { DigitalEmployeeStore } from '../src/client/store.ts'

const employee: DigitalEmployeeInstance = {
  id: 'employee-1' as DigitalEmployeeInstance['id'],
  templateId: 'template-1' as DigitalEmployeeInstance['templateId'],
  templateVersion: '1.0.0',
  displayName: 'Release Engineer',
  grants: {
    skills: ['release-notes'],
    tools: ['bash'],
    mcpServers: [],
    experts: ['reviewer' as DigitalEmployeeInstance['grants']['experts'][number]],
    allowSubagents: true,
  },
  state: 'active',
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
}

function ok<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

function template(name: string, description: string): DigitalEmployeeTemplate {
  const expertId = employee.grants.experts[0]
  if (expertId === undefined) throw new Error('employee fixture requires one expert')
  return {
    id: employee.templateId,
    version: employee.templateVersion,
    display: { name, description },
    personality: 'Precise.',
    instructions: { kind: 'file', root: '/fixture', path: 'AGENTS.md', revision: 'v1' },
    preset: 'headless',
    capabilities: employee.grants,
    experts: [{
      id: expertId,
      name: 'Reviewer',
      responsibility: 'Reviews output.',
      instructions: { kind: 'file', root: '/fixture', path: 'reviewer.md', revision: 'v1' },
      modelSettings: {},
      capabilities: {
        skills: [],
        tools: [],
        mcpServers: [],
        experts: [],
        allowSubagents: false,
      },
      memoryAccess: ['session'],
      delegation: { mode: 'one-shot', maxDepth: 0, maxConcurrency: 1, timeoutMs: 1_000 },
    }],
    delegation: { maxDepth: 1, maxConcurrency: 1, timeoutMs: 1_000 },
  }
}

function remote() {
  return {
    listTemplates: vi.fn(() => ok<DigitalEmployeeTemplate[]>([])),
    list: vi.fn(() => ok<DigitalEmployeeInstance[]>([employee])),
    get: vi.fn(() => ok(employee)),
    listMemory: vi.fn(() => ok([{ id: 'memory-1', content: 'Release checklist' }])),
    listExperts: vi.fn(() => ok([{ id: 'reviewer', name: 'Reviewer' }])),
    taskTree: vi.fn(() => ok([{ kind: 'child', id: 'child-1', activity: 'running' }])),
    listAudit: vi.fn(() => ok([{ id: 'audit-1', action: 'tool-call' }])),
    activate: vi.fn(() => ok(employee)),
    deactivate: vi.fn(() => ok({ ...employee, state: 'inactive' })),
    delete: vi.fn(() => ok(undefined)),
    deleteMemory: vi.fn(() => ok(undefined)),
  }
}

describe('DigitalEmployeeStore', () => {
  it('discovers active employees and retains unavailable rows with a diagnostic', async () => {
    const api = remote()
    api.listTemplates.mockResolvedValueOnce({
      ok: true,
      value: [template('Release specialist', 'Release work support.')],
    })
    api.list.mockResolvedValueOnce({
      ok: true,
      value: [
        employee,
        { ...employee, id: 'employee-2' as DigitalEmployeeInstance['id'], displayName: 'Paused operator', state: 'inactive' },
        { ...employee, id: 'employee-3' as DigitalEmployeeInstance['id'], displayName: 'Missing template', templateVersion: '2.0.0' },
      ],
    })
    const controller = new DigitalEmployeeStore(api as never)

    await controller.loadRoster()

    expect(controller.chatEmployees()).toEqual([
      expect.objectContaining({
        employee: expect.objectContaining({ id: 'employee-1' }),
        templateName: 'Release specialist',
        available: true,
      }),
      expect.objectContaining({
        employee: expect.objectContaining({ id: 'employee-2' }),
        available: false,
        unavailableReason: 'Employee is inactive.',
      }),
      expect.objectContaining({
        employee: expect.objectContaining({ id: 'employee-3' }),
        available: false,
        unavailableReason: 'Template template-1@2.0.0 is unavailable.',
      }),
    ])
  })

  it('suppresses an older roster result that settles after a newer refresh', async () => {
    const api = remote()
    const oldTemplates = deferred<Awaited<ReturnType<typeof api.listTemplates>>>()
    const oldEmployees = deferred<Awaited<ReturnType<typeof api.list>>>()
    const currentEmployee = {
      ...employee,
      id: 'employee-current' as DigitalEmployeeInstance['id'],
      displayName: 'Current employee',
    } as DigitalEmployeeInstance
    api.listTemplates
      .mockImplementationOnce(() => oldTemplates.promise)
      .mockResolvedValueOnce({
        ok: true,
        value: [template('Current template', 'Current release work support.')],
      })
    api.list
      .mockImplementationOnce(() => oldEmployees.promise)
      .mockResolvedValueOnce({ ok: true, value: [currentEmployee] })
    const controller = new DigitalEmployeeStore(api as never)

    const stale = controller.loadRoster()
    await controller.loadRoster()
    oldTemplates.resolve({ ok: true, value: [] })
    oldEmployees.resolve({ ok: true, value: [employee] })
    await stale

    expect(controller.chatEmployees()).toEqual([
      expect.objectContaining({
        employee: expect.objectContaining({ id: 'employee-current' }),
        templateName: 'Current template',
        available: true,
      }),
    ])
  })

  it('does not publish a roster request aborted while its remote reads are pending', async () => {
    const api = remote()
    const templates = deferred<Awaited<ReturnType<typeof api.listTemplates>>>()
    const employees = deferred<Awaited<ReturnType<typeof api.list>>>()
    api.listTemplates.mockImplementationOnce(() => templates.promise)
    api.list.mockImplementationOnce(() => employees.promise)
    const controller = new DigitalEmployeeStore(api as never)
    const attempt = new AbortController()

    const loading = controller.loadRoster(attempt.signal)
    attempt.abort()
    templates.resolve({ ok: true, value: [] })
    employees.resolve({ ok: true, value: [employee] })
    await loading

    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'idle',
      templates: [],
      employees: [],
    })
  })

  it('loads inventory and all selected employee operational views', async () => {
    const api = remote()
    const controller = new DigitalEmployeeStore(api as never)

    await controller.load()

    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      selectedId: 'employee-1',
      employees: [employee],
      detail: employee,
      memories: [{ id: 'memory-1', content: 'Release checklist' }],
      experts: [{ id: 'reviewer', name: 'Reviewer' }],
      taskTree: [{ kind: 'child', id: 'child-1', activity: 'running' }],
      audit: [{ id: 'audit-1', action: 'tool-call' }],
    })
    expect(api.listMemory).toHaveBeenCalledWith({
      employeeId: 'employee-1',
      text: '',
      scopes: ['long-term'],
      limit: 50,
    })
  })

  it('keeps destructive deletion behind confirmation and refreshes the inventory', async () => {
    const api = remote()
    api.list.mockResolvedValueOnce({ ok: true, value: [employee] })
      .mockResolvedValueOnce({ ok: true, value: [] })
    const controller = new DigitalEmployeeStore(api as never)
    await controller.load()

    controller.requestDelete()
    expect(controller.store.getSnapshot().confirmation).toEqual({ kind: 'delete', employeeId: 'employee-1' })
    expect(api.delete).not.toHaveBeenCalled()

    await controller.confirm()
    expect(api.delete).toHaveBeenCalledWith({ employeeId: 'employee-1' })
    expect(controller.store.getSnapshot()).toMatchObject({
      employees: [],
      selectedId: null,
      confirmation: null,
    })
  })
})
