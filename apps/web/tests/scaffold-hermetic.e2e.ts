import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-skill'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-host-digital-employee-management'
import {
  launchRestartableWebScaffold,
  launchWebScaffold,
  type RestartableWebScaffold,
  type WebScaffold,
} from './scaffold.ts'

async function writeSkill(root: string, name: string): Promise<void> {
  const bundle = join(root, name)
  await mkdir(bundle, { recursive: true })
  await writeFile(join(bundle, 'SKILL.md'), `---
name: ${name}
description: Must not enter the Web replay scaffold
---

Ambient host state.
`)
}

it('isolates replay skill discovery from every ambient host root', async () => {
  const ambient = await mkdtemp(join(tmpdir(), 'dsh-web-ambient-skills-'))
  const dshHome = join(ambient, 'dsh-home')
  const agentsHome = join(ambient, 'agents-home')
  const bundled = join(ambient, 'bundled')
  await Promise.all([
    writeSkill(join(dshHome, 'skills'), 'ambient-dsh'),
    writeSkill(join(agentsHome, 'skills'), 'ambient-agents'),
    writeSkill(bundled, 'ambient-bundled'),
  ])

  const originalDshHome = process.env.DSH_HOME
  const originalAgentsHome = process.env.DSH_AGENTS_HOME
  const originalBundled = process.env.DSH_BUNDLED_SKILL_DIR
  process.env.DSH_HOME = dshHome
  process.env.DSH_AGENTS_HOME = agentsHome
  process.env.DSH_BUNDLED_SKILL_DIR = bundled
  let scaffold: WebScaffold | undefined
  try {
    scaffold = await launchWebScaffold()
    const ctx = scaffold.ctx
    // Local skill discovery belongs to the agent's preset LAYER of the host
    // registry, so the roots under test are only reachable through a composed
    // agent's view — the same scope the gateway's `skill.list` resolves for a
    // browser request about a session.
    const handle = await ctx.agents.create({
      sessionId: SessionId('hermetic-skills'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx).then(() => undefined),
    })
    try {
      const skills = ctx.get('skills')
      if (skills === undefined) throw new Error('the composition mounts no skill registry')
      const names = (await skills.list({ cwd: scaffold.workspaceCwd, scope: handle.agent })).map(skill => skill.name)
      expect(names).not.toContain('ambient-dsh')
      expect(names).not.toContain('ambient-agents')
      expect(names).not.toContain('ambient-bundled')
    } finally {
      await handle.dispose()
    }
  } finally {
    try {
      await scaffold?.close()
    } finally {
      if (originalDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = originalDshHome
      if (originalAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME
      else process.env.DSH_AGENTS_HOME = originalAgentsHome
      if (originalBundled === undefined) delete process.env.DSH_BUNDLED_SKILL_DIR
      else process.env.DSH_BUNDLED_SKILL_DIR = originalBundled
      await rm(ambient, { recursive: true, force: true })
    }
  }
})

it('stops and relaunches a settled Host against the same Harness Home', async () => {
  let lifecycle: RestartableWebScaffold | undefined
  let isolated: RestartableWebScaffold | undefined
  try {
    lifecycle = await launchRestartableWebScaffold()
    const first = lifecycle.scaffold
    await expect(first.ctx.digitalEmployeeManagement.listConfigurationDrafts()).resolves.toEqual([])
    await first.ctx.digitalEmployeeManagement.createConfigurationDraft({
      templateId: 'restart-persistence',
      display: { name: 'Restart persistence', description: 'Persists only inside this lifecycle.' },
      instructions: 'Retain this draft across the Host restart.',
    })

    await lifecycle.stop()
    await expect(fetch(first.baseUrl)).rejects.toThrow()

    const second = await lifecycle.start()
    expect(second.harnessHome).toBe(first.harnessHome)
    expect(second.ctx).not.toBe(first.ctx)
    expect((await fetch(second.baseUrl)).ok).toBe(true)
    await expect(second.ctx.digitalEmployeeManagement.listConfigurationDrafts()).resolves.toHaveLength(1)

    isolated = await launchRestartableWebScaffold()
    await expect(isolated.scaffold.ctx.digitalEmployeeManagement.listConfigurationDrafts()).resolves.toEqual([])
  } finally {
    await isolated?.close()
    await lifecycle?.close()
  }
})
