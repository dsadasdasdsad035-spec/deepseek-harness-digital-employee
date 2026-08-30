import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'

describe('ui-digital-employees apply', () => {
  it('registers the sidebar action and shell application for one fiber lifetime', async () => {
    expect(inject).toEqual([
      'slots', 'layout', 'sessions', 'workspaces', 'conversation', 'inputTriggers',
      'remote', 'remote.digitalEmployees',
    ])
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    const openApplication = vi.fn()
    const disposeSource = vi.fn()
    const registerSource = vi.fn(() => disposeSource)
    ctx.provide('layout', { openApplication, closeApplication: vi.fn() } as never)
    ctx.provide('sessions', {} as never)
    ctx.provide('workspaces', {} as never)
    ctx.provide('conversation', {} as never)
    ctx.provide('inputTriggers', { registerSource } as never)
    ctx.provide('remote', { digitalEmployees: {} } as never)
    ctx.provide('remote.digitalEmployees', {} as never)
    const slots = ctx.get('slots') as SlotRegistry
    slots.register({
      name: 'root',
      children: {
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
        'shell.application': { kind: 'single', scope: 'root' },
      },
    } as never, () => null)

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('sidebar.footer.action')).toHaveLength(1)
    expect(slots.entries('shell.application')).toHaveLength(1)
    expect(registerSource).toHaveBeenCalledOnce()
    expect(registerSource).toHaveBeenCalledWith(expect.objectContaining({
      trigger: '@',
      name: 'digital-employee',
    }))
    const nav = slots.entries('sidebar.footer.action')[0]
    const injected = nav?.inject?.() as { open?: () => void } | undefined
    injected?.open?.()
    expect(openApplication).toHaveBeenCalledOnce()

    await fiber.dispose()
    expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
    expect(slots.entries('shell.application')).toHaveLength(0)
    expect(disposeSource).toHaveBeenCalledOnce()
  })
})
