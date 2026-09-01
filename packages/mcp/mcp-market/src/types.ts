/** Client-safe MCP marketplace requests, inventory, and declared failures. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one managed MCP package. */
export type McpMarketPackageId = Branded<'McpMarketPackageId'>

/** Credential slot state without a resolved value. */
export interface McpMarketCredentialRequirement {
  readonly slot: string
  readonly reference?: string | undefined
  readonly configured: boolean
  readonly source?: string | undefined
}

/** Host-owned non-secret endpoint slot state. */
export interface McpMarketEndpointRequirement {
  readonly slot: string
  readonly url?: string | undefined
  readonly configured: boolean
}

/** One declared server in a managed MCP package. */
export interface McpMarketServerEntry {
  readonly serverName: string
  readonly transport: 'streamable-http'
  readonly available: boolean
}

/** One managed MCP package. */
export interface McpMarketEntry {
  readonly packageId: McpMarketPackageId
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly publisherId: string
  readonly servers: readonly McpMarketServerEntry[]
  readonly endpointRequirements: readonly McpMarketEndpointRequirement[]
  readonly credentialRequirements: readonly McpMarketCredentialRequirement[]
  readonly installedAt: number
  readonly configured: boolean
  readonly available: boolean
  readonly restartRequired: boolean
  readonly diagnostic?: string | undefined
}

/** Host-internal declaration safe to persist in a template draft; credential-owned headers appear only in `headerCredentials`. */
export interface McpMarketTemplateConfiguration {
  readonly packageId: McpMarketPackageId
  readonly serverName: string
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly publisherId: string
  readonly available: boolean
  readonly restartRequired: boolean
  readonly declaration: {
    readonly id: string
    readonly transport: 'streamable-http'
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
    readonly headerCredentials: Readonly<Record<string, string>>
  }
}

/** Uploaded MCP ZIP and explicit replacement intent. */
export interface McpMarketInstallRequest {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting?: boolean
}

/** Credential-reference configuration for one managed package. */
export interface McpMarketConfigureRequest {
  readonly packageId: McpMarketPackageId
  readonly credentialReferences: Readonly<Record<string, string>>
}

/** Request to remove one managed MCP package. */
export interface McpMarketUninstallRequest {
  readonly packageId: McpMarketPackageId
}

/** Declared MCP marketplace business failure. */
export type McpMarketFailure =
  | { readonly code: 'invalid-archive'; readonly reason: 'base64' | 'zip' }
  | {
    readonly code: 'resource-limit'
    readonly limit: 'archive-bytes' | 'file-count' | 'entry-bytes' | 'total-bytes'
    readonly limitValue: number
    readonly observedValue: number
    readonly entry?: string | undefined
  }
  | { readonly code: 'invalid-package'; readonly reason: string }
  | { readonly code: 'untrusted-publisher' | 'invalid-signature'; readonly publisherId: string }
  | {
    readonly code: 'managed-upgrade-required'
    readonly packageId: McpMarketPackageId
    readonly installedVersion: string
    readonly candidateVersion: string
  }
  | { readonly code: 'unmanaged-conflict' | 'manifest-incompatible' | 'not-found'; readonly packageId: McpMarketPackageId }
  | { readonly code: 'invalid-credential-reference'; readonly slot: string }
  | { readonly code: 'missing-credential-reference'; readonly slot: string }

/** Declared business result. */
export type McpMarketResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: McpMarketFailure }

/** Inventory response for managed MCP packages. */
export type McpMarketListResult = McpMarketResult<{ readonly entries: readonly McpMarketEntry[] }>
/** Install or upgrade response for one managed MCP package. */
export type McpMarketInstallResult = McpMarketResult<{
  readonly packageId: McpMarketPackageId
  readonly operation: 'installed' | 'upgraded'
  readonly restartRequired: true
}>
/** Credential-reference configuration response for one managed MCP package. */
export type McpMarketConfigureResult = McpMarketResult<{
  readonly packageId: McpMarketPackageId
  readonly credentialReferences: Readonly<Record<string, string>>
  readonly restartRequired: true
}>
/** Uninstall response for one managed MCP package. */
export type McpMarketUninstallResult = McpMarketResult<{
  readonly packageId: McpMarketPackageId
  readonly restartRequired: true
}>
