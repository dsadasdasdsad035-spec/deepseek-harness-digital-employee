import { describe, expect, it, vi } from 'vitest'
import { McpMarketStore, ToolMarketStore } from '../src/client/package-stores.ts'

describe('unified marketplace package stores', () => {
  it('loads Tool permissions and preserves restart-required install state', async () => {
    const remote = {
      list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [{
        packageId: 'release-notes',
        displayName: 'Release notes',
        description: 'Prepare notes.',
        version: '1.0.0',
        publisherId: 'deepseek-local',
        permissions: ['filesystem-read'],
        tools: [{ name: 'release_notes', description: 'Prepare.', inputDescription: 'Repository.', available: false }],
        installedAt: 1,
        available: false,
        restartRequired: true,
      }] } } })),
      install: vi.fn(),
      uninstall: vi.fn(),
    }
    const store = new ToolMarketStore(remote as never)
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'ready',
      entries: [{ packageId: 'release-notes', permissions: ['filesystem-read'], restartRequired: true }],
    })
  })

  it('submits MCP credential references and never stores resolved values', async () => {
    const remote = {
      list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [] } } })),
      install: vi.fn(),
      uninstall: vi.fn(),
      configure: vi.fn(async request => ({
        ok: true,
        value: { ok: true, value: { ...request, restartRequired: true } },
      })),
    }
    const store = new McpMarketStore(remote as never)
    await store.configure('project-tracker' as never, {
      PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN',
    })
    expect(remote.configure).toHaveBeenCalledWith({
      packageId: 'project-tracker',
      credentialReferences: { PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN' },
    })
    expect(JSON.stringify(store.store.getSnapshot())).not.toContain('resolved-secret')
  })

  it('retains a Tool archive only for explicit upgrade and confirms uninstall', async () => {
    const install = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          ok: false,
          error: {
            code: 'managed-upgrade-required',
            packageId: 'release-notes',
            installedVersion: '1.0.0',
            candidateVersion: '2.0.0',
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          ok: true,
          value: { packageId: 'release-notes', operation: 'upgraded', restartRequired: true },
        },
      })
    const uninstall = vi.fn(async request => ({
      ok: true, value: { ok: true, value: { ...request, restartRequired: true } },
    }))
    const remote = {
      list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [] } } })),
      install,
      uninstall,
    }
    const store = new ToolMarketStore(remote as never)
    await store.upload(new File([new Uint8Array([1])], 'release-notes.zip'))
    expect(store.store.getSnapshot().pendingUpgrade?.packageId).toBe('release-notes')
    await store.confirmUpgrade()
    expect(install.mock.calls[1]?.[0]).toMatchObject({ replaceExisting: true })
    store.requestUninstall('release-notes' as never)
    await store.confirmUninstall()
    expect(uninstall).toHaveBeenCalledWith({ packageId: 'release-notes' })
    expect(store.store.getSnapshot().restartNotice).toBe('release-notes')
  })

  it('reports browser validation and Host validation failures', async () => {
    const remote = {
      list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [] } } })),
      install: vi.fn(async () => ({
        ok: true, value: { ok: false, error: { code: 'invalid-signature', publisherId: 'unknown' } },
      })),
      uninstall: vi.fn(),
    }
    const store = new ToolMarketStore(remote as never)
    await store.upload(new File([new Uint8Array([1])], 'bad.txt'))
    expect(store.store.getSnapshot().error).toBe('uploadInvalidType')
    await store.upload(new File([new Uint8Array([1])], 'bad.zip'))
    expect(store.store.getSnapshot().error).toBe('invalid-signature')
  })
})
