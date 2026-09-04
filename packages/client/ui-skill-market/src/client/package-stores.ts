/** Browser state for Tool and MCP package marketplace tabs. */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ClientRemote,
  McpDirectConfigSaveRequest,
  McpMarketEntry,
  McpMarketPackageId,
  ToolMarketEntry,
  ToolMarketPackageId,
} from '@deepseek-ai/dsh-api-remotes/client'
import { arrayBufferToBase64, validateUploadFile } from './store.ts'

type Status = 'idle' | 'loading' | 'ready' | 'error'

/** Typed marketplace business failure retained for publisher diagnostics. */
export interface MarketPackageFailure {
  readonly code: string
  readonly publisherId?: string | undefined
}

interface PendingUpgrade<Id> {
  readonly filename: string
  readonly archiveBase64: string
  readonly packageId: Id
}

/** A stdio package awaiting explicit local-execution confirmation. */
export interface PendingLocalExecution {
  readonly filename: string
  readonly archiveBase64: string
  readonly candidatePermissions: readonly string[]
}

interface PackageInstallTransport<Id> {
  readonly ok: boolean
  readonly value?: {
    readonly ok: boolean
    readonly error?: {
      readonly code: string
      readonly packageId?: Id
      readonly publisherId?: string
      readonly candidatePermissions?: readonly string[]
    }
    readonly value?: { readonly packageId: Id }
  }
}

/**
 * Filter Tool packages by user-visible metadata.
 * @param entries - Marketplace entries to search.
 * @param query - Case-insensitive search text.
 * @returns Entries whose identifiers or display metadata match the query.
 */
export function filterToolPackages(
  entries: readonly ToolMarketEntry[],
  query: string,
): readonly ToolMarketEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return entries
  return entries.filter(entry => [
    entry.packageId,
    entry.displayName,
    entry.description,
    entry.publisherId,
    ...entry.permissions,
    ...entry.tools.flatMap(tool => [tool.name, tool.description, tool.inputDescription]),
  ].some(value => value.toLocaleLowerCase().includes(needle)))
}

/**
 * Filter MCP packages by user-visible metadata.
 * @param entries - Marketplace entries to search.
 * @param query - Case-insensitive search text.
 * @returns Entries whose identifiers or display metadata match the query.
 */
export function filterMcpPackages(
  entries: readonly McpMarketEntry[],
  query: string,
): readonly McpMarketEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return entries
  return entries.filter(entry => [
    entry.packageId,
    entry.displayName,
    entry.description,
    entry.publisherId,
    ...entry.servers.map(server => server.serverName),
  ].some(value => value.toLocaleLowerCase().includes(needle)))
}

/** Tool marketplace browser snapshot. */
export interface ToolMarketState {
  status: Status
  entries: readonly ToolMarketEntry[]
  query: string
  busy: boolean
  error: MarketPackageFailure | null
  restartNotice: ToolMarketPackageId | null
  pendingUpgrade: PendingUpgrade<ToolMarketPackageId> | null
  pendingUninstall: ToolMarketPackageId | null
}

/** MCP marketplace browser snapshot. */
export interface McpMarketState {
  status: Status
  entries: readonly McpMarketEntry[]
  query: string
  busy: boolean
  error: MarketPackageFailure | null
  restartNotice: McpMarketPackageId | null
  pendingUpgrade: PendingUpgrade<McpMarketPackageId> | null
  pendingLocalExecution: PendingLocalExecution | null
  /** Set once the user confirmed the pending package's local-execution disclosure. */
  localExecutionConfirmed: boolean
  pendingUninstall: McpMarketPackageId | null
  credentialReferences: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** A stdio direct-config save awaiting its local-execution disclosure confirmation. */
  pendingDirectLocalExecution: McpDirectConfigSaveRequest | null
}

const TOOL_INITIAL: ToolMarketState = {
  status: 'idle',
  entries: [],
  query: '',
  busy: false,
  error: null,
  restartNotice: null,
  pendingUpgrade: null,
  pendingUninstall: null,
}

const MCP_INITIAL: McpMarketState = {
  status: 'idle',
  entries: [],
  query: '',
  busy: false,
  error: null,
  restartNotice: null,
  pendingUpgrade: null,
  pendingLocalExecution: null,
  localExecutionConfirmed: false,
  pendingUninstall: null,
  credentialReferences: {},
  pendingDirectLocalExecution: null,
}

/** Tool package lifecycle controller. */
export class ToolMarketStore {
  /** Observable Tool marketplace state. */
  readonly store: SnapshotStore<ToolMarketState> = createSnapshotStore(TOOL_INITIAL)

  constructor(private readonly remote: ClientRemote['toolMarket']) {}

  /** Refresh the managed Tool inventory. */
  async load(): Promise<void> {
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    try {
      const transport = await this.remote.list()
      if (!transport.ok || !transport.value.ok) return this.fail(failureCode(transport))
      const entries = transport.value.value.entries
      this.store.update((state) => {
        state.status = 'ready'
        state.entries = entries
      })
    } catch {
      this.fail('operation-failed')
    }
  }

  /**
   * Change the local Tool search query.
   * @param query - Search text to retain in browser state.
   */
  setQuery(query: string): void {
    this.store.update((state) => { state.query = query })
  }

  /**
   * Validate and submit one Tool ZIP for installation.
   * @param file - Browser-selected ZIP archive.
   */
  async upload(file: File): Promise<void> {
    await uploadPackage(file, error => this.fail(error), (...args) => this.install(...args))
  }

  /** Confirm the pending managed Tool replacement, if any. */
  async confirmUpgrade(): Promise<void> {
    await confirmPackageUpgrade(
      this.store.getSnapshot().pendingUpgrade,
      (...args) => this.install(...args),
    )
  }

  /**
   * Open uninstall confirmation for one Tool package.
   * @param packageId - Managed package to remove.
   */
  requestUninstall(packageId: ToolMarketPackageId): void {
    this.store.update((state) => { state.pendingUninstall = packageId })
  }

  /** Clear pending upgrade and uninstall confirmations. */
  cancelConfirmation(): void {
    cancelPackageConfirmation((mutate) => {
      this.store.update((state) => {
        mutate(state)
      })
    })
  }

  /** Remove the Tool package awaiting uninstall confirmation. */
  async confirmUninstall(): Promise<void> {
    const packageId = this.store.getSnapshot().pendingUninstall
    if (packageId === null) return
    this.store.update((state) => { state.busy = true; state.error = null })
    const transport = await this.remote.uninstall({ packageId })
    if (!transport.ok || !transport.value.ok) return this.fail(failureCode(transport))
    this.store.update((state) => {
      state.busy = false
      state.pendingUpgrade = null
      state.pendingUninstall = null
      state.restartNotice = packageId
    })
    await this.load()
  }

  private async install(filename: string, archiveBase64: string, replaceExisting: boolean): Promise<void> {
    await installPackage({
      filename,
      archiveBase64,
      replaceExisting,
      start: () => {
        this.store.update((state) => { state.busy = true; state.error = null })
      },
      remote: () => this.remote.install({ filename, archiveBase64, replaceExisting }),
      pending: (packageId) => {
        this.store.update((state) => {
          state.busy = false
          state.pendingUpgrade = { filename, archiveBase64, packageId }
        })
      },
      installed: (packageId) => {
        this.store.update((state) => {
          state.busy = false
          state.pendingUpgrade = null
          state.restartNotice = packageId
        })
      },
      fail: error => this.fail(error),
      load: () => this.load(),
    })
  }

  private fail(error: MarketPackageFailure | string): void {
    failPackageStore(typeof error === 'string' ? { code: error } : error, mutate => this.store.update(mutate))
  }
}

/** MCP package lifecycle and credential-reference controller. */
export class McpMarketStore {
  /** Observable MCP marketplace state. */
  readonly store: SnapshotStore<McpMarketState> = createSnapshotStore(MCP_INITIAL)

  constructor(private readonly remote: ClientRemote['mcpMarket']) {}

  /** Refresh managed MCP packages and their credential-reference state. */
  async load(): Promise<void> {
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    try {
      const transport = await this.remote.list()
      if (!transport.ok || !transport.value.ok) return this.fail(failureCode(transport))
      const entries = transport.value.value.entries
      this.store.update((state) => {
        state.status = 'ready'
        state.entries = entries
        state.credentialReferences = Object.fromEntries(entries.map(entry => [
          entry.packageId,
          Object.fromEntries(entry.credentialRequirements.flatMap(requirement =>
            requirement.reference === undefined ? [] : [[requirement.slot, requirement.reference]])),
        ]))
      })
    } catch {
      this.fail('operation-failed')
    }
  }

  /**
   * Change the local MCP search query.
   * @param query - Search text to retain in browser state.
   */
  setQuery(query: string): void {
    this.store.update((state) => { state.query = query })
  }

  /**
   * Update one unsaved credential reference.
   * @param packageId - Managed MCP package identity.
   * @param slot - Descriptor-declared credential slot.
   * @param reference - Credential reference name, never a resolved value.
   */
  setCredentialReference(packageId: McpMarketPackageId, slot: string, reference: string): void {
    this.store.update((state) => {
      state.credentialReferences = {
        ...state.credentialReferences,
        [packageId]: {
          ...state.credentialReferences[packageId],
          [slot]: reference,
        },
      }
    })
  }

  /**
   * Persist credential references for one managed MCP package.
   * @param packageId - Managed MCP package identity.
   * @param credentialReferences - Descriptor slot to credential reference mapping.
   */
  async configure(
    packageId: McpMarketPackageId,
    credentialReferences = this.store.getSnapshot().credentialReferences[packageId] ?? {},
  ): Promise<void> {
    this.store.update((state) => { state.busy = true; state.error = null })
    const transport = await this.remote.configure({ packageId, credentialReferences })
    if (!transport.ok || !transport.value.ok) return this.fail(failureCode(transport))
    const savedReferences = transport.value.value.credentialReferences
    this.store.update((state) => {
      state.busy = false
      state.restartNotice = packageId
      state.credentialReferences = {
        ...state.credentialReferences,
        [packageId]: savedReferences,
      }
    })
    await this.load()
  }

  /**
   * Validate and submit one MCP ZIP for installation.
   * @param file - Browser-selected ZIP archive.
   */
  async upload(file: File): Promise<void> {
    await uploadPackage(file, error => this.fail(error), (...args) => this.install(...args))
  }

  /** Confirm the pending managed MCP replacement, if any. */
  async confirmUpgrade(): Promise<void> {
    const snapshot = this.store.getSnapshot()
    const pending = snapshot.pendingUpgrade
    if (pending === null) return
    await this.install(pending.filename, pending.archiveBase64, true, snapshot.localExecutionConfirmed)
  }

  /** Confirm the pending stdio package after its local-execution disclosure. */
  async confirmLocalExecution(): Promise<void> {
    const pending = this.store.getSnapshot().pendingLocalExecution
    if (pending === null) return
    this.store.update((state) => { state.localExecutionConfirmed = true })
    await this.install(pending.filename, pending.archiveBase64, false, true)
  }

  /**
   * Open uninstall confirmation for one MCP package.
   * @param packageId - Managed package to remove.
   */
  requestUninstall(packageId: McpMarketPackageId): void {
    this.store.update((state) => { state.pendingUninstall = packageId })
  }

  /** Clear pending upgrade and uninstall confirmations. */
  // oxlint-disable-next-line sonarjs/no-identical-functions -- Tool and MCP expose symmetric package lifecycle APIs.
  cancelConfirmation(): void {
    cancelPackageConfirmation((mutate) => {
      this.store.update((state) => {
        mutate(state)
      })
    })
  }

  /** Remove the MCP package awaiting uninstall confirmation. */
  async confirmUninstall(): Promise<void> {
    const packageId = this.store.getSnapshot().pendingUninstall
    if (packageId === null) return
    const directEntry = this.store.getSnapshot().entries.find(entry =>
      entry.source === 'direct' && entry.packageId === packageId)
    if (directEntry !== undefined) {
      const transport = await this.remote.deleteDirectConfig({ entryId: packageId as never })
      if (!transport.ok || !transport.value.ok) {
        this.fail(failureCode(transport))
        return
      }
      this.store.update((state) => {
        state.pendingUninstall = null
      })
      await this.load()
      return
    }
    const transport = await this.remote.uninstall({ packageId })
    if (!transport.ok || !transport.value.ok) return this.fail(failureCode(transport))
    this.store.update((state) => {
      state.pendingUninstall = null
      state.restartNotice = packageId
    })
    await this.load()
  }

  /**
   * Save one user-declared MCP server configuration and hot-mount it.
   * @param request - Server name, declaration, and local-execution confirmation.
   * @param confirmed - Whether the disclosure has already been accepted.
   */
  async saveDirectConfig(request: McpDirectConfigSaveRequest, confirmed = false): Promise<void> {
    this.store.update((state) => { state.busy = true; state.error = null })
    const transport = await this.remote.saveDirectConfig({
      ...request,
      ...confirmed ? { confirmLocalExecution: true } : {},
    })
    if (!transport.ok || !transport.value.ok) {
      if (failureCode(transport).code === 'local-execution-confirmation-required') {
        this.store.update((state) => {
          state.busy = false
          state.pendingDirectLocalExecution = request
        })
        return
      }
      this.fail(failureCode(transport))
      return
    }
    this.store.update((state) => { state.busy = false })
    await this.load()
  }

  /** Confirm the pending stdio direct-config save after its disclosure. */
  async confirmDirectLocalExecution(): Promise<void> {
    const pending = this.store.getSnapshot().pendingDirectLocalExecution
    if (pending === null) return
    this.store.update((state) => { state.pendingDirectLocalExecution = null })
    await this.saveDirectConfig(pending, true)
  }

  // oxlint-disable-next-line sonarjs/no-identical-functions -- Shared lifecycle helper keeps parallel stores consistent.
  private async install(
    filename: string,
    archiveBase64: string,
    replaceExisting: boolean,
    confirmLocalExecution = false,
  ): Promise<void> {
    await installPackage({
      filename,
      archiveBase64,
      replaceExisting,
      confirmLocalExecution,
      start: () => {
        this.store.update((state) => { state.busy = true; state.error = null })
      },
      remote: () => this.remote.install({ filename, archiveBase64, replaceExisting, confirmLocalExecution }),
      pending: (packageId) => {
        this.store.update((state) => {
          state.busy = false
          state.pendingUpgrade = { filename, archiveBase64, packageId }
        })
      },
      pendingLocalExecution: (candidatePermissions) => {
        this.store.update((state) => {
          state.busy = false
          state.pendingLocalExecution = { filename, archiveBase64, candidatePermissions }
        })
      },
      installed: (packageId) => {
        this.store.update((state) => {
          state.busy = false
          state.pendingUpgrade = null
          state.pendingLocalExecution = null
          state.localExecutionConfirmed = false
          state.restartNotice = packageId
        })
      },
      fail: error => this.fail(error),
      load: () => this.load(),
    })
  }

  private fail(error: MarketPackageFailure | string): void {
    failPackageStore(typeof error === 'string' ? { code: error } : error, mutate => this.store.update(mutate))
  }
}

async function uploadPackage(
  file: File,
  fail: (error: string) => void,
  install: (filename: string, archiveBase64: string, replaceExisting: boolean) => Promise<void>,
): Promise<void> {
  const invalid = validateUploadFile(file)
  if (invalid !== null) return fail(invalid)
  const archiveBase64 = arrayBufferToBase64(await file.arrayBuffer())
  await install(file.name, archiveBase64, false)
}

async function confirmPackageUpgrade<Id>(
  pending: PendingUpgrade<Id> | null,
  install: (filename: string, archiveBase64: string, replaceExisting: boolean) => Promise<void>,
): Promise<void> {
  if (pending === null) return
  await install(pending.filename, pending.archiveBase64, true)
}

function cancelPackageConfirmation(
  update: (mutate: (state: {
    pendingUpgrade: unknown
    pendingUninstall: unknown
    pendingLocalExecution?: unknown
    localExecutionConfirmed?: unknown
  }) => void) => void,
): void {
  update((state) => {
    state.pendingUpgrade = null
    state.pendingUninstall = null
    if ('pendingLocalExecution' in state) state.pendingLocalExecution = null
    if ('localExecutionConfirmed' in state) state.localExecutionConfirmed = false
    if ('pendingDirectLocalExecution' in state) state.pendingDirectLocalExecution = null
  })
}

async function installPackage<Id>(options: {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting: boolean
  readonly confirmLocalExecution?: boolean
  readonly start: () => void
  readonly remote: () => Promise<PackageInstallTransport<Id>>
  readonly pending: (packageId: Id) => void
  readonly pendingLocalExecution?: (candidatePermissions: readonly string[]) => void
  readonly installed: (packageId: Id) => void
  readonly fail: (error: MarketPackageFailure | string) => void
  readonly load: () => Promise<void>
}): Promise<void> {
  options.start()
  const transport = await options.remote()
  if (!transport.ok || transport.value === undefined) return options.fail('transport')
  if (!transport.value.ok) {
    const error = transport.value.error
    if (error?.code === 'managed-upgrade-required' && error.packageId !== undefined) {
      options.pending(error.packageId)
      return
    }
    if (error?.code === 'local-execution-confirmation-required' && options.pendingLocalExecution !== undefined) {
      options.pendingLocalExecution(error.candidatePermissions ?? [])
      return
    }
    return options.fail({
      code: error?.code ?? 'operation-failed',
      ...error?.publisherId === undefined ? {} : { publisherId: error.publisherId },
    })
  }
  const packageId = transport.value.value?.packageId
  if (packageId === undefined) return options.fail('operation-failed')
  options.installed(packageId)
  await options.load()
}

function failPackageStore<State extends {
  status: Status
  entries: readonly unknown[]
  busy: boolean
  error: MarketPackageFailure | null
}>(
  error: MarketPackageFailure,
  update: (mutate: (state: State) => void) => void,
): void {
  update((state) => {
    state.status = state.entries.length === 0 ? 'error' : state.status
    state.busy = false
    state.error = error
  })
}

function failureCode(value: unknown): MarketPackageFailure {
  if (typeof value !== 'object' || value === null) return { code: 'operation-failed' }
  const transport = value as {
    ok?: boolean
    error?: { code?: string; publisherId?: string }
    value?: { error?: { code?: string; publisherId?: string } }
  }
  const error = transport.error ?? transport.value?.error
  if (error?.code === undefined) return { code: 'operation-failed' }
  return { code: error.code, ...error.publisherId === undefined ? {} : { publisherId: error.publisherId } }
}
