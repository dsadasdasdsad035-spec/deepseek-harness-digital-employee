/** Declarative MCP package validation, configuration, and managed lifecycle. */

import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef } from '@deepseek-ai/dsh-credentials'
import { MCP_SERVER_NAME_PATTERN } from '@deepseek-ai/dsh-mcp-client'
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
  McpDirectConfigDeclaration,
  McpDirectConfigDeleteRequest,
  McpDirectConfigSaveRequest,
  McpMarketConfigureRequest,
  McpMarketConfigureResult,
  McpMarketCredentialRequirement,
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

/** One persisted user-declared MCP server configuration, reference-only. */
export interface McpDirectConfigRecord {
  readonly entryId: string
  readonly serverName: string
  readonly declaration: McpDirectConfigDeclaration
  readonly createdAt: number
  readonly updatedAt: number
}

interface DirectConfigDocument {
  readonly format: 1
  readonly entries: Readonly<Record<string, McpDirectConfigRecord>>
}

/**
 * Direct declarations follow the packaged stdio command rule but may name
 * absolute paths in arguments: the user vouches for the entry directly, so
 * there is no signed file table to pin scripts to.
 */
const DirectDeclarationSchema = z.discriminatedUnion('transport', [
  z.object({
    transport: z.literal('stdio'),
    command: z.string().regex(/^[A-Za-z0-9._-]+$/),
    args: z.array(z.string().min(1).max(1024)).min(1).max(64),
    env: z.record(z.string(), z.string()),
    envCredentials: z.record(z.string(), z.string()),
    cwd: z.string().min(1).max(1024),
  }),
  z.object({
    transport: z.literal('streamable-http'),
    url: z.url(),
    headers: z.record(z.string(), z.string()),
    headerCredentials: z.record(z.string(), z.string()),
  }),
])

/** Error type the gateway maps to its structured marketplace failure. */
class McpMarketDomainError extends Error {
  constructor(readonly failure: McpMarketFailure) {
    super('reason' in failure ? `${failure.code}: ${failure.reason}` : failure.code)
  }
}

export { McpMarketDomainError }

/**
 * Map a marketplace domain error to its structured failure result.
 * @param error - Error caught by a Remote gateway method.
 * @returns The failure result; anything that is not a domain error rethrows.
 */
export function asMarketResult(error: unknown): { readonly ok: false; readonly error: McpMarketFailure } {
  if (error instanceof McpMarketDomainError) return { ok: false, error: error.failure }
  throw error
}

/** Runtime dependencies for managed MCP packages. */
export interface McpMarketServiceOptions {
  readonly installRoot: string
  readonly trustedPublishers: readonly TrustedPublisher[]
  /** Bare interpreter command names stdio servers may name. */
  readonly stdioInterpreters: readonly string[]
  /** Explicit local override: skip publisher-trust verification. */
  readonly allowUnsignedPackages: boolean
  readonly activeServerNames: () => readonly string[]
  readonly credentialInfo: (ref: CredentialRef) => Promise<CredentialInfo>
}

/** Owns declarative MCP package files and credential-reference configuration. */
export class McpMarketService {
  private readonly mutations = new KeyedMutex<string>()
  private readonly configFile: string
  private readonly directFile: string
  private readonly diagnostics = new Map<string, string>()
  private readonly directDiagnostics = new Map<string, string>()

  constructor(private readonly options: McpMarketServiceOptions) {
    this.configFile = join(resolve(options.installRoot), '.mcp-configurations.json')
    this.directFile = join(resolve(options.installRoot), '.mcp-direct-configs.json')
  }

  /**
   * Absolute managed directory of one installed package; the stdio working directory.
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
      if (!this.options.allowUnsignedPackages) verifyTrust(descriptor, this.options.trustedPublishers)
      this.assertStdioInterpreters(descriptor)
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
            source: 'package',
            displayName: manifest.id,
            description: 'Installed MCP package failed trust validation.',
            version: manifest.version,
            publisherId: manifest.publisherId,
            servers: [],
            permissions: [],
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
        const available = configured && servers.every(server => server.available)
        const diagnostic = this.diagnostics.get(manifest.id)
        entries.push({
          packageId: manifest.id as McpMarketPackageId,
          source: 'package',
          displayName: descriptor.display.name,
          description: descriptor.display.description,
          version: manifest.version,
          publisherId: manifest.publisherId,
          servers,
          permissions: descriptor.permissions,
          credentialRequirements,
          installedAt: manifest.installedAt,
          configured,
          available,
          restartRequired: !available,
          ...(diagnostic === undefined ? {} : { diagnostic }),
        })
      }
      return { entries: [...entries, ...(await this.directEntriesProjected(active))] }
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
      if (!this.options.allowUnsignedPackages) verifyTrust(descriptor, this.options.trustedPublishers)
      this.assertStdioInterpreters(descriptor)
      await this.assertNoPackageDirectNameConflict(descriptor.servers.map(server => server.id))
      this.assertLocalExecutionConfirmed(descriptor, request.confirmLocalExecution === true)
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

  /**
   * Validate one user-declared server configuration without persisting it.
   * Every save path runs this before mounting; the returned record is the
   * credential-free form `persistDirectConfig` accepts.
   * @param request - Server name, declaration, and local-execution confirmation.
   * @param ownMountedName - Live name currently mounted for the edited entry,
   * excluded from the live-name conflict check.
   * @returns Normalized record ready to persist, with a fresh or existing entry id.
   */
  async validateDirectConfig(
    request: McpDirectConfigSaveRequest,
    ownMountedName?: string,
  ): Promise<McpDirectConfigRecord> {
    if (!MCP_SERVER_NAME_PATTERN.test(request.serverName)) {
      throw new McpMarketDomainError({
        code: 'invalid-direct-config',
        reason: `server name "${request.serverName}" must match ${MCP_SERVER_NAME_PATTERN.source}`,
      })
    }
    const parsed = DirectDeclarationSchema.safeParse(request.declaration)
    if (!parsed.success) {
      throw new McpMarketDomainError({
        code: 'invalid-direct-config',
        reason: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '),
      })
    }
    const declaration = parsed.data as McpDirectConfigDeclaration
    this.assertDirectSlotReferences(declaration)
    if (declaration.transport === 'stdio') {
      if (!this.options.stdioInterpreters.includes(declaration.command)) {
        throw new McpMarketDomainError({
          code: 'invalid-direct-config',
          reason: `stdio command "${declaration.command}" is not an allowed interpreter`,
        })
      }
      if (request.confirmLocalExecution !== true) {
        throw new McpMarketDomainError({
          code: 'local-execution-confirmation-required',
          candidatePermissions: ['subprocess'],
        })
      }
      const cwd = await stat(declaration.cwd).catch(() => undefined)
      if (cwd?.isDirectory() !== true) {
        throw new McpMarketDomainError({
          code: 'invalid-direct-config',
          reason: `stdio working directory "${declaration.cwd}" does not exist`,
        })
      }
    }
    const entries = await this.readDirectConfigurations()
    const existing = request.entryId === undefined
      ? undefined
      : entries[request.entryId]
    if (request.entryId !== undefined && existing === undefined) {
      throw new McpMarketDomainError({
        code: 'invalid-direct-config',
        reason: 'direct configuration entry not found',
      })
    }
    await this.assertDirectServerNameFree(request.serverName, existing?.entryId, ownMountedName)
    const now = Date.now()
    return {
      entryId: existing?.entryId ?? randomUUID(),
      serverName: request.serverName,
      declaration,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  }

  /**
   * Persist one validated direct configuration record.
   * @param record - Record returned by `validateDirectConfig`.
   */
  async persistDirectConfig(record: McpDirectConfigRecord): Promise<void> {
    await this.mutations.runExclusive(`direct:${record.entryId}`, async () => {
      await this.mutateDirectConfigurations((document) => {
        return { ...document, entries: { ...document.entries, [record.entryId]: record } }
      })
    })
    this.directDiagnostics.delete(record.entryId)
  }

  /**
   * Remove one direct configuration record and its diagnostic.
   * @param request - Entry identity to remove.
   */
  async deleteDirectConfig(request: McpDirectConfigDeleteRequest): Promise<void> {
    await this.mutations.runExclusive(`direct:${request.entryId}`, async () => {
      const entries = await this.readDirectConfigurations()
      if (entries[request.entryId] === undefined) {
        throw new McpMarketDomainError({
          code: 'invalid-direct-config',
          reason: 'direct configuration entry not found',
        })
      }
      await this.mutateDirectConfigurations((document) => {
        const next = Object.fromEntries(
          Object.entries(document.entries).filter(([candidate]) => candidate !== request.entryId),
        )
        return { ...document, entries: next }
      })
    })
    this.directDiagnostics.delete(request.entryId)
  }

  /**
   * Read all persisted direct configuration records.
   * @returns Records in insertion order; resolved values are never present.
   */
  async directEntries(): Promise<readonly McpDirectConfigRecord[]> {
    return Object.values(await this.readDirectConfigurations())
  }

  /**
   * Record a direct-entry activation diagnostic without credential values.
   * @param entryId - Direct configuration entry identity.
   * @param diagnostic - Public diagnostic, or undefined to clear it.
   */
  setDirectDiagnostic(entryId: string, diagnostic?: string): void {
    if (diagnostic === undefined) this.directDiagnostics.delete(entryId)
    else this.directDiagnostics.set(entryId, diagnostic)
  }

  /**
   * Project direct entries into credential-free inventory rows.
   * @param active - Live server names from the running Host.
   * @returns Direct inventory entries appended after package entries.
   */
  private async directEntriesProjected(active: ReadonlySet<string>): Promise<readonly McpMarketEntry[]> {
    const records = await this.directEntries()
    return Promise.all(records.map(async (record): Promise<McpMarketEntry> => {
      const slotPairs = record.declaration.transport === 'stdio'
        ? Object.entries(record.declaration.envCredentials)
        : Object.entries(record.declaration.headerCredentials)
      const credentialRequirements = await Promise.all(
        [...slotPairs].sort(([left], [right]) => left.localeCompare(right))
          .map(async ([slot, reference]): Promise<McpMarketCredentialRequirement> => {
            const info = await this.options.credentialInfo(credentialRef(reference))
            return {
              slot,
              reference,
              configured: info.configured,
              ...info.source === undefined ? {} : { source: info.source },
            }
          }),
      )
      const available = active.has(record.serverName) && !this.directDiagnostics.has(record.entryId)
      return {
        packageId: record.entryId as McpMarketPackageId,
        source: 'direct',
        displayName: record.serverName,
        description: 'User-declared MCP server configuration.',
        version: '1.0.0',
        publisherId: 'direct',
        servers: [{ serverName: record.serverName, transport: record.declaration.transport, available }],
        permissions: record.declaration.transport === 'stdio' ? ['subprocess'] : [],
        credentialRequirements,
        installedAt: record.createdAt,
        configured: credentialRequirements.every(requirement => requirement.configured),
        available,
        restartRequired: false,
        declaration: record.declaration,
        ...this.directDiagnostics.has(record.entryId) ? { diagnostic: this.directDiagnostics.get(record.entryId) } : {},
      }
    }))
  }

  /**
   * Reject credential slots whose fixed value is non-empty: a slot bound to a
   * reference must stay empty, and a non-empty value there is a suspected key.
   * @param declaration - Parsed direct declaration.
   */
  private assertDirectSlotReferences(declaration: McpDirectConfigDeclaration): void {
    const fixed = declaration.transport === 'stdio' ? declaration.env : declaration.headers
    const references = declaration.transport === 'stdio' ? declaration.envCredentials : declaration.headerCredentials
    for (const [slot, reference] of Object.entries(references)) {
      try {
        credentialRef(reference)
      } catch {
        throw new McpMarketDomainError({ code: 'invalid-credential-reference', slot })
      }
      if ((fixed[slot] ?? '') !== '') {
        throw new McpMarketDomainError({
          code: 'invalid-direct-config',
          reason: `"${slot}" must not contain a credential value`,
        })
      }
    }
  }

  /**
   * Reject a server name held by another direct entry, a live server, or any
   * installed package's declared servers.
   * @param serverName - Candidate server name.
   * @param ownEntryId - Entry identity excluded from the direct-entry check.
   * @param ownMountedName - Live name mounted for the edited entry, excluded
   * from the live and declared-package checks so a same-name edit passes.
   */
  private async assertDirectServerNameFree(
    serverName: string,
    ownEntryId: string | undefined,
    ownMountedName?: string,
  ): Promise<void> {
    const entries = await this.readDirectConfigurations()
    const direct = Object.values(entries).find(entry => entry.serverName === serverName && entry.entryId !== ownEntryId)
    if (direct !== undefined) {
      throw new McpMarketDomainError({
        code: 'direct-config-conflict', serverName, heldBy: 'direct', holderId: direct.entryId,
      })
    }
    const conflicts = serverName !== ownMountedName
    const live = conflicts && this.options.activeServerNames().includes(serverName)
    if (live) {
      throw new McpMarketDomainError({
        code: 'direct-config-conflict', serverName, heldBy: 'package', holderId: serverName,
      })
    }
    const declared = conflicts ? await this.declaredPackageServerNames() : new Set<string>()
    if (declared.has(serverName)) {
      throw new McpMarketDomainError({
        code: 'direct-config-conflict', serverName, heldBy: 'package', holderId: serverName,
      })
    }
  }

  /**
   * Reject package-declared server names colliding with direct entries.
   * @param serverNames - Server names a package is about to be published under.
   */
  private async assertNoPackageDirectNameConflict(serverNames: readonly string[]): Promise<void> {
    const entries = await this.readDirectConfigurations()
    const held = new Map(Object.values(entries).map(entry => [entry.serverName, entry.entryId]))
    for (const name of serverNames) {
      const holderId = held.get(name)
      if (holderId !== undefined) {
        throw new McpMarketDomainError({
          code: 'direct-config-conflict', serverName: name, heldBy: 'direct', holderId,
        })
      }
    }
  }

  /**
   * Collect the server names every installed valid package declares.
   * @returns Declared names; packages failing validation are skipped because
   * their servers can never mount.
   */
  private async declaredPackageServerNames(): Promise<ReadonlySet<string>> {
    const names = new Set<string>()
    const manifests = await listManagedPackages(this.options.installRoot, 'mcp')
    for (const manifest of manifests) {
      try {
        const descriptor = await this.descriptor(manifest.id)
        for (const server of descriptor.servers) names.add(server.id)
      } catch {
        // An invalid package declares nothing mountable, so its names stay free.
      }
    }
    return names
  }

  /**
   * Read the persisted direct configuration document.
   * @returns Parsed document; empty when the file does not exist yet.
   */
  private async readDirectConfigurations(): Promise<DirectConfigDocument['entries']> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.directFile, 'utf8'))
      if (typeof parsed !== 'object' || parsed === null || (parsed as { format?: unknown }).format !== 1) {
        throw new Error('unsupported MCP direct configuration store')
      }
      const entries = (parsed as { entries?: unknown }).entries
      if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
        throw new Error('invalid MCP direct configuration store')
      }
      return entries as DirectConfigDocument['entries']
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }

  /**
   * Atomically mutate the persisted direct configuration document.
   * @param mutate - Pure document transformation.
   */
  private async mutateDirectConfigurations(
    mutate: (document: DirectConfigDocument) => DirectConfigDocument,
  ): Promise<void> {
    await mkdir(resolve(this.options.installRoot), { recursive: true, mode: 0o700 })
    await withFileLock(this.directFile, async () => {
      const current = await this.readDirectConfigurations()
      const next = mutate({ format: 1, entries: current })
      await writeFileAtomic(this.directFile, `${JSON.stringify(next, null, 2)}\n`, {
        mode: 0o600,
        dirMode: 0o700,
      })
    })
  }

  /**
   * Reject stdio servers naming interpreters outside the Host allowlist.
   * @param descriptor - Validated MCP descriptor about to be trusted or published.
   */
  private assertStdioInterpreters(descriptor: McpPackageDescriptor): void {
    for (const server of descriptor.servers) {
      if (server.transport !== 'stdio') continue
      if (!this.options.stdioInterpreters.includes(server.command)) {
        throw new McpMarketDomainError({
          code: 'invalid-package',
          reason: `stdio command "${server.command}" is not an allowed interpreter`,
        })
      }
    }
  }

  /**
   * Require one explicit confirmation before any stdio package is installed or upgraded.
   * @param descriptor - Validated MCP descriptor about to be published.
   * @param confirmed - Whether the request already carried the user's confirmation.
   */
  private assertLocalExecutionConfirmed(descriptor: McpPackageDescriptor, confirmed: boolean): void {
    if (confirmed || !descriptor.permissions.includes('subprocess')) return
    throw new McpMarketDomainError({
      code: 'local-execution-confirmation-required',
      candidatePermissions: [...descriptor.permissions],
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
