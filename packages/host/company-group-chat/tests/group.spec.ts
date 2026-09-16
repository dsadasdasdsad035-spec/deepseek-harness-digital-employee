import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Companies, { createCompanyEmployeeId, type CompanyId } from '@deepseek-ai/dsh-company'
import { FileCompanyProvider } from '@deepseek-ai/dsh-company-file'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { appendTaskLifecycleEvent, taskEventsInternals } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { whereaboutsInternals } from '@deepseek-ai/dsh-digital-employee-file/whereabouts'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import CompanyGroupChatGateway from '../src/index.ts'
import type { CompanyGroupMember, CompanyGroupView } from '../src/types.ts'
import { MockAdapter, textResponse } from './mock-adapter.ts'

const EMPLOYEE_A = createCompanyEmployeeId('group-member-a')
const EMPLOYEE_B = createCompanyEmployeeId('group-member-b')
const EMPLOYEE_FREE = createCompanyEmployeeId('group-unbound')

/** Public surface the tests drive; avoids intersecting the class's privates. */
interface TestGateway {
  openCompanyGroup(companyId: CompanyId): Promise<CompanyGroupView>
  listCompanyGroupMembers(companyId: CompanyId): Promise<CompanyGroupMember[]>
  cancelCompanyGroupTurn(companyId: CompanyId): boolean
  reportEmployeeVisit(request: { employeeId: string; place: string }): Promise<{ lastPlace: string; visits: unknown[] }>
  employeePresence(request: { employeeId: string }): Promise<{ lastPlace: string; visits: unknown[] }>
  settle(): Promise<void>
  pollNow(): Promise<void>
}

interface Harness {
  ctx: Context
  gateway: TestGateway
  companyId: CompanyId
  adapter: MockAdapter
  createTask: ReturnType<typeof vi.fn>
  resumeTask: ReturnType<typeof vi.fn>
  readonly sessionOf: (id: string) => Session | undefined
  readonly persistenceList: ReturnType<typeof vi.fn>
}

async function harness(
  script: ConstructorParameters<typeof MockAdapter>[0] = [],
  gatewayConfig: { memberMemoryProjectionLimit?: number } = {},
): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-company-group-'))
  taskEventsInternals.path = join(root, 'task-events.jsonl')
  whereaboutsInternals.path = join(root, 'whereabouts.json')

  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  await ctx.plugin(Companies)
  const store = new FileCompanyProvider(ctx, { path: join(root, 'companies.json') })
  await store.initialize()
  ctx.companies.configureProvider(store)

  const persistenceList = vi.fn(async () => [] as { id: string }[])
  ctx.provide('sessionPersistence', {
    list: persistenceList,
    inspect: vi.fn(async (id: string) => { throw new Error(`no persisted session ${id}`) }),
  } as never)
  ctx.provide('digitalEmployees', {
    resolve: vi.fn(async (id: string) => ({
      instance: { displayName: id === EMPLOYEE_A ? '张三' : id === EMPLOYEE_B ? '李四' : '王五' },
    })),
  } as never)
  // Member sessions are real loop agents: the composition mock only fixes the
  // deterministic session identity and the mock route.
  const createTask = vi.fn(async (request: {
    sessionId: string
    meta?: Record<string, unknown>
  }) => (await ctx.agents.create({
    sessionId: SessionId(request.sessionId),
    ...request.meta === undefined ? {} : { meta: request.meta },
    agentOptions: { provider: 'mock', model: 'mock' },
  })))
  const resumeTask = vi.fn(async (request: { resumeSessionId: string }) => {
    throw new Error(`unexpected resumeTask ${request.resumeSessionId}`)
  })
  ctx.provide('digitalEmployeeAgent', { createTask, resumeTask } as never)

  await ctx.plugin(CompanyGroupChatGateway, { pollIntervalMs: 3_600_000, ...gatewayConfig })
  const created = await ctx.companies.create({ name: '星桥科技' })
  await ctx.companies.assignEmployee({ instanceId: EMPLOYEE_A, companyId: created.id, departmentId: null })
  await ctx.companies.assignEmployee({ instanceId: EMPLOYEE_B, companyId: created.id, departmentId: null })
  return {
    ctx,
    persistenceList,
    gateway: ctx.companyGroupChat as unknown as TestGateway,
    companyId: created.id,
    adapter,
    createTask,
    resumeTask,
    sessionOf: (id: string) => ctx.sessions.get(SessionId(id)),
  }
}

function namesOf(view: CompanyGroupView): string[] {
  return view.members.map((member: CompanyGroupMember) => member.displayName)
}

/** Drive one user message through the standard prompt path: the Lead followup. */
async function send(harnessResult: Harness, text: string): Promise<void> {
  const view = await harnessResult.gateway.openCompanyGroup(harnessResult.companyId)
  const lead = harnessResult.ctx.agents.get(SessionId(view.sessionId))
  expect(lead).toBeDefined()
  lead!.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  await lead!.whenIdle()
}

describe('CompanyGroupChatGateway', () => {
  it('publishes a single non-conflicting group namespace', async () => {
    const { gateway } = await harness()
    expect(remoteMethods(gateway as never).map(method => method.method)).toEqual([
      'openCompanyGroup',
      'listCompanyGroupMembers',
      'cancelCompanyGroupTurn',
      'reportEmployeeVisit',
      'employeePresence',
    ])
  })

  it('creates the Lead root agent and stamps the opened marker exactly once', async () => {
    const { ctx, gateway, companyId, sessionOf } = await harness()
    const view = await gateway.openCompanyGroup(companyId)
    const lead = ctx.agents.get(SessionId(view.sessionId))
    expect(lead).toBeDefined()
    const session = sessionOf(view.sessionId)
    expect(session).toBeDefined()
    const kinds = session!.events.map(event => event.type)
    expect(kinds[0]).toBe('company-group/opened')
    expect(kinds[1]).toBe('session/title')
    expect(session!.events[0]!.data).toEqual({ companyId: String(companyId) })
    await gateway.openCompanyGroup(companyId)
    expect(sessionOf(view.sessionId)!.events.filter(event => event.type === 'company-group/opened')).toHaveLength(1)
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

  it('opens the group idempotently with a roster derived from live bindings', async () => {
    const { ctx, gateway, companyId } = await harness()
    const first = await gateway.openCompanyGroup(companyId)
    const second = await gateway.openCompanyGroup(companyId)
    expect(second.sessionId).toBe(first.sessionId)
    expect(first.companyName).toBe('星桥科技')
    expect(namesOf(first).sort()).toEqual(['张三', '李四'])
    await ctx.companies.unassignEmployee({ instanceId: EMPLOYEE_B })
    const after = await gateway.openCompanyGroup(companyId)
    expect(namesOf(after)).toEqual(['张三'])
  })

  it('read-only member query returns the roster without opening the group', async () => {
    const { ctx, gateway, companyId, persistenceList } = await harness()
    const members = await gateway.listCompanyGroupMembers(companyId)
    expect(members.map(member => member.displayName).sort()).toEqual(['张三', '李四'])
    expect(members.map(member => member.departmentName)).toEqual(['未分配', '未分配'])

    // No group session was created and no persistence scan happened: the read
    // path must not carry openCompanyGroup's side effects.
    expect(ctx.sessions.list()).toHaveLength(0)
    expect(persistenceList).not.toHaveBeenCalled()

    await expect(gateway.listCompanyGroupMembers('company-missing' as CompanyId))
      .rejects.toThrow(/not found/)
  })

  it('read-only member query tracks live bindings', async () => {
    const { ctx, gateway, companyId } = await harness()
    await ctx.companies.unassignEmployee({ instanceId: EMPLOYEE_B })
    const members = await gateway.listCompanyGroupMembers(companyId)
    expect(members.map(member => member.displayName)).toEqual(['张三'])
  })

  it('lands mention-free user messages through the Lead with zero model calls', async () => {
    const harnessResult = await harness([textResponse('unused')])
    const { gateway, companyId, adapter } = harnessResult
    await send(harnessResult, '大家加油')
    const view = await gateway.openCompanyGroup(companyId)
    expect(view.messages).toEqual([
      expect.objectContaining({ speakerKind: 'user', displayName: '我', text: '大家加油' }),
    ])
    expect(view.messages.some(message => message.speakerKind === 'employee')).toBe(false)
    expect(adapter.requests).toHaveLength(0)
    const session = harnessResult.sessionOf(view.sessionId)!
    expect(session.events.some(event => event.type === 'company-group/turn-queued')).toBe(false)
  })

  it('routes @mentions into a continuable member session that speaks back into the group', async () => {
    const harnessResult = await harness([textResponse('收到，我去补Q3数据。')])
    const { gateway, companyId, adapter, createTask } = harnessResult
    await send(harnessResult, '@张三 周报补一下Q3')
    await gateway.settle()

    const view = await gateway.openCompanyGroup(companyId)
    expect(view.messages).toEqual([
      expect.objectContaining({ speakerKind: 'user', text: '@张三 周报补一下Q3' }),
      expect.objectContaining({ speakerKind: 'employee', displayName: '张三', text: '收到，我去补Q3数据。' }),
    ])

    // Exactly one model call: the member turn. The Lead routed deterministically.
    expect(adapter.requests).toHaveLength(1)
    const request = adapter.requests[0]!
    const deliveredText = (request.messages.at(-1)?.content as readonly { type: string; text?: string }[])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    expect(deliveredText).toContain('@张三')
    expect(deliveredText).toContain('Q3')

    // The member session is a persistent subagent-fenced loop session whose
    // injected delivery landed as a real user message.
    expect(createTask).toHaveBeenCalledTimes(1)
    const memberSessionId = (createTask.mock.calls[0]?.[0] as { sessionId: string }).sessionId
    expect(memberSessionId).toBe(`session-group-member-${String(companyId)}-${String(EMPLOYEE_A)}`)
    const member = harnessResult.sessionOf(memberSessionId)!
    expect(member).toBeDefined()
    expect(member.events.some(event => event.type === 'user/message')).toBe(true)
    expect(member.events.some(event => event.type === 'assistant/message')).toBe(true)
    expect(member.events.some(event => event.type === 'assistant/chunk')).toBe(true)
    expect(member.header.origin).toBe('subagent')

    const groupSession = harnessResult.sessionOf(view.sessionId)!
    const queued = groupSession.events.find(event => event.type === 'company-group/turn-queued')
    expect(queued).toBeDefined()
    expect(groupSession.events.some(event =>
      event.type === 'company-group/turn-delivered'
      && event.data.queueSeq === queued!.seq)).toBe(true)
  })

  it('projects bounded member memory into fresh member sessions at the configured bound', async () => {
    const defaultRun = await harness([textResponse('收到。')])
    await send(defaultRun, '@张三 看看')
    await defaultRun.gateway.settle()
    expect(defaultRun.createTask).toHaveBeenCalledWith(expect.objectContaining({
      memory: { text: '', scopes: ['long-term'], limit: 5 },
    }) as unknown)

    const customRun = await harness([textResponse('收到。')], { memberMemoryProjectionLimit: 3 })
    await send(customRun, '@张三 看看')
    await customRun.gateway.settle()
    expect(customRun.createTask).toHaveBeenCalledWith(expect.objectContaining({
      memory: { text: '', scopes: ['long-term'], limit: 3 },
    }) as unknown)
  })

  it('passes the memory query to cold-resumed member sessions', async () => {
    const harnessResult = await harness([textResponse('第一轮。'), textResponse('第二轮。')])
    const { gateway, companyId, createTask, resumeTask, persistenceList } = harnessResult
    await send(harnessResult, '@张三 第一轮')
    await gateway.settle()
    const memberSessionId = (createTask.mock.calls[0]?.[0] as { sessionId: string }).sessionId

    // The member session now counts as persisted; simulate a restart by
    // dropping the in-process handles so the next mention takes the resume path.
    persistenceList.mockResolvedValue([{ id: memberSessionId }])
    // Dispose the owned handle: it unregisters the live agent so the gateway's
    // live-agent lookup misses and the persisted branch takes over.
    const handles = (gateway as unknown as {
      memberHandles: Map<string, { dispose(): Promise<void> }>
    }).memberHandles
    await handles.get(memberSessionId)?.dispose()
    handles.clear()
    await send(harnessResult, '@张三 第二轮')
    await gateway.settle()
    expect(createTask).toHaveBeenCalledTimes(1)
    expect(resumeTask).toHaveBeenCalledWith(expect.objectContaining({
      resumeSessionId: memberSessionId,
      memory: { text: '', scopes: ['long-term'], limit: 5 },
    }) as unknown)
    expect(companyId).toBeDefined()
  })

  it('reuses one member session across turns and queues one delivery per mention', async () => {
    const harnessResult = await harness([
      textResponse('第一轮回复。'),
      textResponse('第二轮回复。'),
      textResponse('李四也收到。'),
    ])
    const { gateway, companyId, createTask } = harnessResult
    await send(harnessResult, '@张三 第一次')
    await gateway.settle()
    await send(harnessResult, '@张三 @李四 第二次')
    await gateway.settle()

    expect(createTask).toHaveBeenCalledTimes(2)
    const view = await gateway.openCompanyGroup(companyId)
    expect(view.messages.filter(message => message.speakerKind === 'employee').map(message => message.text))
      .toEqual(['第一轮回复。', '第二轮回复。', '李四也收到。'])
    const memberSessionId = (createTask.mock.calls[0]?.[0] as { sessionId: string }).sessionId
    const member = harnessResult.sessionOf(memberSessionId)!
    expect(member.events.filter(event => event.type === 'user/message')).toHaveLength(2)
  })

  it('broadcasts task lifecycle facts once, deduped by log cursor, skipping unbound employees', async () => {
    const harnessResult = await harness([
      textResponse('周报整理完毕。'),
      textResponse('导出失败已挂起，稍后重试。'),
    ])
    const { gateway, companyId, createTask } = harnessResult
    await appendTaskLifecycleEvent({
      kind: 'succeeded', employeeId: EMPLOYEE_FREE, taskKey: 'free', taskTitle: '游离任务', at: 1,
    })
    await gateway.pollNow()
    expect(createTask).not.toHaveBeenCalled()

    await appendTaskLifecycleEvent({
      kind: 'succeeded', employeeId: EMPLOYEE_A, taskKey: 'weekly', taskTitle: '整理周报', at: 2,
    })
    await appendTaskLifecycleEvent({
      kind: 'failed', employeeId: EMPLOYEE_B, taskKey: 'export', taskTitle: '导出报表', at: 3, reason: 'blocked', suspended: true,
    })
    await gateway.pollNow()
    await gateway.settle()
    expect(createTask).toHaveBeenCalledTimes(2)

    await gateway.pollNow()
    await gateway.settle()
    expect(createTask).toHaveBeenCalledTimes(2)

    const view = await gateway.openCompanyGroup(companyId)
    const broadcasts = view.messages.filter(message => message.speakerKind === 'employee')
    expect(broadcasts.map(message => message.displayName).sort()).toEqual(['张三', '李四'])
  })

  it('degrades to the deterministic line when the member turn fails', async () => {
    // Empty script: the member loop's first model call fails, so the turn
    // produces no utterance and the delivery settles on the fallback line.
    const harnessResult = await harness()
    const { gateway, companyId } = harnessResult
    // First poll boots the cursor without backfilling history.
    await gateway.pollNow()
    await appendTaskLifecycleEvent({
      kind: 'succeeded', employeeId: EMPLOYEE_A, taskKey: 'weekly', taskTitle: '整理周报', at: 1,
    })
    await gateway.pollNow()
    await gateway.settle()
    const view = await gateway.openCompanyGroup(companyId)
    expect(view.messages.at(-1)).toEqual(expect.objectContaining({
      speakerKind: 'employee',
      displayName: '张三',
      text: '任务完成「整理周报」',
    }))
    const session = harnessResult.sessionOf(view.sessionId)!
    expect(session.events.some(event => event.type === 'company-group/turn-delivered')).toBe(true)
  })

  it('replays queued-but-undelivered turns discovered in the group log', async () => {
    const harnessResult = await harness([textResponse('重启后补发。')])
    const { gateway, companyId } = harnessResult
    const view = await gateway.openCompanyGroup(companyId)
    const session = harnessResult.sessionOf(view.sessionId)!
    // Simulate a host restart that left one delivery queued but unsettled.
    session.append('company-group/turn-queued', {
      employeeId: EMPLOYEE_A,
      memberSessionId: `session-group-member-${String(companyId)}-${String(EMPLOYEE_A)}`,
      displayName: '张三',
      situation: '你在公司「星桥科技」的员工群里。请简短汇报重启后的状态。只输出要发到群里的发言内容。',
      context: '重启后的状态',
    })
    await gateway.openCompanyGroup(companyId)
    await gateway.settle()
    const after = await gateway.openCompanyGroup(companyId)
    expect(after.messages.at(-1)).toEqual(expect.objectContaining({
      speakerKind: 'employee',
      displayName: '张三',
      text: '重启后补发。',
    }))
  })

  it('drops queued deliveries whose member left the roster', async () => {
    const harnessResult = await harness([textResponse('不应到达。')])
    const { gateway, companyId, ctx, createTask } = harnessResult
    const view = await gateway.openCompanyGroup(companyId)
    const session = harnessResult.sessionOf(view.sessionId)!
    session.append('company-group/turn-queued', {
      employeeId: EMPLOYEE_B,
      memberSessionId: `session-group-member-${String(companyId)}-${String(EMPLOYEE_B)}`,
      displayName: '李四',
      situation: '你在公司群里。请发言。',
      context: '成员发言',
    })
    await ctx.companies.unassignEmployee({ instanceId: EMPLOYEE_B })
    await gateway.openCompanyGroup(companyId)
    await gateway.settle()
    expect(createTask).not.toHaveBeenCalled()
    const after = await gateway.openCompanyGroup(companyId)
    expect(after.messages.some(message => message.speakerKind === 'employee')).toBe(false)
    const queued = session.events.find(event => event.type === 'company-group/turn-queued')
    expect(session.events.some(event =>
      event.type === 'company-group/turn-delivered' && event.data.queueSeq === queued!.seq)).toBe(true)
  })

  it('cancels a hanging member turn and degrades to the fallback line', async () => {
    const harnessResult = await harness(['hang'])
    const { gateway, companyId, adapter } = harnessResult
    await send(harnessResult, '@张三 卡住的任务')
    // The hanging stream starting proves the member turn is live and cancelable.
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
    expect(gateway.cancelCompanyGroupTurn(companyId)).toBe(true)
    await gateway.settle()
    const view = await gateway.openCompanyGroup(companyId)
    expect(view.messages.at(-1)).toEqual(expect.objectContaining({
      speakerKind: 'employee',
      displayName: '张三',
      text: '回复 @张三 的消息',
    }))
    expect(gateway.cancelCompanyGroupTurn(companyId)).toBe(false)
  })
})
