/**
 * Validation for trusted template contributions and durable lifecycle requests.
 * @module @deepseek-ai/dsh-digital-employee/schema
 */

import { isAbsolute } from 'node:path'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type {
  DigitalEmployeeAuthority,
  DigitalEmployeeDelegationPolicy,
  DigitalEmployeeExpert,
  DigitalEmployeeExpertModelSettings,
  DigitalEmployeeInstructionSource,
  DigitalEmployeeLifecycleState,
  DigitalEmployeeMcpServer,
  DigitalEmployeeTemplate,
} from './types.ts'

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/**
 * Validate and return one digital employee template contribution.
 * @param value - parsed plugin contribution.
 * @returns normalized validated template.
 */
export const DigitalEmployeeTemplateSchema = (value: unknown): DigitalEmployeeTemplate => {
  const template = record(value, 'digital employee template')
  const id = identifier(template.id, 'template id')
  const version = text(template.version, 'template version')
  if (!VERSION.test(version)) throw new Error(`digital employee template "${id}" has invalid version "${version}"`)
  const display = record(template.display, `digital employee template "${id}" display`)
  const experts = array(template.experts, `digital employee template "${id}" experts`)
    .map((expert, index) => validateExpert(expert, id, index))
  const expertIds = new Set<string>()
  for (const expert of experts) {
    if (expertIds.has(expert.id)) {
      throw new Error(`digital employee template "${id}" has duplicate expert "${expert.id}"`)
    }
    expertIds.add(expert.id)
  }
  const capabilities = authority(template.capabilities, `digital employee template "${id}" capabilities`)
  const mcpServers = array(template.mcpServers ?? [], `digital employee template "${id}" mcpServers`)
    .map((server, index) => mcpServer(server, id, index))
  const mcpServerIds = new Set(mcpServers.map(server => server.id))
  if (mcpServerIds.size !== mcpServers.length) {
    throw new Error(`digital employee template "${id}" has duplicate MCP server ids`)
  }
  for (const serverId of capabilities.mcpServers) {
    if (!mcpServerIds.has(serverId)) {
      throw new Error(`digital employee template "${id}" references missing MCP server "${serverId}"`)
    }
  }
  for (const expertId of capabilities.experts) {
    if (!expertIds.has(expertId)) {
      throw new Error(`digital employee template "${id}" references missing expert "${expertId}"`)
    }
  }
  return {
    id: id as DigitalEmployeeTemplate['id'],
    version,
    display: {
      name: text(display.name, `digital employee template "${id}" display name`),
      description: text(display.description, `digital employee template "${id}" display description`),
      ...(display.banner === undefined ? {} : { banner: text(display.banner, `digital employee template "${id}" banner`) }),
    },
    personality: text(template.personality, `digital employee template "${id}" personality`),
    instructions: instruction(template.instructions, `digital employee template "${id}" instructions`),
    preset: identifier(template.preset, `digital employee template "${id}" preset`),
    ...(template.mcpServers === undefined ? {} : { mcpServers }),
    ...(template.hooks === undefined ? {} : { hooks: array(template.hooks, `digital employee template "${id}" hooks`) as readonly string[] }),
    ...(template.workflows === undefined ? {} : { workflows: array(template.workflows, `digital employee template "${id}" workflows`) as readonly string[] }),
    ...(template.subagents === undefined ? {} : { subagents: array(template.subagents, `digital employee template "${id}" subagents`) as readonly string[] }),
    capabilities,
    experts,
    delegation: delegation(template.delegation, `digital employee template "${id}" delegation`),
  }
}

function mcpServer(value: unknown, templateId: string, index: number): DigitalEmployeeMcpServer {
  const label = `digital employee template "${templateId}" MCP server ${index}`
  const input = record(value, label)
  const common = {
    id: identifier(input.id, `${label} id`),
    ...(input.toolCallTimeoutMs === undefined
      ? {}
      : { toolCallTimeoutMs: positiveInteger(input.toolCallTimeoutMs, `${label} toolCallTimeoutMs`) }),
    ...(input.failOnStartupError === undefined
      ? {}
      : { failOnStartupError: boolean(input.failOnStartupError, `${label} failOnStartupError`) }),
  }
  if (input.transport === 'stdio') {
    return {
      ...common,
      transport: 'stdio',
      command: text(input.command, `${label} command`),
      args: stringArray(input.args, `${label} args`),
      env: stringRecord(input.env, `${label} env`),
      envCredentials: credentialRecord(input.envCredentials, `${label} envCredentials`),
      cwd: typeof input.cwd === 'string' ? input.cwd : text(input.cwd, `${label} cwd`),
    }
  }
  if (input.transport === 'streamable-http') {
    const url = text(input.url, `${label} url`)
    try {
      new URL(url)
    } catch {
      throw new Error(`${label} url must be absolute`)
    }
    return {
      ...common,
      transport: 'streamable-http',
      url,
      headers: stringRecord(input.headers, `${label} headers`),
      headerCredentials: credentialRecord(input.headerCredentials, `${label} headerCredentials`),
    }
  }
  throw new Error(`${label} has invalid transport "${String(input.transport)}"`)
}

/**
 * Assert that a persisted employee may move between two lifecycle states.
 * @param from - current committed state.
 * @param to - requested next state.
 */
export function assertLifecycleTransition(
  from: DigitalEmployeeLifecycleState,
  to: DigitalEmployeeLifecycleState,
): void {
  const allowed: Readonly<Record<DigitalEmployeeLifecycleState, readonly DigitalEmployeeLifecycleState[]>> = {
    inactive: ['active', 'deleting'],
    active: ['inactive', 'deleting'],
    deleting: ['deleted'],
    deleted: [],
  }
  if (!allowed[from].includes(to)) {
    throw new Error(`digital employee lifecycle cannot transition from "${from}" to "${to}"`)
  }
}

function validateExpert(value: unknown, templateId: string, index: number): DigitalEmployeeExpert {
  const label = `digital employee template "${templateId}" expert ${index}`
  const expert = record(value, label)
  const memoryAccess = array(expert.memoryAccess, `${label} memoryAccess`).map((scope) => {
    if (scope !== 'task' && scope !== 'session' && scope !== 'long-term') {
      throw new Error(`${label} has invalid memory scope "${String(scope)}"`)
    }
    return scope
  })
  const expertDelegation = record(expert.delegation, `${label} delegation`)
  if (expertDelegation.mode !== 'one-shot' && expertDelegation.mode !== 'continuable') {
    throw new Error(`${label} has invalid delegation mode "${String(expertDelegation.mode)}"`)
  }
  return {
    id: identifier(expert.id, `${label} id`) as DigitalEmployeeExpert['id'],
    name: text(expert.name, `${label} name`),
    responsibility: text(expert.responsibility, `${label} responsibility`),
    instructions: instruction(expert.instructions, `${label} instructions`),
    modelSettings: modelSettings(expert.modelSettings, `${label} modelSettings`),
    capabilities: authority(expert.capabilities, `${label} capabilities`),
    memoryAccess,
    delegation: {
      mode: expertDelegation.mode,
      ...delegation(expertDelegation, `${label} delegation`),
    },
  }
}

function modelSettings(value: unknown, label: string): DigitalEmployeeExpertModelSettings {
  const input = record(value, label)
  return {
    ...(input.provider === undefined ? {} : { provider: text(input.provider, `${label} provider`) }),
    ...(input.model === undefined ? {} : { model: text(input.model, `${label} model`) }),
    ...(input.maxTokens === undefined ? {} : { maxTokens: positiveInteger(input.maxTokens, `${label} maxTokens`) }),
  }
}

function instruction(value: unknown, label: string): DigitalEmployeeInstructionSource {
  const source = record(value, label)
  if (source.kind !== 'file') throw new Error(`${label} kind must be "file"`)
  const root = text(source.root, `${label} root`)
  if (!isAbsolute(root)) throw new Error(`${label} root must be an absolute path`)
  const path = text(source.path, `${label} path`)
  if (isAbsolute(path)) throw new Error(`${label} path must be plugin-relative`)
  return {
    kind: 'file',
    root,
    path,
    revision: text(source.revision, `${label} revision`),
  }
}

function authority(value: unknown, label: string): DigitalEmployeeAuthority {
  const input = record(value, label)
  return {
    skills: identifiers(input.skills, `${label} skills`),
    tools: identifiers(input.tools, `${label} tools`, /^[A-Za-z0-9_-]+$/),
    mcpServers: identifiers(input.mcpServers, `${label} mcpServers`),
    experts: identifiers(input.experts, `${label} experts`)
      .map(id => id as DigitalEmployeeAuthority['experts'][number]),
    allowSubagents: boolean(input.allowSubagents, `${label} allowSubagents`),
  }
}

function delegation(value: unknown, label: string): DigitalEmployeeDelegationPolicy {
  const input = record(value, label)
  return {
    maxDepth: nonnegativeInteger(input.maxDepth, `${label} maxDepth`),
    maxConcurrency: positiveInteger(input.maxConcurrency, `${label} maxConcurrency`),
    timeoutMs: positiveInteger(input.timeoutMs, `${label} timeoutMs`),
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`)
  return value
}

function identifier(value: unknown, label: string, pattern = ID): string {
  const result = text(value, label)
  if (!pattern.test(result)) throw new Error(`${label} "${result}" is invalid`)
  return result
}

function identifiers(value: unknown, label: string, pattern = ID): string[] {
  const result = array(value, label).map(item => identifier(item, label, pattern))
  if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicate identifiers`)
  return result
}

function stringArray(value: unknown, label: string): string[] {
  return array(value, label).map(item => typeof item === 'string' ? item : text(item, label))
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  const input = record(value, label)
  return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, text(item, `${label}.${key}`)]))
}

function credentialRecord(value: unknown, label: string): Record<string, CredentialRef> {
  const refs = stringRecord(value, label)
  for (const [key, ref] of Object.entries(refs)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new Error(`${label}.${key} has invalid credential reference "${ref}"`)
  }
  return refs as Record<string, CredentialRef>
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`)
  return value
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer`)
  return value as number
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer`)
  return value as number
}
