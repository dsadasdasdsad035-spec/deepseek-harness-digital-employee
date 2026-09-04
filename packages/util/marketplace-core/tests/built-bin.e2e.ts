import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import type { ExecaError } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * Published-entry smoke: run `lib/bin.js` under plain Node so the bin's module
 * resolution, stdout contract, and exit codes are exercised exactly as
 * installed. This skips before build.
 */

const binPath = fileURLToPath(new URL('../lib/bin.js', import.meta.url))
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-market-package-bin-'))
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

describe.skipIf(!existsSync(binPath))('dsh-market-package bin', () => {
  it('prints the trust record and writes the archive', async () => {
    const root = await workspace()
    const output = join(root, 'signed.zip')
    const keyPath = join(root, 'key.pem')

    const generated = await execa('node', [
      binPath, join(root, 'src'), '--kind', 'tool', '--publisher-id', 'deepseek-local',
      '--generate-key', keyPath, '--output', output, '--trust-file', join(root, 'market-publishers.json'),
    ])
    expect(JSON.parse(generated.stdout)).toEqual([{
      id: 'deepseek-local',
      publicKeyPem: expect.stringContaining('BEGIN PUBLIC KEY'),
    }])
    expect((await readFile(keyPath, 'utf8')).includes('PRIVATE KEY')).toBe(true)
    expect(existsSync(output)).toBe(true)
    const trustFile = join(root, 'market-publishers.json')
    expect(JSON.parse(await readFile(trustFile, 'utf8'))).toEqual(JSON.parse(generated.stdout))

    const signed = await execa('node', [
      binPath, join(root, 'src'), '--kind', 'tool', '--publisher-id', 'deepseek-local',
      '--private-key', keyPath, '--output', output,
    ])
    expect(signed.stdout).toBe(generated.stdout)
  })

  it('fails with a stderr diagnostic and exit code one without writing output', async () => {
    const root = await workspace()
    const output = join(root, 'signed.zip')
    const failure = await execa('node', [
      binPath, join(root, 'src'), '--kind', 'tool', '--publisher-id', 'replace-with-publisher-id',
      '--generate-key', join(root, 'key.pem'), '--output', output,
    ]).catch((error: ExecaError) => error)

    expect(failure.exitCode).toBe(1)
    expect(failure.stderr).toContain('still the template placeholder')
    expect(existsSync(output)).toBe(false)
  })
})
