/**
 * `dsh employee-task <list|resume|discard>` — boot-free management of the
 * autonomous-task attempt ledger. The command never starts a harness: it
 * resolves the ledger under `$DSH_HOME` and mutates it through the same
 * locked transactions the headless driver and the Web console use, so all
 * three writers serialize on one lock.
 * @module @deepseek-ai/dsh/employee-task
 */

import { Command, CommanderError } from 'commander'
import {
  listTaskAttempts,
  withTaskAttempts,
  type TaskAttemptRecord,
} from '@deepseek-ai/dsh-digital-employee-file'

const USAGE = 'Usage: dsh employee-task <list | resume <key> | discard <key>>'

/** Render one ledger record's human columns; display names fall back to the key. */
function columns(key: string, record: TaskAttemptRecord): { display: string; state: string; reason: string } {
  return {
    display: record.displayName ?? key,
    state: record.suspended === true ? 'suspended' : `${record.consecutiveFailures} failure(s)`,
    reason: (record.lastReason ?? '').slice(0, 60),
  }
}

/**
 * Run the employee-task command.
 * @param argv - arguments after `dsh employee-task`.
 * @returns the process exit code.
 */
export async function runEmployeeTask(argv: readonly string[]): Promise<number> {
  const program = new Command()
  program
    .name('dsh employee-task')
    .description('manage the autonomous-task attempt ledger without booting a profile')
    .helpOption('-h, --help', 'show this help')
    .exitOverride()

  program
    .command('list')
    .description('print every ledger record (key, display name, failures, suspended, last reason)')
    .action(async () => {
      const ledger = await listTaskAttempts()
      const keys = Object.keys(ledger).sort()
      if (keys.length === 0) {
        console.log('No autonomous task attempts recorded.')
        return
      }
      for (const key of keys) {
        const record = ledger[key]
        if (record === undefined) continue
        const { display, state, reason } = columns(key, record)
        console.log(`${record.suspended === true ? '⛔' : '·'} ${key}  ${display}  [${state}]${reason === '' ? '' : ` ${reason}`}`)
      }
    })

  program
    .command('resume')
    .description('clear the suspension flag of a suspended task (failure count is kept)')
    .argument('<key>', 'the ledger task key to resume')
    .action(async (key: string) => {
      await withTaskAttempts((ledger) => {
        const record = ledger[key]
        if (record === undefined) {
          throw new Error(`task key ${JSON.stringify(key)} is not in the ledger`)
        }
        if (record.suspended !== true) {
          throw new Error(`task key ${JSON.stringify(key)} is not suspended`)
        }
        ledger[key] = {
          consecutiveFailures: record.consecutiveFailures,
          ...record.lastReason !== undefined ? { lastReason: record.lastReason } : {},
          ...record.displayName !== undefined ? { displayName: record.displayName } : {},
          ...record.employeeId !== undefined ? { employeeId: record.employeeId } : {},
        }
      })
      console.log(`Resumed ${key}. Deployment-side scheduling picks up the next run.`)
    })

  program
    .command('discard')
    .description('remove a ledger record entirely (the same key restarts from zero failures)')
    .argument('<key>', 'the ledger task key to discard')
    .action(async (key: string) => {
      await withTaskAttempts((ledger) => {
        if (ledger[key] === undefined) {
          throw new Error(`task key ${JSON.stringify(key)} is not in the ledger`)
        }
        for (const existing of Object.keys(ledger)) {
          if (existing === key) Reflect.deleteProperty(ledger, existing)
        }
      })
      console.log(`Discarded ${key}. The same key starts from zero failures.`)
    })

  try {
    // parseAsync (not parse): the subcommand actions are async — a plain
    // parse returns before they settle and swallows their rejections.
    await program.parseAsync(argv, { from: 'user' })
    return 0
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code !== 'commander.helpDisplayed' && error.code !== 'commander.version') {
        process.stderr.write(`${USAGE}\n`)
        return 1
      }
      return 0
    }
    process.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}
