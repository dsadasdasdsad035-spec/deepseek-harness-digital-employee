/** Cancellable browser state for digital employee management. */
import type {
  ClientRemote,
  DigitalEmployeeAuditRecord,
  DigitalEmployeeAuthority,
  DigitalEmployeeExpert,
  DigitalEmployeeExportArtifact,
  DigitalEmployeeInstance,
  DigitalEmployeeInstanceId,
  DigitalEmployeeMemoryId,
  DigitalEmployeeMemoryRecord,
  DigitalEmployeeTaskTreeEntry,
  DigitalEmployeeTemplate,
  DigitalEmployeeUpgradePreview,
  SessionId,
} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Generated namespace consumed by the workspace. */
export type DigitalEmployeeRemote = ClientRemote['digitalEmployees']
/** Detail view selected in the workspace. */
export type DigitalEmployeeView = 'overview' | 'capabilities' | 'experts' | 'memory' | 'tasks' | 'audit'

/** Chat-picker projection for an employee and its exact template version. */
export interface DigitalEmployeeChatRow {
  readonly employee: DigitalEmployeeInstance
  readonly templateName: string
  readonly available: boolean
  readonly unavailableReason?: string
}

/** Pending destructive or permission-expanding confirmation. */
export type DigitalEmployeeConfirmation =
  | { readonly kind: 'delete'; readonly employeeId: DigitalEmployeeInstanceId }
  | {
    readonly kind: 'upgrade'
    readonly preview: DigitalEmployeeUpgradePreview
    readonly approvedCapabilities: DigitalEmployeeAuthority
  }

/** Browser state for one mounted workspace. */
export interface DigitalEmployeeState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  templates: readonly DigitalEmployeeTemplate[]
  employees: readonly DigitalEmployeeInstance[]
  selectedId: DigitalEmployeeInstanceId | null
  detail: DigitalEmployeeInstance | null
  memories: readonly DigitalEmployeeMemoryRecord[]
  experts: readonly DigitalEmployeeExpert[]
  taskTree: readonly DigitalEmployeeTaskTreeEntry[]
  audit: readonly DigitalEmployeeAuditRecord[]
  view: DigitalEmployeeView
  busy: string | null
  confirmation: DigitalEmployeeConfirmation | null
  exported: DigitalEmployeeExportArtifact | null
}

const INITIAL: DigitalEmployeeState = {
  status: 'idle',
  error: null,
  templates: [],
  employees: [],
  selectedId: null,
  detail: null,
  memories: [],
  experts: [],
  taskTree: [],
  audit: [],
  view: 'overview',
  busy: null,
  confirmation: null,
  exported: null,
}

function failure(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'message' in value) return String(value.message)
  return 'Digital employee operation failed.'
}

/** Owns all wire operations and suppresses stale publications after selection changes or disposal. */
export class DigitalEmployeeStore {
  /** Observable workspace state. */
  readonly store: SnapshotStore<DigitalEmployeeState> = createSnapshotStore(INITIAL)
  private generation = 0
  private rosterGeneration = 0
  private disposed = false

  constructor(private readonly remote: DigitalEmployeeRemote) {}

  /**
   * Refresh the inventory fields used by the chat picker without loading the
   * selected employee's operational panels.
   * @param signal - optional picker request cancellation.
  */
  async loadRoster(signal?: AbortSignal): Promise<void> {
    if (isAborted(signal) || this.disposed) return
    const generation = ++this.rosterGeneration
    const [templates, employees] = await Promise.all([
      this.remote.listTemplates(),
      this.remote.list(),
    ])
    if (isAborted(signal) || !this.currentRoster(generation)) return
    if (!templates.ok) throw new Error(failure(templates.error))
    if (!employees.ok) throw new Error(failure(employees.error))
    this.publish((state) => {
      state.status = 'ready'
      state.error = null
      state.templates = templates.value
      state.employees = employees.value
      if (state.selectedId !== null && !employees.value.some(item => item.id === state.selectedId)) {
        state.selectedId = employees.value[0]?.id ?? null
        if (state.selectedId === null) this.clearSelection(state)
      }
    })
  }

  /**
   * Project employees for chat discovery, including disabled rows and reasons.
   * @returns current employee rows paired with exact template availability.
   */
  chatEmployees(): readonly DigitalEmployeeChatRow[] {
    const state = this.store.getSnapshot()
    return state.employees.map((employee) => {
      const template = state.templates.find(candidate =>
        candidate.id === employee.templateId && candidate.version === employee.templateVersion)
      const templateName = template?.display.name ?? employee.templateId
      if (employee.state !== 'active') {
        return {
          employee,
          templateName,
          available: false,
          unavailableReason: 'Employee is inactive.',
        }
      }
      if (template === undefined) {
        return {
          employee,
          templateName,
          available: false,
          unavailableReason: `Template ${employee.templateId}@${employee.templateVersion} is unavailable.`,
        }
      }
      return { employee, templateName, available: true }
    })
  }

  /**
   * Surface an orchestration failure in the management workspace.
   * @param error - rejected Start chat operation.
   */
  reportError(error: unknown): void {
    this.publish((state) => {
      state.error = error instanceof Error ? error.message : String(error)
    })
  }

  /** Stop future publication and release retained export data. */
  dispose(): void {
    this.disposed = true
    this.generation++
    this.rosterGeneration++
    this.store.update((state) => {
      state.exported = null
      state.confirmation = null
    })
  }

  /** Load templates and inventory, selecting the first employee when needed. */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.publish((state) => {
      state.status = 'loading'
      state.error = null
    })
    try {
      const [templates, employees] = await Promise.all([
        this.remote.listTemplates(),
        this.remote.list(),
      ])
      if (!this.current(generation)) return
      if (!templates.ok) throw new Error(failure(templates.error))
      if (!employees.ok) throw new Error(failure(employees.error))
      const selected = employees.value.some(item => item.id === this.store.getSnapshot().selectedId)
        ? this.store.getSnapshot().selectedId
        : employees.value[0]?.id ?? null
      this.publish((state) => {
        state.status = 'ready'
        state.templates = templates.value
        state.employees = employees.value
        state.selectedId = selected
        if (selected === null) this.clearSelection(state)
      })
      if (selected !== null) await this.loadSelected(selected, generation)
    } catch (error) {
      if (!this.current(generation)) return
      this.publish((state) => {
        state.status = 'error'
        state.error = error instanceof Error ? error.message : String(error)
      })
    }
  }

  /** Select an employee and refresh all operational views together.
   * @param employeeId - employee to display.
   */
  async select(employeeId: DigitalEmployeeInstanceId): Promise<void> {
    const generation = ++this.generation
    this.publish((state) => {
      state.selectedId = employeeId
      state.error = null
    })
    await this.loadSelected(employeeId, generation)
  }

  /** Change the active detail tab.
   * @param view - detail view to display.
   */
  setView(view: DigitalEmployeeView): void {
    this.publish((state) => { state.view = view })
  }

  /** Create an inactive employee from an exact template.
   * @param templateId - selected template identity.
   * @param templateVersion - selected template version.
   * @param displayName - instance display name.
   */
  async create(templateId: string, templateVersion: string, displayName: string): Promise<void> {
    const template = this.store.getSnapshot().templates.find(candidate =>
      candidate.id === templateId && candidate.version === templateVersion)
    if (template === undefined) throw new Error(`digital employee template "${templateId}@${templateVersion}" is unavailable`)
    await this.mutate('create', () => this.remote.create({
      templateId: templateId as never,
      templateVersion,
      displayName,
      grants: template.capabilities,
    }))
  }

  /** Activate the selected employee. */
  async activate(): Promise<void> { await this.withSelected('activate', id => this.remote.activate({ employeeId: id })) }
  /** Deactivate the selected employee. */
  async deactivate(): Promise<void> { await this.withSelected('deactivate', id => this.remote.deactivate({ employeeId: id })) }

  /** Delete one selected employee memory.
   * @param memoryId - memory record to delete.
   */
  async deleteMemory(memoryId: DigitalEmployeeMemoryId): Promise<void> {
    await this.withSelected('delete-memory', id => this.remote.deleteMemory({ employeeId: id, memoryId }))
  }

  /** Interrupt one expert child.
   * @param parentSessionId - live direct parent Session.
   * @param childSessionId - expert child Session.
   */
  async interrupt(parentSessionId: SessionId, childSessionId: SessionId): Promise<void> {
    await this.mutate('interrupt', () => this.remote.interruptExpert({ parentSessionId, childSessionId }), false)
  }

  /** Continue one expert child.
   * @param parentSessionId - live direct parent Session.
   * @param childSessionId - expert child Session.
   * @param text - user continuation text.
   */
  async continueExpert(parentSessionId: SessionId, childSessionId: SessionId, text: string): Promise<void> {
    await this.mutate('continue', () => this.remote.continueExpert({
      parentSessionId,
      childSessionId,
      content: [{ type: 'text', text }],
    }), false)
  }

  /** Open destructive deletion confirmation for the selected employee. */
  requestDelete(): void {
    const employeeId = this.store.getSnapshot().selectedId
    if (employeeId !== null) this.publish((state) => {
      state.confirmation = { kind: 'delete', employeeId }
    })
  }

  /** Close the pending confirmation without mutation. */
  cancelConfirmation(): void {
    this.publish((state) => { state.confirmation = null })
  }

  /** Execute the currently displayed confirmation. */
  async confirm(): Promise<void> {
    const pending = this.store.getSnapshot().confirmation
    if (pending === null) return
    if (pending.kind === 'delete') {
      await this.mutate('delete', () => this.remote.delete({ employeeId: pending.employeeId }))
      return
    }
    await this.mutate('upgrade', () => this.remote.applyUpgrade({
      employeeId: this.requiredSelected(),
      targetVersion: pending.preview.targetVersion,
      approvedCapabilities: pending.approvedCapabilities,
    }))
  }

  /** Load an upgrade preview for explicit approval.
   * @param targetVersion - exact target template version.
   */
  async previewUpgrade(targetVersion: string): Promise<void> {
    const employeeId = this.requiredSelected()
    await this.perform('preview-upgrade', async () => {
      const result = await this.remote.previewUpgrade({ employeeId, targetVersion })
      if (!result.ok) throw new Error(failure(result.error))
      this.publish((state) => {
        state.confirmation = {
          kind: 'upgrade',
          preview: result.value,
          approvedCapabilities: {
            skills: [],
            tools: [],
            mcpServers: [],
            experts: [],
            allowSubagents: false,
          },
        }
      })
    })
  }

  /** Replace the explicit grants attached to a pending upgrade review.
   * @param approvedCapabilities - newly requested capabilities approved by the user.
   */
  approveUpgrade(approvedCapabilities: DigitalEmployeeAuthority): void {
    this.publish((state) => {
      const pending = state.confirmation
      if (pending?.kind === 'upgrade') state.confirmation = { ...pending, approvedCapabilities }
    })
  }

  /** Export the selected employee without resolved credentials.
   * @param includeMemory - whether portable long-term memory is included.
   */
  async exportEmployee(includeMemory: boolean): Promise<void> {
    const employeeId = this.requiredSelected()
    await this.perform('export', async () => {
      const result = await this.remote.exportEmployee({ employeeId, includeMemory })
      if (!result.ok) throw new Error(failure(result.error))
      this.publish((state) => { state.exported = result.value })
    })
  }

  /** Import one portable employee artifact.
   * @param artifact - validated credential-free artifact.
   */
  async importEmployee(artifact: DigitalEmployeeExportArtifact): Promise<void> {
    await this.mutate('import', () => this.remote.importEmployee(artifact))
  }

  private async loadSelected(employeeId: DigitalEmployeeInstanceId, generation: number): Promise<void> {
    try {
      const [detail, memories, experts, audit] = await Promise.all([
        this.remote.get({ employeeId }),
        this.remote.listMemory({
          employeeId,
          text: '',
          scopes: ['long-term'],
          limit: 50,
        }),
        this.remote.listExperts({ employeeId }),
        this.remote.listAudit({ employeeId }),
      ])
      if (!this.current(generation) || this.store.getSnapshot().selectedId !== employeeId) return
      if (!detail.ok) throw new Error(failure(detail.error))
      if (!memories.ok) throw new Error(failure(memories.error))
      if (!experts.ok) throw new Error(failure(experts.error))
      if (!audit.ok) throw new Error(failure(audit.error))
      const rootSessionId = audit.value.find(record => 'sessionId' in record)?.sessionId
        ?? employeeId as unknown as SessionId
      const taskTree = await this.remote.taskTree({ rootSessionId })
      if (!this.current(generation)) return
      if (!taskTree.ok) throw new Error(failure(taskTree.error))
      this.publish((state) => {
        state.detail = detail.value
        state.memories = memories.value
        state.experts = experts.value
        state.taskTree = taskTree.value
        state.audit = audit.value
      })
    } catch (error) {
      if (this.current(generation)) this.publish((state) => {
        state.error = error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async withSelected(
    name: string,
    operation: (employeeId: DigitalEmployeeInstanceId) => Promise<{ ok: boolean; value?: unknown; error?: unknown }>,
  ): Promise<void> {
    const employeeId = this.requiredSelected()
    await this.mutate(name, () => operation(employeeId))
  }

  private async mutate(
    name: string,
    operation: () => Promise<{ ok: boolean; value?: unknown; error?: unknown }>,
    refresh = true,
  ): Promise<void> {
    await this.perform(name, async () => {
      const result = await operation()
      if (!result.ok) throw new Error(failure(result.error))
      this.publish((state) => { state.confirmation = null })
      if (refresh) await this.load()
    })
  }

  private async perform(name: string, operation: () => Promise<void>): Promise<void> {
    if (this.disposed || this.store.getSnapshot().busy !== null) return
    this.publish((state) => {
      state.busy = name
      state.error = null
    })
    try {
      await operation()
    } catch (error) {
      this.publish((state) => {
        state.error = error instanceof Error ? error.message : String(error)
      })
    } finally {
      this.publish((state) => { state.busy = null })
    }
  }

  private requiredSelected(): DigitalEmployeeInstanceId {
    const id = this.store.getSnapshot().selectedId
    if (id === null) throw new Error('no digital employee is selected')
    return id
  }

  private current(generation: number): boolean {
    return !this.disposed && generation === this.generation
  }

  private currentRoster(generation: number): boolean {
    return !this.disposed && generation === this.rosterGeneration
  }

  private publish(change: (state: DigitalEmployeeState) => void): void {
    if (!this.disposed) this.store.update(change)
  }

  private clearSelection(state: DigitalEmployeeState): void {
    state.detail = null
    state.memories = []
    state.experts = []
    state.taskTree = []
    state.audit = []
  }
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}
