/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@qq296629801/cordis'
import commandsRemote from '@qq296629801/dsh-commands/remote'
import goalsRemote from '@qq296629801/dsh-goal/remote'
import dynamicRemote from '@qq296629801/dsh-cordis-host-runner/remote'
import fileReferencesRemote from '@qq296629801/dsh-file-reference/remote'
import companiesRemote from '@qq296629801/dsh-host-company-management/remote'
import companyGroupsRemote from '@qq296629801/dsh-host-company-group-chat/remote'
import digitalEmployeesRemote from '@qq296629801/dsh-host-digital-employee-management/remote'
import pluginInventoryRemote from '@qq296629801/dsh-host-plugin-inventory/remote'
import messageFeedbackRemote from '@qq296629801/dsh-message-feedback/remote'
import sessionReferencesRemote from '@qq296629801/dsh-session-reference/remote'
import skillMarketRemote from '@qq296629801/dsh-skill-market/remote'
import toolMarketRemote from '@qq296629801/dsh-tool-market/remote'
import mcpMarketRemote from '@qq296629801/dsh-mcp-market/remote'
import hookMarketRemote from '@qq296629801/dsh-hooks-market/remote'
import workflowMarketRemote from '@qq296629801/dsh-workflow-market/remote'
import subagentMarketRemote from '@qq296629801/dsh-subagent-market/remote'
import type { TypertClientRemote } from '@qq296629801/dsh-typert-protocol'

export type { TypertClientRemote as ClientRemote } from '@qq296629801/dsh-typert-protocol'
export type { PluginInventorySnapshot } from '@qq296629801/dsh-host-plugin-inventory/types'
export type {} from '@qq296629801/dsh-commands/remote'
export type {} from '@qq296629801/dsh-file-reference/remote'
export type {} from '@qq296629801/dsh-host-company-management/remote'
export type {} from '@qq296629801/dsh-host-company-group-chat/remote'
export type {} from '@qq296629801/dsh-goal/remote'
export type {} from '@qq296629801/dsh-host-digital-employee-management/remote'
export type {} from '@qq296629801/dsh-host-plugin-inventory/remote'
export type {} from '@qq296629801/dsh-message-feedback/remote'
export type {} from '@qq296629801/dsh-session-reference/remote'
export type {} from '@qq296629801/dsh-skill-market/remote'
export type {} from '@qq296629801/dsh-tool-market/remote'
export type {} from '@qq296629801/dsh-mcp-market/remote'
export type {} from '@qq296629801/dsh-hooks-market/remote'
export type {} from '@qq296629801/dsh-workflow-market/remote'
export type {} from '@qq296629801/dsh-subagent-market/remote'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@qq296629801/dsh-commands/types'
export type {} from '@qq296629801/dsh-cordis-host-runner/types'
export type {} from '@qq296629801/dsh-credentials/types'
export type {} from '@qq296629801/dsh-llm/types'
export type {} from '@qq296629801/dsh-agent-presets/types'
export type {} from '@qq296629801/dsh-settings/types'

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
} from '@qq296629801/dsh-client-connection/client'
export type {} from '@qq296629801/dsh-api-gateway/client'
export type {} from '@qq296629801/dsh-cordis-host-runner/remote'

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
} from '@qq296629801/dsh-cordis-host-runner/types'
// The JSON vocabulary those payloads are built from, re-exported for the same
// reason: a Client contribution names what it sends without importing a Host
// package, and this assembly is where both planes legitimately meet.
export type { JsonValue } from '@qq296629801/dsh-session/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@qq296629801/dsh-file-reference/types'
export type { SessionReferenceMentionCandidate } from '@qq296629801/dsh-session-reference/types'
export type * from '@qq296629801/dsh-digital-employee/types'
export type {
  AddDepartmentRequest,
  AssignEmployeeRequest,
  CompanyBusyKind,
  CompanyCandidateEmployee,
  CompanyFloor,
  CompanyFloorGroup,
  CompanyFloorMember,
  CompanyId,
  CompanyIdRequest,
  CompanyPromoImageRef,
  CompanyPromoImageUpload,
  CompanyPromoImageValue,
  CompanyRecord,
  CreateCompanyRequest,
  DeleteDepartmentRequest,
  DepartmentId,
  DepartmentRecord,
  EmployeeBinding,
  RenameDepartmentRequest,
  ReorderDepartmentsRequest,
  SetCompanyPromoImageRequest,
  UnassignEmployeeRequest,
  UpdateCompanyRequest,
} from '@qq296629801/dsh-company/types'
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
} from '@qq296629801/dsh-host-digital-employee-management/types'
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
} from '@qq296629801/dsh-skill-market/types'
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
} from '@qq296629801/dsh-tool-market/types'
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
} from '@qq296629801/dsh-mcp-market/types'
export type {
  WorkflowMarketEntry,
  WorkflowMarketFailure,
  WorkflowMarketInstallRequest,
  WorkflowMarketInstallResult,
  WorkflowMarketListResult,
  WorkflowMarketPackageId,
  WorkflowMarketUninstallRequest,
  WorkflowMarketUninstallResult,
} from '@qq296629801/dsh-workflow-market/types'
export type {
  SubagentMarketEntry,
  SubagentMarketFailure,
  SubagentMarketInstallRequest,
  SubagentMarketInstallResult,
  SubagentMarketListResult,
  SubagentMarketPackageId,
  SubagentMarketUninstallRequest,
  SubagentMarketUninstallResult,
} from '@qq296629801/dsh-subagent-market/types'
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
} from '@qq296629801/dsh-hooks-market/types'

declare module '@qq296629801/cordis' {
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
      digitalEmployeesRemote, companiesRemote, companyGroupsRemote, pluginInventoryRemote, messageFeedbackRemote,
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
