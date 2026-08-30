/** Strict marketplace management-manifest persistence and ownership reads. */

import { lstat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import z from 'zod'
import type { SkillMarketBannerMediaType } from './types.ts'

/** Management manifest stored inside each marketplace-owned skill directory. */
export const MANIFEST_FILENAME = '.dsh-market.json'
/** Marketplace version display limit. */
export const MAX_MARKETPLACE_VERSION_LENGTH = 64
/** Marketplace author display limit. */
export const MAX_MARKETPLACE_AUTHOR_LENGTH = 128
/** Marketplace tag count limit. */
export const MAX_MARKETPLACE_TAGS = 16
/** Marketplace tag display limit. */
export const MAX_MARKETPLACE_TAG_LENGTH = 32
/** Marketplace banner path text limit. */
export const MAX_MARKETPLACE_BANNER_LENGTH = 256

/** Promotional image metadata persisted after byte validation. */
export interface SkillMarketManifestBanner {
  readonly path: string
  readonly mediaType: SkillMarketBannerMediaType
}

/** Normalized marketplace display metadata persisted by schema version 1. */
export interface SkillMarketManifestMetadata {
  readonly version?: string | undefined
  readonly author?: string | undefined
  readonly tags?: readonly string[] | undefined
  readonly banner?: SkillMarketManifestBanner | undefined
}

/** Marketplace ownership record persisted inside one installed skill. */
export interface SkillMarketManifest {
  readonly schemaVersion: 1
  readonly name: string
  readonly description: string
  readonly installedAt: number
  readonly sourceFilename: string
  readonly metadata?: SkillMarketManifestMetadata | undefined
}

/** Classified manifest read used for mutation-authority decisions. */
export type SkillMarketManifestRead =
  | { readonly status: 'managed'; readonly manifest: SkillMarketManifest }
  | { readonly status: 'missing' }
  | { readonly status: 'malformed' }
  | { readonly status: 'incompatible'; readonly schemaVersion?: number | undefined }
  | { readonly status: 'name-mismatch'; readonly manifestName: string }

const boundedText = (maximum: number) => z.string().min(1).max(maximum)
const bannerSchema: z.ZodType<SkillMarketManifestBanner> = z.object({
  path: boundedText(MAX_MARKETPLACE_BANNER_LENGTH),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
}).strict()
const metadataSchema: z.ZodType<SkillMarketManifestMetadata> = z.object({
  version: boundedText(MAX_MARKETPLACE_VERSION_LENGTH).optional(),
  author: boundedText(MAX_MARKETPLACE_AUTHOR_LENGTH).optional(),
  tags: z.array(boundedText(MAX_MARKETPLACE_TAG_LENGTH))
    .max(MAX_MARKETPLACE_TAGS)
    .refine(tags => new Set(tags).size === tags.length)
    .optional(),
  banner: bannerSchema.optional(),
}).strict()
const manifestSchema: z.ZodType<SkillMarketManifest> = z.object({
  schemaVersion: z.literal(1),
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: boundedText(512),
  installedAt: z.number().int().nonnegative(),
  sourceFilename: boundedText(255),
  metadata: metadataSchema.optional(),
}).strict()

/**
 * Parse manifest JSON without claiming ownership for malformed or newer data.
 * @param raw - UTF-8 manifest contents.
 * @returns classified schema result.
 */
export function parseSkillMarketManifest(raw: string): SkillMarketManifestRead {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { status: 'malformed' }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { status: 'malformed' }
  }
  const schemaVersion = (value as Record<string, unknown>)['schemaVersion']
  if (schemaVersion !== 1) {
    return {
      status: 'incompatible',
      ...typeof schemaVersion === 'number' && Number.isInteger(schemaVersion)
        ? { schemaVersion }
        : {},
    }
  }
  const parsed = manifestSchema.safeParse(value)
  return parsed.success
    ? { status: 'managed', manifest: parsed.data }
    : { status: 'malformed' }
}

/**
 * Read and classify one target's management manifest without following links.
 * @param targetDirectory - installed skill directory.
 * @param expectedName - directory name that the manifest must own.
 * @returns ownership classification.
 */
export async function readSkillMarketManifest(
  targetDirectory: string,
  expectedName: string,
): Promise<SkillMarketManifestRead> {
  const path = join(targetDirectory, MANIFEST_FILENAME)
  let info: Awaited<ReturnType<typeof lstat>>
  try {
    info = await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' }
    throw error
  }
  if (!info.isFile() || info.isSymbolicLink()) return { status: 'malformed' }
  const parsed = parseSkillMarketManifest(await readFile(path, 'utf8'))
  if (parsed.status !== 'managed') return parsed
  if (parsed.manifest.name !== expectedName) {
    return { status: 'name-mismatch', manifestName: parsed.manifest.name }
  }
  return parsed
}

/**
 * Persist one normalized version 1 manifest deterministically.
 * @param targetDirectory - private staged skill directory.
 * @param manifest - validated ownership record.
 */
export async function writeSkillMarketManifest(
  targetDirectory: string,
  manifest: SkillMarketManifest,
): Promise<void> {
  const parsed = manifestSchema.parse(manifest)
  await writeFile(
    join(targetDirectory, MANIFEST_FILENAME),
    `${JSON.stringify(parsed, null, 2)}\n`,
    { mode: 0o600 },
  )
}
