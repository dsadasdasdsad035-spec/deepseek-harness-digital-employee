/** Browser state for Tool and MCP package marketplace tabs. */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ClientRemote,
  McpMarketEntry,
  McpMarketPackageId,
  ToolMarketEntry,
  ToolMarketPackageId,
} from '@deepseek-ai/dsh-api-remotes/client'
import { arrayBufferToBase64, validateUploadFile } from './store.ts'

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface PendingUpgrade<Id> {
  readonly filename: string
  readonly archiveBase64: string
  readonly packageId: Id
}

interface PackageInstallTransport<Id> {
  readonly ok: boolean
  readonly value?: {
    readonly ok: boolean
    readonly error?: { readonly code: string; readonly packageId?: Id }
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
  error: string | null
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
  error: string | null
  restartNotice: McpMarketPackageId | null
  pendingUpgrade: PendingUpgrade<McpMarketPackageId> | null
  pendingUninstall: McpMarketPackageId | null
  credentialReferences: Readonly<Record<string, Readonly<Record<string, string>>>>
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
  pendingUninstall: null,
  credentialReferences: {},
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

  private fail(error: string): void {
    failPackageStore(error, mutate => this.store.update(mutate))
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
  // oxlint-disable-next-line sonarjs/no-identical-functions -- Tool and MCP expose symmetric package lifecycle APIs.
  async confirmUpgrade(): Promise<void> {
    await confirmPackageUpgrade(
      this.store.getSnapshot().pendingUpgrade,
      (...args) => this.install(...args),
    )
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
    const transport = await this.remote.uninstall({ packageId })
    if (!transport.ok || !transport.value.ok) return this.fail(failureCode(transport))
    this.store.update((state) => {
      state.pendingUninstall = null
      state.restartNotice = packageId
    })
    await this.load()
  }

  // oxlint-disable-next-line sonarjs/no-identical-functions -- Shared lifecycle helper keeps parallel stores consistent.
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

  private fail(error: string): void {
    failPackageStore(error, mutate => this.store.update(mutate))
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
  }) => void) => void,
): void {
  update((state) => {
    state.pendingUpgrade = null
    state.pendingUninstall = null
  })
}

async function installPackage<Id>(options: {
  readonly filename: string
  readonly archiveBase64: string
  readonly replaceExisting: boolean
  readonly start: () => void
  readonly remote: () => Promise<PackageInstallTransport<Id>>
  readonly pending: (packageId: Id) => void
  readonly installed: (packageId: Id) => void
  readonly fail: (error: string) => void
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
    return options.fail(error?.code ?? 'operation-failed')
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
  error: string | null
}>(
  error: string,
  update: (mutate: (state: State) => void) => void,
): void {
  update((state) => {
    state.status = state.entries.length === 0 ? 'error' : state.status
    state.busy = false
    state.error = error
  })
}

function failureCode(value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'operation-failed'
  const transport = value as { ok?: boolean; error?: { code?: string }; value?: { error?: { code?: string } } }
  return transport.error?.code ?? transport.value?.error?.code ?? 'operation-failed'
}
