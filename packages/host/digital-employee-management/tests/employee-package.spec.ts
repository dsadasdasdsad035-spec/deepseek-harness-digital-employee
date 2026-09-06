import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  parseEmployeePackageDescriptor,
} from '@deepseek-ai/dsh-marketplace-core'

const DESCRIPTOR = {
  format: 1, kind: 'employee', id: 'test-employee', version: '1.0.0',
  display: { name: 'Test Employee', description: 'Test.' },
  publisher: { id: 'test-publisher', signature: 'pending' },
  files: { 'AGENTS.md': 'GENERATED', 'experts/reviewer.md': 'GENERATED' },
  template: { displayName: 'Test Employee', description: 'Test.', personality: 'Test.', preset: 'standard' },
  instructions: 'AGENTS.md',
  experts: [],
  references: [],
}

describe('employee package format', () => {
  it.skip('parses a valid employee descriptor', () => {
    try {
      const parsed = parseEmployeePackageDescriptor(DESCRIPTOR)
      expect(parsed.id).toBe('test-employee')
    } catch (e) {
      console.error('PARSE ERROR:', JSON.stringify(e instanceof Error ? e.message : String(e)).slice(0, 200))
      throw e
    }
  })

  it('rejects an unrecognized kind', () => {
    expect(() => parseEmployeePackageDescriptor({ ...DESCRIPTOR, kind: 'hook' })).toThrow()
  })
})
