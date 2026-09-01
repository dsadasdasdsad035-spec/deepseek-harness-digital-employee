import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  descriptorSignaturePayload,
  preparePackageArchive,
  parseMcpPackageDescriptor,
  parseToolPackageDescriptor,
  resolveTrustedPublisher,
  verifyPublisherSignature,
  verifyPackageFileHashes,
} from '../src/descriptors.ts'
import type { InspectedArchive } from '../src/archive.ts'

describe('marketplace package descriptors', () => {
  it('accepts a versioned Tool package with declared permissions', () => {
    expect(parseToolPackageDescriptor({
      format: 1,
      kind: 'tool',
      id: 'release-notes',
      version: '1.0.0',
      display: { name: 'Release notes', description: 'Prepares release notes.' },
      publisher: { id: 'deepseek-local', signature: 'base64-signature' },
      files: { 'plugin/index.js': 'a'.repeat(64) },
      permissions: ['filesystem-read'],
      tools: [{ name: 'release_notes', description: 'Prepare notes.', inputDescription: 'Repository path.' }],
      entry: 'plugin/index.js',
    })).toMatchObject({ id: 'release-notes', tools: [{ name: 'release_notes' }] })
  })

  it('rejects unresolved credential values in declarative MCP packages', () => {
    expect(() => parseMcpPackageDescriptor({
      format: 1,
      kind: 'mcp',
      id: 'project-tracker',
      version: '1.0.0',
      display: { name: 'Project tracker', description: 'Reads project tickets.' },
      publisher: { id: 'deepseek-local', signature: 'base64-signature' },
      files: {},
      servers: [{
        id: 'project-tracker',
        transport: 'streamable-http',
        url: 'https://mcp.example.test',
        headers: { Authorization: 'Bearer secret' },
        credentialReferences: { Authorization: 'PROJECT_TRACKER_TOKEN' },
      }],
    })).toThrow('must not contain a credential value')
  })

  it('accepts an endpoint reference without embedding a fixed MCP URL', () => {
    expect(parseMcpPackageDescriptor({
      format: 1,
      kind: 'mcp',
      id: 'marketplace-test-mcp',
      version: '1.0.0',
      display: { name: 'Marketplace test MCP', description: 'Offline marketplace fixture.' },
      publisher: { id: 'deepseek-marketplace-test', signature: 'base64-signature' },
      files: {},
      servers: [{
        id: 'marketplace-test-mcp',
        transport: 'streamable-http',
        endpointReference: 'MARKETPLACE_TEST_MCP_ENDPOINT',
        headers: { Authorization: '' },
        credentialReferences: { Authorization: 'MARKETPLACE_TEST_MCP_TOKEN' },
      }],
    })).toMatchObject({
      servers: [{ endpointReference: 'MARKETPLACE_TEST_MCP_ENDPOINT' }],
    })
  })

  it('requires exactly one fixed URL or endpoint reference per MCP server', () => {
    const descriptor = {
      format: 1,
      kind: 'mcp',
      id: 'marketplace-test-mcp',
      version: '1.0.0',
      display: { name: 'Marketplace test MCP', description: 'Offline marketplace fixture.' },
      publisher: { id: 'deepseek-marketplace-test', signature: 'base64-signature' },
      files: {},
      servers: [{
        id: 'marketplace-test-mcp',
        transport: 'streamable-http',
        headers: {},
        credentialReferences: {},
      }],
    }
    expect(() => parseMcpPackageDescriptor(descriptor)).toThrow()
    expect(() => parseMcpPackageDescriptor({
      ...descriptor,
      servers: [{
        ...descriptor.servers[0],
        url: 'https://mcp.example.test',
        endpointReference: 'MARKETPLACE_TEST_MCP_ENDPOINT',
      }],
    })).toThrow()
  })

  it('accepts only a trusted publisher signature over descriptor bytes', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const payload = new TextEncoder().encode('descriptor bytes')
    const signature = sign(null, payload, privateKey).toString('base64')

    expect(verifyPublisherSignature(payload, signature, publicKey.export({ type: 'spki', format: 'pem' }).toString())).toBe(true)
    expect(verifyPublisherSignature(payload, signature, 'not a public key')).toBe(false)
  })

  it('resolves publisher keys only from a configured unique local trust list', () => {
    expect(resolveTrustedPublisher([
      { id: 'deepseek-local', publicKeyPem: '-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----' },
    ], 'deepseek-local')).toContain('BEGIN PUBLIC KEY')
    expect(resolveTrustedPublisher([], 'deepseek-local')).toBeUndefined()
    expect(() => resolveTrustedPublisher([
      { id: 'deepseek-local', publicKeyPem: 'first' },
      { id: 'deepseek-local', publicKeyPem: 'second' },
    ], 'deepseek-local')).toThrow('configured more than once')
  })

  it('uses a stable detached-signature payload that excludes the signature value', () => {
    const descriptor = parseToolPackageDescriptor({
      format: 1,
      kind: 'tool',
      id: 'release-notes',
      version: '1.0.0',
      display: { name: 'Release notes', description: 'Prepares release notes.' },
      publisher: { id: 'deepseek-local', signature: 'first' },
      files: { 'plugin/index.js': 'a'.repeat(64) },
      permissions: ['filesystem-read'],
      tools: [{ name: 'release_notes', description: 'Prepare notes.', inputDescription: 'Repository path.' }],
      entry: 'plugin/index.js',
    })
    const changed = { ...descriptor, publisher: { ...descriptor.publisher, signature: 'second' } }

    expect(descriptorSignaturePayload(descriptor)).toEqual(descriptorSignaturePayload(changed))
  })

  it('rejects unsafe and duplicate normalized archive paths before publication', () => {
    const archive = (names: readonly string[]): InspectedArchive => ({
      entries: names.map(name => ({
        name,
        bytes: new TextEncoder().encode('{}'),
        kind: 'regular' as const,
      })),
      totalBytes: names.length * 2,
    })

    expect(() => preparePackageArchive(archive(['../tool-package.json']), 'tool-package.json'))
      .toThrow('unsafe archive path')
    expect(() => preparePackageArchive(
      archive(['tool-package.json', './tool-package.json']),
      'tool-package.json',
    )).toThrow('duplicate archive path')
  })

  it('rejects package content that does not match its signed file table', () => {
    const archive: InspectedArchive = {
      entries: [{
        name: 'plugin/index.js',
        bytes: new TextEncoder().encode('actual code'),
        kind: 'regular',
      }],
      totalBytes: 11,
    }
    expect(() => {
      verifyPackageFileHashes(archive, {
        'plugin/index.js': '0'.repeat(64),
      })
    }).toThrow('hash mismatch')
  })
})
