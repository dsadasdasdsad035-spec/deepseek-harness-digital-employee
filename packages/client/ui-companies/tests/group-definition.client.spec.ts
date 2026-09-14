import { describe, expect, it } from 'vitest'
import { companyGroupMessageDefinition } from '../src/client/group-definition.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

/** @vitest-environment node */

function groupEvent(seq: number, data: Record<string, unknown>): SessionEvent {
  return { seq, time: seq, type: 'company-group/message', data } as SessionEvent
}

describe('companyGroupMessageDefinition', () => {
  it('claims only company-group/message events as starts', () => {
    const claimed = companyGroupMessageDefinition.match(groupEvent(3, {
      speakerKind: 'employee', displayName: '张三', text: '任务搞定',
    }))
    expect(claimed).toEqual({ id: 'company-group-message-3', role: 'start' })
    expect(companyGroupMessageDefinition.match({ type: 'user/message', data: {} } as SessionEvent)).toBeNull()
    expect(companyGroupMessageDefinition.match({ type: 'assistant/message', data: {} } as SessionEvent)).toBeNull()
  })

  it('starts with the speaker payload and projects the keyed chat node', () => {
    const event = groupEvent(7, {
      speakerKind: 'user', displayName: '我', text: '@张三 加油', context: '回复 @张三',
    })
    const match = { event, id: 'company-group-message-7', role: 'start' } as never
    const state = companyGroupMessageDefinition.start({} as never, match, {} as never)
    const node = companyGroupMessageDefinition.buildViewNode?.({
      key: 'ctx-key',
      id: 'company-group-message-7',
      state,
      start: { location: { kind: 'unresolved' } },
      matches: [match],
    } as never)
    expect(node).toMatchObject({
      kind: 'company-group-message',
      target: 'chat',
      anchorSeq: 7,
      visibility: 'visible',
      data: { speakerKind: 'user', displayName: '我', text: '@张三 加油', context: '回复 @张三' },
    })
  })

  it('keeps state across update matches', () => {
    const state = { seq: 1, speakerKind: 'employee' as const, displayName: '张三', text: 'x' }
    expect(companyGroupMessageDefinition.update({ state } as never, {} as never)).toBe(state)
  })
})
