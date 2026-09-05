/**
 * Host-side declarative workflow package marketplace.
 *
 * Installs and manages signed workflow packages; employee-scoped mounting
 * lives in the composition bridge, which reads installed descriptors through
 * `installedPackages`.
 * @module @deepseek-ai/dsh-workflow-market
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { type WorkflowPackageDescriptor } from '@deepseek-ai/dsh-marketplace-core'
import { WorkflowMarketService } from './service.ts'
import type { WorkflowMarketInstallRequest, WorkflowMarketInstallResult, WorkflowMarketListResult, WorkflowMarketUninstallRequest, WorkflowMarketUninstallResult } from './types.ts'
export type * from './types.ts'
export { mountEmployeeWorkflows } from './bridge.ts'
/** Cordis plugin name used by loader diagnostics. */
export declare const name = 'workflow-market'
/** Services required for activation. */
export declare const inject: string[]
/** Workflow marketplace Host configuration. */
export interface Config {
  /** Private user directory containing marketplace-managed workflow packages. */
  readonly installRoot: string
  /** Locally trusted Ed25519 publisher keys. */
  readonly trustedPublishers: {
    /** Stable publisher identity declared by signed packages. */
    readonly id: string
    /** Ed25519 SPKI public key in PEM form. */
    readonly publicKeyPem: string
  }[]
  /** Explicit local override: accept packages without publisher verification. */
  readonly allowUnsignedPackages?: boolean
  /** Optional persistent trusted-publisher file combined with inline records. */
  readonly trustedPublishersFile?: string
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host workflow marketplace Remote gateway. */
    workflowMarket: WorkflowMarketGateway
  }
}
/** One installed package projected for the composition bridge. */
export interface InstalledWorkflowPackage {
  readonly packageId: string
  readonly directory: string
  readonly descriptor: WorkflowPackageDescriptor
}
/** Typed Remote gateway for managed workflow packages. */
export declare class WorkflowMarketGateway extends TypertRemoteService {
  static Config: z<Config>
  readonly service: WorkflowMarketService
  constructor(ctx: Context, config: Config)
  /**
     * List managed workflow packages.
     * @returns Declared inventory result or a structured marketplace failure.
     */
  list(): Promise<WorkflowMarketListResult>
  /**
     * Install or explicitly upgrade one trusted workflow package.
     * @param request - Uploaded archive and explicit replacement intent.
     * @returns Declared mutation result or a structured marketplace failure.
     */
  install(request: WorkflowMarketInstallRequest): Promise<WorkflowMarketInstallResult>
  /**
     * Uninstall one marketplace-managed workflow package.
     * @param request - Managed package identity to remove.
     * @returns Declared mutation result or a structured marketplace failure.
     */
  uninstall(request: WorkflowMarketUninstallRequest): Promise<WorkflowMarketUninstallResult>
  /**
     * Project every installed package for the composition bridge. Packages
     * failing validation are skipped with a diagnostic.
     * @returns Installed descriptors.
     */
  installedPackages(): Promise<readonly InstalledWorkflowPackage[]>
}
/** Install the gateway; mounting happens per employee composition, not here. */
export declare function apply(ctx: Context, config: Config): void
//# sourceMappingURL=index.d.ts.map
