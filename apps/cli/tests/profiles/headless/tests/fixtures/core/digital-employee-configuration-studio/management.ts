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
  inject: ['skills'],
  apply: (ctx: Context) => {
    ctx.provide('workspaceRegistry', workspaceRegistryService)
    ctx.skills.register({
      name: 'market-active',
      description: 'Active runtime skill.',
      source: 'fixture',
      content: 'Active runtime skill.',
    })
    ctx.provide('skillMarket', {
      list: async () => ({
        ok: true as const,
        value: {
          entries: [
            {
              skillId: 'market-active',
              description: 'Active managed skill.',
              version: '1.2.3',
              author: 'Snapshot Author',
              tags: ['managed', 'active'],
              installedAt: 1,
              hasBanner: false,
            },
            {
              skillId: 'market-inactive',
              description: 'Installed managed skill awaiting activation.',
              version: '2.0.0',
              author: 'Snapshot Author',
              tags: ['managed', 'restart'],
              installedAt: 2,
              hasBanner: false,
            },
          ],
        },
      }),
    } as never)
    ctx.plugin(DigitalEmployeeManagement as Plugin, {
      administrator: true,
      studioFile: './configuration-studio.json',
    })
  },
}

export default managementWithWorkspaceRegistry
