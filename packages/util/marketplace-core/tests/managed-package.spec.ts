import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  listManagedPackages,
  publishManagedPackage,
  readManagedPackage,
  uninstallManagedPackage,
} from '../src/managed-package.ts'

const archive = (text: string) => ({ entries: [{ name: 'tool-package.json', bytes: new TextEncoder().encode(text), kind: 'regular' as const }], totalBytes: text.length })

describe('publishManagedPackage', () => {
  it('publishes and explicitly upgrades a package atomically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-market-'))
    try {
      await expect(publishManagedPackage(root, 'release-notes', archive('one'), false)).resolves.toBe('installed')
      await expect(publishManagedPackage(root, 'release-notes', archive('two'), false)).rejects.toThrow('explicit upgrade')
      await expect(publishManagedPackage(root, 'release-notes', archive('two'), true)).resolves.toBe('upgraded')
      await expect(readFile(join(root, 'release-notes', 'tool-package.json'), 'utf8')).resolves.toBe('two')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('preserves the backup when publication and restoration both fail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-managed-package-'))
    try {
      await publishManagedPackage(root, 'release-notes', archive('one'), false)
      let renameCount = 0
      await expect(publishManagedPackage(root, 'release-notes', archive('two'), true, undefined, {
        rename: async (source, target) => {
          renameCount += 1
          if (renameCount >= 2) throw new Error(`injected rename failure ${renameCount}`)
          await rename(source, target)
        },
      })).rejects.toThrow('injected rename failure 3')
      await expect(readdir(root)).resolves.toEqual(expect.arrayContaining([
        expect.stringMatching(/^\.dsh-market-backup-/),
      ]))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('records ownership and refuses to remove unmanaged directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-market-'))
    try {
      await publishManagedPackage(root, 'release-notes', archive('one'), false, {
        format: 1,
        kind: 'tool',
        id: 'release-notes',
        version: '1.0.0',
        publisherId: 'deepseek-local',
        installedAt: 123,
      })
      await mkdir(join(root, 'foreign'))
      await writeFile(join(root, 'foreign', 'file.txt'), 'owned elsewhere')

      await expect(readManagedPackage(root, 'release-notes', 'tool')).resolves.toMatchObject({
        status: 'managed',
        manifest: { id: 'release-notes', version: '1.0.0' },
      })
      await expect(listManagedPackages(root, 'tool')).resolves.toHaveLength(1)
      await expect(uninstallManagedPackage(root, 'foreign', 'tool')).rejects.toThrow('not managed')
      await expect(uninstallManagedPackage(root, 'release-notes', 'tool')).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
