/** Client-safe workflow marketplace requests, inventory, and declared failures. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one managed workflow package. */
export type WorkflowMarketPackageId = Branded<'WorkflowMarketPackageId'>

/** One declared workflow entry in a managed package, credential-free. */
export interface WorkflowMarketEntryItem {
  readonly id: string
  readonly available: boolean
}

/** One managed workflow package. */
export interface WorkflowMarketEntry {
  readonly packageId: WorkflowMarketPackageId
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly publisherId: string
  readonly entries: readonly WorkflowMarketEntryItem[]
  readonly permissions: readonly string[]
  readonly installedAt: number
  readonly available: boolean
  readonly restartRequired: true
  readonly diagnostic?: string | undefined
}

/** Uploaded workflow ZIP and explicit replacement intent. */
export interface WorkflowMarketInstallRequest {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting?: boolean
  /** Explicit user confirmation for packages that execute local subprocess code. */
  readonly confirmLocalExecution?: boolean
}

/** Request to remove one managed workflow package. */
export interface WorkflowMarketUninstallRequest {
  readonly packageId: WorkflowMarketPackageId
}

/** Declared workflow marketplace business failure. */
export type WorkflowMarketFailure =
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
    readonly packageId: WorkflowMarketPackageId
    readonly installedVersion: string
    readonly candidateVersion: string
  }
  | {
    /** Install retry must carry explicit confirmation after presenting the disclosure. */
    readonly code: 'local-execution-confirmation-required'
    readonly candidatePermissions: readonly string[]
  }
  | { readonly code: 'unmanaged-conflict' | 'manifest-incompatible' | 'not-found'; readonly packageId: WorkflowMarketPackageId }

/** Declared business result. */
export type WorkflowMarketResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: WorkflowMarketFailure }

/** Inventory response for managed workflow packages. */
export type WorkflowMarketListResult = WorkflowMarketResult<{ readonly entries: readonly WorkflowMarketEntry[] }>
/** Install or upgrade response for one managed workflow package. */
export type WorkflowMarketInstallResult = WorkflowMarketResult<{
  readonly packageId: WorkflowMarketPackageId
  readonly operation: 'installed' | 'upgraded'
  readonly restartRequired: true
}>
/** Uninstall response for one managed workflow package. */
export type WorkflowMarketUninstallResult = WorkflowMarketResult<{
  readonly packageId: WorkflowMarketPackageId
  readonly restartRequired: true
}>
