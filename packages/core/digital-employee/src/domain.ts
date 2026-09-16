/**
 * Provider-shared digital employee domain algebra: authority arithmetic,
 * memory ranking, portable-artifact conversion, and audit redaction. Both the
 * file and SQLite providers implement `DigitalEmployeeProvider` through these
 * functions, so backend behavior stays identical by construction.
 * @module @deepseek-ai/dsh-digital-employee/domain
 */

import type {
  DigitalEmployeeAuthority,
  DigitalEmployeeCapabilityChanges,
  DigitalEmployeeExportArtifact,
  DigitalEmployeeInstance,
  DigitalEmployeeMemoryRecord,
  PortableDigitalEmployeeMemory,
} from './types.ts'
import { createDigitalEmployeeTemplateId, createExpertId } from './ids.ts'

/**
 * Score one memory against a lower-cased query: exact tag 3, contained tag 2,
 * contained content 1, and an empty query matches everything.
 * @param memory - memory record to score.
 * @param text - lower-cased trimmed query text.
 * @returns positive match score, or 0 for no match.
 */
export function memoryMatchScore(memory: DigitalEmployeeMemoryRecord, text: string): number {
  if (text === '') return 1
  const tags = memory.tags.map(tag => tag.toLocaleLowerCase())
  if (tags.includes(text)) return 3
  if (tags.some(tag => tag.includes(text))) return 2
  return memory.content.toLocaleLowerCase().includes(text) ? 1 : 0
}

/**
 * Intersect declared template capabilities with instance grants.
 * @param declared - template-declared authority ceiling.
 * @param granted - instance-approved authority.
 * @returns the effective authority.
 */
export function intersectAuthority(
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

/**
 * Compute one side of an upgrade diff against the other.
 * @param left - authority of the source version.
 * @param right - authority of the target version.
 * @returns capabilities present only in `left`.
 */
export function authorityDifference(
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

/**
 * Assert that requested upgrade approvals never exceed the declared additions.
 * @param requested - caller-approved new capabilities.
 * @param allowed - capabilities the target version actually adds.
 * @param label - diagnostic label for the approved set.
 */
export function assertAuthoritySubset(
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

/**
 * Union retained grants with approved upgrade additions.
 * @param retained - grants surviving the target version's ceiling.
 * @param approved - explicitly approved new capabilities.
 * @returns the upgraded grants.
 */
export function unionAuthority(
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

/**
 * Copy one authority so callers cannot mutate provider state.
 * @param authority - authority to detach.
 * @returns a detached copy.
 */
export function copyAuthority(authority: DigitalEmployeeAuthority): DigitalEmployeeAuthority {
  return {
    skills: [...authority.skills],
    tools: [...authority.tools],
    mcpServers: [...authority.mcpServers],
    experts: [...authority.experts],
    allowSubagents: authority.allowSubagents,
  }
}

/**
 * Copy one instance including its authority lists.
 * @param instance - instance to detach.
 * @returns a detached copy.
 */
export function copyInstance(instance: DigitalEmployeeInstance): DigitalEmployeeInstance {
  return {
    ...instance,
    grants: copyAuthority(instance.grants),
  }
}

/**
 * Copy one memory record including tags and provenance.
 * @param memory - memory to detach.
 * @returns a detached copy.
 */
export function copyMemory(memory: DigitalEmployeeMemoryRecord): DigitalEmployeeMemoryRecord {
  return { ...memory, tags: [...memory.tags], provenance: { ...memory.provenance } }
}

/**
 * Strip employee, memory, and session identities from one memory record.
 * @param memory - durable memory to port.
 * @returns the portable memory artifact member.
 */
export function portableMemory(memory: DigitalEmployeeMemoryRecord): PortableDigitalEmployeeMemory {
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

/**
 * Validate one untrusted portable employee artifact.
 * @param value - parsed artifact value.
 * @returns the validated artifact.
 */
export function parseExportArtifact(value: unknown): DigitalEmployeeExportArtifact {
  const input = record(value, 'digital employee export')
  if (input.formatVersion !== 1) {
    throw new Error(`digital employee export has unsupported format version ${String(input.formatVersion)}`)
  }
  const employee = record(input.employee, 'digital employee export employee')
  const grants = parseAuthorityValue(employee.grants)
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

/** Metadata keys whose names suggest credential values. */
const SECRET_METADATA_KEY = /(?:credential|secret|token|password|api[-_]?key|authorization|cookie)/i

/**
 * Reject audit metadata whose keys suggest embedded credential values.
 * @param metadata - caller-authored audit metadata.
 */
export function assertRedactedAuditMetadata(metadata: Readonly<Record<string, string | number | boolean>>): void {
  const key = Object.keys(metadata).find(candidate => SECRET_METADATA_KEY.test(candidate))
  if (key !== undefined) {
    throw new Error(`digital employee audit metadata field "${key}" may contain a credential value`)
  }
}

function parseAuthorityValue(value: unknown): DigitalEmployeeAuthority {
  const input = record(value, 'stored employee grants')
  return {
    skills: stringArray(input.skills, 'stored skill grants'),
    tools: stringArray(input.tools, 'stored tool grants'),
    mcpServers: stringArray(input.mcpServers, 'stored MCP grants'),
    experts: stringArray(input.experts, 'stored expert grants').map(createExpertId),
    allowSubagents: requiredBoolean(input.allowSubagents, 'stored subagent grant'),
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

function difference<T>(left: readonly T[], right: readonly T[]): T[] {
  const excluded = new Set(right)
  return left.filter(value => !excluded.has(value))
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
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
