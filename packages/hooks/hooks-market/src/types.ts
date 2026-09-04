/** Client-safe hook marketplace requests, inventory, and declared failures. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { HookEvent } from '@deepseek-ai/dsh-marketplace-core'

/** Stable identity of one managed hook package. */
export type HookMarketPackageId = Branded<'HookMarketPackageId'>

/** Credential slot state without a resolved value. */
export interface HookMarketCredentialRequirement {
  readonly slot: string
  readonly reference?: string | undefined
  readonly configured: boolean
  readonly source?: string | undefined
}

/** One declared hook in a managed hook package, credential-free. */
export interface HookMarketHookEntry {
  readonly id: string
  readonly event: HookEvent
  readonly matcher?: string | undefined
  readonly invocable: boolean
  readonly available: boolean
}

/** One managed hook package. */
export interface HookMarketEntry {
  readonly packageId: HookMarketPackageId
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly publisherId: string
  readonly hooks: readonly HookMarketHookEntry[]
  readonly permissions: readonly string[]
  readonly credentialRequirements: readonly HookMarketCredentialRequirement[]
  readonly installedAt: number
  readonly configured: boolean
  readonly available: boolean
  readonly restartRequired: boolean
  readonly diagnostic?: string | undefined
}

/** Uploaded hook ZIP and explicit replacement intent. */
export interface HookMarketInstallRequest {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting?: boolean
  /** Explicit user confirmation for packages that execute local subprocess code. */
  readonly confirmLocalExecution?: boolean
}

/** Credential-reference configuration for one managed hook package. */
export interface HookMarketConfigureRequest {
  readonly packageId: HookMarketPackageId
  readonly credentialReferences: Readonly<Record<string, string>>
}

/** Request to remove one managed hook package. */
export interface HookMarketUninstallRequest {
  readonly packageId: HookMarketPackageId
}

/** Declared hook marketplace business failure. */
export type HookMarketFailure =
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
    readonly packageId: HookMarketPackageId
    readonly installedVersion: string
    readonly candidateVersion: string
  }
  | {
    /** Install retry must carry explicit confirmation after presenting the disclosure. */
    readonly code: 'local-execution-confirmation-required'
    readonly candidatePermissions: readonly string[]
  }
  | { readonly code: 'unmanaged-conflict' | 'manifest-incompatible' | 'not-found'; readonly packageId: HookMarketPackageId }
  | { readonly code: 'invalid-credential-reference'; readonly slot: string }
  | { readonly code: 'missing-credential-reference'; readonly slot: string }

/** Declared business result. */
export type HookMarketResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: HookMarketFailure }

/** Inventory response for managed hook packages. */
export type HookMarketListResult = HookMarketResult<{ readonly entries: readonly HookMarketEntry[] }>
/** Install or upgrade response for one managed hook package. */
export type HookMarketInstallResult = HookMarketResult<{
  readonly packageId: HookMarketPackageId
  readonly operation: 'installed' | 'upgraded'
  readonly restartRequired: true
}>
/** Credential-reference configuration response for one managed hook package. */
export type HookMarketConfigureResult = HookMarketResult<{
  readonly packageId: HookMarketPackageId
  readonly credentialReferences: Readonly<Record<string, string>>
  readonly restartRequired: true
}>
/** Uninstall response for one managed hook package. */
export type HookMarketUninstallResult = HookMarketResult<{
  readonly packageId: HookMarketPackageId
  readonly restartRequired: true
}>
