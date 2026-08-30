/** Internal transaction-engine values and declared errors. */

/** Internal SkillMarket error code surfaced to clients via the message prefix. */
export type SkillMarketErrorCode =
  | 'bad-zip'
  | 'too-large'
  | 'too-many-files'
  | 'unsafe-path'
  | 'unsupported-entry'
  | 'invalid-skill-md'
  | 'name-mismatch'
  | 'frontmatter-invalid'
  | 'banner-invalid'
  | 'managed-upgrade-required'
  | 'unmanaged-conflict'
  | 'manifest-incompatible'
  | 'not-managed'
  | 'unknown-skill'
  | 'internal'

/** Error detail bag (per-code shape: one row per code). */
export interface SkillMarketErrorDetailsMap {
  'bad-zip': { reason: string }
  'too-large': { limitBytes: number; observedBytes: number }
  'too-many-files': { limitFiles: number; observedFiles: number }
  'unsafe-path': { entry: string }
  'unsupported-entry': { entry: string; kind: string }
  'invalid-skill-md': { reason: string }
  'name-mismatch': { expected: string; actual: string }
  'frontmatter-invalid': { reason: string }
  'banner-invalid': { reason: string }
  'managed-upgrade-required': { name: string; installedVersion?: string; candidateVersion?: string }
  'unmanaged-conflict': { name: string }
  'manifest-incompatible': { name: string; schemaVersion?: number }
  'not-managed': {
    name: string
    reason: 'missing-manifest' | 'malformed-manifest' | 'name-mismatch'
  }
  'unknown-skill': { name: string }
  'internal': {}
}

/** Declared transaction-engine failure mapped by the Typert gateway. */
export class SkillMarketError extends Error {
  /** Stable machine-readable failure classification. */
  readonly code: SkillMarketErrorCode
  /** Structured details for the failure classification. */
  readonly details: SkillMarketErrorDetailsMap[SkillMarketErrorCode]
  /** HTTP status selected by the generated Remote gateway. */
  readonly httpStatus: number

  constructor(
    code: SkillMarketErrorCode,
    message: string,
    details: SkillMarketErrorDetailsMap[SkillMarketErrorCode],
    httpStatus: number,
  ) {
    super(message)
    this.name = 'SkillMarketError'
    this.code = code
    this.details = details
    this.httpStatus = httpStatus
  }
}

/** Compact listing summary returned by `list`. */
export interface SkillMarketEntry {
  /** Kebab-case skill name resolved from the installed SKILL.md frontmatter. */
  name: string
  /** Description from the SKILL.md frontmatter. */
  description: string
  /** Marketplace `version` declared in `metadata.marketplace`. */
  version?: string
  /** Marketplace `author` declared in `metadata.marketplace`. */
  author?: string
  /** Marketplace `tags` declared in `metadata.marketplace`. */
  tags?: readonly string[]
  /** True when an installed banner image exists on disk. */
  hasBanner: boolean
  /** Installed timestamp in milliseconds since the epoch. */
  installedAt: number
}

/** Install parameters carried by `install`. */
export interface SkillMarketInstallPayload {
  /** Original filename of the archive (for diagnostics only). */
  filename: string
  /** Base64-encoded ZIP archive payload. */
  data: string
  /** Replace an already-managed skill of the same name. */
  overwrite?: boolean
}

/** Banner read shape: the resolved MIME type plus base64 payload. */
export interface SkillMarketBanner {
  /** Skill this banner belongs to. */
  name: string
  /** RFC-compliant MIME type detected from the banner file extension. */
  mime: string
  /** Base64-encoded banner bytes. */
  data: string
  /** Banner relative path recorded in the install manifest. */
  path: string
}

/** `install` success result. */
export interface SkillMarketInstallResult {
  name: string
  /** Whether the install replaced a previously managed bundle. */
  replaced: boolean
  /** Manifest path under the install root. */
  manifestPath: string
}

/** `list` success result. */
export interface SkillMarketListResult {
  entries: readonly SkillMarketEntry[]
}

/** `uninstall` success result. */
export interface SkillMarketUninstallResult {
  name: string
  /** Whether a managed bundle was removed. */
  removed: boolean
}

/** `banner` success result. */
export interface SkillMarketBannerResult {
  banner: SkillMarketBanner
}
