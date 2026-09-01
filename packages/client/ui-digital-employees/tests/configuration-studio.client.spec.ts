import { describe, expect, it, vi } from 'vitest'
import { DigitalEmployeeConfigurationStudioStore } from '../src/client/configuration-studio.ts'

function ok<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

describe('DigitalEmployeeConfigurationStudioStore', () => {
  it('retains fresh diagnostics instead of publishing an invalid draft', async () => {
    const draft = {
      id: 'draft-1', templateId: 'operations-assistant', revision: 1,
      display: { name: 'Operations Assistant', description: 'Coordinates delivery.' },
      instructions: 'Coordinate delivery.', personality: 'Helpful.', preset: 'headless',
      capabilities: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
      mcpServers: [], experts: [], memorySeeds: [],
      delegation: { maxDepth: 0, maxConcurrency: 1, timeoutMs: 30_000 },
      createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
    }
    const publishConfigurationDraft = vi.fn(() => ok({
      templateId: draft.templateId,
      version: '0.1.1',
      draftId: draft.id,
      draftRevision: draft.revision,
      publishedAt: '2026-09-01T00:00:00.000Z',
    }))
    const remote = {
      validateConfigurationDraft: vi.fn(() => ok({
        revision: draft.revision,
        diagnostics: [{
          code: 'unavailable-preset',
          path: 'preset',
          message: 'Agent preset "headless" is not available in this installation.',
        }],
      })),
      publishConfigurationDraft,
    }
    const store = new DigitalEmployeeConfigurationStudioStore(remote as never)

    await store.publish(draft as never)

    expect(store.store.getSnapshot().diagnostics[draft.id]).toEqual([
      expect.objectContaining({ code: 'unavailable-preset' }),
    ])
    expect(publishConfigurationDraft).not.toHaveBeenCalled()
  })

  it('loads administrator drafts, publication history, and validation diagnostics', async () => {
    const remote = {
      listConfigurationDrafts: vi.fn(() => ok([])),
      listConfigurationPublications: vi.fn(() => ok([])),
      listConfigurationAssets: vi.fn(({ preset }: { preset: string }) => ok({ entries: [{
        id: 'skill:release-notes',
        kind: 'skill',
        label: 'release-notes',
        available: true,
        source: preset,
        permissionSummary: [],
        restartRequired: false,
      }] })),
      createConfigurationDraft: vi.fn(() => ok({
        id: 'draft-1', templateId: 'operations-assistant', revision: 1,
        display: { name: 'Operations Assistant', description: 'Coordinates delivery.' },
        instructions: 'Coordinate delivery.', personality: 'Helpful.', preset: 'headless',
        capabilities: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
        mcpServers: [], experts: [], memorySeeds: [], delegation: { maxDepth: 0, maxConcurrency: 1, timeoutMs: 30_000 },
        createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
      })),
      updateConfigurationDraft: vi.fn(() => ok({
        id: 'draft-1', templateId: 'operations-assistant', revision: 2,
        display: { name: 'Operations Assistant', description: 'Coordinates delivery.' },
        instructions: 'Coordinate delivery.', personality: 'Helpful.', preset: 'headless',
        capabilities: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
        mcpServers: [], experts: [], memorySeeds: [], delegation: { maxDepth: 0, maxConcurrency: 1, timeoutMs: 30_000 },
        createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:01.000Z',
      })),
      validateConfigurationDraft: vi.fn(() => ok({ revision: 1, diagnostics: [] })),
      previewConfigurationDraft: vi.fn(() => ok({
        id: 'preview-1', draftId: 'draft-1', revision: 2, sessionId: 'preview-session-1', state: 'active',
      })),
      disposeConfigurationPreview: vi.fn(() => ok(undefined)),
    }
    const store = new DigitalEmployeeConfigurationStudioStore(remote as never)

    await store.load()
    await store.loadAssets('headless')
    await store.create({
      templateId: 'operations-assistant',
      display: { name: 'Operations Assistant', description: 'Coordinates delivery.' },
      instructions: 'Coordinate delivery.',
    })
    await store.validate('draft-1' as never)
    const draft = store.store.getSnapshot().drafts[0]!
    await store.update({ draftId: draft.id, revision: draft.revision, patch: { personality: 'Direct.' } })
    await store.preview(store.store.getSnapshot().drafts[0]!, 'workspace-1')
    await store.disposePreview()

    expect(store.store.getSnapshot()).toMatchObject({
      status: 'ready',
      drafts: [expect.objectContaining({ id: 'draft-1' })],
      diagnostics: {},
      preview: null,
      assets: [{ id: 'skill:release-notes', kind: 'skill', label: 'release-notes', available: true }],
    })
  })

  it('keeps the newest preset catalog when responses settle out of order', async () => {
    let resolveHeadless!: (value: Awaited<ReturnType<typeof ok<{ entries: never[] }>>>) => void
    const headless = new Promise<Awaited<ReturnType<typeof ok<{ entries: never[] }>>>>((resolve) => {
      resolveHeadless = resolve
    })
    const remote = {
      listConfigurationAssets: vi.fn(({ preset }: { preset: string }) => preset === 'headless'
        ? headless
        : ok({ entries: [{
          id: 'skill:restricted',
          kind: 'skill',
          label: 'restricted',
          available: true,
          source: 'skill-registry',
          permissionSummary: [],
          restartRequired: false,
        }] })),
    }
    const store = new DigitalEmployeeConfigurationStudioStore(remote as never)

    const stale = store.loadAssets('headless')
    await store.loadAssets('restricted')
    resolveHeadless({ ok: true, value: { entries: [] } })
    await stale

    expect(store.store.getSnapshot()).toMatchObject({
      assetStatus: 'ready',
      assetPreset: 'restricted',
      assets: [expect.objectContaining({ label: 'restricted' })],
    })
  })

  it('retains the last catalog as non-authoritative display data after preset resolution fails', async () => {
    const remote = {
      listConfigurationAssets: vi.fn(({ preset }: { preset: string }) => preset === 'broken'
        ? Promise.resolve({ ok: false as const, error: { message: 'Preset unavailable' } })
        : ok({ entries: [{
          id: 'skill:release-notes',
          kind: 'skill',
          label: 'release-notes',
          available: true,
          source: 'skill-registry',
          permissionSummary: [],
          restartRequired: false,
        }] })),
    }
    const store = new DigitalEmployeeConfigurationStudioStore(remote as never)

    await store.loadAssets('headless')
    await store.loadAssets('broken')

    expect(store.store.getSnapshot()).toMatchObject({
      assetStatus: 'error',
      assetError: 'Preset unavailable',
      assetPreset: 'broken',
      assets: [expect.objectContaining({ label: 'release-notes' })],
    })
  })
})
