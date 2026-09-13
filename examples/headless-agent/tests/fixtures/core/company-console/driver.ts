#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { appendTaskLifecycleEvent } from '@deepseek-ai/dsh-digital-employee-file/task-events'
import { SessionId, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('company console driver requires a config path')

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

/** Groups summarized by department name with member names and busy verdicts. */
function groupSummary(groups: ReadonlyArray<{
  department: { name: string } | null
  members: ReadonlyArray<{ displayName: string; busy: boolean; busyKind: string | null }>
}>): ReadonlyArray<{ department: string; members: ReadonlyArray<{ name: string; busy: boolean; busyKind: string | null }> }> {
  return groups.map(group => ({
    department: group.department === null ? '(未分配)' : group.department.name,
    members: group.members.map(member => ({
      name: member.displayName,
      busy: member.busy,
      busyKind: member.busyKind,
    })),
  }))
}


/** The last group message reduced to its comparable shape. */
interface GroupMessageShape {
  readonly speakerKind: string
  readonly displayName: string
  readonly text: string
  readonly context?: string
}

/** The last group message reduced to its comparable shape. */
function messageTail(view: { messages: ReadonlyArray<GroupMessageShape> }): GroupMessageShape | null {
  const message = view.messages.at(-1)
  if (message === undefined) return null
  return {
    speakerKind: message.speakerKind,
    displayName: message.displayName,
    text: message.text,
    ...(message.context === undefined ? {} : { context: message.context }),
  }
}

let ctx: Context | undefined
try {
  ctx = await boot('company-console-e2e', resolveConfigPath(configPath, undefined))
  const management = ctx.get('companyManagement')
  if (management === undefined) throw new Error('the company console fixture requires the management gateway')

  const company = await management.create({
    name: 'Acme',
    category: '科技',
    legalRepresentative: '张三',
    address: '北京市海淀区',
  })
  acceptance('company-created', { departments: company.departments.map(department => department.name) })

  const ceo = company.departments.find(department => department.name === '总裁')
  const it = company.departments.find(department => department.name === 'IT')
  if (ceo === undefined || it === undefined) throw new Error('preset departments missing')

  acceptance('skin-default', { skinId: company.skinId ?? null })

  const skinned = await management.update({ companyId: company.id, skinId: 'courtyard' })
  acceptance('skin-switched', { skinId: skinned.skinId ?? null })

  const withLegal = await management.addDepartment({ companyId: company.id, name: '法务', position: 1 })
  acceptance('department-added', { departments: withLegal.departments.map(department => department.name) })

  await management.assignEmployee({ instanceId: 'company-console-alice' as never, companyId: company.id, departmentId: ceo.id })
  await management.assignEmployee({ instanceId: 'company-console-bob' as never, companyId: company.id, departmentId: it.id })

  const candidates = await management.availableEmployees()
  acceptance('candidates', { names: candidates.map(candidate => candidate.displayName) })

  const idleFloor = await management.companyFloor({ companyId: company.id })
  acceptance('floor-idle', { groups: groupSummary(idleFloor.groups) })

  // Bob's headless-task session: a fresh artifact written by "another process"
  // (this driver, like the headless runner) through the real persistence
  // backend flips him task-busy.
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) throw new Error('the company console fixture requires session persistence')
  const taskSession = SessionId('company-console-session-task')
  const taskCreatedAt = Date.now()
  const taskHeader = { version: SESSION_FORMAT_VERSION, id: taskSession, createdAt: taskCreatedAt }
  await persistence.create(taskHeader)
  const location = persistence.locate(taskHeader)
  if (location === undefined) throw new Error('the company console fixture backend exposes no session artifact')
  await mkdir(dirname(location.path), { recursive: true })
  await writeFile(location.path, `${JSON.stringify({
    type: 'session',
    version: SESSION_FORMAT_VERSION,
    id: 'company-console-session-task',
    createdAt: taskCreatedAt,
    delegationDepth: 0,
  })}\n`)

  const busyFloor = await management.companyFloor({ companyId: company.id })
  acceptance('floor-task-busy', { groups: groupSummary(busyFloor.groups) })

  await management.deleteDepartment({ companyId: company.id, departmentId: it.id })
  const movedFloor = await management.companyFloor({ companyId: company.id })
  acceptance('department-deleted', { groups: groupSummary(movedFloor.groups) })

  const groups = ctx.get('companyGroupChat')
  if (groups === undefined) throw new Error('the company console fixture requires the group gateway')
  const openedGroup = await groups.openCompanyGroup(company.id)
  acceptance('group-opened', { members: openedGroup.members.length })

  await groups.sendCompanyGroupMessage(company.id, '@Alice 重点放在Q3交付')
  await groups.settle()
  acceptance('group-mention', {
    last: messageTail(await groups.openCompanyGroup(company.id)),
  })

  // Prime the boot cursor, then broadcast one lifecycle fact through the log.
  await groups.pollNow()
  await appendTaskLifecycleEvent({
    kind: 'succeeded', employeeId: 'company-console-bob', taskKey: 'weekly', taskTitle: '整理周报', at: 1,
  })
  await groups.pollNow()
  await groups.settle()
  acceptance('group-task-broadcast', {
    last: messageTail(await groups.openCompanyGroup(company.id)),
  })

  await groups.sendCompanyGroupMessage(company.id, '@Bob FORCE_FAIL')
  await groups.settle()
  acceptance('group-fallback', {
    last: messageTail(await groups.openCompanyGroup(company.id)),
  })

  // A real 1x1 PNG admitted through the attachment pipeline.
  const png = await management.setPromoImage({
    companyId: company.id,
    image: {
      mediaType: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      name: 'promo.png',
    },
  })
  acceptance('promo-set', {
    mediaType: png.promoImage?.mediaType,
    width: png.promoImage?.width,
    height: png.promoImage?.height,
  })

  const promo = await management.promoImage({ companyId: company.id })
  acceptance('promo-read', { delivered: promo !== null && promo.dataBase64.length > 0 })

  await management.delete({ companyId: company.id })
  acceptance('company-deleted', { remaining: (await management.list()).length })
} catch (error) {
  process.stderr.write(`driver failed: ${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
  // The gateway's interval and the session store flush through disposal, but
  // the assembled process keeps its stdio pipes until every loader fiber
  // settles; one-shot drivers own their exit explicitly.
  process.exit(process.exitCode ?? 0)
}
