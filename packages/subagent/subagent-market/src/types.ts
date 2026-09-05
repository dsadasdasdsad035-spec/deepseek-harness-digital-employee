/** Client-safe subagent marketplace requests, inventory, and declared failures. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one managed subagent package. */
export type SubagentMarketPackageId = Branded<'SubagentMarketPackageId'>

/** One declared subagent entry in a managed package, credential-free. */
export interface SubagentMarketEntryItem {
  readonly id: string
  readonly available: boolean
}

/** One managed subagent package. */
export interface SubagentMarketEntry {
  readonly packageId: SubagentMarketPackageId
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly publisherId: string
  readonly entries: readonly SubagentMarketEntryItem[]
  readonly permissions: readonly string[]
  readonly installedAt: number
  readonly available: boolean
  readonly restartRequired: true
  readonly diagnostic?: string | undefined
}

/** Uploaded subagent ZIP and explicit replacement intent. */
export interface SubagentMarketInstallRequest {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting?: boolean
  /** Explicit user confirmation for packages that execute local subprocess code. */
  readonly confirmLocalExecution?: boolean
}

/** Request to remove one managed subagent package. */
export interface SubagentMarketUninstallRequest {
  readonly packageId: SubagentMarketPackageId
}

/** Declared subagent marketplace business failure. */
export type SubagentMarketFailure =
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
    readonly packageId: SubagentMarketPackageId
    readonly installedVersion: string
    readonly candidateVersion: string
  }
  | {
    /** Install retry must carry explicit confirmation after presenting the disclosure. */
    readonly code: 'local-execution-confirmation-required'
    readonly candidatePermissions: readonly string[]
  }
  | { readonly code: 'unmanaged-conflict' | 'manifest-incompatible' | 'not-found'; readonly packageId: SubagentMarketPackageId }

/** Declared business result. */
export type SubagentMarketResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: SubagentMarketFailure }

/** Inventory response for managed subagent packages. */
export type SubagentMarketListResult = SubagentMarketResult<{ readonly entries: readonly SubagentMarketEntry[] }>
/** Install or upgrade response for one managed subagent package. */
export type SubagentMarketInstallResult = SubagentMarketResult<{
  readonly packageId: SubagentMarketPackageId
  readonly operation: 'installed' | 'upgraded'
  readonly restartRequired: true
}>
/** Uninstall response for one managed subagent package. */
export type SubagentMarketUninstallResult = SubagentMarketResult<{
  readonly packageId: SubagentMarketPackageId
  readonly restartRequired: true
}>
