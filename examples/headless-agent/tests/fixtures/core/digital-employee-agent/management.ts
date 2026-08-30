import type { Context } from '@deepseek-ai/cordis'
import type { Plugin } from '@deepseek-ai/cordis'
import DigitalEmployeeManagement from '@deepseek-ai/dsh-host-digital-employee-management'

const workspaceRegistryService = {
  get: (id: string) => id === 'digital-employee-management-workspace'
    ? {
      id: 'digital-employee-management-workspace',
      path: process.cwd(),
      attachSession: async () => {},
    }
    : undefined,
}

/** Digital employee management fixture with a minimal workspace registry dependency. */
const managementWithWorkspaceRegistry: Plugin = {
  name: 'digital-employee-management-with-workspace',
  apply: async (ctx: Context) => {
    ctx.provide('workspaceRegistry', workspaceRegistryService)
    await ctx.plugin(DigitalEmployeeManagement as Plugin, {})
  },
}

export default managementWithWorkspaceRegistry
