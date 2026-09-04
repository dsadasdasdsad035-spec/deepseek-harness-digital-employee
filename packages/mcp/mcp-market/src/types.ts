/** Client-safe MCP marketplace requests, inventory, and declared failures. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one managed MCP package. */
export type McpMarketPackageId = Branded<'McpMarketPackageId'>

/** Stable identity of one user-declared direct MCP configuration entry. */
export type McpDirectConfigEntryId = Branded<'McpDirectConfigEntryId'>

/** Where an inventory entry's servers come from. */
export type McpMarketEntrySource = 'direct' | 'package'

/** Credential slot state without a resolved value. */
export interface McpMarketCredentialRequirement {
  readonly slot: string
  readonly reference?: string | undefined
  readonly configured: boolean
  readonly source?: string | undefined
}

/** One declared server in a managed MCP package. */
export interface McpMarketServerEntry {
  readonly serverName: string
  readonly transport: 'streamable-http' | 'stdio'
  readonly available: boolean
}

/** One managed MCP package. */
export interface McpMarketEntry {
  readonly packageId: McpMarketPackageId
  /** Whether the servers behind this entry are packaged or user-declared. */
  readonly source: McpMarketEntrySource
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly publisherId: string
  readonly servers: readonly McpMarketServerEntry[]
  readonly permissions: readonly string[]
  readonly credentialRequirements: readonly McpMarketCredentialRequirement[]
  readonly installedAt: number
  readonly configured: boolean
  readonly available: boolean
  readonly restartRequired: boolean
  /** Direct entries only: the credential-free declaration for editing. */
  readonly declaration?: McpDirectConfigDeclaration | undefined
  readonly diagnostic?: string | undefined
}

/** Host-internal credential-free declaration safe to persist in a template draft. */
export interface McpMarketTemplateConfiguration {
  readonly packageId: McpMarketPackageId
  readonly serverName: string
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly publisherId: string
  readonly available: boolean
  readonly restartRequired: boolean
  readonly declaration: McpMarketTemplateDeclaration
}

/**
 * Credential-free server declaration mirroring the employee-template MCP
 * declaration union: fixed values plus credential reference names, never
 * resolved values.
 */
export type McpMarketTemplateDeclaration =
  | {
    readonly id: string
    readonly transport: 'stdio'
    readonly command: string
    readonly args: string[]
    readonly env: Readonly<Record<string, string>>
    readonly envCredentials: Readonly<Record<string, string>>
    readonly cwd: string
  }
  | {
    readonly id: string
    readonly transport: 'streamable-http'
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
    readonly headerCredentials: Readonly<Record<string, string>>
  }

/**
 * Credential-free server declaration for one user-declared direct MCP
 * configuration: fixed values plus credential reference names, never resolved
 * values. Unlike packaged stdio servers, arguments may name absolute paths on
 * the user's disk — the user vouches for the entry directly.
 */
export type McpDirectConfigDeclaration =
  | {
    readonly transport: 'stdio'
    readonly command: string
    readonly args: readonly string[]
    readonly env: Readonly<Record<string, string>>
    /** Environment variable name to credential reference name. */
    readonly envCredentials: Readonly<Record<string, string>>
    readonly cwd: string
  }
  | {
    readonly transport: 'streamable-http'
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
    /** Header name to credential reference name. */
    readonly headerCredentials: Readonly<Record<string, string>>
  }

/** Create-or-update request for one user-declared MCP server configuration. */
export interface McpDirectConfigSaveRequest {
  /** Existing entry identity; omission creates a new entry. */
  readonly entryId?: McpDirectConfigEntryId | undefined
  readonly serverName: string
  readonly declaration: McpDirectConfigDeclaration
  /** Explicit user confirmation for stdio declarations that execute local code. */
  readonly confirmLocalExecution?: boolean
}

/** Request to remove one user-declared MCP server configuration. */
export interface McpDirectConfigDeleteRequest {
  readonly entryId: McpDirectConfigEntryId
}

/** Save response for one direct MCP configuration entry. */
export type McpDirectConfigSaveResult = McpMarketResult<{
  readonly entryId: McpDirectConfigEntryId
  readonly serverName: string
  readonly restartRequired: false
}>

/** Delete response for one direct MCP configuration entry. */
export type McpDirectConfigDeleteResult = McpMarketResult<{
  readonly entryId: McpDirectConfigEntryId
  readonly restartRequired: false
}>

/** Uploaded MCP ZIP and explicit replacement intent. */
export interface McpMarketInstallRequest {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting?: boolean
  /** Explicit user confirmation for packages that execute local subprocess code. */
  readonly confirmLocalExecution?: boolean
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
  | {
    /** Install retry must carry explicit confirmation after presenting the disclosure. */
    readonly code: 'local-execution-confirmation-required'
    readonly candidatePermissions: readonly string[]
  }
  | { readonly code: 'unmanaged-conflict' | 'manifest-incompatible' | 'not-found'; readonly packageId: McpMarketPackageId }
  | { readonly code: 'invalid-credential-reference'; readonly slot: string }
  | { readonly code: 'missing-credential-reference'; readonly slot: string }
  | {
    /** A direct-config save was refused before any mutation or mount. */
    readonly code: 'invalid-direct-config'
    readonly reason: string
  }
  | {
    /** A server name is held by a direct entry or a managed package. */
    readonly code: 'direct-config-conflict'
    readonly serverName: string
    readonly heldBy: 'direct' | 'package'
    readonly holderId: string
  }

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
