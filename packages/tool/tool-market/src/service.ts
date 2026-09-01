/** Trusted Tool package validation and managed lifecycle. */

import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  ArchiveValidationError,
  decodeArchiveBase64,
  descriptorSignaturePayload,
  inspectZipArchive,
  KeyedMutex,
  listManagedPackages,
  parseToolPackageDescriptor,
  preparePackageArchive,
  publishManagedPackage,
  readManagedPackage,
  resolveTrustedPublisher,
  uninstallManagedPackage,
  verifyPackageFileHashes,
  verifyPublisherSignature,
} from '@deepseek-ai/dsh-marketplace-core'
import type {
  ArchiveFailure,
  ToolPackageDescriptor,
  TrustedPublisher,
} from '@deepseek-ai/dsh-marketplace-core'
import type {
  ToolMarketEntry,
  ToolMarketFailure,
  ToolMarketInstallRequest,
  ToolMarketInstallResult,
  ToolMarketListResult,
  ToolMarketPackageId,
  ToolMarketUninstallResult,
} from './types.ts'

class ToolMarketDomainError extends Error {
  constructor(readonly failure: ToolMarketFailure) {
    super(failure.code)
  }
}

/** Runtime dependencies for the Tool marketplace engine. */
export interface ToolMarketServiceOptions {
  readonly installRoot: string
  readonly trustedPublishers: readonly TrustedPublisher[]
  readonly activeToolNames: () => readonly string[]
}

/** Validates signed Tool packages and owns managed filesystem mutations. */
export class ToolMarketService {
  private readonly mutations = new KeyedMutex<string>()

  constructor(private readonly options: ToolMarketServiceOptions) {}

  /**
   * Revalidate installed package content before restart-time code loading.
   * @returns Trusted entry files in deterministic package order.
   */
  async activationCandidates(): Promise<readonly {
    readonly id: string
    readonly entryPath: string
    readonly installedAt: number
    readonly toolNames: readonly string[]
  }[]> {
    const manifests = await listManagedPackages(this.options.installRoot, 'tool')
    const candidates: Array<{
      id: string
      entryPath: string
      installedAt: number
      toolNames: readonly string[]
    }> = []
    for (const manifest of manifests) {
      const descriptor = parseDescriptor(new Uint8Array(
        await readFile(join(this.options.installRoot, manifest.id, 'tool-package.json')),
      ))
      verifyTrust(descriptor, this.options.trustedPublishers)
      const entries = await Promise.all(Object.keys(descriptor.files).map(async name => ({
        name,
        bytes: new Uint8Array(await readFile(join(this.options.installRoot, manifest.id, name))),
        kind: 'regular' as const,
      })))
      verifyPackageFileHashes({
        entries,
        totalBytes: entries.reduce((total, entry) => total + entry.bytes.byteLength, 0),
      }, descriptor.files)
      validatePackageFiles(entries.map(entry => entry.name), descriptor)
      candidates.push({
        id: manifest.id,
        entryPath: join(this.options.installRoot, manifest.id, descriptor.entry),
        installedAt: manifest.installedAt,
        toolNames: descriptor.tools.map(tool => tool.name),
      })
    }
    return candidates
  }

  /**
   * List deterministic managed inventory with current-process availability.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  async list(): Promise<ToolMarketListResult> {
    return await result(async () => {
      const active = new Set(this.options.activeToolNames())
      const manifests = await listManagedPackages(this.options.installRoot, 'tool')
      const entries: ToolMarketEntry[] = []
      for (const manifest of manifests) {
        const descriptor = parseToolPackageDescriptor(JSON.parse(
          await readFile(join(this.options.installRoot, manifest.id, 'tool-package.json'), 'utf8'),
        ))
        const tools = descriptor.tools.map(tool => ({ ...tool, available: active.has(tool.name) }))
        const available = tools.every(tool => tool.available)
        entries.push({
          packageId: manifest.id as ToolMarketPackageId,
          displayName: descriptor.display.name,
          description: descriptor.display.description,
          version: manifest.version,
          publisherId: manifest.publisherId,
          permissions: descriptor.permissions,
          tools,
          installedAt: manifest.installedAt,
          available,
          restartRequired: !available,
        })
      }
      return { entries }
    })
  }

  /**
   * Validate and atomically install or upgrade one signed Tool ZIP.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  async install(request: ToolMarketInstallRequest): Promise<ToolMarketInstallResult> {
    return await result(async () => {
      const archive = preparePackageArchive(
        await inspectZipArchive(decodeArchiveBase64(request.archiveBase64)),
        'tool-package.json',
      )
      const descriptorEntry = archive.entries.find(entry => entry.name === 'tool-package.json')
      if (descriptorEntry === undefined) throw new Error('archive must contain tool-package.json')
      const descriptor = parseDescriptor(descriptorEntry.bytes)
      verifyPackageFileHashes(archive, descriptor.files)
      validatePackageFiles(archive.entries.map(entry => entry.name), descriptor)
      verifyTrust(descriptor, this.options.trustedPublishers)
      return await this.mutations.runExclusive(descriptor.id, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, descriptor.id, 'tool')
        if (ownership.status === 'managed' && request.replaceExisting !== true) {
          throw new ToolMarketDomainError({
            code: 'managed-upgrade-required',
            packageId: descriptor.id as ToolMarketPackageId,
            installedVersion: ownership.manifest.version,
            candidateVersion: descriptor.version,
          })
        }
        if (ownership.status === 'unmanaged') {
          throw new ToolMarketDomainError({
            code: 'unmanaged-conflict',
            packageId: descriptor.id as ToolMarketPackageId,
          })
        }
        if (ownership.status === 'incompatible') {
          throw new ToolMarketDomainError({
            code: 'manifest-incompatible',
            packageId: descriptor.id as ToolMarketPackageId,
          })
        }
        const operation = await publishManagedPackage(
          resolve(this.options.installRoot),
          descriptor.id,
          archive,
          request.replaceExisting === true,
          {
            format: 1,
            kind: 'tool',
            id: descriptor.id,
            version: descriptor.version,
            publisherId: descriptor.publisher.id,
            installedAt: Date.now(),
          },
        )
        return {
          packageId: descriptor.id as ToolMarketPackageId,
          operation,
          restartRequired: true as const,
        }
      })
    })
  }

  /**
   * Atomically detach one managed Tool package.
   * @param packageId - Managed package identity.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  async uninstall(packageId: ToolMarketPackageId): Promise<ToolMarketUninstallResult> {
    return await result(async () => {
      return await this.mutations.runExclusive(packageId, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, packageId, 'tool')
        if (ownership.status === 'missing') {
          throw new ToolMarketDomainError({ code: 'not-found', packageId })
        }
        if (ownership.status === 'unmanaged') {
          throw new ToolMarketDomainError({ code: 'unmanaged-conflict', packageId })
        }
        if (ownership.status === 'incompatible') {
          throw new ToolMarketDomainError({ code: 'manifest-incompatible', packageId })
        }
        await uninstallManagedPackage(this.options.installRoot, packageId, 'tool')
        return { packageId, restartRequired: true as const }
      })
    })
  }
}

function parseDescriptor(bytes: Uint8Array): ToolPackageDescriptor {
  try {
    return parseToolPackageDescriptor(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error: unknown) {
    throw new ToolMarketDomainError({
      code: 'invalid-package',
      reason: error instanceof Error ? error.message : 'invalid Tool descriptor',
    })
  }
}

function validatePackageFiles(names: readonly string[], descriptor: ToolPackageDescriptor): void {
  if (!names.includes(descriptor.entry)) {
    throw new ToolMarketDomainError({ code: 'invalid-package', reason: `missing entry "${descriptor.entry}"` })
  }
}

function verifyTrust(descriptor: ToolPackageDescriptor, publishers: readonly TrustedPublisher[]): void {
  const publicKey = resolveTrustedPublisher(publishers, descriptor.publisher.id)
  if (publicKey === undefined) {
    throw new ToolMarketDomainError({
      code: 'untrusted-publisher',
      publisherId: descriptor.publisher.id,
    })
  }
  if (!verifyPublisherSignature(
    descriptorSignaturePayload(descriptor),
    descriptor.publisher.signature,
    publicKey,
  )) {
    throw new ToolMarketDomainError({
      code: 'invalid-signature',
      publisherId: descriptor.publisher.id,
    })
  }
}

async function result<Value>(
  operation: () => Promise<Value>,
): Promise<{ readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: ToolMarketFailure }> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    if (error instanceof ToolMarketDomainError) return { ok: false, error: error.failure }
    if (error instanceof ArchiveValidationError) return { ok: false, error: archiveFailure(error.failure) }
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

function archiveFailure(failure: ArchiveFailure): ToolMarketFailure {
  return failure
}
