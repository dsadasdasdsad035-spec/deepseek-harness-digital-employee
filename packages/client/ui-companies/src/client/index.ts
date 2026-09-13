/** Client registration for the company campus console. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { OrganizationNav } from './CompanyNav.tsx'
import { CompanyWorkspace, type CompanyWorkspaceInjected } from './CompanyWorkspace.tsx'
import { CompanyGroupStore, CompanyStore } from './store.ts'

export { CompanyGroupStore, CompanyStore } from './store.ts'
export type { CompanyGroupRemote, CompanyGroupState, CompanyGroupViewResult, CompanyRemote, CompanySeatVerdict, CompanyState } from './store.ts'
export { OrganizationNav } from './CompanyNav.tsx'
export type { OrganizationNavItem, OrganizationNavInjected } from './CompanyNav.tsx'
export { CompanyWorkspace } from './CompanyWorkspace.tsx'
export type { CompanyWorkspaceInjected } from './CompanyWorkspace.tsx'

/** Required client services and the generated companies namespace. */
export const inject = [
  'slots', 'layout', 'sessions', 'locale', 'remote', 'remote.companies', 'remote.companyGroups',
]

/** Register one navigation command and one full-screen shell overlay console. */
export function apply(ctx: ClientContext): void {
  const controller = new CompanyStore(ctx.remote.companies, ctx.get('sessions')?.list)
  const groupController = new CompanyGroupStore(ctx.remote.companyGroups)
  const openStore = createSnapshotStore({ open: false })
  const layout = ctx.layout
  const open = (): void => { openStore.set({ open: true }) }
  const close = (): void => { openStore.set({ open: false }) }
  ctx.effect(() => () => {
    controller.dispose()
    groupController.stop()
  }, 'ui-companies: dispose store')

  // The merged 「组织」 dropdown replaces the two standalone footer entries
  // (this package's 「Companies」 and ui-digital-employees' entry, removed in
  // this change): one seat, two surfaces, no cross-package value imports.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'organization',
    order: 10,
    label: '组织',
    inject: () => ({
      items: [
        { key: 'companies', icon: '🏠', label: '公司', activate: open },
        {
          key: 'employees',
          icon: '👤',
          label: '数字员工',
          activate: () => { close(); layout.openApplication() },
        },
      ],
    }),
  }, OrganizationNav))

  // shell.application is a single seat owned by the digital employee workspace;
  // a second registrant could only shadow it, so the console rides the additive
  // shell.overlay layer and opts into pointer events for its full-screen shell.
  const injected = (): CompanyWorkspaceInjected => ({
    controller,
    groupStore: groupController,
    hooks: { snapshot: controller.store, open: openStore },
    close,
    openEmployeeWorkspace: () => {
      close()
      layout.openApplication()
    },
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'company-console',
    order: 5,
    inject: injected,
  }, CompanyWorkspace))
}
