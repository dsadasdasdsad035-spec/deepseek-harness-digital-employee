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
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  combineTrustedPublisherRecords,
  readTrustedPublisherFileSync,
  type SubagentPackageDescriptor,
} from '@deepseek-ai/dsh-marketplace-core'
import { SubagentMarketService } from './service.ts'
import type {
  SubagentMarketInstallRequest,
  SubagentMarketInstallResult,
  SubagentMarketListResult,
  SubagentMarketUninstallRequest,
  SubagentMarketUninstallResult,
} from './types.ts'

export type * from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'subagent-market'
/** Services required for activation. */
export const inject: string[] = []

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
export class SubagentMarketGateway extends TypertRemoteService {
  static Config: z<Config> = z.object({
    installRoot: z.string().required(),
    trustedPublishers: z.array(z.object({
      id: z.string().required(),
      publicKeyPem: z.string().required(),
    })).default([]),
    allowUnsignedPackages: z.boolean().default(false),
    trustedPublishersFile: z.string(),
  })
  readonly service: SubagentMarketService

  constructor(ctx: Context, config: Config) {
    super(ctx, 'subagentMarket')
    const trustFile = config.trustedPublishersFile
    const fileRecords = trustFile === undefined
      ? null
      : readTrustedPublisherFileSync(trustFile)
    this.service = new SubagentMarketService({
      installRoot: config.installRoot,
      trustedPublishers: fileRecords === null || trustFile === undefined
        ? config.trustedPublishers
        : combineTrustedPublisherRecords(config.trustedPublishers, fileRecords, trustFile),
      allowUnsignedPackages: config.allowUnsignedPackages === true,
    })
  }

  /**
   * List managed subagent packages.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  @Remote('list')
  async list(): Promise<SubagentMarketListResult> {
    return await this.service.list()
  }

  /**
   * Install or explicitly upgrade one trusted subagent package.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('install')
  async install(request: SubagentMarketInstallRequest): Promise<SubagentMarketInstallResult> {
    return await this.service.install(request)
  }

  /**
   * Uninstall one marketplace-managed subagent package.
   * @param request - Managed package identity to remove.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('uninstall')
  async uninstall(request: SubagentMarketUninstallRequest): Promise<SubagentMarketUninstallResult> {
    return await this.service.uninstall(request.packageId)
  }

  /**
   * Project every installed package for the composition bridge. Packages
   * failing validation are skipped with a diagnostic.
   * @returns Installed descriptors.
   */
  async installedPackages(): Promise<readonly InstalledSubagentPackage[]> {
    const inventory = await this.service.list()
    if (!inventory.ok) return []
    const installed: InstalledSubagentPackage[] = []
    for (const entry of inventory.value.entries) {
      try {
        const descriptor = await this.service.descriptor(entry.packageId)
        installed.push({
          packageId: entry.packageId,
          directory: this.service.packageDirectory(entry.packageId),
          descriptor,
        })
      } catch (error: unknown) {
        this.service.setDiagnostic(
          entry.packageId,
          error instanceof Error ? error.message : 'subagent package validation failed',
        )
      }
    }
    return installed
  }
}

/** Install the gateway; mounting happens per employee composition, not here. */
export function apply(ctx: Context, config: Config): void {
  new SubagentMarketGateway(ctx, config)
}
