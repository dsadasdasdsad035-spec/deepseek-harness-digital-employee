/**
 * Provider-shared policy for `DigitalEmployeeProvider` implementations: both
 * the file and SQLite providers resolve employees and apply memory policy
 * through these functions, so storage backends stay thin adapters with
 * identical behavior by construction.
 * @module @deepseek-ai/dsh-digital-employee/provider
 */

import { randomUUID } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  createDigitalEmployeeAuditId,
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeMemoryId,
} from './ids.ts'
import { parseExportArtifact } from './domain.ts'
import type { AppendDigitalEmployeeAuditRequest, DigitalEmployeeAuditRecord } from './types.ts'
import {
  assertAuthoritySubset,
  assertRedactedAuditMetadata,
  authorityDifference,
  intersectAuthority,
  memoryMatchScore,
  unionAuthority,
} from './domain.ts'
import type {
  CreateDigitalEmployeeRequest,
  DigitalEmployeeExportArtifact,
  DigitalEmployeeInstance,
  DigitalEmployeeInstanceId,
  DigitalEmployeeMemoryCandidate,
  DigitalEmployeeMemoryDecision,
  DigitalEmployeeMemoryQuery,
  DigitalEmployeeMemoryRecord,
  DigitalEmployeeTemplate,
  DigitalEmployeeUpgradePreview,
  PortableDigitalEmployeeMemory,
  PreviewDigitalEmployeeUpgradeRequest,
  ResolvedDigitalEmployee,
} from './types.ts'

/** Minimal template lookup a provider context must supply. */
export interface EmployeeTemplateSource {
  /**
   * Read one exact registered template version.
   * @param id - template identity.
   * @param version - exact registered version.
   * @returns matching template, or `undefined`.
   */
  getTemplate(id: DigitalEmployeeTemplate['id'], version: string): DigitalEmployeeTemplate | undefined
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`)
  return value
}

/**
 * Require one exact registered template version.
 * @param templates - provider context template lookup.
 * @param templateId - template identity.
 * @param version - exact required version.
 * @returns the registered template.
 * @throws when the exact template version is not registered.
 */
export function requiredEmployeeTemplate(
  templates: EmployeeTemplateSource,
  templateId: DigitalEmployeeTemplate['id'],
  version: string,
): DigitalEmployeeTemplate {
  const template = templates.getTemplate(templateId, version)
  if (template === undefined) {
    throw new Error(`digital employee template "${templateId}" version "${version}" is not registered`)
  }
  return template
}

/**
 * Build one fresh inactive instance from a template ceiling and request.
 * @param template - exact registered template version.
 * @param request - validated instance creation fields.
 * @returns the created instance.
 * @throws when displayName or personality is not a non-empty string.
 */
export function newEmployeeInstance(
  template: DigitalEmployeeTemplate,
  request: CreateDigitalEmployeeRequest,
): DigitalEmployeeInstance {
  const now = new Date().toISOString()
  return {
    id: createDigitalEmployeeInstanceId(randomUUID()),
    templateId: template.id,
    templateVersion: template.version,
    displayName: requiredText(request.displayName, 'employee displayName'),
    ...(request.personality === undefined ? {} : { personality: requiredText(request.personality, 'employee personality') }),
    grants: intersectAuthority(template.capabilities, request.grants),
    state: 'inactive',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Preview one exact template upgrade without touching storage.
 * @param employeeId - employee whose upgrade is previewed.
 * @param currentTemplate - template version the employee currently pins.
 * @param targetTemplate - exact target template version.
 * @returns the immutable upgrade preview.
 */
export function upgradePreview(
  employeeId: DigitalEmployeeInstanceId,
  currentTemplate: DigitalEmployeeTemplate,
  targetTemplate: DigitalEmployeeTemplate,
): DigitalEmployeeUpgradePreview {
  return {
    employeeId,
    currentVersion: currentTemplate.version,
    targetVersion: targetTemplate.version,
    addedCapabilities: authorityDifference(targetTemplate.capabilities, currentTemplate.capabilities),
    removedCapabilities: authorityDifference(currentTemplate.capabilities, targetTemplate.capabilities),
  }
}

/**
 * Apply one approved upgrade to an instance's grants and pinned version.
 * @param instance - current durable instance.
 * @param currentTemplate - template version the employee currently pins.
 * @param targetTemplate - exact target template version.
 * @param approvedCapabilities - explicitly approved new capabilities.
 * @returns the updated instance.
 * @throws when approvals exceed the capabilities the target version adds.
 */
export function applyUpgradeTo(
  instance: DigitalEmployeeInstance,
  currentTemplate: DigitalEmployeeTemplate,
  targetTemplate: DigitalEmployeeTemplate,
  approvedCapabilities: CreateDigitalEmployeeRequest['grants'],
): DigitalEmployeeInstance {
  const added = authorityDifference(targetTemplate.capabilities, currentTemplate.capabilities)
  assertAuthoritySubset(approvedCapabilities, added, 'approved upgrade capabilities')
  const retained = intersectAuthority(targetTemplate.capabilities, instance.grants)
  return {
    ...instance,
    templateVersion: targetTemplate.version,
    grants: unionAuthority(retained, approvedCapabilities),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Resolve one active employee's composition. The exact template version is
 * resolved only after the active-state check, preserving diagnostics order.
 * @param instance - instance to resolve.
 * @param resolveTemplate - exact registered template resolver.
 * @returns the resolved composition.
 * @throws when the instance is not active or the template cannot resolve.
 */
export function resolveEmployee(
  instance: DigitalEmployeeInstance,
  resolveTemplate: () => DigitalEmployeeTemplate,
): ResolvedDigitalEmployee {
  if (instance.state !== 'active') throw new Error(`digital employee "${instance.id}" is ${instance.state}, not active`)
  const template = resolveTemplate()
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

/**
 * Rank employee-owned memories for one bounded query: scope filtering,
 * expiry, tag-then-content scoring, provenance-time and ID tie-breaks.
 * @param memories - the employee's own memories.
 * @param query - bounded memory query.
 * @returns at most `query.limit` matching records.
 * @throws when the requested limit is not a positive integer.
 */
export function rankMemories(
  memories: readonly DigitalEmployeeMemoryRecord[],
  query: DigitalEmployeeMemoryQuery,
): readonly DigitalEmployeeMemoryRecord[] {
  const text = query.text.trim().toLocaleLowerCase()
  const now = Date.now()
  if (!Number.isInteger(query.limit) || query.limit <= 0) {
    throw new Error('memory query limit must be a positive integer')
  }
  return memories
    .filter(memory => query.scopes.includes(memory.scope))
    .filter(memory => memory.expiresAt === undefined || Date.parse(memory.expiresAt) > now)
    .map(memory => ({ memory, score: memoryMatchScore(memory, text) }))
    .filter(match => match.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || right.memory.provenance.recordedAt.localeCompare(left.memory.provenance.recordedAt)
      || left.memory.id.localeCompare(right.memory.id))
    .slice(0, query.limit)
    .map(match => match.memory)
}

/** Promotion policy knobs a provider applies to every candidate. */
export interface MemoryPromotionPolicy {
  /** Whether candidates marked sensitive may be retained. */
  readonly allowSensitiveMemory: boolean
  /** Maximum requested retention period for one long-term memory. */
  readonly maxRetentionDays: number
}

/**
 * Review one candidate against promotion policy; duplicate detection is the
 * caller's storage scan, supplied here as a precomputed fact.
 * @param candidate - candidate under review.
 * @param duplicate - whether normalized long-term content already exists.
 * @param policy - provider promotion policy.
 * @returns the rejection decision, or `undefined` when review passes.
 */
export function memoryPromotionRejection(
  candidate: DigitalEmployeeMemoryCandidate,
  duplicate: boolean,
  policy: MemoryPromotionPolicy,
): Extract<DigitalEmployeeMemoryDecision, { readonly kind: 'rejected' }> | undefined {
  if (candidate.sensitive && !policy.allowSensitiveMemory) {
    return { kind: 'rejected', reason: 'sensitive long-term memory is disabled by policy' }
  }
  if (candidate.retentionDays !== undefined && (
    !Number.isInteger(candidate.retentionDays)
    || candidate.retentionDays <= 0
    || candidate.retentionDays > policy.maxRetentionDays
  )) {
    return {
      kind: 'rejected',
      reason: `memory retentionDays must be between 1 and ${policy.maxRetentionDays}`,
    }
  }
  if (duplicate) {
    return { kind: 'rejected', reason: 'duplicate long-term memory content' }
  }
  return undefined
}

/**
 * Build the accepted long-term record for one reviewed candidate.
 * @param candidate - reviewed candidate.
 * @returns the durable long-term memory record.
 */
export function acceptedLongTermMemory(candidate: DigitalEmployeeMemoryCandidate): DigitalEmployeeMemoryRecord {
  return {
    id: createDigitalEmployeeMemoryId(randomUUID()),
    employeeId: candidate.employeeId,
    scope: 'long-term',
    content: candidate.content,
    tags: [...candidate.tags],
    sensitive: candidate.sensitive,
    ...(candidate.retentionDays === undefined
      ? {}
      : { expiresAt: new Date(Date.now() + candidate.retentionDays * 86_400_000).toISOString() }),
    provenance: { ...candidate.provenance },
  }
}

/**
 * Materialize imported portable memories as fresh long-term records.
 * @param memories - portable memory members.
 * @param employeeId - importing employee.
 * @returns fresh durable records attributed to one import session.
 */
export function importedMemories(
  memories: readonly PortableDigitalEmployeeMemory[],
  employeeId: DigitalEmployeeInstanceId,
): DigitalEmployeeMemoryRecord[] {
  const importSessionId = SessionId(`digital-employee-import-${randomUUID()}`)
  return memories.map(memory => ({
    ...memory,
    id: createDigitalEmployeeMemoryId(randomUUID()),
    employeeId,
    scope: 'long-term' as const,
    provenance: {
      ...memory.provenance,
      sessionId: importSessionId,
    },
  }))
}

/**
 * Assemble one portable export artifact from a detached instance and memories.
 * @param instance - detached instance snapshot.
 * @param memories - portable memory members, or `undefined` to omit memory.
 * @returns the versioned portable artifact.
 */
export function employeeExportArtifact(
  instance: DigitalEmployeeInstance,
  memories: readonly PortableDigitalEmployeeMemory[] | undefined,
): DigitalEmployeeExportArtifact {
  return {
    formatVersion: 1,
    employee: {
      templateId: instance.templateId,
      templateVersion: instance.templateVersion,
      displayName: instance.displayName,
      ...(instance.personality === undefined ? {} : { personality: instance.personality }),
      grants: instance.grants,
    },
    ...(memories === undefined ? {} : { memories }),
  }
}

/**
 * Preview the upgrade named by a caller request against the instance's pinned
 * template version.
 * @param templates - provider context template lookup.
 * @param instance - instance whose upgrade is previewed.
 * @param targetVersion - exact caller-requested target version.
 * @returns the immutable upgrade preview.
 * @throws when either template version is not registered.
 */
export function requestUpgradePreview(
  templates: EmployeeTemplateSource,
  instance: DigitalEmployeeInstance,
  targetVersion: string,
): DigitalEmployeeUpgradePreview {
  const current = requiredEmployeeTemplate(templates, instance.templateId, instance.templateVersion)
  const target = requiredEmployeeTemplate(templates, instance.templateId, targetVersion)
  return upgradePreview(instance.id, current, target)
}

/**
 * Apply the upgrade named by a caller request to one instance's grants.
 * @param templates - provider context template lookup.
 * @param instance - current durable instance.
 * @param targetVersion - exact caller-requested target version.
 * @param approvedCapabilities - explicitly approved new capabilities.
 * @returns the updated instance.
 * @throws when either template version is not registered or approvals exceed additions.
 */
export function requestApplyUpgrade(
  templates: EmployeeTemplateSource,
  instance: DigitalEmployeeInstance,
  targetVersion: string,
  approvedCapabilities: CreateDigitalEmployeeRequest['grants'],
): DigitalEmployeeInstance {
  const current = requiredEmployeeTemplate(templates, instance.templateId, instance.templateVersion)
  const target = requiredEmployeeTemplate(templates, instance.templateId, targetVersion)
  return applyUpgradeTo(instance, current, target, approvedCapabilities)
}

/** A fresh instance and its fresh memory records, ready for provider persistence. */
export interface ImportedEmployee {
  /** Fresh inactive instance. */
  readonly instance: DigitalEmployeeInstance
  /** Fresh long-term records attributed to one import session. */
  readonly memories: DigitalEmployeeMemoryRecord[]
}

/**
 * Validate one portable artifact against registered templates and materialize
 * the fresh inactive instance plus memory records for provider persistence.
 * @param templates - provider context template lookup.
 * @param artifact - caller-supplied portable artifact.
 * @returns the fresh import members.
 * @throws when the artifact is malformed or its template is not registered.
 */
export function importedEmployee(
  templates: EmployeeTemplateSource,
  artifact: DigitalEmployeeExportArtifact,
): ImportedEmployee {
  const portable = parseExportArtifact(artifact)
  const template = requiredEmployeeTemplate(templates, portable.employee.templateId, portable.employee.templateVersion)
  const instance = newEmployeeInstance(template, {
    templateId: template.id,
    templateVersion: template.version,
    displayName: portable.employee.displayName,
    ...portable.employee.personality === undefined ? {} : { personality: portable.employee.personality },
    grants: portable.employee.grants,
  })
  return { instance, memories: importedMemories(portable.memories ?? [], instance.id) }
}

/**
 * Review one promotion candidate against ownership-independent policy:
 * duplicate detection runs over the employee's own long-term records.
 * @param candidate - candidate under review.
 * @param ownedMemories - the employee's own durable memories.
 * @param policy - provider promotion policy.
 * @returns the decision, with the accepted record attached on success.
 */
export function reviewPromotion(
  candidate: DigitalEmployeeMemoryCandidate,
  ownedMemories: readonly DigitalEmployeeMemoryRecord[],
  policy: MemoryPromotionPolicy,
): DigitalEmployeeMemoryDecision {
  const content = requiredText(candidate.content, 'memory content').trim()
  const duplicate = ownedMemories.some(memory =>
    memory.scope === 'long-term'
    && memory.content.trim().toLocaleLowerCase() === content.toLocaleLowerCase())
  const rejection = memoryPromotionRejection(candidate, duplicate, policy)
  if (rejection !== undefined) return rejection
  return { kind: 'accepted', memory: acceptedLongTermMemory({ ...candidate, content }) }
}

/**
 * Validate redaction policy and build one durable audit record with fresh
 * identity and occurrence time.
 * @param request - caller-authored attributable audit fact.
 * @returns the durable audit record.
 * @throws when metadata keys suggest embedded credential values.
 */
export function buildAuditRecord(request: AppendDigitalEmployeeAuditRequest): DigitalEmployeeAuditRecord {
  assertRedactedAuditMetadata(request.metadata)
  return {
    ...request,
    id: createDigitalEmployeeAuditId(randomUUID()),
    occurredAt: new Date().toISOString(),
    metadata: { ...request.metadata },
  }
}

/**
 * Provider base carrying the storage-independent `previewUpgrade`, `resolve`,
 * and instance-requirement behavior. Storage backends extend it and remain
 * thin adapters over their own persistence.
 */
export abstract class DigitalEmployeeProviderBase {
  /** Template lookup backing upgrade previews and employee resolution. */
  protected abstract get templateSource(): EmployeeTemplateSource
  /**
   * Read one durable employee instance.
   * @param id - employee identity.
   * @returns the stored instance, or `undefined`.
   */
  abstract get(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance | undefined>

  /**
   * Preview one exact template upgrade without touching storage.
   * @param request - employee and requested target version.
   * @returns the immutable upgrade preview.
   */
  async previewUpgrade(request: PreviewDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeUpgradePreview> {
    const instance = await this.requiredInstance(request.employeeId)
    return requestUpgradePreview(this.templateSource, instance, request.targetVersion)
  }

  /**
   * Resolve one active employee's composition against its pinned template.
   * @param id - employee identity.
   * @returns the resolved composition.
   */
  async resolve(id: DigitalEmployeeInstanceId): Promise<ResolvedDigitalEmployee> {
    const instance = await this.get(id)
    if (instance === undefined) throw new Error(`digital employee "${id}" does not exist`)
    return resolveEmployee(instance, () => {
      const template = this.templateSource.getTemplate(instance.templateId, instance.templateVersion)
      if (template === undefined) {
        throw new Error(`digital employee "${id}" requires unavailable template "${instance.templateId}" version "${instance.templateVersion}"`)
      }
      return template
    })
  }

  /**
   * Require one existing employee instance.
   * @param id - employee identity.
   * @returns the stored instance.
   * @throws when the instance does not exist.
   */
  protected async requiredInstance(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance> {
    const instance = await this.get(id)
    if (instance === undefined) throw new Error(`digital employee "${id}" does not exist`)
    return instance
  }
}

/** Storage-path and memory-policy configuration shared by every provider. */
export interface EmployeeProviderStorageConfig {
  /** Explicit store path; defaults under the Harness home. */
  path?: string
  /** Harness home used when `path` is omitted. */
  dshHome?: string
  /** Whether promotion policy may retain candidates marked sensitive. */
  allowSensitiveMemory?: boolean
  /** Maximum requested retention period for one long-term memory. */
  maxRetentionDays?: number
}
