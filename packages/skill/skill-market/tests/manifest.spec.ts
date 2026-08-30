import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MANIFEST_FILENAME,
  parseSkillMarketManifest,
  readSkillMarketManifest,
  writeSkillMarketManifest,
  type SkillMarketManifest,
} from '../src/manifest.ts'
import { createSkillMarketService } from '../src/market-service.ts'

const temporaryRoots: string[] = []

function manifest(overrides: Partial<SkillMarketManifest> = {}): SkillMarketManifest {
  return {
    schemaVersion: 1,
    name: 'alpha-skill',
    description: 'Alpha skill',
    installedAt: 1_788_000_000_000,
    sourceFilename: 'alpha.zip',
    metadata: {
      version: '1.2.3',
      author: 'DeepSeek',
      tags: ['alpha', 'tools'],
      banner: {
        path: 'assets/banner.png',
        mediaType: 'image/png',
      },
    },
    ...overrides,
  }
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-market-manifest-'))
  temporaryRoots.push(root)
  return root
}

function service(root: string) {
  return createSkillMarketService({
    resolveInstallRoot: () => root,
    logger: { info() {}, warn() {}, error() {} } as never,
  })
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async (root) => {
    await rm(root, { recursive: true, force: true })
  }))
})

describe('skill marketplace management manifest', () => {
  it('writes deterministic schema version 1 JSON and reads a matching managed target', async () => {
    const root = await temporaryRoot()
    const target = join(root, 'alpha-skill')
    await mkdir(target)

    await writeSkillMarketManifest(target, manifest())

    const raw = await readFile(join(target, MANIFEST_FILENAME), 'utf8')
    expect(raw).toBe(`${JSON.stringify(manifest(), null, 2)}\n`)
    await expect(readSkillMarketManifest(target, 'alpha-skill')).resolves.toEqual({
      status: 'managed',
      manifest: manifest(),
    })
  })

  it.each([
    ['unknown root field', { ...manifest(), unexpected: true }],
    ['unknown metadata field', { ...manifest(), metadata: { ...manifest().metadata, unexpected: true } }],
    ['unknown banner field', {
      ...manifest(),
      metadata: {
        ...manifest().metadata,
        banner: { path: 'assets/banner.png', mediaType: 'image/png', unexpected: true },
      },
    }],
    ['non-integer timestamp', { ...manifest(), installedAt: 1.5 }],
    ['invalid name', { ...manifest(), name: '../escape' }],
  ])('strictly rejects %s', (_label, value) => {
    expect(parseSkillMarketManifest(JSON.stringify(value))).toEqual({
      status: 'malformed',
    })
  })

  it('distinguishes missing, malformed, incompatible, and mismatched manifests', async () => {
    const root = await temporaryRoot()
    const target = join(root, 'alpha-skill')
    await mkdir(target)

    await expect(readSkillMarketManifest(target, 'alpha-skill')).resolves.toEqual({
      status: 'missing',
    })

    await writeFile(join(target, MANIFEST_FILENAME), '{')
    await expect(readSkillMarketManifest(target, 'alpha-skill')).resolves.toEqual({
      status: 'malformed',
    })

    await writeFile(join(target, MANIFEST_FILENAME), JSON.stringify({
      ...manifest(),
      schemaVersion: 2,
    }))
    await expect(readSkillMarketManifest(target, 'alpha-skill')).resolves.toEqual({
      status: 'incompatible',
      schemaVersion: 2,
    })

    await writeFile(join(target, MANIFEST_FILENAME), JSON.stringify(manifest({
      name: 'other-skill',
    })))
    await expect(readSkillMarketManifest(target, 'alpha-skill')).resolves.toEqual({
      status: 'name-mismatch',
      manifestName: 'other-skill',
    })
  })

  it('rejects a manifest symlink instead of following it', async () => {
    const root = await temporaryRoot()
    const target = join(root, 'alpha-skill')
    const external = join(root, 'external.json')
    await mkdir(target)
    await writeFile(external, JSON.stringify(manifest()))
    await symlink(external, join(target, MANIFEST_FILENAME))

    await expect(readSkillMarketManifest(target, 'alpha-skill')).resolves.toEqual({
      status: 'malformed',
    })
  })
})

describe('managed marketplace inventory', () => {
  it('returns an empty inventory when the user skill root is missing', async () => {
    const root = join(await temporaryRoot(), 'missing')
    await expect(service(root).list()).resolves.toEqual({ entries: [] })
  })

  it('lists only matching version 1 manifests in deterministic name order without Host paths', async () => {
    const root = await temporaryRoot()
    for (const name of ['zeta-skill', 'alpha-skill', 'manual-skill', 'future-skill', 'mismatch-skill']) {
      await mkdir(join(root, name))
    }
    await writeSkillMarketManifest(join(root, 'zeta-skill'), manifest({
      name: 'zeta-skill',
      description: 'Zeta skill',
      metadata: undefined,
    }))
    await writeSkillMarketManifest(join(root, 'alpha-skill'), manifest())
    await writeFile(join(root, 'manual-skill', 'SKILL.md'), 'manual')
    await writeFile(join(root, 'future-skill', MANIFEST_FILENAME), JSON.stringify({
      ...manifest({ name: 'future-skill' }),
      schemaVersion: 2,
    }))
    await writeSkillMarketManifest(join(root, 'mismatch-skill'), manifest({
      name: 'other-skill',
    }))

    const result = await service(root).list()

    expect(result.entries.map(entry => entry.name)).toEqual(['alpha-skill', 'zeta-skill'])
    expect(result.entries[0]).toMatchObject({
      name: 'alpha-skill',
      description: 'Alpha skill',
      version: '1.2.3',
      author: 'DeepSeek',
      tags: ['alpha', 'tools'],
      installedAt: 1_788_000_000_000,
      hasBanner: false,
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain(MANIFEST_FILENAME)
  })
})
