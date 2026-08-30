import { lstat, mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSkillMarketService,
  verifyStagedInstallation,
  type PreparedArchive,
  type SkillMarketManifest,
} from '../src/market-service.ts'
import { writeSkillMarketManifest } from '../src/manifest.ts'
import { buildZip, zipBase64 } from './fixtures/zip.ts'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path =>
    rm(path, { recursive: true, force: true })))
})

function logger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function skillMd(name: string, description: string): Uint8Array {
  return new TextEncoder().encode(
    `---\nname: ${name}\ndescription: ${description}\n---\n\nUse ${name}.\n`,
  )
}

describe('new installation lifecycle', () => {
  it('publishes a complete private sibling with one atomic rename', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-market-lifecycle-'))
    temporaryRoots.push(parent)
    const installRoot = join(parent, 'skills')
    const observedSources: string[] = []
    const service = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
      transaction: {
        async rename(source, target) {
          observedSources.push(source)
          expect(dirname(source)).toBe(parent)
          expect(target).toBe(join(installRoot, 'atomic-skill'))
          await expect(lstat(target)).rejects.toMatchObject({ code: 'ENOENT' })
          expect((await lstat(source)).mode & 0o777).toBe(0o700)
          await expect(readFile(join(source, 'SKILL.md'), 'utf8'))
            .resolves.toContain('name: atomic-skill')
          await expect(readFile(join(source, '.dsh-market.json'), 'utf8'))
            .resolves.toContain('"schemaVersion": 1')
          await rename(source, target)
        },
      },
    })
    const archive = await buildZip([
      { name: 'atomic-skill/SKILL.md', data: skillMd('atomic-skill', 'atomic') },
      { name: 'atomic-skill/content.txt', data: new TextEncoder().encode('complete') },
    ])

    await expect(service.install({
      filename: 'atomic.zip',
      data: zipBase64(archive),
    })).resolves.toMatchObject({ name: 'atomic-skill', replaced: false })

    expect(observedSources).toHaveLength(1)
    await expect(readFile(join(installRoot, 'atomic-skill', 'content.txt'), 'utf8'))
      .resolves.toBe('complete')
    expect((await readdir(parent)).filter(name => name.startsWith('.dsh-market-staging-')))
      .toEqual([])
  })

  it('contains publication failure cleanup to the transaction staging path', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-market-lifecycle-'))
    temporaryRoots.push(parent)
    const installRoot = join(parent, 'skills')
    const sentinel = join(parent, 'keep-me')
    await mkdir(sentinel)
    const removed: string[] = []
    const service = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
      transaction: {
        async rename() {
          throw new Error('injected publication failure')
        },
        async remove(path, options) {
          removed.push(path)
          await rm(path, options)
        },
      },
    })
    const archive = await buildZip([
      { name: 'failed-skill/SKILL.md', data: skillMd('failed-skill', 'failed') },
    ])

    await expect(service.install({
      filename: 'failed.zip',
      data: zipBase64(archive),
    })).rejects.toThrow('injected publication failure')

    expect(removed).toHaveLength(1)
    expect(dirname(removed[0]!)).toBe(parent)
    await expect(lstat(join(installRoot, 'failed-skill'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(sentinel)).resolves.toBeDefined()
    expect((await readdir(parent)).filter(name => name.startsWith('.dsh-market-staging-')))
      .toEqual([])
  })

  it('rejects staged byte changes and unexpected files before publication', async () => {
    const staging = await mkdtemp(join(tmpdir(), 'dsh-market-staged-'))
    temporaryRoots.push(staging)
    const skillBytes = skillMd('verified-skill', 'verified')
    const prepared: PreparedArchive = {
      files: new Map([['SKILL.md', skillBytes]]),
      skillMdPath: 'SKILL.md',
      skillMd: new TextDecoder().decode(skillBytes),
      frontmatter: {},
      name: 'verified-skill',
      description: 'verified',
      marketplace: undefined,
      bannerPath: undefined,
      bannerMediaType: undefined,
    }
    const manifest: SkillMarketManifest = {
      schemaVersion: 1,
      name: 'verified-skill',
      description: 'verified',
      installedAt: 1,
      sourceFilename: 'verified.zip',
    }
    await writeFile(join(staging, 'SKILL.md'), skillBytes)
    await writeSkillMarketManifest(staging, manifest)
    await expect(verifyStagedInstallation(staging, prepared, manifest)).resolves.toBeUndefined()

    await writeFile(join(staging, 'SKILL.md'), 'changed')
    await expect(verifyStagedInstallation(staging, prepared, manifest))
      .rejects.toThrow('changed before publication')
    await writeFile(join(staging, 'SKILL.md'), skillBytes)
    await writeFile(join(staging, 'unexpected.txt'), 'unexpected')
    await expect(verifyStagedInstallation(staging, prepared, manifest))
      .rejects.toThrow('inventory changed before publication')
  })
})

describe('managed upgrade lifecycle', () => {
  it('requires confirmation and reports installed and candidate versions', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-market-upgrade-'))
    temporaryRoots.push(parent)
    const installRoot = join(parent, 'skills')
    const service = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
    })
    await service.install({
      filename: 'v1.zip',
      data: zipBase64(await marketplaceZip('upgrade-skill', 'v1', '1.0.0', 'old.txt')),
    })

    await expect(service.install({
      filename: 'v2.zip',
      data: zipBase64(await marketplaceZip('upgrade-skill', 'v2', '2.0.0', 'new.txt')),
    })).rejects.toMatchObject({
      code: 'managed-upgrade-required',
      details: {
        name: 'upgrade-skill',
        installedVersion: '1.0.0',
        candidateVersion: '2.0.0',
      },
    })
    await expect(readFile(join(installRoot, 'upgrade-skill', 'old.txt'), 'utf8'))
      .resolves.toBe('v1')

    await expect(service.install({
      filename: 'v2.zip',
      data: zipBase64(await marketplaceZip('upgrade-skill', 'v2', '2.0.0', 'new.txt')),
      overwrite: true,
    })).resolves.toMatchObject({ name: 'upgrade-skill', replaced: true })
    await expect(readFile(join(installRoot, 'upgrade-skill', 'new.txt'), 'utf8'))
      .resolves.toBe('v2')
  })

  it.each([
    ['missing', undefined, 'unmanaged-conflict'],
    ['malformed', '{', 'unmanaged-conflict'],
    ['incompatible', '{"schemaVersion":2}', 'manifest-incompatible'],
    [
      'name-mismatch',
      JSON.stringify({
        schemaVersion: 1,
        name: 'other-skill',
        description: 'other',
        installedAt: 1,
        sourceFilename: 'other.zip',
      }),
      'unmanaged-conflict',
    ],
  ] as const)('refuses %s targets even with replacement intent', async (_kind, manifest, code) => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-market-upgrade-'))
    temporaryRoots.push(parent)
    const installRoot = join(parent, 'skills')
    const target = join(installRoot, 'owned-skill')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'sentinel.txt'), 'keep')
    if (manifest !== undefined) {
      await writeFile(join(target, '.dsh-market.json'), manifest)
    }
    const service = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
    })

    await expect(service.install({
      filename: 'candidate.zip',
      data: zipBase64(await marketplaceZip('owned-skill', 'candidate', '2.0.0', 'new.txt')),
      overwrite: true,
    })).rejects.toMatchObject({ code })
    await expect(readFile(join(target, 'sentinel.txt'), 'utf8')).resolves.toBe('keep')
  })

  it('restores the complete previous installation when publication fails', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-market-upgrade-'))
    temporaryRoots.push(parent)
    const installRoot = join(parent, 'skills')
    const initial = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
    })
    await initial.install({
      filename: 'v1.zip',
      data: zipBase64(await marketplaceZip('rollback-skill', 'v1', '1.0.0', 'old.txt')),
    })
    const oldManifest = await readFile(join(installRoot, 'rollback-skill', '.dsh-market.json'))
    let renameCount = 0
    const upgrading = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
      transaction: {
        async rename(source, target) {
          renameCount += 1
          if (renameCount === 2) throw new Error('injected upgrade publication failure')
          await rename(source, target)
        },
      },
    })

    await expect(upgrading.install({
      filename: 'v2.zip',
      data: zipBase64(await marketplaceZip('rollback-skill', 'v2', '2.0.0', 'new.txt')),
      overwrite: true,
    })).rejects.toThrow('injected upgrade publication failure')

    expect(renameCount).toBe(3)
    await expect(readFile(join(installRoot, 'rollback-skill', 'old.txt'), 'utf8'))
      .resolves.toBe('v1')
    await expect(readFile(join(installRoot, 'rollback-skill', '.dsh-market.json')))
      .resolves.toEqual(oldManifest)
    await expect(lstat(join(installRoot, 'rollback-skill', 'new.txt')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(parent)).filter(name => name.includes('.dsh-market-'))).toEqual([])
  })
})

async function marketplaceZip(
  name: string,
  description: string,
  version: string,
  contentPath: string,
): Promise<Buffer> {
  const descriptor = new TextEncoder().encode(
    `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  marketplace:\n    version: ${version}\n---\n\nUse ${name}.\n`,
  )
  return buildZip([
    { name: `${name}/SKILL.md`, data: descriptor },
    { name: `${name}/${contentPath}`, data: new TextEncoder().encode(description) },
  ])
}

describe('managed uninstall lifecycle', () => {
  it('atomically detaches a managed target before contained cleanup', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-market-uninstall-'))
    temporaryRoots.push(parent)
    const installRoot = join(parent, 'skills')
    const initial = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
    })
    await initial.install({
      filename: 'remove.zip',
      data: zipBase64(await marketplaceZip('remove-skill', 'remove', '1.0.0', 'owned.txt')),
    })
    const removed: string[] = []
    const service = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
      transaction: {
        async remove(path, options) {
          removed.push(path)
          expect(dirname(path)).toBe(parent)
          expect(path).toContain('.dsh-market-tombstone-remove-skill-')
          await expect(lstat(join(installRoot, 'remove-skill')))
            .rejects.toMatchObject({ code: 'ENOENT' })
          await expect(readFile(join(path, 'owned.txt'), 'utf8')).resolves.toBe('remove')
          await rm(path, options)
        },
      },
    })

    await expect(service.uninstall('remove-skill'))
      .resolves.toEqual({ name: 'remove-skill', removed: true })
    expect(removed).toHaveLength(1)
    expect((await readdir(parent)).filter(name => name.includes('.dsh-market-tombstone-')))
      .toEqual([])
  })

  it('keeps successful detachment when tombstone cleanup fails', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-market-uninstall-'))
    temporaryRoots.push(parent)
    const installRoot = join(parent, 'skills')
    const log = logger()
    const initial = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: log as never,
    })
    await initial.install({
      filename: 'remove.zip',
      data: zipBase64(await marketplaceZip('cleanup-skill', 'remove', '1.0.0', 'owned.txt')),
    })
    const service = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: log as never,
      transaction: {
        async remove() {
          throw new Error('injected tombstone cleanup failure')
        },
      },
    })

    await expect(service.uninstall('cleanup-skill'))
      .resolves.toEqual({ name: 'cleanup-skill', removed: true })
    await expect(lstat(join(installRoot, 'cleanup-skill')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect(log.error).toHaveBeenCalledWith(
      'skill-market: failed to remove private path after operation: injected tombstone cleanup failure',
    )
  })

  it.each([
    ['absent', undefined, 'unknown-skill'],
    ['missing', null, 'not-managed'],
    ['malformed', '{', 'not-managed'],
    ['incompatible', '{"schemaVersion":2}', 'manifest-incompatible'],
    [
      'name-mismatch',
      JSON.stringify({
        schemaVersion: 1,
        name: 'other-skill',
        description: 'other',
        installedAt: 1,
        sourceFilename: 'other.zip',
      }),
      'not-managed',
    ],
  ] as const)('refuses an %s target without detaching it', async (_kind, manifest, code) => {
    const parent = await mkdtemp(join(tmpdir(), 'dsh-market-uninstall-'))
    temporaryRoots.push(parent)
    const installRoot = join(parent, 'skills')
    const target = join(installRoot, 'refuse-skill')
    if (manifest !== undefined) {
      await mkdir(target, { recursive: true })
      await writeFile(join(target, 'sentinel.txt'), 'keep')
      if (manifest !== null) await writeFile(join(target, '.dsh-market.json'), manifest)
    }
    const service = createSkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: logger() as never,
    })

    await expect(service.uninstall('refuse-skill')).rejects.toMatchObject({ code })
    if (manifest !== undefined) {
      await expect(readFile(join(target, 'sentinel.txt'), 'utf8')).resolves.toBe('keep')
    }
    expect((await readdir(parent)).filter(name => name.includes('.dsh-market-tombstone-')))
      .toEqual([])
  })
})
