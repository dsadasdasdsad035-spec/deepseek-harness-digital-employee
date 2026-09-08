/**
 * The task-console remotes: ledger listing with the legacy display fallback,
 * resume/discard validation, and the notification channel describe/test
 * surface. The ledger points at a temp file through the store's test
 * internals, so these tests exercise the same locked transactions the
 * headless driver uses.
 */

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { internals as ledger, withTaskAttempts } from '@deepseek-ai/dsh-digital-employee-file'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import DigitalEmployeeManagementGateway from '../src/index.ts'

/** A minimal gateway mount: only the services the console remotes reach. */
function harness(options: { notifications?: unknown } = {}) {
  const ctx = new Context()
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'test', model: 'm' }) } as never)
  ctx.provide('agentPresets', { standingKeyFor: async () => 'scope' } as never)
  ctx.provide('agents', { get: () => undefined } as never)
  ctx.provide('attachments', {} as never)
  ctx.provide('digitalEmployees', { list: async () => [], inspect: async () => ({}) } as never)
  ctx.provide('digitalEmployeeAgent', { createTask: async () => ({}) } as never)
  ctx.provide('skills', { list: async () => [] } as never)
  ctx.provide('tools', { get: () => undefined } as never)
  ctx.provide('workspaceRegistry', { get: () => undefined } as never)
  if (options.notifications !== undefined) ctx.provide('notifications', options.notifications)
  return ctx
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-task-console-'))
  ledger.path = join(dir, 'task-attempts.json')
})

afterEach(() => {
  ledger.path = join(tmpdir(), `stale-${Date.now()}.json`)
})

describe('task console remotes', () => {
  it('lists ledger entries with the legacy key fallback for display names', async () => {
    await withTaskAttempts((draft) => {
      draft['daily-digest'] = {
        consecutiveFailures: 2,
        suspended: true,
        lastReason: 'blocked: no tool',
        displayName: 'Daily digest',
        employeeId: 'emp-1',
      }
      draft.legacykey = { consecutiveFailures: 1 }
    })
    const ctx = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
    await expect(gateway.listEmployeeTasks()).resolves.toEqual([
      {
        key: 'daily-digest',
        displayName: 'Daily digest',
        consecutiveFailures: 2,
        suspended: true,
        lastReason: 'blocked: no tool',
        employeeId: 'emp-1',
      },
      { key: 'legacykey', displayName: 'legacykey', consecutiveFailures: 1, suspended: false },
    ])
    await ctx.fiber.dispose()
  })

  it('resumes a suspended task by clearing only the suspension flag', async () => {
    await withTaskAttempts((draft) => {
      draft.k = { consecutiveFailures: 3, suspended: true, lastReason: 'stuck' }
    })
    const ctx = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
    await expect(gateway.resumeEmployeeTask({ key: 'k' })).resolves.toBeUndefined()
    const entry = (await gateway.listEmployeeTasks()).find(entry => entry.key === 'k')
    expect(entry).toMatchObject({ consecutiveFailures: 3, suspended: false, lastReason: 'stuck' })
    await ctx.fiber.dispose()
  })

  it('rejects resuming an unknown or non-suspended key', async () => {
    await withTaskAttempts((draft) => { draft.active = { consecutiveFailures: 1 } })
    const ctx = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
    await expect(gateway.resumeEmployeeTask({ key: 'missing' })).rejects.toThrow(/not in the ledger/)
    await expect(gateway.resumeEmployeeTask({ key: 'active' })).rejects.toThrow(/not suspended/)
    await ctx.fiber.dispose()
  })

  it('discards a known key and rejects an unknown one', async () => {
    await withTaskAttempts((draft) => { draft.k = { consecutiveFailures: 3, suspended: true } })
    const ctx = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
    await expect(gateway.discardEmployeeTask({ key: 'k' })).resolves.toBeUndefined()
    await expect(gateway.listEmployeeTasks()).resolves.toEqual([])
    await expect(gateway.discardEmployeeTask({ key: 'k' })).rejects.toThrow(/not in the ledger/)
    await ctx.fiber.dispose()
  })

  it('describes registered channels without exposing values', async () => {
    const ctx = harness({
      notifications: {
        listChannels: () => ['feishu-bot', 'generic-webhook'],
        channelCredentials: async (id: string) => id === 'feishu-bot'
          ? [{ ref: 'DSH_NOTIFY_FEISHU_URL', configured: true }, { ref: 'DSH_NOTIFY_FEISHU_SECRET', configured: false }]
          : [{ ref: 'DSH_NOTIFY_WEBHOOK_URL', configured: true }],
      },
    })
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
    await expect(gateway.describeNotificationChannels()).resolves.toEqual([
      {
        id: 'feishu-bot',
        credentials: [
          { ref: 'DSH_NOTIFY_FEISHU_URL', configured: true },
          { ref: 'DSH_NOTIFY_FEISHU_SECRET', configured: false },
        ],
      },
      { id: 'generic-webhook', credentials: [{ ref: 'DSH_NOTIFY_WEBHOOK_URL', configured: true }] },
    ])
    await ctx.fiber.dispose()
  })

  it('hides the row signal when no notification capability is composed', async () => {
    const ctx = harness()
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
    await expect(gateway.describeNotificationChannels()).resolves.toEqual([])
    await expect(gateway.testNotificationChannel({ channel: 'feishu-bot' }))
      .resolves.toEqual({ delivered: false, reason: 'no notification capability is composed' })
    await ctx.fiber.dispose()
  })

  it('sends the labeled test message through the production contract', async () => {
    const sent: Array<{ channel: string; title: string; body: string }> = []
    const ctx = harness({
      notifications: {
        listChannels: () => ['feishu-bot'],
        channelCredentials: async () => [],
        send: async (request: { channel: string; title: string; body: string }) => {
          sent.push(request)
          return { delivered: true }
        },
      },
    })
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
    await expect(gateway.testNotificationChannel({ channel: 'feishu-bot' })).resolves.toEqual({ delivered: true })
    expect(sent).toEqual([{
      channel: 'feishu-bot',
      title: '[test] feishu-bot',
      body: 'Test message sent from the digital employee notification settings.',
    }])
    await ctx.fiber.dispose()
  })

  it('returns the failure reason when the channel rejects the test send', async () => {
    const ctx = harness({
      notifications: {
        listChannels: () => ['generic-webhook'],
        channelCredentials: async () => [],
        send: async () => ({ delivered: false, reason: 'credential "X" is unresolved' }),
      },
    })
    await ctx.plugin(DigitalEmployeeManagementGateway)
    const gateway = ctx.get('digitalEmployeeManagement') as DigitalEmployeeManagementGateway
    await expect(gateway.testNotificationChannel({ channel: 'generic-webhook' }))
      .resolves.toEqual({ delivered: false, reason: 'credential "X" is unresolved' })
    await ctx.fiber.dispose()
  })
})
