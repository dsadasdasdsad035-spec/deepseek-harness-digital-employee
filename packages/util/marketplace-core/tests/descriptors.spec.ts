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

  it('accepts a mixed-transport MCP package and implies subprocess disclosure', () => {
    const descriptor = parseMcpPackageDescriptor({
      format: 1,
      kind: 'mcp',
      id: 'mixed-suite',
      version: '1.0.0',
      display: { name: 'Mixed suite', description: 'Local and remote MCP servers.' },
      publisher: { id: 'deepseek-local', signature: 'base64-signature' },
      files: { 'server/index.js': 'a'.repeat(64) },
      servers: [
        {
          id: 'local-suite',
          transport: 'stdio',
          command: 'node',
          args: ['server/index.js', '--verbose'],
          env: { LOG_LEVEL: 'info', API_TOKEN: '' },
          credentialReferences: { API_TOKEN: 'MIXED_SUITE_TOKEN' },
        },
        {
          id: 'remote-suite',
          transport: 'streamable-http',
          url: 'https://mcp.example.test',
          headers: {},
          credentialReferences: {},
        },
      ],
    })
    expect(descriptor.permissions).toEqual(['subprocess'])
    expect(descriptor.servers).toHaveLength(2)
  })

  it('keeps declarative packages free of an execution disclosure', () => {
    const descriptor = parseMcpPackageDescriptor({
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
        headers: { Authorization: '' },
        credentialReferences: { Authorization: 'PROJECT_TRACKER_TOKEN' },
      }],
    })
    expect(descriptor.permissions).toEqual([])
  })

  it('rejects a fixed value on a credential-backed stdio environment slot', () => {
    expect(() => parseMcpPackageDescriptor({
      format: 1,
      kind: 'mcp',
      id: 'local-suite',
      version: '1.0.0',
      display: { name: 'Local suite', description: 'Local MCP server.' },
      publisher: { id: 'deepseek-local', signature: 'base64-signature' },
      files: { 'server/index.js': 'a'.repeat(64) },
      servers: [{
        id: 'local-suite',
        transport: 'stdio',
        command: 'node',
        args: ['server/index.js'],
        env: { API_TOKEN: 'secret-value' },
        credentialReferences: { API_TOKEN: 'LOCAL_SUITE_TOKEN' },
      }],
    })).toThrow('MCP environment variable "API_TOKEN" must not contain a credential value')
  })

  it('rejects stdio script arguments outside the signed file table', () => {
    const descriptor = {
      format: 1,
      kind: 'mcp',
      id: 'local-suite',
      version: '1.0.0',
      display: { name: 'Local suite', description: 'Local MCP server.' },
      publisher: { id: 'deepseek-local', signature: 'base64-signature' },
      files: { 'server/index.js': 'a'.repeat(64) },
      servers: [{
        id: 'local-suite',
        transport: 'stdio',
        command: 'node',
        args: ['../escape.js'],
        env: {},
        credentialReferences: {},
      }],
    } as const
    expect(() => parseMcpPackageDescriptor(descriptor)).toThrow('is not a declared package file')
    expect(() => parseMcpPackageDescriptor({
      ...descriptor,
      servers: [{ ...descriptor.servers[0], args: ['/etc/passwd'] }],
    })).toThrow('is not a declared package file')
  })

  it('rejects stdio commands that are not bare interpreter names', () => {
    const descriptor = {
      format: 1,
      kind: 'mcp',
      id: 'local-suite',
      version: '1.0.0',
      display: { name: 'Local suite', description: 'Local MCP server.' },
      publisher: { id: 'deepseek-local', signature: 'base64-signature' },
      files: { 'server/index.js': 'a'.repeat(64) },
      servers: [{
        id: 'local-suite',
        transport: 'stdio',
        command: './server/index.js',
        args: ['server/index.js'],
        env: {},
        credentialReferences: {},
      }],
    } as const
    expect(() => parseMcpPackageDescriptor(descriptor)).toThrow()
    expect(() => parseMcpPackageDescriptor({
      ...descriptor,
      servers: [{ ...descriptor.servers[0], command: '/usr/bin/python3' }],
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
    expect(() => verifyPackageFileHashes(archive, {
      'plugin/index.js': '0'.repeat(64),
    })).toThrow('hash mismatch')
  })
})
