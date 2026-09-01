#!/usr/bin/env node

import type { Context } from '@deepseek-ai/cordis'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { createDigitalEmployeeTemplateId } from '@deepseek-ai/dsh-digital-employee'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('configuration-studio driver requires a config path')

const authority = {
  skills: [],
  tools: [],
  mcpServers: [],
  experts: [],
  allowSubagents: false,
}

function acceptance(stage: string, data: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify({ type: 'acceptance', stage, ...data })}\n`)
}

let ctx: Context | undefined
try {
  ctx = await boot('digital-employee-configuration-studio-e2e', resolveConfigPath(configPath, undefined))
  const workspaceId = WorkspaceId('digital-employee-configuration-studio-workspace')
  const assetCatalog = await ctx.digitalEmployeeManagement.listConfigurationAssets({
    preset: 'digital-employee-minimal',
  })
  acceptance('skill-catalog-merged', {
    skills: assetCatalog.entries.filter(entry => entry.kind === 'skill').map(entry => ({
      name: entry.label,
      available: entry.available,
      source: entry.source,
      version: entry.version,
      publisher: entry.publisher,
      tags: entry.tags,
      restartRequired: entry.restartRequired,
    })),
  })
  const draft = await ctx.digitalEmployeeManagement.createConfigurationDraft({
    templateId: 'studio-assistant',
    display: {
      name: 'Studio Assistant',
      description: 'A locally authored employee template.',
    },
    instructions: 'Help users make deliberate, well-scoped changes.',
    personality: 'Careful and concise.',
    preset: 'digital-employee-minimal',
    capabilities: authority,
    mcpServers: [],
    experts: [],
    memorySeeds: [{
      content: 'Use staged releases with a named rollback owner.',
      tags: ['release'],
      sensitive: false,
    }],
    delegation: {
      maxDepth: 0,
      maxConcurrency: 1,
      timeoutMs: 30_000,
    },
  })
  acceptance('draft-created', { revision: draft.revision, templateId: draft.templateId })

  const validation = await ctx.digitalEmployeeManagement.validateConfigurationDraft({ draftId: draft.id })
  acceptance('draft-validation-result', { diagnostics: validation.diagnostics })
  if (validation.diagnostics.length > 0) throw new Error('fixture draft must validate')
  acceptance('draft-validated', { diagnostics: validation.diagnostics.length, revision: validation.revision })

  const preview = await ctx.digitalEmployeeManagement.previewConfigurationDraft({
    draftId: draft.id,
    revision: validation.revision,
    workspaceId,
  })
  acceptance('preview-created', {
    draftIdMatches: preview.draftId === draft.id,
    state: preview.state,
  })
  await ctx.digitalEmployeeManagement.disposeConfigurationPreview({ previewId: preview.id })
  acceptance('preview-disposed', { previewId: preview.id.startsWith('preview-') })

  const firstPublication = await ctx.digitalEmployeeManagement.publishConfigurationDraft({
    draftId: draft.id,
    revision: validation.revision,
  })
  acceptance('first-version-published', { version: firstPublication.version })

  const revised = await ctx.digitalEmployeeManagement.updateConfigurationDraft({
    draftId: draft.id,
    revision: draft.revision,
    patch: { personality: 'Careful, concise, and proactive.' },
  })
  const revisedValidation = await ctx.digitalEmployeeManagement.validateConfigurationDraft({ draftId: draft.id })
  if (revisedValidation.diagnostics.length > 0) throw new Error('revised fixture draft must validate')
  const secondPublication = await ctx.digitalEmployeeManagement.publishConfigurationDraft({
    draftId: revised.id,
    revision: revisedValidation.revision,
  })
  acceptance('second-version-published', { version: secondPublication.version })

  const templates = await ctx.digitalEmployeeManagement.listTemplates()
  acceptance('published-versions-resolved', {
    versions: templates
      .filter(template => template.id === createDigitalEmployeeTemplateId('studio-assistant'))
      .map(template => template.version)
      .sort(),
  })

  const employee = await ctx.digitalEmployeeManagement.create({
    templateId: createDigitalEmployeeTemplateId('studio-assistant'),
    templateVersion: firstPublication.version,
    displayName: 'Atlas',
    grants: authority,
  })
  const memories = await ctx.digitalEmployeeManagement.listMemory({
    employeeId: employee.id,
    text: 'rollback',
    scopes: ['long-term'],
    limit: 3,
  })
  acceptance('employee-created', {
    state: employee.state,
    seededMemory: memories.some(memory => memory.content.includes('rollback owner')),
  })

  const upgrade = await ctx.digitalEmployeeManagement.previewUpgrade({
    employeeId: employee.id,
    targetVersion: secondPublication.version,
  })
  acceptance('upgrade-reviewed', {
    currentVersion: upgrade.currentVersion,
    targetVersion: upgrade.targetVersion,
    addedCapabilities: upgrade.addedCapabilities,
  })
} finally {
  await ctx?.fiber.dispose()
}
