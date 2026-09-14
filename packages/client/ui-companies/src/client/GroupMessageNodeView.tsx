/** Keyed Chat renderer for one quoted company group message. */
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CompanyGroupMessageChatData } from './group-definition.ts'
import css from './CompanyWorkspace.module.css'

/** Complete keyed renderer props for the group message row. */
export type GroupMessageNodeViewProps = PropsRuntime<'conversation.chat.node', 'company-group-message'>

/** Render one group message: employee speakers left with a name chip, the user right. */
export function GroupMessageNodeView({ node }: GroupMessageNodeViewProps): ReactNode {
  const data: CompanyGroupMessageChatData = node.data
  const mine = data.speakerKind === 'user'
  return (
    <div className={mine ? css.chatGroupRowOwn : css.chatGroupRow}>
      {!mine ? <span className={css.chatGroupSpeaker}>{data.displayName}</span> : null}
      <div className={mine ? css.chatGroupBubbleOwn : css.chatGroupBubble}>{data.text}</div>
    </div>
  )
}
