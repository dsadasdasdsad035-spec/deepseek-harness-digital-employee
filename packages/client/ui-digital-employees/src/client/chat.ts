/** Chat mention and routed startup orchestration for digital employees. */
import type {
  DigitalEmployeeInstanceId,
  DigitalEmployeeSubmissionId,
  SessionId,
  WorkspaceId,
} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ClientSessionContext,
  InputTriggerSource,
  ReferenceInsert,
  RoutingSubmitRequest,
  SubmitOutcome,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  ISessions, IWorkspaces,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { DigitalEmployeeRemote, DigitalEmployeeStore } from './store.ts'

/** Deterministic identity hooks used by tests; production mints browser UUIDs. */
export interface DigitalEmployeeChatIds {
  session(): SessionId
  submission(): DigitalEmployeeSubmissionId
}

/** Services required by employee chat routing and management preselection. */
export interface DigitalEmployeeChatDependencies {
  readonly store: DigitalEmployeeStore
  readonly remote: DigitalEmployeeRemote
  readonly sessions: ISessions
  readonly workspaces: IWorkspaces
  readonly conversation: Pick<IConversation, 'input'>
  readonly layout: Pick<ILayout, 'closeApplication'>
  readonly ids?: DigitalEmployeeChatIds
}

/** Owns the `@` source and the management-to-composer entry flow. */
export class DigitalEmployeeChatController {
  /** New-task employee discovery and routed submission contribution. */
  readonly source: InputTriggerSource
  private readonly ids: DigitalEmployeeChatIds
  private readonly pendingOpens = new Map<SessionId, () => void>()
  private disposed = false

  constructor(private readonly deps: DigitalEmployeeChatDependencies) {
    this.ids = deps.ids ?? {
      session: () => opaqueId('digital-employee-session') as SessionId,
      submission: () => opaqueId('digital-employee-submission') as DigitalEmployeeSubmissionId,
    }
    this.source = this.createSource()
  }

  /**
   * Reuse an empty ordinary composer when possible, or create a distinct
   * ordinary draft Session when the reusable composer contains local work.
   * Employee startup and ownership begin only after routed submission.
   * @param employeeId - stable employee instance identity.
   */
  async openComposer(employeeId: DigitalEmployeeInstanceId): Promise<void> {
    await this.deps.store.loadRoster()
    const reference = this.referenceFor(employeeId)
    if (reference === undefined) throw new Error('Digital employee is unavailable for chat.')
    const workspaceId = this.targetWorkspace()
    if (workspaceId === undefined) throw new Error('No workspace is available for a new employee chat.')
    let sessionId = await this.deps.workspaces.connectWorkspace(workspaceId)
    let scope = this.deps.sessions.scope(sessionId)
    if (scope === undefined) throw new Error(`New-task Session "${sessionId}" resolved no client scope.`)
    let input = this.deps.conversation.input.for(scope)
    let snapshot = input.state.getSnapshot()
    if (!isEmptyComposer(snapshot)) {
      sessionId = await this.deps.workspaces.connectWorkspace(workspaceId, { reuseBlank: false })
      scope = this.deps.sessions.scope(sessionId)
      if (scope === undefined) throw new Error(`New-task Session "${sessionId}" resolved no client scope.`)
      input = this.deps.conversation.input.for(scope)
      snapshot = input.state.getSnapshot()
      if (!isEmptyComposer(snapshot)) {
        throw new Error('The distinct new-task composer is not empty.')
      }
    }
    if (!input.insertReference(reference, {
      start: 0,
      end: 0,
      draftRev: snapshot.draftRev,
    })) {
      throw new Error('The employee could not be selected in the new-task composer.')
    }
    this.deps.sessions.open(sessionId)
    this.deps.layout.closeApplication()
  }

  /** Cancel pending list reconciliation and prevent later navigation. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const cancel of [...this.pendingOpens.values()]) cancel()
  }

  private createSource(): InputTriggerSource {
    return {
      trigger: '@',
      name: 'digital-employee',
      order: -10,
      showGroupTitle: true,
      candidates: async (session, request) => {
        if (request.position !== 'leading' || !this.isBlankTask(session)) return []
        await this.deps.store.loadRoster(request.signal)
        if (request.signal.aborted) return []
        const query = request.query.trim().toLocaleLowerCase()
        return this.deps.store.chatEmployees()
          .filter(({ employee, templateName }) => query === ''
            || employee.displayName.toLocaleLowerCase().includes(query)
            || employee.id.toLocaleLowerCase().includes(query)
            || templateName.toLocaleLowerCase().includes(query))
          .map(row => ({
            name: row.employee.displayName,
            description: `${row.templateName} · ${row.employee.templateVersion} · ${
              row.available ? 'Available' : `Unavailable: ${row.unavailableReason ?? 'Unknown reason.'}`
            }`,
            value: row.employee.id,
          }))
      },
      onPick: (pick) => {
        if (pick.position !== 'leading' || !this.isBlankTask(pick.session)) return undefined
        const employeeId = pick.candidate.value as DigitalEmployeeInstanceId | undefined
        if (employeeId === undefined) return undefined
        const reference = this.referenceFor(employeeId)
        return reference === undefined ? undefined : { insert: reference }
      },
      codec: {
        clipboardText: ref => this.referenceFor(ref as DigitalEmployeeInstanceId)?.clipboardText ?? ref,
        serialize: () => Promise.reject(new Error('Digital employee routing references are not model references.')),
      },
      routeSubmit: (session, request) => this.routeSubmit(session, request),
    }
  }

  private async routeSubmit(
    session: ClientSessionContext,
    request: RoutingSubmitRequest,
  ): Promise<SubmitOutcome> {
    if (!this.isBlankTask(session)) {
      return { kind: 'error', text: 'Digital employees can only start a new task.' }
    }
    const employeeId = request.ref as DigitalEmployeeInstanceId
    if (this.referenceFor(employeeId) === undefined) {
      return { kind: 'error', text: 'Digital employee is unavailable for chat.' }
    }
    const sessionId = this.ids.session()
    const submissionId = this.ids.submission()
    const workspaceId = this.workspaceFor(session.sessionId)
    if (workspaceId === undefined) {
      return { kind: 'error', text: 'No workspace is available for a new employee chat.' }
    }
    const result = await this.deps.remote.startChat({
      employeeId,
      sessionId,
      submissionId,
      workspaceId,
      content: [
        ...(request.content.trim() === '' ? [] : [{ type: 'text' as const, text: request.content }]),
        ...request.images.map(image => ({ type: 'image' as const, ...image })),
      ],
    }, request.attempt.signal)
    if (!result.ok) return { kind: 'error', text: result.error.message }
    const accepted = result.value.sessionId
    if (!this.disposed) {
      this.openWhenListed(accepted)
      void this.deps.sessions.refresh().catch((error: unknown) => {
        console.warn(`employee Session "${accepted}" list refresh failed; waiting for list publication`, error)
      })
    }
    return { kind: 'success' }
  }

  private openWhenListed(sessionId: SessionId): void {
    if (this.disposed) return
    this.pendingOpens.get(sessionId)?.()
    let settled = false
    const cancel = (): void => {
      if (settled) return
      settled = true
      unsubscribe()
      if (this.pendingOpens.get(sessionId) === cancel) this.pendingOpens.delete(sessionId)
    }
    const reconcile = (): void => {
      if (this.disposed || settled) return
      if (this.deps.sessions.list.getSnapshot().byId[sessionId] === undefined) return
      cancel()
      this.deps.sessions.open(sessionId)
    }
    this.pendingOpens.set(sessionId, cancel)
    const unsubscribe = this.deps.sessions.list.subscribe(reconcile)
    if (settled) unsubscribe()
    reconcile()
  }

  private referenceFor(employeeId: DigitalEmployeeInstanceId): ReferenceInsert | undefined {
    const row = this.deps.store.chatEmployees().find(candidate => candidate.employee.id === employeeId)
    if (row?.available !== true) return undefined
    return {
      source: 'digital-employee',
      ref: row.employee.id,
      label: row.employee.displayName,
      clipboardText: `@${row.employee.displayName}`,
      submission: 'routing',
    }
  }

  private isBlankTask(session: ClientSessionContext): boolean {
    return this.deps.sessions.list.getSnapshot().byId[session.sessionId]?.blank === true
  }

  /** Resolve the current Session's Workspace, then the application fallback target. */
  private targetWorkspace(): WorkspaceId | undefined {
    const workspaces = this.deps.workspaces.list.getSnapshot()
    const current = this.deps.sessions.list.getSnapshot().current
    return (current === undefined
      ? undefined
      : workspaces.items.find(workspace => workspace.sessionIds.includes(current))?.workspaceId)
      ?? workspaces.recentWorkspaceId
      ?? workspaces.items.at(0)?.workspaceId
  }

  /** Prefer the source Session's Host-projected workspace over UI list timing. */
  private workspaceFor(sessionId: SessionId): WorkspaceId | undefined {
    return this.deps.sessions.list.getSnapshot().byId[sessionId]?.workspaceId
      ?? this.targetWorkspace()
  }
}

function opaqueId(prefix: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`
}

function isEmptyComposer(snapshot: {
  readonly draft: string
  readonly imageIds: readonly unknown[]
  readonly occurrences: readonly unknown[]
}): boolean {
  return snapshot.draft === '' && snapshot.imageIds.length === 0 && snapshot.occurrences.length === 0
}
