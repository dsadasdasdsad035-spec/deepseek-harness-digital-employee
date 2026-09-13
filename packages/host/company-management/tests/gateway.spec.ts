import { mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Companies, { createCompanyEmployeeId, type CompanyId } from '@deepseek-ai/dsh-company'
import { FileCompanyProvider } from '@deepseek-ai/dsh-company-file'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import CompanyManagementGateway from '../src/index.ts'

const EMPLOYEE_CHAT = createCompanyEmployeeId('employee-chat')
const EMPLOYEE_HEADLESS = createCompanyEmployeeId('employee-headless')
const EMPLOYEE_IDLE = createCompanyEmployeeId('employee-idle')
const EMPLOYEE_GONE = createCompanyEmployeeId('employee-gone')

const instances = [
  { id: EMPLOYEE_CHAT, displayName: 'Chat', templateId: 'tpl-chat', state: 'active' },
  { id: EMPLOYEE_HEADLESS, displayName: 'Headless', templateId: 'tpl-headless', state: 'active' },
  { id: EMPLOYEE_IDLE, displayName: 'Idle', templateId: 'tpl-idle', state: 'inactive' },
]

async function harness(root: string): Promise<{ ctx: Context; gateway: CompanyManagementGateway }> {
  const ctx = new Context()
  await ctx.plugin(Companies)
  const store = new FileCompanyProvider(ctx, { path: join(root, 'companies.json') })
  await store.initialize()
  ctx.companies.configureProvider(store)

  const chatAgent = { id: 'session-chat', status: 'running' }
  const headlessArtifact = join(root, 'headless.jsonl')
  await writeFile(headlessArtifact, '{}\n')
  const staleArtifact = join(root, 'stale.jsonl')
  await writeFile(staleArtifact, '{}\n')
  await utimes(staleArtifact, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000))

  ctx.provide('agents', {
    get: (id: string) => id === 'session-chat' ? chatAgent : undefined,
  } as never)
  ctx.provide('attachments', {} as never)
  ctx.provide('digitalEmployees', {
    list: vi.fn(() => Promise.resolve(instances)),
    get: vi.fn((id: string) =>
      Promise.resolve(instances.find(instance => instance.id === id && instance.state !== 'deleting'))),
    listAudit: vi.fn((employeeId: string) => {
      const sessions: Record<string, string[]> = {
        [EMPLOYEE_CHAT]: ['session-chat'],
        [EMPLOYEE_HEADLESS]: ['session-headless'],
        [EMPLOYEE_IDLE]: ['session-idle'],
      }
      return Promise.resolve((sessions[employeeId] ?? []).map((sessionId, index) => ({
        id: `audit-${employeeId}-${String(index)}`,
        employeeId,
        sessionId,
        category: 'lifecycle',
        action: 'task.start',
        outcome: 'succeeded',
        occurredAt: '2026-01-01T00:00:00.000Z',
        metadata: {},
      })))
    }),
  } as never)
  ctx.provide('sessionPersistence', {
    list: vi.fn(() => Promise.resolve([
      { id: 'session-headless' },
      { id: 'session-idle' },
    ])),
    locate: vi.fn((header: { id: string }) =>
      header.id === 'session-headless'
        ? { kind: 'jsonl', path: headlessArtifact }
        : header.id === 'session-idle'
          ? { kind: 'jsonl', path: staleArtifact }
          : undefined),
  } as never)

  await ctx.plugin(CompanyManagementGateway)
  return { ctx, gateway: ctx.companyManagement }
}

describe('CompanyManagementGateway', () => {
  it('publishes a single non-conflicting management namespace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-gateway-'))
    const { gateway } = await harness(root)
    expect(remoteMethods(gateway).map(method => method.method)).toEqual([
      'list',
      'get',
      'create',
      'update',
      'delete',
      'promoImage',
      'setPromoImage',
      'removePromoImage',
      'addDepartment',
      'renameDepartment',
      'reorderDepartments',
      'deleteDepartment',
      'listBindings',
      'assignEmployee',
      'unassignEmployee',
      'availableEmployees',
      'companyFloor',
    ])
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'companyManagement',
      namespace: 'companies',
    })
  })

  it('projects the floor with chat-busy, task-busy, and idle members', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-floor-'))
    const { ctx } = await harness(root)
    const company = await ctx.companyManagement.create({ name: 'Acme' })
    await ctx.companyManagement.assignEmployee({
      instanceId: EMPLOYEE_CHAT,
      companyId: company.id,
      departmentId: company.departments[0]!.id,
    })
    await ctx.companyManagement.assignEmployee({
      instanceId: EMPLOYEE_HEADLESS,
      companyId: company.id,
      departmentId: company.departments[3]!.id,
    })
    await ctx.companyManagement.assignEmployee({
      instanceId: EMPLOYEE_IDLE,
      companyId: company.id,
      departmentId: null,
    })

    const floor = await ctx.companyManagement.companyFloor({ companyId: company.id })
    const verdictOf = (instanceId: string) => floor.groups
      .flatMap(group => group.members)
      .find(member => member.instanceId === instanceId)
    expect(floor.groups.map(group => group.department?.name)).toEqual(['总裁', '人力', '行政', 'IT', '销售', undefined])
    expect(verdictOf(EMPLOYEE_CHAT)).toMatchObject({ busy: true, busyKind: 'chat', rootSessionId: 'session-chat' })
    expect(verdictOf(EMPLOYEE_HEADLESS)).toMatchObject({ busy: true, busyKind: 'task' })
    expect(verdictOf(EMPLOYEE_IDLE)).toMatchObject({ busy: false, busyKind: null })
    const unassigned = floor.groups.find(group => group.department === null)
    expect(unassigned?.members.map(member => member.displayName)).toEqual(['Idle'])
  })

  it('availableEmployees lists unbound instances only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-available-'))
    const { ctx } = await harness(root)
    const company = await ctx.companyManagement.create({ name: 'Acme' })
    await ctx.companyManagement.assignEmployee({
      instanceId: EMPLOYEE_CHAT,
      companyId: company.id,
      departmentId: company.departments[0]!.id,
    })
    expect(await ctx.companyManagement.availableEmployees()).toEqual([
      { instanceId: EMPLOYEE_HEADLESS, displayName: 'Headless', templateId: 'tpl-headless', state: 'active' },
      { instanceId: EMPLOYEE_IDLE, displayName: 'Idle', templateId: 'tpl-idle', state: 'inactive' },
    ])
  })

  it('rejects binding unknown instances and moving into missing companies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-reject-'))
    const { ctx } = await harness(root)
    const company = await ctx.companyManagement.create({ name: 'Acme' })
    await expect(ctx.companyManagement.assignEmployee({
      instanceId: EMPLOYEE_GONE,
      companyId: company.id,
      departmentId: null,
    })).rejects.toThrow(/does not exist/)
    await expect(ctx.companyManagement.companyFloor({ companyId: 'missing' as CompanyId })).rejects.toThrow(/does not exist/)
    await expect(ctx.companyManagement.setPromoImage({
      companyId: 'missing' as CompanyId,
      image: { mediaType: 'image/png', data: '' },
    })).rejects.toThrow(/does not exist/)
  })

  it('unbinds an employee when its deletion is announced', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-company-before-delete-'))
    const { ctx } = await harness(root)
    const company = await ctx.companyManagement.create({ name: 'Acme' })
    await ctx.companyManagement.assignEmployee({
      instanceId: EMPLOYEE_CHAT,
      companyId: company.id,
      departmentId: company.departments[0]!.id,
    })
    ctx.emit('digital-employees/before-delete', EMPLOYEE_CHAT)
    await vi.waitFor(async () => {
      expect(await ctx.companies.listBindings()).toEqual([])
    })
  })
})
