/** Durable local storage for configuration-studio template drafts. */

import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type {
  CreateDigitalEmployeeTemplateDraftRequest,
  DigitalEmployeeConfigurationDiagnostic,
  DigitalEmployeeTemplateDraft,
  DigitalEmployeeTemplateDraftValidation,
  DigitalEmployeeTemplatePublication,
  UpdateDigitalEmployeeTemplateDraftRequest,
} from './types.ts'

const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const EMPTY_AUTHORITY = {
  skills: [],
  tools: [],
  mcpServers: [],
  experts: [],
  allowSubagents: false,
}

const DEFAULT_DELEGATION = {
  maxDepth: 0,
  maxConcurrency: 1,
  timeoutMs: 30_000,
}

interface StoredConfigurationStudio {
  readonly format: 1
  readonly drafts: readonly DigitalEmployeeTemplateDraft[]
  readonly publications: readonly StoredPublication[]
}

interface StoredPublication extends DigitalEmployeeTemplatePublication {
  readonly draft: DigitalEmployeeTemplateDraft
}

interface Mutation<T> {
  readonly document: StoredConfigurationStudio
  readonly value: T
  readonly rollback?: () => Promise<void> | void
}

/** Persist local administrator drafts with atomic read-modify-write operations. */
export class ConfigurationStudioStore {
  private document: StoredConfigurationStudio = { format: 1, drafts: [], publications: [] }
  private readonly ready: Promise<void>

  /**
   * @param filename - private user-owned JSON document.
   * @param persist - atomic persistence implementation, overridable for failure-path tests.
   */
  constructor(
    private readonly filename: string,
    private readonly persist: typeof writeFileAtomic = writeFileAtomic,
  ) {
    this.ready = this.load()
  }

  /** List detached drafts ordered by creation time.
   * @returns detached drafts ordered by creation time.
   */
  async list(): Promise<readonly DigitalEmployeeTemplateDraft[]> {
    await this.ready
    return this.document.drafts.map(copyDraft)
  }

  /** Read one detached draft snapshot.
   * @param id - required draft identity.
   * @returns detached draft snapshot.
   */
  async get(id: DigitalEmployeeTemplateDraft['id']): Promise<DigitalEmployeeTemplateDraft> {
    await this.ready
    const draft = this.document.drafts.find(candidate => candidate.id === id)
    if (draft === undefined) throw new Error(`digital employee configuration draft "${id}" is unavailable`)
    return copyDraft(draft)
  }

  /** List immutable local publication provenance ordered by allocation time.
   * @returns immutable local publication provenance ordered by allocation time.
   */
  async listPublications(): Promise<readonly StoredPublication[]> {
    await this.ready
    return this.document.publications.map(publication => ({ ...publication, draft: copyDraft(publication.draft) }))
  }

  /** Create and durably persist one administrator draft.
   * @param request - initial administrator-supplied draft content.
   * @param id - caller-created opaque draft identity.
   * @returns committed detached draft.
   */
  async create(
    request: CreateDigitalEmployeeTemplateDraftRequest,
    id: DigitalEmployeeTemplateDraft['id'],
  ): Promise<DigitalEmployeeTemplateDraft> {
    await this.ready
    return await this.mutate((document) => {
      const now = new Date().toISOString()
      const draft: DigitalEmployeeTemplateDraft = {
        id,
        templateId: requiredText(request.templateId, 'templateId'),
        display: {
          name: requiredText(request.display.name, 'display name'),
          description: requiredText(request.display.description, 'display description'),
          ...(request.display.banner === undefined ? {} : { banner: requiredText(request.display.banner, 'display banner') }),
        },
        instructions: requiredText(request.instructions, 'instructions'),
        personality: request.personality?.trim() || 'Helpful, careful, and concise.',
        preset: request.preset?.trim() || 'headless',
        capabilities: request.capabilities ?? EMPTY_AUTHORITY,
        mcpServers: request.mcpServers ?? [],
        hooks: request.hooks ?? [],
        workflows: request.workflows ?? [],
        subagents: request.subagents ?? [],
        experts: request.experts ?? [],
        memorySeeds: request.memorySeeds ?? [],
        delegation: request.delegation ?? DEFAULT_DELEGATION,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }
      return { document: { ...document, drafts: [...document.drafts, draft] }, value: copyDraft(draft) }
    })
  }

  /**
   * Update one draft only when the caller still owns its current revision.
   * @param request - draft identity, observed revision, and patch fields.
   * @returns committed detached draft.
   */
  async update(request: UpdateDigitalEmployeeTemplateDraftRequest): Promise<DigitalEmployeeTemplateDraft> {
    await this.ready
    return await this.mutate((document) => {
      const index = document.drafts.findIndex(draft => draft.id === request.draftId)
      if (index < 0) throw new Error(`digital employee configuration draft "${request.draftId}" is unavailable`)
      const current = document.drafts[index]
      if (current === undefined) throw new Error('digital employee configuration draft index is invalid')
      if (current.revision !== request.revision) throw new Error('digital employee configuration draft revision conflict')
      const now = new Date().toISOString()
      const next: DigitalEmployeeTemplateDraft = {
        ...current,
        ...request.patch,
        ...(request.patch.display === undefined ? {} : { display: {
          name: requiredText(request.patch.display.name, 'display name'),
          description: requiredText(request.patch.display.description, 'display description'),
          ...(request.patch.display.banner === undefined ? {} : { banner: requiredText(request.patch.display.banner, 'display banner') }),
        } }),
        revision: current.revision + 1,
        updatedAt: now,
      }
      const drafts = [...document.drafts]
      drafts[index] = next
      return { document: { ...document, drafts }, value: copyDraft(next) }
    })
  }

  /**
   * Remove one unpublished draft.
   * @param id - draft identity to remove.
   */
  async delete(id: DigitalEmployeeTemplateDraft['id']): Promise<void> {
    await this.ready
    await this.mutate((document) => {
      if (!document.drafts.some(draft => draft.id === id)) {
        throw new Error(`digital employee configuration draft "${id}" is unavailable`)
      }
      return { document: { ...document, drafts: document.drafts.filter(draft => draft.id !== id) }, value: undefined }
    })
  }

  /**
   * Atomically reserve the next immutable local version for one current draft.
   * @param id - draft identity to publish.
   * @param revision - current draft revision required for publication.
   * @param prepare - materializes and registers the immutable runtime version, returning its rollback.
   * @returns stored publication provenance.
   */
  async publish(
    id: DigitalEmployeeTemplateDraft['id'],
    revision: number,
    prepare: (
      draft: DigitalEmployeeTemplateDraft,
      publication: StoredPublication,
    ) => Promise<() => Promise<void> | void>,
  ): Promise<StoredPublication> {
    await this.ready
    return await this.mutate(async (document) => {
      const draft = document.drafts.find(candidate => candidate.id === id)
      if (draft === undefined) throw new Error(`digital employee configuration draft "${id}" is unavailable`)
      if (draft.revision !== revision) throw new Error('digital employee configuration draft revision conflict')
      const version = `0.1.${document.publications.filter(item => item.templateId === draft.templateId).length + 1}`
      const publication: StoredPublication = {
        templateId: draft.templateId, version, draftId: draft.id, draftRevision: draft.revision,
        publishedAt: new Date().toISOString(), draft: copyDraft(draft),
      }
      const rollback = await prepare(copyDraft(draft), publication)
      return {
        document: { ...document, publications: [...document.publications, publication] },
        value: publication,
        rollback,
      }
    })
  }

  private async load(): Promise<void> {
    try {
      this.document = parseDocument(await readFile(this.filename, 'utf8'))
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  private async mutate<T>(
    operation: (
      document: StoredConfigurationStudio,
    ) => Mutation<T> | Promise<Mutation<T>>,
  ): Promise<T> {
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 })
    return await withFileLock(this.filename, async () => {
      await this.load()
      const next = await operation(this.document)
      try {
        await this.persist(this.filename, `${JSON.stringify(next.document)}\n`, { mode: 0o600, dirMode: 0o700 })
      } catch (error: unknown) {
        try {
          await next.rollback?.()
        } catch (rollbackError: unknown) {
          throw new AggregateError([error, rollbackError], 'configuration studio persistence and rollback failed')
        }
        throw error
      }
      this.document = next.document
      return next.value
    })
  }
}

/**
 * Validate a draft without resolving deployment-owned capabilities.
 * @param draft - persisted administrator draft.
 * @returns revision-bound diagnostics suitable for the remote client.
 */
export function validateDraftBasics(
  draft: DigitalEmployeeTemplateDraft,
): DigitalEmployeeTemplateDraftValidation {
  const diagnostics: DigitalEmployeeConfigurationDiagnostic[] = []
  if (!IDENTIFIER.test(draft.templateId)) {
    diagnostics.push({
      code: 'template-id',
      path: 'templateId',
      message: 'Template ID must use lowercase letters, digits, and single hyphens.',
    })
  }
  for (const [path, value] of [
    ['display.name', draft.display.name],
    ['display.description', draft.display.description],
    ['instructions', draft.instructions],
    ['personality', draft.personality],
    ['preset', draft.preset],
  ] as const) {
    if (value.trim() === '') {
      diagnostics.push({ code: 'required', path, message: 'This field must not be empty.' })
    }
  }
  const mcpIds = new Set<string>()
  for (const server of draft.mcpServers) {
    if (mcpIds.has(server.id)) {
      diagnostics.push({
        code: 'mcp-server-id',
        path: 'mcpServers',
        message: `MCP server "${server.id}" is declared more than once.`,
      })
    }
    mcpIds.add(server.id)
  }
  for (const serverId of draft.capabilities.mcpServers) {
    if (!mcpIds.has(serverId)) {
      diagnostics.push({
        code: 'mcp-server-reference',
        path: 'capabilities.mcpServers',
        message: `Root authority references undeclared MCP server "${serverId}".`,
      })
    }
  }
  const expertIds = new Set<string>()
  for (const expert of draft.experts) {
    if (expertIds.has(expert.id)) {
      diagnostics.push({
        code: 'expert-id',
        path: 'experts',
        message: `Expert "${expert.id}" is declared more than once.`,
      })
    }
    expertIds.add(expert.id)
    for (const [kind, child, parent] of [
      ['skill', expert.capabilities.skills, draft.capabilities.skills],
      ['tool', expert.capabilities.tools, draft.capabilities.tools],
      ['MCP server', expert.capabilities.mcpServers, draft.capabilities.mcpServers],
      ['expert', expert.capabilities.experts, draft.capabilities.experts],
    ] as const) {
      for (const value of child) {
        if (!parent.includes(value as never)) {
          diagnostics.push({
            code: 'authority-escalation',
            path: `experts.${expert.id}.capabilities`,
            message: `Expert "${expert.id}" requests ${kind} "${value}" outside the root authority.`,
          })
        }
      }
    }
    if (expert.delegation.maxDepth > draft.delegation.maxDepth
      || expert.delegation.maxConcurrency > draft.delegation.maxConcurrency
      || expert.delegation.timeoutMs > draft.delegation.timeoutMs) {
      diagnostics.push({
        code: 'delegation-escalation',
        path: `experts.${expert.id}.delegation`,
        message: `Expert "${expert.id}" exceeds the root delegation limits.`,
      })
    }
  }
  for (const expertId of draft.capabilities.experts) {
    if (!expertIds.has(expertId)) {
      diagnostics.push({
        code: 'expert-reference',
        path: 'capabilities.experts',
        message: `Root authority references undeclared expert "${expertId}".`,
      })
    }
  }
  return { revision: draft.revision, diagnostics }
}

function parseDocument(value: string): StoredConfigurationStudio {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null || (parsed as { format?: unknown }).format !== 1) {
    throw new Error('digital employee configuration studio file has an unsupported format')
  }
  const drafts = (parsed as { drafts?: unknown }).drafts
  if (!Array.isArray(drafts)) throw new Error('digital employee configuration studio file has invalid drafts')
  const publications = (parsed as { publications?: unknown }).publications
  if (publications !== undefined && !Array.isArray(publications)) throw new Error('digital employee configuration studio file has invalid publications')
  return { format: 1, drafts: drafts.map(parseDraft), publications: (publications ?? []).map(parsePublication) }
}

function parsePublication(value: unknown): StoredPublication {
  const entry = record(value, 'publication')
  return {
    templateId: requiredIdentifier(entry.templateId, 'publication templateId'),
    version: requiredText(entry.version, 'publication version'),
    draftId: requiredText(entry.draftId, 'publication draftId') as DigitalEmployeeTemplateDraft['id'],
    draftRevision: requiredPositiveInteger(entry.draftRevision, 'publication draftRevision'),
    publishedAt: requiredText(entry.publishedAt, 'publication publishedAt'),
    draft: parseDraft(entry.draft),
  }
}

function parseDraft(value: unknown): DigitalEmployeeTemplateDraft {
  if (typeof value !== 'object' || value === null) throw new Error('digital employee configuration studio draft is invalid')
  const draft = value as DigitalEmployeeTemplateDraft
  return {
    id: requiredText(draft.id, 'draft id') as DigitalEmployeeTemplateDraft['id'],
    templateId: requiredText(draft.templateId, 'templateId'),
    display: {
      name: requiredText(draft.display?.name, 'display name'),
      description: requiredText(draft.display?.description, 'display description'),
      ...(draft.display?.banner === undefined ? {} : { banner: requiredText(draft.display.banner, 'display banner') }),
    },
    instructions: requiredText(draft.instructions, 'instructions'),
    personality: requiredText(draft.personality, 'personality'),
    preset: requiredText(draft.preset, 'preset'),
    capabilities: parseAuthority(draft.capabilities, 'capabilities'),
    mcpServers: parseMcpServers(draft.mcpServers),
    experts: parseExperts(draft.experts),
    memorySeeds: parseMemorySeeds(draft.memorySeeds),
    delegation: parseDelegation(draft.delegation, 'delegation'),
    revision: requiredPositiveInteger(draft.revision, 'revision'),
    createdAt: requiredText(draft.createdAt, 'createdAt'),
    updatedAt: requiredText(draft.updatedAt, 'updatedAt'),
  }
}

function parseAuthority(value: unknown, field: string): DigitalEmployeeTemplateDraft['capabilities'] {
  const authority = record(value, field)
  return {
    skills: parseIdentifierArray(authority.skills, `${field}.skills`),
    tools: parseIdentifierArray(authority.tools, `${field}.tools`, /^[A-Za-z0-9_-]+$/),
    mcpServers: parseIdentifierArray(authority.mcpServers, `${field}.mcpServers`),
    experts: parseIdentifierArray(authority.experts, `${field}.experts`),
    allowSubagents: requiredBoolean(authority.allowSubagents, `${field}.allowSubagents`),
  }
}

function parseDelegation(value: unknown, field: string): DigitalEmployeeTemplateDraft['delegation'] {
  const delegation = record(value, field)
  return {
    maxDepth: requiredNonnegativeInteger(delegation.maxDepth, `${field}.maxDepth`),
    maxConcurrency: requiredPositiveInteger(delegation.maxConcurrency, `${field}.maxConcurrency`),
    timeoutMs: requiredPositiveInteger(delegation.timeoutMs, `${field}.timeoutMs`),
  }
}

function parseMcpServers(value: unknown): DigitalEmployeeTemplateDraft['mcpServers'] {
  if (!Array.isArray(value)) throw new Error('digital employee configuration mcpServers must be an array')
  return value.map((server, index) => {
    const entry = record(server, `mcpServers.${index}`)
    const id = requiredIdentifier(entry.id, `mcpServers.${index}.id`)
    if (entry.transport === 'stdio') {
      return {
        id,
        transport: 'stdio' as const,
        command: requiredText(entry.command, `mcpServers.${index}.command`),
        args: parseStringArray(entry.args, `mcpServers.${index}.args`),
        env: parseStringRecord(entry.env, `mcpServers.${index}.env`),
        envCredentials: parseCredentialRecord(entry.envCredentials, `mcpServers.${index}.envCredentials`),
        cwd: requiredText(entry.cwd, `mcpServers.${index}.cwd`),
        ...(entry.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: requiredPositiveInteger(entry.toolCallTimeoutMs, `mcpServers.${index}.toolCallTimeoutMs`) }),
        ...(entry.failOnStartupError === undefined ? {} : { failOnStartupError: requiredBoolean(entry.failOnStartupError, `mcpServers.${index}.failOnStartupError`) }),
      }
    }
    if (entry.transport === 'streamable-http') {
      return {
        id,
        transport: 'streamable-http' as const,
        url: requiredText(entry.url, `mcpServers.${index}.url`),
        headers: parseStringRecord(entry.headers, `mcpServers.${index}.headers`),
        headerCredentials: parseCredentialRecord(entry.headerCredentials, `mcpServers.${index}.headerCredentials`),
        ...(entry.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: requiredPositiveInteger(entry.toolCallTimeoutMs, `mcpServers.${index}.toolCallTimeoutMs`) }),
        ...(entry.failOnStartupError === undefined ? {} : { failOnStartupError: requiredBoolean(entry.failOnStartupError, `mcpServers.${index}.failOnStartupError`) }),
      }
    }
    throw new Error(`digital employee configuration mcpServers.${index}.transport is invalid`)
  })
}

function parseExperts(value: unknown): DigitalEmployeeTemplateDraft['experts'] {
  if (!Array.isArray(value)) throw new Error('digital employee configuration experts must be an array')
  return value.map((expert, index) => {
    const entry = record(expert, `experts.${index}`)
    const modelSettings = record(entry.modelSettings, `experts.${index}.modelSettings`)
    const delegation = parseDelegation(entry.delegation, `experts.${index}.delegation`)
    if (entry.delegation === null || typeof entry.delegation !== 'object'
      || ((entry.delegation as { mode?: unknown }).mode !== 'one-shot'
        && (entry.delegation as { mode?: unknown }).mode !== 'continuable')) {
      throw new Error(`digital employee configuration experts.${index}.delegation.mode is invalid`)
    }
    return {
      id: requiredIdentifier(entry.id, `experts.${index}.id`) as DigitalEmployeeTemplateDraft['experts'][number]['id'],
      name: requiredText(entry.name, `experts.${index}.name`),
      responsibility: requiredText(entry.responsibility, `experts.${index}.responsibility`),
      instructions: requiredText(entry.instructions, `experts.${index}.instructions`),
      modelSettings: {
        ...(modelSettings.provider === undefined ? {} : { provider: requiredText(modelSettings.provider, `experts.${index}.modelSettings.provider`) }),
        ...(modelSettings.model === undefined ? {} : { model: requiredText(modelSettings.model, `experts.${index}.modelSettings.model`) }),
        ...(modelSettings.maxTokens === undefined ? {} : { maxTokens: requiredPositiveInteger(modelSettings.maxTokens, `experts.${index}.modelSettings.maxTokens`) }),
      },
      capabilities: parseAuthority(entry.capabilities, `experts.${index}.capabilities`),
      memoryAccess: parseMemoryAccess(entry.memoryAccess, `experts.${index}.memoryAccess`),
      delegation: { mode: (entry.delegation as { mode: 'one-shot' | 'continuable' }).mode, ...delegation },
    }
  })
}

function parseMemorySeeds(value: unknown): DigitalEmployeeTemplateDraft['memorySeeds'] {
  if (!Array.isArray(value)) throw new Error('digital employee configuration memorySeeds must be an array')
  return value.map((seed, index) => {
    const entry = record(seed, `memorySeeds.${index}`)
    return {
      content: requiredText(entry.content, `memorySeeds.${index}.content`),
      tags: parseIdentifierArray(entry.tags, `memorySeeds.${index}.tags`, /^[A-Za-z0-9_-]+$/),
      sensitive: requiredBoolean(entry.sensitive, `memorySeeds.${index}.sensitive`),
      ...(entry.retentionDays === undefined
        ? {}
        : { retentionDays: requiredPositiveInteger(entry.retentionDays, `memorySeeds.${index}.retentionDays`) }),
    }
  })
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`digital employee configuration ${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function parseIdentifierArray(value: unknown, field: string, pattern = IDENTIFIER): string[] {
  if (!Array.isArray(value)) throw new Error(`digital employee configuration ${field} must be an array`)
  const values = value.map(item => requiredIdentifier(item, field, pattern))
  if (new Set(values).size !== values.length) throw new Error(`digital employee configuration ${field} contains duplicate identifiers`)
  return values
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`digital employee configuration ${field} must be an array`)
  return value.map(item => requiredText(item, field))
}

function parseStringRecord(value: unknown, field: string): Record<string, string> {
  const input = record(value, field)
  return Object.fromEntries(Object.entries(input).map(([key, entry]) => [key, requiredText(entry, `${field}.${key}`)]))
}

function parseCredentialRecord(value: unknown, field: string): Record<string, string> {
  const input = parseStringRecord(value, field)
  for (const [key, reference] of Object.entries(input)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(reference)) {
      throw new Error(`digital employee configuration ${field}.${key} has invalid credential reference`)
    }
  }
  return input
}

function parseMemoryAccess(value: unknown, field: string): DigitalEmployeeTemplateDraft['experts'][number]['memoryAccess'] {
  if (!Array.isArray(value)) throw new Error(`digital employee configuration ${field} must be an array`)
  return value.map((scope) => {
    if (scope !== 'task' && scope !== 'session' && scope !== 'long-term') {
      throw new Error(`digital employee configuration ${field} contains invalid memory scope`)
    }
    return scope
  })
}

function requiredIdentifier(value: unknown, field: string, pattern = IDENTIFIER): string {
  const text = requiredText(value, field)
  if (!pattern.test(text)) throw new Error(`digital employee configuration ${field} is invalid`)
  return text
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`digital employee configuration ${field} must be a boolean`)
  return value
}

function copyDraft(draft: DigitalEmployeeTemplateDraft): DigitalEmployeeTemplateDraft {
  return {
    ...draft,
    display: { ...draft.display },
    capabilities: {
      skills: [...draft.capabilities.skills],
      tools: [...draft.capabilities.tools],
      mcpServers: [...draft.capabilities.mcpServers],
      experts: [...draft.capabilities.experts],
      allowSubagents: draft.capabilities.allowSubagents,
    },
    mcpServers: structuredClone(draft.mcpServers),
    experts: structuredClone(draft.experts),
    memorySeeds: structuredClone(draft.memorySeeds),
    delegation: { ...draft.delegation },
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`digital employee configuration ${field} must be non-empty`)
  return value.trim()
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`digital employee configuration ${field} must be a positive integer`)
  return value as number
}

function requiredNonnegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`digital employee configuration ${field} must be a non-negative integer`)
  return value as number
}
