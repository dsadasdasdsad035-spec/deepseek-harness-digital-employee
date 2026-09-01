import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectZipArchive } from '@deepseek-ai/dsh-marketplace-core'
import {
  createSkillMarketService,
  MAX_BANNER_BYTES,
  validateArchive,
} from '../src/market-service.ts'
import { buildZip, zipBase64 } from './fixtures/zip.ts'

const encoder = new TextEncoder()
const temporaryRoots: string[] = []

const banners = {
  png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
  jpeg: Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]),
  webp: Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50,
  ]),
  gif: encoder.encode('GIF89a'),
} as const

function skillMd(name: string, banner: string): Uint8Array {
  return encoder.encode([
    '---',
    `name: ${name}`,
    'description: Banner validation fixture',
    'metadata:',
    '  marketplace:',
    `    banner: ${banner}`,
    '---',
    '',
    'Instructions.',
    '',
  ].join('\n'))
}

async function validateBanner(
  bannerPath: string,
  bannerBytes?: Uint8Array,
  kind: 'regular' | 'directory' = 'regular',
): Promise<unknown> {
  const entries = [
    { name: 'SKILL.md', data: skillMd('banner-test', bannerPath) },
    ...bannerBytes === undefined
      ? []
      : [{ name: bannerPath + (kind === 'directory' ? '/' : ''), data: bannerBytes }],
  ]
  const inspected = await inspectZipArchive(await buildZip(entries))
  return await validateArchive({
    entries: inspected.entries.map(entry => ({
      rawName: entry.name,
      bytes: entry.bytes,
      declaredOriginalSize: entry.declaredBytes,
      kind: entry.kind,
    })),
    totalBytes: inspected.totalBytes,
  })
}

async function installBanner(bytes: Uint8Array): Promise<{
  root: string
  service: ReturnType<typeof createSkillMarketService>
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-market-banner-'))
  temporaryRoots.push(root)
  const service = createSkillMarketService({
    resolveInstallRoot: () => root,
    logger: { info() {}, warn() {}, error() {} } as never,
  })
  const zip = await buildZip([
    { name: 'SKILL.md', data: skillMd('banner-test', 'assets/banner.png') },
    { name: 'assets/banner.png', data: bytes },
  ])
  await service.install({ filename: 'banner.zip', data: zipBase64(zip) })
  return { root, service }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => {
    await rm(root, { recursive: true, force: true })
  }))
})

describe('skill marketplace banner validation', () => {
  it.each([
    ['png', banners.png, 'image/png'],
    ['jpg', banners.jpg, 'image/jpeg'],
    ['jpeg', banners.jpeg, 'image/jpeg'],
    ['webp', banners.webp, 'image/webp'],
    ['gif', banners.gif, 'image/gif'],
  ] as const)('accepts a %s banner whose extension and signature agree', async (extension, bytes, mediaType) => {
    await expect(validateBanner(`assets/banner.${extension}`, bytes)).resolves.toMatchObject({
      bannerPath: `assets/banner.${extension}`,
      bannerMediaType: mediaType,
    })
  })

  it.each([
    ['missing file', 'assets/banner.png', undefined, 'regular'],
    ['directory entry', 'assets/banner.png', new Uint8Array(), 'directory'],
    ['unsupported extension', 'assets/banner.bmp', banners.png, 'regular'],
    ['extension and signature mismatch', 'assets/banner.png', banners.gif, 'regular'],
    ['invalid signature', 'assets/banner.png', new Uint8Array(8), 'regular'],
    ['oversized file', 'assets/banner.png', new Uint8Array(MAX_BANNER_BYTES + 1), 'regular'],
  ] as const)('rejects a banner with %s', async (_label, path, bytes, kind) => {
    await expect(validateBanner(path, bytes, kind)).rejects.toMatchObject({
      code: 'banner-invalid',
    })
  })

  it('revalidates the signature after installation', async () => {
    const { root, service } = await installBanner(banners.png)
    await writeFile(join(root, 'banner-test', 'assets', 'banner.png'), banners.gif)
    await expect(service.banner('banner-test')).rejects.toMatchObject({
      code: 'banner-invalid',
    })
    await expect(service.list()).resolves.toMatchObject({
      entries: [{ name: 'banner-test', hasBanner: false }],
    })
  })

  it('revalidates banner presence and size after installation', async () => {
    const { root, service } = await installBanner(banners.png)
    const bannerPath = join(root, 'banner-test', 'assets', 'banner.png')
    await rm(bannerPath)
    await expect(service.banner('banner-test')).rejects.toMatchObject({
      code: 'banner-invalid',
    })
    const oversized = new Uint8Array(MAX_BANNER_BYTES + 1)
    oversized.set(banners.png)
    await writeFile(bannerPath, oversized)
    await expect(service.banner('banner-test')).rejects.toMatchObject({
      code: 'banner-invalid',
    })
  })

  it('rejects a symbolic link that replaces an installed banner', async () => {
    const { root, service } = await installBanner(banners.png)
    const bannerPath = join(root, 'banner-test', 'assets', 'banner.png')
    const externalPath = join(root, 'external.png')
    await writeFile(externalPath, banners.png)
    await rm(bannerPath)
    await symlink(externalPath, bannerPath)
    await expect(service.banner('banner-test')).rejects.toMatchObject({
      code: 'banner-invalid',
    })
  })
})
