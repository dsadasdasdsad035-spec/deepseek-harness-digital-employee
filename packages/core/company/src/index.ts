/**
 * Company Service Definition: durable companies binding digital employee instances.
 * @module @deepseek-ai/dsh-company
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  AddDepartmentRequest,
  AssignEmployeeRequest,
  CompanyId,
  CompanyRecord,
  CreateCompanyRequest,
  DeleteDepartmentRequest,
  DepartmentId,
  DigitalEmployeeInstanceId,
  EmployeeBinding,
  RenameDepartmentRequest,
  ReorderDepartmentsRequest,
  CompanyPromoImageRef,
  UnassignEmployeeRequest,
  UpdateCompanyRequest,
} from './types.ts'

export type {
  AddDepartmentRequest,
  AssignEmployeeRequest,
  CompanyBusyKind,
  CompanyCandidateEmployee,
  CompanyFloor,
  CompanyFloorGroup,
  CompanyFloorMember,
  CompanyId,
  CompanyIdRequest,
  CompanyPromoImageRef,
  CompanyPromoImageUpload,
  CompanyPromoImageValue,
  CompanyCarState,
  CompanyEmployeePosition,
  CompanyRecord,
  CompanyWorldStateView,
  CreateCompanyRequest,
  DeleteDepartmentRequest,
  DepartmentId,
  DepartmentRecord,
  DigitalEmployeeInstanceId,
  EmployeeBinding,
  RenameDepartmentRequest,
  ReorderDepartmentsRequest,
  ReportCompanyWorldStateRequest,
  SetCompanyPromoImageRequest,
  UnassignEmployeeRequest,
  UpdateCompanyRequest,
} from './types.ts'

/** Construct a company identifier from its validated string form.
 * @param value - validated company identifier string.
 * @returns branded company identifier.
 */
export const createCompanyId = (value: string): CompanyId => value as CompanyId

/** Construct a department identifier from its validated string form.
 * @param value - validated department identifier string.
 * @returns branded department identifier.
 */
export const createDepartmentId = (value: string): DepartmentId => value as DepartmentId

/** Construct an employee instance identifier from its validated string form.
 * @param value - validated instance identifier string.
 * @returns branded instance identifier.
 */
export const createCompanyEmployeeId = (value: string): DigitalEmployeeInstanceId =>
  value as DigitalEmployeeInstanceId

/** Skin id applied when a company record carries none; the client catalog's default preset. */
export const DEFAULT_COMPANY_SKIN_ID = 'modern'

/** Durable company, department, and binding operations implemented by one provider. */
export interface CompanyProvider {
  /** List all companies in creation order.
   * @returns detached company records.
   */
  list(): Promise<readonly CompanyRecord[]>
  /** Read one company.
   * @param id - company identifier.
   * @returns the record, or `undefined` when absent.
   */
  get(id: CompanyId): Promise<CompanyRecord | undefined>
  /** Create one company with the preset department set.
   * @param request - validated creation fields.
   * @returns the created record.
   */
  create(request: CreateCompanyRequest): Promise<CompanyRecord>
  /** Update editable company fields.
   * @param request - company identifier plus changed fields.
   * @returns the updated record.
   */
  update(request: UpdateCompanyRequest): Promise<CompanyRecord>
  /** Delete one company and unbind all of its members.
   * @param id - company identifier.
   */
  delete(id: CompanyId): Promise<void>
  /** Append or insert one department.
   * @param request - company, department name, optional color and insert position.
   * @returns the updated company record.
   */
  addDepartment(request: AddDepartmentRequest): Promise<CompanyRecord>
  /** Rename one department.
   * @param request - company, department, and new name.
   * @returns the updated company record.
   */
  renameDepartment(request: RenameDepartmentRequest): Promise<CompanyRecord>
  /** Reorder all departments of one company.
   * @param request - company and the complete ordered department-id list.
   * @returns the updated company record.
   */
  reorderDepartments(request: ReorderDepartmentsRequest): Promise<CompanyRecord>
  /** Delete one department, moving members to the unassigned group.
   * @param request - company and department identifiers.
   * @returns the updated company record.
   */
  deleteDepartment(request: DeleteDepartmentRequest): Promise<CompanyRecord>
  /** Attach an admitted promotional image to one company.
   * @param companyId - company identifier.
   * @param ref - admitted image reference.
   * @returns the updated company record.
   */
  setPromoImage(companyId: CompanyId, ref: CompanyPromoImageRef): Promise<CompanyRecord>
  /** Remove the promotional image of one company.
   * @param companyId - company identifier.
   * @returns the updated company record.
   */
  removePromoImage(companyId: CompanyId): Promise<CompanyRecord>
  /** List all employee bindings.
   * @returns detached binding records.
   */
  listBindings(): Promise<readonly EmployeeBinding[]>
  /** Bind or move one employee instance inside one company.
   * @param request - instance, company, and target department (or `null`).
   */
  assignEmployee(request: AssignEmployeeRequest): Promise<void>
  /** Remove one employee instance's binding.
   * @param request - instance identifier.
   */
  unassignEmployee(request: UnassignEmployeeRequest): Promise<void>
  /** Remove the bindings of instances that no longer exist; called from instance deletion.
   * @param instanceExists - predicate naming which instance identifiers remain alive.
   * @returns how many bindings were removed.
   */
  pruneEmployeeBindings(instanceExists: (instanceId: EmployeeBinding['instanceId']) => boolean): Promise<number>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
  /** Durable company store Service Definition. */
    companies: Companies
  }

  interface Events {
    /**
     * A company, its departments, or its bindings changed.
     * @mode emit
     * @param companyId - company whose stored data changed.
     */
    'companies/change'(companyId: CompanyId): void
  }
}

/** Registry facade over the sole durable company provider. */
export class Companies extends Service {
  private provider: CompanyProvider | undefined

  constructor(ctx: Context) {
    super(ctx, 'companies')
  }

  /**
   * Configure the sole durable provider for the current plugin lifetime.
   * @param provider - provider implementing company, department, and binding operations.
   * @returns disposer that removes this exact provider.
   */
  configureProvider(provider: CompanyProvider): () => void {
    if (this.provider !== undefined) throw new Error('company provider is already configured')
    const dispose = this.ctx.effect(() => {
      this.provider = provider
      return () => {
        if (this.provider === provider) this.provider = undefined
      }
    }, 'companies.configureProvider()')
    // oxlint-disable-next-line typescript/no-misused-promises -- the public registry API exposes Cordis's synchronous disposer identity
    return dispose
  }

  private requiredProvider(): CompanyProvider {
    if (this.provider === undefined) throw new Error('company provider is not configured')
    return this.provider
  }

  /** List all companies in creation order through the configured provider.
   * @returns creation-ordered company records.
   */
  list(): Promise<readonly CompanyRecord[]> {
    return this.requiredProvider().list()
  }

  /** Read one company through the configured provider.
   * @param id - company identifier.
   * @returns the record, or `undefined` when absent.
   */
  get(id: CompanyId): Promise<CompanyRecord | undefined> {
    return this.requiredProvider().get(id)
  }

  /** Create one company with the preset departments through the configured provider.
   * @param request - validated creation fields.
   * @returns the created record.
   */
  create(request: CreateCompanyRequest): Promise<CompanyRecord> {
    return this.requiredProvider().create(request)
  }

  /** Update editable company fields through the configured provider.
   * @param request - company identifier plus changed fields.
   * @returns the updated record.
   */
  update(request: UpdateCompanyRequest): Promise<CompanyRecord> {
    return this.requiredProvider().update(request)
  }

  /** Delete one company and unbind all of its members through the configured provider.
   * @param id - company identifier.
   */
  delete(id: CompanyId): Promise<void> {
    return this.requiredProvider().delete(id)
  }

  /** Append or insert one department through the configured provider.
   * @param request - company, department name, optional color and insert position.
   * @returns the updated record.
   */
  addDepartment(request: AddDepartmentRequest): Promise<CompanyRecord> {
    return this.requiredProvider().addDepartment(request)
  }

  /** Rename one department through the configured provider.
   * @param request - company, department, and new name.
   * @returns the updated record.
   */
  renameDepartment(request: RenameDepartmentRequest): Promise<CompanyRecord> {
    return this.requiredProvider().renameDepartment(request)
  }

  /** Reorder all departments of one company through the configured provider.
   * @param request - company and the complete ordered department-id list.
   * @returns the updated record.
   */
  reorderDepartments(request: ReorderDepartmentsRequest): Promise<CompanyRecord> {
    return this.requiredProvider().reorderDepartments(request)
  }

  /** Delete one department, moving members to the unassigned group.
   * @param request - company and department identifiers.
   * @returns the updated record.
   */
  deleteDepartment(request: DeleteDepartmentRequest): Promise<CompanyRecord> {
    return this.requiredProvider().deleteDepartment(request)
  }

  /** Attach an admitted promotional image to one company.
   * @param companyId - company identifier.
   * @param ref - admitted image reference.
   * @returns the updated record.
   */
  setPromoImage(companyId: CompanyId, ref: CompanyPromoImageRef): Promise<CompanyRecord> {
    return this.requiredProvider().setPromoImage(companyId, ref)
  }

  /** Remove one company's promotional image reference.
   * @param companyId - company identifier.
   * @returns the updated record.
   */
  removePromoImage(companyId: CompanyId): Promise<CompanyRecord> {
    return this.requiredProvider().removePromoImage(companyId)
  }

  /** List all employee bindings through the configured provider.
   * @returns detached binding records.
   */
  listBindings(): Promise<readonly EmployeeBinding[]> {
    return this.requiredProvider().listBindings()
  }

  /** Bind or move one employee instance inside one company.
   * @param request - instance, company, and target department (or `null`).
   */
  assignEmployee(request: AssignEmployeeRequest): Promise<void> {
    return this.requiredProvider().assignEmployee(request)
  }

  /** Remove one employee instance's binding.
   * @param request - instance identifier.
   */
  unassignEmployee(request: UnassignEmployeeRequest): Promise<void> {
    return this.requiredProvider().unassignEmployee(request)
  }

  /** Remove bindings of instances the predicate names as gone.
   * @param instanceExists - predicate naming which instance identifiers remain alive.
   * @returns how many bindings were removed.
   */
  pruneEmployeeBindings(instanceExists: (instanceId: EmployeeBinding['instanceId']) => boolean): Promise<number> {
    return this.requiredProvider().pruneEmployeeBindings(instanceExists)
  }
}

export default Companies
