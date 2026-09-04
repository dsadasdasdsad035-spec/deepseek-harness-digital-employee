import { execFile } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import {
  buildMarketplacePackage,
  descriptorSignaturePayload,
  parseMcpPackageDescriptor,
  parseToolPackageDescriptor,
  signMarketplacePackage,
  verifyPublisherSignature,
} from '../src/index.ts'

const run = promisify(execFile)
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function sourceRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-package-builder-'))
  roots.push(root)
  return root
}

function toolDescriptor(): Record<string, unknown> {
  return {
    format: 1,
    kind: 'tool',
    id: 'release-notes',
    version: '1.0.0',
    display: { name: 'Release notes', description: 'Prepares release notes.' },
    publisher: { id: 'replace-with-publisher-id', signature: 'REPLACE_WITH_ED25519_SIGNATURE_BASE64' },
    files: { 'plugin/index.js': 'GENERATED_SHA256' },
    permissions: ['filesystem-read'],
    tools: [{ name: 'release_notes', description: 'Prepare notes.', inputDescription: 'Repository path.' }],
    entry: 'plugin/index.js',
  }
}

function mcpDescriptor(): Record<string, unknown> {
  return {
    format: 1,
    kind: 'mcp',
    id: 'project-tracker',
    version: '1.0.0',
    display: { name: 'Project tracker', description: 'Reads project tickets.' },
    publisher: { id: 'replace-with-publisher-id', signature: 'REPLACE_WITH_ED25519_SIGNATURE_BASE64' },
    files: { 'README.md': 'GENERATED_SHA256' },
    servers: [{
      id: 'project-tracker',
      transport: 'streamable-http',
      url: 'https://mcp.example.test',
      headers: { Authorization: '' },
      credentialReferences: { Authorization: 'PROJECT_TRACKER_TOKEN' },
    }],
  }
}

async function writeSource(
  root: string,
  descriptor: Record<string, unknown>,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  const kind = descriptor['kind'] as 'tool' | 'mcp'
  await writeFile(join(root, `${kind}-package.json`), JSON.stringify(descriptor, null, 2))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), content)
  }
}

describe('buildMarketplacePackage', () => {
  it('builds a deterministic signed Tool package that passes installer checks', async () => {
    const root = await sourceRoot()
    const entry = 'throw new Error("must not execute during install")'
    const descriptor = {
      ...toolDescriptor(),
      files: { 'README.md': 'GENERATED_SHA256', 'plugin/index.js': 'GENERATED_SHA256' },
    }
    await writeSource(root, descriptor, { 'README.md': '# Release notes\n', 'plugin/index.js': entry })
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

    const first = await buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'tool',
      publisherId: 'deepseek-local',
      privateKeyPem,
    })
    const second = await buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'tool',
      publisherId: 'deepseek-local',
      privateKeyPem,
    })

    expect(Buffer.compare(first.archive, second.archive)).toBe(0)
    expect(first.trustRecord).toEqual({
      id: 'deepseek-local',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    })
    const entries = unzipSync(first.archive)
    expect(Object.keys(entries).sort()).toEqual(['README.md', 'plugin/index.js', 'tool-package.json'])
    const builtDescriptor = parseToolPackageDescriptor(JSON.parse(new TextDecoder().decode(entries['tool-package.json'])))
    expect(builtDescriptor.publisher.id).toBe('deepseek-local')
    expect(builtDescriptor.files['plugin/index.js']).toMatch(/^[a-f0-9]{64}$/)
    expect(verifyPublisherSignature(
      descriptorSignaturePayload(builtDescriptor),
      builtDescriptor.publisher.signature,
      first.trustRecord.publicKeyPem,
    )).toBe(true)
  })

  it('builds a signed MCP package preserving credential-reference-only headers', async () => {
    const root = await sourceRoot()
    await writeSource(root, mcpDescriptor(), { 'README.md': 'declarative MCP package\n' })
    const { privateKey } = generateKeyPairSync('ed25519')

    const built = await buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'mcp',
      publisherId: 'deepseek-local',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })

    const entries = unzipSync(built.archive)
    expect(Object.keys(entries).sort()).toEqual(['README.md', 'mcp-package.json'])
    const descriptor = parseMcpPackageDescriptor(JSON.parse(new TextDecoder().decode(entries['mcp-package.json'])))
    const server = descriptor.servers[0]!
    if (server.transport !== 'streamable-http') throw new Error('expected a streamable-http server')
    expect(server.headers).toEqual({ Authorization: '' })
    expect(server.credentialReferences).toEqual({ Authorization: 'PROJECT_TRACKER_TOKEN' })
  })

  it('builds a signed stdio MCP package whose implied permission carries into the signature', async () => {
    const root = await sourceRoot()
    const descriptor = {
      ...mcpDescriptor(),
      id: 'local-suite',
      files: { 'README.md': 'GENERATED_SHA256', 'server/index.js': 'GENERATED_SHA256' },
      servers: [{
        id: 'local-suite',
        transport: 'stdio',
        command: 'node',
        args: ['server/index.js', '--verbose'],
        env: { LOG_LEVEL: 'info', API_TOKEN: '' },
        credentialReferences: { API_TOKEN: 'LOCAL_SUITE_TOKEN' },
      }],
    }
    await writeSource(root, descriptor, {
      'README.md': '# Local suite\n',
      'server/index.js': '// stdio MCP server entry\n',
    })
    const { privateKey } = generateKeyPairSync('ed25519')

    const built = await buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'mcp',
      publisherId: 'deepseek-local',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })

    const entries = unzipSync(built.archive)
    expect(Object.keys(entries).sort()).toEqual(['README.md', 'mcp-package.json', 'server/index.js'])
    const parsed = parseMcpPackageDescriptor(JSON.parse(new TextDecoder().decode(entries['mcp-package.json'])))
    expect(parsed.permissions).toEqual(['subprocess'])
    expect(verifyPublisherSignature(
      descriptorSignaturePayload(parsed),
      parsed.publisher.signature,
      built.trustRecord.publicKeyPem,
    )).toBe(true)
  })

  it('rejects a still-placeholder publisher identity', async () => {
    const root = await sourceRoot()
    await writeSource(root, toolDescriptor(), { 'plugin/index.js': 'entry' })
    const { privateKey } = generateKeyPairSync('ed25519')

    await expect(buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'tool',
      publisherId: 'replace-with-publisher-id',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })).rejects.toThrow('still the template placeholder')
  })

  it('rejects a missing descriptor and a non-object descriptor', async () => {
    const root = await sourceRoot()
    const { privateKey } = generateKeyPairSync('ed25519')
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

    await expect(buildMarketplacePackage({ sourceDirectory: root, kind: 'tool', publisherId: 'deepseek-local', privateKeyPem }))
      .rejects.toThrow('must contain one root tool-package.json')
    await writeFile(join(root, 'tool-package.json'), '[]')
    await expect(buildMarketplacePackage({ sourceDirectory: root, kind: 'tool', publisherId: 'deepseek-local', privateKeyPem }))
      .rejects.toThrow('must contain a JSON object')
  })

  it('rejects a descriptor whose files entry is not an object', async () => {
    const root = await sourceRoot()
    const descriptor = { ...toolDescriptor(), files: [] }
    await writeSource(root, descriptor, { 'plugin/index.js': 'entry' })
    const { privateKey } = generateKeyPairSync('ed25519')

    await expect(buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'tool',
      publisherId: 'deepseek-local',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })).rejects.toThrow('must declare a "files" object')
  })

  it('rejects declared files missing from and undeclared files present in the source directory', async () => {
    const root = await sourceRoot()
    await writeSource(root, toolDescriptor(), {})
    const { privateKey } = generateKeyPairSync('ed25519')
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

    await expect(buildMarketplacePackage({ sourceDirectory: root, kind: 'tool', publisherId: 'deepseek-local', privateKeyPem }))
      .rejects.toThrow('declared package file "plugin/index.js" is missing from the package source')
    await mkdir(join(root, 'plugin'), { recursive: true })
    await writeFile(join(root, 'plugin', 'index.js'), 'entry')
    await writeFile(join(root, 'extra.txt'), 'undeclared')
    await expect(buildMarketplacePackage({ sourceDirectory: root, kind: 'tool', publisherId: 'deepseek-local', privateKeyPem }))
      .rejects.toThrow('package source file "extra.txt" is not declared')
  })

  it('rejects unsafe source entries', async () => {
    const root = await sourceRoot()
    await writeSource(root, toolDescriptor(), { 'plugin/index.js': 'entry' })
    await symlink('/etc/hosts', join(root, 'plugin', 'linked.js'))
    const { privateKey } = generateKeyPairSync('ed25519')

    await expect(buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'tool',
      publisherId: 'deepseek-local',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })).rejects.toThrow('unsafe source entry "plugin/linked.js"')
  })

  it('rejects unsupported non-regular source entries', { timeout: 20_000 }, async () => {
    const root = await sourceRoot()
    await writeSource(root, toolDescriptor(), { 'plugin/index.js': 'entry' })
    await run('mkfifo', [join(root, 'stream')])
    const { privateKey } = generateKeyPairSync('ed25519')

    await expect(buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'tool',
      publisherId: 'deepseek-local',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })).rejects.toThrow('unsupported source entry "stream"')
  })

  it('rejects non-Ed25519 private keys', { timeout: 20_000 }, async () => {
    const root = await sourceRoot()
    await writeSource(root, toolDescriptor(), { 'plugin/index.js': 'entry' })
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })

    await expect(buildMarketplacePackage({
      sourceDirectory: root,
      kind: 'tool',
      publisherId: 'deepseek-local',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    })).rejects.toThrow('publisher key must be an Ed25519 private key')
  })

  it('signs an in-memory package and reports inventory mismatches', async () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const base = {
      ...toolDescriptor(),
      publisher: { id: 'deepseek-local', signature: 'pending' },
    }

    const built = await signMarketplacePackage({
      kind: 'tool',
      descriptor: base,
      files: { 'plugin/index.js': new TextEncoder().encode('entry') },
      publisherId: 'deepseek-local',
      privateKeyPem,
    })
    expect(built.archive.byteLength).toBeGreaterThan(0)

    await expect(signMarketplacePackage({
      kind: 'tool',
      descriptor: base,
      files: {},
      publisherId: 'deepseek-local',
      privateKeyPem,
    })).rejects.toThrow('missing from the package source')
    await expect(signMarketplacePackage({
      kind: 'tool',
      descriptor: { ...base, files: {} },
      files: { 'plugin/index.js': new TextEncoder().encode('entry') },
      publisherId: 'deepseek-local',
      privateKeyPem,
    })).rejects.toThrow('is not declared in tool-package.json')
  })
})
