import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qq296629801/cordis'
import Include from '@qq296629801/cordis-plugin-include'
import Loader from '@qq296629801/cordis-plugin-loader'
import TypertGateway from '@qq296629801/dsh-api-gateway'
import SkillRegistry from '@qq296629801/dsh-skill'
import * as SkillFilesystem from '@qq296629801/dsh-skill-filesystem'
import SkillMarket from '../src/index.ts'
import * as TypertLoader from '@qq296629801/dsh-typert-loader'
import TypertRegistry from '@qq296629801/dsh-typert-registry'
import { buildZip, zipBase64 } from './fixtures/zip.ts'

const encoder = new TextEncoder()
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const bannerBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  vi.unstubAllEnvs()
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function archive(version: string, description: string, body: string): Promise<string> {
  const skill = [
    '---',
    'name: loader-market',
    `description: ${description}`,
    'metadata:',
    '  marketplace:',
    `    version: "${version}"`,
    '    author: Loader test',
    '    tags:',
    '      - composition',
    '    banner: banner.png',
    '---',
    '',
    body,
    '',
  ].join('\n')
  return zipBase64(await buildZip([
    { name: 'loader-market/SKILL.md', data: encoder.encode(skill) },
    { name: 'loader-market/banner.png', data: bannerBytes },
  ]))
}

async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-skill-market-loader-'))
  const dshHome = join(root, 'dsh-home')
  const agentsHome = join(root, 'agents-home')
  const configPath = join(root, 'cordis.yml')
  const packageLink = join(root, 'node_modules', '@qq296629801', 'dsh-skill-market')
  await mkdir(dirname(packageLink), { recursive: true })
  await symlink(packageRoot, packageLink, process.platform === 'win32' ? 'junction' : 'dir')
  vi.stubEnv('DSH_HOME', dshHome)
  await writeFile(configPath, [
    "- name: '@qq296629801/dsh-typert-registry'",
    "- name: '@qq296629801/dsh-typert-loader'",
    "- name: '@qq296629801/dsh-api-gateway'",
    "- name: '@qq296629801/dsh-skill'",
    "- name: '@qq296629801/dsh-skill-filesystem'",
    '  config:',
    `    dshHome: ${JSON.stringify(dshHome)}`,
    `    agentsHome: ${JSON.stringify(agentsHome)}`,
    '    watch: false',
    "- name: '@qq296629801/dsh-skill-market'",
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@qq296629801/dsh-typert-registry', TypertRegistry],
    ['@qq296629801/dsh-typert-loader', TypertLoader],
    ['@qq296629801/dsh-api-gateway', TypertGateway],
    ['@qq296629801/dsh-skill', SkillRegistry],
    ['@qq296629801/dsh-skill-filesystem', SkillFilesystem],
    ['@qq296629801/dsh-skill-market', SkillMarket],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  await vi.waitFor(() => {
    expect(ctx.typert.local.get('skillMarket/install')).toBeDefined()
  })
  return ctx
}

describe('skill marketplace real Loader composition', () => {
  it('installs, refreshes discovery, upgrades, reads its banner, and uninstalls through generated Remote descriptors', { timeout: 60_000 }, async () => {
    const ctx = await boot()
    expect(await ctx.skills.list()).toEqual([])

    const firstArchive = await archive('1.0.0', 'Loader version one', 'body-v1')
    await expect(ctx.typertGateway.invoke({
      namespace: 'skillMarket',
      method: 'install',
      args: { request: { filename: 'loader-market-v1.zip', archiveBase64: firstArchive } },
    })).resolves.toEqual({
      ok: true,
      value: { skillId: 'loader-market', operation: 'installed' },
    })
    expect(await ctx.skills.get('loader-market')).toMatchObject({
      name: 'loader-market',
      description: 'Loader version one',
      content: 'body-v1',
    })

    const secondArchive = await archive('2.0.0', 'Loader version two', 'body-v2')
    await expect(ctx.typertGateway.invoke({
      namespace: 'skillMarket',
      method: 'install',
      args: { request: { filename: 'loader-market-v2.zip', archiveBase64: secondArchive } },
    })).resolves.toEqual({
      ok: false,
      error: {
        code: 'managed-upgrade-required',
        skillId: 'loader-market',
        installedVersion: '1.0.0',
        candidateVersion: '2.0.0',
      },
    })
    await expect(ctx.typertGateway.invoke({
      namespace: 'skillMarket',
      method: 'install',
      args: {
        request: {
          filename: 'loader-market-v2.zip',
          archiveBase64: secondArchive,
          replaceExisting: true,
        },
      },
    })).resolves.toEqual({
      ok: true,
      value: { skillId: 'loader-market', operation: 'upgraded' },
    })
    expect(await ctx.skills.get('loader-market')).toMatchObject({
      description: 'Loader version two',
      content: 'body-v2',
    })

    await expect(ctx.typertGateway.invoke({
      namespace: 'skillMarket',
      method: 'banner',
      args: { request: { skillId: 'loader-market' } },
    })).resolves.toEqual({
      ok: true,
      value: {
        skillId: 'loader-market',
        mediaType: 'image/png',
        dataBase64: Buffer.from(bannerBytes).toString('base64'),
      },
    })
    await expect(ctx.typertGateway.invoke({
      namespace: 'skillMarket',
      method: 'list',
      args: {},
    })).resolves.toMatchObject({
      ok: true,
      value: {
        entries: [{
          skillId: 'loader-market',
          description: 'Loader version two',
          version: '2.0.0',
          hasBanner: true,
        }],
      },
    })

    await expect(ctx.typertGateway.invoke({
      namespace: 'skillMarket',
      method: 'uninstall',
      args: { request: { skillId: 'loader-market' } },
    })).resolves.toEqual({
      ok: true,
      value: { skillId: 'loader-market' },
    })
    expect(await ctx.skills.get('loader-market')).toBeUndefined()
    expect(await ctx.skills.list()).toEqual([])
  })
})
