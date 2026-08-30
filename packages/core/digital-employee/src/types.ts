/**
 * Digital employee domain records shared by providers and consumers.
 * @module @deepseek-ai/dsh-digital-employee/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable identifier of a reusable digital employee template. */
export type DigitalEmployeeTemplateId = Branded<'DigitalEmployeeTemplateId'>
/** Stable identifier of one durable digital employee instance. */
export type DigitalEmployeeInstanceId = Branded<'DigitalEmployeeInstanceId'>
/** Stable digest of one resolved root Agent composition. */
export type DigitalEmployeeCompositionId = Branded<'DigitalEmployeeCompositionId'>
/** Stable identifier of one employee-owned memory record. */
export type DigitalEmployeeMemoryId = Branded<'DigitalEmployeeMemoryId'>
/** Stable identifier of one employee-owned root or delegated task. */
export type DigitalEmployeeTaskId = Branded<'DigitalEmployeeTaskId'>
/** Stable identity of one client task-start submission attempt. */
export type DigitalEmployeeSubmissionId = Branded<'DigitalEmployeeSubmissionId'>
/** Stable identifier of an expert declared by one template. */
export type ExpertId = Branded<'DigitalEmployeeExpertId'>
/** Stable identifier of an employee audit record. */
export type DigitalEmployeeAuditId = Branded<'DigitalEmployeeAuditId'>
/** Stable identifier of a lifecycle or management operation. */
export type DigitalEmployeeOperationId = Branded<'DigitalEmployeeOperationId'>

/** Lifecycle states persisted for a digital employee instance. */
export type DigitalEmployeeLifecycleState = 'inactive' | 'active' | 'deleting' | 'deleted'

/** Trusted instruction file selected from a contributing plugin. */
export interface DigitalEmployeeInstructionSource {
  readonly kind: 'file'
  /** Absolute root of the contributing plugin package. */
  readonly root: string
  /** Plugin-relative instruction path. */
  readonly path: string
  /** Stable revision used by logs and upgrade previews. */
  readonly revision: string
}

/** Explicit capability set; absence from a list means unavailable. */
export interface DigitalEmployeeAuthority {
  readonly skills: readonly string[]
  readonly tools: readonly string[]
  readonly mcpServers: readonly string[]
  readonly experts: readonly ExpertId[]
  readonly allowSubagents: boolean
}

/** Limits applied to root and nested delegation. */
export interface DigitalEmployeeDelegationPolicy {
  readonly maxDepth: number
  readonly maxConcurrency: number
  readonly timeoutMs: number
}

/** Memory scopes an expert may receive. */
export type DigitalEmployeeMemoryScope = 'task' | 'session' | 'long-term'

/** Per-expert conversation model overrides passed to the existing Agent runtime. */
export interface DigitalEmployeeExpertModelSettings {
  readonly provider?: string
  readonly model?: string
  readonly maxTokens?: number
}

/** Common non-secret options for one template-declared MCP server. */
export interface DigitalEmployeeMcpServerBase {
  /** Stable template-local MCP server identifier used by authority lists. */
  readonly id: string
  /** Per-tool-call timeout in milliseconds; omission uses the MCP client default. */
  readonly toolCallTimeoutMs?: number
  /** Whether initial connection failure aborts Agent setup. */
  readonly failOnStartupError?: boolean
}

/** Template-declared stdio MCP server with credential references separated from literal environment values. */
export interface DigitalEmployeeStdioMcpServer extends DigitalEmployeeMcpServerBase {
  readonly transport: 'stdio'
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly envCredentials: Readonly<Record<string, CredentialRef>>
  readonly cwd: string
}

/** Template-declared HTTP MCP server with credential references separated from literal headers. */
export interface DigitalEmployeeHttpMcpServer extends DigitalEmployeeMcpServerBase {
  readonly transport: 'streamable-http'
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly headerCredentials: Readonly<Record<string, CredentialRef>>
}

/** Non-secret MCP declaration contributed by a trusted employee template. */
export type DigitalEmployeeMcpServer = DigitalEmployeeStdioMcpServer | DigitalEmployeeHttpMcpServer

/** Named expert composition contributed by a template. */
export interface DigitalEmployeeExpert {
  readonly id: ExpertId
  readonly name: string
  readonly responsibility: string
  readonly instructions: DigitalEmployeeInstructionSource
  readonly modelSettings: DigitalEmployeeExpertModelSettings
  readonly capabilities: DigitalEmployeeAuthority
  readonly memoryAccess: readonly DigitalEmployeeMemoryScope[]
  readonly delegation: DigitalEmployeeDelegationPolicy & {
    readonly mode: 'one-shot' | 'continuable'
  }
}

/** Display metadata shown by management clients. */
export interface DigitalEmployeeTemplateDisplay {
  readonly name: string
  readonly description: string
  readonly banner?: string
}

/** Immutable versioned template contributed by a trusted plugin. */
export interface DigitalEmployeeTemplate {
  readonly id: DigitalEmployeeTemplateId
  readonly version: string
  readonly display: DigitalEmployeeTemplateDisplay
  readonly personality: string
  readonly instructions: DigitalEmployeeInstructionSource
  readonly preset: string
  readonly mcpServers?: readonly DigitalEmployeeMcpServer[]
  readonly capabilities: DigitalEmployeeAuthority
  readonly experts: readonly DigitalEmployeeExpert[]
  readonly delegation: DigitalEmployeeDelegationPolicy
}

/**
 * Merge-extensible named template contribution map. Plugins may augment this
 * interface to retain literal template types at registration sites.
 */
export interface DigitalEmployeeTemplateMap {}

/** Durable mutable state of one employee created from an exact template version. */
export interface DigitalEmployeeInstance {
  readonly id: DigitalEmployeeInstanceId
  readonly templateId: DigitalEmployeeTemplateId
  readonly templateVersion: string
  readonly displayName: string
  readonly personality?: string
  readonly grants: DigitalEmployeeAuthority
  readonly state: DigitalEmployeeLifecycleState
  readonly createdAt: string
  readonly updatedAt: string
}

/** Complete composition resolved before an employee task creates a Session. */
export interface ResolvedDigitalEmployee {
  readonly instance: DigitalEmployeeInstance
  readonly template: DigitalEmployeeTemplate
  readonly personality: string
  readonly instructions: DigitalEmployeeInstructionSource
  readonly authority: DigitalEmployeeAuthority
  readonly mcpServers: readonly DigitalEmployeeMcpServer[]
  readonly experts: readonly DigitalEmployeeExpert[]
  readonly delegation: DigitalEmployeeDelegationPolicy
}

/** Resolved employee identity recorded before a root Agent is published. */
export interface DigitalEmployeeIdentityEvent {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly displayName: string
  readonly templateId: DigitalEmployeeTemplateId
  readonly templateVersion: string
  readonly compositionId: DigitalEmployeeCompositionId
  readonly personality: string
}

/** Exact employee instruction revision used by one root Agent. */
export interface DigitalEmployeeInstructionsEvent {
  readonly revision: string
}

/** One employee memory rendered into a model-visible task projection. */
export interface DigitalEmployeeMemoryProjectionEntry {
  readonly id: DigitalEmployeeMemoryId
  readonly scope: DigitalEmployeeMemoryScope
  readonly content: string
  readonly provenance: DigitalEmployeeMemoryProvenance
}

/** Exact bounded employee memory supplied to one task Session. */
export interface DigitalEmployeeMemoryProjectionEvent {
  readonly memories: readonly DigitalEmployeeMemoryProjectionEntry[]
}

/** Accepted expert delegation input and its resolved child composition. */
export interface DigitalEmployeeExpertDelegationEvent {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly expertId: ExpertId
  readonly childSessionId: SessionId
  readonly mode: 'one-shot' | 'continuable'
  readonly provider: string
  readonly label: string
  readonly instructionRevision: string
  readonly prompt: readonly ContentBlock[]
  readonly memoryProjection?: DigitalEmployeeMemoryProjectionEvent
  readonly authority: DigitalEmployeeAuthority
  readonly delegation: DigitalEmployeeDelegationPolicy
}

/** Expert delegation rejected before a child Session was created. */
export interface DigitalEmployeeExpertAuthorizationDeniedEvent {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly expertId: ExpertId
  readonly reason: string
}

/** Terminal one-shot expert output delivered to its parent Session. */
export interface DigitalEmployeeExpertResultEvent {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly expertId: ExpertId
  readonly childSessionId: SessionId
  readonly output: readonly ContentBlock[]
  readonly stopReason: string
  readonly diagnostic?: string
}

/** Durable policy outcome for one employee memory promotion candidate. */
export interface DigitalEmployeeMemoryDecisionEvent {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly candidate: DigitalEmployeeMemoryCandidate
  readonly decision:
    | { readonly kind: 'accepted'; readonly memoryId: DigitalEmployeeMemoryId }
    | { readonly kind: 'rejected'; readonly reason: string }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Creation-time employee ownership and resolved composition identity for
     * this root Session.
     */
    'digital-employee/identity': DigitalEmployeeIdentityEvent
    /** The exact template instruction revision supplying the Session prompt. */
    'digital-employee/instructions': DigitalEmployeeInstructionsEvent
    /** Exact memory IDs and rendered content supplied to the Session prompt. */
    'digital-employee/memory-projection': DigitalEmployeeMemoryProjectionEvent
    /** Accepted expert task input and resolved child composition. */
    'digital-employee/expert-delegation': DigitalEmployeeExpertDelegationEvent
    /** Expert delegation rejected by inherited authority or scheduling limits. */
    'digital-employee/expert-authorization-denied': DigitalEmployeeExpertAuthorizationDeniedEvent
    /** Terminal one-shot expert output delivered to the parent. */
    'digital-employee/expert-result': DigitalEmployeeExpertResultEvent
    /** Exact accepted or rejected employee memory promotion decision. */
    'digital-employee/memory-decision': DigitalEmployeeMemoryDecisionEvent
  }
}

/** Provenance attached to task, Session, and long-term memory. */
export interface DigitalEmployeeMemoryProvenance {
  readonly sessionId: SessionId
  readonly expertId?: ExpertId
  readonly source: string
  readonly recordedAt: string
}

/** Employee-owned memory retained by a provider. */
export interface DigitalEmployeeMemoryRecord {
  readonly id: DigitalEmployeeMemoryId
  readonly employeeId: DigitalEmployeeInstanceId
  readonly scope: DigitalEmployeeMemoryScope
  readonly content: string
  readonly tags: readonly string[]
  readonly sensitive: boolean
  readonly expiresAt?: string
  readonly provenance: DigitalEmployeeMemoryProvenance
}

/** Task-local memory discarded with its owning task unless promoted. */
export interface DigitalEmployeeTaskMemoryRecord extends DigitalEmployeeMemoryRecord {
  readonly scope: 'task'
  readonly taskId: DigitalEmployeeTaskId
}

/** Session-local memory reconstructed with its owning Session. */
export interface DigitalEmployeeSessionMemoryRecord extends DigitalEmployeeMemoryRecord {
  readonly scope: 'session'
  readonly sessionId: SessionId
}

/** Employee-owned durable memory retained independently of one Session. */
export interface DigitalEmployeeLongTermMemoryRecord extends DigitalEmployeeMemoryRecord {
  readonly scope: 'long-term'
}

/** Structured candidate submitted for long-term memory policy review. */
export interface DigitalEmployeeMemoryCandidate {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly content: string
  readonly tags: readonly string[]
  readonly sensitive: boolean
  readonly retentionDays?: number
  readonly provenance: DigitalEmployeeMemoryProvenance
}

/** Outcome of reviewing one long-term memory candidate. */
export type DigitalEmployeeMemoryDecision =
  | { readonly kind: 'accepted'; readonly memory: DigitalEmployeeMemoryRecord }
  | { readonly kind: 'rejected'; readonly reason: string }

/** Attributed administrative or capability-use record. */
export interface DigitalEmployeeAuditRecord {
  readonly id: DigitalEmployeeAuditId
  readonly employeeId: DigitalEmployeeInstanceId
  readonly sessionId?: SessionId
  readonly agentId?: SessionId
  readonly expertId?: ExpertId
  readonly operationId?: DigitalEmployeeOperationId
  readonly category: 'lifecycle' | 'capability' | 'memory' | 'delegation'
  readonly action: string
  readonly outcome: 'succeeded' | 'denied' | 'failed'
  readonly occurredAt: string
  readonly metadata: Readonly<Record<string, string | number | boolean>>
}

/** Caller-authored attributable audit fact before provider identity and time assignment. */
export type AppendDigitalEmployeeAuditRequest = Omit<DigitalEmployeeAuditRecord, 'id' | 'occurredAt'>

/** Request to create an independent employee instance. */
export interface CreateDigitalEmployeeRequest {
  readonly templateId: DigitalEmployeeTemplateId
  readonly templateVersion: string
  readonly displayName: string
  readonly personality?: string
  readonly grants: DigitalEmployeeAuthority
}

/** Request selecting a target template version for upgrade review. */
export interface PreviewDigitalEmployeeUpgradeRequest {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly targetVersion: string
}

/** Declared capability changes between two exact template versions. */
export interface DigitalEmployeeCapabilityChanges {
  readonly skills: readonly string[]
  readonly tools: readonly string[]
  readonly mcpServers: readonly string[]
  readonly experts: readonly ExpertId[]
  readonly allowSubagents: boolean
}

/** Immutable review result produced before an employee upgrade. */
export interface DigitalEmployeeUpgradePreview {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly currentVersion: string
  readonly targetVersion: string
  readonly addedCapabilities: DigitalEmployeeCapabilityChanges
  readonly removedCapabilities: DigitalEmployeeCapabilityChanges
}

/** Request applying a reviewed upgrade and explicitly approved new grants. */
export interface ApplyDigitalEmployeeUpgradeRequest extends PreviewDigitalEmployeeUpgradeRequest {
  readonly approvedCapabilities: DigitalEmployeeAuthority
}

/** Request for a portable employee artifact. */
export interface ExportDigitalEmployeeRequest {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly includeMemory: boolean
}

/** Portable memory without employee, memory, credential, or Session identities. */
export interface PortableDigitalEmployeeMemory {
  readonly content: string
  readonly tags: readonly string[]
  readonly sensitive: boolean
  readonly expiresAt?: string
  readonly provenance: {
    readonly expertId?: ExpertId
    readonly source: string
    readonly recordedAt: string
  }
}

/** Versioned portable employee data containing no credentials or live Session state. */
export interface DigitalEmployeeExportArtifact {
  readonly formatVersion: 1
  readonly employee: {
    readonly templateId: DigitalEmployeeTemplateId
    readonly templateVersion: string
    readonly displayName: string
    readonly personality?: string
    readonly grants: DigitalEmployeeAuthority
  }
  readonly memories?: readonly PortableDigitalEmployeeMemory[]
}

/** Query for bounded relevant employee memory. */
export interface DigitalEmployeeMemoryQuery {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly text: string
  readonly scopes: readonly DigitalEmployeeMemoryScope[]
  readonly limit: number
}
