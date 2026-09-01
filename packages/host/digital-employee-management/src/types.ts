/** Client-safe digital employee management requests and results. */

import type { EncodedImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Browser-safe employee instance identity, structurally shared with the owning service. */
export type DigitalEmployeeInstanceId = Branded<'DigitalEmployeeInstanceId'>
/** Browser-safe employee memory identity, structurally shared with the owning service. */
export type DigitalEmployeeMemoryId = Branded<'DigitalEmployeeMemoryId'>
/** Browser-safe employee chat-submission identity, structurally shared with the owning service. */
export type DigitalEmployeeSubmissionId = Branded<'DigitalEmployeeSubmissionId'>
/** Browser-safe workspace identity, structurally shared with the owning service. */
export type WorkspaceId = Branded<'WorkspaceId'>
/** Browser-safe identity of one unpublished configuration-studio draft. */
export type DigitalEmployeeTemplateDraftId = Branded<'DigitalEmployeeTemplateDraftId'>
/** Browser-safe identity of one selectable template capability. */
export type DigitalEmployeeConfigurationAssetId = Branded<'DigitalEmployeeConfigurationAssetId'>

/** An installed capability that an administrator can select for a template. */
export interface DigitalEmployeeConfigurationAsset {
  /** Stable asset identity within its capability class. */
  readonly id: DigitalEmployeeConfigurationAssetId
  /** Capability class stored by the template. */
  readonly kind: 'skill' | 'tool' | 'mcp'
  /** Human-readable label. */
  readonly label: string
  /** Optional capability description. */
  readonly description?: string
  /** Whether the current Host can compose the capability. */
  readonly available: boolean
  /** Registry or marketplace source of this capability. */
  readonly source: string
  /** Installed package version when known. */
  readonly version?: string | undefined
  /** Trusted publisher identity when marketplace-managed. */
  readonly publisher?: string | undefined
  /** Marketplace tags shown to administrators when available. */
  readonly tags?: readonly string[] | undefined
  /** Whether installation lifecycle is owned by a marketplace. */
  readonly managedByMarket?: boolean | undefined
  /** Permission, credential, or input summaries shown before authorization. */
  readonly permissionSummary: readonly string[]
  /** Whether a fresh Host is required before this capability becomes available. */
  readonly restartRequired: boolean
  /** Availability explanation without Host paths or credential values. */
  readonly diagnostic?: string | undefined
  /** Safe managed MCP declaration persisted when this asset is selected. */
  readonly mcpServer?: DigitalEmployeeConfigurationMcpServer | undefined
}

/** Administrator-visible selectable configuration assets. */
export interface DigitalEmployeeConfigurationAssetCatalog {
  /** Entries ordered by capability class and label. */
  readonly entries: readonly DigitalEmployeeConfigurationAsset[]
}

/** Selected Agent preset whose scoped capabilities are inspected. @typert schema */
export interface ListDigitalEmployeeConfigurationAssetsRequest {
  /** Agent preset selected by the draft being edited. */
  readonly preset: string
}

/** Browser-safe explicit capability set. */
export interface DigitalEmployeeConfigurationAuthority {
  readonly skills: string[]
  readonly tools: string[]
  readonly mcpServers: string[]
  readonly experts: string[]
  readonly allowSubagents: boolean
}

/** Browser-safe delegation limits. */
export interface DigitalEmployeeConfigurationDelegation {
  readonly maxDepth: number
  readonly maxConcurrency: number
  readonly timeoutMs: number
}

/** Browser-safe MCP server declaration containing references but never values. */
export type DigitalEmployeeConfigurationMcpServer =
  | {
    readonly id: string
    readonly transport: 'stdio'
    readonly command: string
    readonly args: string[]
    readonly env: Record<string, string>
    readonly envCredentials: Record<string, string>
    readonly cwd: string
    readonly toolCallTimeoutMs?: number
    readonly failOnStartupError?: boolean
  }
  | {
    readonly id: string
    readonly transport: 'streamable-http'
    readonly url: string
    readonly headers: Record<string, string>
    readonly headerCredentials: Record<string, string>
    readonly toolCallTimeoutMs?: number
    readonly failOnStartupError?: boolean
  }

/** Browser-safe expert definition authored in a configuration draft. */
export interface DigitalEmployeeConfigurationExpert {
  readonly id: string
  readonly name: string
  readonly responsibility: string
  /** Expert instructions authored in the private studio document. */
  readonly instructions: string
  readonly modelSettings: { readonly provider?: string; readonly model?: string; readonly maxTokens?: number }
  readonly capabilities: DigitalEmployeeConfigurationAuthority
  readonly memoryAccess: ('task' | 'session' | 'long-term')[]
  readonly delegation: {
    readonly mode: 'one-shot' | 'continuable'
    readonly maxDepth: number
    readonly maxConcurrency: number
    readonly timeoutMs: number
  }
}

/** Credential-free long-term memory written when an employee is created from a local publication. */
export interface DigitalEmployeeConfigurationMemorySeed {
  readonly content: string
  readonly tags: string[]
  readonly sensitive: boolean
  readonly retentionDays?: number
}

/** Client-safe metadata for an unpublished employee template draft. */
export interface DigitalEmployeeTemplateDraft {
  /** Stable draft identity. */
  readonly id: DigitalEmployeeTemplateDraftId
  /** Intended stable employee template identifier. */
  readonly templateId: string
  /** Display metadata shown before publication. */
  readonly display: {
    readonly name: string
    readonly description: string
    readonly banner?: string
  }
  /** Main Agent instructions supplied by the administrator. */
  readonly instructions: string
  /** Personality text composed with the main Agent instructions. */
  readonly personality: string
  /** Existing preset used to compose the employee Agent. */
  readonly preset: string
  /** Explicitly authorized capabilities. */
  readonly capabilities: DigitalEmployeeConfigurationAuthority
  /** Referenced MCP client declarations without resolved credentials. */
  readonly mcpServers: readonly DigitalEmployeeConfigurationMcpServer[]
  /** Expert Agent definitions constrained by the root authority. */
  readonly experts: readonly DigitalEmployeeConfigurationExpert[]
  /** Long-term memory records written when an employee is created from this publication. */
  readonly memorySeeds: readonly DigitalEmployeeConfigurationMemorySeed[]
  /** Root delegation policy. */
  readonly delegation: DigitalEmployeeConfigurationDelegation
  /** Monotonic revision used to prevent stale preview or publication. */
  readonly revision: number
  /** ISO-8601 creation instant. */
  readonly createdAt: string
  /** ISO-8601 last-mutation instant. */
  readonly updatedAt: string
}

/** Administrator input that creates one unpublished employee template draft. @typert schema */
export interface CreateDigitalEmployeeTemplateDraftRequest {
  /** Intended stable employee template identifier. */
  readonly templateId: string
  /** Display metadata shown before publication. */
  readonly display: {
    readonly name: string
    readonly description: string
    readonly banner?: string
  }
  /** Main Agent instructions supplied by the administrator. */
  readonly instructions: string
  /** Personality text composed with the main Agent instructions. */
  readonly personality?: string
  /** Existing preset used to compose the employee Agent; omission selects the deployment default. */
  readonly preset?: string
  /** Explicitly authorized capabilities. */
  readonly capabilities?: DigitalEmployeeConfigurationAuthority
  /** Referenced MCP client declarations without resolved credentials. */
  readonly mcpServers?: DigitalEmployeeConfigurationMcpServer[]
  /** Expert Agent definitions constrained by the root authority. */
  readonly experts?: DigitalEmployeeConfigurationExpert[]
  /** Long-term memory records written when an employee is created from this publication. */
  readonly memorySeeds?: DigitalEmployeeConfigurationMemorySeed[]
  /** Root delegation policy. */
  readonly delegation?: DigitalEmployeeConfigurationDelegation
}

/** Request identifying one unpublished configuration-studio draft. @typert schema */
export interface DigitalEmployeeTemplateDraftIdentityRequest {
  /** Stable draft identity. */
  readonly draftId: DigitalEmployeeTemplateDraftId
}

/** Revision-guarded replacement fields for one unpublished template draft. @typert schema */
export interface UpdateDigitalEmployeeTemplateDraftRequest extends DigitalEmployeeTemplateDraftIdentityRequest {
  /** Revision observed by the administrator before editing. */
  readonly revision: number
  /** Changed draft fields; omitted fields retain their current values. */
  readonly patch: {
    readonly templateId?: string
    readonly display?: { readonly name: string; readonly description: string; readonly banner?: string }
    readonly instructions?: string
    readonly personality?: string
    readonly preset?: string
    readonly capabilities?: DigitalEmployeeConfigurationAuthority
    readonly mcpServers?: DigitalEmployeeConfigurationMcpServer[]
    readonly experts?: DigitalEmployeeConfigurationExpert[]
    readonly memorySeeds?: DigitalEmployeeConfigurationMemorySeed[]
    readonly delegation?: DigitalEmployeeConfigurationDelegation
  }
}

/** Revision-guarded request to publish an immutable local template version. @typert schema */
export interface PublishDigitalEmployeeTemplateDraftRequest extends DigitalEmployeeTemplateDraftIdentityRequest {
  /** Validated current draft revision to publish. */
  readonly revision: number
}

/** Client-safe immutable local publication record. */
export interface DigitalEmployeeTemplatePublication {
  readonly templateId: string
  readonly version: string
  readonly draftId: DigitalEmployeeTemplateDraftId
  readonly draftRevision: number
  readonly publishedAt: string
}

/** Revision-guarded request for an isolated configuration preview. @typert schema */
export interface PreviewDigitalEmployeeTemplateDraftRequest extends DigitalEmployeeTemplateDraftIdentityRequest {
  /** Validated draft revision to compose. */
  readonly revision: number
  /** Workspace supplying the preview Session cwd. */
  readonly workspaceId: WorkspaceId
}

/** Temporary preview ownership data, never included in durable employee exports. */
export interface DigitalEmployeeTemplatePreview {
  /** Ephemeral preview identity. */
  readonly id: string
  /** Draft identity composed for the preview. */
  readonly draftId: DigitalEmployeeTemplateDraftId
  /** Immutable draft revision composed for the preview. */
  readonly revision: number
  /** Preview Session identity. */
  readonly sessionId: SessionId
  /** Whether cleanup has completed. */
  readonly state: 'active' | 'disposed'
}

/** Request that terminates one active local configuration preview. @typert schema */
export interface DisposeDigitalEmployeeTemplatePreviewRequest {
  /** Ephemeral preview identity returned from preview creation. */
  readonly previewId: string
}

/** One actionable configuration-studio validation finding. */
export interface DigitalEmployeeConfigurationDiagnostic {
  /** Stable diagnostic category for clients to render. */
  readonly code: string
  /** Dot-delimited draft field that requires administrator attention. */
  readonly path: string
  /** Administrator-facing explanation without credential values. */
  readonly message: string
}

/** Validation result bound to one exact draft revision. */
export interface DigitalEmployeeTemplateDraftValidation {
  /** Draft revision that was inspected. */
  readonly revision: number
  /** All known configuration problems, empty when the draft is valid. */
  readonly diagnostics: readonly DigitalEmployeeConfigurationDiagnostic[]
}

/** Request identifying one digital employee. @typert schema */
export interface DigitalEmployeeIdentityRequest {
  readonly employeeId: DigitalEmployeeInstanceId
}

/** Text accepted in the first employee-chat user message. */
export interface DigitalEmployeeStartChatTextContent {
  readonly type: 'text'
  readonly text: string
}

/** Browser-uploaded image admitted before the first employee-chat message is published. */
export interface DigitalEmployeeStartChatImageContent extends EncodedImageAttachment {
  readonly type: 'image'
}

/** First-message content accepted for a digital employee chat. */
export type DigitalEmployeeStartChatContent =
  | DigitalEmployeeStartChatTextContent
  | DigitalEmployeeStartChatImageContent

/** Request atomically starting one employee-owned chat. @typert schema */
export interface DigitalEmployeeStartChatRequest extends DigitalEmployeeIdentityRequest {
  /** Workspace that owns the new employee Session and supplies its cwd. */
  readonly workspaceId: WorkspaceId
  /** Caller-generated identity reserved for the accepted root Session. */
  readonly sessionId: SessionId
  /** Idempotency identity for one complete submission attempt. */
  readonly submissionId: DigitalEmployeeSubmissionId
  /** Non-empty text or image content admitted as the first user message. */
  readonly content: DigitalEmployeeStartChatContent[]
}

/** Request deleting one memory owned by an employee. @typert schema */
export interface DigitalEmployeeDeleteMemoryRequest extends DigitalEmployeeIdentityRequest {
  readonly memoryId: DigitalEmployeeMemoryId
}

/** Request selecting a root Session whose descendants are listed. @typert schema */
export interface DigitalEmployeeTaskTreeRequest {
  readonly rootSessionId: SessionId
}

/** Client-safe task tree entry for expert and generic subagent descendants. */
export type DigitalEmployeeTaskTreeEntry =
  | {
    readonly kind: 'child'
    readonly id: SessionId
    readonly activity: 'running' | 'inactive'
    readonly hasChildren: boolean
    readonly mode: 'one-shot'
    readonly label?: string
    readonly parentId: SessionId
    readonly depth: number
  }
  | {
    readonly kind: 'child'
    readonly id: SessionId
    readonly activity: 'running' | 'inactive'
    readonly hasChildren: boolean
    readonly mode: 'continuable'
    readonly label: string
    readonly parentId: SessionId
    readonly depth: number
  }
  | {
    readonly kind: 'diagnostic'
    readonly id: SessionId
    readonly reason: 'corrupt' | 'unsupported' | 'unavailable'
    readonly parentId: SessionId
    readonly depth: number
  }

/** Request controlling one direct expert child through its live parent. @typert schema */
export interface DigitalEmployeeExpertControlRequest {
  readonly parentSessionId: SessionId
  readonly childSessionId: SessionId
}

/** Request continuing one expert child with user text. @typert schema */
export interface DigitalEmployeeExpertContinueRequest extends DigitalEmployeeExpertControlRequest {
  readonly content: DigitalEmployeeExpertContinueContent[]
}

/** Text content accepted for an expert continuation over the management wire. */
export interface DigitalEmployeeExpertContinueContent {
  readonly type: 'text'
  readonly text: string
}

/** Accepted employee-owned chat and first-message identity. */
export interface DigitalEmployeeStartChatValue {
  readonly sessionId: SessionId
  readonly submissionId: DigitalEmployeeSubmissionId
  readonly messageId: MessageId
}
