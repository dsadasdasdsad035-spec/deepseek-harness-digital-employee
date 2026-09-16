/**
 * SQLite-backed digital employee provider. One database file holds instances,
 * long-term memories, and audits; writes commit through serialized immediate
 * transactions with schema-ownership revalidation, so a headless employee
 * process and the web service can share the store without a file lock.
 * @module @deepseek-ai/dsh-digital-employee-sqlite
 */

import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { DatabaseSync } from 'node:sqlite'
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
  copyInstance,
  DigitalEmployeeProviderBase,
  copyMemory,
  employeeExportArtifact,
  type EmployeeProviderStorageConfig,
  type EmployeeTemplateSource,
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
import {
  assertDatabasePath,
  decodeAuditRow,
  decodeInstanceRow,
  decodeMemoryRow,
  type JournalMode,
  openDatabase,
  validateSchemaForMutation,
} from './schema.ts'
import { sql } from './sql.ts'

export { DIGITAL_EMPLOYEE_SQLITE_APPLICATION_ID, SCHEMA_VERSION, type JournalMode } from './schema.ts'

/** Basename of the legacy JSON document sitting beside the database. */
export const LEGACY_DOCUMENT_BASENAME = 'employees.json'
/** Suffix the legacy JSON document takes after a completed import. */
export const LEGACY_IMPORTED_SUFFIX = '.imported'

/** SQLite provider plugin configuration. */
export interface Config extends EmployeeProviderStorageConfig {
  /** SQLite `journal_mode`; `wal` suits local disks, rollback modes suit network mounts. */
  journalMode?: JournalMode
  /** Maximum wait in milliseconds for a competing SQLite lock. */
  busyTimeoutMs?: number
}

/* jscpd:ignore-start -- the config-catalog gate requires each package to
 * declare its z.object schema verbatim with plain keys, so these storage
 * members cannot come from a shared factory. */
/** Schemastery validation for SQLite provider configuration. */
export const Config: z<Config> = z.object({
  path: z.string(),
  dshHome: z.string(),
  allowSensitiveMemory: z.boolean().default(false),
  maxRetentionDays: z.number().step(1).min(1).default(3_650),
  journalMode: z.union(['wal', 'delete', 'truncate', 'persist'] as const).default('wal'),
  busyTimeoutMs: z.number().step(1).min(1).default(5_000),
})
/* jscpd:ignore-end */

/**
 * Resolve the provider database path from explicit configuration. The
 * in-process `:memory:` sentinel passes through untouched.
 * @param config - raw SQLite provider configuration.
 * @returns absolute database path or `:memory:`.
 */
export function resolveDatabasePath(config: Config): string {
  if (config.path === ':memory:') return ':memory:'
  return resolve(config.path ?? join(resolveDshHome(config.dshHome), 'digital-employees', 'employees.db'))
}

/** SQLite-backed implementation of instance, memory, lifecycle, resolution, and audit operations. */
export class SqliteDigitalEmployeeProvider extends DigitalEmployeeProviderBase implements DigitalEmployeeProvider {
  protected override get templateSource(): EmployeeTemplateSource {
    return this.ctx.digitalEmployees
  }

  private readonly databasePath: string
  private readonly legacyDocumentPath: string
  private readonly allowSensitiveMemory: boolean
  private readonly maxRetentionDays: number
  private readonly journalMode: JournalMode
  private readonly busyTimeoutMs: number
  private operations: Promise<void> = Promise.resolve()
  private ready: Promise<DatabaseSync> | undefined
  private databaseConstructor: typeof import('node:sqlite')['DatabaseSync'] | undefined

  constructor(
    private readonly ctx: Context,
    config: Config,
  ) {
    super()
    this.databasePath = resolveDatabasePath(config)
    this.legacyDocumentPath = join(dirname(this.databasePath), LEGACY_DOCUMENT_BASENAME)
    this.allowSensitiveMemory = config.allowSensitiveMemory ?? false
    this.maxRetentionDays = config.maxRetentionDays ?? 3_650
    this.journalMode = config.journalMode ?? 'wal'
    this.busyTimeoutMs = config.busyTimeoutMs ?? 5_000
    positiveInteger(this.maxRetentionDays, 'digital employee maxRetentionDays')
    assertDatabasePath(this.databasePath)
  }

  /**
   * Open the database, import a legacy JSON document when present, and fail
   * loudly on unusable files before the provider is published.
   * @returns completion after import settlement.
   */
  async initialize(): Promise<void> {
    const db = await this.database()
    await importLegacyDocument(db, this.legacyDocumentPath)
  }

  /** @inheritdoc */
  async list(): Promise<readonly DigitalEmployeeInstance[]> {
    const db = await this.database()
    return db.prepare(sql('select-instances')).all().map(decodeInstanceRow).map(copyInstance)
  }

  /** @inheritdoc */
  async get(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance | undefined> {
    const db = await this.database()
    const row = db.prepare(sql('select-instance')).get(id)
    return row === undefined ? undefined : copyInstance(decodeInstanceRow(row))
  }

  /** @inheritdoc */
  create(request: CreateDigitalEmployeeRequest): Promise<DigitalEmployeeInstance> {
    return this.mutate((db) => {
      const template = requiredEmployeeTemplate(this.ctx.digitalEmployees, request.templateId, request.templateVersion)
      const instance = newEmployeeInstance(template, request)
      insertInstance(db, instance)
      return copyInstance(instance)
    })
  }

  /** @inheritdoc */
  transition(
    id: DigitalEmployeeInstanceId,
    state: DigitalEmployeeLifecycleState,
  ): Promise<DigitalEmployeeInstance> {
    return this.mutate((db) => {
      const row = db.prepare(sql('select-instance')).get(id)
      if (row === undefined) throw new Error(`digital employee "${id}" does not exist`)
      const current = decodeInstanceRow(row)
      assertLifecycleTransition(current.state, state)
      const updatedAt = new Date().toISOString()
      db.prepare(sql('update-instance-state')).run(state, updatedAt, id)
      this.ctx.emit('digital-employees/instance-change', id, state)
      return copyInstance({ ...current, state, updatedAt })
    })
  }

  /** @inheritdoc */
  async delete(id: DigitalEmployeeInstanceId): Promise<void> {
    await this.mutate((db) => {
      const row = db.prepare(sql('select-instance')).get(id)
      if (row === undefined) throw new Error(`digital employee "${id}" does not exist`)
      const current = decodeInstanceRow(row)
      if (current.state !== 'deleting') {
        throw new Error(`digital employee "${id}" must be deleting before removal`)
      }
      // Memory and audit rows leave through ON DELETE CASCADE.
      db.prepare(sql('delete-instance')).run(id)
    })
  }

  /** @inheritdoc */
  applyUpgrade(request: ApplyDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeInstance> {
    return this.mutate((db) => {
      const row = db.prepare(sql('select-instance')).get(request.employeeId)
      if (row === undefined) throw new Error(`digital employee "${request.employeeId}" does not exist`)
      const current = decodeInstanceRow(row)
      const next = requestApplyUpgrade(this.ctx.digitalEmployees, current, request.targetVersion, request.approvedCapabilities)
      db.prepare(sql('update-instance-upgrade')).run(next.templateVersion, JSON.stringify(next.grants), next.updatedAt, current.id)
      return copyInstance(next)
    })
  }

  /** @inheritdoc */
  async exportEmployee(request: ExportDigitalEmployeeRequest): Promise<DigitalEmployeeExportArtifact> {
    const instance = await this.requiredInstance(request.employeeId)
    const memories = request.includeMemory
      ? this.employeeMemoriesIn(await this.database(), instance.id).map(portableMemory)
      : undefined
    return employeeExportArtifact(instance, memories)
  }

  /** @inheritdoc */
  importEmployee(artifact: DigitalEmployeeExportArtifact): Promise<DigitalEmployeeInstance> {
    return this.mutate((db) => {
      const { instance, memories } = importedEmployee(this.ctx.digitalEmployees, artifact)
      insertInstance(db, instance)
      for (const memory of memories) insertMemory(db, memory)
      return copyInstance(instance)
    })
  }

  /** @inheritdoc */
  async queryMemory(query: DigitalEmployeeMemoryQuery): Promise<readonly DigitalEmployeeMemoryRecord[]> {
    const memories = this.employeeMemoriesIn(await this.database(), query.employeeId)
    return rankMemories(memories, query).map(copyMemory)
  }

  /** @inheritdoc */
  promoteMemory(candidate: DigitalEmployeeMemoryCandidate): Promise<DigitalEmployeeMemoryDecision> {
    return this.mutate((db) => {
      if (db.prepare(sql('select-instance-exists')).get(candidate.employeeId) === undefined) {
        return { kind: 'rejected', reason: `digital employee "${candidate.employeeId}" does not exist` }
      }
      const decision = reviewPromotion(
        candidate,
        this.employeeMemoriesIn(db, candidate.employeeId),
        { allowSensitiveMemory: this.allowSensitiveMemory, maxRetentionDays: this.maxRetentionDays },
      )
      if (decision.kind === 'accepted') insertMemory(db, decision.memory)
      return decision
    })
  }

  /** @inheritdoc */
  deleteMemory(employeeId: DigitalEmployeeInstanceId, memoryId: DigitalEmployeeMemoryId): Promise<void> {
    return this.mutate((db) => {
      const deleted = db.prepare(sql('delete-memory')).run(memoryId, employeeId)
      if (Number(deleted.changes) === 0) {
        throw new Error(`digital employee memory "${memoryId}" does not exist for employee "${employeeId}"`)
      }
    })
  }

  /** @inheritdoc */
  async listAudit(employeeId: DigitalEmployeeInstanceId): Promise<readonly DigitalEmployeeAuditRecord[]> {
    const db = await this.database()
    return db.prepare(sql('select-audits-for-employee')).all(employeeId)
      .map(decodeAuditRow)
      .map(audit => ({ ...audit, metadata: { ...audit.metadata } }))
  }

  /** @inheritdoc */
  appendAudit(request: AppendDigitalEmployeeAuditRequest): Promise<DigitalEmployeeAuditRecord> {
    return this.mutate((db) => {
      if (db.prepare(sql('select-instance-exists')).get(request.employeeId) === undefined) {
        throw new Error(`digital employee "${request.employeeId}" does not exist`)
      }
      const audit = buildAuditRecord(request)
      db.prepare(sql('insert-audit')).run(audit.id, audit.employeeId, JSON.stringify(audit))
      return { ...audit, metadata: { ...audit.metadata } }
    })
  }

  /**
   * Close the database after outstanding writes settle. A database that never
   * opened (open failure) resolves without further error.
   * @returns resolution once the handle is released or the failure observed.
   */
  async close(): Promise<void> {
    const ready = this.ready
    if (ready === undefined) return
    this.ready = undefined
    this.databaseConstructor = undefined
    await this.operations
    const db = await ready.catch(() => undefined)
    db?.close()
  }

  private database(): Promise<DatabaseSync> {
    this.ready ??= this.open()
    return this.ready
  }

  private async open(): Promise<DatabaseSync> {
    await mkdir(dirname(this.databasePath), { recursive: true, mode: 0o700 })
    const { DatabaseSync } = await importNodeSqlite()
    this.databaseConstructor = DatabaseSync
    return openDatabase(DatabaseSync, this.databasePath, this.journalMode, this.busyTimeoutMs)
  }

  private mutate<T>(operation: (db: DatabaseSync) => T): Promise<T> {
    const task = this.operations.then(async () => {
      const db = await this.database()
      const Database = this.requiredDatabaseConstructor()
      db.exec(sql('begin-immediate'))
      try {
        validateSchemaForMutation(Database, db, this.databasePath)
        const result = operation(db)
        db.exec(sql('commit'))
        return result
      } catch (error: unknown) {
        try {
          db.exec(sql('rollback'))
        } catch (rollbackError: unknown) {
          throw new AggregateError([error, rollbackError], 'digital employee mutation failed and rollback also failed')
        }
        throw error
      }
    })
    this.operations = task.then(() => undefined, () => undefined)
    return task
  }

  private requiredDatabaseConstructor(): typeof import('node:sqlite')['DatabaseSync'] {
    if (this.databaseConstructor === undefined) throw new Error('digital employee database is not open')
    return this.databaseConstructor
  }

  private employeeMemoriesIn(db: DatabaseSync, employeeId: DigitalEmployeeInstanceId): readonly DigitalEmployeeMemoryRecord[] {
    return db.prepare(sql('select-memories-for-employee')).all(employeeId).map(decodeMemoryRow)
  }

}

function insertInstance(db: DatabaseSync, instance: DigitalEmployeeInstance): void {
  db.prepare(sql('insert-instance')).run(
    instance.id,
    instance.templateId,
    instance.templateVersion,
    instance.displayName,
    instance.personality ?? null,
    JSON.stringify(instance.grants),
    instance.state,
    instance.createdAt,
    instance.updatedAt,
  )
}

function insertMemory(db: DatabaseSync, memory: DigitalEmployeeMemoryRecord): void {
  db.prepare(sql('insert-memory')).run(
    memory.id,
    memory.employeeId,
    memory.scope,
    memory.content,
    JSON.stringify([...memory.tags]),
    memory.sensitive ? 1 : 0,
    memory.expiresAt ?? null,
    JSON.stringify({ ...memory.provenance }),
  )
}

/**
 * Import a legacy `employees.json` document once: when the database holds no
 * instances and the legacy file exists, validated members are inserted in one
 * transaction and the file is renamed aside. Parse failures abort the open.
 * @param db - opened database handle.
 * @param legacyPath - legacy JSON document location.
 */
async function importLegacyDocument(db: DatabaseSync, legacyPath: string): Promise<void> {
  const text = await readOptional(legacyPath)
  if (text === undefined) return
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch (error: unknown) {
    throw new Error(`digital employee file "${legacyPath}" cannot parse as JSON`, { cause: error })
  }
  const document = parseEmployeeDocument(value, legacyPath)
  db.exec(sql('begin-immediate'))
  try {
    // A concurrent writer may have imported or populated first; its data wins.
    if (db.prepare(sql('select-any-instance')).get() === undefined) {
      for (const instance of document.instances) insertInstance(db, instance)
      for (const memory of document.memories) insertMemory(db, memory)
      for (const audit of document.audits) {
        db.prepare(sql('insert-audit')).run(audit.id, audit.employeeId, JSON.stringify(audit))
      }
    }
    db.exec(sql('commit'))
  } catch (error: unknown) {
    try {
      db.exec(sql('rollback'))
    } catch {
      // The original import failure remains actionable.
    }
    throw error
  }
  // The archive target is this provider's own previous import snapshot.
  await rm(`${legacyPath}${LEGACY_IMPORTED_SUFFIX}`, { force: true })
  await rename(legacyPath, `${legacyPath}${LEGACY_IMPORTED_SUFFIX}`)
}

async function readOptional(filename: string): Promise<string | undefined> {
  try {
    return await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/* jscpd:ignore-start -- the standard Node 22 SQLite warning filter shared by every
 * node:sqlite backend; a util extraction is deferred with the other media helpers. */
let nodeSqlite: Promise<typeof import('node:sqlite')> | undefined

/**
 * Load Node SQLite once so concurrent providers share one warning-filter lifetime.
 * @returns the Node SQLite module namespace.
 */
function importNodeSqlite(): Promise<typeof import('node:sqlite')> {
  nodeSqlite ??= importNodeSqliteFiltered()
  return nodeSqlite
}

/** Import Node 22's SQLite dependency without its process-wide experimental warning. */
async function importNodeSqliteFiltered(): Promise<typeof import('node:sqlite')> {
  const emitWarning = Reflect.get(process, 'emitWarning')
  /* v8 ignore start -- Node 22 alone emits this warning; primary coverage runs on Node 24. */
  const filteredEmitWarning = (warning: string | Error, ...args: unknown[]): void => {
    const message = warning instanceof Error ? warning.message : warning
    const first = args[0]
    const type = warning instanceof Error
      ? warning.name
      : typeof first === 'string'
        ? first
        : typeof first === 'object' && first !== null && 'type' in first
          ? first.type
          : undefined
    if (message === 'SQLite is an experimental feature and might change at any time'
      && type === 'ExperimentalWarning') return
    Reflect.apply(emitWarning, process, [warning, ...args])
  }
  Reflect.set(process, 'emitWarning', filteredEmitWarning)
  try {
    return await import('node:sqlite')
  } finally {
    Reflect.set(process, 'emitWarning', emitWarning)
  }
  /* v8 ignore stop */
}
/* jscpd:ignore-end */

/** Cordis plugin name. */
export const name = 'digital-employee-sqlite'
/** Required Service Definition. */
export const inject = ['digitalEmployees']

/**
 * Mount the SQLite provider behind `ctx.digitalEmployees`.
 * @param ctx - Cordis context carrying the Definition service.
 * @param config - SQLite provider configuration.
 * @returns disposer closing the database and removing the provider.
 */
export async function apply(ctx: Context, config: Config): Promise<() => void> {
  const provider = new SqliteDigitalEmployeeProvider(ctx, config)
  await provider.initialize()
  const disposeProvider = ctx.digitalEmployees.configureProvider(provider)
  return () => {
    disposeProvider()
    void provider.close()
  }
}


function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer`)
  return value as number
}
