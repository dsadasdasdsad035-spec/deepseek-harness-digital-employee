/** Browser state for administrator-authored employee template drafts. */

import type {
  CreateDigitalEmployeeTemplateDraftRequest,
  DigitalEmployeeConfigurationAsset,
  DigitalEmployeeTemplateDraft,
  DigitalEmployeeTemplateDraftId,
  DigitalEmployeeTemplatePublication,
  DigitalEmployeeTemplateDraftValidation,
  DigitalEmployeeTemplatePreview,
  UpdateDigitalEmployeeTemplateDraftRequest,
} from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { DigitalEmployeeRemote } from './store.ts'

/** Observable administrator configuration-studio state. */
export interface DigitalEmployeeConfigurationStudioState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  drafts: readonly DigitalEmployeeTemplateDraft[]
  publications: readonly DigitalEmployeeTemplatePublication[]
  preview: DigitalEmployeeTemplatePreview | null
  diagnostics: Readonly<Record<string, DigitalEmployeeTemplateDraftValidation['diagnostics']>>
  assets: readonly DigitalEmployeeConfigurationAsset[]
  assetStatus: 'idle' | 'loading' | 'ready' | 'error'
  assetError: string | null
  assetPreset: string | null
}

const INITIAL: DigitalEmployeeConfigurationStudioState = {
  status: 'idle', error: null, drafts: [], publications: [], preview: null, diagnostics: {}, assets: [],
  assetStatus: 'idle', assetError: null, assetPreset: null,
}

/** Owns administrator configuration-studio remote operations. */
export class DigitalEmployeeConfigurationStudioStore {
  /** Observable state shared by the configuration workspace. */
  readonly store: SnapshotStore<DigitalEmployeeConfigurationStudioState> = createSnapshotStore(INITIAL)
  private assetGeneration = 0

  constructor(private readonly remote: Pick<DigitalEmployeeRemote,
    | 'listConfigurationDrafts'
    | 'listConfigurationAssets'
    | 'listConfigurationPublications'
    | 'createConfigurationDraft'
    | 'updateConfigurationDraft'
    | 'deleteConfigurationDraft'
    | 'previewConfigurationDraft'
    | 'disposeConfigurationPreview'
    | 'publishConfigurationDraft'
    | 'validateConfigurationDraft'>) {}

  /** Load current drafts and immutable publication history. */
  async load(): Promise<void> {
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    try {
      const [drafts, publications] = await Promise.all([
        this.remote.listConfigurationDrafts(), this.remote.listConfigurationPublications(),
      ])
      if (!drafts.ok) throw new Error(drafts.error.message)
      if (!publications.ok) throw new Error(publications.error.message)
      this.store.update((state) => {
        state.status = 'ready'
        state.drafts = drafts.value
        state.publications = publications.value
      })
    } catch (error) {
      this.store.update((state) => {
        state.status = 'error'
        state.error = error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Load assets visible through the selected Agent preset.
   * @param preset - draft preset currently shown by the editor.
   */
  async loadAssets(preset: string): Promise<void> {
    const generation = ++this.assetGeneration
    this.store.update((state) => {
      state.assetStatus = 'loading'
      state.assetError = null
      state.assetPreset = preset
    })
    const result = await this.remote.listConfigurationAssets({ preset })
    if (generation !== this.assetGeneration) return
    if (!result.ok) {
      this.store.update((state) => {
        state.assetStatus = 'error'
        state.assetError = result.error.message
      })
      return
    }
    this.store.update((state) => {
      state.assetStatus = 'ready'
      state.assetError = null
      state.assets = result.value.entries
    })
  }

  /**
   * Create a draft and retain it in the local list.
   * @param request - initial administrator-authored template fields.
   */
  async create(request: CreateDigitalEmployeeTemplateDraftRequest): Promise<void> {
    const result = await this.remote.createConfigurationDraft(request)
    if (!result.ok) throw new Error(result.error.message)
    this.store.update((state) => { state.drafts = [...state.drafts, result.value] })
  }

  /**
   * Save a revision-guarded draft patch and discard diagnostics for its prior revision.
   * @param request - draft identity, observed revision, and replacement fields.
   */
  async update(request: UpdateDigitalEmployeeTemplateDraftRequest): Promise<void> {
    const result = await this.remote.updateConfigurationDraft(request)
    if (!result.ok) throw new Error(result.error.message)
    this.store.update((state) => {
      state.drafts = state.drafts.map(draft => draft.id === result.value.id ? result.value : draft)
      const { [result.value.id]: _prior, ...diagnostics } = state.diagnostics
      state.diagnostics = diagnostics
    })
  }

  /**
   * Validate one draft and retain its revision-bound diagnostics.
   * @param draftId - draft whose current revision is validated.
   */
  async validate(draftId: DigitalEmployeeTemplateDraftId): Promise<void> {
    const result = await this.remote.validateConfigurationDraft({ draftId })
    if (!result.ok) throw new Error(result.error.message)
    this.store.update((state) => { state.diagnostics = { ...state.diagnostics, [draftId]: result.value.diagnostics } })
  }

  /**
   * Validate and publish the exact current draft revision, retaining diagnostics instead of submitting invalid content.
   * @param draft - current draft snapshot whose revision is published.
   */
  async publish(draft: DigitalEmployeeTemplateDraft): Promise<void> {
    const validation = await this.remote.validateConfigurationDraft({ draftId: draft.id })
    if (!validation.ok) throw new Error(validation.error.message)
    this.store.update((state) => {
      state.diagnostics = { ...state.diagnostics, [draft.id]: validation.value.diagnostics }
    })
    if (validation.value.diagnostics.length > 0) return
    const result = await this.remote.publishConfigurationDraft({ draftId: draft.id, revision: draft.revision })
    if (!result.ok) throw new Error(result.error.message)
    this.store.update((state) => { state.publications = [...state.publications, result.value] })
  }

  /**
   * Start an isolated preview for the current draft revision.
   * @param draft - current draft snapshot to compose.
   * @param workspaceId - browser-selected workspace that supplies the preview cwd.
   */
  async preview(draft: DigitalEmployeeTemplateDraft, workspaceId: string): Promise<void> {
    const result = await this.remote.previewConfigurationDraft({
      draftId: draft.id,
      revision: draft.revision,
      workspaceId: workspaceId as never,
    })
    if (!result.ok) throw new Error(result.error.message)
    this.store.update((state) => { state.preview = result.value })
  }

  /** Terminate the active preview, waiting for its Host-owned resources to release. */
  async disposePreview(): Promise<void> {
    const preview = this.store.getSnapshot().preview
    if (preview === null) return
    const result = await this.remote.disposeConfigurationPreview({ previewId: preview.id })
    if (!result.ok) throw new Error(result.error.message)
    this.store.update((state) => { state.preview = null })
  }

  /**
   * Discard one unpublished draft and its retained diagnostics.
   * @param draftId - draft to remove.
   */
  async delete(draftId: DigitalEmployeeTemplateDraftId): Promise<void> {
    const result = await this.remote.deleteConfigurationDraft({ draftId })
    if (!result.ok) throw new Error(result.error.message)
    this.store.update((state) => {
      state.drafts = state.drafts.filter(draft => draft.id !== draftId)
      const { [draftId]: _removed, ...diagnostics } = state.diagnostics
      state.diagnostics = diagnostics
    })
  }
}
