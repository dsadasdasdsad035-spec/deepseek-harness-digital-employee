/**
 * Host-side declarative MCP package marketplace.
 * @module @deepseek-ai/dsh-mcp-market
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-mcp-client'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { combineTrustedPublisherRecords, readTrustedPublisherFileSync } from '@deepseek-ai/dsh-marketplace-core'
import type { McpPackageServer } from '@deepseek-ai/dsh-marketplace-core'
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
  /** Bare interpreter command names a stdio server may name; defaults to `['node']`. */
  readonly stdioInterpreters?: string[]
  /** Explicit local override: accept packages without publisher verification. */
  readonly allowUnsignedPackages?: boolean
  /** Optional persistent trusted-publisher file combined with inline records. */
  readonly trustedPublishersFile?: string
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
    stdioInterpreters: z.array(z.string()).default(['node']),
    allowUnsignedPackages: z.boolean().default(false),
    trustedPublishersFile: z.string(),
  })
  private readonly service: McpMarketService
  private readonly stdioInterpreters: readonly string[]
  private activeServerNames = new Set<string>()
  private disposers: Array<() => Promise<void>> = []

  constructor(ctx: Context, config: Config) {
    super(ctx, 'mcpMarket')
    this.stdioInterpreters = config.stdioInterpreters ?? ['node']
    const trustFile = config.trustedPublishersFile
    const fileRecords = trustFile === undefined
      ? null
      : readTrustedPublisherFileSync(trustFile)
    this.service = new McpMarketService({
      installRoot: config.installRoot,
      trustedPublishers: fileRecords === null || trustFile === undefined
        ? config.trustedPublishers
        : combineTrustedPublisherRecords(config.trustedPublishers, fileRecords, trustFile),
      stdioInterpreters: this.stdioInterpreters,
      allowUnsignedPackages: config.allowUnsignedPackages === true,
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
   * Resolved values remain local to each manager mount call. Servers mount on
   * the root context, not the gateway's service context: the service context
   * sits outside the `tools` service resolution chain, so fibers mounted
   * there cannot register tools.
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
          const dispose = server.transport === 'stdio'
            ? await this.mountStdioServer(packageId, server, references)
            : await this.mountHttpServer(server, references)
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
   * Mount one stdio server as a child process from its managed package directory.
   * @param packageId - Managed package owning the server entry.
   * @param server - Validated stdio server declaration.
   * @param references - Configured credential reference names by slot.
   * @returns disposer releasing the mount.
   */
  private async mountStdioServer(
    packageId: string,
    server: McpPackageServer & { readonly transport: 'stdio' },
    references: Readonly<Record<string, string>>,
  ): Promise<() => Promise<void>> {
    if (!this.stdioInterpreters.includes(server.command)) {
      throw new Error(`stdio command "${server.command}" is not an allowed interpreter`)
    }
    const env = { ...server.env }
    for (const [name, slot] of Object.entries(server.credentialReferences)) {
      env[name] = await this.resolveSlotValue(slot, references)
    }
    return await this.ctx.mcpClients.mount(this.ctx.root, {
      transport: 'stdio',
      serverName: server.id,
      command: server.command,
      args: [...server.args],
      env,
      cwd: this.service.packageDirectory(packageId),
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
    })
  }

  /**
   * Mount one Streamable HTTP server as a remote MCP client.
   * @param server - Validated HTTP server declaration.
   * @param references - Configured credential reference names by slot.
   * @returns disposer releasing the mount.
   */
  private async mountHttpServer(
    server: McpPackageServer & { readonly transport: 'streamable-http' },
    references: Readonly<Record<string, string>>,
  ): Promise<() => Promise<void>> {
    const headers = { ...server.headers }
    for (const [header, slot] of Object.entries(server.credentialReferences)) {
      headers[header] = await this.resolveSlotValue(slot, references)
    }
    return await this.ctx.mcpClients.mount(this.ctx.root, {
      transport: 'streamable-http',
      serverName: server.id,
      url: server.url,
      headers,
      toolCallTimeoutMs: 60_000,
      failOnStartupError: false,
    })
  }

  /**
   * Resolve one credential slot to its secret value for a mount call.
   * @param slot - Descriptor credential-slot name.
   * @param references - Configured reference names by slot.
   * @returns resolved secret value; never persisted.
   */
  private async resolveSlotValue(slot: string, references: Readonly<Record<string, string>>): Promise<string> {
    const reference = references[slot]
    if (reference === undefined) throw new Error(`credential slot "${slot}" is not configured`)
    const resolved = await this.ctx.credentials.resolve(credentialRef(reference))
    if (resolved === undefined) throw new Error(`credential reference "${reference}" is unavailable`)
    return resolved.value
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
        const credentials: Record<string, string> = {}
        for (const [name, slot] of Object.entries(server.credentialReferences)) {
          const reference = references[slot]
          if (reference !== undefined) credentials[name] = reference
        }
        const declaration = server.transport === 'stdio'
          ? {
            id: server.id,
            transport: 'stdio' as const,
            command: server.command,
            args: [...server.args],
            env: server.env,
            envCredentials: credentials,
            cwd: this.service.packageDirectory(packageId),
          }
          : {
            id: server.id,
            transport: 'streamable-http' as const,
            url: server.url,
            headers: server.headers,
            headerCredentials: credentials,
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
          declaration,
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
