import { describe, expect, it, vi } from 'vitest'
import type { CandidateRequest, ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { createCompanyEmployeeId } from '@deepseek-ai/dsh-company'
import {
  COMPANY_GROUP_SESSION_PREFIX, companyIdOfGroupSession, createCompanyGroupMentionSource,
} from '../src/client/group-mention.ts'
import type { CompanyGroupMemberView } from '../src/client/store.ts'

const GROUP_SESSION = `${COMPANY_GROUP_SESSION_PREFIX}company-1` as SessionId
const ORDINARY_SESSION = 'session-ordinary' as SessionId
const MEMBER_SESSION = 'session-group-member-company-1-emp-a' as SessionId

const MEMBERS: readonly CompanyGroupMemberView[] = [
  { employeeId: createCompanyEmployeeId('emp-a'), displayName: '张三', departmentName: '研发部' },
  { employeeId: createCompanyEmployeeId('emp-b'), displayName: '李四', departmentName: '运营部' },
  { employeeId: createCompanyEmployeeId('emp-c'), displayName: '王五', departmentName: '未分配' },
]

function request(overrides: Partial<CandidateRequest> = {}): CandidateRequest {
  return { query: '', position: 'inline', signal: new AbortController().signal, ...overrides }
}

function setup(members: readonly CompanyGroupMemberView[] = MEMBERS) {
  const membersOf = vi.fn(async () => members)
  const source = createCompanyGroupMentionSource({ membersOf })
  const session: ClientSessionContext = { sessionId: GROUP_SESSION }
  return { source, membersOf, session }
}

describe('companyIdOfGroupSession', () => {
  it('resolves the company id only for group session prefixes', () => {
    expect(companyIdOfGroupSession(GROUP_SESSION)).toBe('company-1')
    expect(companyIdOfGroupSession(ORDINARY_SESSION)).toBeUndefined()
    expect(companyIdOfGroupSession(MEMBER_SESSION)).toBeUndefined()
    expect(companyIdOfGroupSession(COMPANY_GROUP_SESSION_PREFIX)).toBeUndefined()
  })
})

describe('company group mention source', () => {
  it('lists the bound members with department subtitles in a group session', async () => {
    const { source, membersOf, session } = setup()
    const candidates = await source.candidates(session, request())
    expect(membersOf).toHaveBeenCalledWith('company-1')
    expect(candidates).toEqual([
      { name: '张三', description: '研发部', value: 'emp-a' },
      { name: '李四', description: '运营部', value: 'emp-b' },
      { name: '王五', description: '未分配', value: 'emp-c' },
    ])
  })

  it('filters candidates by display name query', async () => {
    const { source, session } = setup()
    const candidates = await source.candidates(session, request({ query: '李' }))
    expect(candidates.map(candidate => candidate.name)).toEqual(['李四'])
  })

  it('offers no candidates outside a group session', async () => {
    const { source, membersOf } = setup()
    const ordinary = await source.candidates({ sessionId: ORDINARY_SESSION }, request())
    const member = await source.candidates({ sessionId: MEMBER_SESSION }, request())
    expect(ordinary).toEqual([])
    expect(member).toEqual([])
    expect(membersOf).not.toHaveBeenCalled()
  })

  it('yields no candidates when the roster read is superseded', async () => {
    const { source, session } = setup()
    const controller = new AbortController()
    controller.abort()
    await expect(source.candidates(session, request({ signal: controller.signal }))).resolves.toEqual([])
  })

  it('inserts a plain @displayName mention, never a routing reference', () => {
    const { source } = setup()
    const picked = source.onPick({
      candidate: { name: '张三', value: 'emp-a' },
      session: { sessionId: GROUP_SESSION },
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 1 },
    })
    expect(picked).toEqual({ text: '@张三 ' })
  })

  it('declares no routing codec or submit owner', () => {
    const { source } = setup()
    expect(source).not.toHaveProperty('codec')
    expect(source).not.toHaveProperty('routeSubmit')
    expect(source.trigger).toBe('@')
    expect(source.name).toBe('company-group-member')
  })
})
