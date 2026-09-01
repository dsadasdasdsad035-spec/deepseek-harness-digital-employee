export const name = 'marketplace-test-tool'
export const inject = ['tools']

export function apply(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: 'marketplace_test_echo',
    description: 'Return a deterministic marketplace test marker with supplied text.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to include in the deterministic response.',
        },
      },
      required: ['text'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `MARKETPLACE_TEST_TOOL_ECHO:${args.text}`
    },
  }))
}
