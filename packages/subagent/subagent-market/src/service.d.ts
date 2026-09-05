/** Trusted subagent package validation and managed lifecycle. */
import type { TrustedPublisher, SubagentPackageDescriptor } from '@deepseek-ai/dsh-marketplace-core'
import type { SubagentMarketFailure, SubagentMarketInstallRequest, SubagentMarketInstallResult, SubagentMarketListResult, SubagentMarketPackageId, SubagentMarketUninstallResult } from './types.ts'
declare class SubagentMarketDomainError extends Error {
  readonly failure: SubagentMarketFailure
  constructor(failure: SubagentMarketFailure)
}
export { SubagentMarketDomainError }
/**
 * Map a marketplace domain error to its structured failure result.
 * @param error - Error caught by a Remote gateway method.
 * @returns The failure result; anything that is not a domain error rethrows.
 */
export declare function asSubagentMarketResult(error: unknown): {
  readonly ok: false
  readonly error: SubagentMarketFailure
}
/** Runtime dependencies for managed subagent packages. */
export interface SubagentMarketServiceOptions {
  readonly installRoot: string
  readonly trustedPublishers: readonly TrustedPublisher[]
  /** Explicit local override: skip publisher-trust verification. */
  readonly allowUnsignedPackages: boolean
}
/** Owns managed subagent package files. */
export declare class SubagentMarketService {
  private readonly options
  private readonly mutations
  private readonly diagnostics
  constructor(options: SubagentMarketServiceOptions)
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
  descriptor(packageId: string): Promise<SubagentPackageDescriptor>
  /**
     * List managed packages with entry summaries.
     * @returns Declared inventory result or a structured marketplace failure.
     */
  list(): Promise<SubagentMarketListResult>
  /**
     * Install or explicitly upgrade one trusted package.
     * @param request - Uploaded archive and explicit replacement intent.
     * @returns Declared mutation result or a structured marketplace failure.
     */
  install(request: SubagentMarketInstallRequest): Promise<SubagentMarketInstallResult>
  /**
     * Remove one managed package.
     * @param packageId - Managed package identity to remove.
     * @returns Declared mutation result or a structured marketplace failure.
     */
  uninstall(packageId: SubagentMarketPackageId): Promise<SubagentMarketUninstallResult>
  /**
     * Record a package-level diagnostic without credential values.
     * @param packageId - Managed package identity.
     * @param diagnostic - Public diagnostic, or undefined to clear it.
     */
  setDiagnostic(packageId: string, diagnostic?: string): void
}
//# sourceMappingURL=service.d.ts.map
