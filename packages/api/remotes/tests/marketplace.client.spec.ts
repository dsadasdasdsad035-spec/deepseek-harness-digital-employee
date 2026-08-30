import { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { apply as applyGateway, inject as gatewayInject } from '@deepseek-ai/dsh-api-gateway/client'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

interface MarketplaceRemote {
  banner(request: { readonly skillId: string }): Promise<unknown>
  install(request: { readonly filename: string; readonly archiveBase64: string }): Promise<unknown>
  list(): Promise<unknown>
  uninstall(request: { readonly skillId: string }): Promise<unknown>
}

describe('API Remote marketplace client composition', () => {
  it('mounts every marketplace operation through the shared API carrier', async () => {
    const call = vi.fn<ConnectionHandle['rpc']['call']>()
      .mockImplementation(async (_carrier, endpoint) => {
        switch (endpoint) {
          case 'skillMarket/banner':
            return {
              ok: true,
              value: {
                ok: true,
                value: { skillId: 'fixture', mediaType: 'image/png', dataBase64: 'iVBORw0KGgo=' },
              },
            }
          case 'skillMarket/install':
            return { ok: true, value: { ok: true, value: { skillId: 'fixture', operation: 'installed' } } }
          case 'skillMarket/list':
            return { ok: true, value: { ok: true, value: { entries: [] } } }
          case 'skillMarket/uninstall':
            return { ok: true, value: { ok: true, value: { skillId: 'fixture' } } }
          default:
            throw new Error(`unexpected Remote endpoint: ${endpoint}`)
        }
      })
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    ctx.provide('connection', { rpc: { call } } as unknown as ConnectionHandle)
    await ctx.plugin({ inject: gatewayInject, apply: applyGateway })
    const assembly = ctx.plugin({ inject, apply })
    await assembly
    const marketplace = (ctx.remote as unknown as { skillMarket: MarketplaceRemote }).skillMarket

    expect(marketplace).toMatchObject({
      banner: expect.any(Function),
      install: expect.any(Function),
      list: expect.any(Function),
      uninstall: expect.any(Function),
    })
    const banner = await marketplace.banner({ skillId: 'fixture' })
    expect(banner).toEqual({
      ok: true,
      value: {
        ok: true,
        value: { skillId: 'fixture', mediaType: 'image/png', dataBase64: 'iVBORw0KGgo=' },
      },
    })
    await expect(marketplace.install({
      filename: 'fixture.zip',
      archiveBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
    })).resolves.toMatchObject({ ok: true })
    await expect(marketplace.list()).resolves.toMatchObject({ ok: true })
    await expect(marketplace.uninstall({ skillId: 'fixture' })).resolves.toMatchObject({ ok: true })
    expect(call.mock.calls.map(([carrier, endpoint]) => [carrier, endpoint])).toEqual([
      ['/api', 'skillMarket/banner'],
      ['/api', 'skillMarket/install'],
      ['/api', 'skillMarket/list'],
      ['/api', 'skillMarket/uninstall'],
    ])

    await assembly.dispose()
    expect((ctx.remote as unknown as Record<string, unknown>).skillMarket).toBeUndefined()
    await ctx.fiber.dispose()
  })
})
