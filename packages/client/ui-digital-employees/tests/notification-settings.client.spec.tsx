// @vitest-environment jsdom
/** The notification settings row: channel states, hide-when-empty, test send feedback. */

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationSettingsRow, type NotificationRowInjected } from '../src/client/NotificationSettingsRow.tsx'

afterEach(cleanup)

const t = (key: string) => ({
  title: 'Notification channels',
  hint: 'hint',
  sendTest: 'Send test',
  sending: 'Sending…',
  sent: 'Delivered',
  failed: 'Failed',
})[key] ?? key


function injected(overrides: Partial<NotificationRowInjected> = {}): NotificationRowInjected {
  return {
    describe: vi.fn(async () => [
      {
        id: 'feishu-bot',
        credentials: [
          { ref: 'DSH_NOTIFY_FEISHU_URL', configured: true },
          { ref: 'DSH_NOTIFY_FEISHU_SECRET', configured: false },
        ],
      },
    ]),
    test: vi.fn(async () => ({ delivered: true })),
    ...overrides,
  }
}

function mount(injectedFace: NotificationRowInjected) {
  const runtime = {
    useSessions: () => null,
    useWorkspaces: () => null,
  } as unknown as Record<string, unknown>
  const face = { ...runtime, ...(injectedFace as unknown as Record<string, unknown>), t }
  return render(createElement(NotificationSettingsRow as unknown as (props: Record<string, unknown>) => import('react').JSX.Element | null, face))
}

describe('NotificationSettingsRow', () => {
  it('renders channel credential states without values and hides when empty', async () => {
    const face = injected()
    const { container } = mount(face)
    await waitFor(() =>{  expect(screen.getByText('feishu-bot')).toBeDefined() })
    expect(container.textContent).toContain('DSH_NOTIFY_FEISHU_URL')
    expect(container.textContent).toContain('DSH_NOTIFY_FEISHU_SECRET')
    expect(container.textContent).toContain('✓ DSH_NOTIFY_FEISHU_URL')
    expect(container.textContent).toContain('○ DSH_NOTIFY_FEISHU_SECRET')
    expect(container.textContent).not.toContain('s3cret')
    expect(screen.getByLabelText('Notification channels')).toBeDefined()

    const empty = injected({ describe: vi.fn(async () => []) })
    const hidden = mount(empty)
    expect(hidden.container.textContent).toBe('')
  })

  it('reports a delivered test send and refreshes the channel states', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce([{ id: 'feishu-bot', credentials: [] }])
      .mockResolvedValueOnce([{ id: 'feishu-bot', credentials: [{ ref: 'DSH_NOTIFY_FEISHU_URL', configured: true }] }])
    const test = vi.fn(async () => ({ delivered: true }))
    const view = mount(injected({ describe, test }))
    await waitFor(() =>{  expect(screen.getByText('Send test')).toBeDefined() })
    fireEvent.click(screen.getByText('Send test'))
    await waitFor(() =>{  expect(view.container.textContent).toContain('Delivered') })
    expect(test).toHaveBeenCalledWith('feishu-bot')
    await waitFor(() =>{  expect(view.container.textContent).toContain('DSH_NOTIFY_FEISHU_URL') })
  })

  it('surfaces the failure reason of a rejected test send', async () => {
    const face = injected({
      test: vi.fn(async () => ({ delivered: false, reason: 'credential "X" is unresolved' })),
    })
    const view = mount(face)
    await waitFor(() =>{  expect(screen.getByText('Send test')).toBeDefined() })
    fireEvent.click(screen.getByText('Send test'))
    await waitFor(() =>{  expect(view.container.textContent).toContain('Failed: credential "X" is unresolved') })
  })
})
