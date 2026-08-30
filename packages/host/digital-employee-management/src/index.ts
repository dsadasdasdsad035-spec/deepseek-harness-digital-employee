/** Typed Host management operations for digital employees. */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { admitEncodedImages, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
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
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import type {
  DigitalEmployeeDeleteMemoryRequest,
  DigitalEmployeeExpertContinueRequest,
  DigitalEmployeeExpertControlRequest,
  DigitalEmployeeIdentityRequest,
  DigitalEmployeeStartChatRequest,
  DigitalEmployeeStartChatValue,
  DigitalEmployeeTaskTreeEntry,
  DigitalEmployeeTaskTreeRequest,
} from './types.ts'

export type * from './types.ts'

const DEFAULT_SUCCESS_CACHE_MAX_ENTRIES = 256
const DEFAULT_SUCCESS_CACHE_TTL_MS = 5 * 60_000

/** Successful employee-chat idempotency cache configuration. */
export interface Config {
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
    'agents',
    'attachments',
    'digitalEmployeeAgent',
    'digitalEmployees',
    'workspaceRegistry',
  ]
  static Config: z<Config> = z.object({
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

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'digitalEmployeeManagement', { namespace: 'digitalEmployees' })
    this.successCacheMaxEntries = config.successCacheMaxEntries ?? DEFAULT_SUCCESS_CACHE_MAX_ENTRIES
    this.successCacheTtlMs = config.successCacheTtlMs ?? DEFAULT_SUCCESS_CACHE_TTL_MS
  }

  /** List registered immutable template versions.
   * @returns registered immutable template versions.
   */
  @Remote('listTemplates')
  listTemplates(): readonly DigitalEmployeeTemplate[] { return this.ctx.digitalEmployees.listTemplates() }

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
  create(request: CreateDigitalEmployeeRequest): Promise<DigitalEmployeeInstance> {
    return this.ctx.digitalEmployees.create(request)
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
