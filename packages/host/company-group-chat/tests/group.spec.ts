import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Companies, { createCompanyEmployeeId, type CompanyId } from '@deepseek-ai/dsh-company'
import { FileCompanyProvider } from '@deepseek-ai/dsh-company-file'
import SessionStore from '@deepseek-ai/dsh-session'
import { appendTaskLifecycleEvent, taskEventsInternals } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { whereaboutsInternals } from '@deepseek-ai/dsh-digital-employee-file/whereabouts'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import CompanyGroupChatGateway from '../src/index.ts'
import type { CompanyGroupMember, CompanyGroupView } from '../src/types.ts'

const EMPLOYEE_A = createCompanyEmployeeId('group-member-a')
const EMPLOYEE_B = createCompanyEmployeeId('group-member-b')
const EMPLOYEE_FREE = createCompanyEmployeeId('group-unbound')

/** Public surface the tests drive; avoids intersecting the class's privates. */
interface TestGateway {
  openCompanyGroup(companyId: CompanyId): Promise<CompanyGroupView>
  sendCompanyGroupMessage(companyId: CompanyId, text: string): Promise<CompanyGroupView>
  deliverFromComposer(sessionId: string, text: string): Promise<boolean>
  reportEmployeeVisit(request: { employeeId: string; place: string }): Promise<{ lastPlace: string; visits: unknown[] }>
  employeePresence(request: { employeeId: string }): Promise<{ lastPlace: string; visits: unknown[] }>
  settle(): Promise<void>
  pollTaskEvents(): Promise<void>
}

interface FakeHandle {
  agent: {
    whenIdle: () => Promise<void>
    session: { events: readonly unknown[] }
  }
  dispose: () => Promise<void>
}

function fakeHandle(text: string): FakeHandle {
  return {
    agent: {
      whenIdle: () => Promise.resolve(),
      session: {
        events: [
          { type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } },
        ],
      },
    },
    dispose: vi.fn(async () => {}),
  }
}

async function harness(options: { createTask?: (request: unknown) => FakeHandle | Promise<FakeHandle> } = {}): Promise<{
  ctx: Context
  gateway: TestGateway
  companyId: CompanyId
  root: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-company-group-'))
  taskEventsInternals.path = join(root, 'task-events.jsonl')
  whereaboutsInternals.path = join(root, 'whereabouts.json')

  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(Companies)
  const store = new FileCompanyProvider(ctx, { path: join(root, 'companies.json') })
  await store.initialize()
  ctx.companies.configureProvider(store)

  ctx.provide('sessionPersistence', {
    list: vi.fn(async () => []),
    inspect: vi.fn(async (id: string) => { throw new Error(`no persisted session ${id}`) }),
  } as never)
  ctx.provide('digitalEmployees', {
    resolve: vi.fn(async (id: string) => ({
      instance: { displayName: id === EMPLOYEE_A ? '张三' : id === EMPLOYEE_B ? '李四' : '王五' },
    })),
  } as never)
  ctx.provide('digitalEmployeeAgent', {
    createTask: vi.fn(options.createTask ?? (() => fakeHandle('我在群里汇报。'))),
  } as never)

  await ctx.plugin(CompanyGroupChatGateway, { pollIntervalMs: 3_600_000 })
  const created = await ctx.companies.create({ name: '星桥科技' })
  await ctx.companies.assignEmployee({ instanceId: EMPLOYEE_A, companyId: created.id, departmentId: null })
  await ctx.companies.assignEmployee({ instanceId: EMPLOYEE_B, companyId: created.id, departmentId: null })
  return {
    ctx,
    gateway: ctx.companyGroupChat as unknown as TestGateway,
    companyId: created.id,
    root,
  }
}

function namesOf(view: CompanyGroupView): string[] {
  return view.members.map((member: CompanyGroupMember) => member.displayName)
}

describe('CompanyGroupChatGateway', () => {
  it('publishes a single non-conflicting group namespace', async () => {
    const { gateway } = await harness()
    expect(remoteMethods(gateway as never).map(method => method.method)).toEqual([
      'openCompanyGroup',
      'sendCompanyGroupMessage',
      'reportEmployeeVisit',
      'employeePresence',
    ])
  })

  it('stamps the opened marker before the title on creation', async () => {
    const { ctx, gateway, companyId } = await harness()
    const view = await gateway.openCompanyGroup(companyId)
    const session = ctx.sessions.get(view.sessionId as never)
    expect(session).toBeDefined()
    const kinds = session!.events.map(event => event.type)
    expect(kinds[0]).toBe('company-group/opened')
    expect(kinds[1]).toBe('session/title')
    expect(session!.events[0]!.data).toEqual({ companyId: String(companyId) })
    // Reopening stamps nothing new.
    await gateway.openCompanyGroup(companyId)
    expect(ctx.sessions.get(view.sessionId as never)!.events.filter(event => event.type === 'company-group/opened')).toHaveLength(1)
  })

  it('records and reads durable employee visit history', async () => {
    const { gateway } = await harness()
    const first = await gateway.reportEmployeeVisit({ employeeId: 'emp-presence', place: '吸烟区' })
    expect(first.lastPlace).toBe('吸烟区')
    await gateway.reportEmployeeVisit({ employeeId: 'emp-presence', place: '茶水区' })
    const presence = await gateway.employeePresence({ employeeId: 'emp-presence' })
    expect(presence.lastPlace).toBe('茶水区')
    expect(presence.visits.map(visit => (visit as { place: string }).place)).toEqual(['茶水区', '吸烟区'])
    const empty = await gateway.employeePresence({ employeeId: 'emp-unknown' })
    expect(empty.visits).toEqual([])
  })

  it('delivers composer submissions for group sessions only', async () => {
    const createTask = vi.fn((_request: unknown) => fakeHandle('群里收到。'))
    const harnessResult = await harness({ createTask })
    const { gateway } = harnessResult
    const companyId = harnessResult.companyId
    const view = await gateway.openCompanyGroup(companyId)
    expect(await gateway.deliverFromComposer(view.sessionId, '大家好')).toBe(true)
    const after = await gateway.openCompanyGroup(companyId)
    expect(after.messages.at(-1)).toEqual(expect.objectContaining({ speakerKind: 'user', text: '大家好' }))
    expect(await gateway.deliverFromComposer('session-unknown', 'x')).toBe(false)
  })

  it('opens the group idempotently', async () => {
    const { gateway, companyId } = await harness()
    const first = await gateway.openCompanyGroup(companyId)
    const second = await gateway.openCompanyGroup(companyId)
    expect(second.sessionId).toBe(first.sessionId)
    expect(first.companyName).toBe('星桥科技')
    expect(namesOf(first).sort()).toEqual(['张三', '李四'])
  })

  it('derives the roster from live bindings', async () => {
    const { ctx, gateway, companyId } = await harness()
    const view = await gateway.openCompanyGroup(companyId)
    expect(namesOf(view)).toEqual(['张三', '李四'])
    await ctx.companies.unassignEmployee({ instanceId: EMPLOYEE_B })
    const after = await gateway.openCompanyGroup(companyId)
    expect(namesOf(after)).toEqual(['张三'])
  })

  it('lands user messages and routes @mentions to speaking turns', async () => {
    const createTask = vi.fn((_request: unknown) => fakeHandle('收到，我去补Q3数据。'))
    const { gateway, companyId } = await harness({ createTask })
    const plain = await gateway.sendCompanyGroupMessage(companyId, '大家加油')
    expect(plain.messages).toEqual([
      expect.objectContaining({ speakerKind: 'user', displayName: '我', text: '大家加油' }),
    ])
    expect(createTask).not.toHaveBeenCalled()

    const mentioned = await gateway.sendCompanyGroupMessage(companyId, '@张三 周报补一下Q3')
    expect(mentioned.messages).toHaveLength(2)
    expect(createTask).toHaveBeenCalledTimes(1)
    await gateway.settle()
    const after = await gateway.openCompanyGroup(companyId)
    expect(after.messages).toHaveLength(3)
    expect(after.messages.at(-1)).toEqual(expect.objectContaining({
      speakerKind: 'employee',
      displayName: '张三',
      text: '收到，我去补Q3数据。',
    }))
    const request = createTask.mock.calls[0]?.[0] as { initialMessage?: { content: readonly { text?: string }[] } }
    expect(request.initialMessage?.content[0]?.text).toContain('@张三')
    expect(request.initialMessage?.content[0]?.text).toContain('Q3')
  })

  it('broadcasts task lifecycle facts once and skips unbound employees', async () => {
    const createTask = vi.fn((_request: unknown) => fakeHandle('任务搞定，产出在共享目录。'))
    const { gateway, companyId } = await harness({ createTask })
    await appendTaskLifecycleEvent({
      kind: 'succeeded', employeeId: EMPLOYEE_FREE, taskKey: 'free', taskTitle: '游离任务', at: 1,
    })
    await gateway.pollTaskEvents()
    expect(createTask).not.toHaveBeenCalled()

    await appendTaskLifecycleEvent({
      kind: 'succeeded', employeeId: EMPLOYEE_A, taskKey: 'weekly', taskTitle: '整理周报', at: 2,
    })
    await appendTaskLifecycleEvent({
      kind: 'failed', employeeId: EMPLOYEE_B, taskKey: 'export', taskTitle: '导出报表', at: 3, reason: 'blocked', suspended: true,
    })
    await gateway.pollTaskEvents()
    await gateway.settle()
    expect(createTask).toHaveBeenCalledTimes(2)

    await gateway.pollTaskEvents()
    await gateway.settle()
    expect(createTask).toHaveBeenCalledTimes(2)

    const view = await gateway.openCompanyGroup(companyId)
    expect(view.messages.filter(message => message.speakerKind === 'employee')).toHaveLength(2)
    expect(view.messages.some(message => message.context === 'task:2')).toBe(true)
    expect(view.messages.some(message => message.context === 'task:3')).toBe(true)
  })

  it('falls back to the deterministic line when the speaking turn fails', async () => {
    const createTask = vi.fn(async (_request: unknown) => {
      throw new Error('llm unavailable')
    })
    const { gateway, companyId } = await harness({ createTask })
    await gateway.pollTaskEvents()
    await appendTaskLifecycleEvent({
      kind: 'succeeded', employeeId: EMPLOYEE_A, taskKey: 'weekly', taskTitle: '整理周报', at: 1,
    })
    await gateway.pollTaskEvents()
    await gateway.settle()
    const view = await gateway.openCompanyGroup(companyId)
    expect(view.messages.at(-1)).toEqual(expect.objectContaining({
      speakerKind: 'employee',
      displayName: '张三',
      text: '任务完成「整理周报」',
    }))
  })
})
