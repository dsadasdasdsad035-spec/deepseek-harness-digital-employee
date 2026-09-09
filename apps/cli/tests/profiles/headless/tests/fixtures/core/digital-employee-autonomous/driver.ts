#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('employee autonomous driver requires a config path')

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

let ctx: Context | undefined
try {
  ctx = await boot('employee-autonomous-e2e', resolveConfigPath(configPath, undefined))
  // The runner fires on mount; wait for its recorded exit plus a settling
  // margin for async ledger/memory/notification writes.
  const globals = globalThis as unknown as { __employeeAutonomousExits: number[] | undefined }
  const start = Date.now()
  while ((globals.__employeeAutonomousExits?.length ?? 0) === 0 && Date.now() - start < 60_000) {
    await new Promise((resolve) => { setTimeout(resolve, 20) })
  }
  const exits = globals.__employeeAutonomousExits ?? []
  acceptance('exit-recorded', { exits })

  const ledgerPath = dshHomePath('digital-employees', 'task-attempts.json')
  let ledger: unknown
  try {
    ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) as unknown
  } catch {
    ledger = {}
  }
  acceptance('ledger-state', { ledger })

  // The task console remotes, exercised inside the same assembly: list,
  // resume (only meaningful when the ledger actually suspended), and the
  // labeled test send through the fixture channel.
  const management = ctx.get('digitalEmployeeManagement')
  if (management === undefined) throw new Error('the console fixture requires the management gateway')
  try {
    const before = await management.listEmployeeTasks()
    acceptance('console-list-before', { entries: before })
    const suspendedKey = before.find(entry => entry.suspended)?.key
    if (suspendedKey !== undefined) {
      await management.resumeEmployeeTask({ key: suspendedKey })
      const after = await management.listEmployeeTasks()
      acceptance('console-list-after', { entries: after })
    }
    const testOutcome = await management.testNotificationChannel({ channel: 'fixture-channel' })
    acceptance('console-test', { delivered: testOutcome.delivered })
  } catch (error) {
    acceptance('console-error', { message: error instanceof Error ? error.message : String(error) })
  }

  const captured = globalThis as unknown as { __employeeAutonomousSent?: Array<{ channel: string; title: string }> }
  const sent = captured.__employeeAutonomousSent ?? []
  acceptance('notifications-captured', { count: sent.length })
  for (const notice of sent) {
    acceptance('notification-sent', { channel: notice.channel, title: notice.title })
  }
} catch (error) {
  process.stderr.write(`driver failed: ${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
}
