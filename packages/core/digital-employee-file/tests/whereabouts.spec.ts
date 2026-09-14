import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readWhereabouts, reportVisit, whereaboutsInternals } from '../src/whereabouts.ts'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-whereabouts-'))
  whereaboutsInternals.path = join(dir, 'whereabouts.json')
})

afterEach(() => {
  whereaboutsInternals.path = join(tmpdir(), `stale-${Date.now()}.json`)
})

describe('durable whereabouts', () => {
  it('records visits newest-first and updates the last-seen summary', async () => {
    await reportVisit('emp-1', '吸烟区', 1000)
    await reportVisit('emp-1', '工位', 2000)
    await reportVisit('emp-1', '茶水区', 3000)
    const store = await readWhereabouts()
    expect(store['emp-1']).toEqual({
      employeeId: 'emp-1',
      lastSeenAt: 3000,
      lastPlace: '茶水区',
      visits: [
        { place: '茶水区', at: 3000 },
        { place: '工位', at: 2000 },
        { place: '吸烟区', at: 1000 },
      ],
    })
  })

  it('caps each employee at the latest 50 visits', async () => {
    for (let index = 0; index < 55; index++) {
      await reportVisit('emp-2', `地方${String(index)}`, index)
    }
    const record = (await readWhereabouts())['emp-2']
    expect(record?.visits).toHaveLength(50)
    expect(record?.visits[0]).toEqual({ place: '地方54', at: 54 })
    expect(record?.visits.at(-1)).toEqual({ place: '地方5', at: 5 })
  })

  it('reads a missing file as the empty history and fails loud on corruption', async () => {
    await expect(readWhereabouts()).resolves.toEqual({})
    const { writeFile } = await import('node:fs/promises')
    await writeFile(whereaboutsInternals.path, '{"emp-3": {"lastSeenAt": "x"}}', 'utf8')
    await expect(readWhereabouts()).rejects.toThrow('whereabouts:')
  })

  it('keeps employees independent in one store', async () => {
    await reportVisit('emp-a', '厕所', 1)
    await reportVisit('emp-b', '休息区', 2)
    const store = await readWhereabouts()
    expect(store['emp-a']?.lastPlace).toBe('厕所')
    expect(store['emp-b']?.lastPlace).toBe('休息区')
  })
})
