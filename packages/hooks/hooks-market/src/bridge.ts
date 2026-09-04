/**
 * Employee-scoped mounting of installed hook packages: passive interception
 * handlers plus invocable `hook__<id>` tools, executed through the shared
 * hook protocol.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type { HookPackageDescriptor } from '@deepseek-ai/dsh-marketplace-core'
import {
  matchesMatcher,
  mergeHookOutputs,
  runHook,
} from '@deepseek-ai/dsh-hook-protocol'
import type { MergedHookOutcome } from '@deepseek-ai/dsh-hook-protocol'
import type { PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import type { InstalledHookPackage } from './index.ts'

/** One resolved binding: an installed package plus one of its declared hooks. */
export interface EmployeeHookBinding {
  readonly pkg: InstalledHookPackage
  readonly hook: HookPackageDescriptor['hooks'][number]
}

/** Options for mounting employee hooks. */
export interface MountEmployeeHooksOptions {
  /** Default timeout for hooks without `timeoutSec`. */
  readonly defaultTimeoutMs?: number
  /** Working directory for hook commands; defaults to the package directory. */
  readonly workdir?: string
}

/**
 * Mount one employee's hook bindings on the Agent context: passive handlers at
 * each declared interception point plus one model-facing tool per invocable
 * hook. Handlers run through the shared protocol runner; matcher evaluation
 * uses the neutral `claude` mode.
 * @param agentCtx - Agent scope context providing `tools`, `shell`, and the
 *   interception events.
 * @param bindings - Installed packages and their hooks bound to this employee.
 * @param options - Runner defaults and working directory.
 * @returns disposer releasing the registered handlers and tools.
 */
export function mountEmployeeHooks(
  agentCtx: Context,
  bindings: readonly EmployeeHookBinding[],
  options: MountEmployeeHooksOptions = {},
): () => void {
  if (bindings.length === 0) return () => {}
  const shell = agentCtx.get('shell')
  if (shell === undefined) {
    throw new Error('hooks-market bridge requires the shell service in the mounting scope')
  }
  const executor = shell
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 600_000
  const disposers: Array<() => void> = []

  async function runBound(
    event: HookPackageDescriptor['hooks'][number]['event'],
    query: string,
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<MergedHookOutcome> {
    const outputs = []
    for (const { pkg, hook } of bindings) {
      if (hook.event !== event) continue
      if (!matchesMatcher(hook.matcher ?? '', query, 'claude-code')) continue
      const env: Record<string, string> = { ...hook.env }
      const market = agentCtx.root.hookMarket
      for (const slot of Object.keys(hook.credentialReferences)) {
        env[slot] = await market.resolveSlotValue(pkg.packageId, slot)
      }
      const { output } = await runHook(executor, {
        command: [hook.command, ...hook.args].join(' '),
        ...hook.timeoutSec === undefined ? {} : { timeoutSec: hook.timeoutSec },
      }, {
        payload: { hook_event_name: event, ...payload },
        defaultTimeoutMs,
        cwd: options.workdir ?? pkg.directory,
        signal,
        trailingNewline: true,
      }, () => performance.now())
      outputs.push(output)
    }
    return mergeHookOutputs(outputs)
  }

  const stdoutOf = (merged: MergedHookOutcome): string =>
    merged.reason !== undefined ? merged.reason : ''

  // Passive interception: tool boundaries and prompt/stop boundaries. Session
  // hooks are handled by the host-level bridge; instance bindings cover the
  // four turn-enclosed points.
  agentCtx.on('tools/pre-execute', async (exec: ToolExecution, next): Promise<PreToolDecision> => {
    const merged = await runBound('PreToolUse', exec.name, { tool_name: exec.name }, exec.signal)
    if (merged.decision === 'deny') return { kind: 'deny', reason: stdoutOf(merged) || 'blocked by hook' }
    if (merged.decision === 'ask') return { kind: 'ask', ...stdoutOf(merged) ? { reason: stdoutOf(merged) } : {} }
    return next()
  })
  agentCtx.on('tools/post-execute', async (exec: ToolExecution, _result: ToolExecutionResult, next) => {
    const merged = await runBound('PostToolUse', exec.name, { tool_name: exec.name }, exec.signal)
    if (merged.decision === 'deny') {
      return { kind: 'block', feedback: [{ type: 'text', text: stdoutOf(merged) || 'blocked by hook' }] }
    }
    return next()
  })
  agentCtx.on('agent/pre-step', async ({ signal }, next) => {
    const merged = await runBound('UserPromptSubmit', '', {}, signal)
    if (merged.decision === 'deny') return { kind: 'reject' }
    return next()
  })
  agentCtx.on('agent/turn-stopping', async ({ signal }) => {
    await runBound('Stop', '', {}, signal)
  })

  // Invocable hooks: one tool per declared invocable entry.
  const tools = agentCtx.get('tools')
  for (const { pkg, hook } of bindings) {
    if (hook.invocable !== true) continue
    const toolName = `hook__${hook.id}`
    const scopedTools = tools
    if (scopedTools === undefined) continue
    const disposeTool = scopedTools.register(defineTool({
      name: toolName,
      description: `Run the "${hook.id}" hook command from package ${pkg.packageId}.`,
      parameters: {
        input: {
          type: 'string',
          required: true,
          description: 'Free-form input forwarded to the hook as JSON payload field "input".',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      execute: async (args, exec) => {
        const merged = await runBound(hook.event, '', { input: args.input ?? '' }, exec.signal)
        return stdoutOf(merged)
      },
    }))
    disposers.push(disposeTool)
  }

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}
