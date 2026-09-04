/**
 * MCP client bridge plugin: connects to an external MCP server and registers
 * its tools on `ctx.tools` under server-qualified public names
 * (`mcp__<serverName>__<rawName>`). Each plugin instance connects to one MCP
 * server; load multiple instances in `cordis.yml` for multiple servers.
 *
 * Namespace plugin (named exports, no default export). Lifecycle is
 * effect-scoped: disposal disconnects from the server, unregisters all tools,
 * and releases the `serverName` namespace reservation. HMR hot-swaps by
 * disposing the old instance and creating a new one; identical `serverName`
 * reproduces identical public tool names.
 *
 * @module @deepseek-ai/dsh-mcp-client
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { RECONNECT_DEFAULTS, resolveReconnectPolicy, startConnection } from './connection.ts'
import type { ReconnectConfig } from './connection.ts'
// Side-effect type import: declaration-merges `ctx.tools` onto Context.
import type {} from '@deepseek-ai/dsh-tools'

export type { McpResult } from './tools.ts'
export type { ReconnectConfig, ResolvedReconnectPolicy } from './connection.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mcp-client'

/** Services required by this plugin. */
export const inject = ['tools']

/** Default timeout for individual MCP tool calls (ms). */
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000

/** Valid `serverName`, kept below the public tool-name budget. */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

/**
 * The `serverName` namespace rule shared with Host consumers (marketplace
 * direct configuration) so every mount path validates names identically.
 */
export const MCP_SERVER_NAME_PATTERN = SERVER_NAME_PATTERN

/**
 * Live `serverName` reservations per app, keyed off `ctx.root` (multiple apps
 * in one process — tests — must not see each other's names). A duplicate
 * namespace is a configuration error surfaced at plugin load, never silent
 * shadowing.
 */
const activeServerNames = new WeakMap<Context, Set<string>>()
const activeServerConfigs = new WeakMap<Context, Map<string, Pick<McpServerConfig, 'serverName' | 'transport'>>>()

/**
 * List active MCP client identities without connection parameters or credential values.
 * @param ctx - Context whose root owns the MCP client reservations.
 * @returns Active server names and transports in deterministic name order.
 */
export function listMcpServerConfigs(ctx: Context): readonly Pick<McpServerConfig, 'serverName' | 'transport'>[] {
  return [...(activeServerConfigs.get(ctx.root)?.values() ?? [])]
    .sort((left, right) => left.serverName.localeCompare(right.serverName))
}

// ---- Config ----

/** Config for connecting to an MCP server via a spawned child process over stdio. */
export interface StdioConfig {
  /** Selects child-process stdio transport. */
  transport: 'stdio'
  /**
   * Stable local namespace for this server's model-facing tool names
   * (`mcp__<serverName>__<rawName>`). Must match `[A-Za-z0-9_-]{1,32}` and be
   * unique across live mcp-client instances.
   */
  serverName: string
  /** Executable used to start the server. */
  command: string
  /** Arguments passed directly, without shell interpolation. */
  args: string[]
  /** Extra env vars merged on top of scrubbed ambient env. */
  env: Record<string, string>
  /** Working directory for the child process. */
  cwd: string
  /** Per-tool-call timeout in milliseconds. */
  toolCallTimeoutMs: number
  /** Fail plugin activation when the initial connection or tool synchronization fails. */
  failOnStartupError: boolean
  /** Automatic reconnect policy after a lost connection; omission uses the defaults. */
  reconnect?: ReconnectConfig
}

/** Config for connecting to an MCP server over Streamable HTTP (SSE). */
export interface StreamableHttpConfig {
  /** Selects Streamable HTTP transport. */
  transport: 'streamable-http'
  /**
   * Stable local namespace for this server's model-facing tool names
   * (`mcp__<serverName>__<rawName>`). Must match `[A-Za-z0-9_-]{1,32}` and be
   * unique across live mcp-client instances.
   */
  serverName: string
  /** MCP endpoint URL. */
  url: string
  /** Additional headers attached to MCP requests. */
  headers: Record<string, string>
  /** Per-tool-call timeout in milliseconds. */
  toolCallTimeoutMs: number
  /** Fail plugin activation when the initial connection or tool synchronization fails. */
  failOnStartupError: boolean
  /** Automatic reconnect policy after a lost connection; omission uses the defaults. */
  reconnect?: ReconnectConfig
}

/** Configuration for one stdio or Streamable HTTP MCP server. */
export type McpServerConfig = StdioConfig | StreamableHttpConfig

/** Configuration that installs the dynamic context-owned MCP client manager. */
export interface ManagerConfig {
  /** Selects the context-owned manager without connecting a server at load time. */
  readonly mode: 'manager'
}

/** Static server connection or dynamic manager configuration. */
export type Config = McpServerConfig | ManagerConfig

const Reconnect: z<ReconnectConfig> = z.object({
  enabled: z.boolean().default(RECONNECT_DEFAULTS.enabled),
  initialDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(RECONNECT_DEFAULTS.initialDelayMs),
  maxDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(RECONNECT_DEFAULTS.maxDelayMs),
  maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(RECONNECT_DEFAULTS.maxAttempts),
})

export const Config = z.union([
  z.object({
    mode: z.const('manager').required(),
  }),
  z.object({
    transport: z.const('stdio'),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
    command: z.string().required(),
    args: z.array(String).default([]),
    env: z.dict(String).default({}),
    cwd: z.string().default(''),
    toolCallTimeoutMs: z.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
    failOnStartupError: z.boolean().default(false),
    reconnect: Reconnect,
  }),
  z.object({
    transport: z.const('streamable-http'),
    serverName: z.string().required().pattern(SERVER_NAME_PATTERN),
    url: z.string().required(),
    headers: z.dict(String).default({}),
    toolCallTimeoutMs: z.number().default(DEFAULT_TOOL_CALL_TIMEOUT_MS),
    failOnStartupError: z.boolean().default(false),
    reconnect: Reconnect,
  }),
]) as unknown as z<Config>

// ---- Plugin apply ----

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpClients: McpClientManager
  }
}

/** Dynamic MCP client mounts owned by the target Cordis Context. */
export class McpClientManager extends Service {
  constructor(ctx: Context) {
    super(ctx, 'mcpClients')
  }

  /**
   * Connect one MCP server in a child fiber of the target Context.
   * @param targetCtx - Context that owns tools, connection, and cleanup.
   * @param config - fully resolved server connection configuration.
   * @returns disposer releasing the child fiber and its connection.
   */
  async mount(targetCtx: Context, config: McpServerConfig): Promise<() => Promise<void>> {
    const fiber = targetCtx.plugin({
      name: `mcp-client:${config.serverName}`,
      inject,
      apply: applyServer,
    }, config)
    await fiber
    return async () => { await fiber.dispose() }
  }
}

/**
 * Connect one MCP server and publish its initial tool generation before activation.
 * This entry remains explicitly `async`: Cordis treats a prototype-bearing
 * ordinary function as a constructor, whose returned Promise is not startup work.
 * @param ctx - plugin context carrying the tool registry.
 * @param config - resolved transport and server namespace configuration.
 * @returns startup readiness after connection and initial tool discovery settle.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if ('mode' in config) {
    await ctx.plugin(McpClientManager)
    return
  }
  await applyServer(ctx, config)
}

/** Connect one resolved static or manager-owned MCP server. */
async function applyServer(ctx: Context, config: McpServerConfig): Promise<void> {
  // Fail loud at load: reconnect misconfiguration (including programmatic
  // construction that bypassed Schemastery) rejects THIS instance before any
  // effect registers.
  const reconnect = resolveReconnectPolicy(config.reconnect, `mcp-client(${config.serverName}): reconnect`)

  // Reserve the namespace next: a duplicate `serverName` fails THIS instance
  // at load with an actionable error and leaves the earlier instance intact.
  ctx.effect(() => {
    let names = activeServerNames.get(ctx.root)
    if (!names) {
      names = new Set()
      activeServerNames.set(ctx.root, names)
    }
    if (names.has(config.serverName)) {
      throw new Error(
        `mcp-client: serverName "${config.serverName}" is already in use by another mcp-client instance — pick a unique serverName in cordis.yml`,
      )
    }
    names.add(config.serverName)
    let configs = activeServerConfigs.get(ctx.root)
    if (configs === undefined) {
      configs = new Map()
      activeServerConfigs.set(ctx.root, configs)
    }
    configs.set(config.serverName, { serverName: config.serverName, transport: config.transport })
    return () => {
      void names.delete(config.serverName)
      configs.delete(config.serverName)
    }
  }, 'mcp-client.serverName')

  // The supervisor owns the client/transport generations, the reconnect
  // loop, and the live tool registrations; disposal stops reconnection,
  // quiesces in-flight work, and unregisters the current generation.
  const connection = startConnection(ctx, config, reconnect)

  ctx.effect(() => {
    return () => connection.dispose()
  }, 'mcp-client.connection')

  // Block plugin activation on the initial connection + tool discovery so
  // Cordis consumers observe the tools immediately after the fiber activates.
  // When failOnStartupError is true, a failed initial attempt rejects the
  // fiber (Cordis rolls it back); otherwise the error is logged and the
  // supervisor enters its reconnect loop.
  const outcome = await connection.ready
  if (outcome.error !== undefined && config.failOnStartupError) {
    throw new Error(`mcp-client(${config.serverName}): initial connection or tool synchronization failed`, { cause: outcome.error })
  }
}
