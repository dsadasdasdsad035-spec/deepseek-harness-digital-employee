import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolMarketGateway, apply } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function installRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tool-unsigned-'))
  roots.push(root)
  return root
}

function context(): Context {
  const ctx = new Context()
  const registered: string[] = []
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

async function templateArchiveBase64(): Promise<string> {
  const templatePath = fileURLToPath(new URL('../../../../apps/web/public/tool-market-template.zip', import.meta.url))
  return (await readFile(templatePath)).toString('base64')
}

/** Placeholder-signature archive whose file table still matches its bytes. */
function unsignedArchiveBase64(): string {
  const entry = Buffer.from('export default function (ctx) {\n  ctx.tools.register({ name: "unsigned_echo", description: "Echo.", parameters: { type: "object", properties: {} } })\n}\n')
  return Buffer.from(zipSync({
    'tool-package.json': Buffer.from(JSON.stringify({
      format: 1,
      kind: 'tool',
      id: 'unsigned-echo',
      version: '1.0.0',
      display: { name: 'Unsigned echo', description: 'Development override fixture.' },
      publisher: { id: 'replace-with-publisher-id', signature: 'REPLACE_WITH_ED25519_SIGNATURE_BASE64' },
      files: { 'plugin/index.js': createHash('sha256').update(entry).digest('hex') },
      permissions: ['filesystem-read'],
      tools: [{ name: 'unsigned_echo', description: 'Echo.', inputDescription: 'None.' }],
      entry: 'plugin/index.js',
    })),
    'plugin/index.js': entry,
  })).toString('base64')
}

describe('Tool marketplace unsigned override', () => {
  it('installs the shipped template without signing when explicitly enabled', async () => {
    const root = await installRoot()
    const ctx = context()
    await ctx.plugin(ToolMarketGateway, {
      installRoot: root,
      trustedPublishers: [],
      allowUnsignedPackages: true,
    })
    const gateway = ctx.get('toolMarket') as ToolMarketGateway

    await expect(gateway.install({
      filename: 'tool-market-template.zip',
      archiveBase64: await templateArchiveBase64(),
    })).resolves.toEqual({
      ok: true,
      value: { packageId: 'tool-market-template', operation: 'installed', restartRequired: true },
    })
    await ctx.fiber.dispose()
  })

  it('activates unsigned packages while enabled and rejects them once the override is removed', async () => {
    const root = await installRoot()
    const first = context()
    await first.plugin(ToolMarketGateway, {
      installRoot: root,
      trustedPublishers: [],
      allowUnsignedPackages: true,
    })
    const gateway = first.get('toolMarket') as ToolMarketGateway
    await expect(gateway.install({
      filename: 'unsigned-echo.zip',
      archiveBase64: unsignedArchiveBase64(),
    })).resolves.toMatchObject({ ok: true })
    await first.fiber.dispose()

    const enabled = context()
    await expect(apply(enabled, {
      installRoot: root,
      trustedPublishers: [],
      allowUnsignedPackages: true,
    })).resolves.toBeUndefined()
    await enabled.fiber.dispose()

    const strict = context()
    await expect(apply(strict, {
      installRoot: root,
      trustedPublishers: [],
      allowUnsignedPackages: false,
    })).rejects.toThrow('untrusted')
    await strict.fiber.dispose()
  })
})
