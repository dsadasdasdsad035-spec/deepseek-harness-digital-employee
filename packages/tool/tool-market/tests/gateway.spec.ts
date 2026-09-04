import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolMarketGateway, apply } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('ToolMarketGateway', () => {
  it('installs trusted packages without activating uploaded code in the running Host', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-tool-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const ctx = contextWithTools([])
    await ctx.plugin(ToolMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('toolMarket') as ToolMarketGateway

    await expect(gateway.install({
      filename: 'release-notes.zip',
      archiveBase64: await signedArchive(privateKey, '1.0.0'),
    })).resolves.toEqual({
      ok: true,
      value: { packageId: 'release-notes', operation: 'installed', restartRequired: true },
    })
    await expect(gateway.list()).resolves.toMatchObject({
      ok: true,
      value: {
        entries: [{
          packageId: 'release-notes',
          version: '1.0.0',
          publisherId: 'deepseek-local',
          available: false,
          restartRequired: true,
          tools: [{ name: 'release_notes', available: false }],
        }],
      },
    })
    await ctx.fiber.dispose()
  })

  it('does not treat an unrelated same-name Tool as marketplace activation', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-tool-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const ctx = contextWithTools(['release_notes'])
    await ctx.plugin(ToolMarketGateway, {
      installRoot,
      trustedPublishers: [{
        id: 'deepseek-local',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      }],
    })
    const gateway = ctx.get('toolMarket') as ToolMarketGateway
    await gateway.install({
      filename: 'release-notes.zip',
      archiveBase64: await signedArchive(privateKey, '1.0.0'),
    })

    await expect(gateway.list()).resolves.toMatchObject({
      ok: true,
      value: {
        entries: [{
          available: false,
          restartRequired: true,
          tools: [{ name: 'release_notes', available: false }],
        }],
      },
    })
    await ctx.fiber.dispose()
  })

  it('rejects untrusted publishers and requires explicit managed upgrades', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-tool-market-'))
    roots.push(installRoot)
    const { privateKey } = generateKeyPairSync('ed25519')
    const ctx = contextWithTools([])
    await ctx.plugin(ToolMarketGateway, { installRoot, trustedPublishers: [] })
    const gateway = ctx.get('toolMarket') as ToolMarketGateway
    await expect(gateway.install({
      filename: 'release-notes.zip',
      archiveBase64: await signedArchive(privateKey, '1.0.0'),
    })).resolves.toEqual({
      ok: false,
      error: { code: 'untrusted-publisher', publisherId: 'deepseek-local' },
    })
    await ctx.fiber.dispose()
  })

  it('activates a still-trusted package only during a fresh Host composition', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-tool-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const trustedPublishers = [{
      id: 'deepseek-local',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }]
    const first = contextWithTools([])
    await first.plugin(ToolMarketGateway, { installRoot, trustedPublishers })
    const gateway = first.get('toolMarket') as ToolMarketGateway
    ;(globalThis as { __toolMarketActivated?: boolean }).__toolMarketActivated = false
    const entry = Buffer.from(`
      export default function (ctx) {
        globalThis.__toolMarketActivated = true
        ctx.tools.register({
          name: 'release_notes',
          description: 'Prepare notes.',
          parameters: { type: 'object', properties: {} },
        })
      }
    `)
    await gateway.install({
      filename: 'release-notes.zip',
      archiveBase64: await signedArchive(privateKey, '1.0.0', entry),
    })
    expect((globalThis as { __toolMarketActivated?: boolean }).__toolMarketActivated).toBe(false)
    await first.fiber.dispose()

    const fresh = contextWithTools([])
    await apply(fresh, { installRoot, trustedPublishers })
    expect((globalThis as { __toolMarketActivated?: boolean }).__toolMarketActivated).toBe(true)
    await fresh.fiber.dispose()
    delete (globalThis as { __toolMarketActivated?: boolean }).__toolMarketActivated
  })

  it('rejects declared Tool names already owned by another plugin before importing the package', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-tool-market-'))
    roots.push(installRoot)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const trustedPublishers = [{
      id: 'deepseek-local',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }]
    const first = contextWithTools([])
    await first.plugin(ToolMarketGateway, { installRoot, trustedPublishers })
    const gateway = first.get('toolMarket') as ToolMarketGateway
    ;(globalThis as { __toolMarketCollisionImported?: boolean }).__toolMarketCollisionImported = false
    const entry = Buffer.from(`
      globalThis.__toolMarketCollisionImported = true
      export default function () {}
    `)
    await gateway.install({
      filename: 'release-notes.zip',
      archiveBase64: await signedArchive(privateKey, '1.0.0', entry),
    })
    await first.fiber.dispose()

    const fresh = contextWithTools(['release_notes'])
    await expect(apply(fresh, { installRoot, trustedPublishers }))
      .rejects.toThrow('declared Tool "release_notes" conflicts with an existing registration')
    expect((globalThis as { __toolMarketCollisionImported?: boolean }).__toolMarketCollisionImported).toBe(false)
    await fresh.fiber.dispose()
    delete (globalThis as { __toolMarketCollisionImported?: boolean }).__toolMarketCollisionImported
  })
})

function contextWithTools(names: readonly string[]): Context {
  const ctx = new Context()
  const registered = [...names]
  ctx.provide('tools', {
    schemas: () => registered.map(name => ({
      name,
      description: `${name} description`,
      parameters: { type: 'object', properties: {} },
    })),
    register: (tool: { name: string }) => {
      registered.push(tool.name)
      return () => {
        const index = registered.indexOf(tool.name)
        if (index >= 0) registered.splice(index, 1)
      }
    },
  } as never)
  return ctx
}

async function signedArchive(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  version: string,
  entry = Buffer.from('throw new Error("must not execute during install")'),
): Promise<string> {
  const built = await signMarketplacePackage({
    kind: 'tool',
    descriptor: {
      format: 1,
      kind: 'tool',
      id: 'release-notes',
      version,
      display: { name: 'Release notes', description: 'Prepares release notes.' },
      publisher: { id: 'deepseek-local', signature: 'pending' },
      files: { 'plugin/index.js': '0'.repeat(64) },
      permissions: ['filesystem-read'],
      tools: [{ name: 'release_notes', description: 'Prepare notes.', inputDescription: 'Repository path.' }],
      entry: 'plugin/index.js',
    },
    files: { 'plugin/index.js': entry },
    publisherId: 'deepseek-local',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
  return built.archive.toString('base64')
}
