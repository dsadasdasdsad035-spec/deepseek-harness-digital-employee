/** Per-company work groups: a Lead-routed group session driving continuable employee member sessions. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type { CompanyId, CompanyRecord, DigitalEmployeeInstanceId } from '@deepseek-ai/dsh-company'
import type {} from '@deepseek-ai/dsh-company'
import type {} from '@deepseek-ai/dsh-digital-employee-agent'
import type { TaskLifecycleEvent } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { listTaskLifecycleEvents } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { readWhereabouts, reportVisit } from '@deepseek-ai/dsh-digital-employee-file/whereabouts'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session, type SessionEvent, type UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CompanyGroupMember,
  CompanyGroupMessage,
  CompanyGroupMessageEvent,
  CompanyGroupTurnQueuedEvent,
  CompanyGroupView,
  EmployeePresenceRequest,
  EmployeePresenceView,
  ReportEmployeeVisitRequest,
} from '@deepseek-ai/dsh-host-company-group-chat/types'

/** Task lifecycle poll cadence; the same interval class as busy derivation. */
const DEFAULT_POLL_INTERVAL_MS = 5_000
/** Ceiling on one member turn before it is cancelled and degrades to the fallback line. */
const DEFAULT_TURN_TIMEOUT_MS = 120_000
/** Group-context snapshot bounds handed to every member delivery. */
const SNAPSHOT_MAX_MESSAGES = 12
const SNAPSHOT_MAX_CHARS = 2_000
const TASK_KIND_TEXT = { started: '领到任务', succeeded: '任务完成', failed: '任务失败' } as const

/** Gateway configuration. */
export interface Config {
  /** Milliseconds between task lifecycle log polls. */
  pollIntervalMs?: number
  /** Milliseconds before one member turn is cancelled and degrades to its fallback line. */
  turnTimeoutMs?: number
  /** Most-recent long-term memories projected into each member session. */
  memberMemoryProjectionLimit?: number
}

/** Fold the last non-empty assistant text of one event window. */
function lastAssistantText(events: readonly SessionEvent[]): string {
  let text = ''
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const joined = event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    if (joined !== '') text = joined
  }
  return text
}

/** Fold the text blocks of one user message. */
function userText(message: UserMessage): string {
  return message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** One pending delivery folded from the group log. */
interface QueuedDelivery {
  readonly queueSeq: number
  readonly employeeId: DigitalEmployeeInstanceId
  readonly memberSessionId: string
  readonly situation: string
  readonly context: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Per-company work group gateway. */
    companyGroupChat: CompanyGroupChatGateway
  }
}

/** Lead-routed company groups assembled from existing services. */
export class CompanyGroupChatGateway extends TypertRemoteService {
  static inject = ['agents', 'companies', 'digitalEmployeeAgent', 'digitalEmployees', 'sessions', 'sessionPersistence']
  static Config: z<Config> = z.object({
    pollIntervalMs: z.number().min(500).default(DEFAULT_POLL_INTERVAL_MS),
    turnTimeoutMs: z.number().min(1_000).default(DEFAULT_TURN_TIMEOUT_MS),
    memberMemoryProjectionLimit: z.number().step(1).min(1).max(50).default(5),
  })
  private readonly pollIntervalMs: number
  private readonly turnTimeoutMs: number
  private readonly memberMemoryProjectionLimit: number
  /** Cursor over the task lifecycle log; -1 until the first poll skips history. */
  private taskCursor = -1
  /** Lead root-agent handles keyed by group session id. */
  private readonly leadHandles = new Map<SessionId, AgentHandle>()
  /** Member continuable-agent handles keyed by member session id. */
  private readonly memberHandles = new Map<SessionId, AgentHandle>()
  /** In-flight per-member delivery chains keyed by `<companyId>/<employeeId>`. */
  private readonly pumps = new Map<string, Promise<void>>()
  /** Member agents currently mid-turn, keyed by member session id; cancel targets. */
  private readonly speaking = new Map<SessionId, Agent>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'companyGroupChat', { namespace: 'companyGroups' })
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.turnTimeoutMs = config.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS
    this.memberMemoryProjectionLimit = config.memberMemoryProjectionLimit ?? 5
    ctx.effect(() => {
      const timer = setInterval(() => { void this.pollTaskEvents() }, this.pollIntervalMs)
      return () => { clearInterval(timer) }
    })
    ctx.effect(() => () => { void this.releaseHandles() })
    // The router must ride every Lead resurrection, not just the gateway's own
    // ensureGroup path: a cold group resumed by apiproxy's generic agentFor
    // (session.list/history/prompt after a browser refresh) still needs the
    // pre-step router, or its Lead falls back to an ordinary assistant reply.
    ctx.on('agent/session-start', ({ agent }) => {
      void this.mountLeadRouterForLive(agent)
    })
  }

  /** Open (or create) one company's group and return its current view.
   * @param companyId - the company whose group opens.
   * @returns the group view: members, quoted messages, and the session id.
   */
  @Remote('openCompanyGroup')
  async openCompanyGroup(companyId: CompanyId): Promise<CompanyGroupView> {
    const group = await this.ensureGroup(companyId)
    // A host restart leaves queued-not-delivered turns in the log; resume them.
    this.dispatchPending(group)
    return await this.viewOf(group.company, group.session)
  }

  /** Read one company's current group roster without opening its group.
   *
   * Read-only by contract: the mention picker re-queries on every keystroke, so
   * this must not create the group session, dispatch queued deliveries, or
   * consult session persistence — that work belongs to
   * {@link CompanyGroupChatGateway.openCompanyGroup}.
   * @param companyId - the company whose bound members are read.
   * @returns the company's current group members with resolved display names.
   */
  @Remote('listCompanyGroupMembers')
  async listCompanyGroupMembers(companyId: CompanyId): Promise<CompanyGroupMember[]> {
    const company = await this.ctx.companies.get(companyId)
    if (company === undefined) throw new Error(`company group: company "${companyId}" not found`)
    return await this.rosterOf(company)
  }

  /** Cancel the currently speaking member turn of one company's group.
   * @param companyId - the company whose speaking member is cancelled.
   * @returns true when a live member turn was cancelled.
   */
  @Remote('cancelCompanyGroupTurn')
  cancelCompanyGroupTurn(companyId: CompanyId): boolean {
    for (const session of this.ctx.sessions.list()) {
      if (!session.id.startsWith(this.memberSessionPrefix(companyId))) continue
      const agent = this.speaking.get(session.id)
      if (agent === undefined) continue
      agent.cancel({ kind: 'user' })
      return true
    }
    return false
  }

  /** Record one employee amenity arrival into the durable history.
   * @param request - the arriving employee and the amenity place name.
   * @returns the updated presence view.
   */
  @Remote('reportEmployeeVisit')
  async reportEmployeeVisit(request: ReportEmployeeVisitRequest): Promise<EmployeePresenceView> {
    return await reportVisit(request.employeeId, request.place, Date.now())
  }

  /** Read one employee's durable visit history.
   * @param request - the employee whose presence is read.
   * @returns the presence view, or an empty history for unknown employees.
   */
  @Remote('employeePresence')
  async employeePresence(request: EmployeePresenceRequest): Promise<EmployeePresenceView> {
    const store = await readWhereabouts()
    return store[request.employeeId] ?? {
      employeeId: request.employeeId,
      lastSeenAt: 0,
      lastPlace: '',
      visits: [],
    }
  }

  /** Wait for every in-flight member delivery chain to drain. */
  async settle(): Promise<void> {
    while (this.pumps.size > 0) {
      await Promise.all([...this.pumps.values()].map(pump => pump.catch(() => undefined)))
    }
  }

  /** Run one lifecycle-log poll immediately instead of waiting the interval.
   * @returns when the poll (and any queued trigger routing) completes.
   */
  async pollNow(): Promise<void> {
    await this.pollTaskEvents()
  }

  /** Get or create the company's group session with its Lead root Agent.
   * @param companyId - the owning company id.
   * @returns the company record and its live group session.
   */
  private async ensureGroup(companyId: CompanyId): Promise<{ company: CompanyRecord; session: Session }> {
    const company = await this.ctx.companies.get(companyId)
    if (company === undefined) throw new Error(`company group: company "${companyId}" not found`)
    const id = this.groupSessionId(companyId)
    const live = this.ctx.agents.get(id)
    if (live !== undefined) return { company, session: live.session }
    const persistence = this.sessionPersistence()
    const persisted = persistence !== undefined
      && (await persistence.list()).some(header => header.id === id)
    const selection = this.defaultModelSelection()
    const agentOptions = selection === undefined ? {} : { agentOptions: { ...selection } }
    const setup = (agentCtx: Context): void => {
      const agent = agentCtx.agent
      if (agent === undefined) throw new Error('company group Lead setup has no scoped Agent')
      if (!agent.session.events.some(event => event.type === 'company-group/opened')) {
        agent.session.append('company-group/opened', { companyId })
        agent.session.append('session/title', { title: `${company.name} 群`, messageSeqs: [], source: { kind: 'fallback' } })
      }
    }
    const handle = persisted
      ? await this.ctx.agents.resume({ resumeSessionId: id, ...agentOptions, setup })
      : await this.ctx.agents.create({
        sessionId: id,
        meta: { cwd: process.cwd() },
        ...agentOptions,
        setup,
      })
    this.leadHandles.set(id, handle)
    return { company, session: handle.agent.session }
  }

  /** Attach the mention router to a live group Lead, whichever path resumed it.
   * @param agent - the live Lead whose session carries the opened marker.
   */
  private async mountLeadRouterForLive(agent: Agent): Promise<void> {
    const opened = agent.session.events.find(event => event.type === 'company-group/opened')
    if (opened === undefined) return
    const company = await this.ctx.companies.get(opened.data.companyId as CompanyId)
    if (company === undefined) return
    this.mountLeadRouter(agent.ctx, company)
  }

  /** Deterministic mention routing on the Lead: land the user message, queue
   * deliveries, and end the turn without spending any model call.
   * @param agentCtx - the Lead's scoped Agent context.
   * @param company - the owning company record captured at Lead creation.
   */
  private mountLeadRouter(agentCtx: Context, company: CompanyRecord): void {
    agentCtx.on('agent/pre-step', async (payload: {
      messages: UserMessage[]
      signal: AbortSignal
    }, next: () => Promise<{ kind: 'reject' } | { kind: 'enter'; messages: UserMessage[] }>) => {
      const texts = payload.messages
        .filter(message => message.source.kind === 'user')
        .map(message => userText(message))
      if (texts.length === 0) return await next()
      payload.signal.throwIfAborted()
      const agent = agentCtx.agent
      if (agent === undefined) return await next()
      const text = texts.join('\n')
      const session = agent.session
      session.append('company-group/message', { speakerKind: 'user', displayName: '我', text })
      const roster = await this.rosterOf(company)
      for (const member of roster) {
        if (!text.includes(`@${member.displayName}`)) continue
        session.append('company-group/turn-queued', {
          employeeId: member.employeeId,
          memberSessionId: this.memberSessionId(company.id, member.employeeId),
          displayName: member.displayName,
          situation: `你在公司「${company.name}」的员工群里。群里用户「@${member.displayName}」对你说：${text}。请以你自己的身份、风格和判断回复；如需补充细节可以用你的工具。只输出要发到群里的发言内容。`,
          context: `回复 @${member.displayName} 的消息`,
        })
      }
      this.dispatchPending({ company, session })
      return { kind: 'enter', messages: [] }
    })
  }

  /** Resolve the deterministic group session identity of one company. */
  private groupSessionId(companyId: CompanyId): SessionId {
    return SessionId(`session-company-group-${companyId}`)
  }

  /** Resolve the deterministic member session identity of one company employee. */
  private memberSessionId(companyId: CompanyId, employeeId: DigitalEmployeeInstanceId): string {
    return `session-group-member-${companyId}-${employeeId}`
  }

  /** Prefix of every member session id under one company. */
  private memberSessionPrefix(companyId: CompanyId): string {
    return `session-group-member-${companyId}-`
  }

  /** The deployment's default model selection: the Lead needs a route so
   * standard prompt admission accepts it (routing itself never spends a model
   * call), and member sessions need it so prompt assembly resolves the
   * persona's model variable. Absent when the deployment configures none —
   * every consumer degrades loudly from its own failure path. */
  private defaultModelSelection(): { provider: string; model: string } | undefined {
    const defaults = this.ctx.get('agentDefaultModel') as
      | { currentSelection(): { provider: string; model: string } }
      | undefined
    return defaults?.currentSelection()
  }

  /** The persistence backend, when mounted. */
  private sessionPersistence(): { list(): Promise<readonly { id: string }[]> } | undefined {
    return this.ctx.get('sessionPersistence')
  }

  /** Derive the live roster from the company's current bindings.
   * @param company - the company record.
   * @returns one member per bound instance with resolved display names.
   */
  private async rosterOf(company: CompanyRecord): Promise<CompanyGroupMember[]> {
    const bindings = await this.ctx.companies.listBindings()
    const members: CompanyGroupMember[] = []
    for (const binding of bindings) {
      if (binding.companyId !== company.id) continue
      try {
        const resolved = await this.ctx.digitalEmployees.resolve(binding.instanceId)
        const department = company.departments.find(entry => entry.id === binding.departmentId)
        members.push({
          employeeId: binding.instanceId,
          displayName: resolved.instance.displayName,
          departmentName: department === undefined ? '未分配' : department.name,
        })
      } catch {
        // A binding whose instance no longer resolves is pruned elsewhere; skip it.
      }
    }
    return members
  }

  /** Project the group view from the live session and bindings.
   * @param company - the company record.
   * @param session - the group's live session.
   * @returns the group view.
   */
  private async viewOf(company: CompanyRecord, session: Session): Promise<CompanyGroupView> {
    return {
      companyId: company.id,
      companyName: company.name,
      sessionId: session.id,
      members: await this.rosterOf(company),
      messages: this.messagesOf(session),
    }
  }

  /** Fold the group's quoted messages from its event log.
   * @param session - the group's live session.
   * @returns every quoted message in sequence order.
   */
  private messagesOf(session: Session): CompanyGroupMessage[] {
    const messages: CompanyGroupMessage[] = []
    for (const event of session.events) {
      if (event.type !== 'company-group/message') continue
      const data = event.data
      messages.push({
        seq: event.seq,
        speakerKind: data.speakerKind,
        ...(data.employeeId === undefined ? {} : { employeeId: data.employeeId }),
        displayName: data.displayName,
        text: data.text,
        ...(data.context === undefined ? {} : { context: data.context }),
      })
    }
    return messages
  }

  /** Fold queued-minus-delivered deliveries per employee in log order.
   * @param session - the group's live session.
   * @returns pending deliveries keyed by employee.
   */
  private pendingQueues(session: Session): Map<DigitalEmployeeInstanceId, QueuedDelivery[]> {
    const delivered = new Set<number>()
    for (const event of session.events) {
      if (event.type === 'company-group/turn-delivered') delivered.add(event.data.queueSeq)
    }
    const queues = new Map<DigitalEmployeeInstanceId, QueuedDelivery[]>()
    for (const event of session.events) {
      if (event.type !== 'company-group/turn-queued' || delivered.has(event.seq)) continue
      const data: CompanyGroupTurnQueuedEvent = event.data
      const queue = queues.get(data.employeeId) ?? []
      queue.push({
        queueSeq: event.seq,
        employeeId: data.employeeId,
        memberSessionId: data.memberSessionId,
        situation: data.situation,
        context: data.context,
      })
      queues.set(data.employeeId, queue)
    }
    return queues
  }

  /** Start one serial delivery chain per member with pending work.
   * @param group - the company and its live group session.
   */
  private dispatchPending(group: { company: CompanyRecord; session: Session }): void {
    for (const employeeId of this.pendingQueues(group.session).keys()) {
      const key = `${group.company.id}/${employeeId}`
      if (this.pumps.has(key)) continue
      const pump = this.pump(group.company.id, employeeId).finally(() => {
        this.pumps.delete(key)
      })
      this.pumps.set(key, pump)
    }
  }

  /** Deliver one member's pending queue in log order until it drains.
   * @param companyId - the owning company id.
   * @param employeeId - the member whose queue drains.
   */
  private async pump(companyId: CompanyId, employeeId: DigitalEmployeeInstanceId): Promise<void> {
    while (true) {
      const group = await this.ensureGroup(companyId)
      const next = (this.pendingQueues(group.session).get(employeeId) ?? [])[0]
      if (next === undefined) return
      await this.runOneDelivery(group, next)
    }
  }

  /** Settle exactly one queued delivery: speak, degrade, or drop.
   * @param group - the company and its live group session.
   * @param delivery - the folded delivery being settled.
   */
  private async runOneDelivery(
    group: { company: CompanyRecord; session: Session },
    delivery: QueuedDelivery,
  ): Promise<void> {
    const { company, session } = group
    const settle = (message?: CompanyGroupMessageEvent): void => {
      if (message !== undefined) session.append('company-group/message', message)
      session.append('company-group/turn-delivered', { queueSeq: delivery.queueSeq })
    }
    let displayName: string
    try {
      displayName = (await this.ctx.digitalEmployees.resolve(delivery.employeeId)).instance.displayName
    } catch {
      // The member instance no longer resolves: drop the delivery, keep the log cursor moving.
      settle()
      return
    }
    if (!(await this.rosterOf(company)).some(member => member.employeeId === delivery.employeeId)) {
      // Unbound since the delivery was queued: drop it.
      settle()
      return
    }
    try {
      const agent = await this.ensureMemberAgent(company, delivery.employeeId)
      const text = await this.deliverOne(agent, session, delivery, displayName)
      settle({
        speakerKind: 'employee',
        employeeId: delivery.employeeId,
        displayName,
        text,
        context: delivery.context,
      })
    } catch {
      settle({
        speakerKind: 'employee',
        employeeId: delivery.employeeId,
        displayName,
        text: delivery.context,
        context: delivery.context,
      })
    }
  }

  /** Get or resume one employee's continuable member Agent.
   * @param company - the owning company record.
   * @param employeeId - the member employee.
   * @returns the member's live Agent.
   */
  private async ensureMemberAgent(company: CompanyRecord, employeeId: DigitalEmployeeInstanceId): Promise<Agent> {
    const id = SessionId(this.memberSessionId(company.id, employeeId))
    const live = this.ctx.agents.get(id)
    if (live !== undefined) return live
    const persistence = this.sessionPersistence()
    const persisted = persistence !== undefined
      && (await persistence.list()).some(header => header.id === id)
    // The deployment's default model routes the member and resolves the
    // persona's {{model}} prompt variable; without it the member turn fails
    // loudly at prompt assembly.
    const selection = this.defaultModelSelection()
    // Members project their own most-recent long-term memories, fresh or
    // cold-resumed, so restored sessions see the same memory as new ones.
    const memory = { text: '', scopes: ['long-term'] as const, limit: this.memberMemoryProjectionLimit }
    const handle = persisted
      ? await this.ctx.digitalEmployeeAgent.resumeTask(selection === undefined
        ? { employeeId, resumeSessionId: id, memory }
        : {
          employeeId,
          resumeSessionId: id,
          memory,
          agentOptions: { provider: selection.provider, model: selection.model },
          modelSelection: { provider: selection.provider, model: selection.model },
        })
      : await this.ctx.digitalEmployeeAgent.createTask(selection === undefined
        ? {
          employeeId,
          sessionId: id,
          meta: { cwd: process.cwd(), origin: 'subagent', delegationDepth: 1 },
          memory,
        }
        : {
          employeeId,
          sessionId: id,
          meta: { cwd: process.cwd(), origin: 'subagent', delegationDepth: 1 },
          memory,
          agentOptions: { provider: selection.provider, model: selection.model },
          modelSelection: { provider: selection.provider, model: selection.model },
        })
    this.memberHandles.set(id, handle)
    return handle.agent
  }

  /** Run one member turn: inject situation plus a bounded group snapshot,
   * await settlement, and extract the utterance; cancel on timeout.
   * @param agent - the member's live Agent.
   * @param session - the group's live session for the context snapshot.
   * @param delivery - the delivery being run.
   * @param displayName - the member's display name for the snapshot frame.
   * @returns the member's utterance for the group log.
   */
  private async deliverOne(
    agent: Agent,
    session: Session,
    delivery: QueuedDelivery,
    displayName: string,
  ): Promise<string> {
    const before = agent.session.events.length
    const message = createUserMessage({
      content: [{ type: 'text', text: `${delivery.situation}\n\n${this.groupSnapshot(session, displayName)}` }],
      source: { kind: 'user' },
    })
    this.speaking.set(agent.id, agent)
    try {
      agent.followup(message)
      const timedOut = await Promise.race([
        agent.whenIdle().then(() => false),
        new Promise<boolean>((resolve) => {
          setTimeout(() => { resolve(true) }, this.turnTimeoutMs)
        }),
      ])
      if (timedOut) {
        agent.cancel({ kind: 'user' })
        await agent.whenIdle()
      }
    } finally {
      this.speaking.delete(agent.id)
    }
    const tail = agent.session.events.slice(before)
    const end = [...tail].reverse().find(event => event.type === 'turn/end')
    if (end !== undefined && end.data.reason.kind === 'completed') {
      const text = lastAssistantText(tail)
      if (text !== '') return text
    }
    throw new Error(`company group: member turn for "${displayName}" produced no utterance`)
  }

  /** Frame the bounded recent-group-context snapshot for one delivery.
   * @param session - the group's live session.
   * @param speakerName - the member about to speak; excluded from the snapshot.
   * @returns the framed snapshot text.
   */
  private groupSnapshot(session: Session, speakerName: string): string {
    const lines: string[] = []
    let chars = 0
    for (const message of this.messagesOf(session).slice(-SNAPSHOT_MAX_MESSAGES)) {
      if (message.displayName === speakerName && message.speakerKind === 'employee') continue
      const line = `${message.displayName}：${message.text}`
      if (chars + line.length > SNAPSHOT_MAX_CHARS) break
      chars += line.length
      lines.push(line)
    }
    return lines.length === 0 ? '（群里最近没有其他发言）' : `群里最近的发言：\n${lines.join('\n')}`
  }

  /** Poll the task lifecycle log and route unseen facts to company groups. */
  private pollTaskEvents(): Promise<void> {
    const run = async (): Promise<void> => {
      const events = await listTaskLifecycleEvents()
      if (this.taskCursor === -1) {
        // First poll after boot: groups broadcast from now on, never backfill.
        this.taskCursor = events.at(-1)?.seq ?? 0
        return
      }
      for (const event of events) {
        if (event.seq <= this.taskCursor) continue
        this.taskCursor = event.seq
        await this.routeTaskEvent(event)
      }
    }
    return run().catch(() => undefined)
  }

  /** Route one task lifecycle fact to the speaking employee's company group.
   * @param event - the lifecycle fact from the log.
   */
  private async routeTaskEvent(event: TaskLifecycleEvent): Promise<void> {
    const employeeId = event.employeeId as DigitalEmployeeInstanceId
    let displayName: string
    try {
      displayName = (await this.ctx.digitalEmployees.resolve(employeeId)).instance.displayName
    } catch {
      return
    }
    const binding = (await this.ctx.companies.listBindings()).find(entry => entry.instanceId === employeeId)
    if (binding === undefined) return
    const group = await this.ensureGroup(binding.companyId)
    const dedupKey = `task:${String(event.seq)}`
    if (group.session.events.some(candidate =>
      candidate.type === 'company-group/turn-queued' && candidate.data.dedupKey === dedupKey)) return
    const summary = `${TASK_KIND_TEXT[event.kind]}「${event.taskTitle}」${event.kind === 'failed' && event.suspended === true ? '（已挂起）' : ''}`
    group.session.append('company-group/turn-queued', {
      employeeId,
      memberSessionId: this.memberSessionId(binding.companyId, employeeId),
      displayName,
      situation: `你在公司「${group.company.name}」的员工群里。你的自主任务有新进展：${summary}。请以你自己的身份、风格和判断向群里的同事简短说明这件事；如需补充细节可以用你的工具。只输出要发到群里的发言内容。`,
      context: summary,
      dedupKey,
    })
    this.dispatchPending(group)
  }

  /** Dispose every Lead and member handle on gateway teardown. */
  private async releaseHandles(): Promise<void> {
    const handles = [...this.leadHandles.values(), ...this.memberHandles.values()]
    this.leadHandles.clear()
    this.memberHandles.clear()
    await Promise.all(handles.map(async (handle) => {
      try {
        await handle.dispose()
      } catch {
        // Teardown must not hang on one stuck handle; the runtime owns the rest.
      }
    }))
  }
}

export default CompanyGroupChatGateway
