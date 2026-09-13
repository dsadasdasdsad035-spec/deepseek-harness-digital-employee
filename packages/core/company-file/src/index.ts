/**
 * File-backed company provider.
 * @module @deepseek-ai/dsh-company-file
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  createCompanyId,
  createDepartmentId,
  createCompanyEmployeeId,
  type AddDepartmentRequest,
  type AssignEmployeeRequest,
  type CompanyId,
  type CompanyPromoImageRef,
  type CompanyProvider,
  type CompanyRecord,
  type CreateCompanyRequest,
  type DeleteDepartmentRequest,
  type DepartmentId,
  type DepartmentRecord,
  type DigitalEmployeeInstanceId,
  type EmployeeBinding,
  type RenameDepartmentRequest,
  type ReorderDepartmentsRequest,
  type UnassignEmployeeRequest,
  type UpdateCompanyRequest,
} from '@deepseek-ai/dsh-company'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Current on-disk company document version. */
export const SCHEMA_VERSION = 1

/** Default department set seeded into every new company. */
export const PRESET_DEPARTMENTS: readonly { readonly name: string; readonly color: string }[] = [
  { name: '总裁', color: '#d4a017' },
  { name: '人力', color: '#3b82f6' },
  { name: '行政', color: '#22c55e' },
  { name: 'IT', color: '#8b5cf6' },
  { name: '销售', color: '#f97316' },
]

const DEPARTMENT_COLOR_PALETTE = ['#0ea5e9', '#14b8a6', '#f43f5e', '#a855f7', '#eab308', '#64748b'] as const

/** File provider plugin configuration. */
export interface Config {
  /** Explicit document path; defaults under the Harness home. */
  path?: string
  /** Harness home used when `path` is omitted. */
  dshHome?: string
}

/** Schemastery validation for file provider configuration. */
export const Config: z<Config> = z.object({
  path: z.string(),
  dshHome: z.string(),
})

interface StoredDocument {
  readonly schemaVersion: typeof SCHEMA_VERSION
  readonly companies: CompanyRecord[]
  readonly bindings: EmployeeBinding[]
}

interface MutableDocument {
  schemaVersion: typeof SCHEMA_VERSION
  companies: CompanyRecord[]
  bindings: EmployeeBinding[]
}

/**
 * Resolve the provider document path from explicit configuration.
 * @param config - raw file provider configuration.
 * @returns absolute document path.
 */
export function resolveDocumentPath(config: Config): string {
  return resolve(config.path ?? join(resolveDshHome(config.dshHome), 'companies', 'companies.json'))
}

/** File-backed implementation of company, department, and binding operations. */
export class FileCompanyProvider implements CompanyProvider {
  private readonly filename: string
  private document: StoredDocument = emptyDocument()
  private operations: Promise<void> = Promise.resolve()

  constructor(
    private readonly ctx: Context,
    config: Config,
  ) {
    this.filename = resolveDocumentPath(config)
  }

  /**
   * Read and validate the existing document before the provider is published.
   * @returns completion after the in-memory snapshot is ready.
   */
  async initialize(): Promise<void> {
    this.document = await readDocument(this.filename)
  }

  /** @inheritdoc */
  list(): Promise<readonly CompanyRecord[]> {
    return Promise.resolve(this.document.companies.map(copyCompany))
  }

  /** @inheritdoc */
  get(id: CompanyId): Promise<CompanyRecord | undefined> {
    const company = this.document.companies.find(candidate => candidate.id === id)
    return Promise.resolve(company === undefined ? undefined : copyCompany(company))
  }

  /** @inheritdoc */
  create(request: CreateCompanyRequest): Promise<CompanyRecord> {
    return this.transact(created => [created.id], (document) => {
      const now = new Date().toISOString()
      const company: CompanyRecord = {
        id: createCompanyId(randomUUID()),
        name: requiredText(request.name, 'company name'),
        category: optionalText(request.category, 'company category'),
        legalRepresentative: optionalText(request.legalRepresentative, 'company legalRepresentative'),
        address: optionalText(request.address, 'company address'),
        ...(request.skinId === undefined ? {} : { skinId: requiredText(request.skinId, 'company skinId') }),
        departments: PRESET_DEPARTMENTS.map(department => ({
          id: createDepartmentId(randomUUID()),
          name: department.name,
          color: department.color,
        })),
        createdAt: now,
        updatedAt: now,
      }
      document.companies.push(company)
      return copyCompany(company)
    })
  }

  /** @inheritdoc */
  update(request: UpdateCompanyRequest): Promise<CompanyRecord> {
    return this.transact(() => [request.companyId], (document) => {
      const company = requiredCompany(document, request.companyId)
      const next: CompanyRecord = {
        ...company,
        ...(request.name === undefined ? {} : { name: requiredText(request.name, 'company name') }),
        ...(request.category === undefined ? {} : { category: requiredText(request.category, 'company category') }),
        ...(request.legalRepresentative === undefined
          ? {}
          : { legalRepresentative: requiredText(request.legalRepresentative, 'company legalRepresentative') }),
        ...(request.address === undefined ? {} : { address: requiredText(request.address, 'company address') }),
        ...(request.skinId === undefined ? {} : { skinId: requiredText(request.skinId, 'company skinId') }),
        updatedAt: new Date().toISOString(),
      }
      document.companies[document.companies.indexOf(company)] = next
      return copyCompany(next)
    })
  }

  /** @inheritdoc */
  delete(id: CompanyId): Promise<void> {
    return this.transact(() => [id], (document) => {
      const company = requiredCompany(document, id)
      document.companies.splice(document.companies.indexOf(company), 1)
      document.bindings = document.bindings.filter(binding => binding.companyId !== id)
    })
  }

  /** @inheritdoc */
  addDepartment(request: AddDepartmentRequest): Promise<CompanyRecord> {
    return this.transact(() => [request.companyId], (document) => {
      const company = requiredCompany(document, request.companyId)
      const name = requiredText(request.name, 'department name')
      assertUniqueDepartmentName(company, name)
      const position = request.position ?? company.departments.length
      if (!Number.isInteger(position) || position < 0 || position > company.departments.length) {
        throw new Error(`department insert position ${String(position)} is out of range`)
      }
      const department: DepartmentRecord = {
        id: createDepartmentId(randomUUID()),
        name,
        color: request.color === undefined
          ? DEPARTMENT_COLOR_PALETTE[company.departments.length % DEPARTMENT_COLOR_PALETTE.length] ?? '#0ea5e9'
          : requiredText(request.color, 'department color'),
      }
      const departments = [...company.departments]
      departments.splice(position, 0, department)
      return commitDepartments(document, company, departments)
    })
  }

  /** @inheritdoc */
  renameDepartment(request: RenameDepartmentRequest): Promise<CompanyRecord> {
    return this.transact(() => [request.companyId], (document) => {
      const company = requiredCompany(document, request.companyId)
      const name = requiredText(request.name, 'department name')
      assertUniqueDepartmentName(company, name, request.departmentId)
      if (!company.departments.some(department => department.id === request.departmentId)) {
        throw unknownDepartment(request.companyId, request.departmentId)
      }
      const departments = company.departments.map(department =>
        department.id === request.departmentId ? { ...department, name } : department)
      return commitDepartments(document, company, departments)
    })
  }

  /** @inheritdoc */
  reorderDepartments(request: ReorderDepartmentsRequest): Promise<CompanyRecord> {
    return this.transact(() => [request.companyId], (document) => {
      const company = requiredCompany(document, request.companyId)
      const ordered = request.orderedIds.map((id) => {
        const department = company.departments.find(candidate => candidate.id === id)
        if (department === undefined) throw unknownDepartment(request.companyId, id)
        return department
      })
      if (ordered.length !== company.departments.length) {
        throw new Error(
          `company "${request.companyId}" reorder must list every department exactly once (${String(ordered.length)} of ${String(company.departments.length)})`,
        )
      }
      return commitDepartments(document, company, ordered)
    })
  }

  /** @inheritdoc */
  deleteDepartment(request: DeleteDepartmentRequest): Promise<CompanyRecord> {
    return this.transact(() => [request.companyId], (document) => {
      const company = requiredCompany(document, request.companyId)
      if (!company.departments.some(department => department.id === request.departmentId)) {
        throw unknownDepartment(request.companyId, request.departmentId)
      }
      const departments = company.departments.filter(department => department.id !== request.departmentId)
      document.bindings = document.bindings.map(binding =>
        binding.companyId === request.companyId && binding.departmentId === request.departmentId
          ? { ...binding, departmentId: null }
          : binding)
      return commitDepartments(document, company, departments)
    })
  }

  /** @inheritdoc */
  setPromoImage(companyId: CompanyId, ref: CompanyPromoImageRef): Promise<CompanyRecord> {
    return this.transact(() => [companyId], (document) => {
      const company = requiredCompany(document, companyId)
      const next: CompanyRecord = {
        ...company,
        promoImage: {
          attachmentId: requiredText(ref.attachmentId, 'promo image attachmentId'),
          mediaType: requiredText(ref.mediaType, 'promo image mediaType'),
          bytes: requiredInteger(ref.bytes, 'promo image bytes'),
          width: requiredInteger(ref.width, 'promo image width'),
          height: requiredInteger(ref.height, 'promo image height'),
        },
        updatedAt: new Date().toISOString(),
      }
      document.companies[document.companies.indexOf(company)] = next
      return copyCompany(next)
    })
  }

  /** @inheritdoc */
  removePromoImage(companyId: CompanyId): Promise<CompanyRecord> {
    return this.transact(() => [companyId], (document) => {
      const company = requiredCompany(document, companyId)
      const { promoImage: _removed, ...rest } = company
      const next: CompanyRecord = { ...rest, updatedAt: new Date().toISOString() }
      document.companies[document.companies.indexOf(company)] = next
      return copyCompany(next)
    })
  }

  /** @inheritdoc */
  listBindings(): Promise<readonly EmployeeBinding[]> {
    return Promise.resolve(this.document.bindings.map(binding => ({ ...binding })))
  }

  /** @inheritdoc */
  assignEmployee(request: AssignEmployeeRequest): Promise<void> {
    return this.transact(() => [request.companyId], (document) => {
      const company = requiredCompany(document, request.companyId)
      if (request.departmentId !== null
        && !company.departments.some(department => department.id === request.departmentId)) {
        throw unknownDepartment(request.companyId, request.departmentId)
      }
      const binding: EmployeeBinding = {
        instanceId: request.instanceId,
        companyId: request.companyId,
        departmentId: request.departmentId,
      }
      const existing = document.bindings.find(candidate => candidate.instanceId === request.instanceId)
      if (existing === undefined) document.bindings.push(binding)
      else document.bindings[document.bindings.indexOf(existing)] = binding
    })
  }

  /** @inheritdoc */
  unassignEmployee(request: UnassignEmployeeRequest): Promise<void> {
    return this.transact(
      (affected: CompanyId | undefined) => affected === undefined ? [] : [affected],
      (document) => {
        const existing = document.bindings.find(binding => binding.instanceId === request.instanceId)
        document.bindings = document.bindings.filter(binding => binding.instanceId !== request.instanceId)
        return existing?.companyId
      },
    ).then(() => undefined)
  }

  /** @inheritdoc */
  pruneEmployeeBindings(instanceExists: (instanceId: DigitalEmployeeInstanceId) => boolean): Promise<number> {
    return this.transact(
      (result: { readonly count: number; readonly changed: readonly CompanyId[] }) => result.changed,
      (document) => {
        const removed = document.bindings.filter(binding => !instanceExists(binding.instanceId))
        document.bindings = document.bindings.filter(binding => instanceExists(binding.instanceId))
        return { count: removed.length, changed: [...new Set(removed.map(binding => binding.companyId))] }
      },
    ).then(result => result.count)
  }

  private transact<T>(
    companyIdsOf: (result: T) => readonly CompanyId[],
    operation: (document: MutableDocument) => T,
  ): Promise<T> {
    const task = this.operations.then(async () => {
      await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
      return await withFileLock(this.filename, async () => {
        const document = mutableDocument(await readDocument(this.filename))
        const result = operation(document)
        await writeFileAtomic(
          this.filename,
          `${JSON.stringify(document, null, 2)}\n`,
          { mode: 0o600, dirMode: 0o700 },
        )
        this.document = document
        for (const companyId of companyIdsOf(result)) this.ctx.emit('companies/change', companyId)
        return result
      })
    })
    this.operations = task.then(() => undefined, () => undefined)
    return task
  }
}

/** Cordis plugin name. */
export const name = 'company-file'
/** Service required before the provider can register itself. */
export const inject = ['companies']

/**
 * Apply the file-backed company provider.
 * @param ctx - Cordis context carrying the companies Service Definition.
 * @param config - file provider configuration.
 * @returns disposer removing the provider registration.
 */
export async function apply(ctx: Context, config: Config): Promise<() => void> {
  const provider = new FileCompanyProvider(ctx, config)
  await provider.initialize()
  return ctx.companies.configureProvider(provider)
}

function emptyDocument(): StoredDocument {
  return { schemaVersion: SCHEMA_VERSION, companies: [], bindings: [] }
}

async function readDocument(filename: string): Promise<StoredDocument> {
  let text: string
  try {
    text = await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyDocument()
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`company file "${filename}" cannot parse as JSON`, { cause: error })
  }
  const input = record(value, `company file "${filename}"`)
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`company file "${filename}" has unsupported schema version ${String(input.schemaVersion)} (expected ${SCHEMA_VERSION})`)
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    companies: array(input.companies, 'stored companies').map(parseCompany),
    bindings: array(input.bindings, 'stored bindings').map(parseBinding),
  }
}

function parseCompany(value: unknown): CompanyRecord {
  const input = record(value, 'stored company')
  return {
    id: createCompanyId(requiredText(input.id, 'stored company id')),
    name: requiredText(input.name, 'stored company name'),
    category: storedText(input.category, 'stored company category'),
    legalRepresentative: storedText(input.legalRepresentative, 'stored company legalRepresentative'),
    address: storedText(input.address, 'stored company address'),
    ...(input.skinId === undefined ? {} : { skinId: requiredText(input.skinId, 'stored company skinId') }),
    ...(input.promoImage === undefined ? {} : {
      promoImage: parsePromoImage(input.promoImage),
    }),
    departments: array(input.departments, 'stored departments').map(parseDepartment),
    createdAt: requiredText(input.createdAt, 'stored company createdAt'),
    updatedAt: requiredText(input.updatedAt, 'stored company updatedAt'),
  }
}

function parsePromoImage(value: unknown): CompanyPromoImageRef {
  const input = record(value, 'stored company promoImage')
  return {
    attachmentId: requiredText(input.attachmentId, 'stored promo image attachmentId'),
    mediaType: requiredText(input.mediaType, 'stored promo image mediaType'),
    bytes: requiredInteger(input.bytes, 'stored promo image bytes'),
    width: requiredInteger(input.width, 'stored promo image width'),
    height: requiredInteger(input.height, 'stored promo image height'),
  }
}

function parseDepartment(value: unknown): DepartmentRecord {
  const input = record(value, 'stored department')
  return {
    id: createDepartmentId(requiredText(input.id, 'stored department id')),
    name: requiredText(input.name, 'stored department name'),
    color: requiredText(input.color, 'stored department color'),
  }
}

function parseBinding(value: unknown): EmployeeBinding {
  const input = record(value, 'stored binding')
  return {
    instanceId: createCompanyEmployeeId(requiredText(input.instanceId, 'stored binding instanceId')),
    companyId: createCompanyId(requiredText(input.companyId, 'stored binding companyId')),
    departmentId: input.departmentId === null
      ? null
      : createDepartmentId(requiredText(input.departmentId, 'stored binding departmentId')),
  }
}

function mutableDocument(document: StoredDocument): MutableDocument {
  return { schemaVersion: document.schemaVersion, companies: document.companies, bindings: document.bindings }
}

function requiredCompany(document: { readonly companies: readonly CompanyRecord[] }, id: CompanyId): CompanyRecord {
  const company = document.companies.find(candidate => candidate.id === id)
  if (company === undefined) throw new Error(`company "${id}" does not exist`)
  return company
}

function unknownDepartment(companyId: CompanyId, departmentId: DepartmentId): Error {
  return new Error(`department "${departmentId}" does not exist in company "${companyId}"`)
}

function assertUniqueDepartmentName(
  company: CompanyRecord,
  name: string,
  excludeDepartmentId?: DepartmentId,
): void {
  if (company.departments.some(department =>
    department.name === name && department.id !== excludeDepartmentId)) {
    throw new Error(`company "${company.id}" already has a department named "${name}"`)
  }
}

function commitDepartments(
  document: MutableDocument,
  company: CompanyRecord,
  departments: readonly DepartmentRecord[],
): CompanyRecord {
  const next: CompanyRecord = { ...company, departments, updatedAt: new Date().toISOString() }
  document.companies[document.companies.indexOf(company)] = next
  return copyCompany(next)
}

function copyCompany(company: CompanyRecord): CompanyRecord {
  return {
    ...company,
    departments: company.departments.map(department => ({ ...department })),
    ...(company.promoImage === undefined ? {} : { promoImage: { ...company.promoImage } }),
  }
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not a JSON object`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${what} is not a JSON array`)
  return value
}

function requiredText(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${what} is required`)
  return value.trim()
}

function optionalText(value: unknown, what: string): string {
  if (value === undefined || value === null) return ''
  return requiredText(value, what)
}

/** Read a stored informational field that may legitimately be the empty string. */
function storedText(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`${what} is required`)
  return value
}

/** Read a stored non-negative integer field. */
function requiredInteger(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${what} must be a non-negative integer`)
  }
  return value
}
