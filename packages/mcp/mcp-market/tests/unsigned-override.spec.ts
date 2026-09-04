import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpMarketGateway, apply } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function installRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-unsigned-'))
  roots.push(root)
  return root
}

function context(): { ctx: Context; mount: ReturnType<typeof vi.fn> } {
  const ctx = new Context()
  const mount = vi.fn(async () => async () => {})
  ctx.provide('mcpClients', { mount } as never)
  ctx.provide('credentials', {
    resolve: async () => ({ value: 'resolved', source: 'memory' }),
    describe: async () => ({ configured: true, source: 'memory', writable: true }),
  } as never)
  return { ctx, mount }
}

async function templateArchiveBase64(): Promise<string> {
  const templatePath = fileURLToPath(new URL('../../../../apps/web/public/mcp-market-template.zip', import.meta.url))
  return (await readFile(templatePath)).toString('base64')
}

describe('MCP marketplace unsigned override', () => {
  it('installs and activates the shipped template without signing when explicitly enabled', async () => {
    const root = await installRoot()
    const { ctx, mount } = context()
    await ctx.plugin(McpMarketGateway, {
      installRoot: root,
      trustedPublishers: [],
      allowUnsignedPackages: true,
    })
    const gateway = ctx.get('mcpMarket') as McpMarketGateway
    await expect(gateway.install({
      filename: 'mcp-market-template.zip',
      archiveBase64: await templateArchiveBase64(),
      confirmLocalExecution: true,
    })).resolves.toEqual({
      ok: true,
      value: { packageId: 'mcp-market-template', operation: 'installed', restartRequired: true },
    })
    await expect(gateway.configure({
      packageId: 'mcp-market-template' as never,
      credentialReferences: { EXAMPLE_MCP_TOKEN: 'EXAMPLE_MCP_TOKEN' },
    })).resolves.toMatchObject({ ok: true })
    await gateway.activateConfigured()
    expect(mount).toHaveBeenCalledTimes(2)
    expect(mount.mock.calls[0]?.[1]).toMatchObject({ transport: 'streamable-http' })
    expect(mount.mock.calls[1]?.[1]).toMatchObject({ transport: 'stdio', command: 'node' })
    await ctx.fiber.dispose()
  })

  it('rejects an installed unsigned package once the override is removed', async () => {
    const root = await installRoot()
    const first = context()
    await first.ctx.plugin(McpMarketGateway, {
      installRoot: root,
      trustedPublishers: [],
      allowUnsignedPackages: true,
    })
    const gateway = first.ctx.get('mcpMarket') as McpMarketGateway
    await expect(gateway.install({
      filename: 'mcp-market-template.zip',
      archiveBase64: await templateArchiveBase64(),
      confirmLocalExecution: true,
    })).resolves.toMatchObject({ ok: true })
    await expect(gateway.configure({
      packageId: 'mcp-market-template' as never,
      credentialReferences: { EXAMPLE_MCP_TOKEN: 'EXAMPLE_MCP_TOKEN' },
    })).resolves.toMatchObject({ ok: true })
    await first.ctx.fiber.dispose()

    const strict = context()
    await expect(apply(strict.ctx, {
      installRoot: root,
      trustedPublishers: [],
      allowUnsignedPackages: false,
    })).resolves.toBeUndefined()
    expect(strict.mount).not.toHaveBeenCalled()
    const strictGateway = strict.ctx.get('mcpMarket') as McpMarketGateway
    await expect(strictGateway.list()).resolves.toMatchObject({
      ok: true,
      value: { entries: [{ packageId: 'mcp-market-template', available: false }] },
    })
    await strict.ctx.fiber.dispose()
  })
})
