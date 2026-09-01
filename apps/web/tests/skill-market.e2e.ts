// Web e2e scenario: the shipped marketplace settings contribution exercises
// its generated Remote through the real /api carrier against an isolated DSH
// home. The workflow is keyless and never enters the model loop.
import { access, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { zipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/skill-market', import.meta.url))
const UI_EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const MODE = webSnapshotMode()
const SKILL_ID = 'marketplace-demo'
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function skillArchive(skillId: string, version: string, banner = false): Buffer {
  const metadata = [
    '---',
    `name: ${skillId}`,
    `description: Portable marketplace browser fixture ${version}`,
    'metadata:',
    '  marketplace:',
    `    version: "${version}"`,
    '    author: DeepSeek Harness',
    '    tags:',
    '      - browser',
    '      - portable',
    ...(banner ? ['    banner: banner.png'] : []),
    '---',
    '',
    'Browser fixture skill.',
    '',
  ].join('\n')
  const entries: Record<string, Uint8Array> = {
    [`${skillId}/SKILL.md`]: Buffer.from(metadata),
  }
  if (banner) entries[`${skillId}/banner.png`] = PNG_BYTES
  return Buffer.from(zipSync(entries))
}

async function upload(section: ReturnType<Page['locator']>, archive: Buffer, name: string): Promise<void> {
  await section.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/zip',
    buffer: archive,
  })
}

describe('web e2e: skill marketplace through the shipped API', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  const apiRequests: string[] = []

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/api')) apiRequests.push(url.pathname)
    })
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('installs, finds, upgrades, refuses unmanaged replacement, and uninstalls', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-skill-market'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.waitFor({ timeout: 10_000 })
    await settings.getByRole('button', { name: 'Marketplace', exact: true }).click()
    const section = settings.locator('section[aria-labelledby="marketplace-title"]')
    await section.getByText('No marketplace-managed skills are installed.', { exact: true })
      .waitFor({ timeout: 10_000 })

    await section.getByRole('tab', { name: 'Tools', exact: true }).click()
    await section.getByText('No marketplace-managed Tool packages are installed.', { exact: true })
      .waitFor({ timeout: 10_000 })
    const toolTemplate = section.getByRole('link', { name: 'Download example ZIP', exact: true })
    expect(await toolTemplate.getAttribute('href')).toBe('/tool-market-template.zip')
    await section.getByRole('tab', { name: 'MCP', exact: true }).click()
    await section.getByText('No marketplace-managed MCP packages are installed.', { exact: true })
      .waitFor({ timeout: 10_000 })
    const mcpTemplate = section.getByRole('link', { name: 'Download example ZIP', exact: true })
    expect(await mcpTemplate.getAttribute('href')).toBe('/mcp-market-template.zip')
    await section.getByRole('tab', { name: 'Skills', exact: true }).click()

    await upload(section, skillArchive(SKILL_ID, '1.0.0', true), `${SKILL_ID}.zip`)
    const card = section.locator(`[data-skill-name="${SKILL_ID}"]`)
    await card.waitFor({ timeout: 20_000 })
    await card.getByText('1.0.0', { exact: true }).waitFor({ timeout: 10_000 })
    const banner = card.getByRole('img', { name: `${SKILL_ID}: Promotional image` })
    await expect.poll(async () => banner.evaluate((image: HTMLImageElement) => ({
      complete: image.complete,
      height: image.naturalHeight,
      source: image.src.startsWith('data:image/png;base64,'),
      width: image.naturalWidth,
    })), { timeout: 10_000 }).toEqual({
      complete: true,
      height: 1,
      source: true,
      width: 1,
    })

    const snapshot = await captureStableAria(
      page,
      `[data-skill-name="${SKILL_ID}"]`,
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)

    const search = section.getByRole('searchbox', { name: 'Search installed skills' })
    await search.fill('portable')
    await expect.poll(() => card.count(), { timeout: 5_000 }).toBe(1)
    await search.fill('missing')
    await section.getByText('No installed skills match this search.', { exact: true })
      .waitFor({ timeout: 5_000 })
    await search.fill('')
    await card.waitFor({ timeout: 5_000 })

    await upload(section, skillArchive(SKILL_ID, '2.0.0', true), `${SKILL_ID}-v2.zip`)
    const upgrade = page.getByRole('dialog', { name: 'Upgrade managed skill?' })
    await upgrade.waitFor({ timeout: 10_000 })
    await upgrade.getByText('Installed and candidate versions: 1.0.0 / 2.0.0', { exact: true })
      .waitFor({ timeout: 5_000 })
    await upgrade.getByRole('button', { name: 'Upgrade', exact: true }).click()
    await card.getByText('2.0.0', { exact: true }).waitFor({ timeout: 20_000 })

    const unmanagedRoot = join(scaffold.harnessHome, 'skills', 'unmanaged-demo')
    await mkdir(unmanagedRoot, { recursive: true })
    await writeFile(join(unmanagedRoot, 'SKILL.md'), [
      '---',
      'name: unmanaged-demo',
      'description: Hand-managed browser fixture',
      '---',
      '',
    ].join('\n'))
    await upload(section, skillArchive('unmanaged-demo', '1.0.0'), 'unmanaged-demo.zip')
    await section.getByRole('alert')
      .getByText('A hand-managed skill already uses this name and cannot be replaced.', { exact: true })
      .waitFor({ timeout: 10_000 })
    expect(await page.getByRole('dialog', { name: 'Upgrade managed skill?' }).count()).toBe(0)

    await card.getByRole('button', { name: `Uninstall: ${SKILL_ID}`, exact: true }).click()
    const uninstall = page.getByRole('dialog', { name: 'Uninstall this skill?' })
    await uninstall.waitFor({ timeout: 10_000 })
    await uninstall.getByRole('button', { name: 'Uninstall', exact: true }).click()
    await expect.poll(() => card.count(), { timeout: 20_000 }).toBe(0)
    await section.getByText('No marketplace-managed skills are installed.', { exact: true })
      .waitFor({ timeout: 10_000 })
    await expect(access(unmanagedRoot)).resolves.toBeUndefined()

    const templateDownload = section.getByRole('link', { name: 'Download example ZIP', exact: true })
    expect(await templateDownload.getAttribute('href')).toBe('/skill-market-template.zip')
    expect(await templateDownload.getAttribute('download')).toBe('skill-market-template.zip')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      templateDownload.click(),
    ])
    expect(download.suggestedFilename()).toBe('skill-market-template.zip')
    const templateResponse = await page.request.get(
      new URL('/skill-market-template.zip', scaffold.baseUrl).href,
    )
    expect(templateResponse.ok()).toBe(true)
    expect(templateResponse.headers()['content-type']).toContain('application/zip')
    await upload(section, Buffer.from(await templateResponse.body()), download.suggestedFilename())
    const templateCard = section.locator('[data-skill-name="skill-market-template"]')
    await templateCard.waitFor({ timeout: 20_000 })
    await templateCard.getByText(
      'A complete marketplace skill template for authoring a safe, installable ZIP package.',
      { exact: true },
    ).waitFor({ timeout: 10_000 })
    await templateCard.getByRole('button', { name: 'Uninstall: skill-market-template', exact: true }).click()
    await page.getByRole('dialog', { name: 'Uninstall this skill?' })
      .getByRole('button', { name: 'Uninstall', exact: true })
      .click()
    await expect.poll(() => templateCard.count(), { timeout: 20_000 }).toBe(0)

    expect(apiRequests.some(path => path === '/api/skillMarket/install')).toBe(true)
    expect(apiRequests.some(path => path === '/api/skillMarket/banner')).toBe(true)
    expect(apiRequests.some(path => path === '/api/skillMarket/uninstall')).toBe(true)
    expect(apiRequests.some(path => path.includes('/skill-market'))).toBe(false)
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['ui.expected.md'])
  })
})
