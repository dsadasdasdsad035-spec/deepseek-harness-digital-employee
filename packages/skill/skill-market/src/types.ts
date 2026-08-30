/** Client-safe marketplace requests, values, and business outcomes. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import z from 'zod'

/** Stable kebab-case identity of one user skill. */
export type SkillMarketSkillId = Branded<'SkillMarketSkillId'>

/** Supported marketplace management-manifest version. */
export type SkillMarketManifestVersion = 1

/** Promotional image media accepted by the marketplace. */
export type SkillMarketBannerMediaType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'

/** One managed installation exposed to trusted clients. */
export interface SkillMarketEntry {
  readonly skillId: SkillMarketSkillId
  readonly description: string
  readonly version?: string | undefined
  readonly author?: string | undefined
  readonly tags?: readonly string[] | undefined
  readonly installedAt: number
  readonly hasBanner: boolean
}

/** Uploaded archive and explicit managed-replacement intent. */
export interface SkillMarketInstallRequest {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting?: boolean | undefined
}

/** Request for one managed promotional image. */
export interface SkillMarketBannerRequest {
  readonly skillId: SkillMarketSkillId
}

/** Request to remove one managed installation. */
export interface SkillMarketUninstallRequest {
  readonly skillId: SkillMarketSkillId
}

/** Deterministic managed inventory. */
export interface SkillMarketListValue {
  readonly entries: readonly SkillMarketEntry[]
}

/** Committed install or upgrade facts. */
export interface SkillMarketInstallValue {
  readonly skillId: SkillMarketSkillId
  readonly operation: 'installed' | 'upgraded'
}

/** Validated promotional image bytes. */
export interface SkillMarketBannerValue {
  readonly skillId: SkillMarketSkillId
  readonly mediaType: SkillMarketBannerMediaType
  readonly dataBase64: string
}

/** Successfully detached managed installation. */
export interface SkillMarketUninstallValue {
  readonly skillId: SkillMarketSkillId
}

/** Declared archive syntax failure. */
export interface SkillMarketInvalidArchiveFailure {
  readonly code: 'invalid-archive'
  readonly reason: 'base64' | 'zip'
}

/** Declared fixed resource-limit failure. */
export interface SkillMarketResourceLimitFailure {
  readonly code: 'resource-limit'
  readonly limit:
    | 'archive-bytes'
    | 'file-count'
    | 'entry-bytes'
    | 'total-bytes'
    | 'banner-bytes'
  readonly limitValue: number
  readonly observedValue: number
  readonly entry?: string | undefined
}

/** Declared unsafe or unsupported archive entry. */
export interface SkillMarketUnsafeEntryFailure {
  readonly code: 'unsafe-entry'
  readonly entry: string
  readonly reason:
    | 'path'
    | 'duplicate'
    | 'unsupported-type'
    | 'layout'
}

/** Declared skill descriptor failure. */
export interface SkillMarketInvalidDescriptorFailure {
  readonly code: 'invalid-descriptor'
  readonly reason: string
  readonly field?: string | undefined
}

/** Declared promotional image failure. */
export interface SkillMarketInvalidBannerFailure {
  readonly code: 'invalid-banner'
  readonly reason:
    | 'path'
    | 'missing'
    | 'not-regular'
    | 'unsupported-media'
    | 'signature-mismatch'
    | 'too-large'
  readonly path?: string | undefined
}

/** Existing matching managed installation requires explicit replacement. */
export interface SkillMarketManagedUpgradeRequiredFailure {
  readonly code: 'managed-upgrade-required'
  readonly skillId: SkillMarketSkillId
  readonly installedVersion?: string | undefined
  readonly candidateVersion?: string | undefined
}

/** A same-name target exists outside marketplace mutation authority. */
export interface SkillMarketUnmanagedConflictFailure {
  readonly code: 'unmanaged-conflict'
  readonly skillId: SkillMarketSkillId
}

/** A marketplace manifest exists but uses an unsupported version. */
export interface SkillMarketManifestIncompatibleFailure {
  readonly code: 'manifest-incompatible'
  readonly skillId: SkillMarketSkillId
  readonly schemaVersion?: number | undefined
}

/** Requested target does not exist. */
export interface SkillMarketNotFoundFailure {
  readonly code: 'not-found'
  readonly skillId: SkillMarketSkillId
}

/** Requested target is not a supported matching managed installation. */
export interface SkillMarketNotManagedFailure {
  readonly code: 'not-managed'
  readonly skillId: SkillMarketSkillId
  readonly reason: 'missing-manifest' | 'malformed-manifest' | 'name-mismatch'
}

/** Closed business-failure vocabulary returned by marketplace operations. */
export type SkillMarketFailure =
  | SkillMarketInvalidArchiveFailure
  | SkillMarketResourceLimitFailure
  | SkillMarketUnsafeEntryFailure
  | SkillMarketInvalidDescriptorFailure
  | SkillMarketInvalidBannerFailure
  | SkillMarketManagedUpgradeRequiredFailure
  | SkillMarketUnmanagedConflictFailure
  | SkillMarketManifestIncompatibleFailure
  | SkillMarketNotFoundFailure
  | SkillMarketNotManagedFailure

/** Structured operation result; unexpected failures reject the Remote call. */
export type SkillMarketResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: SkillMarketFailure }

/** `list` operation result. */
export type SkillMarketListResult = SkillMarketResult<SkillMarketListValue>
/** `install` operation result. */
export type SkillMarketInstallResult = SkillMarketResult<SkillMarketInstallValue>
/** `banner` operation result. */
export type SkillMarketBannerResult = SkillMarketResult<SkillMarketBannerValue>
/** `uninstall` operation result. */
export type SkillMarketUninstallResult = SkillMarketResult<SkillMarketUninstallValue>

const skillIdSchema = z.string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .transform(value => value as SkillMarketSkillId)

const boundedText = z.string().min(1).max(512)

/** Strict wire schema for one banner request. */
export const skillMarketBannerRequestSchema: z.ZodType<SkillMarketBannerRequest> = z.object({
  skillId: skillIdSchema,
}).strict()

/** Strict wire schema for one install request. */
export const skillMarketInstallRequestSchema: z.ZodType<SkillMarketInstallRequest> = z.object({
  filename: z.string().min(1).max(255),
  archiveBase64: z.string().min(1),
  replaceExisting: z.boolean().optional(),
}).strict()

/** Strict wire schema for one uninstall request. */
export const skillMarketUninstallRequestSchema: z.ZodType<SkillMarketUninstallRequest> = z.object({
  skillId: skillIdSchema,
}).strict()

const entrySchema: z.ZodType<SkillMarketEntry> = z.object({
  skillId: skillIdSchema,
  description: boundedText,
  version: boundedText.optional(),
  author: boundedText.optional(),
  tags: z.array(boundedText).max(32).optional(),
  installedAt: z.number().int().nonnegative(),
  hasBanner: z.boolean(),
}).strict()

const failureSchema: z.ZodType<SkillMarketFailure> = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('invalid-archive'),
    reason: z.enum(['base64', 'zip']),
  }).strict(),
  z.object({
    code: z.literal('resource-limit'),
    limit: z.enum([
      'archive-bytes',
      'file-count',
      'entry-bytes',
      'total-bytes',
      'banner-bytes',
    ]),
    limitValue: z.number().int().nonnegative(),
    observedValue: z.number().int().nonnegative(),
    entry: boundedText.optional(),
  }).strict(),
  z.object({
    code: z.literal('unsafe-entry'),
    entry: boundedText,
    reason: z.enum(['path', 'duplicate', 'unsupported-type', 'layout']),
  }).strict(),
  z.object({
    code: z.literal('invalid-descriptor'),
    reason: boundedText,
    field: boundedText.optional(),
  }).strict(),
  z.object({
    code: z.literal('invalid-banner'),
    reason: z.enum([
      'path',
      'missing',
      'not-regular',
      'unsupported-media',
      'signature-mismatch',
      'too-large',
    ]),
    path: boundedText.optional(),
  }).strict(),
  z.object({
    code: z.literal('managed-upgrade-required'),
    skillId: skillIdSchema,
    installedVersion: boundedText.optional(),
    candidateVersion: boundedText.optional(),
  }).strict(),
  z.object({
    code: z.literal('unmanaged-conflict'),
    skillId: skillIdSchema,
  }).strict(),
  z.object({
    code: z.literal('manifest-incompatible'),
    skillId: skillIdSchema,
    schemaVersion: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({
    code: z.literal('not-found'),
    skillId: skillIdSchema,
  }).strict(),
  z.object({
    code: z.literal('not-managed'),
    skillId: skillIdSchema,
    reason: z.enum(['missing-manifest', 'malformed-manifest', 'name-mismatch']),
  }).strict(),
])

function resultSchema<Value>(value: z.ZodType<Value>): z.ZodType<SkillMarketResult<Value>> {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }).strict(),
    z.object({ ok: z.literal(false), error: failureSchema }).strict(),
  ])
}

/** Strict wire schema for `list`. */
export const skillMarketListResultSchema: z.ZodType<SkillMarketListResult> = resultSchema(
  z.object({ entries: z.array(entrySchema) }).strict(),
)

/** Strict wire schema for `install`. */
export const skillMarketInstallResultSchema: z.ZodType<SkillMarketInstallResult> = resultSchema(
  z.object({
    skillId: skillIdSchema,
    operation: z.enum(['installed', 'upgraded']),
  }).strict(),
)

/** Strict wire schema for `banner`. */
export const skillMarketBannerResultSchema: z.ZodType<SkillMarketBannerResult> = resultSchema(
  z.object({
    skillId: skillIdSchema,
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    dataBase64: z.string(),
  }).strict(),
)

/** Strict wire schema for `uninstall`. */
export const skillMarketUninstallResultSchema: z.ZodType<SkillMarketUninstallResult> = resultSchema(
  z.object({ skillId: skillIdSchema }).strict(),
)
