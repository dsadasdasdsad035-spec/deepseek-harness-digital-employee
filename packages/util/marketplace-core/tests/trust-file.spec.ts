import { chmod, mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { combineTrustedPublisherRecords, readTrustedPublisherFileSync } from '../src/trust-file.ts'

const roots: string[] = []
const key = '-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----\n'

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await chmod(join(root, 'loose.json'), 0o600).catch(() => {})
    await rm(root, { recursive: true, force: true })
  }
})

async function trustRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-trust-file-'))
  roots.push(root)
  return root
}

async function writeTrust(path: string, content: string, mode = 0o600): Promise<string> {
  await writeFile(path, content, { mode })
  return path
}

describe('readTrustedPublisherFileSync', () => {
  it('returns null for an absent file and records for a valid one', async () => {
    const root = await trustRoot()
    const absent = join(root, 'absent.json')
    const present = await writeTrust(join(root, 'present.json'), JSON.stringify([
      { id: 'deepseek-local', publicKeyPem: key },
    ]))

    expect(readTrustedPublisherFileSync(absent)).toBeNull()
    expect(readTrustedPublisherFileSync(present)).toEqual([{ id: 'deepseek-local', publicKeyPem: key }])
  })

  it('rejects symlinks, directories, and group or world writable files', async () => {
    const root = await trustRoot()
    const target = await writeTrust(join(root, 'target.json'), '[]')
    const link = join(root, 'link.json')
    await symlink(target, link)
    await mkdir(join(root, 'directory.json'))
    const loose = join(root, 'loose.json')
    const open = join(root, 'open.json')
    await writeTrust(loose, '[]')
    await writeTrust(open, '[]')
    await chmod(loose, 0o660)
    await chmod(open, 0o602)

    expect(() => readTrustedPublisherFileSync(link)).toThrow('symbolic link')
    expect(() => readTrustedPublisherFileSync(join(root, 'directory.json'))).toThrow('not a regular file')
    if (process.platform !== 'win32') {
      expect(() => readTrustedPublisherFileSync(loose)).toThrow('must not be group or world writable')
      expect(() => readTrustedPublisherFileSync(open)).toThrow('must not be group or world writable')
    }
  })

  it('rejects malformed JSON, non-arrays, and invalid records', async () => {
    const root = await trustRoot()
    const invalid = await writeTrust(join(root, 'invalid.json'), '{')
    const notArray = await writeTrust(join(root, 'not-array.json'), '{}')
    const notObject = await writeTrust(join(root, 'not-object.json'), '["x"]')
    const noId = await writeTrust(join(root, 'no-id.json'), JSON.stringify([{ publicKeyPem: key }]))
    const noKey = await writeTrust(join(root, 'no-key.json'), JSON.stringify([{ id: 'x' }]))
    const duplicate = await writeTrust(join(root, 'duplicate.json'), JSON.stringify([
      { id: 'x', publicKeyPem: key },
      { id: 'x', publicKeyPem: key },
    ]))

    expect(() => readTrustedPublisherFileSync(invalid)).toThrow('must contain a JSON array')
    expect(() => readTrustedPublisherFileSync(notArray)).toThrow('must contain a JSON array')
    expect(() => readTrustedPublisherFileSync(notObject)).toThrow('record 0 is not an object')
    expect(() => readTrustedPublisherFileSync(noId)).toThrow('record 0 has no publisher id')
    expect(() => readTrustedPublisherFileSync(noKey)).toThrow('record "x" has no public key')
    expect(() => readTrustedPublisherFileSync(duplicate)).toThrow('appears more than once')
  })

  it('rethrows non-absence stat failures', async () => {
    const root = await trustRoot()
    const file = await writeTrust(join(root, 'file.json'), '[]')
    const nested = join(file, 'nested.json')

    expect(() => readTrustedPublisherFileSync(nested)).toThrow()
  })
})

describe('combineTrustedPublisherRecords', () => {
  it('combines disjoint sources and rejects duplicate ids', () => {
    const inline = [{ id: 'inline-publisher', publicKeyPem: key }]
    const fromFile = [{ id: 'file-publisher', publicKeyPem: key }]

    expect(combineTrustedPublisherRecords(inline, fromFile, '/trust.json')).toEqual([...inline, ...fromFile])
    expect(() => combineTrustedPublisherRecords(
      [{ id: 'same', publicKeyPem: 'one' }],
      [{ id: 'same', publicKeyPem: 'two' }],
      '/trust.json',
    )).toThrow('configured more than once')
    expect(() => combineTrustedPublisherRecords(
      [{ id: 'same', publicKeyPem: 'one' }, { id: 'same', publicKeyPem: 'one' }],
      [],
      '/trust.json',
    )).toThrow('configured more than once')
  })
})
