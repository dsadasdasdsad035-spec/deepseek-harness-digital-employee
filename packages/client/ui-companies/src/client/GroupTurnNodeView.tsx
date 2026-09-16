/** Keyed Chat renderer for one in-flight member delivery with its cancel seat. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CompanyGroupTurnChatData } from './group-turn-definition.ts'
import { groupTurnActions } from './group-turn-actions.ts'
import css from './CompanyWorkspace.module.css'

/** Complete keyed renderer props for the group typing indicator row. */
export type GroupTurnNodeViewProps =
  PropsRuntime<'conversation.chat.node', 'company-group-turn'>

/** Render one member delivery's typing indicator with its cancel button. */
export function GroupTurnNodeView(props: GroupTurnNodeViewProps): ReactNode {
  const node = props.node
  const data: CompanyGroupTurnChatData = node.data
  if (data.settled) return null
  return (
    <div className={css.chatGroupRow}>
      <span className={css.chatGroupSpeaker}>{data.displayName}</span>
      <div className={css.chatGroupTurn}>
        <span className={css.chatGroupTurnDots}>{`${data.displayName} 正在输入…`}</span>
        <button
          type="button"
          className={css.chatGroupTurnCancel}
          onClick={() => { groupTurnActions.cancel(String(props.sessionId)) }}
        >取消</button>
      </div>
    </div>
  )
}
