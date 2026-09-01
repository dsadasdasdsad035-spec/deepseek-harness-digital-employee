/** Typed Host management operations for digital employees. */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { admitEncodedImages, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { createDigitalEmployeeTemplateId } from '@deepseek-ai/dsh-digital-employee'
import type {
  ApplyDigitalEmployeeUpgradeRequest,
  CreateDigitalEmployeeRequest,
  DigitalEmployeeAuditRecord,
  DigitalEmployeeExportArtifact,
  DigitalEmployeeExpert,
  DigitalEmployeeInstance,
  DigitalEmployeeMemoryQuery,
  DigitalEmployeeMemoryRecord,
  DigitalEmployeeTemplate,
  DigitalEmployeeUpgradePreview,
  ExportDigitalEmployeeRequest,
  PreviewDigitalEmployeeUpgradeRequest,
} from '@deepseek-ai/dsh-digital-employee'
import { createUserMessage, type MessageId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-digital-employee-agent'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-mcp-client'
import { listMcpServerConfigs } from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-mcp-market'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-skill-market'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tool-market'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { ConfigurationStudioStore, validateDraftBasics } from './configuration-studio.ts'
import type {
  DigitalEmployeeTemplateDraftIdentityRequest,
  DigitalEmployeeDeleteMemoryRequest,
  DigitalEmployeeExpertContinueRequest,
  DigitalEmployeeExpertControlRequest,
  DigitalEmployeeIdentityRequest,
  DigitalEmployeeStartChatRequest,
  DigitalEmployeeStartChatValue,
  DigitalEmployeeTaskTreeEntry,
  DigitalEmployeeTaskTreeRequest,
  DigitalEmployeeConfigurationAssetCatalog,
  ListDigitalEmployeeConfigurationAssetsRequest,
  DigitalEmployeeTemplateDraft,
  DigitalEmployeeTemplateDraftValidation,
  DigitalEmployeeTemplatePublication,
  DigitalEmployeeTemplatePreview,
  DisposeDigitalEmployeeTemplatePreviewRequest,
  PreviewDigitalEmployeeTemplateDraftRequest,
  PublishDigitalEmployeeTemplateDraftRequest,
  CreateDigitalEmployeeTemplateDraftRequest,
  UpdateDigitalEmployeeTemplateDraftRequest,
} from './types.ts'

export type * from './types.ts'

const DEFAULT_SUCCESS_CACHE_MAX_ENTRIES = 256
const DEFAULT_SUCCESS_CACHE_TTL_MS = 5 * 60_000
const DEFAULT_STUDIO_FILE = resolve(homedir(), '.deepseek-harness', 'digital-employee-configuration-studio.json')

/** Successful employee-chat idempotency cache configuration. */
export interface Config {
  /** Enables administrator-only configuration-studio operations for this local Host. */
  administrator?: boolean
  /** Private local file storing drafts and publication provenance. */
  studioFile?: string
  /** Maximum completed submissions retained for retry lookup. */
  successCacheMaxEntries?: number
  /** Milliseconds a completed submission remains reusable. */
  successCacheTtlMs?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host digital employee management gateway. */
    digitalEmployeeManagement: DigitalEmployeeManagementGateway
  }
}

/** Remote-only facade over the owning digital employee services. */
export class DigitalEmployeeManagementGateway extends TypertRemoteService {
  static inject = [
    'agentDefaultModel',
    'agentPresets',
    'agents',
    'attachments',
    'digitalEmployeeAgent',
    'digitalEmployees',
    'skills',
    'tools',
    'workspaceRegistry',
  ]
  static Config: z<Config> = z.object({
    administrator: z.boolean().default(false),
    studioFile: z.string().default(DEFAULT_STUDIO_FILE),
    successCacheMaxEntries: z.number().step(1).min(1).default(DEFAULT_SUCCESS_CACHE_MAX_ENTRIES),
    successCacheTtlMs: z.number().step(1).min(1).default(DEFAULT_SUCCESS_CACHE_TTL_MS),
  })
  private readonly chatStarts = new Map<
    DigitalEmployeeStartChatRequest['submissionId'],
    {
      readonly fingerprint: string
      readonly promise: Promise<DigitalEmployeeStartChatValue>
      completedAt?: number
    }
  >()
  private readonly successCacheMaxEntries: number
  private readonly successCacheTtlMs: number
  private readonly administrator: boolean
  private readonly configurationStudio: ConfigurationStudioStore
  private readonly studioRoot: string
  private readonly registeredPublications = new Set<string>()
  private readonly previews = new Map<string, { readonly handle: AgentHandle; readonly root: string }>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'digitalEmployeeManagement', { namespace: 'digitalEmployees' })
    const studioFile = resolve(config.studioFile ?? DEFAULT_STUDIO_FILE)
    this.successCacheMaxEntries = config.successCacheMaxEntries ?? DEFAULT_SUCCESS_CACHE_MAX_ENTRIES
    this.successCacheTtlMs = config.successCacheTtlMs ?? DEFAULT_SUCCESS_CACHE_TTL_MS
    this.administrator = config.administrator ?? false
    this.configurationStudio = new ConfigurationStudioStore(studioFile)
    this.studioRoot = dirname(studioFile)
  }

  /** List unpublished local template drafts for the local administrator.
   * @returns detached draft records ordered by creation time.
   */
  @Remote('listConfigurationDrafts')
  listConfigurationDrafts(): Promise<readonly DigitalEmployeeTemplateDraft[]> {
    this.requireAdministrator()
    return this.configurationStudio.list()
  }

  /**
   * List assets resolvable through the selected Agent preset.
   * @param request - preset whose standing scoped composition supplies Skill availability.
   * @returns deterministic capability inventory without credential values.
   * @throws a client-safe diagnostic when the preset cannot be composed.
   */
  @Remote('listConfigurationAssets')
  async listConfigurationAssets(
    request: ListDigitalEmployeeConfigurationAssetsRequest,
  ): Promise<DigitalEmployeeConfigurationAssetCatalog> {
    this.requireAdministrator()
    const skills = await this.skillsForPreset(request.preset)
    const skillMarketResult = await this.ctx.get('skillMarket')?.list()
    const toolSchemas = this.ctx.tools.schemas()
    const toolMarketResult = await this.ctx.get('toolMarket')?.list()
    const managedTools = new Map(
      toolMarketResult?.ok === true
        ? toolMarketResult.value.entries.flatMap(pkg =>
          pkg.tools.map(tool => [tool.name, { pkg, tool }] as const))
        : [],
    )
    const managedMcp = await this.ctx.get('mcpMarket')?.templateConfigurations() ?? []
    const managedMcpNames = new Set(managedMcp.map(entry => entry.serverName))
    const runtimeSkills = new Map(skills.map(skill => [skill.name, skill] as const))
    const managedSkills = new Map(
      skillMarketResult?.ok === true
        ? skillMarketResult.value.entries.map(skill => [skill.skillId as string, skill] as const)
        : [],
    )
    const skillNames = new Set([...runtimeSkills.keys(), ...managedSkills.keys()])
    const mcpServers = new Set(listMcpServerConfigs(this.ctx).map(server => server.serverName))
    for (const tool of toolSchemas) {
      const serverName = /^mcp__([^_].*?)__/.exec(tool.name)?.[1]
      if (serverName !== undefined) mcpServers.add(serverName)
    }
    const entries = [
      ...[...skillNames].map((name) => {
        const runtime = runtimeSkills.get(name)
        const managed = managedSkills.get(name)
        const description = managed?.description ?? runtime?.description
        const available = runtime !== undefined
        return {
          id: `skill:${name}` as never,
          kind: 'skill' as const,
          label: name,
          ...(description === undefined ? {} : { description }),
          available,
          source: managed === undefined ? 'skill-registry' : 'skill-market',
          ...(managed?.version === undefined ? {} : { version: managed.version }),
          ...(managed?.author === undefined ? {} : { publisher: managed.author }),
          ...(managed?.tags === undefined ? {} : { tags: managed.tags }),
          managedByMarket: managed !== undefined,
          permissionSummary: [],
          restartRequired: managed !== undefined && !available,
          ...(managed !== undefined && !available
            ? { diagnostic: `Agent preset "${request.preset}" does not expose this installed Skill.` }
            : {}),
        }
      }),
      ...toolSchemas.map((tool) => {
        const managed = managedTools.get(tool.name)
        return {
          id: `tool:${tool.name}` as never,
          kind: 'tool' as const,
          label: tool.name,
          description: tool.description,
          available: true,
          source: managed === undefined ? 'tool-registry' : `tool-market:${managed.pkg.packageId}`,
          ...(managed === undefined ? {} : {
            version: managed.pkg.version,
            publisher: managed.pkg.publisherId,
          }),
          permissionSummary: managed === undefined
            ? [JSON.stringify(tool.parameters)]
            : [...managed.pkg.permissions, managed.tool.inputDescription],
          restartRequired: false,
        }
      }),
      ...[...managedTools.values()]
        .filter(({ tool }) => !toolSchemas.some(schema => schema.name === tool.name))
        .map(({ pkg, tool }) => ({
          id: `tool:${tool.name}` as never,
          kind: 'tool' as const,
          label: tool.name,
          description: tool.description,
          available: false,
          source: `tool-market:${pkg.packageId}`,
          version: pkg.version,
          publisher: pkg.publisherId,
          permissionSummary: [...pkg.permissions, tool.inputDescription],
          restartRequired: pkg.restartRequired,
          diagnostic: 'Restart the Host to activate this installed Tool package.',
        })),
      ...managedMcp.map(entry => ({
        id: `mcp:${entry.serverName}` as never,
        kind: 'mcp' as const,
        label: entry.serverName,
        description: entry.description,
        available: entry.available,
        source: `mcp-market:${entry.packageId}`,
        version: entry.version,
        publisher: entry.publisherId,
        permissionSummary: Object.entries(entry.declaration.headerCredentials)
          .map(([header, reference]) => `${header}: credential ${reference}`),
        restartRequired: entry.restartRequired,
        ...entry.available ? {} : { diagnostic: 'MCP configuration is unavailable or requires a Host restart.' },
        mcpServer: entry.declaration,
      })),
      ...[...mcpServers].filter(serverName => !managedMcpNames.has(serverName)).map(serverName => ({
        id: `mcp:${serverName}` as never,
        kind: 'mcp' as const,
        label: serverName,
        available: false,
        source: 'mcp-client',
        permissionSummary: [],
        restartRequired: false,
        diagnostic: 'This MCP client does not expose a credential-free declaration for template publication.',
      })),
    ].sort((left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label))
    return { entries }
  }

  /**
   * List immutable local publication provenance for the administrator.
   * @returns detached publication provenance ordered by allocation time.
   */
  @Remote('listConfigurationPublications')
  listConfigurationPublications(): Promise<readonly DigitalEmployeeTemplatePublication[]> {
    this.requireAdministrator()
    return this.configurationStudio.listPublications().then(publications =>
      publications.map(({ draft: _draft, ...publication }) => publication))
  }

  /** Create one unpublished employee template draft for the local administrator.
   * @param request - initial display and instruction fields.
   * @returns detached new draft record.
   */
  @Remote('createConfigurationDraft')
  async createConfigurationDraft(
    request: CreateDigitalEmployeeTemplateDraftRequest,
  ): Promise<DigitalEmployeeTemplateDraft> {
    this.requireAdministrator()
    return await this.configurationStudio.create({
      ...request,
      preset: request.preset?.trim() || this.ctx.agentPresets.defaultId,
    }, randomUUID() as DigitalEmployeeTemplateDraft['id'])
  }

  /**
   * Update one unpublished draft with optimistic revision control.
   * @param request - draft identity, observed revision, and replacement fields.
   * @returns committed detached draft.
   */
  @Remote('updateConfigurationDraft')
  updateConfigurationDraft(request: UpdateDigitalEmployeeTemplateDraftRequest): Promise<DigitalEmployeeTemplateDraft> {
    this.requireAdministrator()
    return this.configurationStudio.update(request)
  }

  /**
   * Discard one unpublished draft.
   * @param request - draft identity to discard.
   */
  @Remote('deleteConfigurationDraft')
  deleteConfigurationDraft(request: DigitalEmployeeTemplateDraftIdentityRequest): Promise<void> {
    this.requireAdministrator()
    return this.configurationStudio.delete(request.draftId)
  }

  /** Validate one current draft revision before preview or publication.
   * @param request - required draft identity.
   * @returns revision-bound actionable diagnostics.
   */
  @Remote('validateConfigurationDraft')
  async validateConfigurationDraft(
    request: DigitalEmployeeTemplateDraftIdentityRequest,
  ): Promise<DigitalEmployeeTemplateDraftValidation> {
    this.requireAdministrator()
    return await this.validateDraft(await this.configurationStudio.get(request.draftId))
  }

  /**
   * Create an isolated temporary preview from one valid current draft revision.
   * @param request - draft revision and workspace used for preview composition.
   * @returns temporary preview ownership information.
   */
  @Remote('previewConfigurationDraft')
  async previewConfigurationDraft(
    request: PreviewDigitalEmployeeTemplateDraftRequest,
  ): Promise<DigitalEmployeeTemplatePreview> {
    this.requireAdministrator()
    const draft = await this.configurationStudio.get(request.draftId)
    if (draft.revision !== request.revision) throw new Error('digital employee configuration draft revision conflict')
    const validation = await this.validateDraft(draft)
    if (validation.diagnostics.length > 0) throw new Error('digital employee configuration draft has validation diagnostics')
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(request.workspaceId))
    if (workspace === undefined) throw new Error('digital employee workspace is unavailable')
    const id = `preview-${randomUUID()}`
    const sessionId = `preview-session-${randomUUID()}` as never
    const root = join(this.studioRoot, 'digital-employee-previews', id)
    await mkdir(root, { recursive: true, mode: 0o700 })
    const materialized = await materializeDraft(root, draft)
    try {
      const handle = await this.ctx.digitalEmployeeAgent.createPreviewTask({
        sessionId,
        workspacePath: workspace.path,
        employee: {
          instance: {
            id: `preview-${id}` as never,
            templateId: createDigitalEmployeeTemplateId(draft.templateId),
            templateVersion: `preview-${draft.revision}`,
            displayName: `${draft.display.name} preview`,
            grants: draft.capabilities as never,
            state: 'active',
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
          },
          template: {
            id: createDigitalEmployeeTemplateId(draft.templateId),
            version: `preview-${draft.revision}`,
            display: draft.display,
            personality: draft.personality,
            instructions: materialized.instructions,
            preset: draft.preset,
            mcpServers: draft.mcpServers as never,
            capabilities: draft.capabilities as never,
            experts: materialized.experts,
            delegation: draft.delegation,
          },
          personality: draft.personality,
          instructions: materialized.instructions,
          authority: draft.capabilities as never,
          mcpServers: draft.mcpServers as never,
          experts: materialized.experts,
          delegation: draft.delegation,
        },
      })
      this.previews.set(id, { handle, root })
      return { id, draftId: draft.id, revision: draft.revision, sessionId, state: 'active' }
    } catch (error: unknown) {
      await rm(root, { recursive: true, force: true })
      throw error
    }
  }

  /**
   * Dispose one active preview and remove its temporary instruction material.
   * @param request - active preview identity to terminate.
   */
  @Remote('disposeConfigurationPreview')
  async disposeConfigurationPreview(
    request: DisposeDigitalEmployeeTemplatePreviewRequest,
  ): Promise<void> {
    this.requireAdministrator()
    const preview = this.previews.get(request.previewId)
    if (preview === undefined) throw new Error(`digital employee configuration preview "${request.previewId}" is unavailable`)
    this.previews.delete(request.previewId)
    try {
      await preview.handle.dispose()
    } finally {
      await rm(preview.root, { recursive: true, force: true })
    }
  }

  /**
   * Publish one valid draft revision and register it for existing employee workflows.
   * @param request - draft identity and revision to publish.
   * @returns immutable local version provenance.
   */
  @Remote('publishConfigurationDraft')
  async publishConfigurationDraft(
    request: PublishDigitalEmployeeTemplateDraftRequest,
  ): Promise<DigitalEmployeeTemplatePublication> {
    this.requireAdministrator()
    const draft = await this.configurationStudio.get(request.draftId)
    if (draft.revision !== request.revision) throw new Error('digital employee configuration draft revision conflict')
    const publication = await this.configurationStudio.publish(request.draftId, request.revision, async (publishedDraft, candidate) => {
      const validation = await this.validateDraft(publishedDraft)
      if (validation.diagnostics.length > 0) {
        throw new Error('digital employee configuration draft has validation diagnostics')
      }
      const root = join(this.studioRoot, 'digital-employee-templates', publishedDraft.templateId, candidate.version)
      await mkdir(root, { recursive: true, mode: 0o700 })
      const materialized = await materializeDraft(root, publishedDraft)
      this.ctx.digitalEmployees.registerTemplate({
        id: createDigitalEmployeeTemplateId(publishedDraft.templateId),
        version: candidate.version,
        display: publishedDraft.display,
        personality: publishedDraft.personality,
        instructions: materialized.instructions,
        preset: publishedDraft.preset,
        mcpServers: publishedDraft.mcpServers as never,
        capabilities: publishedDraft.capabilities as never,
        experts: materialized.experts,
        delegation: publishedDraft.delegation,
      })
      this.registeredPublications.add(`${candidate.templateId}\u0000${candidate.version}`)
    })
    return publication
  }

  /** List registered immutable template versions.
   * @returns registered immutable template versions.
   */
  @Remote('listTemplates')
  async listTemplates(): Promise<readonly DigitalEmployeeTemplate[]> {
    await this.registerPublishedTemplates()
    return this.ctx.digitalEmployees.listTemplates()
  }

  /** List durable employee instances.
   * @returns durable employee instances.
   */
  @Remote('list')
  list(): Promise<readonly DigitalEmployeeInstance[]> { return this.ctx.digitalEmployees.list() }

  /** Inspect one required employee.
   * @param request - required employee identity.
   * @returns employee snapshot.
   */
  @Remote('get')
  get(request: DigitalEmployeeIdentityRequest): Promise<DigitalEmployeeInstance> {
    return this.ctx.digitalEmployees.inspect(request.employeeId)
  }

  /** Create an inactive employee.
   * @param request - validated instance creation fields.
   * @returns created inactive employee.
   */
  @Remote('create')
  async create(request: CreateDigitalEmployeeRequest): Promise<DigitalEmployeeInstance> {
    await this.registerPublishedTemplates()
    const employee = await this.ctx.digitalEmployees.create(request)
    const publication = (await this.configurationStudio.listPublications()).find(candidate =>
      candidate.templateId === request.templateId && candidate.version === request.templateVersion)
    if (publication === undefined || publication.draft.memorySeeds.length === 0) return employee
    try {
      for (const seed of publication.draft.memorySeeds) {
        const decision = await this.ctx.digitalEmployees.promoteMemory({
          employeeId: employee.id,
          content: seed.content,
          tags: seed.tags,
          sensitive: seed.sensitive,
          ...(seed.retentionDays === undefined ? {} : { retentionDays: seed.retentionDays }),
          provenance: {
            sessionId: `configuration-seed:${publication.templateId}@${publication.version}` as never,
            source: 'configuration-seed',
            recordedAt: new Date().toISOString(),
          },
        })
        if (decision.kind === 'rejected') {
          throw new Error(`digital employee configuration memory seed was rejected: ${decision.reason}`)
        }
      }
      return employee
    } catch (error: unknown) {
      await this.ctx.digitalEmployees.delete(employee.id)
      throw error
    }
  }

  /** Activate an inactive employee.
   * @param request - employee to activate.
   * @returns active employee.
   */
  @Remote('activate')
  activate(request: DigitalEmployeeIdentityRequest): Promise<DigitalEmployeeInstance> {
    return this.ctx.digitalEmployees.activate(request.employeeId)
  }

  /** Deactivate an active employee.
   * @param request - employee to deactivate.
   * @returns inactive employee.
   */
  @Remote('deactivate')
  deactivate(request: DigitalEmployeeIdentityRequest): Promise<DigitalEmployeeInstance> {
    return this.ctx.digitalEmployees.deactivate(request.employeeId)
  }

  /** Delete an employee after owned work and connections terminate.
   * @param request - employee to remove.
   */
  @Remote('delete')
  delete(request: DigitalEmployeeIdentityRequest): Promise<void> {
    return this.ctx.digitalEmployees.delete(request.employeeId)
  }

  /**
   * Atomically create one employee root Session and admit its first user message.
   * Identical uses of one submission identity share the accepted result; reuse
   * with different task data rejects. Validation, cancellation, attachment
   * admission, and message-admission failures dispose unpublished work.
   * @param request - employee, Session, submission, and first-message content.
   * @param signal - caller cancellation propagated through validation and creation.
   * @returns accepted Session, submission, and message identities.
   */
  @Remote('startChat')
  startChat(
    request: DigitalEmployeeStartChatRequest,
    signal: AbortSignal,
  ): Promise<DigitalEmployeeStartChatValue> {
    this.pruneChatStarts(Date.now())
    const fingerprint = chatStartFingerprint(request)
    const existing = this.chatStarts.get(request.submissionId)
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(new Error(
          `digital employee submission "${request.submissionId}" was reused with different task data`,
        ))
      }
      return existing.promise
    }
    const entry: {
      readonly fingerprint: string
      readonly promise: Promise<DigitalEmployeeStartChatValue>
      completedAt?: number
    } = {
      fingerprint,
      promise: this.startChatAttempt(request, signal).then(
        (value) => {
          entry.completedAt = Date.now()
          this.pruneChatStarts(entry.completedAt)
          return value
        },
        (error: unknown) => {
          if (this.chatStarts.get(request.submissionId) === entry) {
            this.chatStarts.delete(request.submissionId)
          }
          throw error
        },
      ),
    }
    this.chatStarts.set(request.submissionId, entry)
    return entry.promise
  }

  /** Query bounded employee-owned memory.
   * @param request - bounded employee memory query.
   * @returns matching employee-owned records.
   */
  @Remote('listMemory')
  listMemory(request: DigitalEmployeeMemoryQuery): Promise<readonly DigitalEmployeeMemoryRecord[]> {
    return this.ctx.digitalEmployees.queryMemory(request)
  }

  /** Delete one employee-owned memory.
   * @param request - employee-owned memory identity.
   */
  @Remote('deleteMemory')
  deleteMemory(request: DigitalEmployeeDeleteMemoryRequest): Promise<void> {
    return this.ctx.digitalEmployees.deleteMemory(request.employeeId, request.memoryId)
  }

  /** List experts enabled for an employee, including inactive instances.
   * @param request - employee identity.
   * @returns enabled expert descriptors.
   */
  @Remote('listExperts')
  async listExperts(request: DigitalEmployeeIdentityRequest): Promise<readonly DigitalEmployeeExpert[]> {
    const instance = await this.ctx.digitalEmployees.inspect(request.employeeId)
    const template = this.ctx.digitalEmployees.getTemplate(instance.templateId, instance.templateVersion)
    if (template === undefined) {
      throw new Error(
        `digital employee "${instance.id}" requires unavailable template `
        + `"${instance.templateId}" version "${instance.templateVersion}"`,
      )
    }
    const enabled = new Set(instance.grants.experts)
    return template.experts.filter(expert => enabled.has(expert.id))
  }

  /** List current expert and subagent descendants.
   * @param request - root Session identity.
   * @returns current expert and subagent descendants.
   */
  @Remote('taskTree')
  async taskTree(request: DigitalEmployeeTaskTreeRequest): Promise<DigitalEmployeeTaskTreeEntry[]> {
    const entries = await this.ctx.digitalEmployeeAgent.listExpertTree(request.rootSessionId)
    return entries.map(entry => ({ ...entry }))
  }

  /** Continue a live expert child.
   * @param request - direct parent, child, and next user content.
   * @returns accepted message identity.
   */
  @Remote('continueExpert')
  continueExpert(request: DigitalEmployeeExpertContinueRequest): Promise<MessageId> {
    return this.ctx.digitalEmployeeAgent.followupExpert(
      this.requiredParent(request.parentSessionId),
      request.childSessionId,
      [...request.content],
      { source: { kind: 'user' }, signal: new AbortController().signal },
    )
  }

  /** Interrupt a live expert subtree.
   * @param request - direct parent and child identities.
   */
  @Remote('interruptExpert')
  interruptExpert(request: DigitalEmployeeExpertControlRequest): void {
    this.requiredParent(request.parentSessionId)
    this.ctx.digitalEmployeeAgent.interruptExpert(request.childSessionId, {
      kind: 'user',
      parentSessionId: request.parentSessionId,
    })
  }

  /** List attributable employee operations.
   * @param request - employee whose records are requested.
   * @returns audit history.
   */
  @Remote('listAudit')
  listAudit(request: DigitalEmployeeIdentityRequest): Promise<readonly DigitalEmployeeAuditRecord[]> {
    return this.ctx.digitalEmployees.listAudit(request.employeeId)
  }

  /** Preview one exact template upgrade.
   * @param request - target template version.
   * @returns immutable capability review.
   */
  @Remote('previewUpgrade')
  previewUpgrade(request: PreviewDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeUpgradePreview> {
    return this.ctx.digitalEmployees.previewUpgrade(request)
  }

  /** Apply one reviewed template upgrade.
   * @param request - reviewed target and explicit new grants.
   * @returns upgraded employee.
   */
  @Remote('applyUpgrade')
  applyUpgrade(request: ApplyDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeInstance> {
    return this.ctx.digitalEmployees.applyUpgrade(request)
  }

  /** Export portable employee data.
   * @param request - employee and memory inclusion choice.
   * @returns credential-free artifact.
   */
  @Remote('exportEmployee')
  exportEmployee(request: ExportDigitalEmployeeRequest): Promise<DigitalEmployeeExportArtifact> {
    return this.ctx.digitalEmployees.exportEmployee(request)
  }

  /** Import portable employee data.
   * @param artifact - portable employee data.
   * @returns fresh inactive employee.
   */
  @Remote('importEmployee')
  importEmployee(artifact: DigitalEmployeeExportArtifact): Promise<DigitalEmployeeInstance> {
    return this.ctx.digitalEmployees.importEmployee(artifact)
  }

  private requiredParent(sessionId: DigitalEmployeeExpertControlRequest['parentSessionId']): Agent {
    const parent = this.ctx.agents.get(sessionId)
    if (parent === undefined) throw new Error(`digital employee parent Agent "${sessionId}" is not live`)
    return parent
  }

  private requireAdministrator(): void {
    if (!this.administrator) throw new Error('digital employee configuration administrator mode is disabled')
  }

  /** Validate static draft relationships plus the current locally mounted capability catalog. */
  private async validateDraft(draft: DigitalEmployeeTemplateDraft): Promise<DigitalEmployeeTemplateDraftValidation> {
    const validation = validateDraftBasics(draft)
    const diagnostics = [...validation.diagnostics]
    const skillNames = new Set<string>()
    try {
      for (const skill of await this.skillsForPreset(draft.preset)) skillNames.add(skill.name)
    } catch {
      diagnostics.push({
        code: 'unavailable-preset',
        path: 'preset',
        message: `Agent preset "${draft.preset}" is not available for template configuration.`,
      })
    }
    const tools = this.ctx.get('tools')
    const authorities = [
      { path: 'capabilities', value: draft.capabilities },
      ...draft.experts.map(expert => ({ path: `experts.${expert.id}.capabilities`, value: expert.capabilities })),
    ]
    for (const authority of authorities) {
      for (const skill of authority.value.skills) {
        if (!skillNames.has(skill)) {
          diagnostics.push({
            code: 'unavailable-skill',
            path: `${authority.path}.skills`,
            message: `Skill "${skill}" is not available in this installation.`,
          })
        }
      }
      for (const tool of authority.value.tools) {
        if (tools?.get(tool) === undefined) {
          diagnostics.push({
            code: 'unavailable-tool',
            path: `${authority.path}.tools`,
            message: `Tool "${tool}" is not available in this installation.`,
          })
        }
      }
    }
    if (draft.mcpServers.length > 0 && this.ctx.get('mcpClients') === undefined) {
      diagnostics.push({
        code: 'unavailable-mcp-client',
        path: 'mcpServers',
        message: 'MCP client support is not available in this installation.',
      })
    }
    const credentials = this.ctx.get('credentials')
    for (const server of draft.mcpServers) {
      const references = server.transport === 'stdio'
        ? { path: `mcpServers.${server.id}.envCredentials`, values: server.envCredentials }
        : { path: `mcpServers.${server.id}.headerCredentials`, values: server.headerCredentials }
      for (const [name, reference] of Object.entries(references.values)) {
        if (credentials === undefined || await credentials.resolve(reference as never) === undefined) {
          diagnostics.push({
            code: 'unavailable-credential',
            path: `${references.path}.${name}`,
            message: `Credential reference "${reference}" is unavailable.`,
          })
        }
      }
    }
    return { revision: draft.revision, diagnostics }
  }

  /**
   * Resolve Skill summaries from one preset's standing composition.
   * @param preset - selected Agent preset identity.
   * @returns Skill summaries visible from the preset scope.
   * @throws a path-free diagnostic when the preset is unavailable or cannot compose.
   */
  private async skillsForPreset(preset: string): ReturnType<Context['skills']['list']> {
    try {
      const scope = await this.ctx.agentPresets.standingKeyFor(preset)
      return await this.ctx.skills.list({ scope })
    } catch {
      throw new Error(`Agent preset "${preset}" is unavailable for template configuration.`)
    }
  }

  private async registerPublishedTemplates(): Promise<void> {
    for (const publication of await this.configurationStudio.listPublications()) {
      const key = `${publication.templateId}\u0000${publication.version}`
      if (this.registeredPublications.has(key)) continue
      const draft = publication.draft
      const root = join(this.studioRoot, 'digital-employee-templates', publication.templateId, publication.version)
      this.ctx.digitalEmployees.registerTemplate(await localTemplate(root, publication.version, draft))
      this.registeredPublications.add(key)
    }
  }

  private async startChatAttempt(
    request: DigitalEmployeeStartChatRequest,
    signal: AbortSignal,
  ): Promise<DigitalEmployeeStartChatValue> {
    signal.throwIfAborted()
    if (!hasTaskContent(request.content)) {
      throw new Error('digital employee task content must include non-whitespace text or an image')
    }
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(request.workspaceId))
    if (workspace === undefined) {
      throw new Error('digital employee workspace is unavailable')
    }
    const employee = await this.ctx.digitalEmployees.resolve(request.employeeId)
    signal.throwIfAborted()
    const content = await durableStartChatContent(this.ctx, request.content)
    signal.throwIfAborted()
    const message = createUserMessage({
      content,
      source: { kind: 'user' },
    })
    const modelSelection = this.ctx.agentDefaultModel.currentSelection()
    const handle = await this.ctx.digitalEmployeeAgent.createTask({
      employeeId: request.employeeId,
      sessionId: request.sessionId,
      meta: { cwd: workspace.path },
      agentOptions: {
        provider: modelSelection.provider,
        model: modelSelection.model,
      },
      modelSelection,
      initialMessage: message,
      signal,
    }, employee)
    try {
      await workspace.attachSession(handle.agent.id)
    } catch (error: unknown) {
      await handle.dispose()
      throw error
    }
    return {
      sessionId: handle.agent.id,
      submissionId: request.submissionId,
      messageId: message.id,
    }
  }

  private pruneChatStarts(now: number): void {
    for (const [submissionId, entry] of this.chatStarts) {
      if (entry.completedAt !== undefined && now - entry.completedAt >= this.successCacheTtlMs) {
        this.chatStarts.delete(submissionId)
      }
    }
    const completed = [...this.chatStarts.entries()]
      .filter((entry): entry is typeof entry & { 1: { completedAt: number } } =>
        entry[1].completedAt !== undefined)
      .sort((left, right) => left[1].completedAt - right[1].completedAt)
    for (const [submissionId] of completed.slice(0, -this.successCacheMaxEntries)) {
      this.chatStarts.delete(submissionId)
    }
  }
}

async function materializeDraft(
  root: string,
  draft: DigitalEmployeeTemplateDraft,
): Promise<{ readonly instructions: DigitalEmployeeTemplate['instructions']; readonly experts: DigitalEmployeeExpert[] }> {
  const instructions = await writeInstruction(root, 'AGENTS.md', draft.instructions)
  const experts = await Promise.all(draft.experts.map(async expert => ({
    id: expert.id as DigitalEmployeeExpert['id'],
    name: expert.name,
    responsibility: expert.responsibility,
    instructions: await writeInstruction(root, join('experts', expert.id, 'AGENTS.md'), expert.instructions),
    modelSettings: expert.modelSettings,
    capabilities: expert.capabilities as never,
    memoryAccess: expert.memoryAccess,
    delegation: expert.delegation,
  })))
  return { instructions, experts }
}

async function localTemplate(
  root: string,
  version: string,
  draft: DigitalEmployeeTemplateDraft,
): Promise<DigitalEmployeeTemplate> {
  const instructions = await readInstruction(root, 'AGENTS.md')
  const experts = await Promise.all(draft.experts.map(async expert => ({
    id: expert.id as DigitalEmployeeExpert['id'],
    name: expert.name,
    responsibility: expert.responsibility,
    instructions: await readInstruction(root, join('experts', expert.id, 'AGENTS.md')),
    modelSettings: expert.modelSettings,
    capabilities: expert.capabilities as never,
    memoryAccess: expert.memoryAccess,
    delegation: expert.delegation,
  })))
  return {
    id: createDigitalEmployeeTemplateId(draft.templateId),
    version,
    display: draft.display,
    personality: draft.personality,
    instructions,
    preset: draft.preset,
    mcpServers: draft.mcpServers as never,
    capabilities: draft.capabilities as never,
    experts,
    delegation: draft.delegation,
  }
}

async function writeInstruction(
  root: string,
  path: string,
  text: string,
): Promise<DigitalEmployeeTemplate['instructions']> {
  const contents = `${text}\n`
  await writeFileAtomic(join(root, path), contents, { mode: 0o600, dirMode: 0o700 })
  return { kind: 'file', root, path, revision: createHash('sha256').update(contents).digest('hex') }
}

async function readInstruction(
  root: string,
  path: string,
): Promise<DigitalEmployeeTemplate['instructions']> {
  const contents = await readFile(join(root, path), 'utf8')
  return { kind: 'file', root, path, revision: createHash('sha256').update(contents).digest('hex') }
}

async function durableStartChatContent(
  ctx: Context,
  content: DigitalEmployeeStartChatRequest['content'],
) {
  if (content.every(part => part.type === 'text')) {
    return content.map(part => ({ type: 'text' as const, text: part.text }))
  }
  const refs = await admitEncodedImages(ctx.attachments, content.filter(part => part.type === 'image'))
  let next = 0
  return content.map(part => part.type === 'text'
    ? { type: 'text' as const, text: part.text }
    : { type: 'image' as const, attachment: refs[next++] as ImageAttachmentRef })
}

function hasTaskContent(content: DigitalEmployeeStartChatRequest['content']): boolean {
  return content.some(block => block.type === 'image' || block.text.trim() !== '')
}

function chatStartFingerprint(request: DigitalEmployeeStartChatRequest): string {
  return createHash('sha256').update(JSON.stringify({
    employeeId: request.employeeId,
    sessionId: request.sessionId,
    content: request.content,
  })).digest('hex')
}


export default DigitalEmployeeManagementGateway
