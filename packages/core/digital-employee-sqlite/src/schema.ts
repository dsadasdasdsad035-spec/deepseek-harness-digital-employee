/**
 * SQLite schema ownership, connection discipline, and durable-row validation
 * for the digital employee store.
 * @module @deepseek-ai/dsh-digital-employee-sqlite/schema
 */

import { isAbsolute } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import {
  createDigitalEmployeeMemoryId,
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeTemplateId,
  createExpertId,
  type DigitalEmployeeAuditRecord,
  type DigitalEmployeeInstance,
  type DigitalEmployeeLifecycleState,
  type DigitalEmployeeMemoryRecord,
  parseAuditRecord,
  parseMemoryProvenance,
} from '@deepseek-ai/dsh-digital-employee'
import { sql } from './sql.ts'

/** Current physical-record schema; unreleased formats reject older databases. */
export const SCHEMA_VERSION = 1
/** Application id reserved for DeepSeek Harness digital employee databases ('DSHE'). */
export const DIGITAL_EMPLOYEE_SQLITE_APPLICATION_ID = 0x44_53_48_45

/* jscpd:ignore-start -- the open-discipline block deliberately mirrors
 * session-persistence-sqlite/schema.ts; a shared SQLite medium helper is
 * the documented deferral shared by every node:sqlite backend. */
/** Durable journal modes accepted by the backend. */
export type JournalMode = 'wal' | 'delete' | 'truncate' | 'persist'

interface SchemaObjectRow {
  readonly type: string
  readonly name: string
  readonly tbl_name: string
  readonly sql: string
}

const JOURNAL_BUSY_RETRY_INTERVAL_MS = 10
type DatabaseSyncConstructor = typeof import('node:sqlite')['DatabaseSync']

/**
 * Open and validate a digital employee SQLite database.
 * @param Database - lazily imported Node SQLite constructor.
 * @param path - SQLite path, including `:memory:`.
 * @param journalMode - validated journal pragma.
 * @param busyTimeoutMs - validated maximum wait for a competing SQLite lock.
 * @returns the configured database handle.
 * @throws when connection settings, schema ownership, or SQLite setup cannot be validated.
 */
export async function openDatabase(
  Database: DatabaseSyncConstructor,
  path: string,
  journalMode: JournalMode,
  busyTimeoutMs: number,
): Promise<DatabaseSync> {
  const deadline = performance.now() + busyTimeoutMs
  const db = new Database(path, { timeout: busyTimeoutMs })
  try {
    configureConnectionSecurity(db, path)
    configureDatabase(Database, db, path)
    await selectJournalMode(db, path, journalMode, deadline)
    configureDurability(db, path)
    return db
  } catch (error: unknown) {
    db.close()
    throw error
  }
}

function configureConnectionSecurity(db: DatabaseSync, path: string): void {
  db.exec(sql('trusted-schema-off'))
  const trustedSchema = integerField(db.prepare(sql('select-trusted-schema')).get(), 'trusted_schema')
  /* v8 ignore next 3 -- supported SQLite versions return the fixed setting. */
  if (trustedSchema !== 0) {
    throw new Error(`digital employee database at "${path}" retained trusted_schema=${trustedSchema}, expected 0`)
  }
  db.exec(sql('mmap-off'))
  if (path === ':memory:') return
  const mmapSize = integerField(db.prepare(sql('select-mmap-size')).get(), 'mmap_size')
  /* v8 ignore next 3 -- supported file-backed SQLite connections return the fixed setting. */
  if (mmapSize !== 0) {
    throw new Error(`digital employee database at "${path}" retained mmap_size=${mmapSize}, expected 0`)
  }
}

function configureDatabase(
  Database: DatabaseSyncConstructor,
  db: DatabaseSync,
  path: string,
): void {
  db.exec(sql('foreign-keys-on'))
  let began = false
  try {
    db.exec(sql('begin-immediate'))
    began = true
    const onDisk = integerField(db.prepare(sql('select-user-version')).get(), 'user_version')
    const applicationId = integerField(db.prepare(sql('select-application-id')).get(), 'application_id')
    const userObjectCount = integerField(db.prepare(sql('select-user-object-count')).get(), 'count')
    if (onDisk === 0 && (applicationId !== 0 || userObjectCount > 0)) {
      throw new Error(`digital employee database at "${path}" has an unversioned schema or application identity`)
    }
    if (onDisk !== 0 && onDisk !== SCHEMA_VERSION) {
      throw new Error(
        `digital employee database at "${path}" has schema version ${onDisk}, incompatible with this build (${SCHEMA_VERSION})`,
      )
    }
    if (onDisk !== 0 && applicationId !== DIGITAL_EMPLOYEE_SQLITE_APPLICATION_ID) {
      throw new Error(
        `digital employee database at "${path}" has application id ${applicationId}, expected ${DIGITAL_EMPLOYEE_SQLITE_APPLICATION_ID}`,
      )
    }
    if (onDisk === 0) initializeDatabase(db)
    validateRequiredSchema(Database, db, path)
    db.exec(sql('commit'))
    began = false
  } catch (error: unknown) {
    /* v8 ignore else -- a failed begin leaves no transaction to roll back. */
    if (began) {
      /* v8 ignore next 5 -- retain the original ownership failure if rollback fails too. */
      try {
        db.exec(sql('rollback'))
      } catch {
        // The original database-ownership failure remains actionable.
      }
    }
    throw error
  }
}

async function selectJournalMode(
  db: DatabaseSync,
  path: string,
  journalMode: JournalMode,
  deadline: number,
): Promise<void> {
  let result: unknown
  while (true) {
    try {
      result = db.prepare(sql(journalResource(journalMode))).get()
      break
    } catch (error: unknown) {
      const remainingMs = Math.max(0, Math.ceil(deadline - performance.now()))
      if (!isSqliteBusy(error) || remainingMs === 0) throw error
      await delay(Math.min(JOURNAL_BUSY_RETRY_INTERVAL_MS, remainingMs))
      if (performance.now() >= deadline) throw error
    }
  }
  const selected = stringField(result, 'journal_mode').toLowerCase()
  const expected = path === ':memory:' ? 'memory' : journalMode
  /* v8 ignore next 3 -- SQLite returns the selected mode from these fixed, valid pragmas. */
  if (selected !== expected) {
    throw new Error(`digital employee database at "${path}" selected journal mode ${selected}, expected ${expected}`)
  }
}

function configureDurability(db: DatabaseSync, path: string): void {
  db.exec(sql('synchronous-full'))
  const synchronous = integerField(db.prepare(sql('select-synchronous')).get(), 'synchronous')
  /* v8 ignore next 3 -- supported SQLite versions return the fixed setting. */
  if (synchronous !== 2) {
    throw new Error(`digital employee database at "${path}" retained synchronous=${synchronous}, expected FULL (2)`)
  }
}

function isSqliteBusy(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && Reflect.get(error, 'errcode') === 5
}

function journalResource(mode: JournalMode):
  | 'journal-mode-wal'
  | 'journal-mode-delete'
  | 'journal-mode-truncate'
  | 'journal-mode-persist' {
  switch (mode) {
    case 'wal': return 'journal-mode-wal'
    case 'delete': return 'journal-mode-delete'
    case 'truncate': return 'journal-mode-truncate'
    case 'persist': return 'journal-mode-persist'
  }
}

function initializeDatabase(db: DatabaseSync): void {
  db.exec(sql('schema'))
  db.exec(sql('set-application-id'))
  db.exec(sql('set-user-version-1'))
}

let canonicalSchema: readonly SchemaObjectRow[] | undefined

function expectedSchema(Database: DatabaseSyncConstructor): readonly SchemaObjectRow[] {
  if (canonicalSchema !== undefined) return canonicalSchema
  const reference = new Database(':memory:')
  try {
    reference.exec(sql('foreign-keys-on'))
    reference.exec(sql('schema'))
    canonicalSchema = schemaObjects(reference)
    return canonicalSchema
  } finally {
    reference.close()
  }
}

function schemaObjects(db: DatabaseSync): SchemaObjectRow[] {
  return db.prepare(sql('select-schema-objects')).all().map((value) => {
    const row = recordValue(value, 'schema object')
    return {
      type: stringField(row, 'type'),
      name: stringField(row, 'name'),
      tbl_name: stringField(row, 'tbl_name'),
      sql: normalizeSql(stringField(row, 'sql')),
    }
  })
}

function normalizeSql(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim()
}

function validateRequiredSchema(
  Database: DatabaseSyncConstructor,
  db: DatabaseSync,
  path: string,
): void {
  if (JSON.stringify(schemaObjects(db)) !== JSON.stringify(expectedSchema(Database))) {
    throw new Error(`digital employee database at "${path}" does not contain the required schema objects`)
  }
}

/**
 * Recheck schema ownership inside the caller's mutation transaction.
 * @param Database - constructor used to validate the canonical schema.
 * @param db - open owned database with an active immediate transaction.
 * @param path - database location used in ownership diagnostics.
 * @throws when another writer changed the application identity, schema, or version.
 */
export function validateSchemaForMutation(
  Database: DatabaseSyncConstructor,
  db: DatabaseSync,
  path: string,
): void {
  const version = integerField(db.prepare(sql('select-user-version')).get(), 'user_version')
  const applicationId = integerField(db.prepare(sql('select-application-id')).get(), 'application_id')
  if (applicationId !== DIGITAL_EMPLOYEE_SQLITE_APPLICATION_ID) {
    throw new Error(
      `digital employee database application id changed before mutation (expected ${DIGITAL_EMPLOYEE_SQLITE_APPLICATION_ID}, got ${applicationId})`,
    )
  }
  validateRequiredSchema(Database, db, path)
  if (version !== SCHEMA_VERSION) {
    throw new Error(`digital employee database schema changed before mutation (expected ${SCHEMA_VERSION}, got ${version})`)
  }
}

/** One durable instance row with its grants encoded as JSON. */
export interface InstanceRow extends Record<string, unknown> {
  readonly id: string
  readonly template_id: string
  readonly template_version: string
  readonly display_name: string
  readonly personality: string | null
  readonly grants: string
  readonly state: string
  readonly created_at: string
  readonly updated_at: string
}

/** One durable memory row with tags and provenance encoded as JSON. */
export interface MemoryRow extends Record<string, unknown> {
  readonly id: string
  readonly employee_id: string
  readonly scope: string
  readonly content: string
  readonly tags: string
  readonly sensitive: number
  readonly expires_at: string | null
  readonly provenance: string
}

/** One durable audit row; the validated record travels as one JSON payload. */
export interface AuditRow extends Record<string, unknown> {
  readonly id: string
  readonly employee_id: string
  readonly payload: string
}

/* jscpd:ignore-end */

const LIFECYCLE_STATES = ['inactive', 'active', 'deleting', 'deleted'] as const
const MEMORY_SCOPES = ['task', 'session', 'long-term'] as const

/**
 * Decode and validate one durable instance row.
 * @param value - value returned by SQLite.
 * @returns the validated instance.
 */
export function decodeInstanceRow(value: unknown): DigitalEmployeeInstance {
  const row = rowObject(value, 'stored digital employee instance') as InstanceRow
  const state = row.state
  if (!isLifecycleState(state)) {
    throw new Error(`stored digital employee instance has invalid state "${state}"`)
  }
  return {
    id: createDigitalEmployeeInstanceId(nonemptyStringField(row, 'id')),
    templateId: createDigitalEmployeeTemplateId(nonemptyStringField(row, 'template_id')),
    templateVersion: nonemptyStringField(row, 'template_version'),
    displayName: nonemptyStringField(row, 'display_name'),
    ...(row.personality === null ? {} : { personality: row.personality }),
    grants: parseGrants(row.grants),
    state,
    createdAt: nonemptyStringField(row, 'created_at'),
    updatedAt: nonemptyStringField(row, 'updated_at'),
  }
}

/**
 * Decode and validate one durable memory row.
 * @param value - value returned by SQLite.
 * @returns the validated memory record.
 */
export function decodeMemoryRow(value: unknown): DigitalEmployeeMemoryRecord {
  const row = rowObject(value, 'stored digital employee memory') as MemoryRow
  if (!isMemoryScope(row.scope)) {
    throw new Error(`stored digital employee memory has invalid scope "${row.scope}"`)
  }
  if (row.sensitive !== 0 && row.sensitive !== 1) {
    throw new Error('stored memory sensitive must be 0 or 1')
  }
  return {
    id: createDigitalEmployeeMemoryId(nonemptyStringField(row, 'id')),
    employeeId: createDigitalEmployeeInstanceId(nonemptyStringField(row, 'employee_id')),
    scope: row.scope,
    content: nonemptyStringField(row, 'content'),
    tags: parseStringArray(safeJsonParse(row.tags, 'stored memory tags'), 'stored memory tags'),
    sensitive: row.sensitive === 1,
    ...(row.expires_at === null ? {} : { expiresAt: row.expires_at }),
    provenance: parseMemoryProvenance(safeJsonParse(row.provenance, 'stored memory provenance')),
  }
}

/**
 * Decode and validate one durable audit row payload.
 * @param value - value returned by SQLite.
 * @returns the validated audit record.
 */
export function decodeAuditRow(value: unknown): DigitalEmployeeAuditRecord {
  const row = rowObject(value, 'stored digital employee audit') as AuditRow
  return parseAuditRecord(safeJsonParse(row.payload, 'stored audit record'))
}

function parseGrants(value: string): DigitalEmployeeInstance['grants'] {
  const input = recordValue(safeJsonParse(value, 'stored employee grants'), 'stored employee grants')
  return {
    skills: parseStringArray(input.skills, 'stored skill grants'),
    tools: parseStringArray(input.tools, 'stored tool grants'),
    mcpServers: parseStringArray(input.mcpServers, 'stored MCP grants'),
    experts: parseStringArray(input.experts, 'stored expert grants').map(createExpertId),
    allowSubagents: booleanField(input, 'allowSubagents'),
  }
}


function safeJsonParse(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (error: unknown) {
    throw new Error(`${label} cannot parse as JSON`, { cause: error })
  }
}

function parseStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((item) => {
    if (typeof item !== 'string' || item.trim() === '') throw new Error(`${label} entries must be non-empty strings`)
    return item
  })
}

function isLifecycleState(value: string): value is DigitalEmployeeLifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(value)
}

function isMemoryScope(value: string): value is DigitalEmployeeMemoryRecord['scope'] {
  return (MEMORY_SCOPES as readonly string[]).includes(value)
}

function rowObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function nonemptyStringField(row: Record<string, unknown>, key: string): string {
  const field = row[key]
  if (typeof field !== 'string' || field === '') throw new Error(`stored ${key} must be a non-empty string`)
  return field
}

function booleanField(row: Record<string, unknown>, key: string): boolean {
  const field = row[key]
  if (typeof field !== 'boolean') throw new Error(`stored ${key} must be a boolean`)
  return field
}

function stringField(value: unknown, key: string): string {
  const field = recordValue(value, 'SQLite row')[key]
  if (typeof field !== 'string') throw new Error(`stored ${key} must be a string`)
  return field
}

function integerField(value: unknown, key: string): number {
  const field = recordValue(value, 'SQLite row')[key]
  if (!Number.isSafeInteger(field)) throw new Error(`stored ${key} must be a safe integer`)
  return field as number
}

/**
 * Validate that one absolute database path is owner-usable before opening.
 * Memory databases skip filesystem validation.
 * @param path - resolved database path or `:memory:`.
 */
export function assertDatabasePath(path: string): void {
  if (path === ':memory:') return
  if (!isAbsolute(path)) throw new Error(`digital employee database path "${path}" must be absolute`)
}
