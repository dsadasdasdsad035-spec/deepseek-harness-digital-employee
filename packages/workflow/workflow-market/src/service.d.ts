/** Trusted workflow package validation and managed lifecycle. */
import type { TrustedPublisher, WorkflowPackageDescriptor } from '@deepseek-ai/dsh-marketplace-core'
import type { WorkflowMarketFailure, WorkflowMarketInstallRequest, WorkflowMarketInstallResult, WorkflowMarketListResult, WorkflowMarketPackageId, WorkflowMarketUninstallResult } from './types.ts'
declare class WorkflowMarketDomainError extends Error {
  readonly failure: WorkflowMarketFailure
  constructor(failure: WorkflowMarketFailure)
}
export { WorkflowMarketDomainError }
/**
 * Map a marketplace domain error to its structured failure result.
 * @param error - Error caught by a Remote gateway method.
 * @returns The failure result; anything that is not a domain error rethrows.
 */
export declare function asWorkflowMarketResult(error: unknown): {
  readonly ok: false
  readonly error: WorkflowMarketFailure
}
/** Runtime dependencies for managed workflow packages. */
export interface WorkflowMarketServiceOptions {
  readonly installRoot: string
  readonly trustedPublishers: readonly TrustedPublisher[]
  /** Explicit local override: skip publisher-trust verification. */
  readonly allowUnsignedPackages: boolean
}
/** Owns managed workflow package files. */
export declare class WorkflowMarketService {
  private readonly options
  private readonly mutations
  private readonly diagnostics
  constructor(options: WorkflowMarketServiceOptions)
  /**
     * Absolute managed directory of one installed package.
     * @param packageId - Managed package identity.
     * @returns Resolved install directory of the package payload.
     */
  packageDirectory(packageId: string): string
  /**
     * Read one installed package descriptor.
     * @param packageId - Managed package identity.
     * @returns Parsed descriptor from the installed package.
     */
  descriptor(packageId: string): Promise<WorkflowPackageDescriptor>
  /**
     * List managed packages with entry summaries.
     * @returns Declared inventory result or a structured marketplace failure.
     */
  list(): Promise<WorkflowMarketListResult>
  /**
     * Install or explicitly upgrade one trusted package.
     * @param request - Uploaded archive and explicit replacement intent.
     * @returns Declared mutation result or a structured marketplace failure.
     */
  install(request: WorkflowMarketInstallRequest): Promise<WorkflowMarketInstallResult>
  /**
     * Remove one managed package.
     * @param packageId - Managed package identity to remove.
     * @returns Declared mutation result or a structured marketplace failure.
     */
  uninstall(packageId: WorkflowMarketPackageId): Promise<WorkflowMarketUninstallResult>
  /**
     * Record a package-level diagnostic without credential values.
     * @param packageId - Managed package identity.
     * @param diagnostic - Public diagnostic, or undefined to clear it.
     */
  setDiagnostic(packageId: string, diagnostic?: string): void
}
//# sourceMappingURL=service.d.ts.map
