/**
 * Company domain records and client-safe wire vocabulary.
 * @module @deepseek-ai/dsh-company/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable identifier of one company. */
export type CompanyId = Branded<'CompanyId'>
/** Stable identifier of one department inside a company. */
export type DepartmentId = Branded<'DepartmentId'>
/** Browser-safe employee instance identity, structurally shared with the owning service. */
export type DigitalEmployeeInstanceId = Branded<'DigitalEmployeeInstanceId'>

/** One department of one company; array position in `CompanyRecord.departments` is its order. */
export interface DepartmentRecord {
  readonly id: DepartmentId
  readonly name: string
  /** Hex color used by console visual encoding. */
  readonly color: string
}

/** Durable reference to an admitted promotional image; mirrors the attachment pipeline's verified ref. */
export interface CompanyPromoImageRef {
  /** Attachment-store identity of the admitted image. */
  readonly attachmentId: string
  /** Admitted media type, verified from the stored bytes. */
  readonly mediaType: string
  /** Exact encoded byte length at admission. */
  readonly bytes: number
  /** Intrinsic encoded width in pixels at admission. */
  readonly width: number
  /** Intrinsic encoded height in pixels at admission. */
  readonly height: number
}

/** One company record; departments are stored inline in display order. */
export interface CompanyRecord {
  readonly id: CompanyId
  readonly name: string
  /** Free-form classification label; empty string means uncategorized. */
  readonly category: string
  /** Legal representative as entered by the owner. */
  readonly legalRepresentative: string
  /** Informational address text; never geocoded. */
  readonly address: string
  /** Per-company rendering skin id; the shipped default when absent. */
  readonly skinId?: string
  readonly promoImage?: CompanyPromoImageRef
  readonly departments: readonly DepartmentRecord[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Membership of one employee instance inside one company. */
export interface EmployeeBinding {
  readonly instanceId: DigitalEmployeeInstanceId
  readonly companyId: CompanyId
  /** `null` places the member in the company's unassigned group. */
  readonly departmentId: DepartmentId | null
}

/** Request to create one company. */
export interface CreateCompanyRequest {
  readonly name: string
  readonly category?: string
  readonly legalRepresentative?: string
  readonly address?: string
  /** Rendering skin id; omitted uses the shipped default. */
  readonly skinId?: string
}

/** Request to update editable company fields; omitted fields keep their values. */
export interface UpdateCompanyRequest {
  readonly companyId: CompanyId
  readonly name?: string
  readonly category?: string
  readonly legalRepresentative?: string
  readonly address?: string
  /** Rendering skin id; the client rendering domain owns the catalog. */
  readonly skinId?: string
}

/** Request to add one department to a company. */
export interface AddDepartmentRequest {
  readonly companyId: CompanyId
  readonly name: string
  readonly color?: string
  /** Insert position; omit to append. */
  readonly position?: number
}

/** Request to rename one department. */
export interface RenameDepartmentRequest {
  readonly companyId: CompanyId
  readonly departmentId: DepartmentId
  readonly name: string
}

/** Request to reorder all departments of one company. */
export interface ReorderDepartmentsRequest {
  readonly companyId: CompanyId
  /** Complete department-id list in the new order. */
  readonly orderedIds: readonly DepartmentId[]
}

/** Request to delete one department; members move to the unassigned group. */
export interface DeleteDepartmentRequest {
  readonly companyId: CompanyId
  readonly departmentId: DepartmentId
}

/** Request to bind or move one employee instance. */
export interface AssignEmployeeRequest {
  readonly instanceId: DigitalEmployeeInstanceId
  readonly companyId: CompanyId
  /** `null` binds the member into the unassigned group. */
  readonly departmentId: DepartmentId | null
}

/** Request addressing one employee instance's binding. */
export interface UnassignEmployeeRequest {
  readonly instanceId: DigitalEmployeeInstanceId
}

/** Request addressing one company. */
export interface CompanyIdRequest {
  readonly companyId: CompanyId
}

/** Admitted promotional image data returned to the console. */
export interface CompanyPromoImageValue {
  readonly mediaType: string
  readonly dataBase64: string
}

/** Request uploading one promotional image. */
export interface SetCompanyPromoImageRequest {
  readonly companyId: CompanyId
  readonly image: CompanyPromoImageUpload
}

/** Encoded image upload, structurally the attachment pipeline's wire unit. */
export interface CompanyPromoImageUpload {
  readonly mediaType: string
  readonly data: string
  readonly name?: string
}

/** Live working verdict for one seated employee. */
export type CompanyBusyKind = 'chat' | 'task'

/** One seated employee snapshot inside a floor group. */
export interface CompanyFloorMember {
  readonly instanceId: DigitalEmployeeInstanceId
  readonly displayName: string
  readonly templateId: string
  /** Root session identity used to subscribe to live running bits; absent when never run. */
  readonly rootSessionId?: SessionId
  readonly busy: boolean
  readonly busyKind: CompanyBusyKind | null
}

/** One department group of a floor projection. */
export interface CompanyFloorGroup {
  /** Department record, or `null` for the company's unassigned group. */
  readonly department: DepartmentRecord | null
  readonly members: readonly CompanyFloorMember[]
}

/** Complete render payload for one company's interior view. */
export interface CompanyFloor {
  readonly company: CompanyRecord
  readonly groups: readonly CompanyFloorGroup[]
}

/** One employee instance selectable for binding. */
export interface CompanyCandidateEmployee {
  readonly instanceId: DigitalEmployeeInstanceId
  readonly displayName: string
  readonly templateId: string
  readonly state: 'inactive' | 'active'
}
