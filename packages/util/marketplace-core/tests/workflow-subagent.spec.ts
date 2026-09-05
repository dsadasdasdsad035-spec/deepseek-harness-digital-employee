import { describe, expect, it } from 'vitest'
import {
  descriptorSignaturePayload,
  parseSubagentPackageDescriptor,
  parseWorkflowPackageDescriptor,
  verifyPublisherSignature,
} from '../src/index.ts'
import { generateKeyPairSync, sign } from 'node:crypto'

const BASE = {
  format: 1,
  version: '1.0.0',
  display: { name: 'Suite', description: 'Test package.' },
  publisher: { id: 'deepseek-local', signature: 'pending' },
}

const WORKFLOW = {
  ...BASE,
  kind: 'workflow',
  id: 'workflow-suite',
  files: { 'workflows/noop.js': 'a'.repeat(64) },
  workflows: [{ id: 'noop', entry: 'workflows/noop.js', description: 'No-op.' }],
}

const SUBAGENT = {
  ...BASE,
  kind: 'subagent',
  id: 'subagent-suite',
  files: { 'subagents/reviewer.md': 'a'.repeat(64) },
  subagents: [{
    id: 'reviewer',
    instructions: 'subagents/reviewer.md',
    tools: ['read'],
    delegation: { mode: 'one-shot', maxDepth: 1, maxConcurrency: 1, timeoutMs: 30_000 },
  }],
}

describe('parseWorkflowPackageDescriptor', () => {
  it('implies the subprocess permission', () => {
    const parsed = parseWorkflowPackageDescriptor(WORKFLOW)
    expect(parsed.permissions).toContain('subprocess')
    expect(parsed.workflows[0]).toMatchObject({ id: 'noop' })
  })

  it('rejects entries whose script is not in the file table', () => {
    expect(() => parseWorkflowPackageDescriptor({
      ...WORKFLOW,
      workflows: [{ id: 'noop', entry: 'workflows/missing.js', description: 'No-op.' }],
    })).toThrow(/not a declared package file/)
  })
})

describe('parseSubagentPackageDescriptor', () => {
  it('implies the subprocess permission and keeps persona fields', () => {
    const parsed = parseSubagentPackageDescriptor(SUBAGENT)
    expect(parsed.permissions).toContain('subprocess')
    expect(parsed.subagents[0]).toMatchObject({ id: 'reviewer', tools: ['read'] })
  })

  it('rejects personas whose instructions are absent or blank, and provider-code shapes', () => {
    expect(() => parseSubagentPackageDescriptor({
      ...SUBAGENT,
      subagents: [{ ...SUBAGENT.subagents[0], instructions: 'subagents/missing.md' }],
    })).toThrow(/not a declared package file/)
    expect(() => parseSubagentPackageDescriptor({
      ...SUBAGENT,
      subagents: [{ ...SUBAGENT.subagents[0], instructions: '  ' }],
    })).toThrow()
    // The strict schema itself rejects unknown provider-code fields.
    expect(() => parseSubagentPackageDescriptor({
      ...SUBAGENT,
      subagents: [{ ...SUBAGENT.subagents[0], command: 'node' }],
    })).toThrow()
  })

  it('round-trips a signature over the parsed payload', () => {
    const parsed = parseSubagentPackageDescriptor(SUBAGENT)
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const signature = sign(null, descriptorSignaturePayload(parsed), privateKey).toString('base64')
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(verifyPublisherSignature(descriptorSignaturePayload(parsed), signature, publicKeyPem)).toBe(true)
  })
})
