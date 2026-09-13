/** Sidebar 「组织」 dropdown opening the company console and the employee workspace. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './CompanyWorkspace.module.css'

/** One menu item of the organization dropdown. */
export interface OrganizationNavItem {
  readonly key: string
  readonly icon: string
  readonly label: string
  readonly activate: () => void
}

/** Dropdown navigation commands supplied by the client registration. */
export interface OrganizationNavInjected {
  readonly items: readonly OrganizationNavItem[]
}

/** Render the merged organization dropdown: one footer entry, two surfaces. */
export function OrganizationNav(props: { readonly wide?: boolean } & Partial<OrganizationNavInjected>): ReactNode {
  const { wide = true, items } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const dismiss = (event: PointerEvent): void => {
      if (rootRef.current === null || !event.composedPath().includes(rootRef.current)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', dismiss, { capture: true })
    return () => { document.removeEventListener('pointerdown', dismiss, { capture: true }) }
  }, [menuOpen])

  if (items === undefined || items.length === 0) return null
  const button = (
    <div className={css.navWrap} ref={rootRef}>
      <button
        className={css.navButton}
        type="button"
        aria-label="组织"
        aria-expanded={menuOpen}
        onClick={() => { setMenuOpen(open => !open) }}
      >
        <span className={css.navIcon} aria-hidden="true">🏢</span>
        {wide ? <span>组织</span> : null}
        {wide ? <span className={css.navChevron} aria-hidden="true">▲</span> : null}
      </button>
      {menuOpen
        ? (
          <div className={css.navMenu} role="menu">
            {items.map(item => (
              <button
                key={item.key}
                className={css.navMenuItem}
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); item.activate() }}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )
        : null}
    </div>
  )
  return wide ? button : <Tooltip label="组织">{button}</Tooltip>
}
