/**
 * Host-side trusted, restart-bound Tool package marketplace.
 * @module @deepseek-ai/dsh-tool-market
 */

import type { Context } from '@deepseek-ai/cordis'
import { pathToFileURL } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-tools'
import { ToolMarketService } from './service.ts'
import type {
  ToolMarketInstallRequest,
  ToolMarketInstallResult,
  ToolMarketListResult,
  ToolMarketUninstallRequest,
  ToolMarketUninstallResult,
} from './types.ts'

export type * from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-market'
/** Services required by Tool inventory projection. */
export const inject = ['tools']

/** Tool marketplace Host configuration. */
export interface Config {
  /** Private user directory containing marketplace-managed Tool packages. */
  readonly installRoot: string
  /** Locally trusted Ed25519 publisher keys. */
  readonly trustedPublishers: {
    /** Stable publisher identity declared by signed packages. */
    readonly id: string
    /** Ed25519 SPKI public key in PEM form. */
    readonly publicKeyPem: string
  }[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host Tool marketplace Remote gateway. */
    toolMarket: ToolMarketGateway
  }
}

/** Typed Remote gateway for trusted Tool package lifecycle operations. */
export class ToolMarketGateway extends TypertRemoteService {
  static inject = inject
  static Config: z<Config> = z.object({
    installRoot: z.string().required(),
    trustedPublishers: z.array(z.object({
      id: z.string().required(),
      publicKeyPem: z.string().required(),
    })).default([]),
  })
  private readonly service: ToolMarketService
  private readonly activeToolNames = new Set<string>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'toolMarket')
    this.service = new ToolMarketService({
      installRoot: config.installRoot,
      trustedPublishers: config.trustedPublishers,
      activeToolNames: () => [...this.activeToolNames],
    })
  }

  /**
   * List managed packages and current-process availability.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  @Remote('list')
  list(): Promise<ToolMarketListResult> {
    return this.service.list()
  }

  /**
   * Install or explicitly upgrade a trusted Tool package.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('install')
  install(request: ToolMarketInstallRequest): Promise<ToolMarketInstallResult> {
    return this.service.install(request)
  }

  /**
   * Uninstall one marketplace-managed Tool package.
   * @param request - Managed package identity to remove.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('uninstall')
  uninstall(request: ToolMarketUninstallRequest): Promise<ToolMarketUninstallResult> {
    return this.service.uninstall(request.packageId)
  }

  /** Revalidate and mount trusted packages during fresh Host composition. */
  async activateInstalled(): Promise<void> {
    for (const candidate of await this.service.activationCandidates()) {
      const registeredBeforeImport = new Set(this.ctx.tools.schemas().map(tool => tool.name))
      for (const toolName of candidate.toolNames) {
        if (registeredBeforeImport.has(toolName)) {
          throw new Error(
            `Tool package "${candidate.id}" declared Tool "${toolName}" conflicts with an existing registration`,
          )
        }
      }
      const url = pathToFileURL(candidate.entryPath)
      url.searchParams.set('installedAt', String(candidate.installedAt))
      const loaded = await import(url.href) as { default?: unknown }
      const plugin = loaded.default ?? loaded
      const fiber = this.ctx.plugin(plugin as never, {} as never)
      await fiber
      const registered = new Set(this.ctx.tools.schemas().map(tool => tool.name))
      for (const toolName of candidate.toolNames) {
        if (!registered.has(toolName)) {
          throw new Error(`Tool package "${candidate.id}" did not register declared Tool "${toolName}"`)
        }
        this.activeToolNames.add(toolName)
      }
    }
  }
}

/** Mount the gateway; fresh composition activates previously installed trusted packages. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const gateway = new ToolMarketGateway(ctx, config)
  await gateway.activateInstalled()
}
