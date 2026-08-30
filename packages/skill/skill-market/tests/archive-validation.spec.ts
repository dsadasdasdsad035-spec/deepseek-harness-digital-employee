import { readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  decodeArchiveBase64,
  inspectZipArchive,
  MAX_ENTRY_BYTES,
  MAX_EXTRACTED_BYTES,
  MAX_FILE_COUNT,
  MAX_ZIP_BYTES,
  type ArchiveValidationError,
} from '../src/archive.ts'
import { cleanupPrivatePath } from '../src/market-service.ts'
import { buildDeclaredZip, buildZip } from './fixtures/zip.ts'

function failure(error: unknown): ArchiveValidationError {
  expect(error).toMatchObject({ name: 'ArchiveValidationError' })
  return error as ArchiveValidationError
}

describe('hostile ZIP validation', () => {
  it.each([
    ['', 'base64'],
    ['AAAA A===', 'base64'],
    ['AAAA\nAAAA', 'base64'],
    ['AAA!', 'base64'],
    ['A', 'base64'],
    ['AA=A', 'base64'],
  ] as const)('rejects malformed base64 %j', (archiveBase64, reason) => {
    try {
      decodeArchiveBase64(archiveBase64)
      throw new Error('expected invalid base64')
    } catch (error) {
      expect(failure(error).failure).toEqual({ code: 'invalid-archive', reason })
    }
  })

  it('rejects malformed and non-ZIP bytes', async () => {
    await expect(inspectZipArchive(Buffer.from('not a zip'))).rejects.toSatisfy((error: unknown) => {
      expect(failure(error).failure).toEqual({ code: 'invalid-archive', reason: 'zip' })
      return true
    })
  })

  it('rejects decoded archives above 10 MiB before ZIP parsing', () => {
    const archiveBase64 = Buffer.alloc(MAX_ZIP_BYTES + 1).toString('base64')
    try {
      decodeArchiveBase64(archiveBase64)
      throw new Error('expected archive byte limit')
    } catch (error) {
      expect(failure(error).failure).toEqual({
        code: 'resource-limit',
        limit: 'archive-bytes',
        limitValue: MAX_ZIP_BYTES,
        observedValue: MAX_ZIP_BYTES + 1,
      })
    }
  })

  it('rejects the 257th regular file and stops before extracting its body', async () => {
    const zip = await buildZip(Array.from({ length: MAX_FILE_COUNT + 1 }, (_, index) => ({
      name: `skill/file-${index}.txt`,
      data: new Uint8Array([index & 0xff]),
    })))
    await expect(inspectZipArchive(zip)).rejects.toSatisfy((error: unknown) => {
      expect(failure(error).failure).toEqual({
        code: 'resource-limit',
        limit: 'file-count',
        limitValue: MAX_FILE_COUNT,
        observedValue: MAX_FILE_COUNT + 1,
        entry: `skill/file-${MAX_FILE_COUNT}.txt`,
      })
      return true
    })
  })

  it('rejects one high-ratio entry above 30 MiB', async () => {
    const zip = await buildZip([{
      name: 'skill/blob.bin',
      data: new Uint8Array(MAX_EXTRACTED_BYTES + 1),
      compressed: true,
    }])
    expect(zip.byteLength).toBeLessThan(MAX_ZIP_BYTES)
    await expect(inspectZipArchive(zip)).rejects.toSatisfy((error: unknown) => {
      expect(failure(error).failure).toMatchObject({
        code: 'resource-limit',
        limit: 'entry-bytes',
        limitValue: MAX_EXTRACTED_BYTES,
        entry: 'skill/blob.bin',
      })
      return true
    })
  })

  it('rejects a declared oversized entry before accepting body output', async () => {
    const zip = buildDeclaredZip([{
      name: 'skill/blob.bin',
      data: new Uint8Array(64),
    }])
    const observed: number[] = []
    await expect(inspectZipArchive(zip, {
      limits: { entryBytes: 32 },
      onEntryChunk: (event) => { observed.push(event.observedEntryBytes) },
    })).rejects.toSatisfy((error: unknown) => {
      expect(failure(error).failure).toEqual({
        code: 'resource-limit',
        limit: 'entry-bytes',
        limitValue: 32,
        observedValue: 64,
        entry: 'skill/blob.bin',
      })
      return true
    })
    expect(observed).toEqual([])
  })

  it('rejects a declared cumulative size before accepting the violating body', async () => {
    const zip = buildDeclaredZip([
      { name: 'skill/a.bin', data: new Uint8Array(20) },
      { name: 'skill/b.bin', data: new Uint8Array(20) },
    ])
    const observed: string[] = []
    await expect(inspectZipArchive(zip, {
      limits: { entryBytes: MAX_ENTRY_BYTES, totalBytes: 32 },
      onEntryChunk: (event) => { observed.push(event.entry) },
    })).rejects.toSatisfy((error: unknown) => {
      expect(failure(error).failure).toEqual({
        code: 'resource-limit',
        limit: 'total-bytes',
        limitValue: 32,
        observedValue: 40,
        entry: 'skill/b.bin',
      })
      return true
    })
    expect(observed).not.toContain('skill/b.bin')
  })

  it('rejects cumulative extracted bytes above 30 MiB', async () => {
    const entryBytes = Math.floor(MAX_EXTRACTED_BYTES / 2) + 1
    const zip = await buildZip([
      { name: 'skill/a.bin', data: new Uint8Array(entryBytes), compressed: true },
      { name: 'skill/b.bin', data: new Uint8Array(entryBytes), compressed: true },
    ])
    await expect(inspectZipArchive(zip)).rejects.toSatisfy((error: unknown) => {
      expect(failure(error).failure).toMatchObject({
        code: 'resource-limit',
        limit: 'total-bytes',
        limitValue: MAX_EXTRACTED_BYTES,
        entry: 'skill/b.bin',
      })
      return true
    })
  })

  it('terminates the active entry immediately after an observed-byte limit', async () => {
    const zip = await buildZip([{
      name: 'skill/blob.bin',
      data: new Uint8Array(128 * 1024),
      compressed: true,
    }])
    const observed: number[] = []
    await expect(inspectZipArchive(zip, {
      limits: { entryBytes: 32 * 1024 },
      onEntryChunk: (event) => { observed.push(event.observedEntryBytes) },
    })).rejects.toSatisfy((error: unknown) => {
      expect(failure(error).failure).toMatchObject({
        code: 'resource-limit',
        limit: 'entry-bytes',
        limitValue: 32 * 1024,
      })
      return true
    })
    expect(observed).toHaveLength(1)
  })

  it('contains cleanup failures without replacing the primary archive failure', async () => {
    const primary = new Error('primary archive failure')
    const logged: string[] = []
    const operation = async (): Promise<never> => {
      try {
        throw primary
      } finally {
        await cleanupPrivatePath(
          '/private/staging',
          { error: (message) => { logged.push(String(message)) } },
          async () => { throw new Error('cleanup failure') },
        )
      }
    }

    await expect(operation()).rejects.toBe(primary)
    expect(logged).toEqual([
      'skill-market: failed to remove private path after operation: cleanup failure',
    ])
  })

  it('does not leave a staging sibling after archive validation fails', async () => {
    const parent = await import('node:fs/promises').then(({ mkdtemp }) =>
      import('node:os').then(({ tmpdir }) =>
        import('node:path').then(({ join }) => mkdtemp(join(tmpdir(), 'dsh-market-archive-')))))
    try {
      await expect(inspectZipArchive(Buffer.from('not a zip'))).rejects.toBeDefined()
      expect((await readdir(parent)).filter(name => name.startsWith('.dsh-market-'))).toEqual([])
    } finally {
      await import('node:fs/promises').then(({ rm }) => rm(parent, { recursive: true, force: true }))
    }
  })
})
