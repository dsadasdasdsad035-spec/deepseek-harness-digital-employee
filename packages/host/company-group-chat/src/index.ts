/** Per-company work groups: event-sourced group sessions with employee-voiced task broadcasts. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type { CompanyId, CompanyRecord, DigitalEmployeeInstanceId } from '@deepseek-ai/dsh-company'
import type {} from '@deepseek-ai/dsh-company'
import type {} from '@deepseek-ai/dsh-digital-employee-agent'
import type { TaskLifecycleEvent } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { listTaskLifecycleEvents } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { readWhereabouts, reportVisit } from '@deepseek-ai/dsh-digital-employee-file/whereabouts'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CompanyGroupMember,
  CompanyGroupMessage,
  CompanyGroupMessageEvent,
  CompanyGroupView,
  EmployeePresenceRequest,
  EmployeePresenceView,
  ReportEmployeeVisitRequest,
} from '@deepseek-ai/dsh-host-company-group-chat/types'

/** Task lifecycle poll cadence; the same interval class as busy derivation. */
const DEFAULT_POLL_INTERVAL_MS = 5_000
/** Ceiling on one speaking turn before the deterministic fallback fires. */
const DEFAULT_TURN_TIMEOUT_MS = 120_000
const TASK_KIND_TEXT = { started: '领到任务', succeeded: '任务完成', failed: '任务失败' } as const

/** Gateway configuration. */
export interface Config {
  /** Milliseconds between task lifecycle log polls. */
  pollIntervalMs?: number
  /** Milliseconds before one speaking turn falls back to the deterministic line. */
  turnTimeoutMs?: number
}

/** Fold the last non-empty assistant text of one session. */
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

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Per-company work group gateway. */
    companyGroupChat: CompanyGroupChatGateway
  }
}

/** Remote-only facade assembling company groups from existing services. */
export class CompanyGroupChatGateway extends TypertRemoteService {
  static inject = ['companies', 'digitalEmployeeAgent', 'digitalEmployees', 'sessions', 'sessionPersistence']
  static Config: z<Config> = z.object({
    pollIntervalMs: z.number().min(500).default(DEFAULT_POLL_INTERVAL_MS),
    turnTimeoutMs: z.number().min(1_000).default(DEFAULT_TURN_TIMEOUT_MS),
  })
  private readonly pollIntervalMs: number
  private readonly turnTimeoutMs: number
  /** Cursor over the task lifecycle log; -1 until the first poll skips history. */
  private taskCursor = -1
  /** Serializes speaking turns so broadcasts never interleave. */
  private turnChain: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'companyGroupChat', { namespace: 'companyGroups' })
    this.pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    this.turnTimeoutMs = config.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS
    ctx.effect(() => {
      const timer = setInterval(() => { void this.pollTaskEvents() }, this.pollIntervalMs)
      return () => { clearInterval(timer) }
    })
    // Self-register the composer delivery whenever the API gateway is active;
    // either plugin may load first, and gateway-less compositions skip this.
    ctx.inject(['apiProxy'], (gatewayCtx: Context) => {
      const gateway = gatewayCtx.get('apiProxy') as unknown as {
        setGroupDelivery(delivery: (sessionId: string, text: string) => Promise<boolean>): void
      } | undefined
      gateway?.setGroupDelivery((sessionId: string, text: string) => this.deliverFromComposer(sessionId as SessionId, text))
    })
  }

  /** Open (or create) one company's group and return its current view.
   * @param companyId - the company whose group opens.
   * @returns the group view: members, quoted messages, and the session id.
   */
  @Remote('openCompanyGroup')
  async openCompanyGroup(companyId: CompanyId): Promise<CompanyGroupView> {
    const group = await this.ensureGroup(companyId)
    return await this.viewOf(group.company, group.session)
  }

  /** Land one user message in the group; @mentions route speaking turns.
   * @param companyId - the company whose group receives the message.
   * @param text - the user's message text.
   * @returns the group view after the message landed (turns stream later).
   */
  @Remote('sendCompanyGroupMessage')
  async sendCompanyGroupMessage(companyId: CompanyId, text: string): Promise<CompanyGroupView> {
    const group = await this.ensureGroup(companyId)
    this.appendMessage(group.session, { speakerKind: 'user', displayName: '我', text })
    const roster = await this.rosterOf(group.company)
    for (const member of roster) {
      if (!text.includes(`@${member.displayName}`)) continue
      this.enqueueTurn(
        group.company,
        member,
        `你在公司「${group.company.name}」的员工群里。群里用户「@${member.displayName}」对你说：${text}。请以你自己的身份、风格和判断回复；如需补充细节可以用你的工具。只输出要发到群里的发言内容。`,
        `收到 @${member.displayName} 的消息`,
      )
    }
    return await this.viewOf(group.company, group.session)
  }

  /** Get or create the company's group session.
   * @param companyId - the owning company id.
   * @returns the company record and its live group session.
   */
  private async ensureGroup(companyId: CompanyId): Promise<{ company: CompanyRecord; session: Session }> {
    const company = await this.ctx.companies.get(companyId)
    if (company === undefined) throw new Error(`company group: company "${companyId}" not found`)
    const id = this.groupSessionId(companyId)
    let existing = this.ctx.sessions.get(id)
    if (existing === undefined) {
      // A host restart left the group cold: restore its full history from
      // persistence into the live store instead of diverging on a fresh id.
      const persistence = this.ctx.get('sessionPersistence') as unknown as {
        list(): Promise<readonly { id: string }[]>
        inspect(id: string): Promise<{ events: readonly SessionEvent[]; meta: { cwd?: string; createdAt: number; agentPreset?: string } }>
      } | undefined
      if (persistence === undefined) throw new Error('company group: session persistence unavailable')
      const listed = (await persistence.list()).find(header => header.id === id)
      if (listed !== undefined) {
        const inspected = await (this.ctx.get('sessionPersistence') as unknown as { inspect(id: string): Promise<{ events: readonly SessionEvent[]; meta: { cwd?: string; createdAt: number; agentPreset?: string } }> }).inspect(id)
        existing = this.ctx.sessions.create(id, {
          seed: inspected.events.map(event => structuredClone(event)),
          meta: {
            ...inspected.meta.cwd === undefined ? {} : { cwd: inspected.meta.cwd },
            createdAt: inspected.meta.createdAt,
            ...inspected.meta.agentPreset === undefined ? {} : { agentPreset: inspected.meta.agentPreset },
          },
        })
      }
    }
    if (existing !== undefined) return { company, session: existing }
    const session = this.ctx.sessions.create(id, { meta: { cwd: process.cwd() } })
    session.append('company-group/opened', { companyId })
    session.append('session/title', { title: `${company.name} 群`, messageSeqs: [], source: { kind: 'fallback' } })
    return { company, session }
  }

  /** Wait for every queued speaking turn to settle.
   * @returns when the serialized turn chain is drained.
   */
  async settle(): Promise<void> {
    await this.turnChain
  }

  /** Run one lifecycle-log poll immediately instead of waiting the interval.
   * @returns when the poll (and any queued trigger routing) completes.
   */
  async pollNow(): Promise<void> {
    await this.pollTaskEvents()
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

  /** Deliver one composer submission when the target session is a group.
   * @param sessionId - the session the composer addressed.
   * @param text - the submitted text.
   * @returns true when the session is a company group and the message landed.
   */
  async deliverFromComposer(sessionId: SessionId, text: string): Promise<boolean> {
    const session = this.ctx.sessions.get(sessionId)
    if (session === undefined) {
      // Cold after a restart: the gateway owns its id scheme, so parse the
      // company and let ensureGroup restore or re-create the group.
      if (!sessionId.startsWith('session-company-group-')) return false
      const companyId = sessionId.slice('session-company-group-'.length)
      if (await this.ctx.companies.get(companyId as CompanyId) === undefined) return false
      const restored = await this.ensureGroup(companyId as CompanyId)
      this.appendMessage(restored.session, { speakerKind: 'user', displayName: '我', text })
      const roster = await this.rosterOf(restored.company)
      for (const member of roster) {
        if (!text.includes(`@${member.displayName}`)) continue
        this.enqueueTurn(restored.company, member,
          `你在公司「${restored.company.name}」的员工群里。群里用户「@${member.displayName}」对你说：${text}。请以你自己的身份、风格和判断回复；如需补充细节可以用你的工具。只输出要发到群里的发言内容。`,
          `回复 @${member.displayName} 的消息`)
      }
      return true
    }
    const marker = session.events.find(event => event.type === 'company-group/opened')
    if (marker === undefined) return false
    const companyId = (marker.data as { companyId: string }).companyId
    await this.sendCompanyGroupMessage(companyId as CompanyId, text)
    return true
  }

  /** Resolve the deterministic group session identity of one company. */
  private groupSessionId(companyId: CompanyId): SessionId {
    return SessionId(`session-company-group-${companyId}`)
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

  /** Append one quoted message event to the group session.
   * @param session - the group's live session.
   * @param payload - the message event payload.
   */
  private appendMessage(session: Session, payload: CompanyGroupMessageEvent): void {
    session.append('company-group/message', payload)
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
    const guarded = run()
    this.turnChain = this.turnChain.then(() => guarded).catch(() => undefined)
    return guarded
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
    if (this.messagesOf(group.session).some(message => message.context === dedupKey)) return
    const member: CompanyGroupMember = { employeeId, displayName, departmentName: '成员' }
    const summary = `${TASK_KIND_TEXT[event.kind]}「${event.taskTitle}」${event.kind === 'failed' && event.suspended === true ? '（已挂起）' : ''}`
    this.enqueueTurn(
      group.company,
      member,
      `你在公司「${group.company.name}」的员工群里。你的自主任务有新进展：${summary}。请以你自己的身份、风格和判断向群里的同事简短说明这件事；如需补充细节可以用你的工具。只输出要发到群里的发言内容。`,
      summary,
      event.seq,
    )
  }

  /** Queue one serialized speaking turn for a member.
   * @param company - the company whose group receives the utterance.
   * @param member - the speaking member.
   * @param situation - the situation prompt; never a script.
   * @param fallback - the deterministic one-liner used when the turn fails.
   * @param taskEventSeq - dedup cursor stamped on the broadcast, when task-triggered.
   */
  private enqueueTurn(
    company: CompanyRecord,
    member: CompanyGroupMember,
    situation: string,
    fallback: string,
    taskEventSeq?: number,
  ): void {
    this.turnChain = this.turnChain.then(async () => {
      const text = await this.runSpeakingTurn(member, situation, fallback)
      const group = await this.ensureGroup(company.id)
      this.appendMessage(group.session, {
        speakerKind: 'employee',
        employeeId: member.employeeId,
        displayName: member.displayName,
        text,
        ...(taskEventSeq === undefined ? {} : { taskEventSeq }),
        context: taskEventSeq === undefined ? fallback : `task:${String(taskEventSeq)}`,
      })
    }).catch(() => undefined)
  }

  /** Run one in-character speaking turn as a hidden employee session.
   * @param member - the speaking member.
   * @param situation - the situation prompt.
   * @param fallback - the deterministic one-liner on failure or timeout.
   * @returns the employee's utterance, or the fallback.
   */
  private async runSpeakingTurn(member: CompanyGroupMember, situation: string, fallback: string): Promise<string> {
    try {
      const handle = await this.ctx.digitalEmployeeAgent.createTask({
        employeeId: member.employeeId,
        sessionId: SessionId(`session-group-turn-${randomUUID()}`),
        meta: { cwd: process.cwd(), origin: 'subagent', delegationDepth: 1 },
        initialMessage: createUserMessage({
          content: [{ type: 'text', text: situation }],
          source: { kind: 'user' },
        }),
        memory: { text: situation, scopes: ['task', 'session', 'long-term'], limit: 8 },
      })
      const timedOut = await Promise.race([
        handle.agent.whenIdle().then(() => false),
        new Promise<boolean>((resolve) => { setTimeout(() => { resolve(true) }, this.turnTimeoutMs) }),
      ])
      const text = timedOut ? '' : lastAssistantText(handle.agent.session.events)
      await handle.dispose()
      return text === '' ? fallback : text
    } catch {
      return fallback
    }
  }
}

export default CompanyGroupChatGateway
