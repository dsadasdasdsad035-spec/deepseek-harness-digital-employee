/** Typed Host management operations for companies over digital employee instances. */

import { stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import { admitEncodedImages, type ImageAttachmentRef, type ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { DigitalEmployeeInstance } from '@deepseek-ai/dsh-digital-employee'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {
  AddDepartmentRequest,
  AssignEmployeeRequest,
  CompanyCandidateEmployee,
  CompanyFloor,
  CompanyFloorGroup,
  CompanyFloorMember,
  CompanyId,
  CompanyIdRequest,
  CompanyPromoImageRef,
  CompanyPromoImageUpload,
  CompanyPromoImageValue,
  CompanyRecord,
  CreateCompanyRequest,
  DeleteDepartmentRequest,
  DigitalEmployeeInstanceId,
  EmployeeBinding,
  RenameDepartmentRequest,
  ReorderDepartmentsRequest,
  SetCompanyPromoImageRequest,
  UnassignEmployeeRequest,
  UpdateCompanyRequest,
} from '@deepseek-ai/dsh-company'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'

/** Freshness window during which another process's session writes mark an employee busy. */
const DEFAULT_TASK_ACTIVE_WINDOW_MS = 60_000

/** Gateway configuration. */
export interface Config {
  /** Milliseconds a non-live session's writes stay fresh enough to count as task-busy. */
  taskActiveWindowMs?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host company management gateway. */
    companyManagement: CompanyManagementGateway
  }
}

/** Fold the trailing non-empty assistant texts of one event log. */
function trailingAssistantTexts(events: readonly { type: string; data?: unknown }[]): readonly string[] {
  const texts: string[] = []
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const message = (event.data as { message?: { content?: readonly { type: string; text?: string }[] } }).message
    const joined = (message?.content ?? [])
      .filter(block => block.type === 'text')
      .map(block => block.text ?? '')
      .join('')
      .trim()
    if (joined !== '') texts.push(joined)
    if (texts.length > 3) texts.shift()
  }
  return texts
}

/** Remote-only facade over the owning company and digital employee services. */
export class CompanyManagementGateway extends TypertRemoteService {
  /** Cold chat tails per session, refreshed opportunistically per poll. */
  private readonly chatTailCache = new Map<SessionId, readonly string[]>()

  static inject = ['agents', 'attachments', 'companies', 'digitalEmployees', 'sessionPersistence']
  static Config: z<Config> = z.object({
    taskActiveWindowMs: z.number().min(1_000).default(DEFAULT_TASK_ACTIVE_WINDOW_MS),
  })
  private readonly taskActiveWindowMs: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'companyManagement', { namespace: 'companies' })
    this.taskActiveWindowMs = config.taskActiveWindowMs ?? DEFAULT_TASK_ACTIVE_WINDOW_MS
    ctx.effect(() => {
      const unlisten = ctx.on('digital-employees/before-delete', (employeeId) => {
        void this.ctx.companies.unassignEmployee({ instanceId: employeeId })
      })
      return () => unlisten()
    }, 'company-management.employeeDeletion')
  }

  /**
   * List all companies in creation order.
   * @returns detached company records without promo image bytes.
   */
  @Remote('list')
  list(): Promise<readonly CompanyRecord[]> {
    return this.ctx.companies.list()
  }

  /**
   * Read one company.
   * @param request - company identity.
   * @returns the stored record.
   * @throws when the company does not exist.
   */
  @Remote('get')
  async get(request: CompanyIdRequest): Promise<CompanyRecord> {
    return this.requiredCompany(request.companyId)
  }

  /**
   * Create one company seeded with the preset departments.
   * @param request - company name plus optional informational fields.
   * @returns the created record.
   */
  @Remote('create')
  create(request: CreateCompanyRequest): Promise<CompanyRecord> {
    return this.ctx.companies.create(request)
  }

  /**
   * Update editable company fields.
   * @param request - company identity plus changed fields.
   * @returns the updated record.
   */
  @Remote('update')
  update(request: UpdateCompanyRequest): Promise<CompanyRecord> {
    return this.ctx.companies.update(request)
  }

  /**
   * Delete one company and unbind all of its members.
   * @param request - company identity.
   */
  @Remote('delete')
  async delete(request: CompanyIdRequest): Promise<void> {
    await this.ctx.companies.delete(request.companyId)
  }

  /**
   * Read one company's promotional image bytes.
   * @param request - company identity.
   * @returns verified image data, or `null` when the company has none.
   */
  @Remote('promoImage')
  async promoImage(request: CompanyIdRequest): Promise<CompanyPromoImageValue | null> {
    const company = await this.requiredCompany(request.companyId)
    if (company.promoImage === undefined) return null
    const stored = await this.ctx.attachments.readImage(storedRef(company.promoImage))
    return {
      mediaType: stored.ref.mediaType,
      dataBase64: Buffer.from(stored.data).toString('base64'),
    }
  }

  /**
   * Admit one uploaded promotional image and attach it to the company.
   * @param request - company identity plus encoded image upload.
   * @returns the updated record referencing the stored image.
   */
  @Remote('setPromoImage')
  async setPromoImage(request: SetCompanyPromoImageRequest): Promise<CompanyRecord> {
    await this.requiredCompany(request.companyId)
    const [ref] = await admitEncodedImages(this.ctx.attachments, [uploadOf(request.image)])
    if (ref === undefined) throw new Error('promo image admission returned no reference')
    return this.ctx.companies.setPromoImage(request.companyId, {
      attachmentId: ref.attachmentId,
      mediaType: ref.mediaType,
      bytes: ref.bytes,
      width: ref.width,
      height: ref.height,
    })
  }

  /**
   * Remove one company's promotional image reference.
   * @param request - company identity.
   * @returns the updated record.
   */
  @Remote('removePromoImage')
  async removePromoImage(request: CompanyIdRequest): Promise<CompanyRecord> {
    await this.requiredCompany(request.companyId)
    return this.ctx.companies.removePromoImage(request.companyId)
  }

  /**
   * Add one department to a company.
   * @param request - company, department name, optional color and insert position.
   * @returns the updated record.
   */
  @Remote('addDepartment')
  async addDepartment(request: AddDepartmentRequest): Promise<CompanyRecord> {
    await this.requiredCompany(request.companyId)
    return this.ctx.companies.addDepartment(request)
  }

  /**
   * Rename one department.
   * @param request - company, department, and new name.
   * @returns the updated record.
   */
  @Remote('renameDepartment')
  async renameDepartment(request: RenameDepartmentRequest): Promise<CompanyRecord> {
    await this.requiredCompany(request.companyId)
    return this.ctx.companies.renameDepartment(request)
  }

  /**
   * Reorder all departments of one company.
   * @param request - company and the complete ordered department-id list.
   * @returns the updated record.
   */
  @Remote('reorderDepartments')
  async reorderDepartments(request: ReorderDepartmentsRequest): Promise<CompanyRecord> {
    await this.requiredCompany(request.companyId)
    return this.ctx.companies.reorderDepartments(request)
  }

  /**
   * Delete one department, moving members to the unassigned group.
   * @param request - company and department identifiers.
   * @returns the updated record.
   */
  @Remote('deleteDepartment')
  async deleteDepartment(request: DeleteDepartmentRequest): Promise<CompanyRecord> {
    await this.requiredCompany(request.companyId)
    return this.ctx.companies.deleteDepartment(request)
  }

  /**
   * List all employee bindings across companies.
   * @returns detached binding records.
   */
  @Remote('listBindings')
  listBindings(): Promise<readonly EmployeeBinding[]> {
    return this.ctx.companies.listBindings()
  }

  /**
   * Bind or move one employee instance inside one company.
   * @param request - instance, company, and target department (or `null`).
   */
  @Remote('assignEmployee')
  async assignEmployee(request: AssignEmployeeRequest): Promise<void> {
    await this.requiredCompany(request.companyId)
    await this.requiredInstance(request.instanceId)
    await this.ctx.companies.assignEmployee(request)
  }

  /**
   * Remove one employee instance's binding.
   * @param request - instance identity.
   */
  @Remote('unassignEmployee')
  unassignEmployee(request: UnassignEmployeeRequest): Promise<void> {
    return this.ctx.companies.unassignEmployee(request)
  }

  /**
   * List employee instances not bound to any company.
   * @returns selectable instances with lifecycle state.
   */
  @Remote('availableEmployees')
  async availableEmployees(): Promise<readonly CompanyCandidateEmployee[]> {
    const [instances, bindings] = await Promise.all([
      this.ctx.digitalEmployees.list(),
      this.ctx.companies.listBindings(),
    ])
    const bound = new Set(bindings.map(binding => binding.instanceId))
    return instances
      .filter(instance => instance.state !== 'deleting' && instance.state !== 'deleted')
      .filter(instance => !bound.has(instance.id))
      .map(instance => ({
        instanceId: instance.id,
        displayName: instance.displayName,
        templateId: instance.templateId,
        state: instance.state === 'active' ? 'active' as const : 'inactive' as const,
      }))
  }

  /**
   * Project one company's interior render payload with live busy verdicts.
   * @param request - company identity.
   * @returns department groups with seated members and per-seat busy state.
   */
  @Remote('companyFloor')
  async companyFloor(request: CompanyIdRequest): Promise<CompanyFloor> {
    const company = await this.requiredCompany(request.companyId)
    const [instances, bindings] = await Promise.all([
      this.ctx.digitalEmployees.list(),
      this.ctx.companies.listBindings(),
    ])
    const byId = new Map(instances.map(instance => [instance.id as string, instance]))
    const candidates = await Promise.all(
      bindings
        .filter(binding => binding.companyId === request.companyId)
        .map(async (binding) => {
          const instance = byId.get(binding.instanceId)
          const sessionIds = instance === undefined ? [] : await this.employeeSessionIds(instance.id)
          return instance === undefined ? undefined : { binding, instance, sessionIds }
        }),
    )
    const members = candidates.filter((member): member is {
      readonly binding: EmployeeBinding
      readonly instance: DigitalEmployeeInstance
      readonly sessionIds: readonly SessionId[]
    } => member !== undefined)
    const busyById = new Map(await Promise.all(
      [...new Set(members.map(member => member.instance.id))].map(async id => [id, await this.busyVerdict(id)] as const),
    ))
    const groups: CompanyFloorGroup[] = company.departments.map(department => ({
      department,
      members: members
        .filter(member => member.binding.departmentId === department.id)
        .map(member => this.floorMember(member.instance, member.sessionIds, busyById.get(member.instance.id))),
    }))
    if (members.some(member => member.binding.departmentId === null)) {
      groups.push({
        department: null,
        members: members
          .filter(member => member.binding.departmentId === null)
          .map(member => this.floorMember(member.instance, member.sessionIds, busyById.get(member.instance.id))),
      })
    }
    return { company, groups }
  }

  /** Floor member snapshot with its busy verdict and bound-screen chat tail.
   * Tail folds the trailing assistant texts of the employee's newest session
   * through the live store first, then the persistence backend.
   */
  private floorMember(
    instance: DigitalEmployeeInstance,
    sessionIds: readonly SessionId[],
    verdict: { readonly busy: boolean; readonly busyKind: 'chat' | 'task' | null } | undefined,
  ): CompanyFloorMember {
    const rootSessionId = sessionIds[0]
    return {
      instanceId: instance.id,
      displayName: instance.displayName,
      templateId: instance.templateId,
      ...(rootSessionId === undefined ? {} : { rootSessionId }),
      busy: verdict?.busy === true,
      busyKind: verdict?.busyKind ?? null,
      ...rootSessionId === undefined ? {} : { chatTail: this.chatTailOf(rootSessionId) },
    }
  }

  /** Trailing assistant texts of one session for the bound screen.
   * @param sessionId - the employee's root session.
   * @returns up to three trailing non-empty assistant texts.
   */
  private chatTailOf(sessionId: SessionId): readonly string[] {
    // The test harness stubs ctx.sessions as a bare object; tolerate absence.
    const sessions = this.ctx.get('sessions')
    const live = sessions?.get(sessionId)
    if (live !== undefined) return trailingAssistantTexts(live.events)
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return []
    const cached = this.chatTailCache.get(sessionId)
    if (cached !== undefined) return cached
    if (typeof persistence.inspect !== 'function') return []
    void persistence.inspect(sessionId).then((inspected) => {
      this.chatTailCache.set(sessionId, trailingAssistantTexts(inspected.events))
    }).catch(() => {
      this.chatTailCache.set(sessionId, [])
    })
    return []
  }

  /** Distinct session ids attributed to one employee through its audit records, root session first. */
  private async employeeSessionIds(employeeId: DigitalEmployeeInstanceId): Promise<readonly SessionId[]> {
    const audits = await this.ctx.digitalEmployees.listAudit(employeeId)
    const seen: SessionId[] = []
    for (const audit of audits) {
      if (audit.sessionId === undefined) continue
      if (!seen.some(candidate => candidate === audit.sessionId)) seen.push(audit.sessionId)
    }
    return seen
  }

  /**
   * Live working verdict for one employee: a running live session is chat-busy;
   * a non-live session artifact written inside the freshness window by another
   * process (the headless task runner) is task-busy.
   */
  private async busyVerdict(
    employeeId: DigitalEmployeeInstanceId,
  ): Promise<{ readonly busy: boolean; readonly busyKind: 'chat' | 'task' | null }> {
    const sessionIds = await this.employeeSessionIds(employeeId)
    if (sessionIds.length === 0) return { busy: false, busyKind: null }
    const headers = new Map(
      (await this.ctx.sessionPersistence.list()).map(header => [header.id as string, header]),
    )
    for (const sessionId of sessionIds) {
      const agent = this.ctx.agents.get(sessionId)
      if (agent !== undefined) {
        if (agent.status === 'running') return { busy: true, busyKind: 'chat' }
        continue
      }
      if (await this.sessionArtifactFresh(headers.get(sessionId))) {
        return { busy: true, busyKind: 'task' }
      }
    }
    return { busy: false, busyKind: null }
  }

  /** Whether a persisted session's backend artifact was written inside the freshness window. */
  private async sessionArtifactFresh(header: SessionHeader | undefined): Promise<boolean> {
    if (header === undefined) return false
    const location = this.ctx.sessionPersistence.locate(header)
    if (location === undefined) return false
    try {
      const stats = await stat(location.path)
      return Date.now() - stats.mtimeMs < this.taskActiveWindowMs
    } catch {
      return false
    }
  }

  private async requiredCompany(companyId: CompanyId): Promise<CompanyRecord> {
    const company = await this.ctx.companies.get(companyId)
    if (company === undefined) throw new Error(`company "${companyId}" does not exist`)
    return company
  }

  private async requiredInstance(instanceId: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance> {
    const instance = await this.ctx.digitalEmployees.get(instanceId)
    if (instance === undefined || instance.state === 'deleting' || instance.state === 'deleted') {
      throw new Error(`digital employee "${instanceId}" does not exist`)
    }
    return instance
  }
}

/** Rebuild the wire upload as the attachment pipeline's typed input. */
function uploadOf(upload: CompanyPromoImageUpload): { mediaType: ImageMediaType; data: string; name?: string } {
  return {
    mediaType: upload.mediaType as ImageMediaType,
    data: upload.data,
    ...(upload.name === undefined ? {} : { name: upload.name }),
  }
}

/** Rebuild the stored reference as the attachment pipeline's verified ref shape. */
function storedRef(ref: CompanyPromoImageRef): ImageAttachmentRef {
  return {
    attachmentId: ref.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: ref.mediaType as ImageMediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
  }
}

export default CompanyManagementGateway
