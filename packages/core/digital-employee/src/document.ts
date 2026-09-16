/**
 * The durable `employees.json` document format shared by the file provider
 * and by the SQLite provider's one-time legacy import.
 * @module @deepseek-ai/dsh-digital-employee/document
 */

import { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  DigitalEmployeeAuditRecord,
  DigitalEmployeeAuthority,
  DigitalEmployeeInstance,
  DigitalEmployeeLifecycleState,
  DigitalEmployeeMemoryRecord,
} from './types.ts'
import {
  createDigitalEmployeeAuditId,
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeMemoryId,
  createDigitalEmployeeOperationId,
  createDigitalEmployeeTemplateId,
  createExpertId,
} from './ids.ts'

/** Current on-disk digital employee document version. */
export const EMPLOYEES_DOCUMENT_SCHEMA_VERSION = 1

/** One parsed `employees.json` document. */
export interface EmployeeDocument {
  readonly instances: DigitalEmployeeInstance[]
  readonly memories: DigitalEmployeeMemoryRecord[]
  readonly audits: DigitalEmployeeAuditRecord[]
}

/**
 * Validate one parsed `employees.json` value.
 * @param value - parsed JSON value.
 * @param filename - document location used in diagnostics.
 * @returns the validated document members.
 */
export function parseEmployeeDocument(value: unknown, filename: string): EmployeeDocument {
  const input = record(value, `digital employee file "${filename}"`)
  if (input.schemaVersion !== EMPLOYEES_DOCUMENT_SCHEMA_VERSION) {
    throw new Error(
      `digital employee file "${filename}" has unsupported schema version ${String(input.schemaVersion)} (expected ${EMPLOYEES_DOCUMENT_SCHEMA_VERSION})`,
    )
  }
  return {
    instances: array(input.instances, 'stored instances').map(parseStoredInstance),
    memories: array(input.memories, 'stored memories').map(parseStoredMemory),
    audits: array(input.audits, 'stored audits').map(parseAuditRecord),
  }
}

function parseStoredInstance(value: unknown): DigitalEmployeeInstance {
  const input = record(value, 'stored digital employee instance')
  const state = input.state
  if (!isLifecycleState(state)) {
    throw new Error(`stored digital employee instance has invalid state "${String(state)}"`)
  }
  return {
    id: createDigitalEmployeeInstanceId(requiredText(input.id, 'stored employee id')),
    templateId: createDigitalEmployeeTemplateId(requiredText(input.templateId, 'stored template id')),
    templateVersion: requiredText(input.templateVersion, 'stored template version'),
    displayName: requiredText(input.displayName, 'stored employee displayName'),
    ...(input.personality === undefined ? {} : { personality: requiredText(input.personality, 'stored employee personality') }),
    grants: parseStoredAuthority(input.grants),
    state,
    createdAt: requiredText(input.createdAt, 'stored employee createdAt'),
    updatedAt: requiredText(input.updatedAt, 'stored employee updatedAt'),
  }
}

function parseStoredMemory(value: unknown): DigitalEmployeeMemoryRecord {
  const input = record(value, 'stored digital employee memory')
  const scope = input.scope
  if (scope !== 'task' && scope !== 'session' && scope !== 'long-term') {
    throw new Error(`stored digital employee memory has invalid scope "${String(scope)}"`)
  }
  return {
    id: createDigitalEmployeeMemoryId(requiredText(input.id, 'stored memory id')),
    employeeId: createDigitalEmployeeInstanceId(requiredText(input.employeeId, 'stored memory employee id')),
    scope,
    content: requiredText(input.content, 'stored memory content'),
    tags: stringArray(input.tags, 'stored memory tags'),
    sensitive: requiredBoolean(input.sensitive, 'stored memory sensitivity'),
    ...(input.expiresAt === undefined ? {} : { expiresAt: requiredText(input.expiresAt, 'stored memory expiry') }),
    provenance: parseMemoryProvenance(input.provenance),
  }
}

/**
 * Validate one audit-record value as persisted by any provider.
 * @param value - parsed record value.
 * @returns the validated audit record.
 */
export function parseAuditRecord(value: unknown): DigitalEmployeeAuditRecord {
  const input = record(value, 'stored digital employee audit')
  const outcome = input.outcome
  if (outcome !== 'succeeded' && outcome !== 'denied' && outcome !== 'failed') {
    throw new Error(`stored digital employee audit has invalid outcome "${String(outcome)}"`)
  }
  const category = input.category
  if (category !== 'lifecycle' && category !== 'capability' && category !== 'memory' && category !== 'delegation') {
    throw new Error(`stored digital employee audit has invalid category "${String(category)}"`)
  }
  return {
    id: createDigitalEmployeeAuditId(requiredText(input.id, 'stored audit id')),
    employeeId: createDigitalEmployeeInstanceId(requiredText(input.employeeId, 'stored audit employee id')),
    ...(input.sessionId === undefined ? {} : { sessionId: SessionId(requiredText(input.sessionId, 'stored audit session id')) }),
    ...(input.agentId === undefined ? {} : { agentId: SessionId(requiredText(input.agentId, 'stored audit agent id')) }),
    ...(input.expertId === undefined
      ? {}
      : { expertId: createExpertId(requiredText(input.expertId, 'stored audit expert id')) }),
    ...(input.operationId === undefined
      ? {}
      : { operationId: createDigitalEmployeeOperationId(requiredText(input.operationId, 'stored audit operation id')) }),
    category,
    action: requiredText(input.action, 'stored audit action'),
    outcome,
    occurredAt: requiredText(input.occurredAt, 'stored audit occurredAt'),
    metadata: parseAuditMetadata(input.metadata),
  }
}

/**
 * Validate one memory-provenance value as persisted by any provider.
 * @param value - parsed provenance value.
 * @returns the validated provenance.
 */
export function parseMemoryProvenance(value: unknown): DigitalEmployeeMemoryRecord['provenance'] {
  const input = record(value, 'stored memory provenance')
  return {
    ...(input.expertId === undefined
      ? {}
      : { expertId: createExpertId(requiredText(input.expertId, 'stored memory expert id')) }),
    sessionId: SessionId(requiredText(input.sessionId, 'stored memory session id')),
    source: requiredText(input.source, 'stored memory source'),
    recordedAt: requiredText(input.recordedAt, 'stored memory recordedAt'),
  }
}

function parseAuditMetadata(value: unknown): DigitalEmployeeAuditRecord['metadata'] {
  const input = record(value, 'stored audit metadata')
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, metadataValue(key, item)]))
}

function metadataValue(key: string, value: unknown): string | number | boolean {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  throw new Error(`stored audit metadata "${key}" must be a string, number, or boolean`)
}

function isLifecycleState(value: unknown): value is DigitalEmployeeLifecycleState {
  return value === 'inactive' || value === 'active' || value === 'deleting' || value === 'deleted'
}

function parseStoredAuthority(value: unknown): DigitalEmployeeAuthority {
  const input = record(value, 'stored employee grants')
  return {
    skills: stringArray(input.skills, 'stored skill grants'),
    tools: stringArray(input.tools, 'stored tool grants'),
    mcpServers: stringArray(input.mcpServers, 'stored MCP grants'),
    experts: stringArray(input.experts, 'stored expert grants').map(createExpertId),
    allowSubagents: requiredBoolean(input.allowSubagents, 'stored subagent grant'),
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function stringArray(value: unknown, label: string): string[] {
  return array(value, label).map(item => requiredText(item, label))
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`)
  return value
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`)
  return value
}
