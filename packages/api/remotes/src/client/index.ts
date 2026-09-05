/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@deepseek-ai/cordis'
import commandsRemote from '@deepseek-ai/dsh-commands/remote'
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
import dynamicRemote from '@deepseek-ai/dsh-cordis-host-runner/remote'
import fileReferencesRemote from '@deepseek-ai/dsh-file-reference/remote'
import digitalEmployeesRemote from '@deepseek-ai/dsh-host-digital-employee-management/remote'
import pluginInventoryRemote from '@deepseek-ai/dsh-host-plugin-inventory/remote'
import messageFeedbackRemote from '@deepseek-ai/dsh-message-feedback/remote'
import sessionReferencesRemote from '@deepseek-ai/dsh-session-reference/remote'
import skillMarketRemote from '@deepseek-ai/dsh-skill-market/remote'
import toolMarketRemote from '@deepseek-ai/dsh-tool-market/remote'
import mcpMarketRemote from '@deepseek-ai/dsh-mcp-market/remote'
import hookMarketRemote from '@deepseek-ai/dsh-hooks-market/remote'
import workflowMarketRemote from '@deepseek-ai/dsh-workflow-market/remote'
import subagentMarketRemote from '@deepseek-ai/dsh-subagent-market/remote'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'

export type { TypertClientRemote as ClientRemote } from '@deepseek-ai/dsh-typert-protocol'
export type { PluginInventorySnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'
export type {} from '@deepseek-ai/dsh-commands/remote'
export type {} from '@deepseek-ai/dsh-file-reference/remote'
export type {} from '@deepseek-ai/dsh-goal/remote'
export type {} from '@deepseek-ai/dsh-host-digital-employee-management/remote'
export type {} from '@deepseek-ai/dsh-host-plugin-inventory/remote'
export type {} from '@deepseek-ai/dsh-message-feedback/remote'
export type {} from '@deepseek-ai/dsh-session-reference/remote'
export type {} from '@deepseek-ai/dsh-skill-market/remote'
export type {} from '@deepseek-ai/dsh-tool-market/remote'
export type {} from '@deepseek-ai/dsh-mcp-market/remote'
export type {} from '@deepseek-ai/dsh-hooks-market/remote'
export type {} from '@deepseek-ai/dsh-workflow-market/remote'
export type {} from '@deepseek-ai/dsh-subagent-market/remote'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@deepseek-ai/dsh-commands/types'
export type {} from '@deepseek-ai/dsh-cordis-host-runner/types'
export type {} from '@deepseek-ai/dsh-credentials/types'
export type {} from '@deepseek-ai/dsh-llm/types'
export type {} from '@deepseek-ai/dsh-agent-presets/types'
export type {} from '@deepseek-ai/dsh-settings/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ClientResponse, ConfigurableProviderView, ConnectionHandle, ConnectionSinks, ContentBlock,
  CredentialView, DirectoryListing, DiscoveredModelView, HistoryEntry, HostFrame, IApiClient,
  MessageId, ModelCatalogFailure, ModelProviderGroup, ModelReasoningEffort, ModelSelection,
  MuxFrame, PromptContentPart, QuestionResponsePayload, QueueAction, RpcError, RpcId, RpcReceipt,
  RpcRequest, RpcResponse, RpcResult, SessionId, SessionModels, SessionSearchItem,
  SessionSummary, SettingsNamespaceView, SettingsPathOpView, SkillEntry, StreamChunk,
  SubagentAddress, SubagentCatalog, JobView, ToolCallView, ToolEventView, ToolResultView,
  WorkspaceId, WorkspaceView,
} from '@deepseek-ai/dsh-client-connection/client'
export type {} from '@deepseek-ai/dsh-api-gateway/client'
export type {} from '@deepseek-ai/dsh-cordis-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@deepseek-ai/dsh-cordis-host-runner/types'
// The JSON vocabulary those payloads are built from, re-exported for the same
// reason: a Client contribution names what it sends without importing a Host
// package, and this assembly is where both planes legitimately meet.
export type { JsonValue } from '@deepseek-ai/dsh-session/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference/types'
export type { SessionReferenceMentionCandidate } from '@deepseek-ai/dsh-session-reference/types'
export type * from '@deepseek-ai/dsh-digital-employee/types'
export type {
  DigitalEmployeeDeleteMemoryRequest,
  DigitalEmployeeConfigurationAuthority,
  DigitalEmployeeConfigurationAsset,
  DigitalEmployeeConfigurationAssetCatalog,
  DigitalEmployeeConfigurationDelegation,
  DigitalEmployeeConfigurationDiagnostic,
  DigitalEmployeeConfigurationExpert,
  DigitalEmployeeConfigurationMemorySeed,
  DigitalEmployeeConfigurationMcpServer,
  DigitalEmployeeExpertContinueContent,
  DigitalEmployeeExpertContinueRequest,
  DigitalEmployeeExpertControlRequest,
  DigitalEmployeeIdentityRequest,
  DigitalEmployeeTemplateDraft,
  DigitalEmployeeTemplateDraftId,
  DigitalEmployeeTemplateDraftIdentityRequest,
  DigitalEmployeeTemplateDraftValidation,
  DigitalEmployeeTemplatePreview,
  CreateDigitalEmployeeTemplateDraftRequest,
  DisposeDigitalEmployeeTemplatePreviewRequest,
  PreviewDigitalEmployeeTemplateDraftRequest,
  PublishDigitalEmployeeTemplateDraftRequest,
  UpdateDigitalEmployeeTemplateDraftRequest,
  DigitalEmployeeTemplatePublication,
  DigitalEmployeeStartChatContent,
  DigitalEmployeeStartChatImageContent,
  DigitalEmployeeStartChatRequest,
  DigitalEmployeeStartChatTextContent,
  DigitalEmployeeStartChatValue,
  DigitalEmployeeTaskTreeEntry,
  DigitalEmployeeTaskTreeRequest,
} from '@deepseek-ai/dsh-host-digital-employee-management/types'
export type {
  SkillMarketBannerMediaType,
  SkillMarketBannerRequest,
  SkillMarketBannerResult,
  SkillMarketBannerValue,
  SkillMarketEntry,
  SkillMarketFailure,
  SkillMarketInstallRequest,
  SkillMarketInstallResult,
  SkillMarketInstallValue,
  SkillMarketListResult,
  SkillMarketListValue,
  SkillMarketManifestVersion,
  SkillMarketResult,
  SkillMarketSkillId,
  SkillMarketUninstallRequest,
  SkillMarketUninstallResult,
  SkillMarketUninstallValue,
} from '@deepseek-ai/dsh-skill-market/types'
export type {
  ToolMarketEntry,
  ToolMarketFailure,
  ToolMarketInstallRequest,
  ToolMarketInstallResult,
  ToolMarketListResult,
  ToolMarketPackageId,
  ToolMarketToolEntry,
  ToolMarketUninstallRequest,
  ToolMarketUninstallResult,
} from '@deepseek-ai/dsh-tool-market/types'
export type {
  McpDirectConfigDeclaration,
  McpDirectConfigDeleteRequest,
  McpDirectConfigDeleteResult,
  McpDirectConfigEntryId,
  McpDirectConfigSaveRequest,
  McpDirectConfigSaveResult,
  McpMarketConfigureRequest,
  McpMarketConfigureResult,
  McpMarketCredentialRequirement,
  McpMarketEntry,
  McpMarketFailure,
  McpMarketInstallRequest,
  McpMarketInstallResult,
  McpMarketListResult,
  McpMarketPackageId,
  McpMarketServerEntry,
  McpMarketUninstallRequest,
  McpMarketUninstallResult,
} from '@deepseek-ai/dsh-mcp-market/types'
export type {
  WorkflowMarketEntry,
  WorkflowMarketFailure,
  WorkflowMarketInstallRequest,
  WorkflowMarketInstallResult,
  WorkflowMarketListResult,
  WorkflowMarketPackageId,
  WorkflowMarketUninstallRequest,
  WorkflowMarketUninstallResult,
} from '@deepseek-ai/dsh-workflow-market/types'
export type {
  SubagentMarketEntry,
  SubagentMarketFailure,
  SubagentMarketInstallRequest,
  SubagentMarketInstallResult,
  SubagentMarketListResult,
  SubagentMarketPackageId,
  SubagentMarketUninstallRequest,
  SubagentMarketUninstallResult,
} from '@deepseek-ai/dsh-subagent-market/types'
export type {
  HookMarketConfigureRequest,
  HookMarketConfigureResult,
  HookMarketCredentialRequirement,
  HookMarketEntry,
  HookMarketFailure,
  HookMarketInstallRequest,
  HookMarketInstallResult,
  HookMarketListResult,
  HookMarketPackageId,
  HookMarketUninstallRequest,
  HookMarketUninstallResult,
} from '@deepseek-ai/dsh-hooks-market/types'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: TypertClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      commandsRemote, goalsRemote, dynamicRemote, fileReferencesRemote,
      digitalEmployeesRemote, pluginInventoryRemote, messageFeedbackRemote,
      sessionReferencesRemote, skillMarketRemote, toolMarketRemote, mcpMarketRemote,
      hookMarketRemote, workflowMarketRemote, subagentMarketRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
