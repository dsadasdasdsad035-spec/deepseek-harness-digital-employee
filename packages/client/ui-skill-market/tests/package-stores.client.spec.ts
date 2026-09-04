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

  it('holds a stdio MCP package until local execution is confirmed, then installs it', async () => {
    const install = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          ok: false,
          error: { code: 'local-execution-confirmation-required', candidatePermissions: ['subprocess'] },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          ok: true,
          value: { packageId: 'local-suite', operation: 'installed', restartRequired: true },
        },
      })
    const remote = {
      list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [] } } })),
      install,
      uninstall: vi.fn(),
      configure: vi.fn(),
    }
    const store = new McpMarketStore(remote as never)
    await store.upload(new File([new Uint8Array([1])], 'local-suite.zip'))
    expect(install).toHaveBeenCalledTimes(1)
    expect(install.mock.calls[0]?.[0]).toMatchObject({ confirmLocalExecution: false })
    const pending = store.store.getSnapshot().pendingLocalExecution
    expect(pending?.candidatePermissions).toEqual(['subprocess'])

    await store.confirmLocalExecution()
    expect(install).toHaveBeenCalledTimes(2)
    expect(install.mock.calls[1]?.[0]).toMatchObject({ confirmLocalExecution: true })
    expect(store.store.getSnapshot().pendingLocalExecution).toBeNull()
    expect(store.store.getSnapshot().localExecutionConfirmed).toBe(false)
  })

  it('carries the local-execution confirmation through a later upgrade confirmation', async () => {
    const install = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          ok: false,
          error: { code: 'local-execution-confirmation-required', candidatePermissions: ['subprocess'] },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          ok: false,
          error: { code: 'managed-upgrade-required', packageId: 'local-suite', installedVersion: '1.0.0', candidateVersion: '2.0.0' },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          ok: true,
          value: { packageId: 'local-suite', operation: 'upgraded', restartRequired: true },
        },
      })
    const remote = {
      list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [] } } })),
      install,
      uninstall: vi.fn(),
      configure: vi.fn(),
    }
    const store = new McpMarketStore(remote as never)
    await store.upload(new File([new Uint8Array([1])], 'local-suite.zip'))
    await store.confirmLocalExecution()
    expect(store.store.getSnapshot().pendingUpgrade?.packageId).toBe('local-suite')
    await store.confirmUpgrade()
    expect(install.mock.calls[2]?.[0]).toMatchObject({ replaceExisting: true, confirmLocalExecution: true })
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
    expect(store.store.getSnapshot().error).toEqual({ code: 'uploadInvalidType' })
    await store.upload(new File([new Uint8Array([1])], 'bad.zip'))
    expect(store.store.getSnapshot().error).toEqual({ code: 'invalid-signature', publisherId: 'unknown' })
  })

  it('holds a stdio direct-config save until local execution is confirmed, then hot-mounts it', async () => {
    const save = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        value: { ok: false, error: { code: 'local-execution-confirmation-required' } },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { ok: true, value: { entryId: 'entry-1', serverName: 'local-fs', restartRequired: false } },
      })
    const list = vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [] } } }))
    const remote = {
      list,
      install: vi.fn(),
      uninstall: vi.fn(),
      configure: vi.fn(),
      saveDirectConfig: save,
      deleteDirectConfig: vi.fn(),
    }
    const store = new McpMarketStore(remote as never)
    const request = {
      serverName: 'local-fs',
      declaration: {
        transport: 'stdio', command: 'node', args: ['server.js'],
        env: { API_TOKEN: '' }, envCredentials: { API_TOKEN: 'LOCAL_TOKEN' }, cwd: '/tmp',
      },
    } as const
    await store.saveDirectConfig(request as never)
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('confirmLocalExecution', true)
    expect(store.store.getSnapshot().pendingDirectLocalExecution).not.toBeNull()
    await store.confirmDirectLocalExecution()
    expect(save.mock.calls[1]?.[0]).toMatchObject({ confirmLocalExecution: true })
    expect(store.store.getSnapshot().pendingDirectLocalExecution).toBeNull()
  })

  it('deletes a direct-config entry without a restart notice', async () => {
    const deleteDirectConfig = vi.fn(async () => ({
      ok: true, value: { ok: true, value: { entryId: 'entry-1', restartRequired: false } },
    }))
    const list = vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [{
      packageId: 'entry-1',
      source: 'direct',
      displayName: 'remote-notes',
      description: 'User-declared MCP server configuration.',
      version: '1.0.0',
      publisherId: 'direct',
      servers: [{ serverName: 'remote-notes', transport: 'streamable-http', available: true }],
      permissions: [],
      credentialRequirements: [],
      installedAt: 1,
      configured: true,
      available: true,
      restartRequired: false,
    }] } } }))
    const remote = {
      list,
      install: vi.fn(),
      uninstall: vi.fn(),
      configure: vi.fn(),
      saveDirectConfig: vi.fn(),
      deleteDirectConfig,
    }
    const store = new McpMarketStore(remote as never)
    await store.load()
    store.requestUninstall('entry-1' as never)
    await store.confirmUninstall()
    expect(deleteDirectConfig).toHaveBeenCalledWith({ entryId: 'entry-1' })
    expect(store.store.getSnapshot().restartNotice).toBeNull()
  })
})
