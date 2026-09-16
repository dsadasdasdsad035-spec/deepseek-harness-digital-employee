/**
 * File-backed digital employee provider.
 * @module @deepseek-ai/dsh-digital-employee-file
 */

import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  type ApplyDigitalEmployeeUpgradeRequest,
  assertLifecycleTransition,
  type CreateDigitalEmployeeRequest,
  type AppendDigitalEmployeeAuditRequest,
  type DigitalEmployeeAuditRecord,
  type DigitalEmployeeExportArtifact,
  type DigitalEmployeeInstance,
  type DigitalEmployeeInstanceId,
  type DigitalEmployeeLifecycleState,
  type DigitalEmployeeMemoryCandidate,
  type DigitalEmployeeMemoryDecision,
  type DigitalEmployeeMemoryId,
  type DigitalEmployeeMemoryQuery,
  type DigitalEmployeeMemoryRecord,
  type DigitalEmployeeProvider,
  type ExportDigitalEmployeeRequest,
  buildAuditRecord,
  DigitalEmployeeProviderBase,
  copyInstance,
  copyMemory,
  EMPLOYEES_DOCUMENT_SCHEMA_VERSION,
  employeeExportArtifact,
  type EmployeeTemplateSource,
  type EmployeeProviderStorageConfig,
  importedEmployee,
  newEmployeeInstance,
  requiredEmployeeTemplate,
  parseEmployeeDocument,
  portableMemory,
  rankMemories,
  requestApplyUpgrade,
  reviewPromotion,
} from '@deepseek-ai/dsh-digital-employee'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Current on-disk digital employee document version. */
export const SCHEMA_VERSION = EMPLOYEES_DOCUMENT_SCHEMA_VERSION

// The autonomous-task attempt ledger shares this package's home: it lives in
// the same user-data directory, uses the same lock and atomic-write machinery,
// and is the one home of the task-attempts.json format.
export * from './task-attempts.ts'

/** File provider plugin configuration. */
export interface Config extends EmployeeProviderStorageConfig {}

/* jscpd:ignore-start -- the config-catalog gate requires each package to
 * declare its z.object schema verbatim with plain keys, so these storage
 * members cannot come from a shared factory. */
/** Schemastery validation for file provider configuration. */
export const Config: z<Config> = z.object({
  path: z.string(),
  dshHome: z.string(),
  allowSensitiveMemory: z.boolean().default(false),
  maxRetentionDays: z.number().step(1).min(1).default(3_650),
})
/* jscpd:ignore-end */

interface StoredDocument {
  readonly schemaVersion: typeof SCHEMA_VERSION
  readonly instances: DigitalEmployeeInstance[]
  readonly memories: DigitalEmployeeMemoryRecord[]
  readonly audits: DigitalEmployeeAuditRecord[]
}

/**
 * Resolve the provider document path from explicit configuration.
 * @param config - raw file provider configuration.
 * @returns absolute versioned document path.
 */
export function resolveDocumentPath(config: Config): string {
  return resolve(config.path ?? join(resolveDshHome(config.dshHome), 'digital-employees', 'employees.json'))
}

/** File-backed implementation of instance, memory, lifecycle, resolution, and audit operations. */
export class FileDigitalEmployeeProvider extends DigitalEmployeeProviderBase implements DigitalEmployeeProvider {
  protected override get templateSource(): EmployeeTemplateSource {
    return this.ctx.digitalEmployees
  }

  private readonly filename: string
  private readonly allowSensitiveMemory: boolean
  private readonly maxRetentionDays: number
  private document: StoredDocument = emptyDocument()
  private operations: Promise<void> = Promise.resolve()

  constructor(
    private readonly ctx: Context,
    config: Config,
  ) {
    super()
    this.filename = resolveDocumentPath(config)
    this.allowSensitiveMemory = config.allowSensitiveMemory ?? false
    this.maxRetentionDays = config.maxRetentionDays ?? 3_650
    positiveInteger(this.maxRetentionDays, 'digital employee maxRetentionDays')
  }

  /**
   * Read and validate the existing document before the provider is published.
   * @returns completion after the in-memory snapshot is ready.
   */
  async initialize(): Promise<void> {
    this.document = await readDocument(this.filename)
  }

  /** @inheritdoc */
  list(): Promise<readonly DigitalEmployeeInstance[]> {
    return Promise.resolve(this.document.instances.map(copyInstance))
  }

  /** @inheritdoc */
  get(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance | undefined> {
    const instance = this.document.instances.find(candidate => candidate.id === id)
    return Promise.resolve(instance === undefined ? undefined : copyInstance(instance))
  }

  /** @inheritdoc */
  create(request: CreateDigitalEmployeeRequest): Promise<DigitalEmployeeInstance> {
    return this.mutate((document) => {
      const template = requiredEmployeeTemplate(this.ctx.digitalEmployees, request.templateId, request.templateVersion)
      const instance = newEmployeeInstance(template, request)
      document.instances.push(instance)
      return copyInstance(instance)
    })
  }

  /** @inheritdoc */
  transition(
    id: DigitalEmployeeInstanceId,
    state: DigitalEmployeeLifecycleState,
  ): Promise<DigitalEmployeeInstance> {
    return this.mutate((document) => {
      const index = requiredInstanceIndex(document, id)
      const current = requiredArrayEntry(document.instances, index, 'digital employee')
      assertLifecycleTransition(current.state, state)
      const next: DigitalEmployeeInstance = { ...current, state, updatedAt: new Date().toISOString() }
      document.instances[index] = next
      this.ctx.emit('digital-employees/instance-change', id, state)
      return copyInstance(next)
    })
  }

  /** @inheritdoc */
  delete(id: DigitalEmployeeInstanceId): Promise<void> {
    return this.mutate((document) => {
      const index = requiredInstanceIndex(document, id)
      const current = requiredArrayEntry(document.instances, index, 'digital employee')
      if (current.state !== 'deleting') {
        throw new Error(`digital employee "${id}" must be deleting before removal`)
      }
      document.instances.splice(index, 1)
      document.memories = document.memories.filter(memory => memory.employeeId !== id)
      document.audits = document.audits.filter(audit => audit.employeeId !== id)
    })
  }

  /** @inheritdoc */
  applyUpgrade(request: ApplyDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeInstance> {
    return this.mutate((document) => {
      const index = requiredInstanceIndex(document, request.employeeId)
      const current = requiredArrayEntry(document.instances, index, 'digital employee')
      const next = requestApplyUpgrade(this.ctx.digitalEmployees, current, request.targetVersion, request.approvedCapabilities)
      document.instances[index] = next
      return copyInstance(next)
    })
  }

  /** @inheritdoc */
  async exportEmployee(request: ExportDigitalEmployeeRequest): Promise<DigitalEmployeeExportArtifact> {
    const instance = await this.requiredInstance(request.employeeId)
    const memories = request.includeMemory
      ? this.document.memories.filter(memory => memory.employeeId === instance.id).map(portableMemory)
      : undefined
    return employeeExportArtifact(instance, memories)
  }

  /** @inheritdoc */
  importEmployee(artifact: DigitalEmployeeExportArtifact): Promise<DigitalEmployeeInstance> {
    return this.mutate((document) => {
      const { instance, memories } = importedEmployee(this.ctx.digitalEmployees, artifact)
      document.instances.push(instance)
      document.memories.push(...memories)
      return copyInstance(instance)
    })
  }

  /** @inheritdoc */
  queryMemory(query: DigitalEmployeeMemoryQuery): Promise<readonly DigitalEmployeeMemoryRecord[]> {
    const owned = this.document.memories.filter(memory => memory.employeeId === query.employeeId)
    return Promise.resolve(rankMemories(owned, query).map(copyMemory))
  }

  /** @inheritdoc */
  promoteMemory(candidate: DigitalEmployeeMemoryCandidate): Promise<DigitalEmployeeMemoryDecision> {
    return this.mutate((document) => {
      if (!document.instances.some(instance => instance.id === candidate.employeeId)) {
        return { kind: 'rejected', reason: `digital employee "${candidate.employeeId}" does not exist` }
      }
      const decision = reviewPromotion(
        candidate,
        document.memories.filter(memory => memory.employeeId === candidate.employeeId),
        { allowSensitiveMemory: this.allowSensitiveMemory, maxRetentionDays: this.maxRetentionDays },
      )
      if (decision.kind === 'accepted') document.memories.push(decision.memory)
      return decision
    })
  }

  /** @inheritdoc */
  deleteMemory(employeeId: DigitalEmployeeInstanceId, memoryId: DigitalEmployeeMemoryId): Promise<void> {
    return this.mutate((document) => {
      const index = document.memories.findIndex(memory => memory.employeeId === employeeId && memory.id === memoryId)
      if (index < 0) throw new Error(`digital employee memory "${memoryId}" does not exist for employee "${employeeId}"`)
      document.memories.splice(index, 1)
    })
  }

  /** @inheritdoc */
  listAudit(employeeId: DigitalEmployeeInstanceId): Promise<readonly DigitalEmployeeAuditRecord[]> {
    return Promise.resolve(
      this.document.audits.filter(audit => audit.employeeId === employeeId).map(audit => ({ ...audit })),
    )
  }

  /** @inheritdoc */
  appendAudit(request: AppendDigitalEmployeeAuditRequest): Promise<DigitalEmployeeAuditRecord> {
    return this.mutate((document) => {
      if (!document.instances.some(instance => instance.id === request.employeeId)) {
        throw new Error(`digital employee "${request.employeeId}" does not exist`)
      }
      const record = buildAuditRecord(request)
      document.audits.push(record)
      return { ...record, metadata: { ...record.metadata } }
    })
  }

  private mutate<T>(operation: (document: MutableDocument) => T): Promise<T> {
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
        return result
      })
    })
    this.operations = task.then(() => undefined, () => undefined)
    return task
  }
}

interface MutableDocument {
  schemaVersion: typeof SCHEMA_VERSION
  instances: DigitalEmployeeInstance[]
  memories: DigitalEmployeeMemoryRecord[]
  audits: DigitalEmployeeAuditRecord[]
}

/** Cordis plugin name. */
export const name = 'digital-employee-file'
/** Required Service Definition. */
export const inject = ['digitalEmployees']

/**
 * Mount the file provider behind `ctx.digitalEmployees`.
 * @param ctx - Cordis context carrying the Definition service.
 * @param config - file provider configuration.
 * @returns disposer removing the configured provider.
 */
export async function apply(ctx: Context, config: Config): Promise<() => void> {
  const provider = new FileDigitalEmployeeProvider(ctx, config)
  await provider.initialize()
  return ctx.digitalEmployees.configureProvider(provider)
}

function emptyDocument(): StoredDocument {
  return { schemaVersion: SCHEMA_VERSION, instances: [], memories: [], audits: [] }
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
    throw new Error(`digital employee file "${filename}" cannot parse as JSON`, { cause: error })
  }
  return { schemaVersion: SCHEMA_VERSION, ...parseEmployeeDocument(value, filename) }
}

function requiredInstanceIndex(document: StoredDocument, id: DigitalEmployeeInstanceId): number {
  const index = document.instances.findIndex(instance => instance.id === id)
  if (index < 0) throw new Error(`digital employee "${id}" does not exist`)
  return index
}

function mutableDocument(document: StoredDocument): MutableDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    instances: document.instances.map(copyInstance),
    memories: document.memories.map(copyMemory),
    audits: document.audits.map(audit => ({ ...audit })),
  }
}

function requiredArrayEntry<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index]
  if (value === undefined) throw new Error(`${label} index ${index} is unavailable`)
  return value
}


function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer`)
  return value as number
}
