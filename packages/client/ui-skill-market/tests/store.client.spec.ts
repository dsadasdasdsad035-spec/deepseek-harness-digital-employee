// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type {
  SkillMarketFailure, SkillMarketSkillId,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  arrayBufferToBase64, filterSkills, keyForFailure, MAX_UPLOAD_BYTES,
  SkillMarketStore, validateUploadFile,
} from '../src/client/store.ts'
import type { SkillMarketRemote } from '../src/client/store.ts'

const id = (value: string) => value as SkillMarketSkillId
const entry = (name = 'pdf-tools') => ({
  skillId: id(name),
  description: 'Read and convert PDFs.',
  version: '1.0.0',
  author: 'Alice',
  tags: ['pdf', 'files'],
  installedAt: 1,
  hasBanner: true,
})
const remoteOk = <T>(value: T) => ({ ok: true as const, value })
const businessOk = <T>(value: T) => remoteOk({ ok: true as const, value })
const businessError = (error: SkillMarketFailure) => remoteOk({ ok: false as const, error })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

function fakeRemote(overrides: Partial<SkillMarketRemote> = {}) {
  const calls = { install: [] as unknown[], uninstall: [] as unknown[], banner: [] as unknown[] }
  const remote = {
    list: vi.fn(async () => businessOk({ entries: [entry()] })),
    install: vi.fn(async (request) => {
      calls.install.push(request)
      return businessOk({ skillId: id('pdf-tools'), operation: 'installed' as const })
    }),
    uninstall: vi.fn(async (request) => {
      calls.uninstall.push(request)
      return businessOk({ skillId: request.skillId })
    }),
    banner: vi.fn(async (request) => {
      calls.banner.push(request)
      return businessOk({
        skillId: request.skillId,
        mediaType: 'image/png' as const,
        dataBase64: 'AAA',
      })
    }),
    ...overrides,
  } as SkillMarketRemote
  return { remote, calls }
}

describe('upload helpers', () => {
  it('encodes browser bytes and performs ZIP/10 MiB preflight', () => {
    expect(arrayBufferToBase64(new Uint8Array([0, 1, 2]).buffer)).toBe('AAEC')
    expect(validateUploadFile(new File(['x'], 'skill.zip'))).toBeNull()
    expect(validateUploadFile(new File(['x'], 'skill.tar'))).toBe('uploadInvalidType')
    expect(validateUploadFile(new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'skill.zip')))
      .toBe('uploadTooLarge')
  })

  it('filters case-insensitively across name, description, author, and tags', () => {
    const rows = [entry(), { ...entry('sql-helper'), description: 'Queries', author: 'Bob', tags: ['database'] }]
    expect(filterSkills(rows, 'PDF')).toHaveLength(1)
    expect(filterSkills(rows, 'queries')[0]?.skillId).toBe('sql-helper')
    expect(filterSkills(rows, 'bob')[0]?.skillId).toBe('sql-helper')
    expect(filterSkills(rows, 'DATABASE')[0]?.skillId).toBe('sql-helper')
  })
})

describe('structured failure mapping', () => {
  it.each([
    [{ code: 'invalid-archive', reason: 'zip' }, 'errorInvalidArchive'],
    [{ code: 'resource-limit', limit: 'archive-bytes', limitValue: 1, observedValue: 2 }, 'errorResourceLimit'],
    [{ code: 'unsafe-entry', entry: '../x', reason: 'path' }, 'errorUnsafeEntry'],
    [{ code: 'invalid-descriptor', reason: 'missing' }, 'errorInvalidDescriptor'],
    [{ code: 'invalid-banner', reason: 'missing' }, 'errorInvalidBanner'],
    [{ code: 'managed-upgrade-required', skillId: id('x') }, 'errorManagedUpgrade'],
    [{ code: 'unmanaged-conflict', skillId: id('x') }, 'errorUnmanagedConflict'],
    [{ code: 'manifest-incompatible', skillId: id('x') }, 'errorManifestIncompatible'],
    [{ code: 'not-found', skillId: id('x') }, 'errorNotFound'],
    [{ code: 'not-managed', skillId: id('x'), reason: 'missing-manifest' }, 'errorNotManaged'],
  ] satisfies Array<[SkillMarketFailure, string]>)('maps %s', (failure, expected) => {
    expect(keyForFailure(failure)).toBe(expected)
  })
})

describe('SkillMarketStore', () => {
  it('loads inventory and maps carrier failure to retryable state', async () => {
    const { remote } = fakeRemote()
    const store = new SkillMarketStore(remote)
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', skills: [entry()] })

    const failed = new SkillMarketStore(fakeRemote({
      list: vi.fn(async () => ({ ok: false as const, error: { code: 'transport', message: 'offline', details: {} } })),
    }).remote)
    await failed.load()
    expect(failed.store.getSnapshot()).toMatchObject({ status: 'error', error: 'loadFailed' })
  })

  it('allows only the newest inventory response to publish', async () => {
    const first = deferred<Awaited<ReturnType<SkillMarketRemote['list']>>>()
    const second = deferred<Awaited<ReturnType<SkillMarketRemote['list']>>>()
    const list = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const store = new SkillMarketStore(fakeRemote({ list }).remote)
    const oldLoad = store.load()
    const newLoad = store.load()
    second.resolve(businessOk({ entries: [entry('new-skill')] }))
    await newLoad
    first.resolve(businessOk({ entries: [entry('old-skill')] }))
    await oldLoad
    expect(store.store.getSnapshot().skills[0]?.skillId).toBe('new-skill')
  })

  it('submits generated install fields and refreshes after success', async () => {
    const made = fakeRemote()
    const store = new SkillMarketStore(made.remote)
    await store.upload(new File([new Uint8Array([1, 2])], 'pdf-tools.zip'))
    expect(made.calls.install[0]).toEqual({
      filename: 'pdf-tools.zip',
      archiveBase64: 'AQI=',
      replaceExisting: false,
    })
    expect(store.store.getSnapshot()).toMatchObject({
      uploading: false,
      installedName: 'pdf-tools',
      pendingUpgrade: null,
    })
  })

  it('retains bytes only for managed upgrade, then releases them on cancel', async () => {
    const failure: SkillMarketFailure = {
      code: 'managed-upgrade-required',
      skillId: id('pdf-tools'),
      installedVersion: '1.0.0',
      candidateVersion: '2.0.0',
    }
    const store = new SkillMarketStore(fakeRemote({
      install: vi.fn(async () => businessError(failure)),
    }).remote)
    await store.upload(new File(['zip'], 'pdf-tools.zip'))
    expect(store.store.getSnapshot().pendingUpgrade).toMatchObject({
      skillId: 'pdf-tools',
      archiveBase64: expect.any(String),
    })
    store.cancelUpgrade()
    expect(store.store.getSnapshot().pendingUpgrade).toBeNull()
  })

  it('confirms only managed upgrades and sends explicit replacement', async () => {
    let attempt = 0
    const made = fakeRemote({
      install: vi.fn(async (request) => {
        made.calls.install.push(request)
        attempt++
        return attempt === 1
          ? businessError({ code: 'managed-upgrade-required', skillId: id('pdf-tools') })
          : businessOk({ skillId: id('pdf-tools'), operation: 'upgraded' as const })
      }),
    })
    const store = new SkillMarketStore(made.remote)
    await store.upload(new File(['zip'], 'pdf-tools.zip'))
    await store.confirmUpgrade()
    expect(made.calls.install.map(value => (value as { replaceExisting: boolean }).replaceExisting))
      .toEqual([false, true])
    expect(store.store.getSnapshot().pendingUpgrade).toBeNull()
  })

  it('refuses unmanaged conflict without opening upgrade confirmation', async () => {
    const store = new SkillMarketStore(fakeRemote({
      install: vi.fn(async () => businessError({
        code: 'unmanaged-conflict',
        skillId: id('pdf-tools'),
      })),
    }).remote)
    await store.upload(new File(['zip'], 'pdf-tools.zip'))
    expect(store.store.getSnapshot()).toMatchObject({
      pendingUpgrade: null,
      uploadError: 'errorUnmanagedConflict',
    })
  })

  it('requires uninstall selection, suppresses duplicates, and refreshes on success', async () => {
    const pending = deferred<Awaited<ReturnType<SkillMarketRemote['uninstall']>>>()
    const made = fakeRemote({ uninstall: vi.fn(() => pending.promise) })
    const store = new SkillMarketStore(made.remote)
    store.requestUninstall(id('pdf-tools'))
    const first = store.confirmUninstall()
    const duplicate = store.confirmUninstall()
    expect(made.remote.uninstall).toHaveBeenCalledTimes(1)
    await duplicate
    pending.resolve(businessOk({ skillId: id('pdf-tools') }))
    await first
    expect(store.store.getSnapshot()).toMatchObject({
      pendingUninstall: null,
      uninstalling: null,
      uninstallError: null,
    })
  })

  it('loads validated banners once and releases image data after uninstall', async () => {
    const made = fakeRemote()
    const store = new SkillMarketStore(made.remote)
    await Promise.all([store.loadBanner(id('pdf-tools')), store.loadBanner(id('pdf-tools'))])
    expect(made.remote.banner).toHaveBeenCalledTimes(1)
    expect(store.store.getSnapshot().banners['pdf-tools']).toBe('data:image/png;base64,AAA')
    store.requestUninstall(id('pdf-tools'))
    await store.confirmUninstall()
    expect(store.store.getSnapshot().banners['pdf-tools']).toBeUndefined()
  })

  it('ignores pending inventory and banner responses after disposal and releases data', async () => {
    const list = deferred<Awaited<ReturnType<SkillMarketRemote['list']>>>()
    const banner = deferred<Awaited<ReturnType<SkillMarketRemote['banner']>>>()
    const store = new SkillMarketStore(fakeRemote({
      list: vi.fn(() => list.promise),
      banner: vi.fn(() => banner.promise),
    }).remote)
    const loading = store.load()
    const image = store.loadBanner(id('pdf-tools'))
    store.dispose()
    list.resolve(businessOk({ entries: [entry()] }))
    banner.resolve(businessOk({ skillId: id('pdf-tools'), mediaType: 'image/png', dataBase64: 'AAA' }))
    await Promise.all([loading, image])
    expect(store.store.getSnapshot()).toMatchObject({ skills: [], banners: {}, pendingUpgrade: null })
  })
})
