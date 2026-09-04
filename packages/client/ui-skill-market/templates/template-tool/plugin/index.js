import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'marketplace-tool-template'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'marketplace_echo',
    description: 'Return the supplied text from the signed marketplace Tool template.',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'Text to return.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return args.text
    },
  }))
}
