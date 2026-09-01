// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { SkillMarketSection } from '../src/client/SkillMarketSection.tsx'
import type { SkillMarketSectionProps } from '../src/client/SkillMarketSection.tsx'
import { McpMarketStore, ToolMarketStore } from '../src/client/package-stores.ts'
import { SkillMarketStore } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function setup() {
  const skill = new SkillMarketStore({
    list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [] } } })),
  } as never)
  const toolRemote = {
    list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [{
      packageId: 'release-notes',
      displayName: 'Release notes',
      description: 'Prepare release notes.',
      version: '1.0.0',
      publisherId: 'deepseek-local',
      permissions: ['filesystem-read', 'subprocess'],
      tools: [{
        name: 'release_notes',
        description: 'Prepare notes.',
        inputDescription: 'Repository path and release range.',
        available: false,
      }],
      installedAt: 1,
      available: false,
      restartRequired: true,
    }] } } })),
    install: vi.fn(),
    uninstall: vi.fn(async request => ({
      ok: true, value: { ok: true, value: { ...request, restartRequired: true } },
    })),
  }
  const tool = new ToolMarketStore(toolRemote as never)
  const mcpRemote = {
    list: vi.fn(async () => ({ ok: true, value: { ok: true, value: { entries: [{
      packageId: 'project-tracker',
      displayName: 'Project tracker',
      description: 'Read project tickets.',
      version: '1.0.0',
      publisherId: 'deepseek-local',
      servers: [{ serverName: 'project-tracker', transport: 'streamable-http', available: false }],
      credentialRequirements: [{
        slot: 'PROJECT_TRACKER_TOKEN',
        configured: false,
        source: 'User credentials',
      }],
      installedAt: 1,
      configured: false,
      available: false,
      restartRequired: true,
    }] } } })),
    install: vi.fn(),
    uninstall: vi.fn(),
    configure: vi.fn(async request => ({
      ok: true, value: { ok: true, value: { ...request, restartRequired: true } },
    })),
  }
  const mcp = new McpMarketStore(mcpRemote as never)
  const props: SkillMarketSectionProps = {
    controller: skill,
    toolController: tool,
    mcpController: mcp,
    hooks: {
      snapshot: skill.store,
      toolSnapshot: tool.store,
      mcpSnapshot: mcp.store,
    },
    useSnapshot: bindSnapshotSelector(skill.store),
    useToolSnapshot: bindSnapshotSelector(tool.store),
    useMcpSnapshot: bindSnapshotSelector(mcp.store),
    t: key => en[key],
  } as SkillMarketSectionProps
  render(<SkillMarketSection {...props} />)
  return { toolRemote, mcpRemote }
}

describe('unified Marketplace section', () => {
  it('distinguishes author templates from directly installable examples', async () => {
    setup()
    expect(screen.getByRole('link', { name: en.installableExampleDownload }).getAttribute('href'))
      .toBe('/marketplace-test-skill.zip')

    fireEvent.click(screen.getByRole('tab', { name: en.toolTab }))
    expect(screen.getByRole('link', { name: en.authorTemplateDownload }).getAttribute('href'))
      .toBe('/tool-market-template.zip')
    expect(screen.getByRole('link', { name: en.installableExampleDownload }).getAttribute('href'))
      .toBe('/marketplace-test-tool.zip')

    fireEvent.click(screen.getByRole('tab', { name: en.mcpTab }))
    expect(screen.getByRole('link', { name: en.authorTemplateDownload }).getAttribute('href'))
      .toBe('/mcp-market-template.zip')
    expect(screen.getByRole('link', { name: en.installableExampleDownload }).getAttribute('href'))
      .toBe('/marketplace-test-mcp.zip')
  })

  it('shows Tool permissions, search, restart state, and uninstall confirmation', async () => {
    const { toolRemote } = setup()
    fireEvent.click(screen.getByRole('tab', { name: en.toolTab }))
    await screen.findByText('Release notes')
    expect(screen.getByText('filesystem-read')).toBeTruthy()
    expect(screen.getByText('subprocess')).toBeTruthy()
    expect(screen.getByText(/Repository path and release range/)).toBeTruthy()
    expect(screen.getByText(en.restartRequired)).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: en.toolSearchLabel }), {
      target: { value: 'missing' },
    })
    expect(await screen.findByText(en.toolEmptyFiltered)).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: en.toolSearchLabel }), {
      target: { value: 'release' },
    })
    fireEvent.click(await screen.findByRole('button', { name: `${en.uninstall}: Release notes` }))
    const dialog = await screen.findByRole('dialog', { name: en.packageUninstallTitle })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: en.uninstallConfirm }))
    })
    await waitFor(() => { expect(toolRemote.uninstall).toHaveBeenCalledWith({ packageId: 'release-notes' }) })
    expect(await screen.findByText(en.restartNotice)).toBeTruthy()
  })

  it('edits and submits MCP credential references without password fields or secret rendering', async () => {
    const { mcpRemote } = setup()
    fireEvent.click(screen.getByRole('tab', { name: en.mcpTab }))
    await screen.findByText('Project tracker')
    const reference = screen.getByRole('textbox', {
      name: `${en.credentialReferenceLabel}: PROJECT_TRACKER_TOKEN`,
    })
    expect(reference.getAttribute('type')).toBe('text')
    fireEvent.change(reference, { target: { value: 'PROJECT_TRACKER_TOKEN' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: en.saveReferences }))
    })
    await waitFor(() => {
      expect(mcpRemote.configure).toHaveBeenCalledWith({
        packageId: 'project-tracker',
        credentialReferences: { PROJECT_TRACKER_TOKEN: 'PROJECT_TRACKER_TOKEN' },
      })
    })
    expect(document.body.textContent).not.toContain('resolved-secret')
    expect(await screen.findByText(en.restartNotice)).toBeTruthy()
  })
})
