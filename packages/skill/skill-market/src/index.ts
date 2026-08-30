/**
 * Host-side marketplace operations for persistent user skills.
 *
 * @module @deepseek-ai/dsh-skill-market
 */

import type { Context } from '@deepseek-ai/cordis'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ArchiveValidationError } from './archive.ts'
import { resolveDefaultInstallRoot, SkillMarketService } from './market-service.ts'
import { SkillMarketError } from './schema.ts'
import type {
  SkillMarketBannerRequest,
  SkillMarketBannerResult,
  SkillMarketInstallRequest,
  SkillMarketInstallResult,
  SkillMarketFailure,
  SkillMarketListResult,
  SkillMarketSkillId,
  SkillMarketUninstallRequest,
  SkillMarketUninstallResult,
} from './types.ts'

export type * from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'skill-market'

/** Services required by the marketplace gateway. */
export const inject = ['skills']

function assertNever(value: never): never {
  throw new Error(`Unhandled skill-market error: ${String(value)}`)
}

function mapEngineFailure(error: SkillMarketError): SkillMarketFailure {
  switch (error.code) {
    case 'bad-zip':
      return { code: 'invalid-archive', reason: 'zip' }
    case 'too-large': {
      const details = error.details as { limitBytes: number; observedBytes: number }
      return {
        code: 'resource-limit',
        limit: 'archive-bytes',
        limitValue: details.limitBytes,
        observedValue: details.observedBytes,
      }
    }
    case 'too-many-files': {
      const details = error.details as { limitFiles: number; observedFiles: number }
      return {
        code: 'resource-limit',
        limit: 'file-count',
        limitValue: details.limitFiles,
        observedValue: details.observedFiles,
      }
    }
    case 'unsafe-path': {
      const details = error.details as { entry: string }
      return { code: 'unsafe-entry', entry: details.entry, reason: 'path' }
    }
    case 'unsupported-entry': {
      const details = error.details as { entry: string }
      return { code: 'unsafe-entry', entry: details.entry, reason: 'unsupported-type' }
    }
    case 'invalid-skill-md':
    case 'frontmatter-invalid':
    case 'name-mismatch': {
      const details = error.details as { reason?: string; expected?: string; actual?: string }
      return {
        code: 'invalid-descriptor',
        reason: details.reason ?? `expected ${details.expected}, received ${details.actual}`,
        ...error.code === 'name-mismatch' ? { field: 'name' } : {},
      }
    }
    case 'banner-invalid': {
      const details = error.details as { reason: string }
      return { code: 'invalid-banner', reason: 'signature-mismatch', path: details.reason }
    }
    case 'managed-upgrade-required': {
      const details = error.details as {
        name: string
        installedVersion?: string
        candidateVersion?: string
      }
      return {
        code: 'managed-upgrade-required',
        skillId: details.name as SkillMarketSkillId,
        ...details.installedVersion === undefined ? {} : { installedVersion: details.installedVersion },
        ...details.candidateVersion === undefined ? {} : { candidateVersion: details.candidateVersion },
      }
    }
    case 'unmanaged-conflict':
      return {
        code: 'unmanaged-conflict',
        skillId: (error.details as { name: string }).name as SkillMarketSkillId,
      }
    case 'manifest-incompatible': {
      const details = error.details as { name: string; schemaVersion?: number }
      return {
        code: 'manifest-incompatible',
        skillId: details.name as SkillMarketSkillId,
        ...details.schemaVersion === undefined ? {} : { schemaVersion: details.schemaVersion },
      }
    }
    case 'unknown-skill':
      return {
        code: 'not-found',
        skillId: (error.details as { name: string }).name as SkillMarketSkillId,
      }
    case 'not-managed': {
      const details = error.details as {
        name: string
        reason: 'missing-manifest' | 'malformed-manifest' | 'name-mismatch'
      }
      return {
        code: 'not-managed',
        skillId: details.name as SkillMarketSkillId,
        reason: details.reason,
      }
    }
    case 'internal':
      throw error
    default:
      return assertNever(error.code)
  }
}

async function domainResult<Value>(operation: () => Promise<Value>): Promise<
  { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: SkillMarketFailure }
> {
  try {
    return { ok: true, value: await operation() }
  } catch (error) {
    if (error instanceof ArchiveValidationError) return { ok: false, error: error.failure }
    if (error instanceof SkillMarketError) return { ok: false, error: mapEngineFailure(error) }
    throw error
  }
}

/** Marketplace Host configuration. */
export interface Config {
  /** Override the DSH user skill directory used by the filesystem skill provider. */
  installRoot?: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host marketplace service exported through the generated Typert Remote. */
    skillMarket: SkillMarketGateway
  }
}

/**
 * Host Remote gateway backed by the marketplace transaction engine.
 *
 * Declared business failures are returned as structured outcomes. Transport,
 * cancellation, and unexpected failures reject. Successful mutations notify
 * the filesystem skill provider only after publication or detachment commits.
 */
export class SkillMarketGateway extends TypertRemoteService {
  static inject = inject
  static Config: z<Config> = z.object({
    installRoot: z.string(),
  })

  private readonly engine: SkillMarketService
  private readonly installRoot: string

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'skillMarket')
    const installRoot = resolveDefaultInstallRoot(config.installRoot)
    this.installRoot = installRoot
    this.engine = new SkillMarketService({
      resolveInstallRoot: () => installRoot,
      logger: ctx.logger,
    })
  }

  /**
   * Read one installed promotional image.
   * @param request - managed skill identity.
   * @returns validated image metadata and bytes, or a declared ownership,
   * compatibility, absence, or image-validation failure.
   */
  @Remote('banner')
  async banner(request: SkillMarketBannerRequest): Promise<SkillMarketBannerResult> {
    return await domainResult(async () => {
      const result = await this.engine.banner(request.skillId)
      return {
        skillId: result.banner.name as SkillMarketSkillId,
        mediaType: result.banner.mime as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
        dataBase64: result.banner.data,
      }
    })
  }

  /**
   * Validate and install or upgrade one uploaded marketplace archive.
   * @param request - uploaded archive and explicit replacement intent.
   * @returns committed installation facts, or a declared validation,
   * ownership, compatibility, or replacement-confirmation failure.
   */
  @Remote('install')
  async install(request: SkillMarketInstallRequest): Promise<SkillMarketInstallResult> {
    return await domainResult(async () => {
      const result = await this.engine.install({
        filename: request.filename,
        data: request.archiveBase64,
        ...request.replaceExisting === true ? { overwrite: true } : {},
      })
      const value = {
        skillId: result.name as SkillMarketSkillId,
        operation: result.replaced ? 'upgraded' as const : 'installed' as const,
      }
      await this.ctx.root.emit('skill-filesystem/host-mutation', join(this.installRoot, result.name))
      return value
    })
  }

  /**
   * List managed marketplace installations.
   * @returns deterministic managed inventory, or a declared domain failure.
   */
  @Remote('list')
  async list(): Promise<SkillMarketListResult> {
    return await domainResult(async () => {
      const result = await this.engine.list()
      return {
        entries: result.entries.map(entry => ({
          skillId: entry.name as SkillMarketSkillId,
          description: entry.description,
          ...entry.version === undefined ? {} : { version: entry.version },
          ...entry.author === undefined ? {} : { author: entry.author },
          ...entry.tags === undefined ? {} : { tags: entry.tags },
          installedAt: entry.installedAt,
          hasBanner: entry.hasBanner,
        })),
      }
    })
  }

  /**
   * Remove one managed marketplace installation.
   * @param request - managed skill identity.
   * @returns detached installation facts, or a declared ownership,
   * compatibility, or absence failure.
   */
  @Remote('uninstall')
  async uninstall(request: SkillMarketUninstallRequest): Promise<SkillMarketUninstallResult> {
    return await domainResult(async () => {
      const result = await this.engine.uninstall(request.skillId)
      const value = { skillId: result.name as SkillMarketSkillId }
      await this.ctx.root.emit('skill-filesystem/host-mutation', join(this.installRoot, result.name))
      return value
    })
  }
}

/**
 * Mount the marketplace gateway for a Cordis Loader entry.
 * @param ctx - Host context providing the marketplace dependencies.
 * @param config - Optional marketplace installation configuration.
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(SkillMarketGateway, config)
}

export default SkillMarketGateway
