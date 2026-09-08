/**
 * The one-shot app's command-line provider: it parses the task positional and
 * `--help`, then publishes {@link HEADLESS_STARTUP_SERVICE}. The runner is an
 * ordinary consumer whose lazy config waits for that service.
 * @module @deepseek-ai/dsh-headless/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'headless-startup'

/** Services required before the task can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this plugin and injected by the one-shot runner. */
export const HEADLESS_STARTUP_SERVICE = 'headlessStartup'

/** What the runner row reads from {@link HEADLESS_STARTUP_SERVICE}. */
export interface HeadlessStartupValues {
  /** The task text this invocation asked for. */
  task: string
  /** The digital employee the task runs as; the employee runner owns the run when set. */
  employee?: string
  /** Stable attempt-ledger key for retry counting; defaults to a hash of employee and task. */
  taskKey?: string
}

/**
 * This app's command: the task positional, its description, and its help text.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function headlessCommand(): Command {
  return new Command()
    .name('dsh --profile headless')
    .description('Answer one task, print the final assistant message, and exit.')
    .helpOption('-h, --help', 'show this help')
    .argument('[task...]', 'the task text; multiple words are joined by spaces')
    .option('--employee <id>', 'run the task as this digital employee (goal-armed autonomous run)')
    .option('--task-key <key>', 'stable attempt-ledger key for retry counting (requires --employee)')
    .addHelpText('after', `
Examples:
  dsh --profile headless "run the tests"                     answer one task and exit
  dsh --profile headless --employee pm "triage the inbox"    run one employee task
`)
}

/**
 * Parse and provide the one-shot task as an ordinary Cordis service. The
 * command's action publishes the task; a missing or whitespace-only task is a
 * usage error, so on rejection (and on `--help`) nothing is provided.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx: Context): void {
  const program = headlessCommand()
  program.action(() => {
    const task = program.args.join(' ')
    if (task.trim() === '') program.error('error: a task is required, for example: dsh --profile headless "run the tests"')
    const options = program.opts<{ employee?: string; taskKey?: string }>()
    if (options.taskKey !== undefined && options.employee === undefined) {
      program.error('error: --task-key requires --employee')
    }
    ctx.provide(HEADLESS_STARTUP_SERVICE, {
      task,
      ...options.employee !== undefined ? { employee: options.employee } : {},
      ...options.taskKey !== undefined ? { taskKey: options.taskKey } : {},
    } satisfies HeadlessStartupValues)
  })
  parseCmdline(ctx, program)
}
