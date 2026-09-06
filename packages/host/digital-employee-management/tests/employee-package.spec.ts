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
})
