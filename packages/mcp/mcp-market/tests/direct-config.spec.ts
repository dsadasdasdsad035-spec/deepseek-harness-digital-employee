import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpMarketGateway } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

interface Harness {
  readonly ctx: Context
  readonly gateway: McpMarketGateway
  readonly mount: ReturnType<typeof vi.fn>
  readonly installRoot: string
}

async function startHarness(): Promise<Harness> {
  const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-direct-'))
  roots.push(installRoot)
  const mount = vi.fn(async (_owner: unknown, _config: unknown) => async () => {})
  const resolve = vi.fn(async () => ({ value: 'resolved-secret', source: 'memory' }))
  const describe = vi.fn(async () => ({ configured: true, source: 'memory', writable: true }))
  const ctx = new Context()
  ctx.provide('mcpClients', { mount } as never)
  ctx.provide('credentials', { resolve, describe } as never)
  await ctx.plugin(McpMarketGateway, { installRoot, trustedPublishers: [], allowUnsignedPackages: true })
  const gateway = ctx.get('mcpMarket') as McpMarketGateway
  return { ctx, gateway, mount, installRoot }
}

const HTTP_SAVE = {
  serverName: 'remote-notes',
  declaration: {
    transport: 'streamable-http',
    url: 'https://mcp.example.com',
    headers: { Authorization: '' },
    headerCredentials: { Authorization: 'NOTES_TOKEN' },
  },
} as const

const STDIO_SAVE = (cwd: string) => ({
  serverName: 'local-fs',
  declaration: {
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: { LOG_LEVEL: 'info', API_TOKEN: '' },
    envCredentials: { API_TOKEN: 'LOCAL_TOKEN' },
    cwd,
  },
} as const)

describe('McpMarketGateway direct configuration', () => {
  it('saves a Streamable HTTP entry, hot-mounts it, and lists it without secret values', async () => {
    const { ctx, gateway, mount } = await startHarness()
    await expect(gateway.saveDirectConfig({ ...HTTP_SAVE })).resolves.toMatchObject({
      ok: true,
      value: { serverName: 'remote-notes', restartRequired: false },
    })
    expect(mount).toHaveBeenCalledTimes(1)
    expect(mount.mock.calls[0]?.[1]).toMatchObject({
      serverName: 'remote-notes',
      url: 'https://mcp.example.com',
      headers: { Authorization: 'resolved-secret' },
    })
    const list = await gateway.list()
    expect(JSON.stringify(list)).not.toContain('resolved-secret')
    expect(list).toMatchObject({
      ok: true,
      value: { entries: [{ source: 'direct', available: true, restartRequired: false }] },
    })
    await ctx.fiber.dispose()
    expect(mount).toHaveBeenCalledTimes(1)
  })

  it('requires local-execution confirmation before a stdio save mounts anything', async () => {
    const { ctx, gateway, mount, installRoot } = await startHarness()
    const result = await gateway.saveDirectConfig({ ...STDIO_SAVE(installRoot) })
    expect(result).toMatchObject({ ok: false, error: { code: 'local-execution-confirmation-required' } })
    expect(mount).not.toHaveBeenCalled()
    expect(await gateway.list()).toMatchObject({ ok: true, value: { entries: [] } })
    await expect(gateway.saveDirectConfig({ ...STDIO_SAVE(installRoot), confirmLocalExecution: true }))
      .resolves.toMatchObject({ ok: true })
    expect(mount).toHaveBeenCalledTimes(1)
    await ctx.fiber.dispose()
  })

  it('rejects non-allowlisted interpreters and cwd paths that do not exist', async () => {
    const { ctx, gateway, installRoot } = await startHarness()
    const denied = await gateway.saveDirectConfig({
      serverName: 'local-fs',
      declaration: { ...STDIO_SAVE(installRoot).declaration, command: 'python3' },
      confirmLocalExecution: true,
    })
    expect(denied).toMatchObject({ ok: false, error: { code: 'invalid-direct-config' } })
    const missingCwd = await gateway.saveDirectConfig({
      serverName: 'local-fs',
      declaration: { ...STDIO_SAVE(installRoot).declaration, cwd: join(installRoot, 'missing') },
      confirmLocalExecution: true,
    })
    expect(missingCwd).toMatchObject({ ok: false, error: { code: 'invalid-direct-config' } })
    await ctx.fiber.dispose()
  })

  it('rejects a non-empty fixed value where a credential reference is required', async () => {
    const { ctx, gateway } = await startHarness()
    const result = await gateway.saveDirectConfig({
      serverName: 'remote-notes',
      declaration: {
        transport: 'streamable-http',
        url: 'https://mcp.example.com',
        headers: { Authorization: 'sk-hardcoded-key' },
        headerCredentials: { Authorization: 'NOTES_TOKEN' },
      },
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-direct-config' } })
    await ctx.fiber.dispose()
  })

  it('enforces server-name uniqueness against direct entries and installed packages', async () => {
    const { ctx, gateway, installRoot, mount } = await startHarness()
    await gateway.saveDirectConfig({ ...HTTP_SAVE })
    const duplicate = await gateway.saveDirectConfig({
      serverName: 'remote-notes',
      declaration: { transport: 'streamable-http', url: 'https://other.example.com', headers: {}, headerCredentials: {} },
    })
    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: 'direct-config-conflict', heldBy: 'direct' },
    })
    const collidingPackage = await signedArchive({
      id: 'clashing',
      servers: [{ id: 'remote-notes', transport: 'streamable-http', url: 'https://mcp.example.com' }],
    })
    await expect(gateway.install({ filename: 'clashing.zip', archiveBase64: collidingPackage })).resolves.toMatchObject({
      ok: false,
      error: { code: 'direct-config-conflict', heldBy: 'direct' },
    })
    expect(mount).toHaveBeenCalledTimes(1)
    void installRoot
    await ctx.fiber.dispose()
  })

  it('replaces a live same-name server on edit and unmounts on delete', async () => {
    const { ctx, gateway, mount, installRoot } = await startHarness()
    const saved = await gateway.saveDirectConfig({ ...HTTP_SAVE })
    const entryId = saved.ok === true ? saved.value.entryId : undefined
    const firstDisposer = await mount.mock.results[0]?.value as () => Promise<void>
    await gateway.saveDirectConfig({
      entryId,
      serverName: 'remote-notes',
      declaration: { transport: 'streamable-http', url: 'https://mcp2.example.com', headers: {}, headerCredentials: {} },
    })
    expect(mount).toHaveBeenCalledTimes(2)
    expect(mount.mock.calls[1]?.[1]).toMatchObject({ url: 'https://mcp2.example.com' })
    await firstDisposer()
    expect(mount).toHaveBeenCalledTimes(2)
    const secondDisposer = await mount.mock.results[1]?.value as () => Promise<void>
    await gateway.deleteDirectConfig({ entryId: entryId as never })
    await secondDisposer()
    expect(await gateway.list()).toMatchObject({ ok: true, value: { entries: [] } })
    void installRoot
    await ctx.fiber.dispose()
  })

  it('remounts persisted direct entries during fresh composition', async () => {
    const first = await startHarness()
    await first.gateway.saveDirectConfig({ ...HTTP_SAVE })
    await first.ctx.fiber.dispose()

    const installRoot = first.installRoot
    const mount = vi.fn(async (_owner: unknown, _config: unknown) => async () => {})
    const resolve = vi.fn(async () => ({ value: 'resolved-secret', source: 'memory' }))
    const describe = vi.fn(async () => ({ configured: true, source: 'memory', writable: true }))
    const ctx = new Context()
    ctx.provide('mcpClients', { mount } as never)
    ctx.provide('credentials', { resolve, describe } as never)
    await ctx.plugin(McpMarketGateway, { installRoot, trustedPublishers: [] })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway
    await gateway.activateConfigured()
    expect(mount).toHaveBeenCalledTimes(1)
    expect(mount.mock.calls[0]?.[1]).toMatchObject({ serverName: 'remote-notes' })
    await ctx.fiber.dispose()
  })
})

async function signedArchive(descriptor: {
  readonly id: string
  readonly servers: readonly Record<string, unknown>[]
}): Promise<string> {
  const { privateKey } = generateKeyPairSync('ed25519')
  const built = await signMarketplacePackage({
    kind: 'mcp',
    descriptor: {
      format: 1,
      kind: 'mcp',
      id: descriptor.id,
      version: '1.0.0',
      display: { name: descriptor.id, description: 'test package' },
      publisher: { id: 'deepseek-local', signature: 'pending' },
      files: {},
      servers: descriptor.servers as never,
    },
    files: {},
    publisherId: 'deepseek-local',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
  return built.archive.toString('base64')
}
