/**
 * Deterministic project-management skills for the fixture template.
 * @module @deepseek-ai/dsh-project-manager-test-digital-employee/skills
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

/** Static skills that keep the assembled fixture independent of filesystem discovery. */
export const PROJECT_SKILLS: readonly SkillRegistration[] = [
  {
    name: 'project-planning',
    description: 'Build a delivery plan from declared project evidence.',
    content: 'Create milestones, owners, dependencies, and a next decision from the available project data.',
    source: 'project-manager-test',
  },
  {
    name: 'risk-review',
    description: 'Review delivery risks with owners and mitigations.',
    content: 'Report only observed risks, their owner, impact, mitigation, and the next review point.',
    source: 'project-manager-test',
  },
  {
    name: 'status-reporting',
    description: 'Prepare a concise project status report.',
    content: 'Report milestone state, owners, risks, decisions, and next actions in a stable order.',
    source: 'project-manager-test',
  },
]

export const name = 'project-manager-test-skills'
export const inject = ['skills']

/** Register the fixture's package-owned project-management skills. */
export function apply(ctx: Context): void {
  for (const skill of PROJECT_SKILLS) ctx.skills.register(skill)
}
