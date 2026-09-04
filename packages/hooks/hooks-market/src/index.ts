/**
 * Host-side declarative hook package marketplace.
 *
 * Installs and manages signed hook packages; employee-scoped mounting and the
 * invocable-tool registration live in the employee composition bridge, which
 * reads installed descriptors through {@link HookMarketGateway.installedPackages}.
 * @module @deepseek-ai/dsh-hooks-market
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import {
  combineTrustedPublisherRecords,
  readTrustedPublisherFileSync,
} from '@deepseek-ai/dsh-marketplace-core'
import type { HookPackageDescriptor } from '@deepseek-ai/dsh-marketplace-core'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { asHookMarketResult, HookMarketService } from './service.ts'
import type {
  HookMarketConfigureRequest,
  HookMarketConfigureResult,
  HookMarketInstallRequest,
  HookMarketInstallResult,
  HookMarketListResult,
  HookMarketUninstallRequest,
  HookMarketUninstallResult,
} from './types.ts'

export type * from './types.ts'
export { mountEmployeeHooks } from './bridge.ts'
export type { EmployeeHookBinding, MountEmployeeHooksOptions } from './bridge.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'hooks-market'
/** Services required for activation and credential resolution. */
export const inject = ['credentials', 'shell']

/** Hook marketplace Host configuration. */
export interface Config {
  /** Private user directory containing marketplace-managed hook packages. */
  readonly installRoot: string
  /** Locally trusted Ed25519 publisher keys. */
  readonly trustedPublishers: {
    /** Stable publisher identity declared by signed packages. */
    readonly id: string
    /** Ed25519 SPKI public key in PEM form. */
    readonly publicKeyPem: string
  }[]
  /** Bare interpreter command names a hook command may name; defaults to `['node']`. */
  readonly stdioInterpreters?: string[]
  /** Explicit local override: accept packages without publisher verification. */
  readonly allowUnsignedPackages?: boolean
  /** Optional persistent trusted-publisher file combined with inline records. */
  readonly trustedPublishersFile?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host hook marketplace Remote gateway. */
    hookMarket: HookMarketGateway
  }
}

/** One installed hook package projected for the employee bridge, credential-free. */
export interface InstalledHookPackage {
  readonly packageId: string
  readonly directory: string
  readonly descriptor: HookPackageDescriptor
  /** Configured credential reference names by descriptor slot. */
  readonly references: Readonly<Record<string, string>>
}

/** Typed Remote gateway for managed hook packages. */
export class HookMarketGateway extends TypertRemoteService {
  static inject = inject
  static Config: z<Config> = z.object({
    installRoot: z.string().required(),
    trustedPublishers: z.array(z.object({
      id: z.string().required(),
      publicKeyPem: z.string().required(),
    })).default([]),
    stdioInterpreters: z.array(z.string()).default(['node']),
    allowUnsignedPackages: z.boolean().default(false),
    trustedPublishersFile: z.string(),
  })
  private readonly service: HookMarketService

  constructor(ctx: Context, config: Config) {
    super(ctx, 'hookMarket')
    const trustFile = config.trustedPublishersFile
    const fileRecords = trustFile === undefined
      ? null
      : readTrustedPublisherFileSync(trustFile)
    this.service = new HookMarketService({
      installRoot: config.installRoot,
      trustedPublishers: fileRecords === null || trustFile === undefined
        ? config.trustedPublishers
        : combineTrustedPublisherRecords(config.trustedPublishers, fileRecords, trustFile),
      stdioInterpreters: config.stdioInterpreters ?? ['node'],
      allowUnsignedPackages: config.allowUnsignedPackages === true,
      credentialInfo: ref => ctx.credentials.describe(ref),
    })
  }

  /**
   * List managed hook packages without credential values.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  @Remote('list')
  list(): Promise<HookMarketListResult> {
    return this.service.list()
  }

  /**
   * Install or explicitly upgrade one trusted hook package.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('install')
  install(request: HookMarketInstallRequest): Promise<HookMarketInstallResult> {
    return this.service.install(request)
  }

  /**
   * Persist credential references only.
   * @param request - Package identity and descriptor-slot reference mapping.
   * @returns Saved references and restart state, or a structured marketplace failure.
   */
  @Remote('configure')
  configure(request: HookMarketConfigureRequest): Promise<HookMarketConfigureResult> {
    return this.service.configure(request)
  }

  /**
   * Uninstall one marketplace-managed hook package.
   * @param request - Managed package identity to remove.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('uninstall')
  uninstall(request: HookMarketUninstallRequest): Promise<HookMarketUninstallResult> {
    return this.service.uninstall(request.packageId)
  }

  /**
   * Project every installed hook package for the employee bridge.
   * Packages failing validation are skipped with a diagnostic; the bridge must
   * mount only valid descriptors.
   * @returns Installed descriptors with their configured reference names.
   */
  async installedPackages(): Promise<readonly InstalledHookPackage[]> {
    const manifests = await listInstalledIds(this.service)
    const installed: InstalledHookPackage[] = []
    for (const packageId of manifests) {
      try {
        const descriptor = await this.service.descriptor(packageId)
        installed.push({
          packageId,
          directory: this.service.packageDirectory(packageId),
          descriptor,
          references: await this.service.configuredReferences(packageId),
        })
      } catch (error: unknown) {
        this.service.setDiagnostic(
          packageId,
          error instanceof Error ? error.message : 'hook package validation failed',
        )
      }
    }
    return installed
  }

  /**
   * Resolve one configured credential reference to its secret value.
   * @param packageId - Managed package owning the reference.
   * @param slot - Descriptor credential slot.
   * @returns resolved secret value; never persisted.
   */
  async resolveSlotValue(packageId: string, slot: string): Promise<string> {
    const references = await this.service.configuredReferences(packageId)
    const reference = references[slot]
    if (reference === undefined) throw new Error(`credential slot "${slot}" is not configured`)
    const resolved = await this.ctx.credentials.resolve(credentialRef(reference))
    if (resolved === undefined) throw new Error(`credential reference "${reference}" is unavailable`)
    return resolved.value
  }

  /**
   * Surface a bridge-side mounting failure on the package inventory.
   * @param packageId - Managed package identity.
   * @param diagnostic - Public diagnostic, or undefined to clear it.
   */
  reportDiagnostic(packageId: string, diagnostic?: string): void {
    this.service.setDiagnostic(packageId, diagnostic)
  }

  /** Typed failure mapping for Remote methods that call the service directly. */
  static readonly asResult = asHookMarketResult
}

/** Install the gateway; mounting happens per employee composition, not here. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  new HookMarketGateway(ctx, config)
}

async function listInstalledIds(service: HookMarketService): Promise<readonly string[]> {
  const inventory = await service.list()
  if (!inventory.ok) return []
  return inventory.value.entries.map(entry => entry.packageId)
}
