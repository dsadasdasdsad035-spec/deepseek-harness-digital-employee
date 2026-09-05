/** Trusted hook package validation, credential references, and managed lifecycle. */

import { lstat, mkdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef } from '@deepseek-ai/dsh-credentials'
import {
  ArchiveValidationError,
  decodeArchiveBase64,
  descriptorSignaturePayload,
  inspectZipArchive,
  KeyedMutex,
  listManagedPackages,
  parseHookPackageDescriptor,
  preparePackageArchive,
  publishManagedPackage,
  readManagedPackage,
  resolveTrustedPublisher,
  uninstallManagedPackage,
  verifyPackageFileHashes,
  verifyPublisherSignature,
} from '@deepseek-ai/dsh-marketplace-core'
import type {
  HookPackageDescriptor,
  TrustedPublisher,
} from '@deepseek-ai/dsh-marketplace-core'
import type {
  HookMarketConfigureRequest,
  HookMarketConfigureResult,
  HookMarketCredentialRequirement,
  HookMarketEntry,
  HookMarketFailure,
  HookMarketInstallRequest,
  HookMarketInstallResult,
  HookMarketListResult,
  HookMarketPackageId,
  HookMarketUninstallResult,
} from './types.ts'

interface ConfigurationDocument {
  readonly format: 1
  readonly packages: Readonly<Record<string, Readonly<Record<string, string>>>>
}

/** Error type the gateway maps to its structured hook marketplace failure. */
class HookMarketDomainError extends Error {
  constructor(readonly failure: HookMarketFailure) {
    super('reason' in failure ? `${failure.code}: ${failure.reason}` : failure.code)
  }
}

export { HookMarketDomainError }

/**
 * Map a hook marketplace domain error to its structured failure result.
 * @param error - Error caught by a Remote gateway method.
 * @returns The failure result; anything that is not a domain error rethrows.
 */
export function asHookMarketResult(error: unknown): { readonly ok: false; readonly error: HookMarketFailure } {
  if (error instanceof HookMarketDomainError) return { ok: false, error: error.failure }
  throw error
}

/** Runtime dependencies for managed hook packages. */
export interface HookMarketServiceOptions {
  readonly installRoot: string
  readonly trustedPublishers: readonly TrustedPublisher[]
  /** Bare interpreter command names hook commands may name. */
  readonly stdioInterpreters: readonly string[]
  /** Explicit local override: skip publisher-trust verification. */
  readonly allowUnsignedPackages: boolean
  readonly credentialInfo: (ref: CredentialRef) => Promise<CredentialInfo>
}

/** Owns managed hook package files and credential-reference configuration. */
export class HookMarketService {
  private readonly mutations = new KeyedMutex<string>()
  private readonly configFile: string
  private readonly diagnostics = new Map<string, string>()

  constructor(private readonly options: HookMarketServiceOptions) {
    this.configFile = join(resolve(options.installRoot), '.hook-configurations.json')
  }

  /**
   * Absolute managed directory of one installed hook package.
   * @param packageId - Managed package identity.
   * @returns Resolved install directory of the package payload.
   */
  packageDirectory(packageId: string): string {
    return join(resolve(this.options.installRoot), packageId)
  }

  /**
   * Read one installed hook package descriptor.
   * @param packageId - Managed package identity.
   * @returns Parsed descriptor from the installed package.
   */
  async descriptor(packageId: string): Promise<HookPackageDescriptor> {
    try {
      const ownership = await readManagedPackage(this.options.installRoot, packageId, 'hook')
      if (ownership.status !== 'managed') throw new Error('hook package is not marketplace-managed')
      const descriptorFile = join(this.options.installRoot, packageId, 'hook-package.json')
      const descriptorInfo = await lstat(descriptorFile)
      if (!descriptorInfo.isFile() || descriptorInfo.isSymbolicLink()) {
        throw new Error('hook descriptor is not a regular file')
      }
      const descriptor = parseHookPackageDescriptor(JSON.parse(await readFile(descriptorFile, 'utf8')))
      if (
        descriptor.id !== ownership.manifest.id
        || descriptor.version !== ownership.manifest.version
        || descriptor.publisher.id !== ownership.manifest.publisherId
      ) {
        throw new Error('hook descriptor does not match its managed manifest')
      }
      const entries = await Promise.all(Object.keys(descriptor.files).map(async (name) => {
        const filename = join(this.options.installRoot, packageId, name)
        const info = await lstat(filename)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error(`hook package file "${name}" is not regular`)
        return { name, bytes: new Uint8Array(await readFile(filename)), kind: 'regular' as const }
      }))
      verifyPackageFileHashes({
        entries,
        totalBytes: entries.reduce((total, entry) => total + entry.bytes.byteLength, 0),
      }, descriptor.files)
      if (!this.options.allowUnsignedPackages) verifyTrust(descriptor, this.options.trustedPublishers)
      this.assertInterpreterAllowlist(descriptor)
      return descriptor
    } catch (error: unknown) {
      throw new HookMarketDomainError({
        code: 'invalid-package',
        reason: error instanceof Error ? error.message : 'invalid hook descriptor',
      })
    }
  }

  /**
   * List managed hook packages and credential-reference presence.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  async list(): Promise<HookMarketListResult> {
    return await result(async () => {
      const configurations = await this.readConfiguration().then(document => document.packages)
      const manifests = await listManagedPackages(this.options.installRoot, 'hook')
      const entries: HookMarketEntry[] = []
      for (const manifest of manifests) {
        let descriptor: HookPackageDescriptor
        try {
          descriptor = await this.descriptor(manifest.id)
        } catch (error: unknown) {
          entries.push({
            packageId: manifest.id as HookMarketPackageId,
            displayName: manifest.id,
            description: 'Installed hook package failed trust validation.',
            version: manifest.version,
            publisherId: manifest.publisherId,
            hooks: [],
            permissions: [],
            credentialRequirements: [],
            installedAt: manifest.installedAt,
            configured: false,
            available: false,
            restartRequired: true,
            diagnostic: error instanceof Error ? error.message : 'hook package validation failed',
          })
          continue
        }
        const references = configurations[manifest.id] ?? {}
        const slots = [...new Set(descriptor.hooks.flatMap(hook => Object.values(hook.credentialReferences)))].sort()
        const credentialRequirements = await Promise.all(slots.map(async (slot): Promise<HookMarketCredentialRequirement> => {
          const reference = references[slot]
          if (reference === undefined) return { slot, configured: false }
          const info = await this.options.credentialInfo(credentialRef(reference))
          return {
            slot,
            reference,
            configured: info.configured,
            ...info.source === undefined ? {} : { source: info.source },
          }
        }))
        const hooks = descriptor.hooks.map(hook => ({
          id: hook.id,
          event: hook.event,
          ...hook.matcher === undefined ? {} : { matcher: hook.matcher },
          invocable: hook.invocable === true,
          available: true,
        }))
        const configured = credentialRequirements.every(requirement => requirement.reference !== undefined)
        const diagnostic = this.diagnostics.get(manifest.id)
        entries.push({
          packageId: manifest.id as HookMarketPackageId,
          displayName: descriptor.display.name,
          description: descriptor.display.description,
          version: manifest.version,
          publisherId: manifest.publisherId,
          hooks,
          permissions: descriptor.permissions,
          credentialRequirements,
          installedAt: manifest.installedAt,
          configured,
          available: configured,
          restartRequired: true,
          ...(diagnostic === undefined ? {} : { diagnostic }),
        })
      }
      return { entries }
    })
  }

  /**
   * Install or explicitly upgrade one trusted hook package.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  async install(request: HookMarketInstallRequest): Promise<HookMarketInstallResult> {
    return await result(async () => {
      const archive = preparePackageArchive(
        await inspectZipArchive(decodeArchiveBase64(request.archiveBase64)),
        'hook-package.json',
      )
      const descriptorEntry = archive.entries.find(entry => entry.name === 'hook-package.json')
      if (descriptorEntry === undefined) throw new Error('archive must contain hook-package.json')
      const descriptor = parseDescriptor(descriptorEntry.bytes)
      verifyPackageFileHashes(archive, descriptor.files)
      if (!this.options.allowUnsignedPackages) verifyTrust(descriptor, this.options.trustedPublishers)
      this.assertInterpreterAllowlist(descriptor)
      if (request.confirmLocalExecution !== true) {
        throw new HookMarketDomainError({
          code: 'local-execution-confirmation-required',
          candidatePermissions: [...descriptor.permissions],
        })
      }
      return await this.mutations.runExclusive(descriptor.id, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, descriptor.id, 'hook')
        assertMutableOwnership(ownership.status, descriptor.id, descriptor.version, request.replaceExisting === true, ownership)
        const operation = await publishManagedPackage(
          this.options.installRoot,
          descriptor.id,
          archive,
          request.replaceExisting === true,
          {
            format: 1,
            kind: 'hook',
            id: descriptor.id,
            version: descriptor.version,
            publisherId: descriptor.publisher.id,
            installedAt: Date.now(),
          },
        )
        return {
          packageId: descriptor.id as HookMarketPackageId,
          operation,
          restartRequired: true as const,
        }
      })
    })
  }

  /**
   * Persist only validated credential references for one installed hook package.
   * @param request - Package identity and descriptor-slot reference mapping.
   * @returns Saved references and restart state, or a structured marketplace failure.
   */
  async configure(request: HookMarketConfigureRequest): Promise<HookMarketConfigureResult> {
    return await result(async () => {
      return await this.mutations.runExclusive(request.packageId, async () => {
        for (const [slot, value] of Object.entries(request.credentialReferences)) {
          try {
            credentialRef(value)
          } catch {
            throw new HookMarketDomainError({ code: 'invalid-credential-reference', slot })
          }
        }
        const ownership = await readManagedPackage(this.options.installRoot, request.packageId, 'hook')
        if (ownership.status !== 'managed') {
          throw new HookMarketDomainError({ code: 'not-found', packageId: request.packageId })
        }
        const descriptor = await this.descriptor(request.packageId)
        const required = new Set(descriptor.hooks.flatMap(hook => Object.values(hook.credentialReferences)))
        const normalized: Record<string, string> = {}
        for (const slot of required) {
          const value = request.credentialReferences[slot]
          if (value === undefined) throw new HookMarketDomainError({ code: 'missing-credential-reference', slot })
          normalized[slot] = credentialRef(value)
        }
        for (const slot of Object.keys(request.credentialReferences)) {
          if (!required.has(slot)) throw new HookMarketDomainError({ code: 'invalid-credential-reference', slot })
        }
        await this.mutateConfiguration(document => ({
          ...document,
          packages: { ...document.packages, [request.packageId]: normalized },
        }))
        return {
          packageId: request.packageId,
          credentialReferences: normalized,
          restartRequired: true as const,
        }
      })
    })
  }

  /**
   * Remove one managed hook package and its reference-only configuration.
   * @param packageId - Managed package identity to remove.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  async uninstall(packageId: HookMarketPackageId): Promise<HookMarketUninstallResult> {
    return await result(async () => {
      return await this.mutations.runExclusive(packageId, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, packageId, 'hook')
        if (ownership.status === 'missing') throw new HookMarketDomainError({ code: 'not-found', packageId })
        if (ownership.status === 'unmanaged') throw new HookMarketDomainError({ code: 'unmanaged-conflict', packageId })
        if (ownership.status === 'incompatible') throw new HookMarketDomainError({ code: 'manifest-incompatible', packageId })
        await uninstallManagedPackage(this.options.installRoot, packageId, 'hook')
        await this.mutateConfiguration((document) => {
          const packages = Object.fromEntries(
            Object.entries(document.packages).filter(([candidate]) => candidate !== packageId),
          )
          return { ...document, packages }
        })
        this.diagnostics.delete(packageId)
        return { packageId, restartRequired: true as const }
      })
    })
  }

  /**
   * Read detached configured references for one package's activation.
   * @param packageId - Managed package identity.
   * @returns Descriptor-slot credential references; empty when unconfigured.
   */
  async configuredReferences(packageId: string): Promise<Readonly<Record<string, string>>> {
    return (await this.readConfiguration()).packages[packageId] ?? {}
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

  /**
   * Reject hook commands naming interpreters outside the Host allowlist.
   * @param descriptor - Validated hook descriptor about to be trusted or published.
   */
  private assertInterpreterAllowlist(descriptor: HookPackageDescriptor): void {
    for (const hook of descriptor.hooks) {
      if (!this.options.stdioInterpreters.includes(hook.command)) {
        throw new HookMarketDomainError({
          code: 'invalid-package',
          reason: `hook command "${hook.command}" is not an allowed interpreter`,
        })
      }
    }
  }

  private async readConfiguration(): Promise<ConfigurationDocument> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.configFile, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null || (parsed as { format?: unknown }).format !== 1) {
        throw new Error('unsupported hook marketplace configuration')
      }
      const packages = (parsed as { packages?: unknown }).packages
      if (typeof packages !== 'object' || packages === null || Array.isArray(packages)) {
        throw new Error('invalid hook marketplace configuration')
      }
      return parsed as ConfigurationDocument
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { format: 1, packages: {} }
      throw error
    }
  }

  private async mutateConfiguration(
    mutate: (document: ConfigurationDocument) => ConfigurationDocument,
  ): Promise<void> {
    await mkdir(resolve(this.options.installRoot), { recursive: true, mode: 0o700 })
    await withFileLock(this.configFile, async () => {
      const next = mutate(await this.readConfiguration())
      await writeFileAtomic(this.configFile, `${JSON.stringify(next, null, 2)}\n`, {
        mode: 0o600,
        dirMode: 0o700,
      })
    })
  }
}

function parseDescriptor(bytes: Uint8Array): HookPackageDescriptor {
  try {
    return parseHookPackageDescriptor(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error: unknown) {
    throw new HookMarketDomainError({
      code: 'invalid-package',
      reason: error instanceof Error ? error.message : 'invalid hook descriptor',
    })
  }
}

function verifyTrust(descriptor: HookPackageDescriptor, publishers: readonly TrustedPublisher[]): void {
  const publicKey = resolveTrustedPublisher(publishers, descriptor.publisher.id)
  if (publicKey === undefined) {
    throw new HookMarketDomainError({ code: 'untrusted-publisher', publisherId: descriptor.publisher.id })
  }
  if (!verifyPublisherSignature(descriptorSignaturePayload(descriptor), descriptor.publisher.signature, publicKey)) {
    throw new HookMarketDomainError({ code: 'invalid-signature', publisherId: descriptor.publisher.id })
  }
}

function assertMutableOwnership(
  status: 'missing' | 'unmanaged' | 'incompatible' | 'managed',
  id: string,
  version: string,
  replaceExisting: boolean,
  ownership: Awaited<ReturnType<typeof readManagedPackage>>,
): void {
  const packageId = id as HookMarketPackageId
  if (status === 'managed' && !replaceExisting) {
    const installedVersion = ownership.status === 'managed' ? ownership.manifest.version : ''
    throw new HookMarketDomainError({
      code: 'managed-upgrade-required',
      packageId,
      installedVersion,
      candidateVersion: version,
    })
  }
  if (status === 'unmanaged') throw new HookMarketDomainError({ code: 'unmanaged-conflict', packageId })
  if (status === 'incompatible') throw new HookMarketDomainError({ code: 'manifest-incompatible', packageId })
}

async function result<Value>(
  operation: () => Promise<Value>,
): Promise<{ readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: HookMarketFailure }> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    if (error instanceof HookMarketDomainError) return { ok: false, error: error.failure }
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
