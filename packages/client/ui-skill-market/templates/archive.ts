import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'
import type { Zippable } from 'fflate'

const packageDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repositoryRoot = resolve(packageDirectory, '../../..')

/** Archive filename exposed by the marketplace download action. */
export const TEMPLATE_ARCHIVE_FILENAME = 'skill-market-template.zip'
/** Author-readable source directory for the downloaded ZIP. */
export const TEMPLATE_SOURCE_DIRECTORY = join(packageDirectory, 'templates', 'template-skill')
/** Checked-in Vite public asset generated from {@link TEMPLATE_SOURCE_DIRECTORY}. */
export const TEMPLATE_ARCHIVE_PATH = join(
  repositoryRoot,
  'apps',
  'web',
  'public',
  TEMPLATE_ARCHIVE_FILENAME,
)
/** Checked-in Tool and MCP publisher template assets. */
export const TOOL_TEMPLATE_ARCHIVE_PATH = join(repositoryRoot, 'apps', 'web', 'public', 'tool-market-template.zip')
export const MCP_TEMPLATE_ARCHIVE_PATH = join(repositoryRoot, 'apps', 'web', 'public', 'mcp-market-template.zip')

const TEMPLATE_SOURCE_PATHS = [
  'README.md',
  'README.i18n.yaml',
  'SKILL.md',
  'README.zh.md',
  'references',
  'references/authoring-notes.md',
] as const
const TEMPLATE_FILE_PATHS: readonly string[] = [
  'README.md',
  'SKILL.md',
  'references/authoring-notes.md',
]
const TEMPLATE_REQUIRED_SOURCE_PATHS: readonly string[] = [
  ...TEMPLATE_FILE_PATHS,
  'references',
]
const TEMPLATE_SKILL_NAME = 'skill-market-template'
const FIXED_MODIFICATION_TIME = new Date('2000-01-01T00:00:00.000Z')

/** Validated summary of the author-facing skill descriptor. */
export interface TemplateArchiveInspection {
  /** Stable skill identity demonstrated by the template. */
  readonly name: string
  /** Required human-readable descriptor summary. */
  readonly description: string
  /** Optional-package reference files included in the archive. */
  readonly referencePaths: readonly string[]
}

/** Parameters for deterministic archive generation. */
export interface GenerateTemplateArchiveOptions {
  /** Destination ZIP path. */
  readonly outputPath?: string
  /** Source directory to package. Tests provide isolated invalid directories. */
  readonly sourceDirectory?: string
}

function assertSafeTemplatePath(path: string): void {
  if (
    path === ''
    || path.includes('\0')
    || path.startsWith('/')
    || path.startsWith('\\')
    || /^[A-Za-z]:/.test(path)
    || path.split('/').some(part => part === '' || part === '.' || part === '..')
  ) {
    throw new Error(`unsafe template entry: ${JSON.stringify(path)}`)
  }
}

function assertExpectedTemplatePaths(paths: readonly string[]): void {
  for (const path of paths) {
    assertSafeTemplatePath(path)
    if (!TEMPLATE_FILE_PATHS.includes(path)) {
      throw new Error(`unexpected template entry: ${path}`)
    }
  }
  for (const path of TEMPLATE_FILE_PATHS) {
    if (!paths.includes(path)) throw new Error(`missing required template entry: ${path}`)
  }
}

function parseSkillMetadata(skillMd: Uint8Array): TemplateArchiveInspection {
  const content = new TextDecoder('utf-8', { fatal: true }).decode(skillMd)
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/u.exec(content)
  if (match === null) throw new Error('missing required SKILL.md metadata')
  const frontmatter = match[1] ?? ''
  const body = (match[2] ?? '').trim()
  const name = /^name:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/mu.exec(frontmatter)?.[1]
  const description = /^description:\s*(.+?)\s*$/mu.exec(frontmatter)?.[1]
  if (name === undefined || description === undefined || body === '') {
    throw new Error('missing required SKILL.md metadata')
  }
  if (name !== TEMPLATE_SKILL_NAME) {
    throw new Error(`unexpected template skill name: ${name}`)
  }
  if (!description.toLocaleLowerCase().includes('marketplace')) {
    throw new Error('template description must identify the marketplace')
  }
  return {
    name,
    description,
    referencePaths: ['references/authoring-notes.md'],
  }
}

async function sourceEntries(root: string, current = root): Promise<readonly string[]> {
  const entries = await readdir(current, { withFileTypes: true })
  const paths: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = join(current, entry.name)
    const path = relative(root, fullPath).split(sep).join('/')
    const info = await lstat(fullPath)
    if (info.isSymbolicLink()) throw new Error(`unsafe template source entry: ${path}`)
    if (info.isDirectory()) {
      paths.push(path)
      paths.push(...await sourceEntries(root, fullPath))
      continue
    }
    if (!info.isFile() || (info.mode & 0o111) !== 0) {
      throw new Error(`unsafe template source entry: ${path}`)
    }
    paths.push(path)
  }
  return paths
}

async function readTemplateSource(sourceDirectory: string): Promise<Readonly<Record<string, Uint8Array>>> {
  const paths = await sourceEntries(sourceDirectory)
  for (const path of paths) {
    if (!TEMPLATE_SOURCE_PATHS.includes(path as typeof TEMPLATE_SOURCE_PATHS[number])) {
      throw new Error(`unexpected template source file: ${path}`)
    }
  }
  for (const path of TEMPLATE_REQUIRED_SOURCE_PATHS) {
    if (!paths.includes(path)) throw new Error(`missing required template source file: ${path}`)
  }

  const files: Record<string, Uint8Array> = {}
  for (const path of TEMPLATE_FILE_PATHS) files[path] = await readFile(join(sourceDirectory, path))
  parseSkillMetadata(files['SKILL.md']!)
  return files
}

/**
 * Inspect one delivered archive for the exact, safe marketplace template inventory.
 * @param archive - ZIP bytes produced for browser download.
 * @returns validated skill metadata and reference inventory.
 */
export function inspectTemplateArchive(archive: Uint8Array): TemplateArchiveInspection {
  const entries = unzipSync(archive)
  const paths = Object.keys(entries).sort()
  assertExpectedTemplatePaths(paths)
  return parseSkillMetadata(entries['SKILL.md']!)
}

/**
 * Create the checked-in marketplace template ZIP from its reviewed source files.
 * @param options - Optional isolated source and output paths for package tests.
 * @returns the generated archive bytes.
 */
export async function generateTemplateArchive(
  options: GenerateTemplateArchiveOptions = {},
): Promise<Buffer> {
  const sourceDirectory = options.sourceDirectory ?? TEMPLATE_SOURCE_DIRECTORY
  const outputPath = options.outputPath ?? TEMPLATE_ARCHIVE_PATH
  const files = await readTemplateSource(sourceDirectory)
  const archiveInput: Zippable = {}
  for (const path of TEMPLATE_FILE_PATHS) {
    archiveInput[path] = [files[path]!, { mtime: FIXED_MODIFICATION_TIME }]
  }
  const archive = Buffer.from(zipSync(archiveInput, { level: 9 }))
  inspectTemplateArchive(archive)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, archive)
  return archive
}

async function generatePackageTemplate(
  sourceDirectory: string,
  descriptorName: 'tool-package.json' | 'mcp-package.json',
  outputPath: string,
): Promise<Buffer> {
  const descriptor = JSON.parse(await readFile(join(sourceDirectory, descriptorName), 'utf8')) as {
    files: Record<string, string>
  }
  const readme = await readFile(join(sourceDirectory, 'README.md'))
  const archiveInput: Zippable = {
    'README.md': [readme, { mtime: FIXED_MODIFICATION_TIME }],
  }
  descriptor.files = {
    'README.md': createHash('sha256').update(readme).digest('hex'),
  }
  if (descriptorName === 'tool-package.json') {
    const entry = await readFile(join(sourceDirectory, 'plugin/index.js'))
    descriptor.files['plugin/index.js'] = createHash('sha256').update(entry).digest('hex')
    archiveInput['plugin/index.js'] = [entry, { mtime: FIXED_MODIFICATION_TIME }]
  } else {
    const servers = (descriptor as { servers?: Array<{ args?: string[] }> }).servers ?? []
    const localEntries = servers.flatMap(server => server.args ?? []).filter(arg => arg.includes('/'))
    if (localEntries.length > 0) {
      const entryPath = localEntries[0]!
      const entry = await readFile(join(sourceDirectory, entryPath))
      descriptor.files[entryPath] = createHash('sha256').update(entry).digest('hex')
      archiveInput[entryPath] = [entry, { mtime: FIXED_MODIFICATION_TIME }]
    }
  }
  archiveInput[descriptorName] = [
    Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`),
    { mtime: FIXED_MODIFICATION_TIME },
  ]
  const archive = Buffer.from(zipSync(archiveInput, { level: 9 }))
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, archive)
  return archive
}

/** Generate all browser-download marketplace templates. */
export async function generateMarketplaceTemplateArchives(): Promise<void> {
  await generateTemplateArchive()
  await generatePackageTemplate(
    join(packageDirectory, 'templates', 'template-tool'),
    'tool-package.json',
    TOOL_TEMPLATE_ARCHIVE_PATH,
  )
  await generatePackageTemplate(
    join(packageDirectory, 'templates', 'template-mcp'),
    'mcp-package.json',
    MCP_TEMPLATE_ARCHIVE_PATH,
  )
}
