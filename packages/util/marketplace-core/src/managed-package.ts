/** Atomic managed-package publication for validated marketplace archives. */

import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Dirent } from 'node:fs'
import type { InspectedArchive } from './archive.ts'

/** Filesystem operations overridden only by failure-injection tests. */
export interface ManagedPackageFileOperations {
  readonly rename: typeof rename
}

const DEFAULT_FILE_OPERATIONS: ManagedPackageFileOperations = { rename }

/** Ownership record written into every Tool or MCP marketplace package. */
export interface ManagedPackageManifest {
  readonly format: 1
  readonly kind: 'tool' | 'mcp' | 'hook' | 'workflow' | 'subagent'
  readonly id: string
  readonly version: string
  readonly publisherId: string
  readonly installedAt: number
}

/** Managed package lookup result. */
export type ManagedPackageRead =
  | { readonly status: 'missing' | 'unmanaged' | 'incompatible' }
  | { readonly status: 'managed'; readonly manifest: ManagedPackageManifest }

const MANIFEST_FILENAME = '.dsh-market.json'
const manifestSchema = z.object({
  format: z.literal(1),
  kind: z.enum(['tool', 'mcp', 'hook', 'workflow', 'subagent']),
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().min(1).max(128),
  publisherId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  installedAt: z.number().int().nonnegative(),
}).strict()

/**
 * Publish a checked archive to one managed package directory.
 * @param root - Marketplace installation root.
 * @param id - Package identity and target directory name.
 * @param archive - Validated package archive.
 * @param replaceExisting - Whether a present target may be atomically replaced.
 * @param manifest - Ownership record to write into the package.
 * @param operations - Filesystem operations used for publication.
 * @returns Whether publication installed a new package or upgraded an existing one.
 */
export async function publishManagedPackage(
  root: string,
  id: string,
  archive: InspectedArchive,
  replaceExisting: boolean,
  manifest?: ManagedPackageManifest,
  operations: ManagedPackageFileOperations = DEFAULT_FILE_OPERATIONS,
): Promise<'installed' | 'upgraded'> {
  const target = resolve(root, id)
  const parent = dirname(target)
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const staging = join(parent, `.dsh-market-${randomBytes(8).toString('hex')}`)
  const backup = join(parent, `.dsh-market-backup-${randomBytes(8).toString('hex')}`)
  let exists = false
  try {
    await lstat(target)
    exists = true
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (exists && !replaceExisting) throw new Error(`managed package "${id}" requires explicit upgrade`)
  const upgraded = exists
  let moved = false
  try {
    await mkdir(staging, { recursive: true, mode: 0o700 })
    for (const entry of archive.entries) {
      if (entry.kind !== 'regular') continue
      const filename = resolve(staging, entry.name)
      if (relative(staging, filename).startsWith(`..${sep}`)) throw new Error('archive entry escapes staging directory')
      await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
      await writeFile(filename, entry.bytes, { mode: 0o600 })
    }
    if (manifest !== undefined) {
      if (manifest.id !== id) throw new Error('managed manifest identity mismatch')
      await writeFile(
        join(staging, MANIFEST_FILENAME),
        `${JSON.stringify(manifestSchema.parse(manifest), null, 2)}\n`,
        { mode: 0o600 },
      )
    }
    if (exists) {
      await operations.rename(target, backup)
      moved = true
    }
    try {
      await operations.rename(staging, target)
    } catch (error) {
      if (moved) {
        await operations.rename(backup, target)
        moved = false
      }
      throw error
    }
    if (moved) {
      await rm(backup, { recursive: true, force: true })
      moved = false
    }
    return upgraded ? 'upgraded' : 'installed'
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Read and validate one marketplace ownership record.
 * @param root - Marketplace installation root.
 * @param id - Expected package identity.
 * @param kind - Expected package class.
 * @returns Ownership classification without exposing filesystem paths.
 */
export async function readManagedPackage(
  root: string,
  id: string,
  kind: ManagedPackageManifest['kind'],
): Promise<ManagedPackageRead> {
  const target = resolve(root, id)
  try {
    const targetInfo = await lstat(target)
    if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink()) return { status: 'unmanaged' }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' }
    throw error
  }
  try {
    const info = await lstat(join(target, MANIFEST_FILENAME))
    if (!info.isFile() || info.isSymbolicLink()) return { status: 'unmanaged' }
    const value: unknown = JSON.parse(await readFile(join(target, MANIFEST_FILENAME), 'utf8'))
    const parsed = manifestSchema.safeParse(value)
    if (!parsed.success) {
      const format = typeof value === 'object' && value !== null && 'format' in value
        ? (value as { format?: unknown }).format
        : undefined
      return typeof format === 'number' && format !== 1 ? { status: 'incompatible' } : { status: 'unmanaged' }
    }
    if (parsed.data.id !== id || parsed.data.kind !== kind) return { status: 'unmanaged' }
    return { status: 'managed', manifest: parsed.data }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) {
      return { status: 'unmanaged' }
    }
    throw error
  }
}

/**
 * List managed packages in deterministic identity order.
 * @param root - Marketplace installation root.
 * @param kind - Package class to include.
 * @returns Valid managed ownership records.
 */
export async function listManagedPackages(
  root: string,
  kind: ManagedPackageManifest['kind'],
): Promise<readonly ManagedPackageManifest[]> {
  let entries: Dirent<string>[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const manifests: ManagedPackageManifest[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const result = await readManagedPackage(root, entry.name, kind)
    if (result.status === 'managed') manifests.push(result.manifest)
  }
  return manifests.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Atomically detach and remove one managed package.
 * @param root - Marketplace installation root.
 * @param id - Package identity.
 * @param kind - Expected package class.
 */
export async function uninstallManagedPackage(
  root: string,
  id: string,
  kind: ManagedPackageManifest['kind'],
): Promise<void> {
  const ownership = await readManagedPackage(root, id, kind)
  if (ownership.status === 'missing') throw new Error(`managed package "${id}" is unavailable`)
  if (ownership.status !== 'managed') throw new Error(`package "${id}" is not managed by this marketplace`)
  const target = resolve(root, id)
  const tombstone = join(dirname(target), `.dsh-market-remove-${randomBytes(8).toString('hex')}`)
  await rename(target, tombstone)
  await rm(tombstone, { recursive: true, force: true })
}
