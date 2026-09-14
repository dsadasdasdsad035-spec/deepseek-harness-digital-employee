/** Cancellable browser state for the company campus console. */
import type {
  ClientRemote,
  CompanyCandidateEmployee,
  CompanyFloor,
  CompanyId,
  CompanyRecord,
  DepartmentId,
  DepartmentRecord,
  DigitalEmployeeInstanceId,
  EmployeeBinding,
  SessionId,
} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

/** Generated namespace consumed by the console. */
export type CompanyRemote = ClientRemote['companies']

/** Live busy verdict for one floor member after real-time overrides. */
export interface CompanySeatVerdict {
  readonly busy: boolean
  readonly busyKind: 'chat' | 'task' | null
}

/** Browser state for one mounted console. */
export interface CompanyState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  companies: readonly CompanyRecord[]
  bindings: readonly EmployeeBinding[]
  candidates: readonly CompanyCandidateEmployee[]
  floors: Readonly<Record<string, CompanyFloor>>
  /** Live running bits keyed by session id, refreshed by the WebSocket status stream. */
  runningSessions: Readonly<Record<string, boolean>>
  selectedCompanyId: CompanyId | null
  busy: string | null
}

const INITIAL: CompanyState = {
  status: 'idle',
  error: null,
  companies: [],
  bindings: [],
  candidates: [],
  floors: {},
  runningSessions: {},
  selectedCompanyId: null,
  busy: null,
}

/** Poll cadence for task-sourced busy verdicts while the console is open. */
const FLOOR_POLL_MS = 5_000

function failure(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'message' in value) return String(value.message)
  return 'Company operation failed.'
}

/** Owns all wire operations, the live running-bit mirror, and floor polling. */
export class CompanyStore {
  /** Observable console state. */
  readonly store: SnapshotStore<CompanyState> = createSnapshotStore(INITIAL)
  /** Durable-visit reporter assigned by the plugin (remote-backed). */
  visitReporter: ((employeeId: string, place: string) => void) | null = null
  private generation = 0
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private unsubscribeRunning: (() => void) | undefined

  constructor(
    private readonly remote: CompanyRemote,
    sessionsList?: { subscribe(fn: () => void): () => void; getSnapshot(): { byId: Readonly<Record<SessionId, { running: boolean }>> } },
  ) {
    if (sessionsList !== undefined) {
      this.unsubscribeRunning = sessionsList.subscribe(() => { this.syncRunning(sessionsList) })
      this.syncRunning(sessionsList)
    }
  }

  /** Mirror the live session running bits into console state. */
  private syncRunning(
    sessionsList: { getSnapshot(): { byId: Readonly<Record<SessionId, { running: boolean }>> } },
  ): void {
    const running: Record<string, boolean> = {}
    for (const [id, row] of Object.entries(sessionsList.getSnapshot().byId)) {
      if (row.running) running[id] = true
    }
    this.store.set({ ...this.store.getSnapshot(), runningSessions: running })
  }

  /** Load companies, bindings, and selectable instances. */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.set({ ...this.store.getSnapshot(), status: 'loading', error: null })
    const [companies, bindings, candidates] = await Promise.all([
      unwrap(this.remote.list()),
      unwrap(this.remote.listBindings()),
      unwrap(this.remote.availableEmployees()),
    ])
    if (generation !== this.generation) return
    const previous = this.store.getSnapshot()
    this.store.set({
      ...previous,
      status: 'ready',
      companies,
      bindings,
      candidates,
      ...(previous.selectedCompanyId !== null && companies.some(company => company.id === previous.selectedCompanyId)
        ? {}
        : { selectedCompanyId: companies.at(0)?.id ?? null }),
    })
  }

  /**
   * Select one company and load its floor projection.
   * @param companyId - company to select, or `null` to clear the selection.
   */
  async select(companyId: CompanyId | null): Promise<void> {
    this.store.set({ ...this.store.getSnapshot(), selectedCompanyId: companyId })
    if (companyId !== null) await this.loadFloor(companyId)
  }

  /**
   * Load one company's floor projection with fresh busy verdicts.
   * @param companyId - company whose floor is loaded.
   */
  async loadFloor(companyId: CompanyId): Promise<void> {
    const generation = this.generation
    const floor = await unwrap(this.remote.companyFloor({ companyId }))
    if (generation !== this.generation) return
    const previous = this.store.getSnapshot()
    this.store.set({ ...previous, floors: { ...previous.floors, [companyId as string]: floor } })
  }

  /** Start the visible-console poll that refreshes task-sourced busy verdicts. */
  startPolling(): void {
    this.stopPolling()
    this.pollTimer = setInterval(() => {
      const { selectedCompanyId } = this.store.getSnapshot()
      if (selectedCompanyId === null) return
      void this.loadFloor(selectedCompanyId).catch(() => undefined)
    }, FLOOR_POLL_MS)
  }

  /** Stop the visible-console poll. */
  stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  /**
   * Live busy verdict for one member: the WebSocket running bit overrides the fetched verdict.
   * @param member - floor member with its fetched verdict and root session.
   * @returns the effective busy verdict for rendering.
   */
  verdictOf(member: { rootSessionId?: SessionId; busy: boolean; busyKind: 'chat' | 'task' | null }): CompanySeatVerdict {
    const key = member.rootSessionId as string | undefined
    if (key !== undefined && this.store.getSnapshot().runningSessions[key] === true) {
      return { busy: true, busyKind: 'chat' }
    }
    return { busy: member.busy, busyKind: member.busyKind }
  }

  /**
   * Create one company.
   * @param request - company name plus optional informational fields.
   */
  async create(request: { name: string; category?: string; legalRepresentative?: string; address?: string }): Promise<void> {
    await this.mutate('create', () => unwrap(this.remote.create(request)))
  }

  /**
   * Update editable company fields.
   * @param request - company identity plus changed fields.
   */
  async update(request: Parameters<CompanyRemote['update']>[0]): Promise<void> {
    await this.mutate('update', () => unwrap(this.remote.update(request)))
  }

  /**
   * Delete one company.
   * @param companyId - company to delete.
   */
  async delete(companyId: CompanyId): Promise<void> {
    await this.mutate('delete', () => unwrap(this.remote.delete({ companyId })))
    if (this.store.getSnapshot().selectedCompanyId === companyId) {
      this.store.set({ ...this.store.getSnapshot(), selectedCompanyId: null })
    }
  }

  /**
   * Upload one promotional image for a company.
   * @param companyId - company receiving the image.
   * @param image - encoded upload consumed by the attachment pipeline.
   */
  async setPromoImage(companyId: CompanyId, image: { mediaType: string; data: string; name?: string }): Promise<void> {
    await this.mutate('setPromoImage', () => unwrap(this.remote.setPromoImage({ companyId, image })))
  }

  /**
   * Fetch one company's promotional image data URL.
   * @param companyId - company whose image is read.
   * @returns the data URL, or `null` when the company has no image.
   */
  async promoImage(companyId: CompanyId): Promise<string | null> {
    const value = await unwrap(this.remote.promoImage({ companyId }))
    if (value === null) return null
    return `data:${value.mediaType};base64,${value.dataBase64}`
  }

  /**
   * Add one department.
   * @param companyId - company receiving the department.
   * @param name - new department name.
   */
  async addDepartment(companyId: CompanyId, name: string): Promise<void> {
    await this.mutate('addDepartment', () => unwrap(this.remote.addDepartment({ companyId, name })))
  }

  /**
   * Rename one department.
   * @param companyId - owning company.
   * @param departmentId - department to rename.
   * @param name - replacement name.
   */
  async renameDepartment(companyId: CompanyId, departmentId: DepartmentId, name: string): Promise<void> {
    await this.mutate('renameDepartment', () => unwrap(this.remote.renameDepartment({ companyId, departmentId, name })))
  }

  /**
   * Delete one department; members move to the unassigned group.
   * @param companyId - owning company.
   * @param departmentId - department to delete.
   */
  async deleteDepartment(companyId: CompanyId, departmentId: DepartmentId): Promise<void> {
    await this.mutate('deleteDepartment', () => unwrap(this.remote.deleteDepartment({ companyId, departmentId })))
  }

  /**
   * Bind or move one employee instance.
   * @param instanceId - instance to bind.
   * @param companyId - target company.
   * @param departmentId - target department, or `null` for the unassigned group.
   */
  async assignEmployee(instanceId: DigitalEmployeeInstanceId, companyId: CompanyId, departmentId: DepartmentId | null): Promise<void> {
    await this.mutate('assignEmployee', () => unwrap(this.remote.assignEmployee({ instanceId, companyId, departmentId })))
    await this.loadFloor(companyId).catch(() => undefined)
  }

  /**
   * Remove one employee instance's binding.
   * @param instanceId - instance to unbind.
   */
  async unassignEmployee(instanceId: DigitalEmployeeInstanceId): Promise<void> {
    await this.mutate('unassignEmployee', () => unwrap(this.remote.unassignEmployee({ instanceId })))
  }

  /**
   * Departments of one company, for management panels.
   * @param company - company record, or `undefined` for none.
   * @returns the company's departments in display order.
   */
  departmentsOf(company: CompanyRecord | undefined): readonly DepartmentRecord[] {
    return company?.departments ?? []
  }

  /** Stop polling and live subscriptions. */
  dispose(): void {
    this.generation++
    this.stopPolling()
    this.unsubscribeRunning?.()
    this.unsubscribeRunning = undefined
  }

  private async mutate(what: string, operation: () => Promise<unknown>): Promise<void> {
    const generation = this.generation
    this.store.set({ ...this.store.getSnapshot(), busy: what, error: null })
    try {
      await operation()
    } catch (error) {
      this.store.set({ ...this.store.getSnapshot(), error: failure(error) })
      throw error
    } finally {
      if (generation === this.generation) {
        this.store.set({ ...this.store.getSnapshot(), busy: null })
      }
    }
    await this.load().catch(() => undefined)
  }
}

/** Unwrap a generated remote result or throw its diagnostic. */
async function unwrap<T>(result: Promise<RemoteResult<T>>): Promise<T> {
  const resolved = await result
  if (resolved.ok) return resolved.value
  throw new Error(resolved.error.message)
}

/** Generated companyGroups namespace consumed by the console. */
export type CompanyGroupRemote = ClientRemote['companyGroups']

/** The group view unwrapped from the RemoteResult envelope. */
export type CompanyGroupViewResult = Extract<
  Awaited<ReturnType<CompanyGroupRemote['openCompanyGroup']>>,
  { ok: true }
>['value']

/** Browser state for one mounted group conversation. */
export interface CompanyGroupState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  view: CompanyGroupViewResult | null
}

const GROUP_INITIAL: CompanyGroupState = {
  status: 'idle',
  error: null,
  view: null,
}

/** Poll cadence for streaming group messages while the panel is open. */
const GROUP_POLL_MS = 2_500

/** Owns the group conversation: open, send, and message polling. */
export class CompanyGroupStore {
  /** Observable group state. */
  readonly store: SnapshotStore<CompanyGroupState> = createSnapshotStore(GROUP_INITIAL)
  private generation = 0
  private pollTimer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly remote: CompanyGroupRemote) {}

  /** Open (or create) one company's group and start message polling.
   * @param companyId - the company whose group opens.
   */
  async open(companyId: string): Promise<void> {
    const generation = ++this.generation
    this.store.set({ ...this.store.getSnapshot(), status: 'loading', error: null })
    const outcome = await this.remote.openCompanyGroup(companyId as never)
    if (generation !== this.generation) return
    if (!outcome.ok) {
      this.store.set({ ...this.store.getSnapshot(), status: 'error', error: failure(outcome.error) })
      return
    }
    this.store.set({ ...this.store.getSnapshot(), status: 'ready', view: outcome.value })
    this.startPolling(companyId)
  }

  /** Land one user message; @mentions trigger employee turns host-side.
   * @param companyId - the company whose group receives the message.
   * @param text - the message text.
   */
  async send(companyId: string, text: string): Promise<void> {
    const outcome = await this.remote.sendCompanyGroupMessage(companyId as never, text)
    if (outcome.ok) this.store.set({ ...this.store.getSnapshot(), view: outcome.value })
  }

  /** Open (or create) one company's group and return its session id.
   * @param companyId - the company whose group opens.
   * @returns the group session id for main-surface navigation.
   */
  async openSession(companyId: string): Promise<string> {
    await this.open(companyId)
    this.stop()
    const view = this.store.getSnapshot().view
    if (view === null) throw new Error('company group: open produced no view')
    return view.sessionId
  }

  /** Stop polling; the console closes the group panel. */
  stop(): void {
    this.generation += 1
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  private startPolling(companyId: string): void {
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => {
      void (async () => {
        const outcome = await this.remote.openCompanyGroup(companyId as never)
        if (outcome.ok) this.store.set({ ...this.store.getSnapshot(), view: outcome.value })
      })()
    }, GROUP_POLL_MS)
  }
}
