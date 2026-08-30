// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DigitalEmployeeWorkspace } from '../src/client/DigitalEmployeeWorkspace.tsx'

afterEach(cleanup)

describe('DigitalEmployeeWorkspace', () => {
  it('renders operational views and requests confirmed deletion', () => {
    const controller = {
      load: vi.fn(),
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
})
