/** Trusted subagent package validation and managed lifecycle. */

import { lstat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { KeyedMutex } from '@deepseek-ai/dsh-marketplace-core'
import {
  ArchiveValidationError,
  decodeArchiveBase64,
  descriptorSignaturePayload,
  inspectZipArchive,
  listManagedPackages,
  parseSubagentPackageDescriptor,
  preparePackageArchive,
  publishManagedPackage,
  readManagedPackage,
  resolveTrustedPublisher,
  uninstallManagedPackage,
  verifyPackageFileHashes,
  verifyPublisherSignature,
} from '@deepseek-ai/dsh-marketplace-core'
import type {
  TrustedPublisher,
  SubagentPackageDescriptor,
} from '@deepseek-ai/dsh-marketplace-core'
import type {
  SubagentMarketEntry,
  SubagentMarketFailure,
  SubagentMarketInstallRequest,
  SubagentMarketInstallResult,
  SubagentMarketListResult,
  SubagentMarketPackageId,
  SubagentMarketUninstallResult,
} from './types.ts'

class SubagentMarketDomainError extends Error {
  constructor(readonly failure: SubagentMarketFailure) {
    super('reason' in failure ? `${failure.code}: ${failure.reason}` : failure.code)
  }
}

export { SubagentMarketDomainError }

/**
 * Map a marketplace domain error to its structured failure result.
 * @param error - Error caught by a Remote gateway method.
 * @returns The failure result; anything that is not a domain error rethrows.
 */
export function asSubagentMarketResult(error: unknown): { readonly ok: false; readonly error: SubagentMarketFailure } {
  if (error instanceof SubagentMarketDomainError) return { ok: false, error: error.failure }
  throw error
}

/** Runtime dependencies for managed subagent packages. */
export interface SubagentMarketServiceOptions {
  readonly installRoot: string
  readonly trustedPublishers: readonly TrustedPublisher[]
  /** Explicit local override: skip publisher-trust verification. */
  readonly allowUnsignedPackages: boolean
}

/** Owns managed subagent package files. */
export class SubagentMarketService {
  private readonly mutations = new KeyedMutex<string>()
  private readonly diagnostics = new Map<string, string>()

  constructor(private readonly options: SubagentMarketServiceOptions) {}

  /**
   * Absolute managed directory of one installed package.
   * @param packageId - Managed package identity.
   * @returns Resolved install directory of the package payload.
   */
  packageDirectory(packageId: string): string {
    return join(resolve(this.options.installRoot), packageId)
  }

  /**
   * Read one installed package descriptor.
   * @param packageId - Managed package identity.
   * @returns Parsed descriptor from the installed package.
   */
  async descriptor(packageId: string): Promise<SubagentPackageDescriptor> {
    try {
      const ownership = await readManagedPackage(this.options.installRoot, packageId, 'subagent')
      if (ownership.status !== 'managed') throw new Error('subagent package is not marketplace-managed')
      const descriptorFile = join(this.options.installRoot, packageId, 'subagent-package.json')
      const descriptorInfo = await lstat(descriptorFile)
      if (!descriptorInfo.isFile() || descriptorInfo.isSymbolicLink()) {
        throw new Error('subagent descriptor is not a regular file')
      }
      const descriptor = parseSubagentPackageDescriptor(JSON.parse(await readFile(descriptorFile, 'utf8')))
      if (
        descriptor.id !== ownership.manifest.id
        || descriptor.version !== ownership.manifest.version
        || descriptor.publisher.id !== ownership.manifest.publisherId
      ) {
        throw new Error('subagent descriptor does not match its managed manifest')
      }
      const entries = await Promise.all(Object.keys(descriptor.files).map(async (name) => {
        const filename = join(this.options.installRoot, packageId, name)
        const info = await lstat(filename)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error(`subagent package file "${name}" is not regular`)
        return { name, bytes: new Uint8Array(await readFile(filename)), kind: 'regular' as const }
      }))
      verifyPackageFileHashes({
        entries,
        totalBytes: entries.reduce((total, entry) => total + entry.bytes.byteLength, 0),
      }, descriptor.files)
      if (!this.options.allowUnsignedPackages) verifyTrust(descriptor, this.options.trustedPublishers)
      return descriptor
    } catch (error: unknown) {
      throw new SubagentMarketDomainError({
        code: 'invalid-package',
        reason: error instanceof Error ? error.message : 'invalid subagent descriptor',
      })
    }
  }

  /**
   * List managed packages with entry summaries.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  async list(): Promise<SubagentMarketListResult> {
    return await result(async () => {
      const manifests = await listManagedPackages(this.options.installRoot, 'subagent')
      const entries: SubagentMarketEntry[] = []
      for (const manifest of manifests) {
        let descriptor: SubagentPackageDescriptor
        try {
          descriptor = await this.descriptor(manifest.id)
        } catch (error: unknown) {
          entries.push({
            packageId: manifest.id as SubagentMarketPackageId,
            displayName: manifest.id,
            description: 'Installed subagent package failed trust validation.',
            version: manifest.version,
            publisherId: manifest.publisherId,
            entries: [],
            permissions: [],
            installedAt: manifest.installedAt,
            available: false,
            restartRequired: true,
            diagnostic: error instanceof Error ? error.message : 'subagent package validation failed',
          })
          continue
        }
        const diagnostic = this.diagnostics.get(manifest.id)
        entries.push({
          packageId: manifest.id as SubagentMarketPackageId,
          displayName: descriptor.display.name,
          description: descriptor.display.description,
          version: manifest.version,
          publisherId: manifest.publisherId,
          entries: descriptor.subagents.map(subagent => ({ id: subagent.id, available: true })),
          permissions: descriptor.permissions,
          installedAt: manifest.installedAt,
          available: true,
          restartRequired: true,
          ...(diagnostic === undefined ? {} : { diagnostic }),
        })
      }
      return { entries }
    })
  }

  /**
   * Install or explicitly upgrade one trusted package.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  async install(request: SubagentMarketInstallRequest): Promise<SubagentMarketInstallResult> {
    return await result(async () => {
      const archive = preparePackageArchive(
        await inspectZipArchive(decodeArchiveBase64(request.archiveBase64)),
        'subagent-package.json',
      )
      const descriptorEntry = archive.entries.find(entry => entry.name === 'subagent-package.json')
      if (descriptorEntry === undefined) throw new Error('archive must contain subagent-package.json')
      const descriptor = parseDescriptor(descriptorEntry.bytes)
      verifyPackageFileHashes(archive, descriptor.files)
      if (!this.options.allowUnsignedPackages) verifyTrust(descriptor, this.options.trustedPublishers)
      if (request.confirmLocalExecution !== true) {
        throw new SubagentMarketDomainError({
          code: 'local-execution-confirmation-required',
          candidatePermissions: [...descriptor.permissions],
        })
      }
      return await this.mutations.runExclusive(descriptor.id, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, descriptor.id, 'subagent')
        assertMutableOwnership(ownership.status, descriptor.id, descriptor.version, request.replaceExisting === true, ownership)
        const operation = await publishManagedPackage(
          this.options.installRoot,
          descriptor.id,
          archive,
          request.replaceExisting === true,
          {
            format: 1,
            kind: 'subagent',
            id: descriptor.id,
            version: descriptor.version,
            publisherId: descriptor.publisher.id,
            installedAt: Date.now(),
          },
        )
        return {
          packageId: descriptor.id as SubagentMarketPackageId,
          operation,
          restartRequired: true as const,
        }
      })
    })
  }

  /**
   * Remove one managed package.
   * @param packageId - Managed package identity to remove.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  async uninstall(packageId: SubagentMarketPackageId): Promise<SubagentMarketUninstallResult> {
    return await result(async () => {
      return await this.mutations.runExclusive(packageId, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, packageId, 'subagent')
        if (ownership.status === 'missing') throw new SubagentMarketDomainError({ code: 'not-found', packageId })
        if (ownership.status === 'unmanaged') throw new SubagentMarketDomainError({ code: 'unmanaged-conflict', packageId })
        if (ownership.status === 'incompatible') throw new SubagentMarketDomainError({ code: 'manifest-incompatible', packageId })
        await uninstallManagedPackage(this.options.installRoot, packageId, 'subagent')
        this.diagnostics.delete(packageId)
        return { packageId, restartRequired: true as const }
      })
    })
  }

  /**
   * Record a package-level diagnostic without credential values.
   * @param packageId - Managed package identity.
   * @param diagnostic - Public diagnostic, or undefined to clear it.
   */
  setDiagnostic(packageId: string, diagnostic?: string): void {
    if (diagnostic === undefined) this.diagnostics.delete(packageId)
    else this.diagnostics.set(packageId, diagnostic)
  }
}

function parseDescriptor(bytes: Uint8Array): SubagentPackageDescriptor {
  try {
    return parseSubagentPackageDescriptor(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error: unknown) {
    throw new SubagentMarketDomainError({
      code: 'invalid-package',
      reason: error instanceof Error ? error.message : 'invalid subagent descriptor',
    })
  }
}

function verifyTrust(descriptor: SubagentPackageDescriptor, publishers: readonly TrustedPublisher[]): void {
  const publicKey = resolveTrustedPublisher(publishers, descriptor.publisher.id)
  if (publicKey === undefined) {
    throw new SubagentMarketDomainError({ code: 'untrusted-publisher', publisherId: descriptor.publisher.id })
  }
  if (!verifyPublisherSignature(descriptorSignaturePayload(descriptor), descriptor.publisher.signature, publicKey)) {
    throw new SubagentMarketDomainError({ code: 'invalid-signature', publisherId: descriptor.publisher.id })
  }
}

function assertMutableOwnership(
  status: 'missing' | 'unmanaged' | 'incompatible' | 'managed',
  id: string,
  version: string,
  replaceExisting: boolean,
  ownership: Awaited<ReturnType<typeof readManagedPackage>>,
): void {
  const packageId = id as SubagentMarketPackageId
  if (status === 'managed' && !replaceExisting) {
    const installedVersion = ownership.status === 'managed' ? ownership.manifest.version : ''
    throw new SubagentMarketDomainError({
      code: 'managed-upgrade-required',
      packageId,
      installedVersion,
      candidateVersion: version,
    })
  }
  if (status === 'unmanaged') throw new SubagentMarketDomainError({ code: 'unmanaged-conflict', packageId })
  if (status === 'incompatible') throw new SubagentMarketDomainError({ code: 'manifest-incompatible', packageId })
}

async function result<Value>(
  operation: () => Promise<Value>,
): Promise<{ readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: SubagentMarketFailure }> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    if (error instanceof SubagentMarketDomainError) return { ok: false, error: error.failure }
    if (error instanceof ArchiveValidationError) return { ok: false, error: error.failure }
    if (error instanceof Error && (
      error.message.startsWith('unsafe archive')
      || error.message.startsWith('duplicate archive')
      || error.message.startsWith('unsupported archive')
      || error.message.startsWith('archive must contain')
    )) {
      return { ok: false, error: { code: 'invalid-package', reason: error.message } }
    }
    throw error
  }
}
