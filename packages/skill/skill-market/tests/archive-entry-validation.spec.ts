import { describe, expect, it } from 'vitest'
import { inspectZipArchive } from '@deepseek-ai/dsh-marketplace-core'
import { validateArchive } from '../src/market-service.ts'
import { buildDeclaredZip, buildZip } from './fixtures/zip.ts'

const encoder = new TextEncoder()

function skillMd(name = 'demo-skill'): Uint8Array {
  return encoder.encode(`---
name: ${name}
description: Demo skill
---

Use this skill.
`)
}

async function validate(entries: Parameters<typeof buildDeclaredZip>[0]) {
  const inspected = await inspectZipArchive(buildDeclaredZip(entries))
  return await validateArchive({
    entries: inspected.entries.map(entry => ({
      rawName: entry.name,
      bytes: entry.bytes,
      declaredOriginalSize: entry.declaredBytes,
      kind: entry.kind,
    })),
    totalBytes: inspected.totalBytes,
  })
}

describe('archive entry validation', () => {
  it.each([
    ['/absolute.txt', 'absolute'],
    ['C:/drive.txt', 'drive'],
    ['//server/share.txt', 'UNC'],
    ['demo-skill\\file.txt', 'backslash'],
    ['demo-skill/a\0b.txt', 'NUL'],
    ['demo-skill/./file.txt', 'dot segment'],
    ['demo-skill/../file.txt', 'traversal'],
  ])('rejects %s paths (%s)', async (name) => {
    await expect(validate([
      { name: 'demo-skill/SKILL.md', data: skillMd() },
      { name, data: encoder.encode('unsafe') },
    ])).rejects.toMatchObject({ code: 'unsafe-path' })
  })

  it('rejects duplicate normalized file paths', async () => {
    const inspected = await inspectZipArchive(await buildZip([
      { name: 'demo-skill/SKILL.md', data: skillMd() },
      { name: 'demo-skill/file.txt', data: encoder.encode('first') },
      { name: 'demo-skill/file.txt', data: encoder.encode('second') },
    ]))
    await expect(validateArchive({
      entries: inspected.entries.map(entry => ({
        rawName: entry.name,
        bytes: entry.bytes,
        declaredOriginalSize: entry.declaredBytes,
        kind: entry.kind,
      })),
      totalBytes: inspected.totalBytes,
    })).rejects.toMatchObject({ code: 'bad-zip' })
  })

  it.each([
    ['symbolic link', 0o120777 << 16],
    ['character device', 0o020600 << 16],
  ])('rejects a Unix %s entry', async (_label, attrs) => {
    await expect(validate([
      { name: 'demo-skill/SKILL.md', data: skillMd() },
      { name: 'demo-skill/unsupported', data: encoder.encode('target'), os: 3, attrs },
    ])).rejects.toMatchObject({ code: 'unsupported-entry' })
  })

  it('rejects multiple enclosing roots', async () => {
    await expect(validate([
      { name: 'demo-skill/SKILL.md', data: skillMd() },
      { name: 'other-skill/SKILL.md', data: skillMd('other-skill') },
    ])).rejects.toMatchObject({ code: 'bad-zip' })
  })

  it('rejects root files mixed with an enclosing skill directory', async () => {
    await expect(validate([
      { name: 'demo-skill/SKILL.md', data: skillMd() },
      { name: 'README.md', data: encoder.encode('mixed') },
    ])).rejects.toMatchObject({ code: 'bad-zip' })
  })

  it('accepts a direct-root bundle with nested files', async () => {
    const prepared = await validate([
      { name: 'SKILL.md', data: skillMd() },
      { name: 'guides/guide.md', data: encoder.encode('guide') },
    ])
    expect([...prepared.files.keys()]).toEqual(['SKILL.md', 'guides/guide.md'])
  })

  it('accepts one enclosing directory with nested files', async () => {
    const prepared = await validate([
      { name: 'bundle/SKILL.md', data: skillMd() },
      { name: 'bundle/src/index.md', data: encoder.encode('source') },
    ])
    expect([...prepared.files.keys()]).toEqual(['SKILL.md', 'src/index.md'])
  })
})
