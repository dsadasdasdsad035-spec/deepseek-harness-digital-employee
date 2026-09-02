// Web e2e scenario: the shipped digital employee workspace exercises the real
// typed Remote and file provider without entering the model loop.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  createExpertId,
  createDigitalEmployeeTemplateId,
  type DigitalEmployeeInstanceId,
  type DigitalEmployeeAuthority,
  type DigitalEmployeeTemplate,
} from '@deepseek-ai/dsh-digital-employee'
import { CallId } from '@deepseek-ai/dsh-llm'
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

function userText(events: readonly SessionEvent[]): string[] {
  return events.flatMap(event => event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.data.content.flatMap(block => block.type === 'text' ? [block.text] : [])
    : [])
}

function employeeSessionIds(scaffold: WebScaffold): SessionId[] {
  return scaffold.ctx.agents.roots().flatMap(agent =>
    agent.session.events.some(event => event.type === 'digital-employee/identity') ? [agent.id] : [])
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
        maxDepth: 1,
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

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    scaffold.ctx.on('agent/request', async (_payload, next) => ({
      ...await next(),
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    }))
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
    await scaffold.ctx.digitalEmployees.activate(operationsLeadId)
    const restrictedObserver = await scaffold.ctx.digitalEmployees.create({
      templateId: TEMPLATE_ID,
      templateVersion: '1.0.0',
      displayName: 'Restricted Observer',
      grants: RESTRICTED_AUTHORITY,
    })
    restrictedObserverId = restrictedObserver.id
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
        prompts: userText(loaded.events),
      }
    }, { timeout: 15_000 }).toEqual({
      owner: operationsLeadId,
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

  it('exposes the model-facing expert delegation tool on an @-started employee session', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-digital-employee-expert'))
    const parentId = employeeSessionIds(scaffold)[0]
    expect(parentId).toBeDefined()
    const parent = scaffold.ctx.agents.get(parentId!)
    expect(parent).toBeDefined()
    const tool = scaffold.ctx.tools.get('delegate_to_expert', parent!)
    expect(tool).toBeDefined()

    const execution = await scaffold.ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('web-digital-employee-expert'),
      name: 'delegate_to_expert',
      arguments: {
        expert_id: REVIEWER_ID,
        prompt: 'Review the launch readiness evidence and return one risk finding.',
      },
      agent: parent!,
    })
    if (execution.content[0]?.type === 'text') {
      expect(execution.content[0].text).not.toMatch(/^Error:/)
    }
    expect(execution.content[0]).toMatchObject({ type: 'text' })

    await expect.poll(
      () => scaffold.ctx.digitalEmployeeAgent.listExpertTree(parentId!),
      { timeout: 30_000 },
    ).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'child',
        parentId,
        depth: 1,
      }),
    ]))
    const child = (await scaffold.ctx.digitalEmployeeAgent.listExpertTree(parentId!))
      .find(entry => entry.kind === 'child')
    expect(child).toBeDefined()
    await scaffold.ctx.digitalEmployeeAgent.followupExpert(
      parent!,
      child!.id,
      [{ type: 'text', text: 'Return the updated risk finding.' }],
      { source: { kind: 'user' }, signal: new AbortController().signal },
    )
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
