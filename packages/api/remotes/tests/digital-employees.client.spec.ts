import { Context } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { apply as applyGateway, inject as gatewayInject } from '@deepseek-ai/dsh-api-gateway/client'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'

const METHODS = [
  'activate', 'applyUpgrade', 'continueExpert', 'create', 'deactivate',
  'delete', 'deleteMemory', 'exportEmployee', 'get', 'importEmployee',
  'interruptExpert', 'list', 'listAudit', 'listExperts', 'listMemory',
  'listTemplates', 'previewUpgrade', 'startChat', 'taskTree',
] as const

describe('API Remote digital employee client composition', () => {
  it('mounts every operation through the shared API carrier and preserves envelopes', async () => {
    const validationFailure = {
      ok: false,
      error: { code: 'internal', message: 'employeeId is required', details: {} },
    } as const
    const call = vi.fn<ConnectionHandle['rpc']['call']>()
      .mockImplementation(async (_carrier, endpoint) => {
        if (endpoint === 'digitalEmployees/list') return { ok: true, value: [] }
        if (endpoint === 'digitalEmployees/get') return validationFailure
        if (endpoint === 'digitalEmployees/startChat') {
          return {
            ok: true,
            value: {
              sessionId: 'employee-session-1',
              submissionId: 'employee-submission-1',
              messageId: 'employee-message-1',
            },
          }
        }
        if (endpoint === 'digitalEmployees/activate') {
          return {
            ok: true,
            value: {
              id: 'employee-1',
              templateId: 'template-1',
              templateVersion: '1.0.0',
              displayName: 'Release Engineer',
              grants: {
                skills: [],
                tools: [],
                mcpServers: [],
                experts: [],
                allowSubagents: false,
              },
              state: 'active',
              createdAt: '2026-08-28T00:00:00.000Z',
              updatedAt: '2026-08-28T00:00:00.000Z',
            },
          }
        }
        throw new Error(`unexpected Remote endpoint: ${endpoint}`)
      })
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    ctx.provide('connection', { rpc: { call } } as unknown as ConnectionHandle)
    await ctx.plugin({ inject: gatewayInject, apply: applyGateway })
    const assembly = ctx.plugin({ inject, apply })
    await assembly
    type RemoteMethod = (request?: unknown, signal?: AbortSignal) => Promise<unknown>
    const remote = (ctx.remote as unknown as Record<string, Record<string, RemoteMethod>>).digitalEmployees
    expect(remote).toBeDefined()

    expect(Object.fromEntries(METHODS.map(method => [method, remote![method]]))).toEqual(
      Object.fromEntries(METHODS.map(method => [method, expect.any(Function)])),
    )
    await expect(remote!.list!()).resolves.toEqual({ ok: true, value: [] })
    await expect(remote!.get!({ employeeId: '' })).resolves.toEqual(validationFailure)
    await expect(remote!.activate!({ employeeId: 'employee-1' })).resolves.toMatchObject({
      ok: true,
      value: { id: 'employee-1', state: 'active' },
    })
    const abort = new AbortController()
    await expect(remote!.startChat!({
      employeeId: 'employee-1',
      workspaceId: 'workspace-1',
      sessionId: 'employee-session-1',
      submissionId: 'employee-submission-1',
      content: [
        { type: 'text', text: 'Prepare the release.' },
        { type: 'image', mediaType: 'image/png', data: 'AQID', name: 'release.png' },
      ],
    }, abort.signal)).resolves.toEqual({
      ok: true,
      value: {
        sessionId: 'employee-session-1',
        submissionId: 'employee-submission-1',
        messageId: 'employee-message-1',
      },
    })
    expect(call.mock.calls.map(([carrier, endpoint]) => [carrier, endpoint])).toEqual([
      ['/api', 'digitalEmployees/list'],
      ['/api', 'digitalEmployees/get'],
      ['/api', 'digitalEmployees/activate'],
      ['/api', 'digitalEmployees/startChat'],
    ])
    expect(call.mock.calls.at(-1)?.[3]).toBeInstanceOf(AbortSignal)
    expect(call.mock.calls.at(-1)?.[2]).toMatchObject({
      args: {
        request: {
          workspaceId: 'workspace-1',
          content: [
            { type: 'text', text: 'Prepare the release.' },
            { type: 'image', mediaType: 'image/png', data: 'AQID', name: 'release.png' },
          ],
        },
      },
    })

    await assembly.dispose()
    expect((ctx.remote as unknown as Record<string, unknown>).digitalEmployees).toBeUndefined()
    await ctx.fiber.dispose()
  })
})
