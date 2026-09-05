/**
 * Host-side declarative subagent package marketplace.
 *
 * Installs and manages signed subagent packages; employee-scoped mounting
 * lives in the composition bridge, which reads installed descriptors through
 * `installedPackages`.
 * @module @deepseek-ai/dsh-subagent-market
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { type SubagentPackageDescriptor } from '@deepseek-ai/dsh-marketplace-core'
import { SubagentMarketService } from './service.ts'
import type { SubagentMarketInstallRequest, SubagentMarketInstallResult, SubagentMarketListResult, SubagentMarketUninstallRequest, SubagentMarketUninstallResult } from './types.ts'
export type * from './types.ts'
export { mountEmployeeSubagents } from './bridge.ts'
/** Cordis plugin name used by loader diagnostics. */
export declare const name = 'subagent-market'
/** Services required for activation. */
export declare const inject: string[]
/** Subagent marketplace Host configuration. */
export interface Config {
  /** Private user directory containing marketplace-managed subagent packages. */
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
    /** Host subagent marketplace Remote gateway. */
    subagentMarket: SubagentMarketGateway
  }
}
/** One installed package projected for the composition bridge. */
export interface InstalledSubagentPackage {
  readonly packageId: string
  readonly directory: string
  readonly descriptor: SubagentPackageDescriptor
}
/** Typed Remote gateway for managed subagent packages. */
export declare class SubagentMarketGateway extends TypertRemoteService {
  static Config: z<Config>
  readonly service: SubagentMarketService
  constructor(ctx: Context, config: Config)
  /**
     * List managed subagent packages.
     * @returns Declared inventory result or a structured marketplace failure.
     */
  list(): Promise<SubagentMarketListResult>
  /**
     * Install or explicitly upgrade one trusted subagent package.
     * @param request - Uploaded archive and explicit replacement intent.
     * @returns Declared mutation result or a structured marketplace failure.
     */
  install(request: SubagentMarketInstallRequest): Promise<SubagentMarketInstallResult>
  /**
     * Uninstall one marketplace-managed subagent package.
     * @param request - Managed package identity to remove.
     * @returns Declared mutation result or a structured marketplace failure.
     */
  uninstall(request: SubagentMarketUninstallRequest): Promise<SubagentMarketUninstallResult>
  /**
     * Project every installed package for the composition bridge. Packages
     * failing validation are skipped with a diagnostic.
     * @returns Installed descriptors.
     */
  installedPackages(): Promise<readonly InstalledSubagentPackage[]>
}
/** Install the gateway; mounting happens per employee composition, not here. */
export declare function apply(ctx: Context, config: Config): void
//# sourceMappingURL=index.d.ts.map
