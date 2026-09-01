// Web e2e scenario: install the repository marketplace examples, restart the
// real Host, publish an employee template, and exercise its selected assets.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { zipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { CallId, LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { DigitalEmployeeAuditRecord } from '@deepseek-ai/dsh-digital-employee'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  launchRestartableWebScaffold,
  watchConsole,
  type RestartableWebScaffold,
  type WebScaffold,
} from './scaffold.ts'
import { startMarketplaceMcpFixture, type MarketplaceMcpFixture } from './marketplace-mcp-fixture.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const TEST_PUBLISHER = {
  id: 'deepseek-marketplace-test',
  publicKeyPem: [
    '-----BEGIN PUBLIC KEY-----',
    'MCowBQYDK2VwAyEAVvVFYX/zscUEEadGCx5qApj2V6mmiV8iBQ/9rOHi3bE=',
    '-----END PUBLIC KEY-----',
    '',
  ].join('\n'),
}
const RUN_ID = String(process.pid)
const TEMPLATE_ID = `marketplace-web-reference-${RUN_ID}`
const TEMPLATE_NAME = `Marketplace Web Reference ${RUN_ID}`
const EMPLOYEE_NAME = `Marketplace Web Employee ${RUN_ID}`
const TASK = 'Exercise the selected marketplace capabilities.'
const UNDECLARED_SKILL = 'marketplace-web-undeclared'
const FINAL_MARKERS = [
  'MARKETPLACE_TEST_SKILL_LOADED',
  'MARKETPLACE_TEST_TOOL_ECHO:hello',
  'MARKETPLACE_TEST_MCP_LOOKUP:risk-42',
].join(' | ')

interface MarketplaceDraft {
  readonly id: string
  readonly templateId: string
}

interface MarketplacePublication {
  readonly templateId: string
  readonly version: string
}

interface MarketplaceDigitalEmployeeManagement {
  listConfigurationDrafts(): Promise<readonly MarketplaceDraft[]>
  validateConfigurationDraft(request: { readonly draftId: string }): Promise<{
    readonly diagnostics: readonly unknown[]
  }>
  listConfigurationPublications(): Promise<readonly MarketplacePublication[]>
}

interface MarketplaceSkillMarket {
  install(request: {
    readonly filename: string
    readonly archiveBase64: string
  }): Promise<{ readonly ok: boolean }>
}

function employeeManagement(scaffold: WebScaffold): MarketplaceDigitalEmployeeManagement {
  const service: unknown = scaffold.ctx.get('digitalEmployeeManagement')
  return service as MarketplaceDigitalEmployeeManagement
}

function skillMarket(scaffold: WebScaffold): MarketplaceSkillMarket {
  const service: unknown = scaffold.ctx.get('skillMarket')
  return service as MarketplaceSkillMarket
}

class MarketplaceWebAdapter extends LlmAdapter {
  readonly toolCatalogs: string[][] = []
  private calls = 0

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.toolCatalogs.push((options.tools ?? []).map(tool => tool.name).sort())
    const mcpTool = options.tools?.find(tool => tool.name.startsWith('mcp__') && tool.name.endsWith('__lookup'))
    const sequence = [
      { name: 'skill', arguments: '{"name":"marketplace-test-skill"}' },
      { name: 'marketplace_test_echo', arguments: '{"text":"hello"}' },
      ...(mcpTool === undefined ? [] : [{ name: mcpTool.name, arguments: '{"query":"risk-42"}' }]),
      { name: 'skill', arguments: `{"name":"${UNDECLARED_SKILL}"}` },
    ]
    const callIndex = this.calls++
    if (callIndex === 2 && mcpTool === undefined) {
      throw new Error('marketplace Web employee request does not expose the selected MCP Tool')
    }
    const call = sequence[callIndex]
    if (call !== undefined) {
      const block = {
        type: 'tool-call' as const,
        id: CallId(`marketplace-web-call-${String(callIndex + 1)}`),
        name: call.name,
        arguments: call.arguments,
      }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: FINAL_MARKERS }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: FINAL_MARKERS } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

function undeclaredSkillArchive(): string {
  const descriptor = [
    '---',
    `name: ${UNDECLARED_SKILL}`,
    'description: Installed but intentionally omitted from the employee template.',
    'metadata:',
    '  marketplace:',
    '    version: "1.0.0"',
    '    author: Web E2E',
    '    tags:',
    '      - undeclared',
    '---',
    '',
    'This instruction must not be available to the marketplace reference employee.',
    '',
  ].join('\n')
  return Buffer.from(zipSync({ [`${UNDECLARED_SKILL}/SKILL.md`]: Buffer.from(descriptor) })).toString('base64')
}

async function openMarketplace(page: Page): Promise<ReturnType<Page['locator']>> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.waitFor({ timeout: 10_000 })
  await settings.getByRole('button', { name: 'Marketplace', exact: true }).click()
  return settings.locator('section[aria-labelledby="marketplace-title"]')
}

async function downloadAndUpload(
  page: Page,
  section: ReturnType<Page['locator']>,
  tab: 'Skills' | 'Tools' | 'MCP',
  filename: string,
): Promise<void> {
  await section.getByRole('tab', { name: tab, exact: true }).click()
  const link = section.getByRole('link', { name: 'Download installable test ZIP', exact: true })
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
  expect(download.suggestedFilename()).toBe(filename)
  const response = await page.request.get(new URL(`/${filename}`, page.url()).href)
  expect(response.ok()).toBe(true)
  await section.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: 'application/zip',
    buffer: Buffer.from(await response.body()),
  })
}

function toolResultText(events: readonly SessionEvent[]): string {
  return events.flatMap(event => event.type === 'tool/result'
    ? event.data.message.content.flatMap(result =>
      result.content.flatMap(block => block.type === 'text' ? [block.text] : []))
    : []).join('\n')
}

describe('web e2e: marketplace examples reach a digital employee conversation', () => {
  let lifecycle: RestartableWebScaffold
  let scaffold: WebScaffold
  let mcp: MarketplaceMcpFixture
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let adapter: MarketplaceWebAdapter

  beforeAll(async () => {
    mcp = await startMarketplaceMcpFixture()
    lifecycle = await launchRestartableWebScaffold({
      marketplace: {
        trustedPublishers: [TEST_PUBLISHER],
        endpointReferences: { MARKETPLACE_TEST_MCP_ENDPOINT: mcp.url },
        credentials: { MARKETPLACE_TEST_MCP_TOKEN: mcp.authorization },
      },
    })
    scaffold = lifecycle.scaffold
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await lifecycle?.close()
    await mcp?.close()
  })

  it('installs, activates, publishes, and uses the selected marketplace capabilities', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-marketplace-digital-employee'))
    const marketplace = await openMarketplace(page)

    await downloadAndUpload(page, marketplace, 'Skills', 'marketplace-test-skill.zip')
    await marketplace.locator('[data-skill-name="marketplace-test-skill"]').waitFor({ timeout: 20_000 })

    await downloadAndUpload(page, marketplace, 'Tools', 'marketplace-test-tool.zip')
    const toolCard = marketplace.locator('[data-tool-package="marketplace-test-tool"]')
    await toolCard.waitFor({ timeout: 20_000 })
    await toolCard.getByText('Restart required', { exact: true }).waitFor({ timeout: 10_000 })

    await downloadAndUpload(page, marketplace, 'MCP', 'marketplace-test-mcp.zip')
    const mcpCard = marketplace.locator('[data-mcp-package="marketplace-test-mcp"]')
    await mcpCard.waitFor({ timeout: 20_000 })
    await mcpCard.getByRole('textbox', {
      name: 'Credential reference: MARKETPLACE_TEST_MCP_TOKEN',
    }).fill('MARKETPLACE_TEST_MCP_TOKEN')
    await mcpCard.getByRole('button', { name: 'Save references', exact: true }).click()
    await mcpCard.getByText('Restart required', { exact: true }).waitFor({ timeout: 10_000 })

    const undeclared = await skillMarket(scaffold).install({
      filename: `${UNDECLARED_SKILL}.zip`,
      archiveBase64: undeclaredSkillArchive(),
    })
    expect(undeclared.ok).toBe(true)

    await lifecycle.stop()
    scaffold = await lifecycle.start()
    adapter = new MarketplaceWebAdapter()
    scaffold.ctx.effect(
      () => scaffold.ctx.llm.registerAdapter(['marketplace-web-mock'], adapter),
      'marketplace Web employee deterministic adapter',
    )
    scaffold.ctx.on('agent/request', async (_payload, next) => ({
      ...await next(),
      provider: 'marketplace-web-mock',
      model: 'marketplace-web-mock',
    }))

    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd, 'marketplace-digital-employee')
    await page.getByRole('button', { name: 'Digital employees', exact: true }).click()
    await page.getByRole('tab', { name: 'Template configuration' }).click()
    await page.getByRole('textbox', { name: 'Template ID' }).fill(TEMPLATE_ID)
    await page.getByRole('textbox', { name: 'Template name' }).fill(TEMPLATE_NAME)
    await page.getByRole('textbox', { name: 'Template instructions' }).fill(
      'Use the selected marketplace capabilities and report their exact markers.',
    )
    await page.getByRole('button', { name: 'Create draft', exact: true }).click()

    const draft = page.getByText(new RegExp(`${TEMPLATE_NAME} · r\\d+`)).first().locator('..')
    await draft.getByRole('button', { name: 'Edit', exact: true }).click()
    for (const capability of ['marketplace-test-skill', 'marketplace_test_echo', 'marketplace-test-mcp']) {
      const checkbox = page.getByRole('checkbox', { name: capability, exact: true })
      await expect.poll(() => checkbox.isEnabled(), { timeout: 15_000 }).toBe(true)
      await checkbox.check()
    }
    expect(await page.getByRole('checkbox', { name: UNDECLARED_SKILL }).isChecked()).toBe(false)
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await draft.getByRole('button', { name: 'Validate', exact: true }).click()
    await expect.poll(async () => {
      const current = (await employeeManagement(scaffold).listConfigurationDrafts())
        .find(candidate => candidate.templateId === TEMPLATE_ID)
      return current === undefined
        ? ['missing']
        : (await employeeManagement(scaffold).validateConfigurationDraft({
          draftId: current.id,
        })).diagnostics
    }, { timeout: 15_000 }).toEqual([])
    await draft.getByRole('button', { name: 'Publish', exact: true }).click()
    await page.getByRole('dialog', { name: 'Publish template version?' })
      .getByRole('button', { name: 'Publish template', exact: true }).click()
    await expect.poll(async () => (
      await employeeManagement(scaffold).listConfigurationPublications()
    ).find(candidate => candidate.templateId === TEMPLATE_ID), { timeout: 15_000 }).toBeDefined()
    const published = (await employeeManagement(scaffold).listConfigurationPublications())
      .find(candidate => candidate.templateId === TEMPLATE_ID)
    if (published === undefined) throw new Error('marketplace Web template publication is missing')

    await page.getByRole('tab', { name: 'Employee operations' }).click()
    await page.getByRole('combobox', { name: 'Employee template' }).selectOption({
      label: `${TEMPLATE_NAME} · ${published.version}`,
    })
    await page.getByRole('textbox', { name: 'Employee name' }).fill(EMPLOYEE_NAME)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await page.getByRole('heading', { name: EMPLOYEE_NAME }).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Activate', exact: true }).click()
    await page.getByText(new RegExp(`${TEMPLATE_ID} · ${published.version.replaceAll('.', '\\.')} · active`))
      .waitFor({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Close digital employees' }).click()
    const composer = page.locator('textarea:enabled[placeholder="Describe what you want to build"]')
    await composer.fill('@')
    const option = page.getByRole('listbox').getByRole('option', { name: new RegExp(EMPLOYEE_NAME) })
    await option.waitFor({ timeout: 15_000 })
    await option.click()
    await composer.press('End')
    await composer.pressSequentially(TASK)
    const settled = scaffold.whenTurnSettled(30_000)
    await composer.press('Enter')
    const sessionId = await settled
    await page.getByText(FINAL_MARKERS, { exact: true }).waitFor({ timeout: 15_000 })

    const session = await scaffold.ctx.sessionPersistence.load(sessionId)
    const identity = session.events.find(event => event.type === 'digital-employee/identity')
    if (identity === undefined) throw new Error('marketplace Web employee Session has no durable identity')
    const results = toolResultText(session.events)
    expect(results).toContain('MARKETPLACE_TEST_SKILL_LOADED')
    expect(results).toContain('MARKETPLACE_TEST_TOOL_ECHO:hello')
    expect(results).toContain('MARKETPLACE_TEST_MCP_LOOKUP:risk-42')
    expect(results).toContain(UNDECLARED_SKILL)
    expect(results).toMatch(/not (?:found|available)|unknown|denied/i)
    const audits: readonly DigitalEmployeeAuditRecord[] =
      await scaffold.ctx.digitalEmployees.listAudit(identity.data.employeeId)
    expect(audits.map(record => record.action)).toEqual(expect.arrayContaining([
      'skill.selected', 'tool.call', 'mcp.call',
    ]))
    expect(audits.some(record => JSON.stringify(record.metadata).includes(UNDECLARED_SKILL))).toBe(false)
    expect(audits.every(record => record.employeeId === identity.data.employeeId)).toBe(true)
    expect(JSON.stringify({ events: session.events, audits })).not.toContain(mcp.authorization)
    expect(adapter.toolCatalogs.every(names => !names.includes('marketplace_test_undeclared'))).toBe(true)
    expect(mcp.requests()).toContain(mcp.authorization)
    expect(tripwire.pageErrors).toEqual([])
  }, 180_000)
})
