/** Client-safe Tool marketplace requests, inventory, and declared failures. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity of one managed Tool package. */
export type ToolMarketPackageId = Branded<'ToolMarketPackageId'>

/** One declared Tool within an installed package. */
export interface ToolMarketToolEntry {
  readonly name: string
  readonly description: string
  readonly inputDescription: string
  readonly available: boolean
}

/** One managed Tool package exposed to marketplace clients. */
export interface ToolMarketEntry {
  readonly packageId: ToolMarketPackageId
  readonly displayName: string
  readonly description: string
  readonly version: string
  readonly publisherId: string
  readonly permissions: readonly ('filesystem-read' | 'filesystem-write' | 'network' | 'subprocess')[]
  readonly tools: readonly ToolMarketToolEntry[]
  readonly installedAt: number
  readonly available: boolean
  readonly restartRequired: boolean
}

/** Uploaded Tool ZIP and explicit replacement intent. */
export interface ToolMarketInstallRequest {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting?: boolean
}

/** Request to uninstall one managed Tool package. */
export interface ToolMarketUninstallRequest {
  readonly packageId: ToolMarketPackageId
}

/** Declared Tool marketplace business failure. */
export type ToolMarketFailure =
  | { readonly code: 'invalid-archive'; readonly reason: 'base64' | 'zip' }
  | {
    readonly code: 'resource-limit'
    readonly limit: 'archive-bytes' | 'file-count' | 'entry-bytes' | 'total-bytes'
    readonly limitValue: number
    readonly observedValue: number
    readonly entry?: string | undefined
  }
  | { readonly code: 'invalid-package'; readonly reason: string }
  | { readonly code: 'untrusted-publisher'; readonly publisherId: string }
  | { readonly code: 'invalid-signature'; readonly publisherId: string }
  | {
    readonly code: 'managed-upgrade-required'
    readonly packageId: ToolMarketPackageId
    readonly installedVersion: string
    readonly candidateVersion: string
  }
  | { readonly code: 'unmanaged-conflict' | 'manifest-incompatible' | 'not-found'; readonly packageId: ToolMarketPackageId }

/** Declared business result. */
export type ToolMarketResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: ToolMarketFailure }

/** Deterministic Tool package inventory result. */
export type ToolMarketListResult = ToolMarketResult<{ readonly entries: readonly ToolMarketEntry[] }>

/** Committed install or upgrade result. */
export type ToolMarketInstallResult = ToolMarketResult<{
  readonly packageId: ToolMarketPackageId
  readonly operation: 'installed' | 'upgraded'
  readonly restartRequired: true
}>

/** Committed uninstall result. */
export type ToolMarketUninstallResult = ToolMarketResult<{
  readonly packageId: ToolMarketPackageId
  readonly restartRequired: true
}>
