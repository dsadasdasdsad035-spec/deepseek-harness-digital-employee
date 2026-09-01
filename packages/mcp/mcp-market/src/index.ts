/**
 * Host-side declarative MCP package marketplace.
 * @module @deepseek-ai/dsh-mcp-market
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-mcp-client'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { McpMarketService } from './service.ts'
import type {
  McpMarketConfigureRequest,
  McpMarketConfigureResult,
  McpMarketInstallRequest,
  McpMarketInstallResult,
  McpMarketListResult,
  McpMarketTemplateConfiguration,
  McpMarketUninstallRequest,
  McpMarketUninstallResult,
} from './types.ts'

export type * from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-market'
/** Services required for activation and credential resolution. */
export const inject = ['credentials', 'mcpClients']

/** MCP marketplace Host configuration. */
export interface Config {
  /** Private user directory containing marketplace-managed MCP packages. */
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
    /** Host MCP marketplace Remote gateway. */
    mcpMarket: McpMarketGateway
  }
}

/** Typed Remote gateway and restart-time activation owner. */
export class McpMarketGateway extends TypertRemoteService {
  static inject = inject
  static Config: z<Config> = z.object({
    installRoot: z.string().required(),
    trustedPublishers: z.array(z.object({
      id: z.string().required(),
      publicKeyPem: z.string().required(),
    })).default([]),
  })
  private readonly service: McpMarketService
  private activeServerNames = new Set<string>()
  private disposers: Array<() => Promise<void>> = []

  constructor(ctx: Context, config: Config) {
    super(ctx, 'mcpMarket')
    this.service = new McpMarketService({
      installRoot: config.installRoot,
      trustedPublishers: config.trustedPublishers,
      activeServerNames: () => [...this.activeServerNames],
      credentialInfo: ref => ctx.credentials.describe(ref),
    })
    ctx.effect(() => async () => {
      for (const dispose of this.disposers.reverse()) await dispose()
      this.disposers = []
      this.activeServerNames.clear()
    }, 'mcp-market.activations')
  }

  /**
   * List managed MCP packages without credential values.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  @Remote('list')
  list(): Promise<McpMarketListResult> {
    return this.service.list()
  }

  /**
   * Install or explicitly upgrade one trusted MCP package.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('install')
  install(request: McpMarketInstallRequest): Promise<McpMarketInstallResult> {
    return this.service.install(request)
  }

  /**
   * Persist credential references only.
   * @param request - Package identity and descriptor-slot reference mapping.
   * @returns Saved references and restart state, or a structured marketplace failure.
   */
  @Remote('configure')
  configure(request: McpMarketConfigureRequest): Promise<McpMarketConfigureResult> {
    return this.service.configure(request)
  }

  /**
   * Uninstall one marketplace-managed MCP package.
   * @param request - Managed package identity to remove.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  @Remote('uninstall')
  uninstall(request: McpMarketUninstallRequest): Promise<McpMarketUninstallResult> {
    return this.service.uninstall(request.packageId)
  }

  /**
   * Activate configured packages during fresh Host composition.
   * Resolved values remain local to each manager mount call.
   */
  async activateConfigured(): Promise<void> {
    for (const dispose of this.disposers.reverse()) await dispose()
    this.disposers = []
    this.activeServerNames.clear()
    const configurations = await this.service.configurations()
    for (const [packageId, references] of Object.entries(configurations).sort(([left], [right]) => left.localeCompare(right))) {
      const packageDisposers: Array<() => Promise<void>> = []
      const packageServerNames: string[] = []
      try {
        const descriptor = await this.service.descriptor(packageId)
        for (const server of descriptor.servers) {
          const headers = { ...server.headers }
          for (const [header, slot] of Object.entries(server.credentialReferences)) {
            const reference = references[slot]
            if (reference === undefined) throw new Error(`credential slot "${slot}" is not configured`)
            const resolved = await this.ctx.credentials.resolve(credentialRef(reference))
            if (resolved === undefined) throw new Error(`credential reference "${reference}" is unavailable`)
            headers[header] = resolved.value
          }
          const dispose = await this.ctx.mcpClients.mount(this.ctx, {
            transport: 'streamable-http',
            serverName: server.id,
            url: server.url,
            headers,
            toolCallTimeoutMs: 60_000,
            failOnStartupError: false,
          })
          packageDisposers.push(dispose)
          packageServerNames.push(server.id)
        }
        this.disposers.push(...packageDisposers)
        for (const serverName of packageServerNames) this.activeServerNames.add(serverName)
        this.service.setDiagnostic(packageId)
      } catch (error: unknown) {
        const rollbackFailures: unknown[] = []
        for (const dispose of packageDisposers.reverse()) {
          try {
            await dispose()
          } catch (rollbackError: unknown) {
            rollbackFailures.push(rollbackError)
          }
        }
        const diagnostic = rollbackFailures.length === 0
          ? error
          : new AggregateError([error, ...rollbackFailures], 'MCP package activation and rollback failed')
        this.service.setDiagnostic(
          packageId,
          diagnostic instanceof Error ? diagnostic.message : 'MCP package activation failed',
        )
      }
    }
  }

  /**
   * Project configured packages into credential-free template declarations.
   * @returns Safe declarations with availability and provenance metadata.
   */
  async templateConfigurations(): Promise<readonly McpMarketTemplateConfiguration[]> {
    const inventory = await this.service.list()
    if (!inventory.ok) return []
    const byPackage = new Map(inventory.value.entries.map(entry => [entry.packageId, entry]))
    const configurations = await this.service.configurations()
    const result: McpMarketTemplateConfiguration[] = []
    for (const [packageId, references] of Object.entries(configurations).sort(([left], [right]) => left.localeCompare(right))) {
      const entry = byPackage.get(packageId as never)
      if (entry === undefined) continue
      const descriptor = await this.service.descriptor(packageId)
      for (const server of descriptor.servers) {
        const headerCredentials: Record<string, string> = {}
        for (const [header, slot] of Object.entries(server.credentialReferences)) {
          const reference = references[slot]
          if (reference !== undefined) headerCredentials[header] = reference
        }
        result.push({
          packageId: packageId as never,
          serverName: server.id,
          displayName: entry.displayName,
          description: entry.description,
          version: entry.version,
          publisherId: entry.publisherId,
          available: entry.available && entry.servers.some(candidate =>
            candidate.serverName === server.id && candidate.available),
          restartRequired: entry.restartRequired,
          declaration: {
            id: server.id,
            transport: 'streamable-http',
            url: server.url,
            headers: server.headers,
            headerCredentials,
          },
        })
      }
    }
    return result
  }
}

/** Mount the gateway; fresh composition activates previously configured packages. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const gateway = new McpMarketGateway(ctx, config)
  await gateway.activateConfigured()
}
