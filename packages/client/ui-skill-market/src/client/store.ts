/** Cancellable browser state for the generated skill marketplace Remote. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ClientRemote,
  SkillMarketBannerMediaType,
  SkillMarketEntry,
  SkillMarketFailure,
  SkillMarketSkillId,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { SkillMarketKey } from './locales.ts'

/** Client preflight limit matching the Host's decoded archive limit. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Generated namespace face consumed by this feature and its tests. */
export type SkillMarketRemote = ClientRemote['skillMarket']

/** Archive retained only while a managed upgrade awaits confirmation. */
export interface PendingSkillUpgrade {
  readonly filename: string
  readonly archiveBase64: string
  readonly skillId: SkillMarketSkillId
  readonly installedVersion?: string | undefined
  readonly candidateVersion?: string | undefined
}

/** Browser snapshot for one mounted marketplace section. */
export interface SkillMarketState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: SkillMarketKey | null
  skills: readonly SkillMarketEntry[]
  query: string
  uploading: boolean
  uploadError: SkillMarketKey | null
  installedName: SkillMarketSkillId | null
  pendingUpgrade: PendingSkillUpgrade | null
  pendingUninstall: SkillMarketSkillId | null
  uninstalling: SkillMarketSkillId | null
  uninstallError: SkillMarketKey | null
  banners: Readonly<Record<string, string>>
  bannersLoading: readonly SkillMarketSkillId[]
  bannersFailed: readonly SkillMarketSkillId[]
}

const INITIAL: SkillMarketState = {
  status: 'idle',
  error: null,
  skills: [],
  query: '',
  uploading: false,
  uploadError: null,
  installedName: null,
  pendingUpgrade: null,
  pendingUninstall: null,
  uninstalling: null,
  uninstallError: null,
  banners: {},
  bannersLoading: [],
  bannersFailed: [],
}

/**
 * Convert browser bytes to base64 without depending on Node globals.
 * @param buffer - Browser-owned archive or media bytes.
 * @returns RFC 4648 base64 text.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof btoa !== 'function') throw new Error('current browser does not provide btoa')
  const bytes = new Uint8Array(buffer)
  const chunks: string[] = []
  for (let index = 0; index < bytes.length; index += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length))))
  }
  return btoa(chunks.join(''))
}

/**
 * Build an image URL from Host-validated media and bytes.
 * @param mediaType - Host-validated image media type.
 * @param data - Base64-encoded image bytes.
 * @returns Data URL for an image element.
 */
export function bannerDataUrl(mediaType: SkillMarketBannerMediaType, data: string): string {
  return `data:${mediaType};base64,${data}`
}

/**
 * Filter the local inventory by searchable display metadata.
 * @param skills - Inventory entries to search.
 * @param query - User-entered search text.
 * @returns Matching entries in inventory order.
 */
export function filterSkills(
  skills: readonly SkillMarketEntry[],
  query: string,
): readonly SkillMarketEntry[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return skills
  return skills.filter(skill => [
    skill.skillId,
    skill.description,
    skill.author ?? '',
    ...(skill.tags ?? []),
  ].some(value => value.toLocaleLowerCase().includes(needle)))
}

/**
 * Return the localized preflight failure key, if any.
 * @param file - Candidate browser upload.
 * @returns Failure key, or null when the file passes browser preflight.
 */
export function validateUploadFile(file: File): SkillMarketKey | null {
  if (!file.name.toLocaleLowerCase().endsWith('.zip')) return 'uploadInvalidType'
  if (file.size > MAX_UPLOAD_BYTES) return 'uploadTooLarge'
  return null
}

/**
 * Map every declared Host business failure without inspecting prose.
 * @param failure - Typed Host business failure.
 * @returns Localized message key.
 */
export function keyForFailure(failure: SkillMarketFailure): SkillMarketKey {
  switch (failure.code) {
    case 'invalid-archive': return 'errorInvalidArchive'
    case 'resource-limit': return 'errorResourceLimit'
    case 'unsafe-entry': return 'errorUnsafeEntry'
    case 'invalid-descriptor': return 'errorInvalidDescriptor'
    case 'invalid-banner': return 'errorInvalidBanner'
    case 'managed-upgrade-required': return 'errorManagedUpgrade'
    case 'unmanaged-conflict': return 'errorUnmanagedConflict'
    case 'manifest-incompatible': return 'errorManifestIncompatible'
    case 'not-found': return 'errorNotFound'
    case 'not-managed': return 'errorNotManaged'
  }
}

/** Controller for one settings-section lifetime. */
export class SkillMarketStore {
  /** Observable state consumed by the settings section. */
  readonly store: SnapshotStore<SkillMarketState> = createSnapshotStore(INITIAL)
  private disposed = false
  private loadGeneration = 0
  private uploadGeneration = 0
  private uninstallGeneration = 0
  private readonly bannerGenerations = new Map<SkillMarketSkillId, number>()

  constructor(private readonly remote: SkillMarketRemote) {}

  /** Cancel future state publication and release retained encoded/image data. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.loadGeneration++
    this.uploadGeneration++
    this.uninstallGeneration++
    this.bannerGenerations.clear()
    this.store.update((state) => {
      state.pendingUpgrade = null
      state.banners = {}
      state.bannersLoading = []
    })
  }

  /** Load the authoritative inventory; only the newest request may publish. */
  async load(): Promise<void> {
    if (this.disposed) return
    const generation = ++this.loadGeneration
    this.store.update((state) => {
      state.status = 'loading'
      state.error = null
    })
    try {
      const transport = await this.remote.list()
      if (!this.currentLoad(generation)) return
      if (!transport.ok) return this.failLoad(generation)
      if (!transport.value.ok) {
        return this.failLoad(generation, keyForFailure(transport.value.error))
      }
      const skills = transport.value.value.entries
      const remaining = new Set(skills.map(skill => skill.skillId))
      this.store.update((state) => {
        state.status = 'ready'
        state.error = null
        state.skills = skills
        state.banners = Object.fromEntries(
          Object.entries(state.banners).filter(([name]) => remaining.has(name as SkillMarketSkillId)),
        )
        state.bannersLoading = state.bannersLoading.filter(name => remaining.has(name))
        state.bannersFailed = state.bannersFailed.filter(name => remaining.has(name))
      })
    } catch (error: unknown) {
      this.report('list', error)
      this.failLoad(generation)
    }
  }

  /**
   * Replace the local inventory search text.
   * @param query - Current search text.
   */
  setQuery(query: string): void {
    if (!this.disposed) this.store.update((state) => { state.query = query })
  }

  /**
   * Validate, encode, and submit one ZIP while retaining bytes only for a managed upgrade.
   * @param file - Browser-selected ZIP file.
   */
  async upload(file: File): Promise<void> {
    if (this.disposed) return
    const blocked = validateUploadFile(file)
    if (blocked !== null) {
      this.store.update((state) => { state.uploadError = blocked })
      return
    }
    const generation = ++this.uploadGeneration
    this.store.update((state) => {
      state.uploading = true
      state.uploadError = null
      state.pendingUpgrade = null
    })
    let archiveBase64: string
    try {
      archiveBase64 = arrayBufferToBase64(await file.arrayBuffer())
    } catch (error: unknown) {
      this.report('encode', error)
      if (this.currentUpload(generation)) {
        this.store.update((state) => {
          state.uploading = false
          state.uploadError = 'uploadFailed'
        })
      }
      return
    }
    await this.install({ filename: file.name, archiveBase64 }, false, generation)
  }

  /** Release the encoded candidate without contacting the Host. */
  cancelUpgrade(): void {
    if (this.store.getSnapshot().uploading) return
    this.store.update((state) => { state.pendingUpgrade = null })
  }

  /** Resubmit the retained candidate with explicit managed replacement intent. */
  async confirmUpgrade(): Promise<void> {
    if (this.disposed) return
    const pending = this.store.getSnapshot().pendingUpgrade
    if (pending === null) return
    const generation = ++this.uploadGeneration
    this.store.update((state) => {
      state.uploading = true
      state.uploadError = null
    })
    await this.install(pending, true, generation)
  }

  /**
   * Open uninstall confirmation for one managed skill.
   * @param skillId - Managed skill selected for removal.
   */
  requestUninstall(skillId: SkillMarketSkillId): void {
    if (this.disposed || this.store.getSnapshot().uninstalling !== null) return
    this.store.update((state) => {
      state.pendingUninstall = skillId
      state.uninstallError = null
    })
  }

  /** Close uninstall confirmation without contacting the Host. */
  cancelUninstall(): void {
    if (this.store.getSnapshot().uninstalling !== null) return
    this.store.update((state) => {
      state.pendingUninstall = null
      state.uninstallError = null
    })
  }

  /** Remove the confirmed managed installation and refresh inventory. */
  async confirmUninstall(): Promise<void> {
    if (this.disposed) return
    const skillId = this.store.getSnapshot().pendingUninstall
    if (skillId === null || this.store.getSnapshot().uninstalling !== null) return
    const generation = ++this.uninstallGeneration
    this.store.update((state) => {
      state.uninstalling = skillId
      state.uninstallError = null
    })
    try {
      const transport = await this.remote.uninstall({ skillId })
      if (!this.currentUninstall(generation)) return
      if (!transport.ok) return this.failUninstall(generation, 'operationFailed')
      if (!transport.value.ok) {
        return this.failUninstall(generation, keyForFailure(transport.value.error))
      }
      this.releaseBanner(skillId)
      this.store.update((state) => {
        state.uninstalling = null
        state.pendingUninstall = null
        state.uninstallError = null
      })
      await this.load()
    } catch (error: unknown) {
      this.report('uninstall', error)
      this.failUninstall(generation, 'operationFailed')
    }
  }

  /**
   * Lazily fetch one image; replacement, removal, and disposal supersede publication.
   * @param skillId - Managed skill whose image should load.
   */
  async loadBanner(skillId: SkillMarketSkillId): Promise<void> {
    if (this.disposed) return
    const snapshot = this.store.getSnapshot()
    if (snapshot.banners[skillId] !== undefined
      || snapshot.bannersLoading.includes(skillId)
      || snapshot.bannersFailed.includes(skillId)) return
    const generation = (this.bannerGenerations.get(skillId) ?? 0) + 1
    this.bannerGenerations.set(skillId, generation)
    this.store.update((state) => { state.bannersLoading = [...state.bannersLoading, skillId] })
    try {
      const transport = await this.remote.banner({ skillId })
      if (!this.currentBanner(skillId, generation)) return
      if (!transport.ok || !transport.value.ok) return this.failBanner(skillId, generation)
      const banner = transport.value.value
      this.store.update((state) => {
        state.bannersLoading = state.bannersLoading.filter(name => name !== skillId)
        state.banners = {
          ...state.banners,
          [skillId]: bannerDataUrl(banner.mediaType, banner.dataBase64),
        }
      })
    } catch (error: unknown) {
      this.report('banner', error)
      this.failBanner(skillId, generation)
    }
  }

  /** Dismiss the latest-installation notice. */
  dismissInstalled(): void {
    if (!this.disposed) this.store.update((state) => { state.installedName = null })
  }

  private async install(
    candidate: { filename: string; archiveBase64: string },
    replaceExisting: boolean,
    generation: number,
  ): Promise<void> {
    try {
      const transport = await this.remote.install({
        filename: candidate.filename,
        archiveBase64: candidate.archiveBase64,
        replaceExisting,
      })
      if (!this.currentUpload(generation)) return
      if (!transport.ok) return this.failUpload(generation, 'operationFailed')
      if (!transport.value.ok) {
        const failure = transport.value.error
        if (!replaceExisting && failure.code === 'managed-upgrade-required') {
          this.store.update((state) => {
            state.uploading = false
            state.uploadError = null
            state.pendingUpgrade = {
              ...candidate,
              skillId: failure.skillId,
              installedVersion: failure.installedVersion,
              candidateVersion: failure.candidateVersion,
            }
          })
          return
        }
        return this.failUpload(generation, keyForFailure(failure))
      }
      const skillId = transport.value.value.skillId
      this.store.update((state) => {
        state.uploading = false
        state.uploadError = null
        state.pendingUpgrade = null
        state.installedName = skillId
      })
      await this.load()
    } catch (error: unknown) {
      this.report('install', error)
      this.failUpload(generation, 'operationFailed')
    }
  }

  private currentLoad(generation: number): boolean {
    return !this.disposed && generation === this.loadGeneration
  }

  private currentUpload(generation: number): boolean {
    return !this.disposed && generation === this.uploadGeneration
  }

  private currentUninstall(generation: number): boolean {
    return !this.disposed && generation === this.uninstallGeneration
  }

  private currentBanner(skillId: SkillMarketSkillId, generation: number): boolean {
    return !this.disposed && this.bannerGenerations.get(skillId) === generation
  }

  private failLoad(generation: number, key: SkillMarketKey = 'loadFailed'): void {
    if (!this.currentLoad(generation)) return
    this.store.update((state) => {
      state.status = 'error'
      state.error = key
    })
  }

  private failUpload(generation: number, key: SkillMarketKey): void {
    if (!this.currentUpload(generation)) return
    this.store.update((state) => {
      state.uploading = false
      state.uploadError = key
      state.pendingUpgrade = null
    })
  }

  private failUninstall(generation: number, key: SkillMarketKey): void {
    if (!this.currentUninstall(generation)) return
    this.store.update((state) => {
      state.uninstalling = null
      state.uninstallError = key
    })
  }

  private failBanner(skillId: SkillMarketSkillId, generation: number): void {
    if (!this.currentBanner(skillId, generation)) return
    this.store.update((state) => {
      state.bannersLoading = state.bannersLoading.filter(name => name !== skillId)
      state.bannersFailed = state.bannersFailed.includes(skillId)
        ? state.bannersFailed
        : [...state.bannersFailed, skillId]
    })
  }

  private releaseBanner(skillId: SkillMarketSkillId): void {
    this.bannerGenerations.set(skillId, (this.bannerGenerations.get(skillId) ?? 0) + 1)
    this.store.update((state) => {
      state.banners = Object.fromEntries(
        Object.entries(state.banners).filter(([name]) => name !== skillId),
      ) as typeof state.banners
      state.bannersLoading = state.bannersLoading.filter(name => name !== skillId)
      state.bannersFailed = state.bannersFailed.filter(name => name !== skillId)
    })
  }

  private report(operation: string, error: unknown): void {
    console.error(`skill marketplace ${operation} failed`, error)
  }
}
