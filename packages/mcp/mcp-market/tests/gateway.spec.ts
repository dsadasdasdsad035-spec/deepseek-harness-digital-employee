import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { descriptorSignaturePayload, parseMcpPackageDescriptor } from '@deepseek-ai/dsh-marketplace-core'
import { zipSync } from 'fflate'
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
      archiveBase64: signedArchive(privateKey),
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
    await gateway.install({ filename: 'project-tracker.zip', archiveBase64: signedArchive(privateKey) })
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
    await gateway.install({ filename: 'project-tracker.zip', archiveBase64: signedArchive(privateKey) })
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
      activeServerNames: () => [],
      credentialInfo: async () => ({ configured: true, writable: true }),
    })
    await service.install({
      filename: 'project-tracker.zip',
      archiveBase64: signedArchive(privateKey),
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
})

function signedArchive(privateKey: ReturnType<typeof generateKeyPairSync>['privateKey']): string {
  const unsigned = parseMcpPackageDescriptor({
    format: 1,
    kind: 'mcp',
    id: 'project-tracker',
    version: '1.0.0',
    display: { name: 'Project tracker', description: 'Reads project tickets.' },
    publisher: { id: 'deepseek-local', signature: 'pending' },
    files: {},
    servers: [{
      id: 'project-tracker',
      transport: 'streamable-http',
      url: 'https://mcp.example.test',
      headers: { Authorization: '' },
      credentialReferences: { Authorization: 'PROJECT_TRACKER_TOKEN' },
    }],
  })
  const signature = sign(null, descriptorSignaturePayload(unsigned), privateKey).toString('base64')
  return Buffer.from(zipSync({
    'mcp-package.json': Buffer.from(JSON.stringify({
      ...unsigned,
      publisher: { ...unsigned.publisher, signature },
    })),
  })).toString('base64')
}
