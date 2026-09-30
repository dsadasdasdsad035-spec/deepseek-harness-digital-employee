import { Context } from '@qq296629801/cordis'
import type { Agent } from '@qq296629801/dsh-agent'
import AgentLoop from '@qq296629801/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@qq296629801/dsh-agent-loop-testkit'
import LocalFileSystem from '@qq296629801/dsh-fs-local'
import * as FsPolicy from '@qq296629801/dsh-fs-observation-policy'
import * as ToolFs from '@qq296629801/dsh-tool-fs'
import * as LlmDeepSeek from '@qq296629801/dsh-llm-deepseek'

/**
 * Build the real fs-tool stack for with-key e2e tests. Agents have no session
 * cwd, so `fsCwd` is their workspace; `persona` configures the deployment prompt.
 * This helper lives outside the e2e glob so imports do not register tests.
 */
export async function fsHarness(fsCwd: string, persona = ''): Promise<Context> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx, { systemPrompt: { persona } })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(LlmDeepSeek)
  await ctx.plugin(LocalFileSystem, { cwd: fsCwd })
  await ctx.plugin(FsPolicy)
  await ctx.plugin(ToolFs)
  return ctx
}

export function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}
