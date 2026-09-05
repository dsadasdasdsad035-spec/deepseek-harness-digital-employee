/** Trusted workflow package validation and managed lifecycle. */

import { lstat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { KeyedMutex } from '@deepseek-ai/dsh-marketplace-core'
import {
  ArchiveValidationError,
  decodeArchiveBase64,
  descriptorSignaturePayload,
  inspectZipArchive,
  listManagedPackages,
  parseWorkflowPackageDescriptor,
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
  WorkflowPackageDescriptor,
} from '@deepseek-ai/dsh-marketplace-core'
import type {
  WorkflowMarketEntry,
  WorkflowMarketFailure,
  WorkflowMarketInstallRequest,
  WorkflowMarketInstallResult,
  WorkflowMarketListResult,
  WorkflowMarketPackageId,
  WorkflowMarketUninstallResult,
} from './types.ts'

class WorkflowMarketDomainError extends Error {
  constructor(readonly failure: WorkflowMarketFailure) {
    super('reason' in failure ? `${failure.code}: ${failure.reason}` : failure.code)
  }
}

export { WorkflowMarketDomainError }

/**
 * Map a marketplace domain error to its structured failure result.
 * @param error - Error caught by a Remote gateway method.
 * @returns The failure result; anything that is not a domain error rethrows.
 */
export function asWorkflowMarketResult(error: unknown): { readonly ok: false; readonly error: WorkflowMarketFailure } {
  if (error instanceof WorkflowMarketDomainError) return { ok: false, error: error.failure }
  throw error
}

/** Runtime dependencies for managed workflow packages. */
export interface WorkflowMarketServiceOptions {
  readonly installRoot: string
  readonly trustedPublishers: readonly TrustedPublisher[]
  /** Explicit local override: skip publisher-trust verification. */
  readonly allowUnsignedPackages: boolean
}

/** Owns managed workflow package files. */
export class WorkflowMarketService {
  private readonly mutations = new KeyedMutex<string>()
  private readonly diagnostics = new Map<string, string>()

  constructor(private readonly options: WorkflowMarketServiceOptions) {}

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
  async descriptor(packageId: string): Promise<WorkflowPackageDescriptor> {
    try {
      const ownership = await readManagedPackage(this.options.installRoot, packageId, 'workflow')
      if (ownership.status !== 'managed') throw new Error('workflow package is not marketplace-managed')
      const descriptorFile = join(this.options.installRoot, packageId, 'workflow-package.json')
      const descriptorInfo = await lstat(descriptorFile)
      if (!descriptorInfo.isFile() || descriptorInfo.isSymbolicLink()) {
        throw new Error('workflow descriptor is not a regular file')
      }
      const descriptor = parseWorkflowPackageDescriptor(JSON.parse(await readFile(descriptorFile, 'utf8')))
      if (
        descriptor.id !== ownership.manifest.id
        || descriptor.version !== ownership.manifest.version
        || descriptor.publisher.id !== ownership.manifest.publisherId
      ) {
        throw new Error('workflow descriptor does not match its managed manifest')
      }
      const entries = await Promise.all(Object.keys(descriptor.files).map(async (name) => {
        const filename = join(this.options.installRoot, packageId, name)
        const info = await lstat(filename)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error(`workflow package file "${name}" is not regular`)
        return { name, bytes: new Uint8Array(await readFile(filename)), kind: 'regular' as const }
      }))
      verifyPackageFileHashes({
        entries,
        totalBytes: entries.reduce((total, entry) => total + entry.bytes.byteLength, 0),
      }, descriptor.files)
      if (!this.options.allowUnsignedPackages) verifyTrust(descriptor, this.options.trustedPublishers)
      return descriptor
    } catch (error: unknown) {
      throw new WorkflowMarketDomainError({
        code: 'invalid-package',
        reason: error instanceof Error ? error.message : 'invalid workflow descriptor',
      })
    }
  }

  /**
   * List managed packages with entry summaries.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  async list(): Promise<WorkflowMarketListResult> {
    return await result(async () => {
      const manifests = await listManagedPackages(this.options.installRoot, 'workflow')
      const entries: WorkflowMarketEntry[] = []
      for (const manifest of manifests) {
        let descriptor: WorkflowPackageDescriptor
        try {
          descriptor = await this.descriptor(manifest.id)
        } catch (error: unknown) {
          entries.push({
            packageId: manifest.id as WorkflowMarketPackageId,
            displayName: manifest.id,
            description: 'Installed workflow package failed trust validation.',
            version: manifest.version,
            publisherId: manifest.publisherId,
            entries: [],
            permissions: [],
            installedAt: manifest.installedAt,
            available: false,
            restartRequired: true,
            diagnostic: error instanceof Error ? error.message : 'workflow package validation failed',
          })
          continue
        }
        const diagnostic = this.diagnostics.get(manifest.id)
        entries.push({
          packageId: manifest.id as WorkflowMarketPackageId,
          displayName: descriptor.display.name,
          description: descriptor.display.description,
          version: manifest.version,
          publisherId: manifest.publisherId,
          entries: descriptor.workflows.map(workflow => ({ id: workflow.id, available: true })),
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
  async install(request: WorkflowMarketInstallRequest): Promise<WorkflowMarketInstallResult> {
    return await result(async () => {
      const archive = preparePackageArchive(
        await inspectZipArchive(decodeArchiveBase64(request.archiveBase64)),
        'workflow-package.json',
      )
      const descriptorEntry = archive.entries.find(entry => entry.name === 'workflow-package.json')
      if (descriptorEntry === undefined) throw new Error('archive must contain workflow-package.json')
      const descriptor = parseDescriptor(descriptorEntry.bytes)
      verifyPackageFileHashes(archive, descriptor.files)
      if (!this.options.allowUnsignedPackages) verifyTrust(descriptor, this.options.trustedPublishers)
      if (request.confirmLocalExecution !== true) {
        throw new WorkflowMarketDomainError({
          code: 'local-execution-confirmation-required',
          candidatePermissions: [...descriptor.permissions],
        })
      }
      return await this.mutations.runExclusive(descriptor.id, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, descriptor.id, 'workflow')
        assertMutableOwnership(ownership.status, descriptor.id, descriptor.version, request.replaceExisting === true, ownership)
        const operation = await publishManagedPackage(
          this.options.installRoot,
          descriptor.id,
          archive,
          request.replaceExisting === true,
          {
            format: 1,
            kind: 'workflow',
            id: descriptor.id,
            version: descriptor.version,
            publisherId: descriptor.publisher.id,
            installedAt: Date.now(),
          },
        )
        return {
          packageId: descriptor.id as WorkflowMarketPackageId,
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
  async uninstall(packageId: WorkflowMarketPackageId): Promise<WorkflowMarketUninstallResult> {
    return await result(async () => {
      return await this.mutations.runExclusive(packageId, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, packageId, 'workflow')
        if (ownership.status === 'missing') throw new WorkflowMarketDomainError({ code: 'not-found', packageId })
        if (ownership.status === 'unmanaged') throw new WorkflowMarketDomainError({ code: 'unmanaged-conflict', packageId })
        if (ownership.status === 'incompatible') throw new WorkflowMarketDomainError({ code: 'manifest-incompatible', packageId })
        await uninstallManagedPackage(this.options.installRoot, packageId, 'workflow')
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

function parseDescriptor(bytes: Uint8Array): WorkflowPackageDescriptor {
  try {
    return parseWorkflowPackageDescriptor(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error: unknown) {
    throw new WorkflowMarketDomainError({
      code: 'invalid-package',
      reason: error instanceof Error ? error.message : 'invalid workflow descriptor',
    })
  }
}

function verifyTrust(descriptor: WorkflowPackageDescriptor, publishers: readonly TrustedPublisher[]): void {
  const publicKey = resolveTrustedPublisher(publishers, descriptor.publisher.id)
  if (publicKey === undefined) {
    throw new WorkflowMarketDomainError({ code: 'untrusted-publisher', publisherId: descriptor.publisher.id })
  }
  if (!verifyPublisherSignature(descriptorSignaturePayload(descriptor), descriptor.publisher.signature, publicKey)) {
    throw new WorkflowMarketDomainError({ code: 'invalid-signature', publisherId: descriptor.publisher.id })
  }
}

function assertMutableOwnership(
  status: 'missing' | 'unmanaged' | 'incompatible' | 'managed',
  id: string,
  version: string,
  replaceExisting: boolean,
  ownership: Awaited<ReturnType<typeof readManagedPackage>>,
): void {
  const packageId = id as WorkflowMarketPackageId
  if (status === 'managed' && !replaceExisting) {
    const installedVersion = ownership.status === 'managed' ? ownership.manifest.version : ''
    throw new WorkflowMarketDomainError({
      code: 'managed-upgrade-required',
      packageId,
      installedVersion,
      candidateVersion: version,
    })
  }
  if (status === 'unmanaged') throw new WorkflowMarketDomainError({ code: 'unmanaged-conflict', packageId })
  if (status === 'incompatible') throw new WorkflowMarketDomainError({ code: 'manifest-incompatible', packageId })
}

async function result<Value>(
  operation: () => Promise<Value>,
): Promise<{ readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: WorkflowMarketFailure }> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    if (error instanceof WorkflowMarketDomainError) return { ok: false, error: error.failure }
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
