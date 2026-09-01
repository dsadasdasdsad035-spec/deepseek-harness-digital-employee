import { Context } from '@deepseek-ai/cordis'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type { SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import DigitalEmployeeManagementGateway from '../src/index.ts'

interface StartChatRequest {
  employeeId: string
  workspaceId: string
  sessionId: ReturnType<typeof SessionId>
  submissionId: string
  content: Array<
    | { type: 'text'; text: string }
    | {
      type: 'image'
      mediaType: 'image/png'
      data: string
      name?: string
    }
  >
}

interface StartChatGateway {
  startChat(request: StartChatRequest, signal: AbortSignal): Promise<{
    sessionId: ReturnType<typeof SessionId>
    submissionId: string
    messageId: string
  }>
}

interface AdmittedMessage {
  readonly id: string
  readonly role: 'user'
  readonly source: { readonly kind: 'user' }
  readonly content: StartChatRequest['content']
}

function harness(options: {
  resolve?: (id: string) => Promise<unknown>
  createTask?: (request: unknown, employee: unknown) => Promise<AgentHandle>
  defaultModelSelection?: () => { provider: string; model: string; reasoningEffort?: string }
} = {}) {
  const ctx = new Context()
  const resolvedEmployee = {
    instance: {
      id: 'employee-1',
      displayName: 'Release Engineer',
      state: 'active',
    },
    template: {
      id: 'template-1',
      version: '1.0.0',
      preset: 'coding',
    },
  }
  const resolve = vi.fn(options.resolve ?? (() => Promise.resolve(resolvedEmployee)))
  const dispose = vi.fn(() => Promise.resolve())
  const defaultHandle = {
    agent: {
      id: SessionId('task-1'),
    },
    dispose,
  } as unknown as AgentHandle
  const createTask = vi.fn(options.createTask ?? (() => Promise.resolve(defaultHandle)))
  const attachSession = vi.fn(() => Promise.resolve())
  const workspace = {
    id: 'workspace-1',
    path: '/workspace',
    attachSession,
  }
  const saveImages = vi.fn((inputs: readonly SaveImageAttachment[]) => Promise.resolve(inputs.map((input, index) => ({
    attachmentId: `sha256:${String(index + 1).padStart(64, '0')}`,
    mediaType: input.mediaType,
    bytes: input.data.byteLength,
    width: 1,
    height: 1,
    ...input.name === undefined ? {} : { name: input.name },
  }))))
  ctx.provide('agents', { get: vi.fn() } as never)
  ctx.provide('agentDefaultModel', {
    currentSelection: vi.fn(options.defaultModelSelection ?? (() => ({
      provider: 'deepseek-official',
      model: 'deepseek-v4-pro',
      reasoningEffort: 'high',
    }))),
  } as never)
  ctx.provide('agentPresets', {} as never)
  ctx.provide('attachments', { saveImages } as never)
  ctx.provide('digitalEmployees', {
    resolve,
    listTemplates: vi.fn(),
    list: vi.fn(),
  } as never)
  ctx.provide('digitalEmployeeAgent', {
    createTask,
  } as never)
  ctx.provide('skills', {} as never)
  ctx.provide('tools', {} as never)
  ctx.provide('workspaceRegistry', {
    get: vi.fn((id: string) => id === workspace.id ? workspace : undefined),
  } as never)
  return {
    attachSession,
    createTask,
    ctx,
    dispose,
    resolve,
    resolvedEmployee,
    saveImages,
    workspace,
  }
}

async function gatewayFor(
  setup: ReturnType<typeof harness>,
  config: { successCacheMaxEntries?: number; successCacheTtlMs?: number } = {},
): Promise<StartChatGateway> {
  await setup.ctx.plugin(DigitalEmployeeManagementGateway, config)
  return setup.ctx.get('digitalEmployeeManagement') as unknown as StartChatGateway
}

function request(overrides: Partial<StartChatRequest> = {}): StartChatRequest {
  return {
    employeeId: 'employee-1',
    workspaceId: 'workspace-1',
    sessionId: SessionId('task-1'),
    submissionId: 'submission-1',
    content: [{ type: 'text', text: 'Prepare the release.' }],
    ...overrides,
  }
}

describe('DigitalEmployeeManagementGateway startChat', () => {
  it('resolves the employee and admits the first user message before returning the Session', async () => {
    const setup = harness()
    const gateway = await gatewayFor(setup)
    const signal = new AbortController().signal
    const uploadedImage = {
      type: 'image' as const,
      mediaType: 'image/png' as const,
      data: 'AQID',
      name: 'release.png',
    }

    const result = await gateway.startChat(request({
      content: [{ type: 'text', text: 'Prepare the release.' }, uploadedImage],
    }), signal)

    expect(result.sessionId).toBe('task-1')
    expect(result.submissionId).toBe('submission-1')
    expect(typeof result.messageId).toBe('string')
    expect(setup.resolve).toHaveBeenCalledWith('employee-1')
    expect(setup.createTask).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'employee-1',
      sessionId: 'task-1',
      meta: { cwd: '/workspace' },
      signal,
      agentOptions: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
      },
      modelSelection: {
        provider: 'deepseek-official',
        model: 'deepseek-v4-pro',
        reasoningEffort: 'high',
      },
      initialMessage: expect.objectContaining({
        role: 'user',
        source: { kind: 'user' },
      }),
    }), setup.resolvedEmployee)
    expect(setup.saveImages).toHaveBeenCalledWith([{
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
      name: 'release.png',
    }])
    const admitted = (setup.createTask.mock.calls[0]?.[0] as { initialMessage?: AdmittedMessage }).initialMessage
    expect(admitted).toMatchObject({
      role: 'user',
      source: { kind: 'user' },
      content: [
        { type: 'text', text: 'Prepare the release.' },
        {
          type: 'image',
          attachment: {
            attachmentId: `sha256:${'1'.padStart(64, '0')}`,
            mediaType: 'image/png',
            bytes: 3,
            width: 1,
            height: 1,
            name: 'release.png',
          },
        },
      ],
    })
    expect(typeof admitted?.id).toBe('string')
    expect(setup.dispose).not.toHaveBeenCalled()
    expect(setup.attachSession).toHaveBeenCalledWith('task-1')
    await setup.ctx.fiber.dispose()
  })

  it('rejects empty task content before resolving or creating an employee Session', async () => {
    const setup = harness()
    const gateway = await gatewayFor(setup)

    await expect(gateway.startChat(request({
      sessionId: SessionId('task-empty'),
      submissionId: 'submission-empty',
      content: [{ type: 'text', text: ' \n ' }],
    }), new AbortController().signal)).rejects.toThrow('task content')

    expect(setup.resolve).not.toHaveBeenCalled()
    expect(setup.createTask).not.toHaveBeenCalled()
    await setup.ctx.fiber.dispose()
  })

  it.each([
    ['inactive employee', 'digital employee "employee-1" is inactive'],
    ['missing template', 'requires unavailable template "template-1" version "1.0.0"'],
  ])('rejects an %s before creating a root Agent', async (_label, message) => {
    const setup = harness({
      resolve: () => Promise.reject(new Error(message)),
    })
    const gateway = await gatewayFor(setup)

    await expect(gateway.startChat(request({
      sessionId: SessionId('task-unavailable'),
      submissionId: 'submission-unavailable',
    }), new AbortController().signal)).rejects.toThrow(message)

    expect(setup.createTask).not.toHaveBeenCalled()
    await setup.ctx.fiber.dispose()
  })

  it('shares one in-flight startup for duplicate submission identity', async () => {
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<AgentHandle>()
    const createTask = vi.fn(() => {
      entered.resolve(undefined)
      return release.promise
    })
    const setup = harness({ createTask })
    const gateway = await gatewayFor(setup)
    const duplicate = request({
      sessionId: SessionId('task-duplicate'),
      submissionId: 'submission-duplicate',
    })
    const signal = new AbortController().signal

    const first = gateway.startChat(duplicate, signal)
    await entered.promise
    const second = gateway.startChat(duplicate, signal)
    release.resolve({
      agent: { id: duplicate.sessionId } as never,
      dispose: vi.fn(() => Promise.resolve()),
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ sessionId: duplicate.sessionId }),
      expect.objectContaining({ sessionId: duplicate.sessionId }),
    ])
    await expect(gateway.startChat(duplicate, signal)).resolves.toMatchObject({
      sessionId: duplicate.sessionId,
      submissionId: duplicate.submissionId,
    })
    expect(setup.resolve).toHaveBeenCalledTimes(1)
    expect(createTask).toHaveBeenCalledTimes(1)
    await setup.ctx.fiber.dispose()
  })

  it('does not publish an Agent when creation-time first-message admission fails', async () => {
    const admissionError = new Error('message admission failed')
    const setup = harness({
      createTask: () => Promise.reject(admissionError),
    })
    const gateway = await gatewayFor(setup)

    await expect(gateway.startChat(request({
      sessionId: SessionId('task-failed-admission'),
      submissionId: 'submission-failed-admission',
    }), new AbortController().signal)).rejects.toBe(admissionError)

    expect(setup.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ initialMessage: expect.any(Object) }),
      setup.resolvedEmployee,
    )
    await setup.ctx.fiber.dispose()
  })

  it('rejects invalid encoded images before creating an Agent', async () => {
    const setup = harness()
    const gateway = await gatewayFor(setup)

    await expect(gateway.startChat(request({
      sessionId: SessionId('task-invalid-image'),
      submissionId: 'submission-invalid-image',
      content: [{ type: 'image', mediaType: 'image/png', data: 'not canonical base64' }],
    }), new AbortController().signal)).rejects.toThrow('canonical base64')

    expect(setup.saveImages).not.toHaveBeenCalled()
    expect(setup.createTask).not.toHaveBeenCalled()
    await setup.ctx.fiber.dispose()
  })

  it('propagates cancellation before Agent creation', async () => {
    const controller = new AbortController()
    const createTask = vi.fn(() => {
      controller.abort(new Error('caller aborted'))
      return Promise.reject(controller.signal.reason)
    })
    const setup = harness({ createTask })
    const gateway = await gatewayFor(setup)

    await expect(gateway.startChat(request({
      sessionId: SessionId('task-aborted'),
      submissionId: 'submission-aborted',
    }), controller.signal)).rejects.toThrow('caller aborted')

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
      expect.anything(),
    )
    await setup.ctx.fiber.dispose()
  })

  it('evicts the oldest completed submission when the success cache reaches its configured limit', async () => {
    const setup = harness()
    const gateway = await gatewayFor(setup, {
      successCacheMaxEntries: 1,
      successCacheTtlMs: 60_000,
    })
    const signal = new AbortController().signal
    const first = request({ sessionId: SessionId('task-cache-1'), submissionId: 'submission-cache-1' })
    const second = request({ sessionId: SessionId('task-cache-2'), submissionId: 'submission-cache-2' })

    await gateway.startChat(first, signal)
    await gateway.startChat(second, signal)
    await gateway.startChat(first, signal)

    expect(setup.createTask).toHaveBeenCalledTimes(3)
    await setup.ctx.fiber.dispose()
  })
})
