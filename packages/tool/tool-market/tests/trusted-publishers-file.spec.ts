import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolMarketGateway } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function trustEntry(): Promise<{ installRoot: string; trustFile: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tool-trust-'))
  roots.push(root)
  return { installRoot: join(root, 'tools'), trustFile: join(root, 'market-publishers.json') }
}

function context(): Context {
  const ctx = new Context()
  ctx.provide('tools', {
    schemas: () => [],
    register: () => () => {},
  } as never)
  return ctx
}

function archive(privateKeyPem: string): Promise<string> {
  return signMarketplacePackage({
    kind: 'tool',
    descriptor: {
      format: 1,
      kind: 'tool',
      id: 'release-notes',
      version: '1.0.0',
      display: { name: 'Release notes', description: 'Prepares release notes.' },
      publisher: { id: 'deepseek-local', signature: 'pending' },
      files: { 'plugin/index.js': '0'.repeat(64) },
      permissions: ['filesystem-read'],
      tools: [{ name: 'release_notes', description: 'Prepare notes.', inputDescription: 'Repository path.' }],
      entry: 'plugin/index.js',
    },
    files: { 'plugin/index.js': new TextEncoder().encode('export default function () {}\n') },
    publisherId: 'deepseek-local',
    privateKeyPem,
  }).then(built => built.archive.toString('base64'))
}

describe('Tool marketplace trusted-publisher file', () => {
  it('trusts persistent records without launch-environment variables', async () => {
    const { installRoot, trustFile } = await trustEntry()
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    await writeFile(trustFile, JSON.stringify([{ id: 'deepseek-local', publicKeyPem }]), { mode: 0o600 })
    const ctx = context()

    await ctx.plugin(ToolMarketGateway, { installRoot, trustedPublishers: [], trustedPublishersFile: trustFile })
    const gateway = ctx.get('toolMarket') as ToolMarketGateway
    await expect(gateway.install({ filename: 'release-notes.zip', archiveBase64: await archive(privateKeyPem) }))
      .resolves.toMatchObject({ ok: true, value: { operation: 'installed' } })
    await ctx.fiber.dispose()
  })

  it('fails composition for malformed files and cross-source duplicate ids', async () => {
    const { installRoot, trustFile } = await trustEntry()
    const { publicKey } = generateKeyPairSync('ed25519')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    await writeFile(trustFile, '{', { mode: 0o600 })
    const malformed = context()
    await expect(malformed.plugin(ToolMarketGateway, {
      installRoot,
      trustedPublishers: [],
      trustedPublishersFile: trustFile,
    })).rejects.toThrow('must contain a JSON array')
    await malformed.fiber.dispose()

    await writeFile(trustFile, JSON.stringify([{ id: 'deepseek-local', publicKeyPem }]), { mode: 0o600 })
    const duplicated = context()
    await expect(duplicated.plugin(ToolMarketGateway, {
      installRoot,
      trustedPublishers: [{ id: 'deepseek-local', publicKeyPem: 'different' }],
      trustedPublishersFile: trustFile,
    })).rejects.toThrow('configured more than once')
    await duplicated.fiber.dispose()
  })
})
