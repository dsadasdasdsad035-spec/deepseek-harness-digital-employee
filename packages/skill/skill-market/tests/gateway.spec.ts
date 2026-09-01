import { Buffer } from 'node:buffer'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import SkillMarketGateway, * as SkillMarket from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('SkillMarketGateway', () => {
  it('publishes the marketplace through one generated Typert namespace', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-skill-market-gateway-'))
    roots.push(installRoot)
    const ctx = gatewayContext()

    await ctx.plugin(SkillMarketGateway, { installRoot })

    const gateway = ctx.get('skillMarket') as SkillMarketGateway
    expect(gateway.typertRemote).toMatchObject({
      serviceKey: 'skillMarket',
      namespace: 'skillMarket',
    })
    expect(remoteMethods(gateway)).toEqual([
      { method: 'banner', invocation: { kind: 'direct' } },
      { method: 'install', invocation: { kind: 'direct' } },
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'uninstall', invocation: { kind: 'direct' } },
    ])
    expect('SKILL_MARKET_PATH' in SkillMarket).toBe(false)
    expect('parseSkillMarketError' in SkillMarket).toBe(false)

    await ctx.fiber.dispose()
  })

  it('returns declared failures while unexpected failures reject', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-skill-market-gateway-'))
    roots.push(installRoot)
    const ctx = gatewayContext()
    await ctx.plugin(SkillMarketGateway, { installRoot })
    const gateway = ctx.get('skillMarket') as SkillMarketGateway

    await expect(gateway.install({
      filename: 'bad.zip',
      archiveBase64: 'not base64',
    })).resolves.toEqual({
      ok: false,
      error: { code: 'invalid-archive', reason: 'base64' },
    })
    await expect(gateway.uninstall({
      skillId: 'missing' as never,
    })).resolves.toEqual({
      ok: false,
      error: { code: 'not-found', skillId: 'missing' },
    })

    const engine = (gateway as unknown as {
      engine: { list: () => Promise<never> }
    }).engine
    engine.list = async () => { throw new Error('transport-like failure') }
    await expect(gateway.list()).rejects.toThrow('transport-like failure')
    await ctx.fiber.dispose()
  })

  it('announces only committed install, upgrade, and uninstall mutations', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-skill-market-gateway-'))
    roots.push(installRoot)
    const ctx = gatewayContext()
    const mutations: string[] = []
    const listenerFiber = ctx.plugin((listenerContext) => {
      listenerContext.on('skill-filesystem/host-mutation', path => mutations.push(path))
    })
    await listenerFiber.await()
    await ctx.plugin(SkillMarketGateway, { installRoot })
    const gateway = ctx.get('skillMarket') as SkillMarketGateway
    const archive = (version: string) => Buffer.from(zipSync({
      'demo/SKILL.md': Buffer.from([
        '---',
        'name: demo',
        'description: demo skill',
        'metadata:',
        '  marketplace:',
        `    version: "${version}"`,
        '---',
        '',
        'demo',
      ].join('\n')),
    })).toString('base64')

    const installed = await gateway.install({ filename: 'demo.zip', archiveBase64: archive('1') })
    const upgraded = await gateway.install({
      filename: 'demo.zip',
      archiveBase64: archive('2'),
      replaceExisting: true,
    })
    const uninstalled = await gateway.uninstall({ skillId: 'demo' as never })
    await gateway.install({ filename: 'bad.zip', archiveBase64: 'bad' })

    expect(installed).toEqual({
      ok: true,
      value: { skillId: 'demo', operation: 'installed' },
    })
    expect(upgraded).toMatchObject({ ok: true })
    expect(uninstalled).toMatchObject({ ok: true })
    expect(mutations).toEqual([
      join(installRoot, 'demo'),
      join(installRoot, 'demo'),
      join(installRoot, 'demo'),
    ])
    await ctx.fiber.dispose()
  })

  it('installs the shipped marketplace test Skill through normal validation', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-skill-market-gateway-'))
    roots.push(installRoot)
    const ctx = gatewayContext()
    await ctx.plugin(SkillMarketGateway, { installRoot })
    const gateway = ctx.get('skillMarket') as SkillMarketGateway
    const archive = await readFile(join(process.cwd(), 'apps/web/public/marketplace-test-skill.zip'))

    await expect(gateway.install({
      filename: 'marketplace-test-skill.zip',
      archiveBase64: archive.toString('base64'),
    })).resolves.toEqual({
      ok: true,
      value: { skillId: 'marketplace-test-skill', operation: 'installed' },
    })
    await ctx.fiber.dispose()
  })

  it('classifies unmanaged uninstall manifests without exposing Host paths', async () => {
    const installRoot = await mkdtemp(join(tmpdir(), 'dsh-skill-market-gateway-'))
    roots.push(installRoot)
    const ctx = gatewayContext()
    await ctx.plugin(SkillMarketGateway, { installRoot })
    const gateway = ctx.get('skillMarket') as SkillMarketGateway
    const target = join(installRoot, 'foreign')
    await mkdir(target)

    await expect(gateway.uninstall({ skillId: 'foreign' as never })).resolves.toEqual({
      ok: false,
      error: {
        code: 'not-managed',
        skillId: 'foreign',
        reason: 'missing-manifest',
      },
    })
    await writeFile(join(target, '.dsh-market.json'), '{')
    await expect(gateway.uninstall({ skillId: 'foreign' as never })).resolves.toEqual({
      ok: false,
      error: {
        code: 'not-managed',
        skillId: 'foreign',
        reason: 'malformed-manifest',
      },
    })
    await ctx.fiber.dispose()
  })
})

function gatewayContext(): Context {
  const ctx = new Context()
  ctx.provide('skills', {} as never)
  return ctx
}
