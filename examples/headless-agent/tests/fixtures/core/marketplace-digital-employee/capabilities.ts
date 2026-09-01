import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'marketplace-digital-employee-capabilities'
export const inject = ['skills', 'tools']

/** Register deterministic marketplace capability fixtures and one undeclared Tool. */
export function apply(ctx: Context): void {
  ctx.skills.register({
    name: 'marketplace-test-skill',
    description: 'Deterministic marketplace Skill fixture.',
    content: 'Include the exact marker MARKETPLACE_TEST_SKILL_LOADED in the result.',
    source: 'skill-market:marketplace-test-skill@1.0.0',
  })
  ctx.skills.register({
    name: 'marketplace-undeclared-skill',
    description: 'Installed but omitted marketplace Skill fixture.',
    content: 'This Skill must remain unavailable to the employee.',
    source: 'skill-market:marketplace-undeclared-skill@1.0.0',
  })
  ctx.tools.register(defineTool({
    name: 'marketplace_test_echo',
    description: 'Echo deterministic marketplace fixture text.',
    parameters: {
      text: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `MARKETPLACE_TEST_TOOL_ECHO:${args.text}`
    },
  }))
  ctx.tools.register(defineTool({
    name: 'marketplace_test_undeclared',
    description: 'Installed but omitted marketplace Tool fixture.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return 'MARKETPLACE_TEST_UNDECLARED'
    },
  }))
}
