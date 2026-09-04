import { generateKeyPairSync } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { runMarketPackageCli, signMarketplacePackage } from '@deepseek-ai/dsh-marketplace-core'
import { unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolMarketGateway } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Tool publisher template round trip', () => {
  it('installs the shipped template after toolchain signing with its emitted trust record', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-tool-template-'))
    roots.push(installRoot)
    const templatePath = fileURLToPath(new URL('../../../../apps/web/public/tool-market-template.zip', import.meta.url))
    const entries = unzipSync(await readFile(templatePath))
    const rawDescriptor = JSON.parse(new TextDecoder().decode(entries['tool-package.json'])) as {
      publisher: { id: string }
      files: Record<string, string>
    }
    expect(rawDescriptor.publisher.id).toBe('replace-with-publisher-id')

    const { privateKey } = generateKeyPairSync('ed25519')
    const built = await signMarketplacePackage({
      kind: 'tool',
      descriptor: rawDescriptor,
      files: Object.fromEntries(Object.keys(rawDescriptor.files).map(path => [path, entries[path]!])),
      publisherId: 'deepseek-local',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })

    const ctx = new Context()
    ctx.provide('tools', {
      schemas: () => [],
      register: () => () => {},
    } as never)
    await ctx.plugin(ToolMarketGateway, { installRoot, trustedPublishers: [built.trustRecord] })
    const gateway = ctx.get('toolMarket') as ToolMarketGateway
    await expect(gateway.install({
      filename: 'tool-market-template.zip',
      archiveBase64: built.archive.toString('base64'),
    })).resolves.toEqual({
      ok: true,
      value: { packageId: 'tool-market-template', operation: 'installed', restartRequired: true },
    })
    await ctx.fiber.dispose()
  })

  it('installs after CLI signing and persistent trust without launch-environment variables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-tool-template-cli-'))
    roots.push(root)
    const templatePath = fileURLToPath(new URL('../../../../apps/web/public/tool-market-template.zip', import.meta.url))
    const entries = unzipSync(await readFile(templatePath))
    const source = join(root, 'source')
    await mkdir(join(source, 'plugin'), { recursive: true })
    for (const [path, bytes] of Object.entries(entries)) {
      await writeFile(join(source, path), bytes)
    }
    const output = join(root, 'signed.zip')
    const keyPath = join(root, 'publisher.pem')
    const trustFile = join(root, 'market-publishers.json')

    const outcome = await runMarketPackageCli([
      source, '--kind', 'tool', '--publisher-id', 'deepseek-local',
      '--generate-key', keyPath, '--output', output, '--trust-file', trustFile,
    ])
    expect(outcome).toMatchObject({ ok: true, outputPath: output })

    const installRoot = join(root, 'tools')
    const ctx = new Context()
    ctx.provide('tools', {
      schemas: () => [],
      register: () => () => {},
    } as never)
    await ctx.plugin(ToolMarketGateway, { installRoot, trustedPublishers: [], trustedPublishersFile: trustFile })
    const gateway = ctx.get('toolMarket') as ToolMarketGateway
    await expect(gateway.install({
      filename: 'signed.zip',
      archiveBase64: (await readFile(output)).toString('base64'),
    })).resolves.toEqual({
      ok: true,
      value: { packageId: 'tool-market-template', operation: 'installed', restartRequired: true },
    })
    await ctx.fiber.dispose()
  })
})
