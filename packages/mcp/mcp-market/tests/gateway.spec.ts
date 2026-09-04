import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpMarketGateway } from '../src/index.ts'
import { McpMarketService } from '../src/service.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('McpMarketGateway', () => {
  it('persists credential references only and activates them through the manager', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const mount = vi.fn(async (_owner: unknown, _config: unknown) => async () => {})
    const resolve = vi.fn(async () => ({ value: 'Bearer resolved-secret', source: 'memory' }))
    const describe = vi.fn(async () => ({ configured: true, source: 'memory', writable: true }))
    const ctx = new Context()
    ctx.provide('mcpClients', { mount } as never)
    ctx.provide('credentials', { resolve, describe } as never)
    await ctx.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway

    await expect(gateway.install({
      filename: 'project-tracker.zip',
      archiveBase64: await signedArchive(privateKey),
    })).resolves.toMatchObject({ ok: true })
    await expect(gateway.configure({
      packageId: 'project-tracker' as never,
      credentialReferences: { PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN' },
    })).resolves.toEqual({
      ok: true,
      value: {
        packageId: 'project-tracker',
        credentialReferences: { PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN' },
        restartRequired: true,
      },
    })
    await gateway.activateConfigured()
    expect(mount).toHaveBeenCalledTimes(1)
    expect(mount.mock.calls[0]?.[1]).toMatchObject({
      serverName: 'project-tracker',
      headers: { Authorization: 'Bearer resolved-secret' },
    })
    const list = await gateway.list()
    expect(JSON.stringify(list)).not.toContain('resolved-secret')
    expect(list).toMatchObject({
      ok: true,
      value: { entries: [{ configured: true, credentialRequirements: [{
        slot: 'PROJECT_TRACKER_TOKEN',
        reference: 'PROJECT_TRACKER_TOKEN',
        configured: true,
      }] }] },
    })
    await ctx.fiber.dispose()
  })

  it('rejects secret-looking values where credential references are required', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const ctx = new Context()
    ctx.provide('mcpClients', { mount: vi.fn() } as never)
    ctx.provide('credentials', { resolve: vi.fn(), describe: vi.fn() } as never)
    await ctx.plugin(McpMarketGateway, { installRoot, trustedPublishers: [] })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway
    await expect(gateway.configure({
      packageId: 'project-tracker' as never,
      credentialReferences: { PROJECT_TRACKER_TOKEN: 'Bearer raw-secret' },
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-credential-reference', slot: 'PROJECT_TRACKER_TOKEN' },
    })
    await ctx.fiber.dispose()
  })

  it('does not resolve credentials after an installed descriptor is modified', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const mount = vi.fn(async () => async () => {})
    const resolve = vi.fn(async () => ({ value: 'Bearer resolved-secret', source: 'memory' }))
    const ctx = new Context()
    ctx.provide('mcpClients', { mount } as never)
    ctx.provide('credentials', {
      resolve,
      describe: vi.fn(async () => ({ configured: true, source: 'memory', writable: true })),
    } as never)
    const trustedPublishers = [{
      id: 'deepseek-local',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }]
    await ctx.plugin(McpMarketGateway, { installRoot, trustedPublishers })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway
    await gateway.install({ filename: 'project-tracker.zip', archiveBase64: await signedArchive(privateKey) })
    await gateway.configure({
      packageId: 'project-tracker' as never,
      credentialReferences: { PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN' },
    })
    const descriptorFile = join(installRoot, 'project-tracker', 'mcp-package.json')
    const descriptor = JSON.parse(await readFile(descriptorFile, 'utf8')) as {
      servers: Array<{ url: string }>
    }
    descriptor.servers[0]!.url = 'https://attacker.example.test'
    await writeFile(descriptorFile, JSON.stringify(descriptor))

    await gateway.activateConfigured()

    expect(resolve).not.toHaveBeenCalled()
    expect(mount).not.toHaveBeenCalled()
    await expect(gateway.list()).resolves.toMatchObject({
      ok: true,
      value: { entries: [{ available: false, restartRequired: true }] },
    })
    await ctx.fiber.dispose()
  })

  it('does not treat an unrelated same-name MCP client as marketplace activation', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const ctx = new Context()
    ctx.provide('mcpClients', { mount: vi.fn() } as never)
    ctx.provide('credentials', {
      resolve: vi.fn(),
      describe: vi.fn(async () => ({ configured: true, source: 'memory', writable: true })),
    } as never)
    await ctx.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway
    await gateway.install({ filename: 'project-tracker.zip', archiveBase64: await signedArchive(privateKey) })
    await gateway.configure({
      packageId: 'project-tracker' as never,
      credentialReferences: { PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN' },
    })

    await expect(gateway.list()).resolves.toMatchObject({
      ok: true,
      value: { entries: [{ available: false, restartRequired: true }] },
    })
    await ctx.fiber.dispose()
  })

  it('rolls back earlier servers when a later server in the package fails to mount', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const disposeFirst = vi.fn(async () => {})
    const mount = vi.fn()
      .mockResolvedValueOnce(disposeFirst)
      .mockRejectedValueOnce(new Error('second server failed'))
    const ctx = new Context()
    ctx.provide('mcpClients', { mount } as never)
    ctx.provide('credentials', {
      resolve: vi.fn(async () => ({ value: 'Bearer resolved-secret', source: 'memory' })),
      describe: vi.fn(async () => ({ configured: true, source: 'memory', writable: true })),
    } as never)
    await ctx.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway
    await gateway.install({
      filename: 'project-tracker.zip',
      archiveBase64: await signedArchive(privateKey, ['project-tracker', 'project-tracker-secondary']),
    })
    await gateway.configure({
      packageId: 'project-tracker' as never,
      credentialReferences: { PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN' },
    })

    await gateway.activateConfigured()

    expect(mount).toHaveBeenCalledTimes(2)
    expect(disposeFirst).toHaveBeenCalledOnce()
    await expect(gateway.list()).resolves.toMatchObject({
      ok: true,
      value: { entries: [{ available: false }] },
    })
    await ctx.fiber.dispose()
  })

  it('serializes configuration and uninstall mutations for the same package', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const trustedPublishers = [{
      id: 'deepseek-local',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }]
    const service = new McpMarketService({
      installRoot,
      trustedPublishers,
      stdioInterpreters: ['node'],
      allowUnsignedPackages: false,
      activeServerNames: () => [],
      credentialInfo: async () => ({ configured: true, writable: true }),
    })
    await service.install({
      filename: 'project-tracker.zip',
      archiveBase64: await signedArchive(privateKey),
    })
    const descriptor = await service.descriptor('project-tracker')
    const enteredDescriptor: PromiseWithResolvers<void> = Promise.withResolvers()
    const releaseDescriptor: PromiseWithResolvers<void> = Promise.withResolvers()
    vi.spyOn(service, 'descriptor').mockImplementation(async () => {
      enteredDescriptor.resolve()
      await releaseDescriptor.promise
      return descriptor
    })

    const configure = service.configure({
      packageId: 'project-tracker' as never,
      credentialReferences: { PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN' },
    })
    await enteredDescriptor.promise
    const uninstall = service.uninstall('project-tracker' as never)
    let uninstallSettled = false
    void uninstall.finally(() => { uninstallSettled = true })
    await Promise.resolve()
    expect(uninstallSettled).toBe(false)

    releaseDescriptor.resolve()
    await expect(configure).resolves.toMatchObject({ ok: true })
    await expect(uninstall).resolves.toMatchObject({ ok: true })
    await expect(service.list()).resolves.toEqual({ ok: true, value: { entries: [] } })
  })

  it('installs, configures, and activates a stdio server from its managed directory', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const mount = vi.fn(async (_owner: unknown, _config: unknown) => async () => {})
    const ctx = new Context()
    ctx.provide('mcpClients', { mount } as never)
    ctx.provide('credentials', {
      resolve: vi.fn(async () => ({ value: 'resolved-secret', source: 'memory' })),
      describe: vi.fn(async () => ({ configured: true, source: 'memory', writable: true })),
    } as never)
    await ctx.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway

    await expect(gateway.install({
      filename: 'local-suite.zip',
      archiveBase64: await signedArchive(privateKey, { stdio: true }),
      confirmLocalExecution: true,
    })).resolves.toMatchObject({ ok: true })
    await gateway.configure({
      packageId: 'local-suite' as never,
      credentialReferences: { LOCAL_SUITE_TOKEN: 'LOCAL_SUITE_TOKEN' },
    })

    await gateway.activateConfigured()

    expect(mount).toHaveBeenCalledTimes(1)
    expect(mount.mock.calls[0]?.[1]).toMatchObject({
      transport: 'stdio',
      serverName: 'local-suite',
      command: 'node',
      args: ['server/index.js', '--verbose'],
      env: { LOG_LEVEL: 'info', API_TOKEN: 'resolved-secret' },
      cwd: join(installRoot, 'local-suite'),
    })
    await expect(gateway.list()).resolves.toMatchObject({
      ok: true,
      value: { entries: [{ permissions: ['subprocess'], servers: [{ transport: 'stdio' }] }] },
    })
    const templates = await gateway.templateConfigurations()
    expect(templates[0]?.declaration).toMatchObject({
      transport: 'stdio',
      command: 'node',
      envCredentials: { API_TOKEN: 'LOCAL_SUITE_TOKEN' },
      cwd: join(installRoot, 'local-suite'),
    })
    expect(JSON.stringify(templates)).not.toContain('resolved-secret')
    await ctx.fiber.dispose()
  })

  it('activates mixed-transport packages through both mount paths', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const mount = vi.fn(async (_owner: unknown, _config: unknown) => async () => {})
    const ctx = new Context()
    ctx.provide('mcpClients', { mount } as never)
    ctx.provide('credentials', {
      resolve: vi.fn(async () => ({ value: 'resolved-secret', source: 'memory' })),
      describe: vi.fn(async () => ({ configured: true, source: 'memory', writable: true })),
    } as never)
    await ctx.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway

    await gateway.install({
      filename: 'mixed-suite.zip',
      archiveBase64: await signedArchive(privateKey, { mixed: true }),
      confirmLocalExecution: true,
    })
    await gateway.configure({
      packageId: 'mixed-suite' as never,
      credentialReferences: {
        LOCAL_SUITE_TOKEN: 'LOCAL_SUITE_TOKEN',
        PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN',
      },
    })

    await gateway.activateConfigured()

    expect(mount).toHaveBeenCalledTimes(2)
    expect(mount.mock.calls[0]?.[1]).toMatchObject({ transport: 'stdio', serverName: 'local-suite' })
    expect(mount.mock.calls[1]?.[1]).toMatchObject({ transport: 'streamable-http', serverName: 'remote-suite' })
    await ctx.fiber.dispose()
  })

  it('rejects a stdio command outside the interpreter allowlist at install', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const ctx = new Context()
    ctx.provide('mcpClients', { mount: vi.fn() } as never)
    ctx.provide('credentials', { resolve: vi.fn(), describe: vi.fn() } as never)
    await ctx.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway

    await expect(gateway.install({
      filename: 'local-suite.zip',
      archiveBase64: await signedArchive(privateKey, { stdio: true, command: 'python3' }),
    })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-package', reason: 'stdio command "python3" is not an allowed interpreter' },
    })
    await ctx.fiber.dispose()
  })

  it('requires explicit confirmation before installing a stdio package', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const ctx = new Context()
    ctx.provide('mcpClients', { mount: vi.fn() } as never)
    ctx.provide('credentials', { resolve: vi.fn(), describe: vi.fn() } as never)
    await ctx.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway

    await expect(gateway.install({
      filename: 'local-suite.zip',
      archiveBase64: await signedArchive(privateKey, { stdio: true }),
    })).resolves.toEqual({
      ok: false,
      error: {
        code: 'local-execution-confirmation-required',
        candidatePermissions: ['subprocess'],
      },
    })
    await expect(gateway.list()).resolves.toMatchObject({
      ok: true,
      value: { entries: [] },
    })
    await ctx.fiber.dispose()
  })

  it('reports a stdio package as a diagnostic when activation narrows the allowlist', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-mcp-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const trustedPublishers = [{
      id: 'deepseek-local',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }]
    const seeding = new McpMarketService({
      installRoot,
      trustedPublishers,
      stdioInterpreters: ['python3'],
      allowUnsignedPackages: false,
      activeServerNames: () => [],
      credentialInfo: async () => ({ configured: true, writable: true }),
    })
    await seeding.install({
      filename: 'local-suite.zip',
      archiveBase64: await signedArchive(privateKey, { stdio: true, command: 'python3' }),
      confirmLocalExecution: true,
    })
    await seeding.configure({
      packageId: 'local-suite' as never,
      credentialReferences: { LOCAL_SUITE_TOKEN: 'LOCAL_SUITE_TOKEN' },
    })

    const mount = vi.fn(async (_owner: unknown, _config: unknown) => async () => {})
    const ctx = new Context()
    ctx.provide('mcpClients', { mount } as never)
    ctx.provide('credentials', {
      resolve: vi.fn(async () => ({ value: 'resolved-secret', source: 'memory' })),
      describe: vi.fn(async () => ({ configured: true, source: 'memory', writable: true })),
    } as never)
    await ctx.plugin(McpMarketGateway, { installRoot, trustedPublishers })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway

    await gateway.activateConfigured()

    expect(mount).not.toHaveBeenCalled()
    await expect(gateway.list()).resolves.toMatchObject({
      ok: true,
      value: { entries: [{
        available: false,
        diagnostic: expect.stringContaining('stdio command "python3" is not an allowed interpreter'),
      }] },
    })
    await ctx.fiber.dispose()
  })
})

/** Shape selectors for {@link signedArchive} fixture assembly. */
interface SignedArchiveVariant {
  readonly stdio?: boolean
  readonly mixed?: boolean
  readonly command?: string
}

const isIdList = (value: readonly string[] | SignedArchiveVariant): value is readonly string[] => Array.isArray(value)

async function signedArchive(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  variant: readonly string[] | SignedArchiveVariant = ['project-tracker'],
): Promise<string> {
  const stdioServer = (command: string) => ({
    id: 'local-suite',
    transport: 'stdio' as const,
    command,
    args: ['server/index.js', '--verbose'],
    env: { LOG_LEVEL: 'info', API_TOKEN: '' },
    credentialReferences: { API_TOKEN: 'LOCAL_SUITE_TOKEN' },
  })
  const httpServer = {
    id: 'remote-suite',
    transport: 'streamable-http' as const,
    url: 'https://mcp.example.test',
    headers: { Authorization: '' },
    credentialReferences: { Authorization: 'PROJECT_TRACKER_TOKEN' },
  }
  const options: SignedArchiveVariant = isIdList(variant) ? {} : variant
  const servers = isIdList(variant)
    ? variant.map(id => ({
      id,
      transport: 'streamable-http' as const,
      url: 'https://mcp.example.test',
      headers: { Authorization: '' },
      credentialReferences: { Authorization: 'PROJECT_TRACKER_TOKEN' },
    }))
    : options.mixed === true
      ? [stdioServer(options.command ?? 'node'), httpServer]
      : options.stdio === true
        ? [stdioServer(options.command ?? 'node')]
        : [httpServer]
  const carriesStdio = servers.some(server => server.transport === 'stdio')
  const packageId = !carriesStdio
    ? 'project-tracker'
    : options.mixed === true ? 'mixed-suite' : 'local-suite'
  const built = await signMarketplacePackage({
    kind: 'mcp',
    descriptor: {
      format: 1,
      kind: 'mcp',
      id: packageId,
      version: '1.0.0',
      display: { name: 'MCP suite', description: 'Marketplace MCP servers.' },
      publisher: { id: 'deepseek-local', signature: 'pending' },
      files: carriesStdio ? { 'server/index.js': 'GENERATED_SHA256' } : {},
      servers,
    },
    files: carriesStdio ? { 'server/index.js': new TextEncoder().encode('// stdio MCP server entry\n') } : {},
    publisherId: 'deepseek-local',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
  return built.archive.toString('base64')
}
