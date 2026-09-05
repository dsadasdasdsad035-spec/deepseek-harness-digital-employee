/**
 * File-backed digital employee provider.
 * @module @deepseek-ai/dsh-digital-employee-file
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  type ApplyDigitalEmployeeUpgradeRequest,
  assertLifecycleTransition,
  createDigitalEmployeeAuditId,
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeMemoryId,
  type CreateDigitalEmployeeRequest,
  type AppendDigitalEmployeeAuditRequest,
  type DigitalEmployeeAuditRecord,
  type DigitalEmployeeAuthority,
  type DigitalEmployeeCapabilityChanges,
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
  type DigitalEmployeeUpgradePreview,
  type ExportDigitalEmployeeRequest,
  type PortableDigitalEmployeeMemory,
  type PreviewDigitalEmployeeUpgradeRequest,
  type ResolvedDigitalEmployee,
} from '@deepseek-ai/dsh-digital-employee'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Current on-disk digital employee document version. */
export const SCHEMA_VERSION = 1

/** File provider plugin configuration. */
export interface Config {
  /** Explicit document path; defaults under the Harness home. */
  path?: string
  /** Harness home used when `path` is omitted. */
  dshHome?: string
  /** Whether promotion policy may retain candidates marked sensitive. */
  allowSensitiveMemory?: boolean
  /** Maximum requested retention period for one long-term memory. */
  maxRetentionDays?: number
}

/** Schemastery validation for file provider configuration. */
export const Config: z<Config> = z.object({
  path: z.string(),
  dshHome: z.string(),
  allowSensitiveMemory: z.boolean().default(false),
  maxRetentionDays: z.number().step(1).min(1).default(3_650),
})

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
export class FileDigitalEmployeeProvider implements DigitalEmployeeProvider {
  private readonly filename: string
  private readonly allowSensitiveMemory: boolean
  private readonly maxRetentionDays: number
  private document: StoredDocument = emptyDocument()
  private operations: Promise<void> = Promise.resolve()

  constructor(
    private readonly ctx: Context,
    config: Config,
  ) {
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
      const template = this.ctx.digitalEmployees.getTemplate(request.templateId, request.templateVersion)
      if (template === undefined) {
        throw new Error(`digital employee template "${request.templateId}" version "${request.templateVersion}" is not registered`)
      }
      const now = new Date().toISOString()
      const instance: DigitalEmployeeInstance = {
        id: createDigitalEmployeeInstanceId(randomUUID()),
        templateId: request.templateId,
        templateVersion: request.templateVersion,
        displayName: requiredText(request.displayName, 'employee displayName'),
        ...(request.personality === undefined ? {} : { personality: requiredText(request.personality, 'employee personality') }),
        grants: intersectAuthority(template.capabilities, request.grants),
        state: 'inactive',
        createdAt: now,
        updatedAt: now,
      }
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
  async previewUpgrade(request: PreviewDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeUpgradePreview> {
    const instance = await this.requiredInstance(request.employeeId)
    const current = this.requiredTemplate(instance.templateId, instance.templateVersion)
    const target = this.requiredTemplate(instance.templateId, requiredText(request.targetVersion, 'target template version'))
    return {
      employeeId: instance.id,
      currentVersion: current.version,
      targetVersion: target.version,
      addedCapabilities: authorityDifference(target.capabilities, current.capabilities),
      removedCapabilities: authorityDifference(current.capabilities, target.capabilities),
    }
  }

  /** @inheritdoc */
  applyUpgrade(request: ApplyDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeInstance> {
    return this.mutate((document) => {
      const index = requiredInstanceIndex(document, request.employeeId)
      const current = requiredArrayEntry(document.instances, index, 'digital employee')
      const currentTemplate = this.requiredTemplate(current.templateId, current.templateVersion)
      const targetTemplate = this.requiredTemplate(
        current.templateId,
        requiredText(request.targetVersion, 'target template version'),
      )
      const added = authorityDifference(targetTemplate.capabilities, currentTemplate.capabilities)
      assertAuthoritySubset(request.approvedCapabilities, added, 'approved upgrade capabilities')
      const retained = intersectAuthority(targetTemplate.capabilities, current.grants)
      const next: DigitalEmployeeInstance = {
        ...current,
        templateVersion: targetTemplate.version,
        grants: unionAuthority(retained, request.approvedCapabilities),
        updatedAt: new Date().toISOString(),
      }
      document.instances[index] = next
      return copyInstance(next)
    })
  }

  /** @inheritdoc */
  async exportEmployee(request: ExportDigitalEmployeeRequest): Promise<DigitalEmployeeExportArtifact> {
    const instance = await this.requiredInstance(request.employeeId)
    return {
      formatVersion: 1,
      employee: {
        templateId: instance.templateId,
        templateVersion: instance.templateVersion,
        displayName: instance.displayName,
        ...(instance.personality === undefined ? {} : { personality: instance.personality }),
        grants: copyAuthority(instance.grants),
      },
      ...(request.includeMemory
        ? {
          memories: this.document.memories
            .filter(memory => memory.employeeId === instance.id)
            .map(portableMemory),
        }
        : {}),
    }
  }

  /** @inheritdoc */
  importEmployee(artifact: DigitalEmployeeExportArtifact): Promise<DigitalEmployeeInstance> {
    return this.mutate((document) => {
      const portable = parseExportArtifact(artifact)
      const template = this.requiredTemplate(portable.employee.templateId, portable.employee.templateVersion)
      const now = new Date().toISOString()
      const employeeId = createDigitalEmployeeInstanceId(randomUUID())
      const instance: DigitalEmployeeInstance = {
        id: employeeId,
        templateId: template.id,
        templateVersion: template.version,
        displayName: portable.employee.displayName,
        ...(portable.employee.personality === undefined ? {} : { personality: portable.employee.personality }),
        grants: intersectAuthority(template.capabilities, portable.employee.grants),
        state: 'inactive',
        createdAt: now,
        updatedAt: now,
      }
      const importSessionId = SessionId(`digital-employee-import-${randomUUID()}`)
      document.instances.push(instance)
      document.memories.push(...(portable.memories ?? []).map(memory => ({
        ...memory,
        id: createDigitalEmployeeMemoryId(randomUUID()),
        employeeId,
        scope: 'long-term' as const,
        provenance: {
          ...memory.provenance,
          sessionId: importSessionId,
        },
      })))
      return copyInstance(instance)
    })
  }

  /** @inheritdoc */
  async resolve(id: DigitalEmployeeInstanceId): Promise<ResolvedDigitalEmployee> {
    const instance = await this.get(id)
    if (instance === undefined) throw new Error(`digital employee "${id}" does not exist`)
    if (instance.state !== 'active') throw new Error(`digital employee "${id}" is ${instance.state}, not active`)
    const template = this.ctx.digitalEmployees.getTemplate(instance.templateId, instance.templateVersion)
    if (template === undefined) {
      throw new Error(`digital employee "${id}" requires unavailable template "${instance.templateId}" version "${instance.templateVersion}"`)
    }
    const authority = intersectAuthority(template.capabilities, instance.grants)
    const expertIds = new Set(authority.experts)
    return {
      instance,
      template,
      personality: instance.personality ?? template.personality,
      instructions: template.instructions,
      authority,
      mcpServers: (template.mcpServers ?? []).filter(server => authority.mcpServers.includes(server.id)),
      hooks: template.hooks ?? [],
      workflows: template.workflows ?? [],
      subagents: template.subagents ?? [],
      experts: template.experts.filter(expert => expertIds.has(expert.id)),
      delegation: template.delegation,
    }
  }

  /** @inheritdoc */
  queryMemory(query: DigitalEmployeeMemoryQuery): Promise<readonly DigitalEmployeeMemoryRecord[]> {
    const text = query.text.trim().toLocaleLowerCase()
    const now = Date.now()
    return Promise.resolve(this.document.memories
      .filter(memory => memory.employeeId === query.employeeId && query.scopes.includes(memory.scope))
      .filter(memory => memory.expiresAt === undefined || Date.parse(memory.expiresAt) > now)
      .map(memory => ({ memory, score: memoryMatchScore(memory, text) }))
      .filter(match => match.score > 0)
      .sort((left, right) =>
        right.score - left.score
        || right.memory.provenance.recordedAt.localeCompare(left.memory.provenance.recordedAt)
        || left.memory.id.localeCompare(right.memory.id))
      .slice(0, positiveInteger(query.limit, 'memory query limit'))
      .map(match => copyMemory(match.memory)))
  }

  /** @inheritdoc */
  promoteMemory(candidate: DigitalEmployeeMemoryCandidate): Promise<DigitalEmployeeMemoryDecision> {
    return this.mutate((document) => {
      if (!document.instances.some(instance => instance.id === candidate.employeeId)) {
        return { kind: 'rejected', reason: `digital employee "${candidate.employeeId}" does not exist` }
      }
      const content = requiredText(candidate.content, 'memory content').trim()
      const duplicate = document.memories.some(memory =>
        memory.employeeId === candidate.employeeId
        && memory.scope === 'long-term'
        && memory.content.trim().toLocaleLowerCase() === content.toLocaleLowerCase())
      if (duplicate) {
        return { kind: 'rejected', reason: 'duplicate long-term memory content' }
      }
      if (candidate.sensitive && !this.allowSensitiveMemory) {
        return { kind: 'rejected', reason: 'sensitive long-term memory is disabled by policy' }
      }
      if (candidate.retentionDays !== undefined && (
        !Number.isInteger(candidate.retentionDays)
        || candidate.retentionDays <= 0
        || candidate.retentionDays > this.maxRetentionDays
      )) {
        return {
          kind: 'rejected',
          reason: `memory retentionDays must be between 1 and ${this.maxRetentionDays}`,
        }
      }
      const memory: DigitalEmployeeMemoryRecord = {
        id: createDigitalEmployeeMemoryId(randomUUID()),
        employeeId: candidate.employeeId,
        scope: 'long-term',
        content,
        tags: [...candidate.tags],
        sensitive: candidate.sensitive,
        ...(candidate.retentionDays === undefined
          ? {}
          : { expiresAt: new Date(Date.now() + positiveInteger(candidate.retentionDays, 'memory retentionDays') * 86_400_000).toISOString() }),
        provenance: { ...candidate.provenance },
      }
      document.memories.push(memory)
      return { kind: 'accepted', memory: copyMemory(memory) }
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
      assertRedactedAuditMetadata(request.metadata)
      const record: DigitalEmployeeAuditRecord = {
        ...request,
        id: createDigitalEmployeeAuditId(randomUUID()),
        occurredAt: new Date().toISOString(),
        metadata: { ...request.metadata },
      }
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

  private async requiredInstance(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance> {
    const instance = await this.get(id)
    if (instance === undefined) throw new Error(`digital employee "${id}" does not exist`)
    return instance
  }

  private requiredTemplate(templateId: DigitalEmployeeInstance['templateId'], version: string) {
    const template = this.ctx.digitalEmployees.getTemplate(templateId, version)
    if (template === undefined) {
      throw new Error(`digital employee template "${templateId}" version "${version}" is not registered`)
    }
    return template
  }
}

const SECRET_METADATA_KEY = /(?:credential|secret|token|password|api[-_]?key|authorization|cookie)/i

function assertRedactedAuditMetadata(metadata: Readonly<Record<string, string | number | boolean>>): void {
  const key = Object.keys(metadata).find(candidate => SECRET_METADATA_KEY.test(candidate))
  if (key !== undefined) {
    throw new Error(`digital employee audit metadata field "${key}" may contain a credential value`)
  }
}

interface MutableDocument {
  schemaVersion: typeof SCHEMA_VERSION
  instances: DigitalEmployeeInstance[]
  memories: DigitalEmployeeMemoryRecord[]
  audits: DigitalEmployeeAuditRecord[]
}

function memoryMatchScore(memory: DigitalEmployeeMemoryRecord, text: string): number {
  if (text === '') return 1
  const tags = memory.tags.map(tag => tag.toLocaleLowerCase())
  if (tags.includes(text)) return 3
  if (tags.some(tag => tag.includes(text))) return 2
  return memory.content.toLocaleLowerCase().includes(text) ? 1 : 0
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
  const input = record(value, `digital employee file "${filename}"`)
  if (input.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`digital employee file "${filename}" has unsupported schema version ${String(input.schemaVersion)} (expected ${SCHEMA_VERSION})`)
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    instances: array(input.instances, 'stored instances').map(parseInstance),
    memories: array(input.memories, 'stored memories').map(parseMemory),
    audits: array(input.audits, 'stored audits').map(parseAudit),
  }
}

function parseInstance(value: unknown): DigitalEmployeeInstance {
  const input = record(value, 'stored digital employee instance')
  const state = input.state
  if (state !== 'inactive' && state !== 'active' && state !== 'deleting' && state !== 'deleted') {
    throw new Error(`stored digital employee instance has invalid state "${String(state)}"`)
  }
  return {
    id: createDigitalEmployeeInstanceId(requiredText(input.id, 'stored employee id')),
    templateId: createDigitalEmployeeTemplateId(requiredText(input.templateId, 'stored template id')),
    templateVersion: requiredText(input.templateVersion, 'stored template version'),
    displayName: requiredText(input.displayName, 'stored employee displayName'),
    ...(input.personality === undefined ? {} : { personality: requiredText(input.personality, 'stored employee personality') }),
    grants: parseAuthority(input.grants),
    state,
    createdAt: requiredText(input.createdAt, 'stored employee createdAt'),
    updatedAt: requiredText(input.updatedAt, 'stored employee updatedAt'),
  }
}

function parseMemory(value: unknown): DigitalEmployeeMemoryRecord {
  return value as DigitalEmployeeMemoryRecord
}

function parseAudit(value: unknown): DigitalEmployeeAuditRecord {
  return value as DigitalEmployeeAuditRecord
}

function parseAuthority(value: unknown): DigitalEmployeeAuthority {
  const input = record(value, 'stored employee grants')
  return {
    skills: stringArray(input.skills, 'stored skill grants'),
    tools: stringArray(input.tools, 'stored tool grants'),
    mcpServers: stringArray(input.mcpServers, 'stored MCP grants'),
    experts: stringArray(input.experts, 'stored expert grants').map(createExpertId),
    allowSubagents: requiredBoolean(input.allowSubagents, 'stored subagent grant'),
  }
}

function intersectAuthority(
  declared: DigitalEmployeeAuthority,
  granted: DigitalEmployeeAuthority,
): DigitalEmployeeAuthority {
  return {
    skills: intersection(declared.skills, granted.skills),
    tools: intersection(declared.tools, granted.tools),
    mcpServers: intersection(declared.mcpServers, granted.mcpServers),
    experts: intersection(declared.experts, granted.experts),
    allowSubagents: declared.allowSubagents && granted.allowSubagents,
  }
}

function authorityDifference(
  left: DigitalEmployeeAuthority,
  right: DigitalEmployeeAuthority,
): DigitalEmployeeCapabilityChanges {
  return {
    skills: difference(left.skills, right.skills),
    tools: difference(left.tools, right.tools),
    mcpServers: difference(left.mcpServers, right.mcpServers),
    experts: difference(left.experts, right.experts),
    allowSubagents: left.allowSubagents && !right.allowSubagents,
  }
}

function difference<T>(left: readonly T[], right: readonly T[]): T[] {
  const excluded = new Set(right)
  return left.filter(value => !excluded.has(value))
}

function assertAuthoritySubset(
  requested: DigitalEmployeeAuthority,
  allowed: DigitalEmployeeCapabilityChanges,
  label: string,
): void {
  for (const [kind, values, permitted] of [
    ['skills', requested.skills, allowed.skills],
    ['tools', requested.tools, allowed.tools],
    ['MCP servers', requested.mcpServers, allowed.mcpServers],
    ['experts', requested.experts, allowed.experts],
  ] as const) {
    const allowedValues = new Set(permitted)
    const denied = values.find(value => !allowedValues.has(value))
    if (denied !== undefined) throw new Error(`${label} ${kind} contains unavailable "${denied}"`)
  }
  if (requested.allowSubagents && !allowed.allowSubagents) {
    throw new Error(`${label} cannot enable subagents`)
  }
}

function unionAuthority(
  retained: DigitalEmployeeAuthority,
  approved: DigitalEmployeeAuthority,
): DigitalEmployeeAuthority {
  return {
    skills: unique([...retained.skills, ...approved.skills]),
    tools: unique([...retained.tools, ...approved.tools]),
    mcpServers: unique([...retained.mcpServers, ...approved.mcpServers]),
    experts: unique([...retained.experts, ...approved.experts]),
    allowSubagents: retained.allowSubagents || approved.allowSubagents,
  }
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function copyAuthority(authority: DigitalEmployeeAuthority): DigitalEmployeeAuthority {
  return {
    skills: [...authority.skills],
    tools: [...authority.tools],
    mcpServers: [...authority.mcpServers],
    experts: [...authority.experts],
    allowSubagents: authority.allowSubagents,
  }
}

function portableMemory(memory: DigitalEmployeeMemoryRecord): PortableDigitalEmployeeMemory {
  return {
    content: memory.content,
    tags: [...memory.tags],
    sensitive: memory.sensitive,
    ...(memory.expiresAt === undefined ? {} : { expiresAt: memory.expiresAt }),
    provenance: {
      ...(memory.provenance.expertId === undefined ? {} : { expertId: memory.provenance.expertId }),
      source: memory.provenance.source,
      recordedAt: memory.provenance.recordedAt,
    },
  }
}

function parseExportArtifact(value: unknown): DigitalEmployeeExportArtifact {
  const input = record(value, 'digital employee export')
  if (input.formatVersion !== 1) {
    throw new Error(`digital employee export has unsupported format version ${String(input.formatVersion)}`)
  }
  const employee = record(input.employee, 'digital employee export employee')
  const grants = parseAuthority(employee.grants)
  const memories = input.memories === undefined
    ? undefined
    : array(input.memories, 'digital employee export memories').map(parsePortableMemory)
  return {
    formatVersion: 1,
    employee: {
      templateId: createDigitalEmployeeTemplateId(requiredText(employee.templateId, 'export template id')),
      templateVersion: requiredText(employee.templateVersion, 'export template version'),
      displayName: requiredText(employee.displayName, 'export employee displayName'),
      ...(employee.personality === undefined
        ? {}
        : { personality: requiredText(employee.personality, 'export employee personality') }),
      grants,
    },
    ...(memories === undefined ? {} : { memories }),
  }
}

function parsePortableMemory(value: unknown): PortableDigitalEmployeeMemory {
  const input = record(value, 'portable digital employee memory')
  const provenance = record(input.provenance, 'portable digital employee memory provenance')
  return {
    content: requiredText(input.content, 'portable memory content'),
    tags: stringArray(input.tags, 'portable memory tags'),
    sensitive: requiredBoolean(input.sensitive, 'portable memory sensitivity'),
    ...(input.expiresAt === undefined ? {} : { expiresAt: requiredText(input.expiresAt, 'portable memory expiry') }),
    provenance: {
      ...(provenance.expertId === undefined
        ? {}
        : { expertId: createExpertId(requiredText(provenance.expertId, 'portable memory expert id')) }),
      source: requiredText(provenance.source, 'portable memory source'),
      recordedAt: requiredText(provenance.recordedAt, 'portable memory recordedAt'),
    },
  }
}

function intersection<T>(left: readonly T[], right: readonly T[]): T[] {
  const allowed = new Set(right)
  return left.filter(value => allowed.has(value))
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

function copyInstance(instance: DigitalEmployeeInstance): DigitalEmployeeInstance {
  return {
    ...instance,
    grants: {
      ...instance.grants,
      skills: [...instance.grants.skills],
      tools: [...instance.grants.tools],
      mcpServers: [...instance.grants.mcpServers],
      experts: [...instance.grants.experts],
    },
  }
}

function requiredArrayEntry<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index]
  if (value === undefined) throw new Error(`${label} index ${index} is unavailable`)
  return value
}

function copyMemory(memory: DigitalEmployeeMemoryRecord): DigitalEmployeeMemoryRecord {
  return { ...memory, tags: [...memory.tags], provenance: { ...memory.provenance } }
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

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer`)
  return value as number
}

// Imported constructors remain at the owned parsing sites.
import {
  createDigitalEmployeeTemplateId,
  createExpertId,
} from '@deepseek-ai/dsh-digital-employee'
