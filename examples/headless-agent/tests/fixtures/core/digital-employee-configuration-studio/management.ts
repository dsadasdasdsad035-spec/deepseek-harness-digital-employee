import type { Context, Plugin } from '@deepseek-ai/cordis'
import DigitalEmployeeManagement from '@deepseek-ai/dsh-host-digital-employee-management'

const workspaceRegistryService = {
  get: (id: string) => id === 'digital-employee-configuration-studio-workspace'
    ? {
      id,
      path: process.cwd(),
      attachSession: async () => {},
    }
    : undefined,
}

/** Configuration-studio fixture with a minimal workspace registry dependency. */
const managementWithWorkspaceRegistry: Plugin = {
  name: 'digital-employee-configuration-studio-with-workspace',
  apply: async (ctx: Context) => {
    ctx.provide('workspaceRegistry', workspaceRegistryService)
    await ctx.plugin(DigitalEmployeeManagement as Plugin, {
      administrator: true,
      studioFile: './configuration-studio.json',
    })
  },
}

export default managementWithWorkspaceRegistry
