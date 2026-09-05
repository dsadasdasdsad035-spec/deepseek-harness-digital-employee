import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { generateKeyPairSync as generateKeyPair } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { runMarketPackageCli } from '../src/cli.ts'
import { parseToolPackageDescriptor } from '../src/descriptors.ts'

const roots: string[] = []
const originalCwd = process.cwd()

afterEach(async () => {
  process.chdir(originalCwd)
  for (const root of roots.splice(0)) {
    await chmod(join(root, 'loose.pem'), 0o600).catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-market-package-cli-'))
  roots.push(root)
  await mkdir(join(root, 'src', 'plugin'), { recursive: true })
  await writeFile(join(root, 'src', 'tool-package.json'), JSON.stringify({
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
  }))
  await writeFile(join(root, 'src', 'plugin', 'index.js'), 'export default function () {}\n')
  return root
}

async function writeKey(root: string, mode = 0o600): Promise<string> {
  const { privateKey } = generateKeyPairSync('ed25519')
  const path = join(root, 'key.pem')
  await writeFile(path, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { mode })
  return path
}

function baseArgs(root: string, keyPath: string, extra: readonly string[] = []): string[] {
  return [join(root, 'src'), '--kind', 'tool', '--publisher-id', 'deepseek-local', '--private-key', keyPath, ...extra]
}

describe('runMarketPackageCli', () => {
  it('builds a package and reports the default output path and trust record', async () => {
    const root = await workspace()
    const keyPath = await writeKey(root)

    process.chdir(root)
    try {
      const outcome = await runMarketPackageCli(baseArgs(root, keyPath))

      expect(outcome.ok && outcome.outputPath.endsWith(`${sep}release-notes.zip`)).toBe(true)
      if (!outcome.ok) throw new Error('unreachable')
      const entries = unzipSync(await readFile(outcome.outputPath))
      const descriptor = parseToolPackageDescriptor(JSON.parse(new TextDecoder().decode(entries['tool-package.json'])))
      expect(descriptor.publisher.id).toBe('deepseek-local')
      expect(outcome.trustRecord.id).toBe('deepseek-local')
      expect(outcome.trustRecord.publicKeyPem).toContain('BEGIN PUBLIC KEY')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('writes the archive to an explicit output path', async () => {
    const root = await workspace()
    const keyPath = await writeKey(root)
    const output = join(root, 'signed.zip')

    const outcome = await runMarketPackageCli(baseArgs(root, keyPath, ['--output', output]))

    expect(outcome).toMatchObject({ ok: true, outputPath: output })
  })

  it('generates an owner-only private key when requested', async () => {
    const root = await workspace()
    const keyPath = join(root, 'generated-key.pem')

    const outcome = await runMarketPackageCli([
      join(root, 'src'), '--kind', 'tool', '--publisher-id', 'deepseek-local', '--generate-key', keyPath,
    ])

    expect(outcome).toMatchObject({ ok: true })
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600)
    expect(await readFile(keyPath, 'utf8')).toContain('PRIVATE KEY')
  })

  it('rejects argument mistakes with usage', async () => {
    const root = await workspace()
    const keyPath = await writeKey(root)

    expect(await runMarketPackageCli([])).toMatchObject({ ok: false, message: expect.stringContaining('Usage:') })
    expect(await runMarketPackageCli(['--kind', 'tool'])).toMatchObject({ ok: false, message: expect.stringContaining('exactly one source directory') })
    expect(await runMarketPackageCli([join(root, 'src'), '--kind', 'plugin'])).toMatchObject({ ok: false, message: expect.stringContaining('--kind must be tool, mcp, hook, workflow, or subagent') })
    expect(await runMarketPackageCli([join(root, 'src'), '--kind', 'tool'])).toMatchObject({ ok: false, message: expect.stringContaining('--publisher-id is required') })
    expect(await runMarketPackageCli([join(root, 'src'), '--kind', 'tool', '--publisher-id', 'x']))
      .toMatchObject({ ok: false, message: expect.stringContaining('one of --private-key or --generate-key') })
    expect(await runMarketPackageCli([join(root, 'src'), '--kind', 'tool', '--publisher-id', 'x', '--private-key', keyPath, '--generate-key', keyPath]))
      .toMatchObject({ ok: false, message: expect.stringContaining('exactly one of --private-key or --generate-key') })
    expect(await runMarketPackageCli([join(root, 'src'), '--unknown', '1'])).toMatchObject({ ok: false, message: expect.stringContaining('Usage:') })
  })

  it('rejects unreadable, missing, and insecure private key files', async () => {
    const root = await workspace()
    const secureKey = await writeKey(root)
    const looseKey = join(root, 'loose.pem')
    const { privateKey } = generateKeyPairSync('ed25519')
    await writeFile(looseKey, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { mode: 0o644 })

    expect(await runMarketPackageCli(baseArgs(root, join(root, 'missing.pem'))))
      .toMatchObject({ ok: false, message: expect.stringContaining('cannot read private key file') })
    if (process.platform !== 'win32') {
      expect(await runMarketPackageCli(baseArgs(root, looseKey)))
        .toMatchObject({ ok: false, message: expect.stringContaining('must not be group or world readable') })
    }
    expect(await runMarketPackageCli(baseArgs(root, secureKey))).toMatchObject({ ok: true })
  })

  it('reports key-generation write failures', async () => {
    const root = await workspace()

    const outcome = await runMarketPackageCli([
      join(root, 'src'), '--kind', 'tool', '--publisher-id', 'deepseek-local',
      '--generate-key', join(root, 'key.pem', 'nested'),
    ])

    expect(outcome).toMatchObject({ ok: false, message: expect.stringContaining('cannot write private key file') })
  })

  it('refuses to overwrite an existing generated key and reports build failures without writing output', async () => {
    const root = await workspace()
    const keyPath = await writeKey(root)
    const output = join(root, 'signed.zip')

    const overwrite = await runMarketPackageCli([
      join(root, 'src'), '--kind', 'tool', '--publisher-id', 'deepseek-local',
      '--generate-key', keyPath, '--output', output,
    ])
    expect(overwrite).toMatchObject({ ok: false, message: expect.stringContaining('refusing to overwrite') })

    const placeholder = await runMarketPackageCli(baseArgs(root, keyPath, [
      '--output', output, '--publisher-id', 'replace-with-publisher-id',
    ]))
    expect(placeholder).toMatchObject({ ok: false, message: expect.stringContaining('still the template placeholder') })
    expect(await stat(output).then(() => true, () => false)).toBe(false)
  })

  it('creates an owner-only trust file and merges by publisher id', async () => {
    const root = await workspace()
    const keyPath = await writeKey(root)
    const trustFile = join(root, 'market-publishers.json')

    const created = await runMarketPackageCli(baseArgs(root, keyPath, ['--trust-file', trustFile]))
    expect(created).toMatchObject({ ok: true })
    expect((await stat(trustFile)).mode & 0o777).toBe(0o600)
    const firstRecord = JSON.parse(await readFile(trustFile, 'utf8')) as Array<{ id: string }>
    expect(firstRecord).toMatchObject([{ id: 'deepseek-local' }])

    const secondKey = join(root, 'second.pem')
    const { privateKey } = generateKeyPair('ed25519')
    await writeFile(secondKey, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { mode: 0o600 })
    const merged = await runMarketPackageCli(baseArgs(root, secondKey, [
      '--trust-file', trustFile, '--publisher-id', 'second-publisher',
    ]))
    expect(merged).toMatchObject({ ok: true })
    const mergedRecords = JSON.parse(await readFile(trustFile, 'utf8')) as Array<{ id: string }>
    expect(mergedRecords.map(record => record.id).sort()).toEqual(['deepseek-local', 'second-publisher'])

    const idempotent = await runMarketPackageCli(baseArgs(root, keyPath, ['--trust-file', trustFile]))
    expect(idempotent).toMatchObject({ ok: true })
    expect(JSON.parse(await readFile(trustFile, 'utf8'))).toEqual(mergedRecords)
  })

  it('refuses a differing public key and malformed trust files without writing the archive', async () => {
    const root = await workspace()
    const keyPath = await writeKey(root)
    const trustFile = join(root, 'market-publishers.json')
    const output = join(root, 'signed.zip')

    const created = await runMarketPackageCli(baseArgs(root, keyPath, [
      '--trust-file', trustFile, '--output', output,
    ]))
    expect(created).toMatchObject({ ok: true })
    expect(await stat(output).then(() => true, () => false)).toBe(true)
    await rm(output)

    const rotationKey = join(root, 'rotation.pem')
    const { privateKey } = generateKeyPair('ed25519')
    await writeFile(rotationKey, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { mode: 0o600 })
    const refused = await runMarketPackageCli(baseArgs(root, rotationKey, [
      '--trust-file', trustFile, '--output', output,
    ]))
    expect(refused).toMatchObject({ ok: false, message: expect.stringContaining('refusing to replace the public key') })
    expect(await stat(output).then(() => true, () => false)).toBe(false)

    await writeFile(trustFile, '{', { mode: 0o600 })
    const malformed = await runMarketPackageCli(baseArgs(root, keyPath, [
      '--trust-file', trustFile, '--output', output,
    ]))
    expect(malformed).toMatchObject({ ok: false, message: expect.stringContaining('cannot update trusted-publisher file') })
    expect(await stat(output).then(() => true, () => false)).toBe(false)
  })
})
