import { mkdtempSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendTaskLifecycleEvent,
  listTaskLifecycleEvents,
  taskEventsInternals,
} from '../src/task-events.ts'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-task-events-'))
  taskEventsInternals.path = join(dir, 'task-events.jsonl')
})

afterEach(async () => {
  taskEventsInternals.path = join(tmpdir(), `stale-${Date.now()}.jsonl`)
  await writeFile(taskEventsInternals.path, '', 'utf8')
})

describe('task lifecycle event log', () => {
  it('appends sequenced events and reads them back in order', async () => {
    const first = await appendTaskLifecycleEvent({
      kind: 'started', employeeId: 'emp-1', taskKey: 'task-a', taskTitle: '整理周报', at: 1000,
    })
    const second = await appendTaskLifecycleEvent({
      kind: 'succeeded', employeeId: 'emp-1', taskKey: 'task-a', taskTitle: '整理周报', at: 2000,
    })
    expect(first.seq).toBe(1)
    expect(second.seq).toBe(2)
    await expect(listTaskLifecycleEvents()).resolves.toEqual([
      { seq: 1, kind: 'started', employeeId: 'emp-1', taskKey: 'task-a', taskTitle: '整理周报', at: 1000 },
      { seq: 2, kind: 'succeeded', employeeId: 'emp-1', taskKey: 'task-a', taskTitle: '整理周报', at: 2000 },
    ])
  })

  it('round-trips failure fields (reason, suspended) without polluting other kinds', async () => {
    await appendTaskLifecycleEvent({
      kind: 'failed', employeeId: 'emp-2', taskKey: 'task-b', taskTitle: '导出报表',
      at: 3000, reason: 'blocked (budget): too many rounds', suspended: true,
    })
    const events = await listTaskLifecycleEvents()
    expect(events).toEqual([
      {
        seq: 1, kind: 'failed', employeeId: 'emp-2', taskKey: 'task-b', taskTitle: '导出报表',
        at: 3000, reason: 'blocked (budget): too many rounds', suspended: true,
      },
    ])
  })

  it('reads an absent file as an empty log', async () => {
    await expect(listTaskLifecycleEvents()).resolves.toEqual([])
  })

  it('drops exactly one torn trailing line after a crash mid-append', async () => {
    await appendTaskLifecycleEvent({
      kind: 'started', employeeId: 'emp-1', taskKey: 'task-a', taskTitle: 't', at: 1,
    })
    const raw = await readFile(taskEventsInternals.path, 'utf8')
    await writeFile(taskEventsInternals.path, `${raw}{"seq":2,"kind":"succe`, 'utf8')
    const events = await listTaskLifecycleEvents()
    expect(events).toHaveLength(1)
    // The torn line did not consume a seq: the next append reuses 2.
    const next = await appendTaskLifecycleEvent({
      kind: 'succeeded', employeeId: 'emp-1', taskKey: 'task-a', taskTitle: 't', at: 2,
    })
    expect(next.seq).toBe(2)
  })

  it('fails loud on a structurally invalid stored line', async () => {
    await writeFile(taskEventsInternals.path, `${JSON.stringify({ seq: 1, kind: 'teleported' })}\n`, 'utf8')
    await expect(listTaskLifecycleEvents()).rejects.toThrow('task events:')
  })
})
