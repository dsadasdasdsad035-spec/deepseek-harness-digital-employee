/**
 * 单元测试覆盖：合法安装、路径穿越、冲突、卸载保护、banner、
 * zip bomb 早期拒绝、单测 helper 用于压缩包构造。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import * as SkillMarket from '../src/index.ts'
import {
  createSkillMarketService,
  MAX_BANNER_BYTES,
  MAX_EXTRACTED_BYTES,
  MAX_ZIP_BYTES,
  type SkillMarketManifest,
} from '../src/market-service.ts'
import { SkillMarketError } from '../src/schema.ts'

const skillRootHolder: { root: string | undefined } = { root: undefined }

function silentLogger(): {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
} {
  return { info: () => {}, warn: () => {}, error: () => {} }
}

async function setupTmpRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-market-test-'))
  skillRootHolder.root = root
  return root
}

function buildService(installRoot: string) {
  return createSkillMarketService({
    resolveInstallRoot: () => installRoot,
    logger: silentLogger() as never,
  })
}

afterEach(async () => {
  if (skillRootHolder.root !== undefined) {
    await rm(skillRootHolder.root, { recursive: true, force: true })
    skillRootHolder.root = undefined
  }
})

/* ─────────────────────  ZIP 构造辅助  ───────────────────── */

/** 用 fflate 的 Zip 流式 API 构造 ZIP，回传 buffer。 */
async function buildZip(
  entries: Array<{ name: string; data: Uint8Array; compressed?: boolean }>,
): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const zip = new Zip((err, data, final) => {
      if (err) reject(err)
      if (data !== undefined) chunks.push(Buffer.from(data))
      if (final) resolve(Buffer.concat(chunks))
    })
    for (const entry of entries) {
      const pass = entry.compressed ? new ZipDeflate(entry.name) : new ZipPassThrough(entry.name)
      zip.add(pass)
      pass.push(entry.data, true)
    }
    zip.end()
  })
}

function skillFrontmatter(name: string, description: string, extra?: Record<string, unknown>): string {
  const fm: Record<string, unknown> = { name, description }
  if (extra !== undefined) fm['metadata'] = extra
  const yaml = Object.entries(fm)
    .map(([key, value]) => {
      if (key === 'metadata') return `metadata:\n${renderYaml(value as Record<string, unknown>)}`
      return `${key}: ${formatScalar(value)}`
    })
    .join('\n')
  return `---\n${yaml}\n---\n\n使用说明正文（${name}）。\n`
}

function formatScalar(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function renderYaml(value: Record<string, unknown>, indent = 2): string {
  return Object.entries(value)
    .map(([k, v]) => {
      const pad = ' '.repeat(indent)
      if (Array.isArray(v)) {
        const items = v.map(item => `${pad}  - ${formatScalar(item)}`).join('\n')
        return `${pad}${k}:\n${items}`
      }
      if (typeof v === 'object' && v !== null) {
        return `${pad}${k}:\n${renderYaml(v as Record<string, unknown>, indent + 2)}`
      }
      return `${pad}${k}: ${formatScalar(v)}`
    })
    .join('\n')
}

function encodeBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

/* ─────────────────────  合法安装 / 卸载 / banner  ───────────────────── */

describe('SkillMarketService - 合法路径', () => {
  beforeEach(async () => {
    await setupTmpRoot()
  })

  it('安装单层目录形式的合法压缩包并写入管理清单', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const skillMd = skillFrontmatter('demo-skill', 'Demo description')
    const zip = await buildZip([
      { name: 'demo-skill/SKILL.md', data: new TextEncoder().encode(skillMd) },
      { name: 'demo-skill/README.md', data: new TextEncoder().encode('# Readme') },
    ])
    const result = await service.install({
      filename: 'demo.zip',
      data: encodeBase64(zip),
    })
    expect(result.name).toBe('demo-skill')
    expect(result.replaced).toBe(false)
    const manifestRaw = await readFile(result.manifestPath, 'utf8')
    const manifest = JSON.parse(manifestRaw) as SkillMarketManifest
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.name).toBe('demo-skill')
    expect(manifest.sourceFilename).toBe('demo.zip')
    const skillMdOnDisk = await readFile(join(root, 'demo-skill', 'SKILL.md'), 'utf8')
    expect(skillMdOnDisk).toContain('name: demo-skill')
    const listing = await service.list()
    expect(listing.entries).toHaveLength(1)
    expect(listing.entries[0]).toMatchObject({
      name: 'demo-skill',
      description: 'Demo description',
      hasBanner: false,
    })
  })

  it('安装带 marketplace 元数据和合法 banner 的压缩包', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const skillMd = skillFrontmatter('banner-skill', 'Has banner', {
      marketplace: {
        version: '1.2.3',
        author: 'dsh team',
        tags: ['demo', 'banner'],
        banner: 'banner.png',
      },
    })
    const banner = new Uint8Array(1024)
    banner.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const zip = await buildZip([
      { name: 'banner-skill/SKILL.md', data: new TextEncoder().encode(skillMd) },
      { name: 'banner-skill/banner.png', data: banner },
    ])
    const installed = await service.install({
      filename: 'banner.zip',
      data: encodeBase64(zip),
    })
    expect(installed.replaced).toBe(false)
    const bannerResult = await service.banner('banner-skill')
    expect(bannerResult.banner.mime).toBe('image/png')
    expect(Buffer.from(bannerResult.banner.data, 'base64').byteLength).toBe(banner.byteLength)
    const listing = await service.list()
    const entry = listing.entries.find(e => e.name === 'banner-skill')!
    expect(entry.hasBanner).toBe(true)
    expect(entry.version).toBe('1.2.3')
    expect(entry.author).toBe('dsh team')
    expect(entry.tags).toEqual(['demo', 'banner'])
  })

  it('卸载管理清单中的技能', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'removable/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('removable', 'r')) },
    ])
    await service.install({ filename: 'r.zip', data: encodeBase64(zip) })
    const result = await service.uninstall('removable')
    expect(result).toEqual({ name: 'removable', removed: true })
    const listing = await service.list()
    expect(listing.entries).toHaveLength(0)
  })

  it('overwrite=true 时用 backup+rename 协议替换同名技能', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const firstZip = await buildZip([
      { name: 'replace/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('replace', 'v1')) },
      { name: 'replace/old.txt', data: new TextEncoder().encode('v1 body') },
    ])
    await service.install({ filename: 'v1.zip', data: encodeBase64(firstZip) })
    const secondZip = await buildZip([
      { name: 'replace/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('replace', 'v2')) },
      { name: 'replace/new.txt', data: new TextEncoder().encode('v2 body') },
    ])
    const result = await service.install({
      filename: 'v2.zip',
      data: encodeBase64(secondZip),
      overwrite: true,
    })
    expect(result.replaced).toBe(true)
    const skillMd = await readFile(join(root, 'replace', 'SKILL.md'), 'utf8')
    expect(skillMd).toContain('v2')
    // backup 已被清理。
    const listing = await service.list()
    expect(listing.entries).toHaveLength(1)
    expect(listing.entries[0]!.description).toBe('v2')
  })
})

/* ─────────────────────  拒绝路径  ───────────────────── */

describe('SkillMarketService - 拒绝危险路径', () => {
  beforeEach(async () => {
    await setupTmpRoot()
  })

  it('拒绝相对路径穿越 `..`', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'evil-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('evil-skill', 'escape')) },
      { name: 'evil-skill/../../etc/passwd', data: new TextEncoder().encode('pwned') },
    ])
    await expect(service.install({
      filename: 'evil.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'unsafe-path' })
  })

  it('拒绝反斜杠路径穿越', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'evil-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('evil-skill', 'escape')) },
      { name: 'evil-skill\\..\\etc\\passwd', data: new TextEncoder().encode('pwned') },
    ])
    await expect(service.install({
      filename: 'evil.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'unsafe-path' })
  })

  it('拒绝绝对路径 / 盘符路径', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'evil-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('evil-skill', 'escape')) },
      { name: '/etc/passwd', data: new TextEncoder().encode('pwned') },
    ])
    await expect(service.install({
      filename: 'evil.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'unsafe-path' })
  })

  it('拒绝 NUL 字节条目名', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'evil-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('evil-skill', 'escape')) },
      { name: 'evil-skill/abc\0def', data: new TextEncoder().encode('pwned') },
    ])
    await expect(service.install({
      filename: 'evil.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'unsafe-path' })
  })

  it('拒绝 SKILL.md frontmatter 缺失 name', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'no-name/SKILL.md', data: new TextEncoder().encode('---\ndescription: missing name\n---\n\nbody\n') },
    ])
    await expect(service.install({
      filename: 'no-name.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'frontmatter-invalid' })
  })

  it('接受名称不同的单一包裹目录，安装名只取自 SKILL.md', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'real-name/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('different-name', 'desc')) },
    ])
    await expect(service.install({
      filename: 'mis.zip',
      data: encodeBase64(zip),
    })).resolves.toMatchObject({ name: 'different-name' })
    await expect(readFile(join(root, 'different-name', 'SKILL.md'), 'utf8'))
      .resolves.toContain('name: different-name')
  })

  it('拒绝不支持的宣传图扩展名', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const skillMd = skillFrontmatter('banner-skill', 'b', {
      marketplace: { banner: 'image.bmp' },
    })
    const zip = await buildZip([
      { name: 'banner-skill/SKILL.md', data: new TextEncoder().encode(skillMd) },
      { name: 'banner-skill/image.bmp', data: new Uint8Array(8) },
    ])
    await expect(service.install({
      filename: 'b.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'banner-invalid' })
  })
})

/* ─────────────────────  冲突 + 卸载保护  ───────────────────── */

describe('SkillMarketService - 冲突与卸载保护', () => {
  beforeEach(async () => {
    await setupTmpRoot()
  })

  it('已存在同名技能时拒绝非覆盖安装', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'clash/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('clash', 'c')) },
    ])
    await service.install({ filename: 'first.zip', data: encodeBase64(zip) })
    await expect(service.install({
      filename: 'second.zip',
      data: encodeBase64(zip),
    })).rejects.toBeInstanceOf(SkillMarketError)
    const second = service.install({
      filename: 'second.zip',
      data: encodeBase64(zip),
    })
    await expect(second).rejects.toMatchObject({ code: 'managed-upgrade-required' })
  })

  it('拒绝卸载未列入管理清单的技能（非市场安装）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    // 手工创建一个无 .dsh-market.json 的目录，模拟用户自己放置的技能。
    await mkdir(join(root, 'manual'), { recursive: true })
    await writeFile(join(root, 'manual', 'SKILL.md'),
      '---\nname: manual\ndescription: user installed\n---\n\nmanual skill\n',
      'utf8')
    await expect(service.uninstall('manual')).rejects.toMatchObject({
      code: 'not-managed',
    })
  })

  it('拒绝卸载不存在的技能', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    await expect(service.uninstall('ghost')).rejects.toMatchObject({
      code: 'unknown-skill',
    })
  })
})

/* ─────────────────────  体积限制 / zip bomb  ───────────────────── */

describe('SkillMarketService - 体积与 zip bomb 防护', () => {
  beforeEach(async () => {
    await setupTmpRoot()
  })

  it('拒绝超过压缩包上限的 base64 数据', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    // 构造真实超过 10 MiB 上限的 base64 字节流：用确定性 0x00 字节数组，
    // 其 base64 编码长度 = ceil((MAX_ZIP_BYTES + 1) * 4 / 3)，全部合法字符。
    const oversize = Buffer.alloc(MAX_ZIP_BYTES + 1, 0x00).toString('base64')
    await expect(service.install({
      filename: 'huge.zip',
      data: oversize,
    })).rejects.toMatchObject({
      failure: { code: 'resource-limit', limit: 'archive-bytes' },
    })
  })

  it('拒绝单条目解压后大小超过 30MiB（zip bomb 防护）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    // 高压缩比的 30MiB+ 数据：ZIP 体积小但解压后超过限额。
    const huge = new Uint8Array(MAX_EXTRACTED_BYTES + 1024)
    const zip = await buildZip([
      { name: 'bomb-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('bomb-skill', 'd')) },
      { name: 'bomb-skill/blob.bin', data: huge, compressed: true },
    ])
    // 整体 ZIP 体积必须低于 MAX_ZIP_BYTES，否则会被早期大小检查拦下。
    expect(zip.byteLength).toBeLessThanOrEqual(MAX_ZIP_BYTES)
    await expect(service.install({
      filename: 'bomb.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({
      failure: { code: 'resource-limit', limit: 'entry-bytes' },
    })
  })

  it('拒绝累计解压后总字节数超过 30MiB', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    // 单条目低于上限，但两个条目累加超过。
    const half = Math.floor(MAX_EXTRACTED_BYTES / 2) + 1024
    const zip = await buildZip([
      { name: 'bomb-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('bomb-skill', 'd')) },
      { name: 'bomb-skill/a.bin', data: new Uint8Array(half), compressed: true },
      { name: 'bomb-skill/b.bin', data: new Uint8Array(half), compressed: true },
    ])
    expect(zip.byteLength).toBeLessThanOrEqual(MAX_ZIP_BYTES)
    await expect(service.install({
      filename: 'split.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({
      failure: { code: 'resource-limit', limit: 'total-bytes' },
    })
  })

  it('拒绝宣传图超过 2MiB', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const skillMd = skillFrontmatter('oversize-banner', 'ob', {
      marketplace: { banner: 'banner.png' },
    })
    const oversizeBanner = new Uint8Array(MAX_BANNER_BYTES + 1)
    const zip = await buildZip([
      { name: 'oversize-banner/SKILL.md', data: new TextEncoder().encode(skillMd) },
      { name: 'oversize-banner/banner.png', data: oversizeBanner },
    ])
    await expect(service.install({
      filename: 'ob.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({
      code: 'banner-invalid',
    })
  })
})

/* ─────────────────────  布局形态校验  ───────────────────── */

describe('SkillMarketService - 布局与重复检测', () => {
  beforeEach(async () => {
    await setupTmpRoot()
  })

  it('接受根级 SKILL.md 平铺包，所有文件直接落到目标目录', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'SKILL.md', data: new TextEncoder().encode(skillFrontmatter('flat-skill', 'flat description')) },
      { name: 'README.md', data: new TextEncoder().encode('# README') },
      { name: 'guides/guide.md', data: new TextEncoder().encode('guide') },
    ])
    const result = await service.install({ filename: 'flat.zip', data: encodeBase64(zip) })
    expect(result.name).toBe('flat-skill')
    const skillMd = await readFile(join(root, 'flat-skill', 'SKILL.md'), 'utf8')
    expect(skillMd).toContain('name: flat-skill')
    const readme = await readFile(join(root, 'flat-skill', 'README.md'), 'utf8')
    expect(readme).toBe('# README')
    const guide = await readFile(join(root, 'flat-skill', 'guides', 'guide.md'), 'utf8')
    expect(guide).toBe('guide')
  })

  it('接受根级 SKILL.md 含空目录条目（目录条目仅用于结构判断）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'SKILL.md', data: new TextEncoder().encode(skillFrontmatter('flat-skill', 'flat')) },
      { name: 'docs/', data: new Uint8Array(0) },
      { name: 'docs/note.txt', data: new TextEncoder().encode('note') },
    ])
    await service.install({ filename: 'flat.zip', data: encodeBase64(zip) })
    const note = await readFile(join(root, 'flat-skill', 'docs', 'note.txt'), 'utf8')
    expect(note).toBe('note')
  })

  it('接受单层目录包 + 目录条目', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo-skill/', data: new Uint8Array(0) },
      { name: 'demo-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo-skill', 'd')) },
      { name: 'demo-skill/src/', data: new Uint8Array(0) },
      { name: 'demo-skill/src/index.md', data: new TextEncoder().encode('src') },
    ])
    await service.install({ filename: 'demo.zip', data: encodeBase64(zip) })
    const index = await readFile(join(root, 'demo-skill', 'src', 'index.md'), 'utf8')
    expect(index).toBe('src')
  })

  it('接受根级 SKILL.md 与同名子目录作为直接根布局', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'SKILL.md', data: new TextEncoder().encode(skillFrontmatter('flat-skill', 'flat')) },
      { name: 'flat-skill/x.md', data: new TextEncoder().encode('x') },
    ])
    await expect(service.install({
      filename: 'mixed.zip',
      data: encodeBase64(zip),
    })).resolves.toMatchObject({ name: 'flat-skill' })
    await expect(readFile(join(root, 'flat-skill', 'flat-skill', 'x.md'), 'utf8'))
      .resolves.toBe('x')
  })

  it('拒绝两个不同的顶层（既有 flat/ 又有 skill/）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo-skill', 'd')) },
      { name: 'other/x.md', data: new TextEncoder().encode('x') },
    ])
    await expect(service.install({
      filename: 'mixed.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'bad-zip' })
  })

  it('拒绝重复文件条目', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo-skill', 'd')) },
      { name: 'demo-skill/x.md', data: new TextEncoder().encode('a') },
      { name: 'demo-skill/x.md', data: new TextEncoder().encode('b') },
    ])
    await expect(service.install({
      filename: 'dup.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'bad-zip' })
  })

  it('拒绝文件与目录同名冲突', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo-skill/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo-skill', 'd')) },
      { name: 'demo-skill/x', data: new TextEncoder().encode('file body') },
      { name: 'demo-skill/x/', data: new Uint8Array(0) },
    ])
    await expect(service.install({
      filename: 'conf.zip',
      data: encodeBase64(zip),
    })).rejects.toMatchObject({ code: 'bad-zip' })
  })
})

/* ─────────────────────  严格 base64 校验  ───────────────────── */

describe('SkillMarketService - 严格 base64 校验', () => {
  beforeEach(async () => {
    await setupTmpRoot()
  })

  it('接受合法 RFC 4648 base64（含 =、== padding）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo', 'd')) },
    ])
    await expect(service.install({
      filename: 'demo.zip',
      data: encodeBase64(zip),
    })).resolves.toMatchObject({ name: 'demo' })
  })

  it('拒绝 base64 中的空白字符（空格）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo', 'd')) },
    ])
    const valid = encodeBase64(zip)
    // 在合法 base64 中插入一个空格
    const inserted = valid.slice(0, 8) + ' ' + valid.slice(8)
    await expect(service.install({
      filename: 'demo.zip',
      data: inserted,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'base64' } })
  })

  it('拒绝 base64 中的换行符（CRLF）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo', 'd')) },
    ])
    const valid = encodeBase64(zip)
    const inserted = valid.slice(0, 16) + '\r\n' + valid.slice(16)
    await expect(service.install({
      filename: 'demo.zip',
      data: inserted,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'base64' } })
  })

  it('拒绝 base64 中的 Tab 字符', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo', 'd')) },
    ])
    const valid = encodeBase64(zip)
    const inserted = valid.slice(0, 16) + '\t' + valid.slice(16)
    await expect(service.install({
      filename: 'demo.zip',
      data: inserted,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'base64' } })
  })

  it('拒绝 base64 中非法字符（! @ # 等）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const zip = await buildZip([
      { name: 'demo/SKILL.md', data: new TextEncoder().encode(skillFrontmatter('demo', 'd')) },
    ])
    const valid = encodeBase64(zip)
    const inserted = valid.slice(0, 8) + '!@#$%' + valid.slice(8)
    await expect(service.install({
      filename: 'demo.zip',
      data: inserted,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'base64' } })
  })

  it('拒绝长度 mod 4 = 1 的 base64（永远非法）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    // 任意 65 字符合法 base64（去掉合法 padding 后多 1 字符）
    const oddLength = 'A'.repeat(65)
    expect(oddLength.length % 4).toBe(1)
    await expect(service.install({
      filename: 'odd.zip',
      data: oddLength,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'base64' } })
  })

  it('拒绝 mod=2 时 padding 数量不对（应为 ==，但给 0 或 =）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    // mod=2 必须有 '=='（两个 padding）；这里无 padding
    const mod2NoPad = 'AAAAAA'
    expect(mod2NoPad.length % 4).toBe(2)
    await expect(service.install({
      filename: 'bad.zip',
      data: mod2NoPad,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'zip' } })
  })

  it('拒绝 mod=3 时 padding 数量不对（应为 =，但无）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    // mod=3 必须有单个 '='；这里无 padding
    const mod3NoPad = 'AAAAAAA'
    expect(mod3NoPad.length % 4).toBe(3)
    await expect(service.install({
      filename: 'bad.zip',
      data: mod3NoPad,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'zip' } })
  })

  it('拒绝中途出现的 padding 字符（"=AAAA"）', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const badMidPad = '=AAAA'
    await expect(service.install({
      filename: 'mid.zip',
      data: badMidPad,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'base64' } })
  })

  it('拒绝超过 3 个 padding 字符', async () => {
    const root = skillRootHolder.root!
    const service = buildService(root)
    const triple = 'AAA==='
    // 字符集正则 `={0,2}` 不允许 3 个 '=' → 直接被字符集检测拒绝
    await expect(service.install({
      filename: 'triple.zip',
      data: triple,
    })).rejects.toMatchObject({ failure: { code: 'invalid-archive', reason: 'base64' } })
  })
})

/* ─────────────────────  模块导出契约  ───────────────────── */

describe('SkillMarket plugin exports', () => {
  it('声明稳定的 plugin 元数据', () => {
    expect(SkillMarket.name).toBe('skill-market')
    expect(SkillMarket.inject).toEqual(['skills'])
  })

  it('导出 SCHEMA 端点契约', async () => {
    const schema = await import('../src/schema.ts')
    expect(typeof schema.SkillMarketError).toBe('function')
  })
})
