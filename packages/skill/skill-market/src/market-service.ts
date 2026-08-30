/**
 * Skill-market service: market bundle validation, atomic install, listing,
 * banner reading, and managed uninstall. The service is host-only and is the
 * single authority on the install root: every install/uninstall mutates the
 * filesystem inside transactions that finalize via `rename`, so partial
 * extraction never leaks into the skill-filesystem catalog.
 *
 * Atomicity contract:
 *   - The staging directory lives next to the install root (same parent), so
 *     every rename commit stays on one filesystem.
 *   - The manifest is written INSIDE the staging directory, then a single
 *     rename of the staging directory into place publishes the new install
 *     atomically. A crash before rename leaves the previous skill untouched.
 *   - On `overwrite=true` the previous skill directory is first renamed to a
 *     backup sibling (still on the same filesystem). The new staging then
 *     renames onto the original target. If the staging rename fails, the
 *     backup is renamed back over the target so the previous install is
 *     preserved verbatim. The backup is removed only after a successful
 *     publish.
 *
 * Zip-bomb defense:
 *   - fflate's streaming `Unzip` API emits each entry with declared
 *     `originalSize` BEFORE the body is decompressed; entries that already
 *     exceed the limit are refused without producing output.
 *   - The runtime cumulative byte counter trips inside `ondata` and aborts
 *     the stream via the returned terminator, so a high-ratio archive cannot
 *     allocate beyond the per-archive cap.
 *
 * @module @deepseek-ai/dsh-skill-market/market-service
 */

import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join, posix, relative, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import {
  decodeArchiveBase64,
  inspectZipArchive,
  MAX_ENTRY_BYTES,
  MAX_EXTRACTED_BYTES,
  MAX_FILE_COUNT,
  MAX_ZIP_BYTES,
} from './archive.ts'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { parseSkillDescriptor } from '@deepseek-ai/dsh-skill-filesystem'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import {
  SkillMarketError,
  type SkillMarketBanner,
  type SkillMarketEntry,
  type SkillMarketInstallPayload,
  type SkillMarketInstallResult,
  type SkillMarketListResult,
  type SkillMarketUninstallResult,
} from './schema.ts'
import {
  MANIFEST_FILENAME,
  MAX_MARKETPLACE_AUTHOR_LENGTH,
  MAX_MARKETPLACE_BANNER_LENGTH,
  MAX_MARKETPLACE_TAG_LENGTH,
  MAX_MARKETPLACE_TAGS,
  MAX_MARKETPLACE_VERSION_LENGTH,
  readSkillMarketManifest,
  writeSkillMarketManifest,
  type SkillMarketManifest,
} from './manifest.ts'
import { KeyedMutex } from './keyed-mutex.ts'
import type { SkillMarketBannerMediaType } from './types.ts'

/** 默认安装根：DSH_HOME/skills，与 skill-filesystem 的 USER_DSH_RANK 保持一致。 */
export const DEFAULT_INSTALL_ROOT = 'skills'

export { MAX_ENTRY_BYTES, MAX_EXTRACTED_BYTES, MAX_FILE_COUNT, MAX_ZIP_BYTES }

/** 宣传图二进制上限（2 MiB）。 */
export const MAX_BANNER_BYTES = 2 * 1024 * 1024
/** Marketplace version display limit. */
export { MAX_MARKETPLACE_VERSION_LENGTH }
/** Marketplace author display limit. */
export { MAX_MARKETPLACE_AUTHOR_LENGTH }
/** Marketplace tag count limit. */
export { MAX_MARKETPLACE_TAGS }
/** Marketplace tag display limit. */
export { MAX_MARKETPLACE_TAG_LENGTH }
/** Marketplace banner path text limit. */
export { MAX_MARKETPLACE_BANNER_LENGTH }

/** 支持的宣传图扩展名。 */
const BANNER_EXTENSIONS: Record<string, SkillMarketBannerMediaType> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export type { SkillMarketManifest } from './manifest.ts'

/** 内部依赖注入，仅供 host 使用。 */
export interface SkillMarketServiceDeps {
  /** 配置或上下文提供的安装根解析函数。 */
  resolveInstallRoot: () => string
  /** Logger 通道。 */
  logger: Context['logger']
  /** Filesystem transaction operations used for commit failure injection. */
  transaction?: Partial<SkillMarketTransactionOperations>
}

/** Narrow filesystem operations that define marketplace publication. */
export interface SkillMarketTransactionOperations {
  /** Atomically move one private or public transaction path. */
  rename: (source: string, target: string) => Promise<void>
  /** Recursively remove one private transaction path. */
  remove: (path: string, options: { recursive: true; force: true }) => Promise<void>
}

/** 解析后的 frontmatter 类型。 */
interface ManifestFrontmatter {
  name: string
  description: string
  whenToUse?: string
  marketplace?: {
    version?: string
    author?: string
    tags?: readonly string[]
    banner?: string
  }
}

/**
 * Construct a skill marketplace service from Host-owned dependencies.
 * @param deps - Runtime dependencies and optional transaction operations.
 * @returns Marketplace service instance.
 */
export function createSkillMarketService(deps: SkillMarketServiceDeps): SkillMarketService {
  return new SkillMarketService(deps)
}

/**
 * SkillMarket 服务的具体实现。安装和卸载按技能名串行化，不同技能名可以
 * 独立推进。
 */
export class SkillMarketService {
  private readonly deps: SkillMarketServiceDeps
  private readonly mutations = new KeyedMutex<string>()
  private readonly transaction: SkillMarketTransactionOperations

  constructor(deps: SkillMarketServiceDeps) {
    this.deps = deps
    this.transaction = {
      rename,
      remove: rm,
      ...deps.transaction,
    }
  }

  /**
   * Resolve the current marketplace installation root.
   * @returns Absolute installation directory.
   */
  installRoot(): string {
    return resolve(this.deps.resolveInstallRoot())
  }

  /** 一个技能目录的完整路径。 */
  private skillDir(name: string): string {
    return join(this.installRoot(), name)
  }

  /**
   * List marketplace-managed skills in deterministic display order.
   * @returns Managed inventory without Host filesystem paths.
   */
  async list(): Promise<SkillMarketListResult> {
    const root = this.installRoot()
    let entries: import('node:fs').Dirent<string>[]
    try {
      entries = await readdir(root, { withFileTypes: true })
      /* v8 ignore next 5 -- ENOTDIR 需要根路径被替换为非目录文件，部署层不发生 */
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { entries: [] }
      }
      throw error
    }
    const results: SkillMarketEntry[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === '.system') continue
      const dirPath = join(root, entry.name)
      const manifestRead = await readSkillMarketManifest(dirPath, entry.name)
      if (manifestRead.status !== 'managed') continue
      const manifest = manifestRead.manifest
      results.push({
        name: manifest.name,
        description: manifest.description,
        ...manifest.metadata?.version !== undefined ? { version: manifest.metadata.version } : {},
        ...manifest.metadata?.author !== undefined ? { author: manifest.metadata.author } : {},
        ...manifest.metadata?.tags !== undefined ? { tags: manifest.metadata.tags } : {},
        hasBanner: manifest.metadata?.banner !== undefined
          && await hasValidInstalledBanner(dirPath, manifest),
        installedAt: manifest.installedAt,
      })
    }
    results.sort((left, right) => left.name.localeCompare(right.name))
    return { entries: results }
  }

  /**
   * 安装一个压缩包。返回新安装技能名及是否替换旧版本。
   * @param payload - 文件名、base64 压缩包内容、是否覆盖。
   * @returns 安装结果（包含 manifest 路径）。
   */
  async install(payload: SkillMarketInstallPayload): Promise<SkillMarketInstallResult> {
    const buffer = decodeArchiveBase64(payload.data)
    const inspected = await inspectZipArchive(buffer)
    const inventory: ArchiveInventory = {
      entries: inspected.entries.map(entry => ({
        rawName: entry.name,
        bytes: entry.bytes,
        declaredOriginalSize: entry.declaredBytes,
        kind: entry.kind,
      })),
      totalBytes: inspected.totalBytes,
    }
    const prepared = await validateInventory(inventory)
    return this.mutations.runExclusive(prepared.name, async () => {
      const targetDir = this.skillDir(prepared.name)
      const existed = await pathExists(targetDir)
      const replaced = existed
      if (existed) {
        const ownership = await readSkillMarketManifest(targetDir, prepared.name)
        if (ownership.status === 'incompatible') {
          throw new SkillMarketError(
            'manifest-incompatible',
            `技能 "${prepared.name}" 的管理清单版本不受支持`,
            {
              name: prepared.name,
              ...ownership.schemaVersion === undefined ? {} : { schemaVersion: ownership.schemaVersion },
            },
            409,
          )
        }
        if (ownership.status !== 'managed') {
          throw new SkillMarketError(
            'unmanaged-conflict',
            `技能 "${prepared.name}" 不属于当前 marketplace`,
            { name: prepared.name },
            409,
          )
        }
        if (payload.overwrite !== true) {
          throw new SkillMarketError(
            'managed-upgrade-required',
            `技能 "${prepared.name}" 已由 marketplace 管理；升级需要明确确认`,
            {
              name: prepared.name,
              ...ownership.manifest.metadata?.version === undefined
                ? {}
                : { installedVersion: ownership.manifest.metadata.version },
              ...prepared.marketplace?.version === undefined
                ? {}
                : { candidateVersion: prepared.marketplace.version },
            },
            409,
          )
        }
      }
      // 在 installRoot 同父目录下建立 staging，保证 rename 不跨卷。
      const installRootPath = this.installRoot()
      await mkdir(installRootPath, { recursive: true })
      const stagingParent = resolve(installRootPath, '..')
      // staging 落在 installRoot 同父目录下，确保 rename 不跨卷。
      // 父目录已是 installRoot：拿不到兄弟则退化为 installRoot 自身。
      // 注意：staging 目录命名不含 prepared.name，因为 prepared.files 的 key 已含 name 前缀，
      // staging 内部就是技能目录本身。
      const stagingRoot = resolve(
        stagingParent === installRootPath
          ? installRootPath
          : stagingParent,
        `.dsh-market-staging-${randomBytes(6).toString('hex')}`,
      )
      let backupDir: string | undefined
      let retainBackup = false
      let committed = false
      try {
        await mkdir(stagingRoot, { recursive: true, mode: 0o700 })
        // inventory 阶段已经把字节聚合在 prepared.files 中，此处仅需落盘。
        // files 的 key 已经含 prepared.name 前缀，staging 根目录就是技能目录本身。
        await extractToStaging(stagingRoot, prepared, this.deps.logger)
        // 写入管理清单：必须在 staging 内，以便单次 rename 提交。
        const manifest: SkillMarketManifest = {
          schemaVersion: 1,
          name: prepared.name,
          description: prepared.description,
          installedAt: Date.now(),
          sourceFilename: payload.filename,
          ...prepared.marketplace === undefined
            ? {}
            : {
              metadata: {
                ...prepared.marketplace.version === undefined ? {} : { version: prepared.marketplace.version },
                ...prepared.marketplace.author === undefined ? {} : { author: prepared.marketplace.author },
                ...prepared.marketplace.tags === undefined ? {} : { tags: prepared.marketplace.tags },
                ...prepared.bannerPath === undefined || prepared.bannerMediaType === undefined
                  ? {}
                  : {
                    banner: {
                      path: prepared.bannerPath,
                      mediaType: prepared.bannerMediaType,
                    },
                  },
              },
            },
        }
        await writeSkillMarketManifest(stagingRoot, manifest)
        await verifyStagedInstallation(stagingRoot, prepared, manifest)
        // 提交：覆盖场景先把旧目录 rename 到 backup，新 staging rename 到目标，
        // 失败时把 backup 改回 target。
        if (existed) {
          backupDir = await uniquePrivatePath(stagingParent, 'backup', prepared.name)
          await this.transaction.rename(targetDir, backupDir)
        }
        try {
          await this.transaction.rename(stagingRoot, targetDir)
          committed = true
        } catch (error) {
          // 回滚：把 backup 改回 target，保留旧版本完整可见。
          if (backupDir !== undefined) {
            try {
              await this.transaction.rename(backupDir, targetDir)
            } catch (rollbackError) {
              retainBackup = true
              this.deps.logger.error(
                `skill-market: 回滚失败，无法恢复 "${prepared.name}"：${errorMessage(rollbackError)}`,
              )
              throw new AggregateError(
                [error, rollbackError],
                `skill-market failed to publish and restore "${prepared.name}"`,
              )
            }
          }
          throw error
        }
        // 提交成功后删除 backup。
        if (backupDir !== undefined) {
          await this.transaction.remove(backupDir, { recursive: true, force: true })
        }
      } finally {
        // 只在未提交（rename 失败/异常）时清理 staging，避免误删已重命名的目标。
        if (!committed) {
          await cleanupPrivatePath(stagingRoot, this.deps.logger, this.transaction.remove)
        }
        // 兜底：如果 rename 抛出 ENOENT（目标已被消费），清掉可能残留的 backup。
        if (backupDir !== undefined && !retainBackup) {
          await cleanupPrivatePath(backupDir, this.deps.logger, this.transaction.remove)
        }
      }
      this.deps.logger.info(
        `skill-market: 已安装 "${prepared.name}" 至 ${targetDir}${replaced ? '（覆盖旧版本）' : ''}`,
      )
      return {
        name: prepared.name,
        replaced,
        manifestPath: join(targetDir, MANIFEST_FILENAME),
      }
    })
  }

  /**
   * Uninstall one marketplace-managed skill.
   * @param name - Kebab-case skill name.
   * @returns The removed skill identity.
   */
  async uninstall(name: string): Promise<SkillMarketUninstallResult> {
    if (!isSkillName(name)) {
      throw new SkillMarketError(
        'unknown-skill',
        `技能名 "${name}" 非法`,
        { name },
        404,
      )
    }
    return this.mutations.runExclusive(name, async () => {
      const dirPath = this.skillDir(name)
      if (!(await pathExists(dirPath))) {
        throw new SkillMarketError(
          'unknown-skill',
          `技能 "${name}" 不存在`,
          { name },
          404,
        )
      }
      const manifestRead = await readSkillMarketManifest(dirPath, name)
      if (manifestRead.status === 'incompatible') {
        throw new SkillMarketError(
          'manifest-incompatible',
          `技能 "${name}" 的管理清单版本不受支持`,
          {
            name,
            ...manifestRead.schemaVersion === undefined
              ? {}
              : { schemaVersion: manifestRead.schemaVersion },
          },
          409,
        )
      }
      if (manifestRead.status !== 'managed') {
        throw new SkillMarketError(
          'not-managed',
          `技能 "${name}" 不在管理清单中；只允许卸载市场安装的技能`,
          {
            name,
            reason: manifestRead.status === 'missing'
              ? 'missing-manifest'
              : manifestRead.status === 'name-mismatch'
                ? 'name-mismatch'
                : 'malformed-manifest',
          },
          403,
        )
      }
      const tombstone = await uniquePrivatePath(
        resolve(this.installRoot(), '..'),
        'tombstone',
        name,
      )
      await this.transaction.rename(dirPath, tombstone)
      this.deps.logger.info(`skill-market: 已卸载 "${name}"（${dirPath}）`)
      await cleanupPrivatePath(tombstone, this.deps.logger, this.transaction.remove)
      return { name, removed: true }
    })
  }

  /**
   * 读取已管理技能的宣传图。
   * @param name - 技能名。
   * @returns 宣传图元数据 + base64 内容。
   */
  async banner(name: string): Promise<{ banner: SkillMarketBanner }> {
    if (!isSkillName(name)) {
      throw new SkillMarketError(
        'unknown-skill',
        `技能名 "${name}" 非法`,
        { name },
        404,
      )
    }
    const dirPath = this.skillDir(name)
    const manifestRead = await readSkillMarketManifest(dirPath, name)
    if (manifestRead.status !== 'managed') {
      throw new SkillMarketError(
        'not-managed',
        `技能 "${name}" 不在管理清单中`,
        {
          name,
          reason: manifestRead.status === 'missing'
            ? 'missing-manifest'
            : manifestRead.status === 'name-mismatch'
              ? 'name-mismatch'
              : 'malformed-manifest',
        },
        403,
      )
    }
    const manifest = manifestRead.manifest
    const banner = manifest.metadata?.banner
    if (banner === undefined) {
      throw new SkillMarketError(
        'banner-invalid',
        `技能 "${name}" 未声明宣传图（metadata.marketplace.banner）`,
        { reason: 'banner not declared' },
        404,
      )
    }
    const relativeBanner = banner.path
    const bannerPath = resolveBannerPath(dirPath, relativeBanner)
    if (!isPathContained(dirPath, bannerPath)) {
      throw new SkillMarketError(
        'banner-invalid',
        `技能 "${name}" 宣传图路径超出技能目录`,
        { reason: `path traversal: ${relativeBanner}` },
        400,
      )
    }
    let info: Awaited<ReturnType<typeof lstat>>
    try {
      info = await lstat(bannerPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SkillMarketError(
          'banner-invalid',
          `技能 "${name}" 宣传图文件缺失：${relativeBanner}`,
          { reason: `missing file: ${relativeBanner}` },
          404,
        )
      }
      throw error
    }
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new SkillMarketError(
        'banner-invalid',
        `技能 "${name}" 宣传图必须是普通文件`,
        { reason: `not a regular file: ${relativeBanner}` },
        400,
      )
    }
    if (info.size > MAX_BANNER_BYTES) {
      throw new SkillMarketError(
        'banner-invalid',
        `技能 "${name}" 宣传图大小 ${info.size} 字节超过 ${MAX_BANNER_BYTES} 字节`,
        { reason: `banner exceeds ${MAX_BANNER_BYTES} bytes` },
        400,
      )
    }
    let bytes: Buffer
    try {
      bytes = await readFile(bannerPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new SkillMarketError(
          'banner-invalid',
          `技能 "${name}" 宣传图文件缺失：${relativeBanner}`,
          { reason: `missing file: ${relativeBanner}` },
          404,
        )
      }
      throw error
    }
    const mime = validateBannerBytes(relativeBanner, bytes, name)
    if (mime !== banner.mediaType) {
      throw new SkillMarketError(
        'banner-invalid',
        `技能 "${name}" 宣传图媒体类型与管理清单不匹配`,
        { reason: `manifest media mismatch: ${relativeBanner}` },
        400,
      )
    }
    return {
      banner: {
        name,
        mime,
        data: bytes.toString('base64'),
        path: relativeBanner,
      },
    }
  }
}

/* === 内部纯函数（便于单测覆盖） === */

/** 流式解压时逐 entry 收集原始字节，返回 inventory。 */
interface ArchiveInventory {
  entries: InventoryEntry[]
  totalBytes: number
  failed?: SkillMarketError | undefined
}

interface InventoryEntry {
  rawName: string
  bytes: Uint8Array
  declaredOriginalSize: number | undefined
  kind?: 'regular' | 'directory' | 'symbolic-link' | 'unsupported'
}

type RemovePath = SkillMarketTransactionOperations['remove']

/**
 * Remove one private transaction path without replacing the operation result.
 * @param path - Private staging, backup, or tombstone path.
 * @param logger - Logger receiving cleanup failures.
 * @param removePath - Filesystem removal operation.
 */
export async function cleanupPrivatePath(
  path: string,
  logger: Pick<Context['logger'], 'error'>,
  removePath: RemovePath = rm,
): Promise<void> {
  try {
    await removePath(path, { recursive: true, force: true })
  } catch (error) {
    logger.error(`skill-market: failed to remove private path after operation: ${errorMessage(error)}`)
  }
}

/**
 * Validate and normalize archive contents before publication.
 * @param archiveLike - Extracted archive inventory.
 * @returns A prepared skill bundle suitable for staging.
 */
export function validateArchive(archiveLike: ArchiveInventory): Promise<PreparedArchive> {
  return validateInventory(archiveLike)
}

/** Validated archive contents ready to write into a private staging directory. */
export interface PreparedArchive {
  /** 校验后的解压条目（路径相对片段数组 -> 字节）。 */
  files: Map<string, Uint8Array>
  /** 解析后的 SKILL.md 内容。 */
  skillMdPath: string
  /** SKILL.md 文本。 */
  skillMd: string
  /** SKILL.md frontmatter。 */
  frontmatter: Record<string, unknown>
  /** 校验得到的技能名。 */
  name: string
  /** 校验得到的描述。 */
  description: string
  /** 解析后的 marketplace 元数据。 */
  marketplace: ManifestFrontmatter['marketplace']
  /** 宣传图相对路径（可选）。 */
  bannerPath: string | undefined
  /** 宣传图通过扩展名和魔数共同验证后的媒体类型。 */
  bannerMediaType: SkillMarketBannerMediaType | undefined
}

/**
 * 同步校验 inventory 并生成 PreparedArchive。
 *
 * 结构约束：
 *   - 目录条目（`foo/`）仅用于解析技能目录的边界，**不**写入 prepared.files；
 *     extractToStaging 会按文件路径逐级 mkdir parent，覆盖目录项。
 *   - 顶层布局必须是单层目录 `name/` 或根级平铺（仅在 SKILL.md 是 `name` 时允许）。
 *     混合形态（既有 `name/x` 又有非空根条目）一律拒绝。
 *   - 重复规范路径检测：相同 relativePath 出现两次、文件与目录同名、SKILL.md
 *     重复等情形均拒绝。
 *
 * @param inventory - 流式解压收集到的条目集合。
 * @returns 已验证并规范化的技能包内容与展示元数据。
 */
export async function validateInventory(inventory: ArchiveInventory): Promise<PreparedArchive> {
  if (inventory.failed !== undefined) throw inventory.failed
  if (inventory.entries.length === 0) {
    throw new SkillMarketError(
      'bad-zip',
      '压缩包为空',
      { reason: 'empty archive' },
      400,
    )
  }
  const files = new Map<string, Uint8Array>()
  const directoryEntries = new Set<string>()
  /** 已见过的顶层目录名集合（用于排除混合形态）。 */
  const topLevelNames = new Set<string>()
  const skillMdCandidates: { path: string; text: string }[] = []
  for (const entry of inventory.entries) {
    const normalized = normalizeEntry(entry.rawName, entry.kind)
    if (normalized.kind === 'rejected') {
      throw new SkillMarketError(
        'unsafe-path',
        `条目 "${entry.rawName}" 路径不安全：${normalized.reason}`,
        { entry: entry.rawName },
        400,
      )
    }
    if (normalized.kind === 'unsupported') {
      throw new SkillMarketError(
        'unsupported-entry',
        `条目 "${entry.rawName}" 类型不受支持（仅允许普通文件或目录）：${normalized.reason}`,
        { entry: entry.rawName, kind: normalized.reason },
        400,
      )
    }
    const segments = normalized.segments
    const relativePath = segments.join('/')
    if (normalized.kind === 'directory') {
      if (directoryEntries.has(relativePath)) {
        throw new SkillMarketError(
          'bad-zip',
          `压缩包含重复目录条目 "${entry.rawName}"`,
          { reason: 'duplicate directory entry' },
          400,
        )
      }
      if (files.has(relativePath)) {
        throw new SkillMarketError(
          'bad-zip',
          `压缩包中 "${entry.rawName}" 既被声明为目录又被声明为文件`,
          { reason: 'directory conflicts with file' },
          400,
        )
      }
      directoryEntries.add(relativePath)
      // 目录条目只用于结构判断，不写入 files。extractToStaging 会基于
      // 文件路径逐级 mkdir parent。
    } else {
      // 普通文件条目：写入 files，并做重复检测。
      if (directoryEntries.has(relativePath)) {
        throw new SkillMarketError(
          'bad-zip',
          `压缩包中 "${entry.rawName}" 既被声明为目录又被声明为文件`,
          { reason: 'file conflicts with directory' },
          400,
        )
      }
      if (files.has(relativePath)) {
        throw new SkillMarketError(
          'bad-zip',
          `压缩包含重复文件条目 "${entry.rawName}"`,
          { reason: 'duplicate file entry' },
          400,
        )
      }
      files.set(relativePath, entry.bytes)
    }
    // 顶层结构统计：仅记录信息，不在此处强校验（frontmatter name 还没解析）。
    if (segments.length > 0) {
      const topLevelName = segments[0]
      if (topLevelName !== undefined) topLevelNames.add(topLevelName)
    }
    if (segments.length === 1 && segments[0] === 'SKILL.md') {
      if (entry.bytes.byteLength === 0) continue
      skillMdCandidates.push({ path: 'SKILL.md', text: new TextDecoder('utf-8').decode(entry.bytes) })
    } else if (segments.length === 2 && segments[1] === 'SKILL.md') {
      if (entry.bytes.byteLength === 0) continue
      skillMdCandidates.push({ path: segments.join('/'), text: new TextDecoder('utf-8').decode(entry.bytes) })
    }
  }
  if (skillMdCandidates.length === 0) {
    throw new SkillMarketError(
      'invalid-skill-md',
      '压缩包必须包含一个 SKILL.md',
      { reason: 'missing SKILL.md' },
      400,
    )
  }
  if (skillMdCandidates.length > 1) {
    throw new SkillMarketError(
      'bad-zip',
      '压缩包包含多个 SKILL.md；只允许单个顶层技能包',
      { reason: 'multiple SKILL.md entries' },
      400,
    )
  }
  const skillMdEntry = skillMdCandidates[0]
  if (skillMdEntry === undefined) {
    throw new SkillMarketError(
      'invalid-skill-md',
      '压缩包必须包含一个 SKILL.md',
      { reason: 'missing SKILL.md' },
      400,
    )
  }
  let descriptor
  try {
    descriptor = parseSkillDescriptor(skillMdEntry.text)
  } catch (error) {
    throw new SkillMarketError(
      'frontmatter-invalid',
      `SKILL.md frontmatter 无效：${errorMessage(error)}`,
      { reason: errorMessage(error) },
      400,
    )
  }
  if (descriptor === undefined) {
    throw new SkillMarketError(
      'frontmatter-invalid',
      'SKILL.md 必须包含有效的 YAML frontmatter、name 与 description',
      { reason: 'invalid descriptor' },
      400,
    )
  }
  const { name, description } = descriptor
  // 根级 SKILL.md 表示直接根布局；否则所有条目必须位于同一个包裹目录。
  const rootSkillMd = skillMdEntry.path === 'SKILL.md'
  const enclosingDirectory = rootSkillMd ? undefined : skillMdEntry.path.split('/')[0]
  if (enclosingDirectory !== undefined) {
    for (const top of topLevelNames) {
      if (top !== enclosingDirectory) {
        throw new SkillMarketError(
          'bad-zip',
          `压缩包必须只包含一个顶层目录，发现顶层条目 "${top}"`,
          { reason: 'mixed top-level entries' },
          400,
        )
      }
    }
  }
  const marketplace = parseMarketplace(descriptor.frontmatter, name)
  const bannerPath = marketplace?.banner
  if (bannerPath !== undefined) {
    validateBannerPath(bannerPath, name)
  }
  if (descriptor.content.length === 0) {
    throw new SkillMarketError(
      'invalid-skill-md',
      'SKILL.md 正文为空',
      { reason: 'empty body' },
      400,
    )
  }
  // 去掉可选包裹目录，使 staging 根目录直接成为技能目录。
  const stripped = new Map<string, Uint8Array>()
  for (const [key, value] of files) {
    const segs = key.split('/')
    if (enclosingDirectory !== undefined && segs[0] === enclosingDirectory) {
      stripped.set(segs.slice(1).join('/'), value)
    } else {
      stripped.set(key, value)
    }
  }
  const bannerMediaType = bannerPath === undefined
    ? undefined
    : validateBannerBytes(bannerPath, stripped.get(bannerPath), name)
  return {
    files: stripped,
    skillMdPath: skillMdEntry.path,
    skillMd: skillMdEntry.text,
    frontmatter: descriptor.frontmatter,
    name,
    description,
    marketplace,
    bannerPath,
    bannerMediaType,
  }
}

/**
 * 把已校验的解压条目写入 staging 目录。prepared.files 的 key 含技能名作为
 * 顶层目录，因此 staging 内会自然生成 `name/...` 子树。manifest 写在同样路径。
 */
async function extractToStaging(
  stagingTarget: string,
  prepared: PreparedArchive,
  logger: Context['logger'],
): Promise<void> {
  await mkdir(stagingTarget, { recursive: true })
  for (const [relativePath, bytes] of prepared.files) {
    if (relativePath.endsWith(MANIFEST_FILENAME)) {
      logger.warn(`skill-market: 忽略条目 ${relativePath}（保留由安装器生成的清单）`)
      continue
    }
    const target = join(stagingTarget, relativePath)
    const parent = join(target, '..')
    await mkdir(parent, { recursive: true })
    await writeFile(target, bytes)
  }
}

/**
 * Re-read a complete staged installation before it becomes discoverable.
 * @param stagingTarget - Private candidate directory.
 * @param prepared - Validated archive contents expected on disk.
 * @param manifest - Management record expected on disk.
 */
export async function verifyStagedInstallation(
  stagingTarget: string,
  prepared: PreparedArchive,
  manifest: SkillMarketManifest,
): Promise<void> {
  const rootInfo = await lstat(stagingTarget)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('skill-market staging root is not a private directory')
  }
  const manifestRead = await readSkillMarketManifest(stagingTarget, prepared.name)
  if (
    manifestRead.status !== 'managed'
    || JSON.stringify(manifestRead.manifest) !== JSON.stringify(manifest)
  ) {
    throw new Error('skill-market staged manifest verification failed')
  }

  const expectedFiles = new Set<string>([MANIFEST_FILENAME])
  for (const [relativePath, expectedBytes] of prepared.files) {
    if (relativePath.endsWith(MANIFEST_FILENAME)) continue
    expectedFiles.add(relativePath)
    const filePath = join(stagingTarget, relativePath)
    const info = await lstat(filePath)
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error(`skill-market staged entry is not a regular file: ${relativePath}`)
    }
    const observedBytes = await readFile(filePath)
    if (!observedBytes.equals(Buffer.from(expectedBytes))) {
      throw new Error(`skill-market staged entry changed before publication: ${relativePath}`)
    }
  }

  const observedFiles = await listStagedFiles(stagingTarget)
  if (
    observedFiles.length !== expectedFiles.size
    || observedFiles.some(path => !expectedFiles.has(path))
  ) {
    throw new Error('skill-market staged file inventory changed before publication')
  }
}

async function listStagedFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(`skill-market staged entry is a symbolic link: ${relative(root, path)}`)
    }
    if (entry.isDirectory()) {
      files.push(...await listStagedFiles(root, path))
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`skill-market staged entry is not a regular file: ${relative(root, path)}`)
    }
    files.push(relative(root, path).split(sep).join('/'))
  }
  return files.sort()
}

/**
 * 校验条目路径并规范化成分段数组。
 * @param rawName - fflate 给出的原始名称。
 */
function normalizeEntry(
  rawName: string,
  archiveKind: InventoryEntry['kind'] = rawName.endsWith('/') ? 'directory' : 'regular',
): {
  kind: 'file' | 'directory'
  segments: string[]
} | {
  kind: 'rejected'
  reason: string
} | {
  kind: 'unsupported'
  reason: string
} {
  if (typeof rawName !== 'string' || rawName.length === 0) {
    return { kind: 'rejected', reason: 'empty name' }
  }
  if (rawName.includes('\0')) {
    return { kind: 'rejected', reason: 'NUL byte' }
  }
  if (rawName.includes('\\')) {
    return { kind: 'rejected', reason: 'backslash path traversal' }
  }
  if (rawName.startsWith('/')) {
    return { kind: 'rejected', reason: 'absolute path' }
  }
  if (/^[a-zA-Z]:/.test(rawName)) {
    return { kind: 'rejected', reason: 'drive letter absolute path' }
  }
  const segments = rawName.split('/')
  for (const segment of segments) {
    if (segment.length === 0) continue
    if (segment === '.' || segment === '..') {
      return { kind: 'rejected', reason: 'relative segment' }
    }
    if (segment.includes('\\')) {
      return { kind: 'rejected', reason: 'backslash in segment' }
    }
  }
  const trimmed = segments[segments.length - 1] === '' ? segments.slice(0, -1) : segments
  if (trimmed.length === 0) {
    return { kind: 'rejected', reason: 'root entry' }
  }
  if (archiveKind === 'symbolic-link' || archiveKind === 'unsupported') {
    return { kind: 'unsupported', reason: archiveKind }
  }
  if (archiveKind === 'directory') {
    return { kind: 'directory', segments: trimmed }
  }
  return { kind: 'file', segments: trimmed }
}

/**
 * 解析 frontmatter，返回扁平 data 与正文。
 * @param raw - 原始 SKILL.md 内容。
 */
/**
 * 解析 metadata.marketplace 字段。
 * @param frontmatter - owning descriptor parser 提供的完整 frontmatter。
 * @param name - 技能名（用于错误信息）。
 */
function parseMarketplace(
  frontmatter: Readonly<Record<string, unknown>>,
  name: string,
): ManifestFrontmatter['marketplace'] | undefined {
  const metadata = frontmatter['metadata']
  if (metadata === undefined) return undefined
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new SkillMarketError(
      'frontmatter-invalid',
      `技能 "${name}" 的 frontmatter.metadata 必须是对象`,
      { reason: 'metadata is not an object' },
      400,
    )
  }
  const marketplace = (metadata as Record<string, unknown>)['marketplace']
  if (marketplace === undefined) return undefined
  if (typeof marketplace !== 'object' || marketplace === null || Array.isArray(marketplace)) {
    throw new SkillMarketError(
      'frontmatter-invalid',
      `技能 "${name}" 的 metadata.marketplace 必须是对象`,
      { reason: 'marketplace is not an object' },
      400,
    )
  }
  const result: ManifestFrontmatter['marketplace'] = {}
  const record = marketplace as Record<string, unknown>
  const allowed = new Set(['version', 'author', 'tags', 'banner'])
  const unknown = Object.keys(record).find(key => !allowed.has(key))
  if (unknown !== undefined) {
    throw new SkillMarketError(
      'frontmatter-invalid',
      `技能 "${name}" 的 metadata.marketplace 包含未知字段 "${unknown}"`,
      { reason: `unknown marketplace field: ${unknown}` },
      400,
    )
  }
  if (record['version'] !== undefined) {
    if (typeof record['version'] !== 'string' || record['version'].length === 0
      || record['version'].length > MAX_MARKETPLACE_VERSION_LENGTH) {
      throw new SkillMarketError(
        'frontmatter-invalid',
        `技能 "${name}" 的 metadata.marketplace.version 必须是字符串`,
        { reason: 'version is not a string' },
        400,
      )
    }
    result.version = record['version']
  }
  if (record['author'] !== undefined) {
    if (typeof record['author'] !== 'string' || record['author'].length === 0
      || record['author'].length > MAX_MARKETPLACE_AUTHOR_LENGTH) {
      throw new SkillMarketError(
        'frontmatter-invalid',
        `技能 "${name}" 的 metadata.marketplace.author 必须是字符串`,
        { reason: 'author is not a string' },
        400,
      )
    }
    result.author = record['author']
  }
  if (record['tags'] !== undefined) {
    if (!Array.isArray(record['tags']) || record['tags'].length > MAX_MARKETPLACE_TAGS
      || record['tags'].some(tag => typeof tag !== 'string' || tag.length === 0
        || tag.length > MAX_MARKETPLACE_TAG_LENGTH)
      || new Set(record['tags']).size !== record['tags'].length) {
      throw new SkillMarketError(
        'frontmatter-invalid',
        `技能 "${name}" 的 metadata.marketplace.tags 必须是字符串数组`,
        { reason: 'tags is not a string array' },
        400,
      )
    }
    result.tags = record['tags'] as string[]
  }
  if (record['banner'] !== undefined) {
    if (typeof record['banner'] !== 'string' || record['banner'].length === 0
      || record['banner'].length > MAX_MARKETPLACE_BANNER_LENGTH) {
      throw new SkillMarketError(
        'frontmatter-invalid',
        `技能 "${name}" 的 metadata.marketplace.banner 必须是字符串`,
        { reason: 'banner is not a string' },
        400,
      )
    }
    result.banner = record['banner']
  }
  return Object.keys(result).length === 0 ? undefined : result
}

/**
 * 校验宣传图相对路径格式。
 * @param bannerPath - 相对路径。
 * @param name - 技能名。
 */
function validateBannerPath(bannerPath: string, name: string): void {
  if (bannerPath.length === 0) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 的宣传图路径为空`,
      { reason: 'empty banner path' },
      400,
    )
  }
  if (bannerPath.includes('\0')) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 的宣传图路径包含 NUL 字节`,
      { reason: 'NUL byte' },
      400,
    )
  }
  if (bannerPath.includes('\\')) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 的宣传图路径包含反斜杠`,
      { reason: 'backslash in banner path' },
      400,
    )
  }
  if (bannerPath.startsWith('/') || /^[a-zA-Z]:/.test(bannerPath)) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 的宣传图路径必须是相对路径`,
      { reason: 'absolute banner path' },
      400,
    )
  }
  const segments = bannerPath.split('/')
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new SkillMarketError(
        'banner-invalid',
        `技能 "${name}" 的宣传图路径包含相对片段`,
        { reason: `unsafe segment in ${bannerPath}` },
        400,
      )
    }
  }
  const ext = posix.extname(bannerPath).toLowerCase()
  if (BANNER_EXTENSIONS[ext] === undefined) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 的宣传图扩展名 "${ext}" 不支持（仅 png/jpeg/webp/gif）`,
      { reason: `unsupported extension: ${ext}` },
      400,
    )
  }
}

/** Read the media type declared by one supported banner extension. */
function detectBannerMime(bannerPath: string): SkillMarketBannerMediaType | undefined {
  const ext = posix.extname(bannerPath).toLowerCase()
  return BANNER_EXTENSIONS[ext]
}

/**
 * Validate one promotional image's size and signature against its extension.
 * @param bannerPath - normalized path relative to the skill directory.
 * @param bytes - regular-file bytes, or `undefined` when the path is absent.
 * @param name - skill name used only in diagnostics.
 * @returns the validated media type.
 */
function validateBannerBytes(
  bannerPath: string,
  bytes: Uint8Array | undefined,
  name: string,
): SkillMarketBannerMediaType {
  const mediaType = detectBannerMime(bannerPath)
  if (mediaType === undefined) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 宣传图扩展名不受支持`,
      { reason: `unsupported extension: ${bannerPath}` },
      400,
    )
  }
  if (bytes === undefined) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 宣传图文件缺失`,
      { reason: `missing regular file: ${bannerPath}` },
      400,
    )
  }
  if (bytes.byteLength > MAX_BANNER_BYTES) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 宣传图大小超过 ${MAX_BANNER_BYTES} 字节`,
      { reason: `banner exceeds ${MAX_BANNER_BYTES} bytes` },
      400,
    )
  }
  if (!matchesBannerSignature(mediaType, bytes)) {
    throw new SkillMarketError(
      'banner-invalid',
      `技能 "${name}" 宣传图内容与扩展名不匹配`,
      { reason: `signature mismatch: ${bannerPath}` },
      400,
    )
  }
  return mediaType
}

function matchesBannerSignature(mediaType: string, bytes: Uint8Array): boolean {
  switch (mediaType) {
    case 'image/png':
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/jpeg':
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff])
    case 'image/gif':
      return startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
        || startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    case 'image/webp':
      return startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46])
        && bytes.byteLength >= 12
        && startsWithBytes(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
    default:
      return false
  }
}

function startsWithBytes(bytes: Uint8Array, expected: readonly number[]): boolean {
  return bytes.byteLength >= expected.length
    && expected.every((value, index) => bytes[index] === value)
}

/** 校验宣传图最终路径仍在技能目录内。 */
function resolveBannerPath(skillDirPath: string, bannerPath: string): string {
  return resolve(skillDirPath, bannerPath.split('/').join(sep))
}

/** 路径包含性检查（防止 symlink/sneaky tricks；前提是绝对路径）。 */
function isPathContained(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel.length === 0 || (!rel.startsWith('..') && !rel.startsWith(sep) && rel !== '..')
}

/**
 * 产生一个同父目录下唯一的 backup 路径。
 * @param parent - installRoot。
 * @param name - 原技能目录名。
 */
async function uniquePrivatePath(
  parent: string,
  kind: 'backup' | 'tombstone',
  name: string,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = join(
      parent,
      `.dsh-market-${kind}-${name}-${randomBytes(4).toString('hex')}`,
    )
    if (!(await pathExists(candidate))) return candidate
  }
  throw new SkillMarketError(
    'internal',
    `无法为 ${name} 找到唯一 ${kind} 路径`,
    { },
    500,
  )
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function hasValidInstalledBanner(
  dirPath: string,
  manifest: SkillMarketManifest,
): Promise<boolean> {
  const banner = manifest.metadata?.banner
  if (banner === undefined) return false
  const path = resolveBannerPath(dirPath, banner.path)
  if (!isPathContained(dirPath, path)) return false
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BANNER_BYTES) return false
    const bytes = await readFile(path)
    return validateBannerBytes(banner.path, bytes, manifest.name) === banner.mediaType
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    if (error instanceof SkillMarketError) return false
    throw error
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Resolve the configured or default user skill directory.
 * @param configured - Optional configured installation root.
 * @returns Absolute skill directory path.
 */
export function resolveDefaultInstallRoot(configured?: string): string {
  if (configured !== undefined && configured.trim().length > 0) {
    return resolve(configured)
  }
  return resolve(resolveDshHome(), DEFAULT_INSTALL_ROOT)
}
