/** Declarative MCP package validation, configuration, and managed lifecycle. */

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
  parseMcpPackageDescriptor,
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
  McpPackageDescriptor,
  TrustedPublisher,
} from '@deepseek-ai/dsh-marketplace-core'
import type {
  McpMarketConfigureRequest,
  McpMarketConfigureResult,
  McpMarketCredentialRequirement,
  McpMarketEndpointRequirement,
  McpMarketEntry,
  McpMarketFailure,
  McpMarketInstallRequest,
  McpMarketInstallResult,
  McpMarketListResult,
  McpMarketPackageId,
  McpMarketUninstallResult,
} from './types.ts'

interface ConfigurationDocument {
  readonly format: 1
  readonly packages: Readonly<Record<string, Readonly<Record<string, string>>>>
}

class McpMarketDomainError extends Error {
  constructor(readonly failure: McpMarketFailure) {
    super(failure.code)
  }
}

/** Runtime dependencies for managed MCP packages. */
export interface McpMarketServiceOptions {
  readonly installRoot: string
  readonly trustedPublishers: readonly TrustedPublisher[]
  readonly activeServerNames: () => readonly string[]
  readonly credentialInfo: (ref: CredentialRef) => Promise<CredentialInfo>
  readonly endpointReferences: Readonly<Record<string, string>>
}

/** Owns declarative MCP package files and credential-reference configuration. */
export class McpMarketService {
  private readonly mutations = new KeyedMutex<string>()
  private readonly configFile: string
  private readonly diagnostics = new Map<string, string>()

  constructor(private readonly options: McpMarketServiceOptions) {
    this.configFile = join(resolve(options.installRoot), '.mcp-configurations.json')
  }

  /**
   * Read one installed package descriptor.
   * @param packageId - Managed package identity.
   * @returns Parsed descriptor from the installed package.
   */
  async descriptor(packageId: string): Promise<McpPackageDescriptor> {
    try {
      const ownership = await readManagedPackage(this.options.installRoot, packageId, 'mcp')
      if (ownership.status !== 'managed') throw new Error('MCP package is not marketplace-managed')
      const descriptorFile = join(this.options.installRoot, packageId, 'mcp-package.json')
      const descriptorInfo = await lstat(descriptorFile)
      if (!descriptorInfo.isFile() || descriptorInfo.isSymbolicLink()) {
        throw new Error('MCP descriptor is not a regular file')
      }
      const descriptor = parseMcpPackageDescriptor(JSON.parse(await readFile(descriptorFile, 'utf8')))
      if (
        descriptor.id !== ownership.manifest.id
        || descriptor.version !== ownership.manifest.version
        || descriptor.publisher.id !== ownership.manifest.publisherId
      ) {
        throw new Error('MCP descriptor does not match its managed manifest')
      }
      const entries = await Promise.all(Object.keys(descriptor.files).map(async (name) => {
        const filename = join(this.options.installRoot, packageId, name)
        const info = await lstat(filename)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error(`MCP package file "${name}" is not regular`)
        return { name, bytes: new Uint8Array(await readFile(filename)), kind: 'regular' as const }
      }))
      verifyPackageFileHashes({
        entries,
        totalBytes: entries.reduce((total, entry) => total + entry.bytes.byteLength, 0),
      }, descriptor.files)
      verifyTrust(descriptor, this.options.trustedPublishers)
      return descriptor
    } catch (error: unknown) {
      throw new McpMarketDomainError({
        code: 'invalid-package',
        reason: error instanceof Error ? error.message : 'invalid MCP descriptor',
      })
    }
  }

  /**
   * Read detached configured references for activation.
   * @returns Package identities mapped to descriptor-slot credential references.
   */
  async configurations(): Promise<ConfigurationDocument['packages']> {
    return (await this.readConfiguration()).packages
  }

  /**
   * Resolve a server's fixed URL or Host-owned endpoint reference.
   * @param server - Parsed server declaration.
   * @returns Validated Streamable HTTP endpoint.
   */
  endpointUrl(server: McpPackageDescriptor['servers'][number]): string {
    const value = server.url ?? (
      server.endpointReference === undefined
        ? undefined
        : this.options.endpointReferences[server.endpointReference]
    )
    if (value === undefined) {
      throw new Error(`endpoint reference "${server.endpointReference}" is unavailable`)
    }
    const endpoint = new URL(value)
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      throw new Error(`endpoint "${value}" must use HTTP or HTTPS`)
    }
    return endpoint.href
  }

  /**
   * Record an activation diagnostic without credential values.
   * @param packageId - Managed package identity.
   * @param diagnostic - Public diagnostic, or undefined to clear it.
   */
  setDiagnostic(packageId: string, diagnostic?: string): void {
    if (diagnostic === undefined) this.diagnostics.delete(packageId)
    else this.diagnostics.set(packageId, diagnostic)
  }

  /**
   * List managed packages and credential-reference presence.
   * @returns Declared inventory result or a structured marketplace failure.
   */
  async list(): Promise<McpMarketListResult> {
    return await result(async () => {
      const active = new Set(this.options.activeServerNames())
      const configurations = await this.configurations()
      const manifests = await listManagedPackages(this.options.installRoot, 'mcp')
      const entries: McpMarketEntry[] = []
      for (const manifest of manifests) {
        let descriptor: McpPackageDescriptor
        try {
          descriptor = await this.descriptor(manifest.id)
        } catch (error: unknown) {
          entries.push({
            packageId: manifest.id as McpMarketPackageId,
            displayName: manifest.id,
            description: 'Installed MCP package failed trust validation.',
            version: manifest.version,
            publisherId: manifest.publisherId,
            servers: [],
            endpointRequirements: [],
            credentialRequirements: [],
            installedAt: manifest.installedAt,
            configured: false,
            available: false,
            restartRequired: true,
            diagnostic: error instanceof Error ? error.message : 'MCP package validation failed',
          })
          continue
        }
        const references = configurations[manifest.id] ?? {}
        const endpointSlots = [...new Set(descriptor.servers.flatMap(server =>
          server.endpointReference === undefined ? [] : [server.endpointReference]))].sort()
        const endpointRequirements: McpMarketEndpointRequirement[] = endpointSlots.map((slot) => {
          const url = this.options.endpointReferences[slot]
          return { slot, ...(url === undefined ? {} : { url }), configured: url !== undefined }
        })
        const slots = [...new Set(descriptor.servers.flatMap(server => Object.values(server.credentialReferences)))].sort()
        const credentialRequirements = await Promise.all(slots.map(async (slot): Promise<McpMarketCredentialRequirement> => {
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
        const servers = descriptor.servers.map(server => ({
          serverName: server.id,
          transport: server.transport,
          available: active.has(server.id),
        }))
        const configured = credentialRequirements.every(requirement => requirement.reference !== undefined)
          && endpointRequirements.every(requirement => requirement.configured)
        const available = configured && servers.every(server => server.available)
        const diagnostic = this.diagnostics.get(manifest.id)
        entries.push({
          packageId: manifest.id as McpMarketPackageId,
          displayName: descriptor.display.name,
          description: descriptor.display.description,
          version: manifest.version,
          publisherId: manifest.publisherId,
          servers,
          endpointRequirements,
          credentialRequirements,
          installedAt: manifest.installedAt,
          configured,
          available,
          restartRequired: !available,
          ...(diagnostic === undefined ? {} : { diagnostic }),
        })
      }
      return { entries }
    })
  }

  /**
   * Install or explicitly upgrade one trusted declarative package.
   * @param request - Uploaded archive and explicit replacement intent.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  async install(request: McpMarketInstallRequest): Promise<McpMarketInstallResult> {
    return await result(async () => {
      const archive = preparePackageArchive(
        await inspectZipArchive(decodeArchiveBase64(request.archiveBase64)),
        'mcp-package.json',
      )
      const descriptorEntry = archive.entries.find(entry => entry.name === 'mcp-package.json')
      if (descriptorEntry === undefined) throw new Error('archive must contain mcp-package.json')
      const descriptor = parseDescriptor(descriptorEntry.bytes)
      verifyPackageFileHashes(archive, descriptor.files)
      verifyTrust(descriptor, this.options.trustedPublishers)
      return await this.mutations.runExclusive(descriptor.id, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, descriptor.id, 'mcp')
        assertMutableOwnership(ownership.status, descriptor.id, descriptor.version, request.replaceExisting === true, ownership)
        const operation = await publishManagedPackage(
          this.options.installRoot,
          descriptor.id,
          archive,
          request.replaceExisting === true,
          {
            format: 1,
            kind: 'mcp',
            id: descriptor.id,
            version: descriptor.version,
            publisherId: descriptor.publisher.id,
            installedAt: Date.now(),
          },
        )
        return {
          packageId: descriptor.id as McpMarketPackageId,
          operation,
          restartRequired: true as const,
        }
      })
    })
  }

  /**
   * Persist only validated credential references for one installed package.
   * @param request - Package identity and descriptor-slot reference mapping.
   * @returns Saved references and restart state, or a structured marketplace failure.
   */
  async configure(request: McpMarketConfigureRequest): Promise<McpMarketConfigureResult> {
    return await result(async () => {
      return await this.mutations.runExclusive(request.packageId, async () => {
        for (const [slot, value] of Object.entries(request.credentialReferences)) {
          try {
            credentialRef(value)
          } catch {
            throw new McpMarketDomainError({ code: 'invalid-credential-reference', slot })
          }
        }
        const ownership = await readManagedPackage(this.options.installRoot, request.packageId, 'mcp')
        if (ownership.status !== 'managed') {
          throw new McpMarketDomainError({ code: 'not-found', packageId: request.packageId })
        }
        const descriptor = await this.descriptor(request.packageId)
        const required = new Set(descriptor.servers.flatMap(server => Object.values(server.credentialReferences)))
        const normalized: Record<string, string> = {}
        for (const slot of required) {
          const value = request.credentialReferences[slot]
          if (value === undefined) throw new McpMarketDomainError({ code: 'missing-credential-reference', slot })
          normalized[slot] = credentialRef(value)
        }
        for (const slot of Object.keys(request.credentialReferences)) {
          if (!required.has(slot)) throw new McpMarketDomainError({ code: 'invalid-credential-reference', slot })
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
   * Remove one managed MCP package and its reference-only configuration.
   * @param packageId - Managed package identity.
   * @returns Declared mutation result or a structured marketplace failure.
   */
  async uninstall(packageId: McpMarketPackageId): Promise<McpMarketUninstallResult> {
    return await result(async () => {
      return await this.mutations.runExclusive(packageId, async () => {
        const ownership = await readManagedPackage(this.options.installRoot, packageId, 'mcp')
        if (ownership.status === 'missing') throw new McpMarketDomainError({ code: 'not-found', packageId })
        if (ownership.status === 'unmanaged') throw new McpMarketDomainError({ code: 'unmanaged-conflict', packageId })
        if (ownership.status === 'incompatible') throw new McpMarketDomainError({ code: 'manifest-incompatible', packageId })
        await uninstallManagedPackage(this.options.installRoot, packageId, 'mcp')
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

  private async readConfiguration(): Promise<ConfigurationDocument> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.configFile, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null || (parsed as { format?: unknown }).format !== 1) {
        throw new Error('unsupported MCP marketplace configuration')
      }
      const packages = (parsed as { packages?: unknown }).packages
      if (typeof packages !== 'object' || packages === null || Array.isArray(packages)) {
        throw new Error('invalid MCP marketplace configuration')
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

function parseDescriptor(bytes: Uint8Array): McpPackageDescriptor {
  try {
    return parseMcpPackageDescriptor(JSON.parse(new TextDecoder().decode(bytes)))
  } catch (error: unknown) {
    throw new McpMarketDomainError({
      code: 'invalid-package',
      reason: error instanceof Error ? error.message : 'invalid MCP descriptor',
    })
  }
}

function verifyTrust(descriptor: McpPackageDescriptor, publishers: readonly TrustedPublisher[]): void {
  const publicKey = resolveTrustedPublisher(publishers, descriptor.publisher.id)
  if (publicKey === undefined) {
    throw new McpMarketDomainError({ code: 'untrusted-publisher', publisherId: descriptor.publisher.id })
  }
  if (!verifyPublisherSignature(descriptorSignaturePayload(descriptor), descriptor.publisher.signature, publicKey)) {
    throw new McpMarketDomainError({ code: 'invalid-signature', publisherId: descriptor.publisher.id })
  }
}

function assertMutableOwnership(
  status: 'missing' | 'unmanaged' | 'incompatible' | 'managed',
  id: string,
  version: string,
  replaceExisting: boolean,
  ownership: Awaited<ReturnType<typeof readManagedPackage>>,
): void {
  const packageId = id as McpMarketPackageId
  if (status === 'managed' && !replaceExisting) {
    const installedVersion = ownership.status === 'managed' ? ownership.manifest.version : ''
    throw new McpMarketDomainError({
      code: 'managed-upgrade-required',
      packageId,
      installedVersion,
      candidateVersion: version,
    })
  }
  if (status === 'unmanaged') throw new McpMarketDomainError({ code: 'unmanaged-conflict', packageId })
  if (status === 'incompatible') throw new McpMarketDomainError({ code: 'manifest-incompatible', packageId })
}

async function result<Value>(
  operation: () => Promise<Value>,
): Promise<{ readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: McpMarketFailure }> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    if (error instanceof McpMarketDomainError) return { ok: false, error: error.failure }
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

function archiveFailure(failure: ArchiveFailure): McpMarketFailure {
  return failure
}
