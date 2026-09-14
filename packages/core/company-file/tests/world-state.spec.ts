import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCompanyWorldState, reportCompanyWorldState, worldStateInternals } from '../src/world-state.ts'

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dsh-world-state-'))
  worldStateInternals.path = join(dir, 'world-state.json')
})

afterEach(() => {
  worldStateInternals.path = join(tmpdir(), `stale-${Date.now()}.json`)
})

describe('durable world state', () => {
  it('reads a missing file as empty maps', async () => {
    await expect(readCompanyWorldState()).resolves.toEqual({ cars: {}, employees: {} })
  })

  it('merges car and employee patches and reads them back', async () => {
    await reportCompanyWorldState({
      cars: { 'car-0': { from: 1, to: 2, t: 0.5, speed: 4, at: 100 } },
      employees: { 'emp-1': { companyId: 'c1', x: 3, z: -2, seated: false, at: 100 } },
    })
    await reportCompanyWorldState({
      cars: { 'car-1': { from: 3, to: 4, t: 0.1, speed: 6, at: 200 } },
      employees: { 'emp-1': { companyId: 'c1', x: 5, z: 1, seated: true, at: 200 } },
    })
    const state = await readCompanyWorldState()
    expect(Object.keys(state.cars).sort()).toEqual(['car-0', 'car-1'])
    expect(state.employees['emp-1']).toEqual({ companyId: 'c1', x: 5, z: 1, seated: true, at: 200 })
  })

  it('fails loud on a structurally invalid stored entry', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(worldStateInternals.path, '{"cars": {"car-0": {"from": "x"}}}', 'utf8')
    await expect(readCompanyWorldState()).rejects.toThrow('world state:')
  })
})
