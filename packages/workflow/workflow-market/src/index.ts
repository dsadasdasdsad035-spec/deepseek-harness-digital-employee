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
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  combineTrustedPublisherRecords,
  readTrustedPublisherFileSync,
  type WorkflowPackageDescriptor,
} from '@deepseek-ai/dsh-marketplace-core'
import { WorkflowMarketService } from './service.ts'
import type {
  WorkflowMarketInstallRequest,
  WorkflowMarketInstallResult,
  WorkflowMarketListResult,
  WorkflowMarketUninstallRequest,
  WorkflowMarketUninstallResult,
} from './types.ts'

export type * from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'workflow-market'
/** Services required for activation. */
export const inject: string[] = []

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
export class WorkflowMarketGateway extends TypertRemoteService {
  static Config: z<Config> = z.object({
    installRoot: z.string().required(),
    trustedPublishers: z.array(z.object({
      id: z.string().required(),
      publicKeyPem: z.string().required(),
    })).default([]),
    allowUnsignedPackages: z.boolean().default(false),
    trustedPublishersFile: z.string(),
  })
  readonly service: WorkflowMarketService

  constructor(ctx: Context, config: Config) {
    super(ctx, 'workflowMarket')
    const trustFile = config.trustedPublishersFile
    const fileRecords = trustFile === undefined
      ? null
      : readTrustedPublisherFileSync(trustFile)
    this.service = new WorkflowMarketService({
      installRoot: config.installRoot,
      trustedPublishers: fileRecords === null || trustFile === undefined
        ? config.trustedPublishers
        : combineTrustedPublisherRecords(config.trustedPublishers, fileRecords, trustFile),
      allowUnsignedPackages: config.allowUnsignedPackages === true,
    })
  }

  /**
   * List managed workflow packages.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  @Remote('list')
  async list(): Promise<WorkflowMarketListResult> {
    return await this.service.list()
  }

  /**
   * Install or explicitly upgrade one trusted workflow package.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('install')
  async install(request: WorkflowMarketInstallRequest): Promise<WorkflowMarketInstallResult> {
    return await this.service.install(request)
  }

  /**
   * Uninstall one marketplace-managed workflow package.
   * @param request - Managed package identity to remove.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('uninstall')
  async uninstall(request: WorkflowMarketUninstallRequest): Promise<WorkflowMarketUninstallResult> {
    return await this.service.uninstall(request.packageId)
  }

  /**
   * Project every installed package for the composition bridge. Packages
   * failing validation are skipped with a diagnostic.
   * @returns Installed descriptors.
   */
  async installedPackages(): Promise<readonly InstalledWorkflowPackage[]> {
    const inventory = await this.service.list()
    if (!inventory.ok) return []
    const installed: InstalledWorkflowPackage[] = []
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
          error instanceof Error ? error.message : 'workflow package validation failed',
        )
      }
    }
    return installed
  }
}

/** Install the gateway; mounting happens per employee composition, not here. */
export function apply(ctx: Context, config: Config): void {
  new WorkflowMarketGateway(ctx, config)
}
