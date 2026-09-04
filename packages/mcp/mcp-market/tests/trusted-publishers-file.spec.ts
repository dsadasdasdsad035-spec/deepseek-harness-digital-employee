import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { afterEach, describe, expect, it } from 'vitest'
import { McpMarketGateway } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function trustEntry(): Promise<{ installRoot: string; trustFile: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-trust-'))
  roots.push(root)
  return { installRoot: join(root, 'packages'), trustFile: join(root, 'market-publishers.json') }
}

function context(): Context {
  const ctx = new Context()
  ctx.provide('mcpClients', { mount: async () => async () => {} } as never)
  ctx.provide('credentials', {
    resolve: async () => ({ value: 'resolved', source: 'memory' }),
    describe: async () => ({ configured: true, source: 'memory', writable: true }),
  } as never)
  return ctx
}

function archive(privateKeyPem: string): Promise<string> {
  return signMarketplacePackage({
    kind: 'mcp',
    descriptor: {
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
    },
    files: {},
    publisherId: 'deepseek-local',
    privateKeyPem,
  }).then(built => built.archive.toString('base64'))
}

describe('MCP marketplace trusted-publisher file', () => {
  it('trusts persistent records without launch-environment variables', async () => {
    const { installRoot, trustFile } = await trustEntry()
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    await writeFile(trustFile, JSON.stringify([{ id: 'deepseek-local', publicKeyPem }]), { mode: 0o600 })
    const ctx = context()

    await ctx.plugin(McpMarketGateway, { installRoot, trustedPublishers: [], trustedPublishersFile: trustFile })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway
    await expect(gateway.install({ filename: 'project-tracker.zip', archiveBase64: await archive(privateKeyPem) }))
      .resolves.toMatchObject({ ok: true, value: { operation: 'installed' } })
    await ctx.fiber.dispose()
  })

  it('fails composition for malformed files and cross-source duplicate ids', async () => {
    const { installRoot, trustFile } = await trustEntry()
    const { publicKey } = generateKeyPairSync('ed25519')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    await writeFile(trustFile, '{', { mode: 0o600 })
    const malformed = context()
    await expect(malformed.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [],
      trustedPublishersFile: trustFile,
    })).rejects.toThrow('must contain a JSON array')
    await malformed.fiber.dispose()

    await writeFile(trustFile, JSON.stringify([{ id: 'deepseek-local', publicKeyPem }]), { mode: 0o600 })
    const duplicated = context()
    await expect(duplicated.plugin(McpMarketGateway, {
      installRoot,
      trustedPublishers: [{ id: 'deepseek-local', publicKeyPem: 'different' }],
      trustedPublishersFile: trustFile,
    })).rejects.toThrow('configured more than once')
    await duplicated.fiber.dispose()
  })
})
