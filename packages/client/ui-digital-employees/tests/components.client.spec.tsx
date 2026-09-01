// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DigitalEmployeeWorkspace } from '../src/client/DigitalEmployeeWorkspace.tsx'

afterEach(cleanup)

describe('DigitalEmployeeWorkspace', () => {
  it('renders operational views and requests confirmed deletion', () => {
    const controller = {
      load: vi.fn(),
      loadAssets: vi.fn(() => Promise.resolve()),
      select: vi.fn(),
      setView: vi.fn(),
      requestDelete: vi.fn(),
    }
    const startChat = vi.fn()
    const state = {
      status: 'ready',
      error: null,
      templates: [],
      employees: [{
        id: 'employee-1',
        displayName: 'Release Engineer',
        state: 'active',
        templateId: 'template-1',
        templateVersion: '1.0.0',
        grants: { skills: ['release'], tools: ['bash'], mcpServers: [], experts: ['reviewer'], allowSubagents: true },
      }],
      selectedId: 'employee-1',
      detail: {
        id: 'employee-1',
        displayName: 'Release Engineer',
        state: 'active',
        templateId: 'template-1',
        templateVersion: '1.0.0',
        grants: { skills: ['release'], tools: ['bash'], mcpServers: [], experts: ['reviewer'], allowSubagents: true },
      },
      memories: [],
      experts: [],
      taskTree: [],
      audit: [],
      view: 'overview',
      busy: null,
      confirmation: null,
    }
    const useSnapshot = (selector: (value: typeof state) => unknown) => selector(state)
    const result = render(
      <DigitalEmployeeWorkspace
        controller={controller as never}
        useSnapshot={useSnapshot as never}
        close={vi.fn()}
        startChat={startChat}
      />,
    )

    expect(result.getByRole('heading', { name: 'Release Engineer' })).toBeTruthy()
    for (const name of ['Overview', 'Capabilities', 'Experts', 'Memory', 'Task tree', 'Audit']) {
      expect(result.getByRole('tab', { name })).toBeTruthy()
    }
    fireEvent.click(result.getByRole('button', { name: 'Delete employee' }))
    expect(controller.requestDelete).toHaveBeenCalledOnce()
    fireEvent.click(result.getByRole('button', { name: 'Start chat' }))
    expect(startChat).toHaveBeenCalledWith('employee-1')
  })

  it('shows independent permission sets and manages active expert work inline', () => {
    const controller = {
      load: vi.fn(),
      select: vi.fn(),
      setView: vi.fn(),
      interrupt: vi.fn(),
      continueExpert: vi.fn(),
    }
    const state = {
      status: 'ready',
      error: null,
      templates: [],
      employees: [
        {
          id: 'employee-1',
          displayName: 'Release Engineer',
          state: 'active',
          templateId: 'template-1',
          templateVersion: '1.0.0',
          grants: { skills: ['release'], tools: ['bash'], mcpServers: [], experts: ['reviewer'], allowSubagents: true },
        },
        {
          id: 'employee-2',
          displayName: 'Read-only Auditor',
          state: 'active',
          templateId: 'template-1',
          templateVersion: '1.0.0',
          grants: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
        },
      ],
      selectedId: 'employee-1',
      detail: {
        id: 'employee-1',
        displayName: 'Release Engineer',
        state: 'active',
        templateId: 'template-1',
        templateVersion: '1.0.0',
        grants: { skills: ['release'], tools: ['bash'], mcpServers: [], experts: ['reviewer'], allowSubagents: true },
      },
      memories: [],
      experts: [],
      taskTree: [{
        kind: 'child',
        id: 'expert-session-1',
        parentId: 'employee-session-1',
        mode: 'continuable',
        activity: 'running',
      }],
      audit: [],
      view: 'tasks',
      busy: null,
      confirmation: null,
      exported: null,
    }
    const useSnapshot = (selector: (value: typeof state) => unknown) => selector(state)
    const result = render(
      <DigitalEmployeeWorkspace
        controller={controller as never}
        useSnapshot={useSnapshot as never}
        close={vi.fn()}
        startChat={vi.fn()}
      />,
    )

    expect(result.getByRole('button', { name: /^Read-only Auditor/ })).toBeTruthy()
    fireEvent.click(result.getByRole('button', { name: /^Read-only Auditor/ }))
    expect(controller.select).toHaveBeenCalledWith('employee-2')

    fireEvent.click(result.getByRole('button', { name: 'Interrupt expert-session-1' }))
    expect(controller.interrupt).toHaveBeenCalledWith('employee-session-1', 'expert-session-1')

    const followUp = result.getByRole('textbox', { name: 'Follow up with expert-session-1' })
    fireEvent.change(followUp, { target: { value: 'Check the release notes too.' } })
    fireEvent.click(result.getByRole('button', { name: 'Continue expert-session-1' }))
    expect(controller.continueExpert).toHaveBeenCalledWith(
      'employee-session-1',
      'expert-session-1',
      'Check the release notes too.',
    )
  })

  it('covers upgrade approval, redacted export display, and destructive cleanup confirmation', () => {
    const controller = {
      load: vi.fn(),
      setView: vi.fn(),
      approveUpgrade: vi.fn(),
      confirm: vi.fn(),
      cancelConfirmation: vi.fn(),
    }
    const base = {
      status: 'ready',
      error: null,
      templates: [],
      employees: [],
      selectedId: 'employee-1',
      detail: {
        id: 'employee-1',
        displayName: 'Release Engineer',
        state: 'active',
        templateId: 'template-1',
        templateVersion: '1.0.0',
        grants: { skills: [], tools: ['bash'], mcpServers: [], experts: [], allowSubagents: false },
      },
      memories: [],
      experts: [],
      taskTree: [],
      audit: [],
      view: 'overview',
      busy: null,
      exported: {
        formatVersion: 1,
        employee: {
          templateId: 'template-1',
          templateVersion: '1.0.0',
          displayName: 'Release Engineer',
          grants: { skills: [], tools: ['bash'], mcpServers: [], experts: [], allowSubagents: false },
        },
      },
    }
    const upgradeState = {
      ...base,
      confirmation: {
        kind: 'upgrade',
        preview: {
          currentVersion: '1.0.0',
          targetVersion: '2.0.0',
          addedCapabilities: {
            skills: ['release'],
            tools: [],
            mcpServers: ['deploy'],
            experts: ['reviewer'],
            allowSubagents: true,
          },
        },
        approvedCapabilities: {
          skills: [],
          tools: [],
          mcpServers: [],
          experts: [],
          allowSubagents: false,
        },
      },
    }
    const result = render(
      <DigitalEmployeeWorkspace
        controller={controller as never}
        useSnapshot={((selector: (value: typeof upgradeState) => unknown) => selector(upgradeState)) as never}
        close={vi.fn()}
        startChat={vi.fn()}
      />,
    )

    expect(result.queryByText(/credential/i)).toBeNull()
    expect(result.getByText('"formatVersion": 1', { exact: false })).toBeTruthy()
    fireEvent.click(result.getByRole('checkbox', { name: 'Approve all newly requested capabilities' }))
    expect(controller.approveUpgrade).toHaveBeenCalledWith(upgradeState.confirmation.preview.addedCapabilities)
    fireEvent.click(result.getByRole('button', { name: 'Apply upgrade' }))
    expect(controller.confirm).toHaveBeenCalledOnce()

    result.rerender(
      <DigitalEmployeeWorkspace
        controller={controller as never}
        useSnapshot={((selector: (value: typeof base & { confirmation: { kind: 'delete' } }) => unknown) => selector({
          ...base,
          confirmation: { kind: 'delete' },
        })) as never}
        close={vi.fn()}
        startChat={vi.fn()}
      />,
    )
    expect(result.getByText('Active work and connections will be stopped before employee data is removed.')).toBeTruthy()
    const dialog = result.getByRole('dialog', { name: 'Delete digital employee?' })
    fireEvent.click(dialog.querySelectorAll('button')[1] as HTMLButtonElement)
    expect(controller.confirm).toHaveBeenCalledTimes(2)
  })

  it('does not offer an enabled Start chat action for an inactive employee', () => {
    const state = {
      status: 'ready',
      error: null,
      templates: [],
      employees: [],
      selectedId: 'employee-1',
      detail: {
        id: 'employee-1',
        displayName: 'Paused operator',
        state: 'inactive',
        templateId: 'template-1',
        templateVersion: '1.0.0',
        grants: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
      },
      memories: [],
      experts: [],
      taskTree: [],
      audit: [],
      view: 'overview',
      busy: null,
      confirmation: null,
      exported: null,
    }
    const result = render(
      <DigitalEmployeeWorkspace
        controller={{
          load: vi.fn(),
          setView: vi.fn(),
        } as never}
        useSnapshot={((selector: (value: typeof state) => unknown) => selector(state)) as never}
        close={vi.fn()}
        startChat={vi.fn()}
      />,
    )

    expect((result.getByRole('button', { name: 'Start chat' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders configuration controls only when the administrator studio is ready', () => {
    const state = {
      status: 'ready',
      error: null,
      templates: [],
      employees: [],
      selectedId: null,
      detail: null,
      memories: [],
      experts: [],
      taskTree: [],
      audit: [],
      view: 'overview',
      busy: null,
      confirmation: null,
      exported: null,
    }
    const configuration = {
      load: vi.fn(),
      loadAssets: vi.fn(() => Promise.resolve()),
      create: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
      validate: vi.fn(() => Promise.resolve()),
      preview: vi.fn(() => Promise.resolve()),
      disposePreview: vi.fn(() => Promise.resolve()),
      publish: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
    }
    const configurationState = {
      status: 'ready',
      error: null,
      drafts: [{
        id: 'draft-1',
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery.' },
        instructions: 'Coordinate delivery.',
        personality: 'Helpful.',
        preset: 'headless',
        capabilities: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
        mcpServers: [], memorySeeds: [],
        experts: [],
        delegation: { maxDepth: 0, maxConcurrency: 1, timeoutMs: 30_000 },
        revision: 1,
      }],
      publications: [],
      diagnostics: { 'draft-1': [] },
      preview: null,
      assets: [
        {
          id: 'skill:release-notes',
          kind: 'skill',
          label: 'release-notes',
          description: 'Prepare release notes.',
          available: true,
          source: 'skill-market',
          version: '1.4.0',
          publisher: 'Release Team',
          tags: ['release', 'writing'],
          managedByMarket: true,
          permissionSummary: [],
          restartRequired: false,
        },
        {
          id: 'skill:local-planning',
          kind: 'skill',
          label: 'local-planning',
          description: 'Plan local work.',
          available: true,
          source: 'skill-registry',
          managedByMarket: false,
          permissionSummary: [],
          restartRequired: false,
        },
        {
          id: 'skill:installed-inactive',
          kind: 'skill',
          label: 'installed-inactive',
          description: 'Installed skill awaiting activation.',
          available: false,
          source: 'skill-market',
          version: '2.0.0',
          publisher: 'Planning Team',
          tags: ['planning'],
          managedByMarket: true,
          permissionSummary: [],
          restartRequired: true,
          diagnostic: 'Restart the Host to activate this installed Skill.',
        },
        {
          id: 'tool:workspace_lookup',
          kind: 'tool',
          label: 'workspace_lookup',
          description: 'Inspect a workspace.',
          available: true,
          source: 'tool-registry',
          permissionSummary: [],
          restartRequired: false,
        },
        {
          id: 'mcp:project-tracker',
          kind: 'mcp',
          label: 'project-tracker',
          available: true,
          source: 'mcp-registry',
          permissionSummary: [],
          restartRequired: false,
        },
      ],
      assetStatus: 'ready',
      assetError: null,
      assetPreset: 'headless',
    }
    const controller = { load: vi.fn(), loadRoster: vi.fn(), setView: vi.fn() }
    const result = render(
      <DigitalEmployeeWorkspace
        controller={controller as never}
        configurationStudio={configuration as never}
        previewWorkspace={() => 'workspace-1'}
        useSnapshot={((selector: (value: typeof state) => unknown) => selector(state)) as never}
        useConfigurationSnapshot={((selector: (value: typeof configurationState) => unknown) => selector(configurationState)) as never}
        close={vi.fn()}
        startChat={vi.fn()}
      />,
    )

    expect(result.getByRole('tab', { name: 'Employee operations' })).toBeTruthy()
    fireEvent.click(result.getByRole('tab', { name: 'Template configuration' }))
    expect(result.getByRole('region', { name: 'Template configuration' })).toBeTruthy()
    fireEvent.click(result.getByRole('tab', { name: 'Employee operations' }))
    expect(controller.loadRoster).toHaveBeenCalledOnce()
    fireEvent.click(result.getByRole('tab', { name: 'Template configuration' }))
    expect(result.getByRole('button', { name: 'Create draft' })).toBeTruthy()
    expect(result.getByRole('button', { name: 'Validate' })).toBeTruthy()
    expect(result.getByRole('button', { name: 'Publish' })).toBeTruthy()
    fireEvent.click(result.getByRole('button', { name: 'Edit' }))
    expect(result.getByText('Marketplace · 1.4.0 · Release Team')).toBeTruthy()
    expect(result.getByText('release · writing')).toBeTruthy()
    expect(result.getByText('Local skill')).toBeTruthy()
    expect(result.getByText('Restart the Host to activate this installed Skill.')).toBeTruthy()
    expect((result.getByRole('checkbox', { name: 'installed-inactive' }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(result.getByRole('checkbox', { name: 'release-notes' }))
    fireEvent.click(result.getByRole('checkbox', { name: 'local-planning' }))
    fireEvent.click(result.getByRole('checkbox', { name: 'workspace_lookup' }))
    fireEvent.click(result.getByRole('checkbox', { name: 'project-tracker' }))
    fireEvent.change(result.getByRole('textbox', { name: 'Search skills' }), { target: { value: 'unknown' } })
    expect(result.queryByRole('checkbox', { name: 'unknown' })).toBeNull()
    fireEvent.change(result.getByRole('textbox', { name: 'Edit template personality' }), {
      target: { value: 'Direct and practical.' },
    })
    fireEvent.click(result.getByRole('button', { name: 'Save draft' }))
    expect(configuration.update).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft-1',
      revision: 1,
      patch: expect.objectContaining({
        personality: 'Direct and practical.',
        capabilities: expect.objectContaining({
          skills: ['release-notes', 'local-planning'],
          tools: ['workspace_lookup'],
          mcpServers: ['project-tracker'],
        }),
      }),
    }))
  })

  it('allows unavailable selections to be removed but prevents new unavailable MCP selections', () => {
    const state = {
      status: 'ready',
      error: null,
      templates: [],
      employees: [],
      selectedId: null,
      detail: null,
      memories: [],
      experts: [],
      taskTree: [],
      audit: [],
      view: 'overview',
      busy: null,
      confirmation: null,
      exported: null,
    }
    const update = vi.fn(() => Promise.resolve())
    const configuration = {
      load: vi.fn(),
      loadAssets: vi.fn(() => Promise.resolve()),
      update,
      validate: vi.fn(),
      preview: vi.fn(),
      publish: vi.fn(),
      delete: vi.fn(),
    }
    const configurationState = {
      status: 'ready',
      error: null,
      drafts: [{
        id: 'draft-1',
        templateId: 'operations-assistant',
        display: { name: 'Operations Assistant', description: 'Coordinates delivery.' },
        instructions: 'Coordinate delivery.',
        personality: 'Helpful.',
        preset: 'headless',
        capabilities: {
          skills: ['retired-skill'],
          tools: ['missing-tool'],
          mcpServers: [],
          experts: [],
          allowSubagents: false,
        },
        mcpServers: [],
        memorySeeds: [],
        experts: [],
        delegation: { maxDepth: 0, maxConcurrency: 1, timeoutMs: 30_000 },
        revision: 1,
      }],
      publications: [],
      diagnostics: { 'draft-1': [] },
      preview: null,
      assets: [
        {
          id: 'skill:retired-skill',
          kind: 'skill',
          label: 'retired-skill',
          available: false,
          source: 'skill-registry',
          permissionSummary: [],
          restartRequired: false,
          diagnostic: 'Skill is no longer installed.',
        },
        {
          id: 'mcp:static-server',
          kind: 'mcp',
          label: 'static-server',
          available: false,
          source: 'mcp-registry',
          permissionSummary: [],
          restartRequired: false,
          diagnostic: 'This MCP client cannot be published safely.',
        },
      ],
    }
    const result = render(
      <DigitalEmployeeWorkspace
        controller={{ load: vi.fn(), setView: vi.fn() } as never}
        configurationStudio={configuration as never}
        useSnapshot={((selector: (value: typeof state) => unknown) => selector(state)) as never}
        useConfigurationSnapshot={((selector: (value: typeof configurationState) => unknown) =>
          selector(configurationState)) as never}
        close={vi.fn()}
        startChat={vi.fn()}
      />,
    )

    fireEvent.click(result.getByRole('tab', { name: 'Template configuration' }))
    fireEvent.click(result.getByRole('button', { name: 'Edit' }))

    const retiredSkill = result.getByRole('checkbox', { name: 'retired-skill' }) as HTMLInputElement
    expect(retiredSkill.checked).toBe(true)
    expect(retiredSkill.disabled).toBe(false)
    fireEvent.click(retiredSkill)

    const staticMcp = result.getByRole('checkbox', { name: 'static-server' }) as HTMLInputElement
    expect(staticMcp.checked).toBe(false)
    expect(staticMcp.disabled).toBe(true)

    fireEvent.click(result.getByRole('button', { name: 'Remove' }))
    fireEvent.click(result.getByRole('button', { name: 'Save draft' }))

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      patch: expect.objectContaining({
        capabilities: expect.objectContaining({
          skills: [],
          tools: [],
          mcpServers: [],
        }),
      }),
    }))
  })

  it('explains why template configuration is unavailable instead of rendering a blank page', () => {
    const state = {
      status: 'ready',
      error: null,
      templates: [],
      employees: [],
      selectedId: null,
      detail: null,
      memories: [],
      experts: [],
      taskTree: [],
      audit: [],
      view: 'overview',
      busy: null,
      confirmation: null,
      exported: null,
    }
    const configuration = { load: vi.fn() }
    const configurationState = {
      status: 'error',
      error: 'digital employee configuration administrator mode is disabled',
      drafts: [],
      publications: [],
      preview: null,
      diagnostics: {},
      assets: [],
      assetStatus: 'error',
      assetError: 'digital employee configuration administrator mode is disabled',
      assetPreset: null,
    }
    const result = render(
      <DigitalEmployeeWorkspace
        controller={{ load: vi.fn(), setView: vi.fn() } as never}
        configurationStudio={configuration as never}
        useSnapshot={((selector: (value: typeof state) => unknown) => selector(state)) as never}
        useConfigurationSnapshot={((selector: (value: typeof configurationState) => unknown) => selector(configurationState)) as never}
        close={vi.fn()}
        startChat={vi.fn()}
      />,
    )

    fireEvent.click(result.getByRole('tab', { name: 'Template configuration' }))
    expect(result.getByRole('region', { name: 'Template configuration' })).toBeTruthy()
    expect(result.getByRole('alert').textContent).toContain('administrator mode is disabled')
  })
})
