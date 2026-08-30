import { describe, expect, it, vi } from 'vitest'
import type {
  DigitalEmployeeInstance, DigitalEmployeeInstanceId, SessionId, WorkspaceId,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { RoutingSubmitRequest } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { DigitalEmployeeChatController } from '../src/client/chat.ts'
import { DigitalEmployeeStore } from '../src/client/store.ts'

const EMPLOYEE_ID = 'employee-1' as DigitalEmployeeInstanceId
const SOURCE_SESSION_ID = 'source-session' as SessionId
const EMPLOYEE_SESSION_ID = 'employee-session' as SessionId
const DRAFT_SESSION_ID = 'draft-session' as SessionId
const DISTINCT_DRAFT_SESSION_ID = 'distinct-draft-session' as SessionId
const WORKSPACE_ID = 'workspace-1' as WorkspaceId

const activeEmployee: DigitalEmployeeInstance = {
  id: EMPLOYEE_ID,
  templateId: 'template-1' as DigitalEmployeeInstance['templateId'],
  templateVersion: '1.0.0',
  displayName: 'Release Engineer',
  grants: {
    skills: ['release-notes'],
    tools: ['bash'],
    mcpServers: [],
    experts: ['reviewer' as DigitalEmployeeInstance['grants']['experts'][number]],
    allowSubagents: true,
  },
  state: 'active',
  createdAt: '2026-08-28T00:00:00.000Z',
  updatedAt: '2026-08-28T00:00:00.000Z',
}

function ok<T>(value: T) {
  return Promise.resolve({ ok: true as const, value })
}

function setup(options: {
  employee?: DigitalEmployeeInstance
  startChat?: ReturnType<typeof vi.fn>
  draft?: string
  refresh?: ReturnType<typeof vi.fn>
  workspaceReady?: boolean
} = {}) {
  const employee = options.employee ?? activeEmployee
  const startChat = options.startChat ?? vi.fn(() => ok({
    sessionId: EMPLOYEE_SESSION_ID,
    submissionId: 'submission-1',
    messageId: 'message-1',
  }))
  const remote = {
    listTemplates: vi.fn(() => ok([{
      id: 'template-1' as DigitalEmployeeInstance['templateId'],
      version: '1.0.0',
      display: { name: 'Release specialist', description: 'Release work support.' },
      capabilities: employee.grants,
    }])),
    list: vi.fn(() => ok([employee])),
    startChat,
  }
  const store = new DigitalEmployeeStore(remote as never)
  let employeeListed = false
  const listListeners = new Set<() => void>()
  const publishEmployeeSession = () => {
    employeeListed = true
    for (const listener of [...listListeners]) listener()
  }
  const open = vi.fn()
  const refresh = options.refresh ?? vi.fn(async () => { publishEmployeeSession() })
  const sessions = {
    list: {
      getSnapshot: () => ({
        ids: employeeListed ? [SOURCE_SESSION_ID, EMPLOYEE_SESSION_ID] : [SOURCE_SESSION_ID],
        byId: {
          [SOURCE_SESSION_ID]: {
            id: SOURCE_SESSION_ID,
            blank: true,
            running: false,
            updatedAt: 1,
            workspaceId: WORKSPACE_ID,
          },
          ...(employeeListed ? {
            [EMPLOYEE_SESSION_ID]: {
              id: EMPLOYEE_SESSION_ID,
              blank: false,
              running: true,
              updatedAt: 2,
            },
          } : {}),
        },
        current: SOURCE_SESSION_ID,
      }),
      subscribe: vi.fn((listener: () => void) => {
        listListeners.add(listener)
        return () => { listListeners.delete(listener) }
      }),
    },
    refresh,
    open,
    scope: vi.fn((sessionId: SessionId) => ({ session: sessionId })),
  }
  const insertReference = vi.fn(() => true)
  const inputState = (sessionId: SessionId) => ({
    getSnapshot: () => ({
      draft: sessionId === DRAFT_SESSION_ID ? options.draft ?? '' : '',
      draftRev: 7,
      imageIds: [],
      phase: 'plain',
      occurrences: [],
      queue: [],
    }),
  })
  const conversation = {
    input: {
      for: vi.fn((scope: { session: SessionId }) => ({
        state: inputState(scope.session),
        insertReference,
      })),
    },
  }
  const connectWorkspace = vi.fn((
    _workspaceId: WorkspaceId,
    connectOptions?: { reuseBlank?: boolean },
  ) => Promise.resolve(connectOptions?.reuseBlank === false ? DISTINCT_DRAFT_SESSION_ID : DRAFT_SESSION_ID))
  let workspaceReady = options.workspaceReady ?? true
  const workspaceListeners = new Set<() => void>()
  const publishWorkspace = () => {
    workspaceReady = true
    for (const listener of [...workspaceListeners]) listener()
  }
  const workspaces = {
    list: {
      getSnapshot: () => ({
        items: workspaceReady ? [{
          workspaceId: WORKSPACE_ID,
          path: '/workspace',
          title: 'Workspace',
          sessionIds: [SOURCE_SESSION_ID],
        }] : [],
        recentWorkspaceId: workspaceReady ? WORKSPACE_ID : undefined,
        baselinesReady: workspaceReady,
        phase: workspaceReady ? 'ready' : 'loading',
      }),
      subscribe: vi.fn((listener: () => void) => {
        workspaceListeners.add(listener)
        return () => { workspaceListeners.delete(listener) }
      }),
    },
    connectWorkspace,
  }
  const layout = { closeApplication: vi.fn() }
  const sessionId = vi.fn(() => EMPLOYEE_SESSION_ID)
  const submissionId = vi.fn(() => 'submission-1' as never)
  const controller = new DigitalEmployeeChatController({
    store,
    remote: remote as never,
    sessions: sessions as never,
    workspaces: workspaces as never,
    conversation: conversation as never,
    layout: layout as never,
    ids: {
      session: sessionId,
      submission: submissionId,
    },
  })
  return {
    controller, store, remote, sessions, workspaces, conversation, layout,
    startChat, open, refresh, connectWorkspace, insertReference, publishEmployeeSession,
    publishWorkspace, pendingListListeners: () => listListeners.size, sessionId, submissionId,
  }
}

function request(overrides: Partial<RoutingSubmitRequest> = {}): RoutingSubmitRequest {
  return {
    source: 'digital-employee',
    ref: EMPLOYEE_ID,
    content: 'Prepare the release.',
    images: [],
    mode: 'queue',
    attempt: { seq: 1, signal: new AbortController().signal },
    ...overrides,
  }
}

describe('DigitalEmployeeChatController source', () => {
  it('shows active and unavailable employees only at the leading position of a blank task', async () => {
    const inactive = { ...activeEmployee, id: 'employee-2' as DigitalEmployeeInstanceId, state: 'inactive' as const }
    const harness = setup()
    harness.remote.list.mockResolvedValueOnce({ ok: true, value: [activeEmployee, inactive] })

    const leading = await harness.controller.source.candidates(
      { sessionId: SOURCE_SESSION_ID },
      { query: '', position: 'leading', signal: new AbortController().signal },
    )

    expect(leading).toEqual([
      expect.objectContaining({
        name: 'Release Engineer',
        description: expect.stringContaining('Available'),
        value: EMPLOYEE_ID,
      }),
      expect.objectContaining({
        name: 'Release Engineer',
        description: expect.stringContaining('Unavailable'),
        value: 'employee-2',
      }),
    ])
    await expect(harness.controller.source.candidates(
      { sessionId: SOURCE_SESSION_ID },
      { query: '', position: 'inline', signal: new AbortController().signal },
    )).resolves.toEqual([])
    await expect(harness.controller.source.candidates(
      { sessionId: 'active-session' as SessionId },
      { query: '', position: 'leading', signal: new AbortController().signal },
    )).resolves.toEqual([])
  })

  it('inserts one structured routing reference with the stable employee id and rejects unavailable picks', async () => {
    const harness = setup()
    await harness.store.loadRoster()
    const picked = harness.controller.source.onPick({
      candidate: { name: activeEmployee.displayName, value: EMPLOYEE_ID },
      session: { sessionId: SOURCE_SESSION_ID },
      position: 'leading',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })
    expect(picked).toEqual({
      insert: {
        source: 'digital-employee',
        ref: EMPLOYEE_ID,
        label: activeEmployee.displayName,
        clipboardText: `@${activeEmployee.displayName}`,
        submission: 'routing',
      },
    })

    harness.remote.list.mockResolvedValueOnce({
      ok: true,
      value: [{ ...activeEmployee, state: 'inactive' }],
    })
    await harness.store.loadRoster()
    expect(harness.controller.source.onPick({
      candidate: { name: activeEmployee.displayName, value: EMPLOYEE_ID },
      session: { sessionId: SOURCE_SESSION_ID },
      position: 'leading',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })).toBeUndefined()
  })

  it('starts the employee chat with encoded images and opens only after refresh adopts the returned Session', async () => {
    const harness = setup()
    await harness.store.loadRoster()
    const image = { mediaType: 'image/png' as const, data: 'AA==', name: 'chart.png' }

    await expect(harness.controller.source.routeSubmit?.(
      { sessionId: SOURCE_SESSION_ID },
      request({ images: [image] }),
    )).resolves.toEqual({ kind: 'success' })

    expect(harness.startChat).toHaveBeenCalledWith({
      employeeId: EMPLOYEE_ID,
      workspaceId: WORKSPACE_ID,
      sessionId: EMPLOYEE_SESSION_ID,
      submissionId: 'submission-1',
      content: [
        { type: 'text', text: 'Prepare the release.' },
        { type: 'image', ...image },
      ],
    }, expect.any(AbortSignal))
    expect(harness.refresh.mock.invocationCallOrder[0]).toBeLessThan(harness.open.mock.invocationCallOrder[0]!)
    expect(harness.open).toHaveBeenCalledWith(EMPLOYEE_SESSION_ID)
  })

  it('routes through the source Session workspace when the workspace mirror has no owner id', async () => {
    const harness = setup({ workspaceReady: false })
    await harness.store.loadRoster()

    await expect(harness.controller.source.routeSubmit?.(
      { sessionId: SOURCE_SESSION_ID },
      request(),
    )).resolves.toEqual({ kind: 'success' })
    expect(harness.startChat).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID,
    }), expect.any(AbortSignal))
  })

  it.each([
    ['a successful refresh whose list result is delayed', vi.fn(async () => {})],
    ['a failed refresh', vi.fn(async () => { throw new Error('list transport failed') })],
  ])('consumes an accepted submission after %s and opens once when the Session appears', async (_name, refresh) => {
    const harness = setup({ refresh })
    await harness.store.loadRoster()

    await expect(harness.controller.source.routeSubmit?.(
      { sessionId: SOURCE_SESSION_ID },
      request(),
    )).resolves.toEqual({ kind: 'success' })

    expect(harness.startChat).toHaveBeenCalledOnce()
    expect(harness.open).not.toHaveBeenCalled()
    expect(harness.pendingListListeners()).toBe(1)

    harness.publishEmployeeSession()
    harness.publishEmployeeSession()

    expect(harness.open).toHaveBeenCalledTimes(1)
    expect(harness.open).toHaveBeenCalledWith(EMPLOYEE_SESSION_ID)
    expect(harness.startChat).toHaveBeenCalledOnce()
    expect(harness.pendingListListeners()).toBe(0)
  })

  it('cancels a pending eventual open when the controller is disposed', async () => {
    const harness = setup({ refresh: vi.fn(async () => {}) })
    await harness.store.loadRoster()
    await harness.controller.source.routeSubmit?.(
      { sessionId: SOURCE_SESSION_ID },
      request(),
    )
    expect(harness.pendingListListeners()).toBe(1)

    harness.controller.dispose()
    harness.publishEmployeeSession()

    expect(harness.open).not.toHaveBeenCalled()
    expect(harness.pendingListListeners()).toBe(0)
  })

  it('returns an error without refreshing or opening when startup fails', async () => {
    const startChat = vi.fn(() => Promise.resolve({
      ok: false as const,
      error: { code: 'employee-inactive', message: 'Employee is inactive.', details: {} },
    }))
    const harness = setup({ startChat })
    await harness.store.loadRoster()

    await expect(harness.controller.source.routeSubmit?.(
      { sessionId: SOURCE_SESSION_ID },
      request(),
    )).resolves.toEqual({ kind: 'error', text: 'Employee is inactive.' })
    expect(harness.refresh).not.toHaveBeenCalled()
    expect(harness.open).not.toHaveBeenCalled()
  })
})

describe('DigitalEmployeeChatController management entry', () => {
  it('reuses an empty ordinary new-task composer with the employee preselected', async () => {
    const harness = setup()
    await harness.store.loadRoster()

    await harness.controller.openComposer(EMPLOYEE_ID)

    expect(harness.connectWorkspace).toHaveBeenCalledOnce()
    expect(harness.connectWorkspace).toHaveBeenCalledWith(WORKSPACE_ID)
    expect(harness.insertReference).toHaveBeenCalledWith({
      source: 'digital-employee',
      ref: EMPLOYEE_ID,
      label: activeEmployee.displayName,
      clipboardText: `@${activeEmployee.displayName}`,
      submission: 'routing',
    }, {
      start: 0,
      end: 0,
      draftRev: 7,
    })
    expect(harness.startChat).not.toHaveBeenCalled()
    expect(harness.sessionId).not.toHaveBeenCalled()
    expect(harness.submissionId).not.toHaveBeenCalled()
    expect(harness.open).toHaveBeenCalledWith(DRAFT_SESSION_ID)
    expect(harness.layout.closeApplication).toHaveBeenCalledOnce()
  })

  it('preserves a reusable nonempty draft and creates one distinct ordinary composer', async () => {
    const harness = setup({ draft: 'keep this draft' })
    await harness.store.loadRoster()

    await harness.controller.openComposer(EMPLOYEE_ID)

    expect(harness.connectWorkspace).toHaveBeenNthCalledWith(1, WORKSPACE_ID)
    expect(harness.connectWorkspace).toHaveBeenNthCalledWith(2, WORKSPACE_ID, { reuseBlank: false })
    expect(harness.insertReference).toHaveBeenCalledOnce()
    expect(harness.open).toHaveBeenCalledWith(DISTINCT_DRAFT_SESSION_ID)
    expect(harness.startChat).not.toHaveBeenCalled()
    expect(harness.sessionId).not.toHaveBeenCalled()
  })
})
