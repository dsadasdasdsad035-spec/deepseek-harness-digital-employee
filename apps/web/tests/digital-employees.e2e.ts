// Web e2e scenario: the shipped digital employee workspace exercises the real
// typed Remote and file provider without entering the model loop.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { zipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  createExpertId,
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeInstanceId,
  type DigitalEmployeeAuthority,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import {
  launchWebScaffold, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const TEMPLATE_ID = createDigitalEmployeeTemplateId('web-operations-coordinator')
const REVIEWER_ID = createExpertId('reviewer')
const FULL_AUTHORITY: DigitalEmployeeAuthority = {
  skills: [],
  tools: [],
  mcpServers: [],
  experts: [REVIEWER_ID],
  allowSubagents: false,
}
const RESTRICTED_AUTHORITY: DigitalEmployeeAuthority = {
  skills: [],
  tools: [],
  mcpServers: [],
  experts: [],
  allowSubagents: false,
}
const DIRECT_TASK = 'Coordinate the launch readiness review.'
const MANAGEMENT_TASK = 'Prepare the follow-up operations brief.'
const ACTIVE_MARKET_SKILL = 'web-market-active'
const INACTIVE_MARKET_SKILL = 'web-market-inactive'

function skillArchive(name: string, version: string): string {
  const descriptor = [
    '---',
    `name: ${name}`,
    `description: Web template catalog fixture ${name}.`,
    'metadata:',
    '  marketplace:',
    `    version: "${version}"`,
    '    author: Web E2E',
    '    tags:',
    '      - template',
    '      - browser',
    '---',
    '',
    'Web template catalog fixture.',
    '',
  ].join('\n')
  return Buffer.from(zipSync({ [`${name}/SKILL.md`]: Buffer.from(descriptor) })).toString('base64')
}

function userText(events: readonly SessionEvent[]): string[] {
  return events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.data.content.flatMap(block => block.type === 'text' ? [block.text] : [])
    : [])
}

function employeeSessionIds(scaffold: WebScaffold): SessionId[] {
  return scaffold.ctx.agents.roots().flatMap(agent =>
    agent.session.events.some(event => event.type === 'digital-employee/identity') ? [agent.id] : [])
}

async function runtimeSessionIds(scaffold: WebScaffold): Promise<string[]> {
  const ids = new Set<string>(scaffold.ctx.agents.roots().map(agent => agent.id))
  for (const header of await scaffold.ctx.sessionPersistence.list()) ids.add(header.id)
  return [...ids].sort()
}

function template(root: string, version: '1.0.0' | '2.0.0'): DigitalEmployeeTemplate {
  return {
    id: TEMPLATE_ID,
    version,
    display: {
      name: 'Operations Coordinator',
      description: 'Coordinates operational work with an independent reviewer.',
    },
    personality: 'Calm, precise, and explicit about permissions.',
    instructions: {
      kind: 'file',
      root,
      path: 'AGENTS.md',
      revision: `web-operations-coordinator-${version}`,
    },
    preset: 'standard',
    capabilities: {
      ...FULL_AUTHORITY,
      allowSubagents: version === '2.0.0',
    },
    experts: [{
      id: REVIEWER_ID,
      name: 'Independent Reviewer',
      responsibility: 'Review delegated work and identify missing evidence.',
      instructions: {
        kind: 'file',
        root,
        path: 'reviewer.md',
        revision: `web-operations-reviewer-${version}`,
      },
      modelSettings: {},
      capabilities: RESTRICTED_AUTHORITY,
      memoryAccess: ['task', 'session'],
      delegation: {
        mode: 'continuable',
        maxDepth: 0,
        maxConcurrency: 1,
        timeoutMs: 30_000,
      },
    }],
    delegation: {
      maxDepth: 1,
      maxConcurrency: 2,
      timeoutMs: 30_000,
    },
  }
}

describe('web e2e: digital employee management through the shipped API', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let operationsLeadId: DigitalEmployeeInstanceId
  let restrictedObserverId: DigitalEmployeeInstanceId
  let modelRequestCount = 0

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    scaffold.ctx.on('agent/request', async (_payload, next) => {
      modelRequestCount += 1
      return {
        ...await next(),
        provider: 'deepseek-official',
        model: 'deepseek-v4-flash',
      }
    })
    const templateRoot = join(scaffold.workspaceCwd, 'digital-employee-template')
    await mkdir(templateRoot, { recursive: true })
    await Promise.all([
      writeFile(join(templateRoot, 'AGENTS.md'), 'Coordinate the assigned operations task.\n'),
      writeFile(join(templateRoot, 'reviewer.md'), 'Review the parent employee result.\n'),
    ])
    scaffold.ctx.digitalEmployees.registerTemplate(template(templateRoot, '1.0.0'))
    scaffold.ctx.digitalEmployees.registerTemplate(template(templateRoot, '2.0.0'))
    const operationsLead = await scaffold.ctx.digitalEmployees.create({
      templateId: TEMPLATE_ID,
      templateVersion: '1.0.0',
      displayName: 'Operations Lead',
      grants: FULL_AUTHORITY,
    })
    operationsLeadId = operationsLead.id
    await scaffold.ctx.digitalEmployees.promoteMemory({
      employeeId: operationsLeadId,
      content: `${DIRECT_TASK} Use the recorded release-readiness checklist.`,
      tags: ['operations', 'launch'],
      sensitive: false,
      provenance: {
        sessionId: 'web-digital-employee-memory-seed' as SessionId,
        source: 'web-e2e-seed',
        recordedAt: '2026-09-01T00:00:00.000Z',
      },
    })
    await scaffold.ctx.digitalEmployees.activate(operationsLeadId)
    const restrictedObserver = await scaffold.ctx.digitalEmployees.create({
      templateId: TEMPLATE_ID,
      templateVersion: '1.0.0',
      displayName: 'Restricted Observer',
      grants: RESTRICTED_AUTHORITY,
    })
    restrictedObserverId = restrictedObserver.id
    for (const [name, version] of [[ACTIVE_MARKET_SKILL, '1.2.3'], [INACTIVE_MARKET_SKILL, '2.0.0']] as const) {
      const installed = await scaffold.ctx.skillMarket.install({
        filename: `${name}.zip`,
        archiveBase64: skillArchive(name, version),
      })
      if (!installed.ok) throw new Error(`failed to install ${name}: ${installed.error.code}`)
    }
    for (const draft of await scaffold.ctx.digitalEmployeeManagement.listConfigurationDrafts()) {
      if (draft.templateId === 'web-market-template') {
        await scaffold.ctx.digitalEmployeeManagement.deleteConfigurationDraft({ draftId: draft.id })
      }
    }
    await scaffold.ctx.digitalEmployeeManagement.createConfigurationDraft({
      templateId: 'web-market-template',
      display: {
        name: 'Web Market Template',
        description: 'Exercises marketplace skills in template configuration.',
      },
      instructions: 'Use selected marketplace skills.',
      preset: 'standard',
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd, 'digital-employee-chat')
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('starts durable employee-owned conversations from @ routing and management preselection', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-digital-employee-chat'))
    const composer = page.locator('textarea:enabled[placeholder="Describe what you want to build"]')
    await composer.fill('@')
    const menu = page.getByRole('listbox')
    await menu.waitFor({ timeout: 15_000 })
    const operationsOption = menu.getByRole('option', { name: /Operations Lead/ })
    await operationsOption.waitFor({ timeout: 15_000 })
    await operationsOption.click()
    await composer.press('End')
    await composer.type(DIRECT_TASK)
    await composer.press('Enter')

    await expect.poll(() => employeeSessionIds(scaffold).length, { timeout: 15_000 }).toBe(1)
    const directSessionId = employeeSessionIds(scaffold)[0]!
    await page.locator('[data-chat-flow-kind="user"]').getByText(DIRECT_TASK, { exact: true })
      .waitFor({ timeout: 15_000 })
    await expect.poll(async () => {
      const loaded = await scaffold.ctx.sessionPersistence.load(directSessionId)
      return {
        owner: loaded.events.find(event => event.type === 'digital-employee/identity')?.data.employeeId,
        memoryProjected: loaded.events.some(event => event.type === 'digital-employee/memory-projection'),
        prompts: userText(loaded.events),
      }
    }, { timeout: 15_000 }).toEqual({
      owner: operationsLeadId,
      memoryProjected: true,
      prompts: [DIRECT_TASK],
    })

    await page.getByRole('button', { name: 'Digital employees', exact: true }).click()
    await page.getByRole('heading', { name: 'Operations Lead' }).waitFor({ timeout: 15_000 })
    await page.getByRole('button', { name: /^Restricted Observer/ }).click()
    await page.getByRole('heading', { name: 'Restricted Observer' }).waitFor({ timeout: 15_000 })
    const inactiveStart = page.getByRole('button', { name: 'Start chat', exact: true })
    expect(await inactiveStart.isDisabled()).toBe(true)

    await page.getByRole('button', { name: /^Operations Lead/ }).click()
    await page.getByRole('heading', { name: 'Operations Lead' }).waitFor({ timeout: 15_000 })
    await inactiveStart.click()
    const managementComposer = page.locator('textarea:enabled[placeholder="Describe what you want to build"]')
    await managementComposer.press('End')
    await managementComposer.type(MANAGEMENT_TASK)
    await managementComposer.press('Enter')

    await expect.poll(() => employeeSessionIds(scaffold).length, { timeout: 15_000 }).toBe(2)
    const managementSessionId = employeeSessionIds(scaffold).find(id => id !== directSessionId)!
    expect(managementSessionId).not.toBe(directSessionId)
    await page.locator('[data-chat-flow-kind="user"]').getByText(MANAGEMENT_TASK, { exact: true })
      .waitFor({ timeout: 15_000 })
    await expect.poll(async () => {
      const loaded = await scaffold.ctx.sessionPersistence.load(managementSessionId)
      return {
        owner: loaded.events.find(event => event.type === 'digital-employee/identity')?.data.employeeId,
        prompts: userText(loaded.events),
      }
    }, { timeout: 15_000 }).toEqual({
      owner: operationsLeadId,
      prompts: [MANAGEMENT_TASK],
    })

    expect(restrictedObserverId).not.toBe(operationsLeadId)
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('shows independent grants, approves an upgrade, exports without secrets, and confirms cleanup', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-digital-employees'))
    const nav = page.getByRole('button', { name: 'Digital employees', exact: true })
    await nav.click()
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await page.getByRole('heading', { name: 'Operations Lead' }).waitFor({ timeout: 15_000 })

    await page.getByRole('tab', { name: 'Experts' }).click()
    await page.getByText('Independent Reviewer: Review delegated work and identify missing evidence.', { exact: true })
      .waitFor({ timeout: 10_000 })

    await page.getByRole('button', { name: /^Restricted Observer/ }).click()
    await page.getByRole('heading', { name: 'Restricted Observer' }).waitFor({ timeout: 10_000 })
    await page.getByRole('tab', { name: 'Experts' }).click()
    await page.getByText('Nothing to show.', { exact: true }).waitFor({ timeout: 10_000 })

    await page.getByRole('button', { name: /^Operations Lead/ }).click()
    await page.getByLabel('Target template version').fill('2.0.0')
    await page.getByRole('button', { name: 'Review upgrade', exact: true }).click()
    const upgrade = page.getByRole('dialog', { name: 'Approve template upgrade?' })
    await upgrade.waitFor({ timeout: 10_000 })
    await upgrade.getByRole('checkbox', { name: 'Approve all newly requested capabilities' }).check()
    await upgrade.getByRole('button', { name: 'Apply upgrade', exact: true }).click()
    await page.getByText(/web-operations-coordinator · 2\.0\.0 · active/).waitFor({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const exported = page.locator('pre')
    await exported.waitFor({ timeout: 10_000 })
    const artifact = await exported.textContent()
    expect(artifact).toContain('"formatVersion": 1')
    expect(artifact).not.toMatch(/credential|secret|token|api[_-]?key/i)

    await page.getByRole('button', { name: /^Restricted Observer/ }).click()
    await page.getByRole('button', { name: 'Delete employee', exact: true }).click()
    const deletion = page.getByRole('dialog', { name: 'Delete digital employee?' })
    await deletion.waitFor({ timeout: 10_000 })
    await deletion.getByRole('button', { name: 'Delete employee', exact: true }).click()
    await expect.poll(() => page.getByRole('button', { name: /^Restricted Observer/ }).count(), {
      timeout: 15_000,
    }).toBe(0)

    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('scopes installed marketplace skills to the template Agent preset', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-digital-employee-template-skills'))
    const runtimeBefore = {
      agents: scaffold.ctx.agents.roots().map(agent => agent.id).sort(),
      modelRequests: modelRequestCount,
      sessions: await runtimeSessionIds(scaffold),
    }
    if (await page.getByRole('tab', { name: 'Template configuration' }).count() === 0) {
      await page.getByRole('button', { name: 'Digital employees', exact: true }).click()
    }
    await page.getByRole('tab', { name: 'Template configuration' }).click()
    const draftName = page.getByText(/Web Market Template/).first()
    await draftName.waitFor({ timeout: 15_000 })
    await draftName.locator('..').getByRole('button', { name: 'Edit', exact: true }).click()

    await page.getByText('Marketplace · 1.2.3 · Web E2E', { exact: true }).waitFor({ timeout: 10_000 })
    await page.getByText('template · browser', { exact: true }).first().waitFor({ timeout: 10_000 })
    const active = page.getByRole('checkbox', { name: ACTIVE_MARKET_SKILL })
    const inactive = page.getByRole('checkbox', { name: INACTIVE_MARKET_SKILL })
    expect(await active.isEnabled()).toBe(true)
    expect(await inactive.isEnabled()).toBe(true)
    await active.check()
    await page.getByRole('textbox', { name: 'Edit template preset' }).fill('minimal')
    await expect.poll(() => active.isDisabled(), { timeout: 10_000 }).toBe(false)
    expect(await active.isChecked()).toBe(true)
    expect(await inactive.isDisabled()).toBe(true)
    await page.getByText('Agent preset "minimal" does not expose this installed Skill.', { exact: true })
      .first().waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect.poll(async () => {
      const drafts = await scaffold.ctx.digitalEmployeeManagement.listConfigurationDrafts()
      return drafts.find(draft => draft.templateId === 'web-market-template')?.capabilities.skills
    }, { timeout: 10_000 }).toEqual([ACTIVE_MARKET_SKILL])
    const validation = await scaffold.ctx.digitalEmployeeManagement.validateConfigurationDraft({
      draftId: (await scaffold.ctx.digitalEmployeeManagement.listConfigurationDrafts())
        .find(draft => draft.templateId === 'web-market-template')!.id,
    })
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unavailable-skill' }),
    ]))
    expect({
      agents: scaffold.ctx.agents.roots().map(agent => agent.id).sort(),
      modelRequests: modelRequestCount,
      sessions: await runtimeSessionIds(scaffold),
    }).toEqual(runtimeBefore)
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)
})
