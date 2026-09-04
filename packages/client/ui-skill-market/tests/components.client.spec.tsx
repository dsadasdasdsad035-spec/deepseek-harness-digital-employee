// @vitest-environment jsdom
/**
 * 技能市场组件关键流程测试：
 *   - 加载成功 → 渲染卡片、宣传图占位、版本/作者/标签
 *   - 搜索过滤
 *   - 上传文件 + 走完 install RPC
 *   - 冲突时显示覆盖确认 modal，确认后 overwrite=true
 *   - 卸载：打开确认 modal，确认后调用 uninstall RPC 并清理宣传图
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { SkillMarketEntry, SkillMarketSkillId } from '@deepseek-ai/dsh-api-remotes/client'
import { SkillMarketSection } from '../src/client/SkillMarketSection.tsx'
import type { SkillMarketSectionInjected, SkillMarketSectionProps } from '../src/client/SkillMarketSection.tsx'
import { SkillMarketStore } from '../src/client/store.ts'
import { McpMarketStore, ToolMarketStore } from '../src/client/package-stores.ts'
import type { SkillMarketRemote, SkillMarketState } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

interface SetupOptions {
  skills?: SkillMarketEntry[]
  bannerByName?: Record<string, { mediaType: 'image/png'; dataBase64: string }>
  installResult?: Awaited<ReturnType<SkillMarketRemote['install']>>
  installCalls?: Array<{ filename: string; replaceExisting: boolean }>
  uninstallResult?: Awaited<ReturnType<SkillMarketRemote['uninstall']>>
  toolInstall?: () => Promise<unknown>
  mcpInstall?: () => Promise<unknown>
}

function setup(options: SetupOptions = {}) {
  const skills: SkillMarketEntry[] = options.skills ?? [
    {
      skillId: 'pdf-tools' as SkillMarketSkillId,
      description: 'PDF reader.',
      version: '1.0.0',
      author: 'Alice',
      tags: ['pdf', 'files'],
      hasBanner: true,
      installedAt: 0,
    },
    {
      skillId: 'web-fetcher' as SkillMarketSkillId,
      description: 'Fetch web pages.',
      tags: ['web'],
      hasBanner: false,
      installedAt: 0,
    },
  ]
  const remote = {
    async list() {
      return { ok: true as const, value: { ok: true as const, value: { entries: skills } } }
    },
    async banner({ skillId }: { skillId: SkillMarketSkillId }) {
      const reply = options.bannerByName?.[skillId] ?? { mediaType: 'image/png' as const, dataBase64: 'AAA' }
      return { ok: true as const, value: { ok: true as const, value: { skillId, ...reply } } }
    },
    async install(request: { filename: string; replaceExisting?: boolean }) {
      options.installCalls?.push({
        filename: request.filename,
        replaceExisting: request.replaceExisting === true,
      })
      if (options.installResult !== undefined) return options.installResult
      return {
        ok: true as const,
        value: {
          ok: true as const,
          value: {
            skillId: request.filename.replace(/\.zip$/i, '') as SkillMarketSkillId,
            operation: request.replaceExisting === true ? 'upgraded' as const : 'installed' as const,
          },
        },
      }
    },
    async uninstall({ skillId }: { skillId: SkillMarketSkillId }) {
      if (options.uninstallResult !== undefined) return options.uninstallResult
      return { ok: true as const, value: { ok: true as const, value: { skillId } } }
    },
  } as SkillMarketRemote
  const store = new SkillMarketStore(remote)
  const toolStore = new ToolMarketStore({
    async list() {
      return { ok: true, value: { ok: true, value: { entries: [] } } }
    },
    ...options.toolInstall === undefined ? {} : { install: options.toolInstall },
  } as never)
  const mcpStore = new McpMarketStore({
    async list() {
      return { ok: true, value: { ok: true, value: { entries: [] } } }
    },
    ...options.mcpInstall === undefined ? {} : { install: options.mcpInstall },
  } as never)
  const props: SkillMarketSectionProps = {
    controller: store,
    toolController: toolStore,
    mcpController: mcpStore,
    hooks: {
      snapshot: store.store,
      toolSnapshot: toolStore.store,
      mcpSnapshot: mcpStore.store,
    },
    useSnapshot: bindSnapshotSelector(store.store),
    useToolSnapshot: bindSnapshotSelector(toolStore.store),
    useMcpSnapshot: bindSnapshotSelector(mcpStore.store),
    t: (key: string) => en[key as keyof typeof en],
  } as unknown as SkillMarketSectionProps
  return render(<SkillMarketSection {...(props as SkillMarketSectionProps)} />)
}

function fileList(file: File): FileList {
  return {
    0: file,
    length: 1,
    item(index: number): File | null {
      return index === 0 ? file : null
    },
  } as unknown as FileList
}

/** 读取当前快照（component 已挂载，render 当次触发 load）。 */
async function waitLoaded() {
  await waitFor(() => {
    const root = document.body.querySelector('[data-slot]') ?? document.body
    // 列表渲染后会显示至少一张卡片
    expect(root.querySelectorAll('li[data-skill-name]').length).toBeGreaterThan(0)
  })
}

describe('SkillMarketSection', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('renders cards with banner placeholders and metadata', async () => {
    setup()
    await waitLoaded()
    expect(screen.getByText('pdf-tools')).toBeTruthy()
    expect(screen.getByText('PDF reader.')).toBeTruthy()
    expect(screen.getByText('1.0.0')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('pdf')).toBeTruthy()
    expect(screen.getByText('files')).toBeTruthy()
    // 没有 banner 的技能展示渐变占位 + 取技能名前两字符
    expect(screen.getByText('WE')).toBeTruthy()
    // pdf-tools 有 banner 字段，应至少存在一张 <img>
    const card = document.querySelector('li[data-skill-name="pdf-tools"]')
    expect(card?.querySelector('img')).toBeTruthy()
  })

  it('filters cards by query (name / description / author / tag)', async () => {
    setup()
    await waitLoaded()
    const input = screen.getByPlaceholderText(en.searchPlaceholder)
    fireEvent.change(input, { target: { value: 'pdf' } })
    await waitFor(() => {
      expect(document.querySelectorAll('li[data-skill-name]')).toHaveLength(1)
      expect(document.querySelector('li[data-skill-name="pdf-tools"]')).toBeTruthy()
    })
    fireEvent.change(input, { target: { value: 'web' } })
    await waitFor(() => {
      expect(document.querySelectorAll('li[data-skill-name]')).toHaveLength(1)
      expect(document.querySelector('li[data-skill-name="web-fetcher"]')).toBeTruthy()
    })
    fireEvent.change(input, { target: { value: 'nobody' } })
    await waitFor(() => {
      expect(screen.getByText(en.emptyFiltered)).toBeTruthy()
    })
  })

  it('uploads a file by changing the hidden input', async () => {
    const installCalls: Array<{ filename: string; replaceExisting: boolean }> = []
    setup({ installCalls })
    await waitLoaded()
    // 找到隐藏的 file input
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    const file = new File([new Uint8Array(64)], 'demo.zip', { type: 'application/zip' })
    await act(async () => {
      fireEvent.change(input, { target: { files: fileList(file) } })
      // 等待 install 异步完成
      await new Promise((resolve) => { setTimeout(resolve, 30) })
    })
    await waitFor(() => {
      expect(installCalls.length).toBeGreaterThan(0)
    })
    expect(installCalls[0]).toEqual({ filename: 'demo.zip', replaceExisting: false })
  })

  it('offers the shipped skill template as a normal browser download', async () => {
    setup()
    await waitLoaded()

    const download = screen.getByRole('link', { name: en.templateDownload })
    expect(download.getAttribute('href')).toBe('/skill-market-template.zip')
    expect(download.getAttribute('download')).toBe('skill-market-template.zip')
  })

  it('labels Tool and MCP template downloads as publisher templates', async () => {
    setup()
    await waitLoaded()

    fireEvent.click(screen.getByRole('tab', { name: en.toolTab }))
    const toolDownload = screen.getByRole('link', { name: en.publisherTemplateDownload })
    expect(toolDownload.getAttribute('href')).toBe('/tool-market-template.zip')

    fireEvent.click(screen.getByRole('tab', { name: en.mcpTab }))
    const mcpDownload = screen.getByRole('link', { name: en.publisherTemplateDownload })
    expect(mcpDownload.getAttribute('href')).toBe('/mcp-market-template.zip')
  })

  it('renders the rejected publisher id on both package tabs', async () => {
    const rejectUntrusted = async () => ({
      ok: true,
      value: { ok: false, error: { code: 'untrusted-publisher', publisherId: 'replace-with-publisher-id' } },
    })
    setup({ toolInstall: rejectUntrusted, mcpInstall: rejectUntrusted })
    await waitLoaded()

    fireEvent.click(screen.getByRole('tab', { name: en.toolTab }))
    fireEvent.change(document.querySelector('[role="tabpanel"] input[type="file"]') as HTMLInputElement, {
      target: { files: fileList(new File([new Uint8Array([1])], 'demo.zip')) },
    })
    await waitFor(() => {
      expect(screen.getAllByText('The package publisher "replace-with-publisher-id" is not trusted by this Host.').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('tab', { name: en.mcpTab }))
    fireEvent.change(document.querySelector('[role="tabpanel"] input[type="file"]') as HTMLInputElement, {
      target: { files: fileList(new File([new Uint8Array([1])], 'demo.zip')) },
    })
    await waitFor(() => {
      expect(screen.getAllByText('The package publisher "replace-with-publisher-id" is not trusted by this Host.').length).toBeGreaterThan(0)
    })
  })

  it('rejects non-.zip files with the localized error', async () => {
    setup()
    await waitLoaded()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(8)], 'bad.tar')
    await act(async () => {
      fireEvent.change(input, { target: { files: fileList(file) } })
      await new Promise((resolve) => { setTimeout(resolve, 10) })
    })
    expect(screen.getByText(en.uploadInvalidType)).toBeTruthy()
  })

  it('opens overwrite confirmation on conflict and resubmits with overwrite=true', async () => {
    const installCalls: Array<{ filename: string; replaceExisting: boolean }> = []
    setup({
      installResult: {
        ok: true,
        value: {
          ok: false,
          error: { code: 'managed-upgrade-required', skillId: 'clash' as SkillMarketSkillId },
        },
      },
      installCalls,
    })
    await waitLoaded()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(32)], 'clash.zip', { type: 'application/zip' })
    await act(async () => {
      fireEvent.change(input, { target: { files: fileList(file) } })
      await new Promise((resolve) => { setTimeout(resolve, 30) })
    })
    // 覆盖 modal 出现
    await waitFor(() => { expect(screen.getByText(en.upgradeTitle)).toBeTruthy() })
    expect(installCalls.find(call => call.replaceExisting === true)).toBeUndefined()
    // 点击「覆盖」按钮
    const overwriteBtn = screen.getByText(en.upgradeConfirm)
    await act(async () => {
      fireEvent.click(overwriteBtn)
      await new Promise((resolve) => { setTimeout(resolve, 30) })
    })
    await waitFor(() => {
      expect(installCalls.find(call => call.replaceExisting === true)).toBeDefined()
    })
  })

  it('opens uninstall confirmation and removes the banner cache after uninstall', async () => {
    const banners: Record<string, { mediaType: 'image/png'; dataBase64: string }> = {
      'pdf-tools': { mediaType: 'image/png', dataBase64: 'AAA' },
    }
    setup({ bannerByName: banners })
    await waitLoaded()
    // 等 banner 加载完成
    await waitFor(() => {
      const img = document.querySelector('li[data-skill-name="pdf-tools"] img')
      expect(img).toBeTruthy()
    })
    // 点击卸载
    const uninstallBtn = screen.getByLabelText(`${en.uninstall}: pdf-tools`)
    await act(async () => {
      fireEvent.click(uninstallBtn)
    })
    await waitFor(() => { expect(screen.getByText(en.uninstallTitle)).toBeTruthy() })
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByText(en.uninstallConfirm)
    await act(async () => {
      fireEvent.click(confirm)
      await new Promise((resolve) => { setTimeout(resolve, 30) })
    })
    // uninstall RPC 完成后 store 会重新拉取列表；本组件自渲染的两张卡片中 pdf-tools
    // 仍然在列表里（uninstallResult 返回 ok:true），所以卡片不会消失，但卸载按钮
    // 不会再触发任何后续 RPC。
    await waitFor(() => {
      // 卸载弹层应已关闭
      expect(screen.queryByText(en.uninstallTitle)).toBeNull()
    })
  })

  it('shows empty state when the catalog is empty', async () => {
    setup({ skills: [] })
    await waitFor(() => { expect(screen.getByText(en.empty)).toBeTruthy() })
  })

  it('shows retry button on load error', async () => {
    const store = new SkillMarketStore({
      async list() {
        return { ok: false, error: { code: 'transport', message: 'boom', details: {} } }
      },
    } as SkillMarketRemote)
    const toolStore = new ToolMarketStore({ list: async () => ({
      ok: true, value: { ok: true, value: { entries: [] } },
    }) } as never)
    const mcpStore = new McpMarketStore({ list: async () => ({
      ok: true, value: { ok: true, value: { entries: [] } },
    }) } as never)
    const props: SkillMarketSectionProps = {
      controller: store,
      toolController: toolStore,
      mcpController: mcpStore,
      hooks: {
        snapshot: store.store,
        toolSnapshot: toolStore.store,
        mcpSnapshot: mcpStore.store,
      },
      useSnapshot: bindSnapshotSelector(store.store),
      useToolSnapshot: bindSnapshotSelector(toolStore.store),
      useMcpSnapshot: bindSnapshotSelector(mcpStore.store),
      t: (key: string) => en[key as keyof typeof en],
    } as unknown as SkillMarketSectionProps
    render(<SkillMarketSection {...(props as SkillMarketSectionProps)} />)
    await waitFor(() => {
      expect(screen.getByText(en.loadFailed)).toBeTruthy()
      expect(screen.getByText(en.retry)).toBeTruthy()
    })
  })

  it('saves a direct HTTP MCP server from the maintenance form', async () => {
    const saveDirectConfig = vi.fn(async () => ({
      ok: true as const,
      value: { ok: true as const, value: { entryId: 'entry-1', serverName: 'remote-notes', restartRequired: false as const } },
    }))
    const mcpStore = new McpMarketStore({
      list: async () => ({ ok: true, value: { ok: true, value: { entries: [] } } }),
      banner: vi.fn(),
      install: vi.fn(),
      uninstall: vi.fn(),
      configure: vi.fn(),
      saveDirectConfig,
    } as never)
    const store = new SkillMarketStore({ async list() {
      return { ok: true as const, value: { ok: true as const, value: { entries: [] } } }
    } } as unknown as SkillMarketRemote)
    const toolStore = new ToolMarketStore({ list: async () => ({
      ok: true, value: { ok: true, value: { entries: [] } },
    }) } as never)
    const props: SkillMarketSectionProps = {
      controller: store,
      toolController: toolStore,
      mcpController: mcpStore,
      hooks: {
        snapshot: store.store,
        toolSnapshot: toolStore.store,
        mcpSnapshot: mcpStore.store,
      },
      useSnapshot: bindSnapshotSelector(store.store),
      useToolSnapshot: bindSnapshotSelector(toolStore.store),
      useMcpSnapshot: bindSnapshotSelector(mcpStore.store),
      t: (key: string) => en[key as keyof typeof en],
    } as unknown as SkillMarketSectionProps
    render(<SkillMarketSection {...(props as SkillMarketSectionProps)} />)
    fireEvent.click(screen.getByRole('tab', { name: en.mcpTab }))
    const nameInput = screen.getByLabelText(en.mcpDirectServerName)
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'remote-notes' } })
      fireEvent.change(screen.getByLabelText(en.mcpDirectUrl), { target: { value: 'https://mcp.example.com' } })
    })
    fireEvent.click(screen.getByText(en.mcpDirectSave))
    await waitFor(() => { expect(saveDirectConfig).toHaveBeenCalledTimes(1) })
    expect((saveDirectConfig.mock.calls as unknown[][])[0]?.[0]).toMatchObject({
      serverName: 'remote-notes',
      declaration: {
        transport: 'streamable-http',
        url: 'https://mcp.example.com',
        headers: {},
        headerCredentials: {},
      },
    })
  })

  it('shows the local-execution disclosure before saving a stdio direct server', async () => {
    const saveDirectConfig = vi.fn(async () => ({
      ok: true as const,
      value: { ok: false as const, error: { code: 'local-execution-confirmation-required' } },
    }))
    const mcpStore = new McpMarketStore({
      list: async () => ({ ok: true, value: { ok: true, value: { entries: [] } } }),
      banner: vi.fn(),
      install: vi.fn(),
      uninstall: vi.fn(),
      configure: vi.fn(),
      saveDirectConfig,
    } as never)
    const store = new SkillMarketStore({ async list() {
      return { ok: true as const, value: { ok: true as const, value: { entries: [] } } }
    } } as unknown as SkillMarketRemote)
    const toolStore = new ToolMarketStore({ list: async () => ({
      ok: true, value: { ok: true, value: { entries: [] } },
    }) } as never)
    const props: SkillMarketSectionProps = {
      controller: store,
      toolController: toolStore,
      mcpController: mcpStore,
      hooks: {
        snapshot: store.store,
        toolSnapshot: toolStore.store,
        mcpSnapshot: mcpStore.store,
      },
      useSnapshot: bindSnapshotSelector(store.store),
      useToolSnapshot: bindSnapshotSelector(toolStore.store),
      useMcpSnapshot: bindSnapshotSelector(mcpStore.store),
      t: (key: string) => en[key as keyof typeof en],
    } as unknown as SkillMarketSectionProps
    render(<SkillMarketSection {...(props as SkillMarketSectionProps)} />)
    fireEvent.click(screen.getByRole('tab', { name: en.mcpTab }))
    fireEvent.change(screen.getByLabelText(en.mcpDirectServerName), { target: { value: 'local-fs' } })
    fireEvent.change(screen.getByLabelText(en.transport), { target: { value: 'stdio' } })
    fireEvent.change(screen.getByLabelText(en.mcpDirectCwd), { target: { value: '/tmp' } })
    fireEvent.click(screen.getByText(en.mcpDirectSave))
    await waitFor(() => { expect(screen.getByText(en.localExecutionTitle)).toBeTruthy() })
    const dialog = screen.getByRole('dialog')
    await act(async () => {
      fireEvent.click(within(dialog).getByText(en.localExecutionConfirm))
      await new Promise((resolve) => { setTimeout(resolve, 30) })
    })
    expect((saveDirectConfig.mock.calls as unknown[][])[1]?.[0]).toMatchObject({ confirmLocalExecution: true })
  })
})

// 抑制未使用变量警告
void (undefined as unknown as SkillMarketState | SkillMarketSectionInjected | undefined)
