/**
 * Authoring tools scoped to the builder employee composition: thin wrappers
 * over the configuration-studio remotes so the model can drive the
 * interview-author-validate-publish loop without leaving chat.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

/** Management gateway face the tools call; structural for testability. */
interface AuthoringGateway {
  listConfigurationAssets(request: { preset: string }): Promise<unknown>
  createConfigurationDraft(request: Record<string, unknown>): Promise<unknown>
  updateConfigurationDraft(request: Record<string, unknown>): Promise<unknown>
  validateConfigurationDraft(request: { draftId: string }): Promise<unknown>
  previewConfigurationDraft(request: Record<string, unknown>): Promise<unknown>
  publishConfigurationDraft(request: Record<string, unknown>): Promise<unknown>
}

/**
 * Register the six authoring tools on the host tools registry. Visibility is
 * controlled by the builder employee's authority allowlist, so other
 * compositions never see them.
 * @param ctx - Context providing `tools` and the management gateway.
 * @param preset - Agent preset used for asset listing.
 * @returns disposer releasing all authoring tools.
 */
export function registerAuthoringTools(ctx: Context, preset: string): () => void {
  const gateway = ctx.get('digitalEmployeeManagement' as never) as unknown as AuthoringGateway | undefined
  if (gateway === undefined) {
    throw new Error('builder authoring tools require the digital-employee-management gateway')
  }
  const disposers: Array<() => void> = []
  interface AuthoringToolDef {
    name: string
    description: string
    parameters: Record<string, unknown>
    output: Record<string, unknown>
    isConcurrencySafe?: () => boolean
    execute: (args: Record<string, unknown>, exec: { signal: AbortSignal }) => Promise<string>
  }
  const register = (definition: AuthoringToolDef): void => {
    disposers.push(ctx.tools.register(definition as never))
  }

  register({
    name: 'builder_list_assets',
    description: 'List installed skills, tools, MCP clients, hooks, workflows, and subagents available for a new digital employee.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { result: { type: 'string', required: true } } },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: String(value) }],
    },
    isConcurrencySafe: () => true,
    execute: async () => JSON.stringify(await gateway.listConfigurationAssets({ preset }), null, 2),
  })

  register({
    name: 'builder_create_draft',
    description: 'Create a new digital employee configuration draft from the interview results.',
    parameters: {
      templateId: { type: 'string', required: true, description: 'Stable template identifier (kebab-case).' },
      name: { type: 'string', required: true, description: 'Display name.' },
      description: { type: 'string', required: true, description: 'What this employee does.' },
      instructions: { type: 'string', required: true, description: 'Main agent instructions.' },
      capabilitiesJson: { type: 'string', required: true, description: 'JSON authority: {skills,tools,mcpServers,experts,allowSubagents}.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { result: { type: 'string', required: true } } },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: String(value) }],
    },
    execute: async (args) => {
      const capabilities = JSON.parse(String(args.capabilitiesJson)) as Record<string, unknown>
      const result = await gateway.createConfigurationDraft({
        templateId: String(args.templateId), display: { name: String(args.name), description: String(args.description) },
        instructions: String(args.instructions), capabilities,
      })
      return JSON.stringify(result)
    },
  })

  register({
    name: 'builder_validate_draft',
    description: 'Validate a draft and report every diagnostic before preview or publish.',
    parameters: {
      draftId: { type: 'string', required: true, description: 'Draft identity to validate.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { result: { type: 'string', required: true } } },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: String(value) }],
    },
    execute: async args => JSON.stringify(await gateway.validateConfigurationDraft({ draftId: String(args.draftId) })),
  })

  register({
    name: 'builder_preview_draft',
    description: 'Start an isolated preview session from a validated draft.',
    parameters: {
      draftId: { type: 'string', required: true, description: 'Draft identity to preview.' },
      revision: { type: 'string', required: true, description: 'Draft revision observed before preview.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { result: { type: 'string', required: true } } },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: String(value) }],
    },
    execute: async args => JSON.stringify(await gateway.previewConfigurationDraft({
      draftId: String(args.draftId), revision: Number(String(args.revision)),
    })),
  })

  register({
    name: 'builder_publish_draft',
    description: 'Publish a validated draft as an immutable local template version.',
    parameters: {
      draftId: { type: 'string', required: true, description: 'Draft identity to publish.' },
      revision: { type: 'string', required: true, description: 'Draft revision to publish.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { result: { type: 'string', required: true } } },
      render: (_args: unknown, value: string) => [{ type: 'text' as const, text: String(value) }],
    },
    execute: async args => JSON.stringify(await gateway.publishConfigurationDraft({
      draftId: String(args.draftId), revision: Number(String(args.revision)),
    })),
  })

  return () => { for (const dispose of disposers.reverse()) dispose() }
}
