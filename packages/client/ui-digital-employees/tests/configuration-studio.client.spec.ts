import { describe, expect, it, vi } from 'vitest'
import { DigitalEmployeeConfigurationStudioStore } from '../src/client/configuration-studio.ts'

function ok<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

describe('DigitalEmployeeConfigurationStudioStore', () => {
  it('loads administrator drafts, publication history, and validation diagnostics', async () => {
    const remote = {
      listConfigurationDrafts: vi.fn(() => ok([])),
      listConfigurationPublications: vi.fn(() => ok([])),
      listConfigurationAssets: vi.fn(() => ok({ entries: [{
        id: 'skill:release-notes',
        kind: 'skill',
        label: 'release-notes',
        available: true,
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
})
