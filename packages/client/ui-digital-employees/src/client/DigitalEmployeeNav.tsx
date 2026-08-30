/** Sidebar entry that opens the digital employee workspace. */
import type { ReactNode } from 'react'
import { IconUserOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './DigitalEmployeeWorkspace.module.css'

/** Sidebar owner and injected action props. */
export interface DigitalEmployeeNavProps {
  readonly wide?: boolean
  readonly open?: () => void
}

/** Render the workspace navigation command. */
export function DigitalEmployeeNav({ wide = true, open }: DigitalEmployeeNavProps): ReactNode {
  const button = (
    <button
      className={css.navButton}
      type="button"
      aria-label="Digital employees"
      onClick={open}
    >
      <IconUserOutline16 />
      {wide ? <span>Digital employees</span> : null}
    </button>
  )
  return wide ? button : <Tooltip label="Digital employees">{button}</Tooltip>
}
