/** Bounded hostile-ZIP decoding and inventory. */

import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import type { SkillMarketFailure } from './types.ts'

/** Maximum decoded ZIP bytes accepted by the Host. */
export const MAX_ZIP_BYTES = 10 * 1024 * 1024
/** Maximum regular-file entries accepted by the Host. */
export const MAX_FILE_COUNT = 256
/** Maximum bytes observed for one extracted entry. */
export const MAX_ENTRY_BYTES = 30 * 1024 * 1024
/** Maximum bytes observed across all extracted entries. */
export const MAX_EXTRACTED_BYTES = 30 * 1024 * 1024

/** Supported and rejected ZIP entry kinds derived from central-directory attributes. */
export type ArchiveEntryKind = 'regular' | 'directory' | 'symbolic-link' | 'unsupported'

/** One bounded entry from an inspected ZIP. */
export interface InspectedArchiveEntry {
  readonly name: string
  readonly bytes: Uint8Array
  readonly declaredBytes?: number | undefined
  readonly kind: ArchiveEntryKind
}

/** Bounded ZIP inventory produced before any target publication. */
export interface InspectedArchive {
  readonly entries: readonly InspectedArchiveEntry[]
  readonly totalBytes: number
}

/** Structured domain failure raised by archive validation. */
export class ArchiveValidationError extends Error {
  override readonly name = 'ArchiveValidationError'

  constructor(readonly failure: SkillMarketFailure) {
    super(failure.code)
  }
}

interface ArchiveLimits {
  readonly archiveBytes: number
  readonly fileCount: number
  readonly entryBytes: number
  readonly totalBytes: number
}

interface EntryChunkEvent {
  readonly entry: string
  readonly observedEntryBytes: number
  readonly observedTotalBytes: number
}

interface InspectZipOptions {
  readonly limits?: Partial<ArchiveLimits>
  readonly onEntryChunk?: ((event: EntryChunkEvent) => void) | undefined
}

const DEFAULT_LIMITS: ArchiveLimits = {
  archiveBytes: MAX_ZIP_BYTES,
  fileCount: MAX_FILE_COUNT,
  entryBytes: MAX_ENTRY_BYTES,
  totalBytes: MAX_EXTRACTED_BYTES,
}

interface CentralDirectoryEntry {
  readonly name: string
  readonly kind: ArchiveEntryKind
}

function invalidArchive(reason: 'base64' | 'zip'): ArchiveValidationError {
  return new ArchiveValidationError({ code: 'invalid-archive', reason })
}

function resourceLimit(
  limit: 'archive-bytes' | 'file-count' | 'entry-bytes' | 'total-bytes',
  limitValue: number,
  observedValue: number,
  entry?: string,
): ArchiveValidationError {
  return new ArchiveValidationError({
    code: 'resource-limit',
    limit,
    limitValue,
    observedValue,
    ...entry === undefined ? {} : { entry },
  })
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.byteLength) throw invalidArchive('zip')
  return (bytes[offset] ?? 0) | (bytes[offset + 1] ?? 0) << 8
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.byteLength) throw invalidArchive('zip')
  return (
    (bytes[offset] ?? 0)
    | (bytes[offset + 1] ?? 0) << 8
    | (bytes[offset + 2] ?? 0) << 16
    | (bytes[offset + 3] ?? 0) << 24
  ) >>> 0
}

function decodeEntryName(bytes: Uint8Array, utf8: boolean): string {
  if (!utf8) return String.fromCharCode(...bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw invalidArchive('zip')
  }
}

function classifyEntry(os: number, attrs: number, name: string): ArchiveEntryKind {
  if (os === 3 || os === 19) {
    const unixType = attrs >>> 16 & 0xf000
    if (unixType !== 0) {
      if (unixType === 0x8000) return 'regular'
      if (unixType === 0x4000) return 'directory'
      if (unixType === 0xa000) return 'symbolic-link'
      return 'unsupported'
    }
  }
  if ((attrs & 0x08) !== 0) return 'unsupported'
  if ((attrs & 0x10) !== 0 || name.endsWith('/')) return 'directory'
  return 'regular'
}

function inspectCentralDirectory(archive: Uint8Array): readonly CentralDirectoryEntry[] {
  const minimumEocdOffset = Math.max(0, archive.byteLength - 22 - 0xffff)
  let eocdOffset = archive.byteLength - 22
  while (eocdOffset >= minimumEocdOffset && readUint32(archive, eocdOffset) !== 0x06054b50) {
    eocdOffset -= 1
  }
  if (eocdOffset < minimumEocdOffset) throw invalidArchive('zip')
  const entryCount = readUint16(archive, eocdOffset + 10)
  const directoryOffset = readUint32(archive, eocdOffset + 16)
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) throw invalidArchive('zip')

  const entries: CentralDirectoryEntry[] = []
  let offset = directoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(archive, offset) !== 0x02014b50) throw invalidArchive('zip')
    const os = archive[offset + 5] ?? 0
    const flags = readUint16(archive, offset + 8)
    const nameLength = readUint16(archive, offset + 28)
    const extraLength = readUint16(archive, offset + 30)
    const commentLength = readUint16(archive, offset + 32)
    const attrs = readUint32(archive, offset + 38)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd > archive.byteLength) throw invalidArchive('zip')
    const name = decodeEntryName(archive.subarray(nameStart, nameEnd), (flags & 0x0800) !== 0)
    entries.push({ name, kind: classifyEntry(os, attrs, name) })
    offset = nameEnd + extraLength + commentLength
    if (offset > archive.byteLength) throw invalidArchive('zip')
  }
  return entries
}

/**
 * Strictly decode one compact RFC 4648 base64 archive payload.
 * @param archiveBase64 - Encoded ZIP payload.
 * @returns Decoded ZIP bytes.
 */
export function decodeArchiveBase64(archiveBase64: string): Buffer {
  if (
    archiveBase64.length === 0
    || archiveBase64.length % 4 === 1
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(archiveBase64)
    || archiveBase64.includes('===')
  ) {
    throw invalidArchive('base64')
  }
  const firstPadding = archiveBase64.indexOf('=')
  if (firstPadding !== -1 && firstPadding < archiveBase64.length - 2) {
    throw invalidArchive('base64')
  }
  const paddingBytes = archiveBase64.endsWith('==') ? 2 : archiveBase64.endsWith('=') ? 1 : 0
  const decodedBytes = Math.floor(archiveBase64.length * 3 / 4) - paddingBytes
  if (decodedBytes > MAX_ZIP_BYTES) {
    throw resourceLimit('archive-bytes', MAX_ZIP_BYTES, decodedBytes)
  }
  const decoded = Buffer.from(archiveBase64, 'base64')
  const canonicalInput = archiveBase64.replace(/=+$/, '')
  const canonicalDecoded = decoded.toString('base64').replace(/=+$/, '')
  if (decoded.byteLength === 0 || canonicalDecoded !== canonicalInput) {
    throw invalidArchive('base64')
  }
  if (decoded.byteLength > MAX_ZIP_BYTES) {
    throw resourceLimit('archive-bytes', MAX_ZIP_BYTES, decoded.byteLength)
  }
  return decoded
}

/**
 * Inspect a ZIP while enforcing declared and observed resource limits.
 * @param archive - ZIP bytes to inspect.
 * @param options - Optional inspection limits.
 * @returns Validated entry inventory and byte totals.
 */
export async function inspectZipArchive(
  archive: Uint8Array,
  options: InspectZipOptions = {},
): Promise<InspectedArchive> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  if (archive.byteLength > limits.archiveBytes) {
    throw resourceLimit('archive-bytes', limits.archiveBytes, archive.byteLength)
  }

  const centralEntries = inspectCentralDirectory(archive)
  const entries: InspectedArchiveEntry[] = []
  let centralIndex = 0
  let fileCount = 0
  let declaredTotalBytes = 0
  let totalBytes = 0
  let failure: ArchiveValidationError | undefined
  let sawEntry = false
  const unzip = new Unzip()
  unzip.register(UnzipPassThrough)
  unzip.register(UnzipInflate)
  unzip.onfile = (file): void => {
    sawEntry = true
    const centralEntry = centralEntries[centralIndex++]
    if (centralEntry === undefined || centralEntry.name !== file.name) {
      failure = invalidArchive('zip')
      file.terminate()
      return
    }
    if (failure !== undefined) {
      file.terminate()
      return
    }
    if (centralEntry.kind === 'symbolic-link' || centralEntry.kind === 'unsupported') {
      entries.push({ name: file.name, bytes: new Uint8Array(), kind: centralEntry.kind })
      file.terminate()
      return
    }
    if (centralEntry.kind === 'directory') {
      file.ondata = (error) => {
        if (error !== null && failure === undefined) failure = invalidArchive('zip')
      }
      entries.push({ name: file.name, bytes: new Uint8Array(), kind: 'directory' })
      file.start()
      return
    }
    fileCount += 1
    if (fileCount > limits.fileCount) {
      failure = resourceLimit('file-count', limits.fileCount, fileCount, file.name)
      file.terminate()
      return
    }
    if (file.originalSize !== undefined && file.originalSize > limits.entryBytes) {
      failure = resourceLimit('entry-bytes', limits.entryBytes, file.originalSize, file.name)
      file.terminate()
      return
    }
    if (file.originalSize !== undefined) {
      declaredTotalBytes += file.originalSize
      if (declaredTotalBytes > limits.totalBytes) {
        failure = resourceLimit('total-bytes', limits.totalBytes, declaredTotalBytes, file.name)
        file.terminate()
        return
      }
    }

    const chunks: Uint8Array[] = []
    let entryBytes = 0
    file.ondata = (error, data, final): void => {
      if (failure !== undefined) return
      if (error !== null) {
        failure = invalidArchive('zip')
        file.terminate()
        return
      }
      const nextEntryBytes = entryBytes + data.byteLength
      const nextTotalBytes = totalBytes + data.byteLength
      if (nextEntryBytes > limits.entryBytes) {
        options.onEntryChunk?.({
          entry: file.name,
          observedEntryBytes: nextEntryBytes,
          observedTotalBytes: nextTotalBytes,
        })
        failure = resourceLimit('entry-bytes', limits.entryBytes, nextEntryBytes, file.name)
        file.terminate()
        return
      }
      if (nextTotalBytes > limits.totalBytes) {
        options.onEntryChunk?.({
          entry: file.name,
          observedEntryBytes: nextEntryBytes,
          observedTotalBytes: nextTotalBytes,
        })
        failure = resourceLimit('total-bytes', limits.totalBytes, nextTotalBytes, file.name)
        file.terminate()
        return
      }
      if (data.byteLength > 0) {
        chunks.push(data.slice())
        entryBytes = nextEntryBytes
        totalBytes = nextTotalBytes
      }
      if (final) {
        const bytes = new Uint8Array(entryBytes)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.byteLength
        }
        entries.push({
          name: file.name,
          bytes,
          kind: 'regular',
          ...file.originalSize === undefined ? {} : { declaredBytes: file.originalSize },
        })
      }
    }
    file.start()
  }

  try {
    unzip.push(archive, true)
  } catch {
    throw failure ?? invalidArchive('zip')
  }
  if (failure !== undefined) throw failure
  if (!sawEntry || entries.length === 0 || centralIndex !== centralEntries.length) {
    throw invalidArchive('zip')
  }
  return { entries, totalBytes }
}
