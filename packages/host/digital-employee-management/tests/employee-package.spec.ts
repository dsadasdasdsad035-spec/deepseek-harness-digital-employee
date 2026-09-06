import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  descriptorSignaturePayload,
  inspectZipArchive,
  parseEmployeePackageDescriptor,
  preparePackageArchive,
  signMarketplacePackage,
  verifyPackageFileHashes,
  verifyPublisherSignature,
} from '@deepseek-ai/dsh-marketplace-core'

const DESCRIPTOR = {
  format: 1, kind: 'employee', id: 'test-employee', version: '1.0.0',
  display: { name: 'Test Employee', description: 'Test.' },
  publisher: { id: 'test-publisher', signature: 'pending' },
  files: { 'AGENTS.md': 'a'.repeat(64), 'experts/reviewer.md': 'b'.repeat(64) },
  template: { displayName: 'Test Employee', description: 'Test.', personality: 'Test.', preset: 'standard' },
  instructions: 'AGENTS.md',
  experts: [],
  references: [],
}

describe('employee package format', () => {
  it('parses a valid employee descriptor', () => {
    const parsed = parseEmployeePackageDescriptor(DESCRIPTOR)
    expect(parsed.id).toBe('test-employee')
    expect(parsed.template).toMatchObject({ displayName: 'Test Employee', preset: 'standard' })
    expect(parsed.instructions).toBe('AGENTS.md')
  })

  it('rejects an unrecognized kind', () => {
    expect(() => parseEmployeePackageDescriptor({ ...DESCRIPTOR, kind: 'hook' })).toThrow()
  })

  it('round-trips signing and verification over the archive', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const built = await signMarketplacePackage({
      kind: 'employee',
      descriptor: DESCRIPTOR as never,
      files: {
        'AGENTS.md': new TextEncoder().encode('You are a test employee.\n'),
        'experts/reviewer.md': new TextEncoder().encode('Review material.\n'),
      },
      publisherId: 'test-publisher',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })
    const prepared = preparePackageArchive(await inspectZipArchive(built.archive), 'employee-package.json')
    const entry = prepared.entries.find(e => e.name === 'employee-package.json')
    if (entry === undefined) throw new Error('employee-package.json missing from archive')
    const raw = JSON.parse(new TextDecoder().decode(entry.bytes)) as { publisher: { signature: string } }
    const reparsed = parseEmployeePackageDescriptor(raw)
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(verifyPublisherSignature(descriptorSignaturePayload(reparsed), raw.publisher.signature, publicKeyPem)).toBe(true)
    expect(() => verifyPackageFileHashes(prepared, reparsed.files)).not.toThrow()
  })

  it('reports missing references when imported against an empty asset catalog', () => {
    // The import diagnostics path resolves descriptor.references against the
    // installed asset catalog; with references declared and none installed the
    // grouped missing list contains each reference.
    const withRefs = parseEmployeePackageDescriptor({
      ...DESCRIPTOR,
      references: [
        { kind: 'workflow', id: 'noop-workflows' },
        { kind: 'subagent', id: 'reviewer-subagents' },
      ],
    })
    expect(withRefs.references).toHaveLength(2)
    expect(withRefs.references.map(r => `${r.kind}:${r.id}`)).toEqual([
      'workflow:noop-workflows',
      'subagent:reviewer-subagents',
    ])
  })

  it('produces no missing diagnostics when references are empty', () => {
    const parsed = parseEmployeePackageDescriptor(DESCRIPTOR)
    expect(parsed.references).toEqual([])
  })

  it('rejects an expert instructions path absent from the file table', () => {
    expect(() => parseEmployeePackageDescriptor({
      ...DESCRIPTOR,
      experts: [{
        id: 'reviewer', name: 'Reviewer', responsibility: 'Review.',
        instructions: 'experts/missing.md',
        modelSettings: {},
        capabilities: { skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false },
        memoryAccess: [],
        delegation: { mode: 'one-shot', maxDepth: 1, maxConcurrency: 1, timeoutMs: 30_000 },
      }],
    })).toThrow()
  })
})
